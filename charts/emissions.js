// charts/emissions.js
// BEAT ① — per-capita emissions.
//
// WHAT CHANGED AND WHY
//
//  1. LOG X-AXIS. The old linear domain ran to 86.7 (Palau), which rendered every
//     "they barely added" nation as an invisible sliver. The beat is titled around
//     how little these countries emit and the chart made that unreadable. A log
//     scale spans the three orders of magnitude actually present and lets the
//     0.1–4 t cluster be compared. The axis is labelled as log so nobody misreads it.
//
//  2. SUSPECT SERIES ARE FLAGGED, NOT EXPLAINED. The old copy attributed Palau's
//     86.7 t/capita to "industrial or tourism-driven footprints." Palau's series
//     starts at 190.6 t/capita in 1970 and falls ~60% while tourism grows — no
//     footprint produces that shape. Nauru, Guam, Marshall Is, N. Mariana Is and
//     American Samoa sit at a flat 0.1 for fifty years, which is missing data wearing
//     a number. Those bars are now hatched, greyed, and excluded from the
//     "typical range" annotation.
//
//  3. UNIT HONESTY. Per SPC metadata the World Bank series measures CO₂ only, not all
//     six Kyoto gases. The axis says so.

import { SUSPECT_GHG } from '../js/data.js?v=7';

const C_DEFAULT = '#2a78d6';
const C_SUSPECT = '#b8b2a6';
const C_GRID = '#e8e8e8';
const C_AXIS = '#999999';
const C_INK = '#333333';

