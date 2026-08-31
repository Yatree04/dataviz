// charts/temperature.js
// BEAT ② — ocean warming, and BEAT ③b — the same line under bleaching-event annotation.
//
// WHAT CHANGED AND WHY
//
//  1. THE LAND SERIES IS GONE BY DEFAULT.
//     ST_ANOM and SST_ANOM in this export correlate at r = 0.96–0.99 with a mean
//     absolute difference of 0.03–0.10 °C — smaller than the 0.1 °C rounding step.
//     For Fiji they are the identical number in 61% of years, for Tuvalu 67%.
//     Both come from the same 5°×5° NOAAGlobalTemp field over cells that are almost
//     entirely ocean; there is no independent land station network on an atoll.
//     Drawing them as two lines and captioning "the ocean warms more slowly" asked
//     a chart to prove something it structurally cannot show. `showLand: true` still
//     exists, but only as a deliberate demonstration that the two are the same line.
//
//  2. THE +1 °C "BLEACHING THRESHOLD" IS GONE.
//     Bleaching stress is Degree Heating Weeks accumulated above the site's Maximum
//     Monthly Mean — a seasonal-peak quantity. An ANNUAL MEAN anomaly against a
//     1971–2000 baseline cannot express it. The old line also only rendered when
//     max(land, sea) > 1.0, so it silently vanished for 13 of 22 countries, and for
//     New Caledonia and Nauru it was triggered by the LAND series.
//     Replaced with the OBSERVED global mass-bleaching events from the GCRMN report.
//     Those are recorded fact, not a threshold inferred from the wrong axis.
//
//  3. UNCERTAINTY IS DRAWN.
//     The export ships ERROR_TYPE=SE / ERROR_VAL. Median SE is 0.1 °C. A ±1 SE ribbon
//     now sits under the line, and the tooltip prints 1 decimal (matching the data's
//     actual resolution) with the SE alongside.
//
//  4. ENSO IS ANNOTATED.
//     Every large wiggle in this series is ENSO. Labelling it stops the reader
//     attributing interannual noise to the emissions trend.
//
// Contract: renderTemperature(container, climate, opts) → { update, destroy }

import { ENSO_EVENTS, BLEACHING_EVENTS, BASELINES, slopePerDecade } from '../js/data.js?v=7';

const C_SEA = '#2a78d6';
const C_LAND = '#e07b3f';
const C_GRID = '#e0e0e0';
const C_AXIS = '#999999';
const C_ELNINO = 'rgba(193, 54, 47, 0.09)';
const C_LANINA = 'rgba(42, 120, 214, 0.09)';
const C_BLEACH = 'rgba(193, 54, 47, 0.16)';
const C_BLEACH_S = 'rgba(193, 54, 47, 0.55)';

