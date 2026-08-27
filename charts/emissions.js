// charts/emissions.js
// BEAT ① — GHG emissions per capita — horizontal bar chart, all Pacific nations.
// Tooltip shows on an invisible full-row hit rect, separate from the animated bar.

const C_DEFAULT = '#2a78d6';  // blue bars
const C_OUTLIER = '#e07b3f';  // orange for Palau / New Caledonia
const C_GRID = '#e8e8e8';
const C_AXIS = '#999999';
const C_INK = '#333333';

export function renderEmissions(container, data, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return { update() { }, destroy() { } };

  d3.select(el).style('position', 'relative');

  // ── Tooltip (Bklit dark-glass) ──────────────────────────────────
  const tip = d3.select(el).append('div')
    .attr('class', 'bklit-tooltip');

  const state = { width: opts.width || el.clientWidth || 720 };
  const M = { top: 16, right: 80, bottom: 48, left: 160 };

  const svg = d3.select(el).append('svg').attr('role', 'img')
    .attr('aria-label', 'GHG emissions per capita — Palau and New Caledonia are outliers.');

  function latestValues(series) {
    const rows = [];
    for (const [country, pts] of Object.entries(series)) {
      if (country.startsWith('__') || !pts.length) continue;
      const latest = pts[pts.length - 1];
      rows.push({ country, year: latest[0], value: latest[1] });
    }
    return rows.sort((a, b) => b.value - a.value);
  }

  function draw() {
    const rows = latestValues(data);
    if (!rows.length) { el.innerHTML = '<p class="nodata">No data.</p>'; return; }

    const w = el.clientWidth || state.width;
    const barH = 28, gap = 6;
    const h = rows.length * (barH + gap) + M.top + M.bottom;
    svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

    const innerW = w - M.left - M.right;
    const innerH = h - M.top - M.bottom;

    const x = d3.scaleLinear().domain([0, d3.max(rows, d => d.value) * 1.08]).range([0, innerW]);
    const y = d3.scaleBand().domain(rows.map(d => d.country)).range([0, innerH]).padding(0.22);

    svg.selectAll('g.root').remove();
    const g = svg.append('g').attr('class', 'root').attr('transform', `translate(${M.left},${M.top})`);

    // Grid
    g.append('g').call(d3.axisBottom(x).ticks(5).tickSize(innerH).tickFormat(''))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('line').attr('stroke', C_GRID).attr('stroke-dasharray', '2,4'));

    const highs = new Set(rows.slice(0, 2).map(d => d.country));

    // ── ANIMATED bars (visual only, no events) ─────────────────
    g.selectAll('rect.bar').data(rows).join('rect')
      .attr('class', 'bar')
      .attr('y', d => y(d.country)).attr('height', y.bandwidth())
      .attr('x', 0).attr('width', 0).attr('rx', 3)
      .attr('fill', d => highs.has(d.country) ? C_OUTLIER : C_DEFAULT)
      .attr('pointer-events', 'none')
      .transition().duration(800).ease(d3.easeCubicInOut)
      .delay((_, i) => i * 32)
      .attr('width', d => x(d.value));

    // Value labels (right of bar, fade in after animation)
    g.selectAll('text.val').data(rows).join('text')
      .attr('class', 'val')
      .attr('x', d => x(d.value) + 6)
      .attr('y', d => y(d.country) + y.bandwidth() / 2 + 4)
      .attr('font-size', 11).attr('fill', C_AXIS).attr('opacity', 0)
      .attr('pointer-events', 'none')
      .text(d => `${d.value.toFixed(1)} t`)
      .transition().delay((_, i) => i * 28 + 550).duration(200).attr('opacity', 0.8);

    // "< 4 t" cluster annotation
    const cluster = rows.filter(d => d.value < 4);
    if (cluster.length > 0) {
      const loY = y(cluster[cluster.length - 1].country) + y.bandwidth();
      const hiY = y(cluster[0].country);
      const braceG = g.append('g').attr('transform', `translate(${innerW + 8},0)`);
      braceG.append('line').attr('x1', 0).attr('x2', 0)
        .attr('y1', hiY + 2).attr('y2', loY - 2)
        .attr('stroke', C_AXIS).attr('opacity', 0.4).attr('stroke-width', 1);
      braceG.append('text').attr('x', 4).attr('y', (hiY + loY) / 2 + 4)
        .attr('font-size', 10).attr('fill', C_AXIS).attr('opacity', 0.6)
        .text('< 4 t');
    }

    // ── INVISIBLE full-row hit areas for hover tooltip ──────────
    g.selectAll('rect.hit').data(rows).join('rect')
      .attr('class', 'hit')
      .attr('y', d => y(d.country) - 2)
      .attr('height', y.bandwidth() + 4)
      .attr('x', 0).attr('width', innerW)
      .attr('fill', 'transparent').attr('cursor', 'default')
      .on('mouseover', function (event, d) {
        // Highlight the actual bar
        g.selectAll('rect.bar')
          .filter(b => b.country === d.country)
          .attr('opacity', 0.7);
        const color = highs.has(d.country) ? C_OUTLIER : C_DEFAULT;
        const label = highs.has(d.country) ? 'Industrial outlier' : 'Pacific nation';
        const bRect = el.getBoundingClientRect();
        const [ex, ey] = d3.pointer(event, el);
        tip.style('opacity', 1)
          .style('left', `${Math.min(ex + 14, el.clientWidth - 200)}px`)
          .style('top', `${ey - 40}px`)
          .html(
            `<span class="tt-dot" style="background:${color}"></span>` +
            `<strong style="color:#fff">${d.country}</strong><br>` +
            `<span class="tt-label">${label}</span><br>` +
            `<span class="tt-value">${d.value.toFixed(1)} tCO₂e</span> ` +
            `<span class="tt-label">per capita · ${d.year}</span>`
          );
      })
      .on('mouseleave', function (event, d) {
        g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 1);
        tip.style('opacity', 0);
      });

    // Y-axis
    g.append('g').call(d3.axisLeft(y).tickSize(0))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('text').attr('fill', C_INK).attr('font-size', 12).attr('dx', -6));

    // X-axis
    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d} t`))
      .call(s => s.select('.domain').attr('stroke', '#ccc'))
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

    // X-axis label
    g.append('text').attr('x', innerW / 2).attr('y', innerH + 42)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C_AXIS)
      .text(`tCO₂e per capita · ${rows[0].year}`);
  }

  draw();
  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