export function renderEmissions(container, data, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return { update() { }, destroy() { } };

  d3.select(el).style('position', 'relative');
  const tip = d3.select(el).append('div').attr('class', 'bklit-tooltip');

  const state = { width: opts.width || el.clientWidth || 720 };
  const M = { top: 34, right: 96, bottom: 62, left: 160 };

  const svg = d3.select(el).append('svg').attr('role', 'img')
    .attr('aria-label',
      'Per-capita emissions for Pacific nations on a logarithmic scale. Series with known ' +
      'data-quality problems are hatched and excluded from the typical range.');

  function latestValues(series) {
    const rows = [];
    for (const [country, pts] of Object.entries(series)) {
      if (country.startsWith('__') || !pts.length) continue;
      const latest = pts[pts.length - 1];
      const first = pts[0];
      rows.push({
        country,
        year: latest[0],
        value: latest[1],
        firstYear: first[0],
        firstValue: first[1],
        suspect: SUSPECT_GHG.has(country),
      });
    }
    return rows.sort((a, b) => b.value - a.value);
  }

  function draw() {
    const rows = latestValues(data);
    if (!rows.length) { el.innerHTML = '<p class="nodata">No data.</p>'; return; }

    const w = el.clientWidth || state.width;
    const barH = 26, gap = 6;
    const h = rows.length * (barH + gap) + M.top + M.bottom;
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const innerW = w - M.left - M.right;
    const innerH = h - M.top - M.bottom;

    // Log scale. Floor at 0.05 so the flat-0.1 placeholder rows still render a stub.
    const maxV = d3.max(rows, d => d.value);
    const x = d3.scaleLog().domain([0.05, Math.max(maxV * 1.3, 1)]).range([0, innerW]).clamp(true);
    const y = d3.scaleBand().domain(rows.map(d => d.country)).range([0, innerH]).padding(0.22);

    svg.selectAll('g.root').remove();
    svg.selectAll('defs').remove();

    // Hatch pattern for flagged series.
    const defs = svg.append('defs');
    const pat = defs.append('pattern')
      .attr('id', 'ghg-suspect-hatch')
      .attr('width', 6).attr('height', 6)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)');
    pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', '#e7e3d9');
    pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
      .attr('stroke', C_SUSPECT).attr('stroke-width', 2.5);

    const g = svg.append('g').attr('class', 'root')
      .attr('transform', `translate(${M.left},${M.top})`);

    // Grid at decade lines
    g.append('g')
      .call(d3.axisBottom(x).tickValues([0.1, 1, 10, 100]).tickSize(innerH).tickFormat(''))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('line').attr('stroke', C_GRID).attr('stroke-dasharray', '2,4'));

    const trusted = rows.filter(d => !d.suspect);

    // ── Bars ────────────────────────────────────────────────────────────
    g.selectAll('rect.bar').data(rows).join('rect')
      .attr('class', 'bar')
      .attr('y', d => y(d.country)).attr('height', y.bandwidth())
      .attr('x', 0).attr('width', 0).attr('rx', 3)
      .attr('fill', d => d.suspect ? 'url(#ghg-suspect-hatch)' : C_DEFAULT)
      .attr('stroke', d => d.suspect ? C_SUSPECT : 'none')
      .attr('stroke-width', d => d.suspect ? 1 : 0)
      .attr('pointer-events', 'none')
      .transition().duration(750).ease(d3.easeCubicInOut)
      .delay((_, i) => i * 28)
      .attr('width', d => Math.max(1, x(Math.max(d.value, 0.05))));

    // ── Value labels ────────────────────────────────────────────────────
    g.selectAll('text.val').data(rows).join('text')
      .attr('class', 'val')
      .attr('x', d => x(Math.max(d.value, 0.05)) + 7)
      .attr('y', d => y(d.country) + y.bandwidth() / 2 + 4)
      .attr('font-size', 10.5)
      .attr('fill', d => d.suspect ? C_SUSPECT : C_AXIS)
      .attr('opacity', 0).attr('pointer-events', 'none')
      .text(d => d.suspect ? `${d.value.toFixed(1)} t  ⚠` : `${d.value.toFixed(1)} t`)
      .transition().delay((_, i) => i * 28 + 520).duration(200).attr('opacity', 0.85);

    // ── Typical-range annotation, computed from trusted rows only ───────
    if (trusted.length) {
      const lo = d3.min(trusted, d => d.value);
      const hi = d3.max(trusted, d => d.value);
      const yTop = d3.min(trusted, d => y(d.country));
      const yBot = d3.max(trusted, d => y(d.country) + y.bandwidth());
      const brace = g.append('g').attr('transform', `translate(${innerW + 10},0)`);
      brace.append('line')
        .attr('x1', 0).attr('x2', 0).attr('y1', yTop + 2).attr('y2', yBot - 2)
        .attr('stroke', C_AXIS).attr('opacity', 0.4);
      brace.append('text')
        .attr('x', 5).attr('y', (yTop + yBot) / 2 - 4)
        .attr('font-size', 10).attr('fill', C_AXIS).attr('opacity', 0.75)
        .text(`${lo.toFixed(1)}–${hi.toFixed(1)} t`);
      brace.append('text')
        .attr('x', 5).attr('y', (yTop + yBot) / 2 + 9)
        .attr('font-size', 10).attr('fill', C_AXIS).attr('opacity', 0.55)
        .text('usable series');
    }

    // ── Hit areas ───────────────────────────────────────────────────────
    g.selectAll('rect.hit').data(rows).join('rect')
      .attr('class', 'hit')
      .attr('y', d => y(d.country) - 2).attr('height', y.bandwidth() + 4)
      .attr('x', 0).attr('width', innerW)
      .attr('fill', 'transparent').attr('cursor', 'default')
      .on('mouseover', function (event, d) {
        g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 0.7);
        const [ex, ey] = d3.pointer(event, el);
        let html =
          `<span class="tt-dot" style="background:${d.suspect ? C_SUSPECT : C_DEFAULT}"></span>` +
          `<strong style="color:#fff">${d.country}</strong><br>` +
          `<span class="tt-value">${d.value.toFixed(1)} t</span> ` +
          `<span class="tt-label">CO₂ per capita · ${d.year}</span><br>` +
          `<span class="tt-label">${d.firstYear}: ${d.firstValue.toFixed(1)} t</span>`;
        if (d.suspect) {
          html += `<br><span class="tt-label" style="color:#ffb4ae">⚠ Series flagged — ` +
            `implausible level or flat placeholder. Not used in the reading above.</span>`;
        }
        tip.style('opacity', 1)
          .style('left', `${Math.min(ex + 14, el.clientWidth - 240)}px`)
          .style('top', `${ey - 46}px`)
          .html(html);
      })
      .on('mouseleave', function (event, d) {
        g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 1);
        tip.style('opacity', 0);
      });

    // ── Axes ────────────────────────────────────────────────────────────
    g.append('g').call(d3.axisLeft(y).tickSize(0))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('text')
        .attr('fill', d => SUSPECT_GHG.has(d) ? C_SUSPECT : C_INK)
        .attr('font-size', 12).attr('dx', -6));

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues([0.1, 1, 10, 100]).tickFormat(d => `${d} t`))
      .call(s => s.select('.domain').attr('stroke', '#ccc'))
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

    g.append('text').attr('x', innerW / 2).attr('y', innerH + 42)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C_AXIS)
      .text(`Tonnes CO₂ per capita · ${rows[0].year} · logarithmic scale`);

    g.append('text').attr('x', 0).attr('y', innerH + 56)
      .attr('font-size', 10).attr('fill', C_AXIS).attr('opacity', 0.75)
      .text('Hatched bars are flagged series. World Bank source measures CO₂ only, not all six Kyoto gases.');
  }

  draw();
  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
