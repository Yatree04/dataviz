// charts/sealevel.js
// BEAT ③a — sea level as a regional trend.
//
// WHAT CHANGED AND WHY
//
//  1. ENSO IS MARKED. The dips in this series are not noise and they are not the
//     greenhouse signal — the 1998 minimum (−0.062 m regional mean) is the 1997–98
//     El Niño, and the 2020–22 high is the triple-dip La Niña. Western-Pacific sea
//     level is strongly trade-wind modulated. Leaving that unlabelled invited the
//     reader to read ENSO as forced trend.
//
//  2. THE BASELINE IS STATED. Copernicus DUACS DT2024, anomaly vs 1993–2012.
//
//  3. THE QUANTISATION IS DRAWN, NOT JUST FOOTNOTED. Per-country values in this
//     export are rounded to 0.1 m, so the regional mean moves in 1/21-of-0.1 steps.
//     A ±0.05 m band now shows the rounding envelope, so the reader can see that the
//     trend survives the rounding while individual years do not.
//     NOTE: the Copernicus source is centimetre-resolution — the SPC metadata example
//     quotes −0.02 and 0.06. Re-exporting from .Stat with more decimals removes this
//     caveat entirely and is worth doing before submission.
//
//  4. A FITTED TREND LINE. The claim being made is "there is an upward trend", so the
//     trend is drawn and its rate stated, rather than implied by the shape of an area.

import { ENSO_EVENTS, BASELINES, slopePerDecade } from '../js/data.js?v=7';

const QUANT = 0.05;   // half of the 0.1 m rounding step

