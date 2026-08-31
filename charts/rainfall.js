// charts/rainfall.js
// BEAT ③c — rainfall.
//
// WHAT CHANGED AND WHY
//
//  1. THE BARS ARE NOW A TREND, NOT A SNAPSHOT. The old chart took only the final
//     observation — 2025 — while the copy said things like "Tonga tends wetter."
//     "Tends" is a trend word and a single bar is weather. Bars are now the mean of
//     the last ten years.
//
//  2. THE SINGLE YEAR IS STILL SHOWN, AS A DOT. Keeping the latest year visible next
//     to the decadal mean is the honest move: it shows the reader how far one year
//     can sit from the tendency, which is the whole reason the change was needed.
//
//  3. ENSO IS NAMED. The 2025 pattern — dry at Nauru, Kiribati and Tuvalu, wet in the
//     southwest — is a textbook ENSO rainfall dipole, not a greenhouse trend. The
//     caption says so rather than letting the reader attribute it to the cascade.

import { trailingMean } from '../js/data.js?v=7';

const C_DRY = '#e07b3f';
const C_WET = '#2a78d6';
const C_GRID = '#e8e8e8';
const C_AXIS = '#999999';
const C_INK = '#333333';
const WINDOW = 10;

export function renderRainfall(container, data, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return { update() { }, destroy() { } };

  d3.select(el).style('position', 'relative');
  const tip = d3.select(el).append('div').attr('class', 'bklit-tooltip');

  const state = { width: opts.width || el.clientWidth || 720 };
  const M = { top: 30, right: 132, bottom: 66, left: 175 };

  const svg = d3.select(el).append('svg').attr('role', 'img')
    .attr('aria-label',
      'Ten-year mean rainfall anomaly by Pacific nation, with the most recent single ' +
      'year shown separately to display interannual spread.');

  function buildRows(series) {
    const rows = [];
    for (const [country, pts] of Object.entries(series)) {
      if (country.startsWith('__') || !Array.isArray(pts) || !pts.length) continue;
      const tm = trailingMean(pts, WINDOW);
      if (!tm) continue;
      const latest = pts[pts.length - 1];
      rows.push({
        country,
        mean: tm.value,
        from: tm.from,
        to: tm.to,
        latestYear: latest[0],
        latestValue: latest[1],
      });
    }
    return rows.sort((a, b) => a.mean - b.mean);
  }

  function draw() {
    const rows = buildRows(data);
    if (!rows.length) { el.innerHTML = '<p class="nodata">No rainfall data.</p>'; return; }

    const w = el.clientWidth || state.width;
    const barH = 22, gap = 8;
    const h = rows.length * (barH + gap) + M.top + M.bottom;
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const innerW = w - M.left - M.right;
    const innerH = h - M.top - M.bottom;

    // Domain must fit both the mean and the single-year dot.
    const absMax = d3.max(rows, d => Math.max(Math.abs(d.mean), Math.abs(d.latestValue)));
    const x = d3.scaleLinear().domain([-absMax * 1.15, absMax * 1.15]).range([0, innerW]);
    const y = d3.scaleBand().domain(rows.map(d => d.country)).range([0, innerH]).padding(0.28);
    const zero = x(0);

    svg.selectAll('g.root').remove();
    const g = svg.append('g').attr('class', 'root')
      .attr('transform', `translate(${M.left},${M.top})`);

    g.append('g').call(d3.axisBottom(x).ticks(6).tickSize(innerH).tickFormat(''))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('line').attr('stroke', C_GRID).attr('stroke-dasharray', '2,4'));

    g.append('line')
      .attr('x1', zero).attr('x2', zero).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#bbb').attr('stroke-width', 1.5);

    // ── Bars: ten-year mean ─────────────────────────────────────────────
    g.selectAll('rect.bar').data(rows).join('rect')
      .attr('class', 'bar')
      .attr('y', d => y(d.country)).attr('height', y.bandwidth())
      .attr('x', zero).attr('width', 0)
      .attr('fill', d => d.mean < 0 ? C_DRY : C_WET)
      .attr('rx', 3).attr('pointer-events', 'none')
      .transition().duration(600).ease(d3.easeCubicOut)
      .delay((_, i) => i * 20)
      .attr('x', d => d.mean < 0 ? x(d.mean) : zero)
      .attr('width', d => Math.abs(x(d.mean) - zero));

    // ── Connector from mean to latest single year ───────────────────────
    g.selectAll('line.spread').data(rows).join('line')
      .attr('class', 'spread')
      .attr('y1', d => y(d.country) + y.bandwidth() / 2)
      .attr('y2', d => y(d.country) + y.bandwidth() / 2)
      .attr('x1', d => x(d.mean)).attr('x2', d => x(d.mean))
      .attr('stroke', '#8d8778').attr('stroke-width', 1).attr('opacity', 0.5)
      .attr('pointer-events', 'none')
      .transition().delay((_, i) => i * 20 + 400).duration(400)
      .attr('x2', d => x(d.latestValue));

    // ── Latest single year, as a hollow dot ─────────────────────────────
    g.selectAll('circle.latest').data(rows).join('circle')
      .attr('class', 'latest')
      .attr('cy', d => y(d.country) + y.bandwidth() / 2)
      .attr('cx', d => x(d.latestValue))
      .attr('r', 0)
      .attr('fill', '#f7f5ef').attr('stroke', '#57534a').attr('stroke-width', 1.4)
      .attr('pointer-events', 'none')
      .transition().delay((_, i) => i * 20 + 620).duration(250)
      .attr('r', 3.6);

    // ── Hit rows ────────────────────────────────────────────────────────
    g.selectAll('rect.hit').data(rows).join('rect')
      .attr('class', 'hit')
      .attr('y', d => y(d.country) - 3).attr('height', y.bandwidth() + 6)
      .attr('x', 0).attr('width', innerW)
      .attr('fill', 'transparent')
      .on('mouseover', function (event, d) {
        g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 0.75);
        const s = v => v > 0 ? '+' : '';
        const label = d.mean < 0 ? 'drier than baseline' : 'wetter than baseline';
        const col = d.mean < 0 ? C_DRY : C_WET;
        const [ex, ey] = d3.pointer(event, el);
        tip.style('opacity', 1)
          .style('left', `${Math.min(ex + 14, el.clientWidth - 230)}px`)
          .style('top', `${ey - 52}px`)
          .html(
            `<span class="tt-dot" style="background:${col}"></span>` +
            `<strong style="color:#fff">${d.country}</strong><br>` +
            `<span class="tt-value">${s(d.mean)}${d.mean.toFixed(1)} mm</span> ` +
            `<span class="tt-label">${WINDOW}-yr mean (${d.from}–${d.to}), ${label}</span><br>` +
            `<span class="tt-label">○ ${d.latestYear} alone: ` +
            `${s(d.latestValue)}${d.latestValue.toFixed(1)} mm</span>`
          );
      })
      .on('mouseleave', function (event, d) {
        g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 1);
        tip.style('opacity', 0);
      });

    g.append('g').call(d3.axisLeft(y).tickSize(0))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('text')
        .attr('fill', C_INK).attr('font-size', 12).attr('dx', -8).attr('text-anchor', 'end'));

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${d > 0 ? '+' : ''}${d}`))
      .call(s => s.select('.domain').attr('stroke', '#ccc'))
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

    const yrs = `${rows[0].from}–${rows[0].to}`;
    g.append('text').attr('x', innerW / 2).attr('y', innerH + 40)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C_AXIS)
      .text(`Rainfall anomaly (mm) · bars = ${yrs} mean · ← drier | wetter →`);

    g.append('text').attr('x', 0).attr('y', innerH + 56)
      .attr('font-size', 10).attr('fill', C_AXIS).attr('opacity', 0.75)
      .text(`○ = ${rows[0].latestYear} alone. The gap between dot and bar is interannual ` +
        `variability, most of it ENSO.`);

    // Legend
    const leg = g.append('g').attr('transform', `translate(${innerW + 16}, 4)`);
    [['Drier', C_DRY], ['Wetter', C_WET]].forEach(([label, col], i) => {
      leg.append('rect').attr('x', 0).attr('y', i * 22)
        .attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', col);
      leg.append('text').attr('x', 18).attr('y', i * 22 + 10)
        .attr('font-size', 11).attr('fill', C_INK).attr('opacity', 0.8).text(label);
    });
    leg.append('circle').attr('cx', 6).attr('cy', 2 * 22 + 6).attr('r', 3.6)
      .attr('fill', '#f7f5ef').attr('stroke', '#57534a').attr('stroke-width', 1.4);
    leg.append('text').attr('x', 18).attr('y', 2 * 22 + 10)
      .attr('font-size', 11).attr('fill', C_INK).attr('opacity', 0.8)
      .text('Single year');
  }

  draw();
  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
