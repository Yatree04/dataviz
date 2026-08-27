// charts/rainfall.js
// BEAT ③c — Rainfall destabilisation: RAIN_ANOM diverging bar chart.
// Uses invisible hit-layer rects for tooltips (separate from animated bars).

const C_DRY = '#e07b3f';  // drying (negative anomaly) → orange
const C_WET = '#2a78d6';  // wetting (positive anomaly) → blue
const C_GRID = '#e8e8e8';
const C_AXIS = '#999999';
const C_INK = '#333333';

export function renderRainfall(container, data, opts = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return { update() { }, destroy() { } };

    d3.select(el).style('position', 'relative');

    // ── Tooltip div (Bklit dark-glass) ──────────────────────────
    const tip = d3.select(el).append('div')
        .attr('class', 'bklit-tooltip');

    const state = { width: opts.width || el.clientWidth || 720 };
    // Left margin wide enough for longest country name; right for legend
    const M = { top: 16, right: 120, bottom: 52, left: 175 };

    const svg = d3.select(el).append('svg').attr('role', 'img')
        .attr('aria-label', 'Rainfall anomaly across Pacific nations — bidirectional disruption.');

    function latestValues(series) {
        const rows = [];
        for (const [country, pts] of Object.entries(series)) {
            if (country.startsWith('__') || !Array.isArray(pts) || !pts.length) continue;
            const latest = pts[pts.length - 1];
            rows.push({ country, year: latest[0], value: latest[1] });
        }
        return rows.sort((a, b) => a.value - b.value); // most drying at top
    }

    function draw() {
        const rows = latestValues(data);
        if (!rows.length) { el.innerHTML = '<p class="nodata">No rainfall data.</p>'; return; }

        const w = el.clientWidth || state.width;
        const barH = 22, gap = 8;
        const h = rows.length * (barH + gap) + M.top + M.bottom;
        svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

        const innerW = w - M.left - M.right;
        const innerH = h - M.top - M.bottom;

        const absMax = d3.max(rows, d => Math.abs(d.value));
        const x = d3.scaleLinear()
            .domain([-absMax * 1.2, absMax * 1.2])
            .range([0, innerW]);

        const y = d3.scaleBand()
            .domain(rows.map(d => d.country))
            .range([0, innerH]).padding(0.28);

        const zero = x(0); // pixel position of zero line

        svg.selectAll('g.root').remove();
        const g = svg.append('g').attr('class', 'root')
            .attr('transform', `translate(${M.left},${M.top})`);

        // Grid
        g.append('g').call(d3.axisBottom(x).ticks(6).tickSize(innerH).tickFormat(''))
            .call(s => s.select('.domain').remove())
            .call(s => s.selectAll('line').attr('stroke', C_GRID).attr('stroke-dasharray', '2,4'));

        // Zero line
        g.append('line')
            .attr('x1', zero).attr('x2', zero)
            .attr('y1', 0).attr('y2', innerH)
            .attr('stroke', '#bbb').attr('stroke-width', 1.5);

        // ── ANIMATED bars (pointer-events: none) ────────────────
        g.selectAll('rect.bar').data(rows).join('rect')
            .attr('class', 'bar')
            .attr('y', d => y(d.country)).attr('height', y.bandwidth())
            // bars grow FROM zero outward
            .attr('x', zero).attr('width', 0)
            .attr('fill', d => d.value < 0 ? C_DRY : C_WET)
            .attr('rx', 3).attr('pointer-events', 'none')
            .transition().duration(600).ease(d3.easeCubicOut)
            .delay((_, i) => i * 22)
            // grow left for negative, right for positive
            .attr('x', d => d.value < 0 ? x(d.value) : zero)
            .attr('width', d => Math.abs(x(d.value) - zero));

        // ── VALUE LABELS — always to the right of the zero line ──
        // Negative: label appears just right of zero (x(0) + gap)
        // Positive: label appears just right of bar end (x(value) + gap)
        g.selectAll('text.val').data(rows).join('text')
            .attr('class', 'val')
            .attr('x', d => d.value < 0 ? zero + 6 : x(d.value) + 6)
            .attr('text-anchor', 'start')
            .attr('y', d => y(d.country) + y.bandwidth() / 2 + 4)
            .attr('font-size', 10.5).attr('fill', C_AXIS)
            .attr('opacity', 0).attr('pointer-events', 'none')
            .text(d => `${d.value > 0 ? '+' : ''}${d.value.toFixed(0)} mm`)
            .transition().delay((_, i) => i * 22 + 500).duration(200)
            .attr('opacity', 0.8);

        // ── INVISIBLE full-row hit areas for tooltip ─────────────
        g.selectAll('rect.hit').data(rows).join('rect')
            .attr('class', 'hit')
            .attr('y', d => y(d.country) - 3).attr('height', y.bandwidth() + 6)
            .attr('x', 0).attr('width', innerW)
            .attr('fill', 'transparent').attr('cursor', 'default')
            .on('mouseover', function (event, d) {
                g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 0.75);
                const sign = d.value > 0 ? '+' : '';
                const label = d.value < 0 ? '● Drying' : '● Wetting';
                const color = d.value < 0 ? C_DRY : C_WET;
                const [ex, ey] = d3.pointer(event, el);
                tip.style('opacity', 1)
                    .style('left', `${Math.min(ex + 14, el.clientWidth - 200)}px`)
                    .style('top', `${ey - 40}px`)
                    .html(
                        `<span class="tt-dot" style="background:${color}"></span>` +
                        `<strong style="color:#fff">${d.country}</strong><br>` +
                        `<span class="tt-value">${sign}${Math.abs(d.value).toFixed(1)} mm</span> ` +
                        `<span class="tt-label">${label}</span><br>` +
                        `<span class="tt-label">Data: ${d.year} anomaly</span>`
                    );
            })
            .on('mouseleave', function (event, d) {
                g.selectAll('rect.bar').filter(b => b.country === d.country).attr('opacity', 1);
                tip.style('opacity', 0);
            });

        // Y-axis: country names
        g.append('g').call(d3.axisLeft(y).tickSize(0))
            .call(s => s.select('.domain').remove())
            .call(s => s.selectAll('text')
                .attr('fill', C_INK).attr('font-size', 12).attr('dx', -8).attr('text-anchor', 'end'));

        // X-axis
        g.append('g').attr('transform', `translate(0,${innerH})`)
            .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${d > 0 ? '+' : ''}${d}`))
            .call(s => s.select('.domain').attr('stroke', '#ccc'))
            .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

        // X-axis label
        g.append('text').attr('x', innerW / 2).attr('y', innerH + 42)
            .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', C_AXIS)
            .text(`Rainfall anomaly (mm) · ${rows[0].year} · ← drier  |  wetter →`);

        // Legend
        const leg = g.append('g').attr('transform', `translate(${innerW + 16}, 6)`);
        [['Drying', C_DRY], ['Wetting', C_WET]].forEach(([label, col], i) => {
            leg.append('rect').attr('x', 0).attr('y', i * 24)
                .attr('width', 12).attr('height', 12).attr('rx', 2).attr('fill', col);
            leg.append('text').attr('x', 18).attr('y', i * 24 + 10)
                .attr('font-size', 11).attr('fill', C_INK).attr('opacity', 0.8).text(label);
        });
    }

    draw();
    return {
        update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
        destroy() { el.innerHTML = ''; },
    };
}