export function renderSeaLevel(container, data, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return { update() { }, destroy() { } };

  const state = { width: opts.width || el.clientWidth || 720, height: opts.height || 420 };
  const M = { top: 30, right: 30, bottom: 76, left: 62 };

  const css = getComputedStyle(document.documentElement);
  const COL = {
    area: css.getPropertyValue('--ocean-mid').trim() || '#1b4965',
    ink: css.getPropertyValue('--ink').trim() || '#14110d',
    heat: css.getPropertyValue('--heat-2').trim() || '#e8833a',
    grid: '#d8d4c8',
  };

  function regionalMean(series) {
    const byYear = new Map();
    for (const [name, pts] of Object.entries(series)) {
      if (name.startsWith('__') || !Array.isArray(pts)) continue;
      for (const [y, v] of pts) {
        const b = byYear.get(y) || [0, 0];
        byYear.set(y, [b[0] + v, b[1] + 1]);
      }
    }
    return [...byYear.entries()]
      .map(([year, [sum, n]]) => ({ year, value: +(sum / n).toFixed(3) }))
      .sort((a, b) => a.year - b.year);
  }

  el.innerHTML = '';
  d3.select(el).style('position', 'relative');
  const tip = d3.select(el).append('div').attr('class', 'bklit-tooltip');
  const svg = d3.select(el).append('svg').attr('role', 'img');

  function draw() {
    const pts = regionalMean(data);
    if (!pts.length) { el.innerHTML = '<p class="nodata">No sea-level data available.</p>'; return; }

    const w = el.clientWidth || state.width;
    const h = state.height;
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
    const innerW = w - M.left - M.right;
    const innerH = h - M.top - M.bottom;

    const x = d3.scaleLinear().domain(d3.extent(pts, d => d.year)).range([0, innerW]);
    const yExt = d3.extent(pts, d => d.value);
    const y = d3.scaleLinear()
      .domain([Math.min(0, yExt[0]) - QUANT - 0.03, yExt[1] + QUANT + 0.03])
      .range([innerH, 0]).nice();

    svg.selectAll('g.root').remove();
    svg.selectAll('defs').remove();
    const g = svg.append('g').attr('class', 'root')
      .attr('transform', `translate(${M.left},${M.top})`);

    // ── ENSO bands, under everything ────────────────────────────────────
    const inRange = ENSO_EVENTS.filter(e => e.end >= x.domain()[0] && e.start <= x.domain()[1]);
    g.selectAll('rect.enso').data(inRange).join('rect')
      .attr('class', 'enso')
      .attr('x', d => x(Math.max(d.start, x.domain()[0])))
      .attr('width', d => Math.max(0,
        x(Math.min(d.end + 1, x.domain()[1])) - x(Math.max(d.start, x.domain()[0]))))
      .attr('y', 0).attr('height', innerH)
      .attr('fill', d => d.phase === 'el-nino'
        ? 'rgba(193,54,47,0.09)' : 'rgba(42,120,214,0.09)');

    g.selectAll('text.enso-lab').data(inRange).join('text')
      .attr('class', 'enso-lab')
      .attr('x', d => x(Math.max(d.start, x.domain()[0])) + 3)
      .attr('y', -8)
      .attr('font-size', 9).attr('opacity', 0.8)
      .attr('fill', d => d.phase === 'el-nino' ? '#c1362f' : '#2a78d6')
      .text(d => d.phase === 'el-nino' ? 'El Niño' : 'La Niña');

    // ── Grid + zero ─────────────────────────────────────────────────────
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(''))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('line').attr('stroke', COL.grid).attr('stroke-dasharray', '2,3'));

    g.append('line').attr('x1', 0).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', COL.ink).attr('stroke-width', 1).attr('opacity', 0.3);

    // ── Rounding envelope ───────────────────────────────────────────────
    const quantArea = d3.area()
      .x(d => x(d.year))
      .y0(d => y(d.value - QUANT))
      .y1(d => y(d.value + QUANT))
      .curve(d3.curveMonotoneX);
    g.append('path').datum(pts)
      .attr('fill', COL.area).attr('opacity', 0.13)
      .attr('d', quantArea);

    // ── Observed line ───────────────────────────────────────────────────
    const clipId = 'sl-clip';
    const defs = svg.append('defs');
    const clip = defs.append('clipPath').attr('id', clipId);
    clip.append('rect')
      .attr('x', M.left).attr('y', M.top).attr('width', 0).attr('height', innerH + 4)
      .transition().duration(1200).ease(d3.easeCubicOut).attr('width', innerW);

    const lineGen = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    g.append('path').datum(pts)
      .attr('fill', 'none').attr('stroke', COL.area).attr('stroke-width', 2.4)
      .attr('stroke-linecap', 'round')
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', lineGen);

    // ── Fitted trend ────────────────────────────────────────────────────
    const slope = slopePerDecade(pts.map(d => [d.year, d.value]));
    if (slope != null) {
      const mx = d3.mean(pts, d => d.year);
      const my = d3.mean(pts, d => d.value);
      const at = yr => my + (slope / 10) * (yr - mx);
      const [x0, x1] = x.domain();
      g.append('line')
        .attr('x1', x(x0)).attr('y1', y(at(x0)))
        .attr('x2', x(x1)).attr('y2', y(at(x1)))
        .attr('stroke', COL.heat).attr('stroke-width', 1.6)
        .attr('stroke-dasharray', '6,4').attr('opacity', 0)
        .transition().delay(1100).duration(400).attr('opacity', 0.9);
    }

    const last = pts[pts.length - 1];
    g.append('circle')
      .attr('cx', x(last.year)).attr('cy', y(last.value)).attr('r', 4)
      .attr('fill', COL.heat).attr('opacity', 0)
      .transition().delay(1100).duration(300).attr('opacity', 1);

    // ── Axes ────────────────────────────────────────────────────────────
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')))
      .call(s => s.select('.domain').attr('stroke', COL.ink).attr('opacity', 0.3));

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d > 0 ? '+' : ''}${d.toFixed(2)} m`))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('text').attr('fill', COL.ink).attr('opacity', 0.7));

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -48).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', COL.ink).attr('opacity', 0.6)
      .text('Sea level anomaly (m) — regional mean');

    const notes = [
      `Anomaly vs ${BASELINES.SEA_LVL} baseline (Copernicus DUACS DT2024).` +
      (slope != null ? `  Trend ≈ ${(slope * 100).toFixed(1)} cm/decade.` : ''),
      'Shaded band = ±0.05 m rounding envelope. Per-country values are quantised to 0.1 m ' +
      'in this export, so single years are not resolvable — the trend is.',
      'Shaded columns are ENSO. Western Pacific sea level is strongly trade-wind modulated; ' +
      'the 1998 dip is El Niño, not a pause in the trend.',
    ];
    notes.forEach((t, i) => {
      g.append('text').attr('x', 0).attr('y', innerH + 32 + i * 13)
        .attr('font-size', 10).attr('fill', COL.ink).attr('opacity', 0.55)
        .attr('font-style', i === 0 ? 'normal' : 'italic')
        .text(t);
    });

    // ── Hover ───────────────────────────────────────────────────────────
    const bisect = d3.bisector(d => d.year).left;
    const cursorG = g.append('g').style('display', 'none');
    cursorG.append('line').attr('class', 'cur-line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#bbb').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');
    cursorG.append('circle').attr('class', 'cur-dot').attr('r', 4)
      .attr('fill', COL.area).attr('stroke', '#fff').attr('stroke-width', 2);

    g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent').attr('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event);
        const idx = Math.min(bisect(pts, x.invert(mx)), pts.length - 1);
        const pt = pts[idx];
        cursorG.style('display', null);
        cursorG.select('.cur-line').attr('x1', x(pt.year)).attr('x2', x(pt.year));
        cursorG.select('.cur-dot').attr('cx', x(pt.year)).attr('cy', y(pt.value));
        const en = ENSO_EVENTS.find(e => pt.year >= e.start && pt.year <= e.end);
        tip.style('opacity', 1)
          .style('left', `${Math.min(M.left + x(pt.year) + 14, w - 210)}px`)
          .style('top', `${M.top + y(pt.value) - 24}px`)
          .html(
            `<span class="tt-label">${pt.year}</span><br>` +
            `<span class="tt-dot" style="background:#5ca3ee"></span>` +
            `<span class="tt-value">${pt.value > 0 ? '+' : ''}${pt.value.toFixed(3)} m</span> ` +
            `<span class="tt-label">regional mean</span>` +
            (en ? `<br><span class="tt-label">${en.label}</span>` : '')
          );
      })
      .on('mouseleave', () => { cursorG.style('display', 'none'); tip.style('opacity', 0); });

    svg.attr('aria-label',
      'Pacific regional mean sea level anomaly, rising over 1993 to 2023, with ENSO ' +
      'periods and the export rounding envelope marked.');
  }

  draw();
  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