export function renderTemperature(container, climate, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return { update() { }, destroy() { } };

  const state = {
    country: opts.country || 'Fiji',
    width: opts.width || el.clientWidth || 720,
    height: opts.height || 430,
    showLand: opts.showLand || false,
    showENSO: opts.showENSO !== false,          // on by default
    showBleachingEvents: opts.showBleachingEvents || false,
    minYear: opts.minYear || 1900,
  };

  const M = { top: 30, right: 78, bottom: 54, left: 56 };

  el.innerHTML = '';
  d3.select(el).style('position', 'relative');
  const tip = d3.select(el).append('div').attr('class', 'bklit-tooltip');

  const svg = d3.select(el).append('svg').attr('role', 'img');

  function seriesFor(indicator, country) {
    return ((climate[indicator] || {})[country] || [])
      .map(([yr, v, se]) => ({ year: yr, value: v, se }))
      .filter(d => d.year >= state.minYear);
  }

  let _sea = [], _land = [];

  function draw() {
    _sea = seriesFor('SST_ANOM', state.country);
    _land = state.showLand ? seriesFor('ST_ANOM', state.country) : [];

    if (!_sea.length) {
      el.innerHTML = `<p class="nodata">No sea-surface temperature series for ${state.country}.</p>`;
      return;
    }

    const w = el.clientWidth || state.width;
    const h = state.height;
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
    const innerW = w - M.left - M.right;
    const innerH = h - M.top - M.bottom;

    svg.selectAll('g.root').remove();
    svg.selectAll('defs').remove();
    const g = svg.append('g').attr('class', 'root')
      .attr('transform', `translate(${M.left},${M.top})`);

    const all = _sea.concat(_land);
    const x = d3.scaleLinear()
      .domain([d3.min(all, d => d.year), d3.max(all, d => d.year)])
      .range([0, innerW]);

    // Domain must accommodate the SE ribbon, not just the line.
    const lo = d3.min(_sea, d => d.value - (d.se ?? 0));
    const hi = d3.max(all, d => d.value + (d.se ?? 0));
    const y = d3.scaleLinear()
      .domain([Math.min(0, lo) - 0.05, hi + 0.1]).nice()
      .range([innerH, 0]);

    // ── Event bands, drawn first so they sit under everything ──────────
    const bandG = g.append('g').attr('class', 'event-bands');

    if (state.showENSO) {
      bandG.selectAll('rect.enso').data(ENSO_EVENTS).join('rect')
        .attr('class', 'enso')
        .attr('x', d => x(Math.max(d.start, x.domain()[0])))
        .attr('width', d => Math.max(0,
          x(Math.min(d.end + 1, x.domain()[1])) - x(Math.max(d.start, x.domain()[0]))))
        .attr('y', 0).attr('height', innerH)
        .attr('fill', d => d.phase === 'el-nino' ? C_ELNINO : C_LANINA);
    }

    if (state.showBleachingEvents) {
      const evs = BLEACHING_EVENTS.filter(d => d.end >= x.domain()[0]);
      bandG.selectAll('rect.bleach').data(evs).join('rect')
        .attr('class', 'bleach')
        .attr('x', d => x(d.start))
        .attr('width', d => Math.max(2.5, x(Math.min(d.end + 1, x.domain()[1])) - x(d.start)))
        .attr('y', 0).attr('height', innerH)
        .attr('fill', C_BLEACH)
        .attr('stroke', C_BLEACH_S).attr('stroke-width', 0.75)
        .attr('stroke-dasharray', '3,3');

      bandG.selectAll('text.bleach-lab').data(evs).join('text')
        .attr('class', 'bleach-lab')
        .attr('x', d => x(d.start) + 3)
        .attr('y', -8)
        .attr('font-size', 9.5).attr('fill', '#c1362f')
        .text(d => d.start);
    }

    // ── Grid + zero ────────────────────────────────────────────────────
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(''))
      .call(s => s.selectAll('line').attr('stroke', C_GRID).attr('stroke-dasharray', '2,3'))
      .call(s => s.select('.domain').remove());

    g.append('line')
      .attr('x1', 0).attr('x2', innerW).attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', '#bbb').attr('stroke-width', 1);

    // ── Standard-error ribbon (±1 SE) ──────────────────────────────────
    const withSE = _sea.filter(d => d.se != null);
    if (withSE.length > 2) {
      const areaSE = d3.area()
        .x(d => x(d.year))
        .y0(d => y(d.value - d.se))
        .y1(d => y(d.value + d.se))
        .curve(d3.curveMonotoneX);
      g.append('path').datum(withSE)
        .attr('fill', C_SEA).attr('opacity', 0.16)
        .attr('d', areaSE);
    }

    // ── Lines ──────────────────────────────────────────────────────────
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    const seriesList = [{ key: 'sea', label: 'Sea surface', color: C_SEA, values: _sea }];
    if (_land.length) {
      seriesList.push({ key: 'land', label: 'Land (same grid cells)', color: C_LAND, values: _land });
    }

    const lineG = g.append('g').attr('class', 'lines');
    lineG.selectAll('path.series').data(seriesList, d => d.key).join('path')
      .attr('class', 'series')
      .attr('fill', 'none')
      .attr('stroke', d => d.color)
      .attr('stroke-width', d => d.key === 'land' ? 1.4 : 2.2)
      .attr('stroke-dasharray', d => d.key === 'land' ? '3,3' : null)
      .attr('stroke-linecap', 'round')
      .attr('d', d => line(d.values))
      .each(function (d) {
        if (d.key === 'land') return;   // only animate the primary line
        const len = this.getTotalLength();
        d3.select(this)
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .transition().duration(1100).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0)
          .on('end', function () { d3.select(this).attr('stroke-dasharray', null); });
      });

    // End label
    const lastSea = _sea[_sea.length - 1];
    g.append('text')
      .attr('x', x(lastSea.year) + 8).attr('y', y(lastSea.value) + 4)
      .attr('font-size', 11).attr('font-weight', 600).attr('fill', C_SEA)
      .text('Ocean');

    // ── Axes ───────────────────────────────────────────────────────────
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')))
      .call(s => s.select('.domain').attr('stroke', '#ccc'))
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d > 0 ? '+' : ''}${d.toFixed(1)}°C`))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

    // Baseline is stated on the chart itself so it cannot drift from the copy.
    const slope = slopePerDecade(_sea.map(d => [d.year, d.value]));
    g.append('text')
      .attr('x', 0).attr('y', innerH + 40)
      .attr('font-size', 10).attr('fill', C_AXIS)
      .text(`Anomaly vs ${BASELINES.SST_ANOM} baseline · shaded band = ±1 standard error` +
        (slope ? ` · trend ≈ ${slope > 0 ? '+' : ''}${slope.toFixed(2)} °C/decade` : ''));

    // ── Legend for the bands ───────────────────────────────────────────
    const legend = g.append('g').attr('transform', `translate(0, ${-M.top + 8})`);
    let lx = 0;
    const legItems = [];
    if (state.showENSO) {
      legItems.push(['El Niño', 'rgba(193,54,47,0.28)'], ['La Niña', 'rgba(42,120,214,0.28)']);
    }
    if (state.showBleachingEvents) legItems.push(['Global bleaching event', C_BLEACH_S]);
    legItems.forEach(([label, col]) => {
      legend.append('rect').attr('x', lx).attr('y', 0).attr('width', 11).attr('height', 11)
        .attr('rx', 2).attr('fill', col);
      legend.append('text').attr('x', lx + 15).attr('y', 9.5)
        .attr('font-size', 10).attr('fill', C_AXIS).text(label);
      lx += 15 + label.length * 5.6 + 18;
    });

    // ── Hover ──────────────────────────────────────────────────────────
    const cursorG = g.append('g').style('display', 'none');
    cursorG.append('line').attr('class', 'cur-line')
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#999').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');
    const dotSea = cursorG.append('circle').attr('r', 4)
      .attr('fill', C_SEA).attr('stroke', '#fff').attr('stroke-width', 2);

    const ensoAt = (yr) => ENSO_EVENTS.find(e => yr >= e.start && yr <= e.end);
    const bleachAt = (yr) => BLEACHING_EVENTS.find(e => yr >= e.start && yr <= e.end);

    g.append('rect')
      .attr('width', innerW).attr('height', innerH)
      .attr('fill', 'transparent').attr('cursor', 'crosshair')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event);
        const yr = Math.round(x.invert(mx));
        const pt = _sea.reduce((a, b) =>
          Math.abs(b.year - yr) < Math.abs(a.year - yr) ? b : a, _sea[0]);
        if (!pt) return;

        cursorG.style('display', null);
        cursorG.select('.cur-line').attr('x1', x(pt.year)).attr('x2', x(pt.year));
        dotSea.attr('cx', x(pt.year)).attr('cy', y(pt.value));

        const sign = pt.value > 0 ? '+' : '';
        // 1 decimal — the data is quantised to 0.1 °C. Printing 2 was false precision.
        let html = `<span class="tt-label">${pt.year}</span><br>` +
          `<span class="tt-dot" style="background:${C_SEA}"></span>` +
          `<span class="tt-value">${sign}${pt.value.toFixed(1)}°C</span> ` +
          `<span class="tt-label">sea surface</span>`;
        if (pt.se != null) {
          html += `<br><span class="tt-label">± ${pt.se.toFixed(1)}°C (1 s.e.)</span>`;
        }
        const en = ensoAt(pt.year);
        if (en) html += `<br><span class="tt-label">${en.label}</span>`;
        const bl = bleachAt(pt.year);
        if (bl) html += `<br><span class="tt-label" style="color:#ff9b95">${bl.label}</span>`;

        tip.style('opacity', 1)
          .style('left', `${Math.min(M.left + x(pt.year) + 14, w - 210)}px`)
          .style('top', `${M.top + y(pt.value) - 20}px`)
          .html(html);
      })
      .on('mouseleave', () => { cursorG.style('display', 'none'); tip.style('opacity', 0); });

    svg.attr('aria-label',
      `Sea surface temperature anomaly for ${state.country} against the ${BASELINES.SST_ANOM} ` +
      `baseline, with a one-standard-error band and El Niño, La Niña and global bleaching ` +
      `events marked.`);
  }

  draw();
  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
