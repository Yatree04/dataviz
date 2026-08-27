// charts/sealevel.js
// BEAT ③a — "Warm water is bigger water": sea level anomaly as a regional trend.
// Area chart over time. SEA_LVL is quantized to 0.1m — NOT suitable for per-country
// ranking. Shown as the regional mean (average across all countries each year).
// A data-honesty note is rendered inside the chart itself (BUILD_BRIEF §2).
//
// Module contract:
//   const chart = renderSeaLevel('#chart-sealevel', climate.SEA_LVL);
//   chart.update({});
//   chart.destroy();
//
// Dependencies: D3 v7 (global `d3`). CSS vars from styles.css.

export function renderSeaLevel(container, data, opts = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return { update() { }, destroy() { } };

    const state = {
        width: opts.width || el.clientWidth || 720,
        height: opts.height || 400,
    };

    const M = { top: 28, right: 28, bottom: 56, left: 60 };

    const css = getComputedStyle(document.documentElement);
    const COL = {
        area: css.getPropertyValue('--ocean-mid').trim() || '#1b4965',
        line: css.getPropertyValue('--ocean-warm').trim() || '#cae9ff',
        ink: css.getPropertyValue('--ink').trim() || '#14110d',
        heat: css.getPropertyValue('--heat-2').trim() || '#e8833a',
        grid: '#d8d4c8',
    };

    // Compute regional mean from per-country series
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

    // ── Tooltip (Bklit dark-glass) ────────────────
    const tip = d3.select(el).append('div')
        .attr('class', 'bklit-tooltip');

    const svg = d3.select(el).append('svg')
        .attr('role', 'img')
        .attr('aria-label', 'Regional sea-level anomaly trend for the Pacific, rising over the observation period.');


    function draw() {
        const pts = regionalMean(data);
        if (!pts.length) {
            el.innerHTML = '<p class="nodata">No sea-level data available.</p>';
            return;
        }

        const w = el.clientWidth || state.width;
        const h = state.height;
        svg.attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);

        const innerW = w - M.left - M.right;
        const innerH = h - M.top - M.bottom;

        const x = d3.scaleLinear()
            .domain(d3.extent(pts, d => d.year))
            .range([0, innerW]);

        const yExtent = d3.extent(pts, d => d.value);
        const y = d3.scaleLinear()
            .domain([Math.min(0, yExtent[0]) - 0.05, yExtent[1] + 0.05])
            .range([innerH, 0])
            .nice();

        svg.selectAll('g.root').remove();
        const g = svg.append('g').attr('class', 'root')
            .attr('transform', `translate(${M.left},${M.top})`);

        // grid
        g.append('g').attr('class', 'grid')
            .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(''))
            .call(s => s.select('.domain').remove())
            .call(s => s.selectAll('line')
                .attr('stroke', COL.grid).attr('stroke-dasharray', '2,3'));

        // zero baseline
        g.append('line')
            .attr('x1', 0).attr('x2', innerW)
            .attr('y1', y(0)).attr('y2', y(0))
            .attr('stroke', COL.ink).attr('stroke-width', 1).attr('opacity', 0.3);

        // area
        const areaGen = d3.area()
            .x(d => x(d.year))
            .y0(y(0))
            .y1(d => y(d.value))
            .curve(d3.curveMonotoneX);

        const lineGen = d3.line()
            .x(d => x(d.year))
            .y(d => y(d.value))
            .curve(d3.curveMonotoneX);

        // clip path for draw-on animation
        const clipId = 'sl-clip';
        const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
        defs.selectAll(`#${clipId}`).remove();
        const clip = defs.append('clipPath').attr('id', clipId);
        clip.append('rect')
            .attr('x', M.left).attr('y', M.top)
            .attr('width', 0).attr('height', innerH + 4);

        clip.select('rect')
            .transition().duration(1200).ease(d3.easeCubicOut)
            .attr('width', innerW);

        g.append('path')
            .datum(pts)
            .attr('fill', COL.area)
            .attr('opacity', 0.18)
            .attr('clip-path', `url(#${clipId})`)
            .attr('d', areaGen);

        g.append('path')
            .datum(pts)
            .attr('fill', 'none')
            .attr('stroke', COL.area)
            .attr('stroke-width', 2.5)
            .attr('stroke-linecap', 'round')
            .attr('clip-path', `url(#${clipId})`)
            .attr('d', lineGen);

        // end-point dot + label
        const last = pts[pts.length - 1];
        g.append('circle')
            .attr('cx', x(last.year)).attr('cy', y(last.value))
            .attr('r', 4).attr('fill', COL.heat)
            .attr('opacity', 0)
            .transition().delay(1100).duration(300)
            .attr('opacity', 1);

        g.append('text')
            .attr('x', x(last.year) - 6).attr('y', y(last.value) - 10)
            .attr('text-anchor', 'end')
            .attr('font-size', 12).attr('font-weight', 600)
            .attr('fill', COL.heat)
            .attr('opacity', 0)
            .text(`${last.value > 0 ? '+' : ''}${last.value.toFixed(2)} m`)
            .transition().delay(1150).duration(300)
            .attr('opacity', 1);

        // axes
        g.append('g').attr('transform', `translate(0,${innerH})`)
            .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')))
            .call(s => s.select('.domain').attr('stroke', COL.ink).attr('opacity', 0.3));

        g.append('g')
            .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d > 0 ? '+' : ''}${d.toFixed(1)} m`))
            .call(s => s.select('.domain').remove())
            .call(s => s.selectAll('text').attr('fill', COL.ink).attr('opacity', 0.7));

        // axis label
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -innerH / 2).attr('y', -46)
            .attr('text-anchor', 'middle')
            .attr('font-size', 11).attr('fill', COL.ink).attr('opacity', 0.6)
            .text('Sea level anomaly (m) — regional mean');

        // DATA-HONESTY NOTE (required by BUILD_BRIEF §2)
        g.append('text')
            .attr('x', 0).attr('y', innerH + 46)
            .attr('font-size', 10).attr('fill', COL.ink).attr('opacity', 0.5)
            .attr('font-style', 'italic')
            .text('Values rounded to 0.1 m resolution. Shown as regional trend — not a per-country comparison.');

        // ── Hover overlay ───────────────────────────────
        const bisect = d3.bisector(d => d.year).left;
        const cursorG = g.append('g').style('display', 'none');
        cursorG.append('line')
            .attr('class', 'cur-line')
            .attr('y1', 0).attr('y2', innerH)
            .attr('stroke', '#bbb').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');
        cursorG.append('circle').attr('class', 'cur-dot').attr('r', 4)
            .attr('fill', COL.area).attr('stroke', '#fff').attr('stroke-width', 2);

        g.append('rect')
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'transparent').attr('cursor', 'crosshair')
            .on('mousemove', function (event) {
                const [mx] = d3.pointer(event);
                const yr = x.invert(mx);
                const idx = Math.min(bisect(pts, yr), pts.length - 1);
                const pt = pts[idx];
                const xTip = x(pt.year);
                const yTip = y(pt.value);
                const val = pt.value;
                const sign = val > 0 ? '+' : '';
                cursorG.style('display', null);
                cursorG.select('.cur-line').attr('x1', xTip).attr('x2', xTip);
                cursorG.select('.cur-dot').attr('cx', xTip).attr('cy', yTip);
                tip.style('opacity', 1)
                    .style('left', `${M.left + xTip + 14}px`)
                    .style('top', `${M.top + yTip - 20}px`)
                    .html(
                        `<span class="tt-label">${pt.year}</span><br>` +
                        `<span class="tt-dot" style="background:#5ca3ee"></span>` +
                        `<span class="tt-value">${sign}${Math.abs(val).toFixed(2)}m</span> ` +
                        `<span class="tt-label">anomaly</span>`
                    );
            })
            .on('mouseleave', () => { cursorG.style('display', 'none'); tip.style('opacity', 0); });
    }

    draw();

    return {
        update(newOpts = {}) {
            Object.assign(state, newOpts);
            draw();
        },
        destroy() { el.innerHTML = ''; },
    };
}
