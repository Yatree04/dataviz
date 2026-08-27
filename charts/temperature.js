// charts/temperature.js
// BEAT ② — "The heat store": land (ST_ANOM) vs sea (SST_ANOM) temperature anomaly.
// Module contract: renderTemperature(container, climate, opts) → { update, destroy }
// Dependencies: D3 v7 (global `d3`).

const C_LAND = '#e07b3f';
const C_SEA = '#2a78d6';
const C_GRID = '#e0e0e0';
const C_AXIS = '#999999';
const C_BLCH = 'rgba(193, 54, 47, 0.12)';
const C_BLCH_S = 'rgba(193, 54, 47, 0.45)';

export function renderTemperature(container, climate, opts = {}) {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  const state = {
    country: opts.country || 'Fiji',
    width: opts.width || el.clientWidth || 720,
    height: opts.height || 420,
    showBleachingBand: opts.showBleachingBand || false,
  };

  const M = { top: 24, right: 80, bottom: 40, left: 52 };

  el.innerHTML = '';

  // ── Tooltip (Bklit dark-glass style) ─────────────────────────
  const tip = d3.select(el).append('div')
    .attr('class', 'bklit-tooltip');

  d3.select(el).style('position', 'relative');

  const svg = d3.select(el).append('svg')
    .attr('width', state.width)
    .attr('height', state.height)
    .attr('viewBox', `0 0 ${state.width} ${state.height}`)
    .attr('role', 'img');

  const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);
  const innerW = state.width - M.left - M.right;
  const innerH = state.height - M.top - M.bottom;

  const x = d3.scaleLinear().range([0, innerW]);
  const y = d3.scaleLinear().range([innerH, 0]);

  const gGrid = g.append('g').attr('class', 'grid');
  const gBleach = g.append('g').attr('class', 'bleach-band');
  const gLines = g.append('g').attr('class', 'lines');
  const gAxisX = g.append('g').attr('transform', `translate(0,${innerH})`);
  const gAxisY = g.append('g');
  const gLabels = g.append('g');
  // Overlay rect for mouse tracking
  const overlay = g.append('rect')
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent').attr('cursor', 'crosshair');
  const gCursor = g.append('g').attr('class', 'cursor').style('display', 'none');

  // Vertical cursor line
  const cursorLine = gCursor.append('line')
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', '#999').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');

  // Cursor dots
  const dotLand = gCursor.append('circle').attr('r', 4).attr('fill', C_LAND).attr('stroke', '#fff').attr('stroke-width', 2);
  const dotSea = gCursor.append('circle').attr('r', 4).attr('fill', C_SEA).attr('stroke', '#fff').attr('stroke-width', 2);

  function seriesFor(indicator, country) {
    return ((climate[indicator] || {})[country] || []).map(([yr, v]) => ({ year: yr, value: v }));
  }

  let _land = [], _sea = [];

  function draw() {
    _land = seriesFor('ST_ANOM', state.country);
    _sea = seriesFor('SST_ANOM', state.country);
    const all = _land.concat(_sea);
    if (!all.length) { el.innerHTML = `<p class="nodata">No data for ${state.country}.</p>`; return; }

    const minYear = Math.max(d3.min(all, d => d.year), 1900);
    const maxYear = d3.max(all, d => d.year);
    x.domain([minYear, maxYear]);
    const yMin = Math.min(0, d3.min(all, d => d.value));
    const yMax = d3.max(all, d => d.value);
    y.domain([yMin, yMax + 0.1]).nice();

    // Grid
    gGrid.call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(''))
      .call(s => s.selectAll('line').attr('stroke', C_GRID).attr('stroke-dasharray', '2,3'))
      .call(s => s.select('.domain').remove());
    gGrid.selectAll('line.zero').remove();
    gGrid.append('line').attr('class', 'zero')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', '#bbb').attr('stroke-width', 1);

    // Bleaching band (beat 3b)
    gBleach.selectAll('*').remove();
    if (state.showBleachingBand && yMax > 1.0) {
      gBleach.append('rect')
        .attr('x', 0).attr('width', innerW)
        .attr('y', y(yMax + 0.1)).attr('height', y(1.0) - y(yMax + 0.1))
        .attr('fill', C_BLCH);
      gBleach.append('line')
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', y(1.0)).attr('y2', y(1.0))
        .attr('stroke', C_BLCH_S).attr('stroke-dasharray', '4,3').attr('stroke-width', 1.5);
      gBleach.append('text')
        .attr('x', 6).attr('y', y(1.0) - 5)
        .attr('font-size', 11).attr('fill', '#c1362f').attr('font-style', 'italic')
        .text('bleaching-stress threshold (~+1 °C)');
    }

    const line = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);

    const data = [
      { key: 'sea', label: 'Sea surface', color: C_SEA, values: _sea },
      { key: 'land', label: 'Land surface', color: C_LAND, values: _land },
    ];

    const paths = gLines.selectAll('path.series').data(data, d => d.key);
    paths.enter().append('path').attr('class', 'series')
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .merge(paths)
      .attr('stroke', d => d.color)
      .attr('d', d => line(d.values))
      .each(function () {
        const len = this.getTotalLength();
        d3.select(this)
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .transition().duration(1100).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0);
      });
    paths.exit().remove();

    // End labels — stacked vertically to avoid collision
    const lastLand = _land[_land.length - 1];
    const lastSea = _sea[_sea.length - 1];
    gLabels.selectAll('*').remove();
    if (lastLand && lastSea) {
      const xPos = x(Math.max(lastLand.year, lastSea.year)) + 8;
      // Always put sea above land if they're close
      const yLand = y(lastLand.value);
      const ySea = y(lastSea.value);
      const MIN_GAP = 18;
      let yLandAdj = yLand, ySeaAdj = ySea;
      if (Math.abs(yLand - ySea) < MIN_GAP) {
        yLandAdj = (yLand + ySea) / 2 + MIN_GAP / 2;
        ySeaAdj = (yLand + ySea) / 2 - MIN_GAP / 2;
      }
      [
        { color: C_LAND, label: 'Land', yPos: yLandAdj },
        { color: C_SEA, label: 'Ocean', yPos: ySeaAdj },
      ].forEach(({ color, label, yPos }) => {
        gLabels.append('text')
          .attr('x', xPos).attr('y', yPos + 4)
          .attr('font-size', 11).attr('font-weight', 600)
          .attr('fill', color).attr('opacity', 0.9)
          .text(label);
      });
    }

    gAxisX.call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')))
      .call(s => s.select('.domain').attr('stroke', '#ccc'))
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));
    gAxisY.call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d > 0 ? '+' : ''}${d}°C`))
      .call(s => s.select('.domain').remove())
      .call(s => s.selectAll('text').attr('fill', C_AXIS).attr('font-size', 11));

    // ── Mouse interaction ─────────────────────────────────────
    overlay.on('mousemove', function (event) {
      const [mx] = d3.pointer(event);
      const yr = Math.round(x.invert(mx));

      const findVal = (series) => {
        const pt = series.find(d => d.year === yr) ||
          series.reduce((a, b) => Math.abs(b.year - yr) < Math.abs(a.year - yr) ? b : a, series[0]);
        return pt;
      };

      const pLand = findVal(_land);
      const pSea = findVal(_sea);
      if (!pLand || !pSea) return;

      gCursor.style('display', null);
      cursorLine.attr('x1', mx).attr('x2', mx);
      dotLand.attr('cx', x(pLand.year)).attr('cy', y(pLand.value));
      dotSea.attr('cx', x(pSea.year)).attr('cy', y(pSea.value));

      const sign = v => v > 0 ? '+' : '';
      tip.style('opacity', 1)
        .style('left', `${M.left + mx + 14}px`)
        .style('top', `${M.top + Math.min(y(pLand.value), y(pSea.value)) - 10}px`)
        .html(
          `<span class="tt-label">${yr}</span><br>` +
          `<span class="tt-dot" style="background:${C_LAND}"></span>` +
          `<span class="tt-value">${sign(pLand.value)}${pLand.value.toFixed(2)}°C</span> ` +
          `<span class="tt-label">Land</span><br>` +
          `<span class="tt-dot" style="background:${C_SEA}"></span>` +
          `<span class="tt-value">${sign(pSea.value)}${pSea.value.toFixed(2)}°C</span> ` +
          `<span class="tt-label">Ocean</span>`
        );
    });

    overlay.on('mouseleave', () => {
      gCursor.style('display', 'none');
      tip.style('opacity', 0);
    });

    svg.attr('aria-label',
      `Temperature anomaly for ${state.country}: land and sea surface showing rising trend.`);
  }

  draw();

  return {
    update(newOpts = {}) { Object.assign(state, newOpts); draw(); },
    destroy() { el.innerHTML = ''; },
  };
}
