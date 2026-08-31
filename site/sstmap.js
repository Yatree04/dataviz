// site/tempmap.js is this file's subject, kept at sstmap.js to avoid churn.
// The surface-temperature map: a Pacific overview that drills into a single
// territory and back. Sea-surface temperature is a different indicator and has
// its own visualisation below this one; the two are never mixed.
//
// Geometry is Natural Earth 1:10m, filtered to the territories this dataset
// names and vendored into data/pacific.geo.json — so the map no longer depends
// on a CDN that can fail, and every polygon on it corresponds to a real series.
//
// Pitcairn is the one territory drawn without a value: it has a polygon but no
// SST observation, so it stays base land. Tokelau is the reverse — an
// observation with no polygon in Natural Earth's country layer — so it appears
// as a marker only. Neither is given a number it does not have.

import { COLORS, COORDS, ENSO_EVENTS, countryName } from './data.js';

const FONT = { fontFamily: 'Inter, sans-serif' };
// Line colours for compared territories; the first is the page's accent.
const LINES = ['#E8833A', '#2A78D6', '#7B9E4F', '#9B59B6', '#C1362F'];
const NO_DATA = '#EFECE6';
const NO_DATA_EDGE = '#DAD5CB';

/** Anomaly -> the page's existing blue/cream/red language.
 *  The domain is +-1.2, not the series' full -2.0..+1.1 extent: the 1st and
 *  99th percentiles are -1.0 and +0.8, so a domain wide enough for the single
 *  coldest observation leaves every ordinary year washed out. Values beyond
 *  +-1.2 saturate rather than being dropped. Fixed, so years stay comparable. */
const COLOR_AXIS = {
  min: -1.2,
  max: 1.2,
  // Without these the axis rounds outward to whole ticks (+-2), which is the
  // full extent of a single cold outlier and leaves every ordinary year cream.
  startOnTick: false,
  endOnTick: false,
  stops: [[0, COLORS.blue], [0.5, '#F4F1EA'], [1, COLORS.red]],
};

export async function buildSSTMap(D) {
  const host = document.getElementById('chart-sst-map');
  if (!host || typeof Highcharts.mapChart !== 'function') return;

  let geo;
  try {
    geo = await fetch('data/pacific.geo.json').then((r) => r.json());
  } catch (e) {
    host.classList.add('pending');
    host.innerHTML = '<div><p class="pending-title">Pacific geometry did not load</p>'
      + '<p class="pending-body">The vendored map geometry could not be read.</p></div>';
    return;
  }

  // ── the record, indexed for lookup ─────────────────────────────────────────
  const byIso = {};                     // iso -> { year: value }
  for (const c of D.mapCountries) byIso[c.iso] = Object.fromEntries(c.series);
  const ISOS = Object.keys(byIso);
  const [Y_MIN, Y_MAX] = D.stYears;
  const regionalAt = Object.fromEntries(D.stRegional);
  const geomOf = Object.fromEntries(geo.features.map((f) => [f.properties.iso, f.geometry]));

  // Each island of a territory, as the centroid of its own polygon part. An
  // atoll is about a kilometre across and renders sub-pixel at any zoom that
  // still shows the whole country, so at territory zoom the archipelago is
  // drawn as its actual islands rather than as shapes too small to see. These
  // are positions taken from the geometry, not invented points.
  const partsOf = {};
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    partsOf[f.properties.iso] = polys.map((poly) => {
      const ring = poly[0];
      let x = 0, y = 0;
      for (const c of ring) { x += c[0]; y += c[1]; }
      return { lon: x / ring.length, lat: y / ring.length };
    });
  }

  const valueAt = (iso, year) => {
    const v = byIso[iso]?.[year];
    return Number.isFinite(v) ? v : null;
  };
  const fmt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

  // ── state ─────────────────────────────────────────────────────────────────
  let year = Y_MAX;
  let selection = [];       // isos, in the order they were picked
  const primary = () => selection[0] || null;
  let drilled = false;      // true once the view is inside a territory

  // ── data builders ─────────────────────────────────────────────────────────
  // Once we are inside a territory, everything else desaturates so the subject
  // of the detail graph is unmistakable. The dim colour is set on the datum
  // rather than as a series opacity, which would fade the selection too.
  const DIM_AREA = '#EDE9E1';
  const DIM_MARK = '#DAD5CB';
  const dimmed = (iso) => drilled && !selection.includes(iso);

  const choropleth = (y) => ISOS
    .filter((iso) => geomOf[iso] && valueAt(iso, y) !== null)
    .map((iso) => ({
      iso, value: valueAt(iso, y),
      ...(dimmed(iso) ? { color: DIM_AREA } : {}),
      borderColor: selection.includes(iso) ? COLORS.ink : 'rgba(25,25,25,0.28)',
      borderWidth: selection.includes(iso) ? (drilled ? 2.6 : 1.8) : 0.7,
    }));

  const markers = (y) => ISOS.map((iso) => {
    const v = valueAt(iso, y);
    if (v === null || !COORDS[iso]) return null;
    const [lat, lon] = COORDS[iso];
    const on = selection.includes(iso);
    return {
      iso, lat, lon, name: countryName(iso), colorValue: v, value: v,
      ...(dimmed(iso) ? { color: DIM_MARK } : {}),
      marker: {
        radius: on ? (drilled ? 10 : 9) : 7,
        lineWidth: on ? 1.8 : 0.8,
        lineColor: on ? COLORS.ink : 'rgba(25,25,25,0.30)',
      },
    };
  }).filter(Boolean);

  function tooltipFor(iso) {
    const v = valueAt(iso, year);
    const mean = regionalAt[year];
    if (v === null) return false;
    const delta = Number.isFinite(mean) ? v - mean : null;
    return `<span class="tt-name">${countryName(iso)}</span><br>`
      + `<span class="tt-year">${year}</span> &nbsp; <span class="tt-val">${fmt(v)} °C</span><br>`
      + (Number.isFinite(mean)
        ? `<span class="tt-ref">Pacific mean ${fmt(mean)} °C`
          + (delta === null ? '' : ` · ${fmt(delta)} against it`) + '</span>'
        : '');
  }

  // ── the map ───────────────────────────────────────────────────────────────
  const chart = Highcharts.mapChart(host, {
    chart: {
      backgroundColor: 'transparent', animation: { duration: 420 }, height: 620,
      style: FONT, spacing: [4, 4, 4, 4],
    },
    // The vendored geometry is Pacific-only, so fitting its bounds is the
    // Pacific overview and it stays right at any container width. No hardcoded
    // zoom: a fixed one sat below the view's own minZoom and was silently
    // clamped on the first drill-up.
    mapView: { projection: { name: 'EqualEarth', rotation: [-180] } },
    mapNavigation: {
      enabled: true,
      enableDoubleClickZoomTo: true,
      enableMouseWheelZoom: false,      // the page scrolls past this; don't hijack it
      buttonOptions: { theme: { r: 3 }, verticalAlign: 'bottom', x: 6, y: -6 },
    },
    colorAxis: { ...COLOR_AXIS, visible: false },
    legend: { enabled: false },
    tooltip: {
      useHTML: true, backgroundColor: 'rgba(255,255,255,0.97)',
      borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 4, shadow: false,
      padding: 9, style: { fontSize: '12px' },
    },
    plotOptions: {
      series: {
        states: { inactive: { opacity: 1 } },
        point: {
          events: {
            click(e) {
              toggleSelect(this.iso, !!(e && (e.shiftKey || e.ctrlKey || e.metaKey)));
            },
            dblclick() { drillTo(this.iso); },
          },
        },
      },
    },
    series: [
      // 0 — every Pacific territory as land, including any with no series
      {
        type: 'map', id: 'pac-base', mapData: geo, nullColor: NO_DATA,
        borderColor: NO_DATA_EDGE, borderWidth: 0.6,
        enableMouseTracking: false, showInLegend: false, zIndex: 0,
      },
      // 2 — the observation itself, painted onto the territory
      {
        type: 'map', id: 'sst-area', mapData: geo, joinBy: ['iso', 'iso'],
        data: choropleth(Y_MAX), allowPointSelect: true, cursor: 'pointer',
        states: { select: { borderColor: COLORS.ink, borderWidth: 2 } },
        borderColor: 'rgba(25,25,25,0.28)', borderWidth: 0.7, zIndex: 2,
        states: { hover: { borderColor: COLORS.ink, borderWidth: 1.4, brightness: 0 } },
        tooltip: { pointFormatter() { return tooltipFor(this.iso); } },
      },
      // 3 — a marker per observation, so atolls stay findable at Pacific zoom
      {
        type: 'mappoint', id: 'sst-point', data: markers(Y_MAX), zIndex: 3,
        colorKey: 'colorValue', allowPointSelect: true, cursor: 'pointer',
        marker: { symbol: 'circle', radius: 7, lineWidth: 0.8, lineColor: 'rgba(25,25,25,0.30)' },
        dataLabels: { enabled: false },
        tooltip: { pointFormatter() { return tooltipFor(this.iso); } },
      },
      // 4 — the selected territory's own islands, drawn only once drilled in
      {
        type: 'mappoint', id: 'sel-parts', data: [], zIndex: 4,
        colorKey: 'colorValue', enableMouseTracking: false,
        marker: { symbol: 'circle', radius: 3, lineWidth: 1, lineColor: 'rgba(25,25,25,0.7)' },
        dataLabels: { enabled: false },
      },
    ],
  });

  // The overview to return to, taken from the view Highcharts actually settles
  // on rather than a guess that minZoom may refuse.
  chart.mapView.fitToBounds(undefined, undefined, false);
  const HOME = { center: [...chart.mapView.center], zoom: chart.mapView.zoom };

  // ── selection ─────────────────────────────────────────────────────────────
  // Held here rather than read back from Highcharts: paintSelection calls
  // setData, which rebuilds the points and drops their selected flag, so the
  // chart cannot be the source of truth for what is selected.
  function toggleSelect(iso, accumulate) {
    if (accumulate) {
      selection = selection.includes(iso)
        ? selection.filter((x) => x !== iso)
        : [...selection, iso];
    } else {
      selection = (selection.length === 1 && selection[0] === iso) ? [] : [iso];
    }
    if (!selection.length) return drillUp();
    paintSelection();
    paintCrumb();
    refreshDetail();
  }

  // setData updates existing points in place when the length matches, which
  // merges rather than replaces: a colour set while dimmed survives a later
  // datum that omits the key, so closing the popup left the map greyed out.
  // Replace the points outright whenever the dim state changes, and keep the
  // cheaper in-place update for plain year scrubbing.
  let lastDimState = null;
  function paintSelection() {
    const dimState = `${drilled}|${selection.join(',')}`;
    const keepPoints = dimState === lastDimState;
    lastDimState = dimState;
    chart.get('sst-area').setData(choropleth(year), false, false, keepPoints);
    chart.get('sst-point').setData(markers(year), false, false, keepPoints);
    const parts = chart.get('sel-parts');
    if (parts) {
      // At territory zoom an atoll state's land is sub-pixel, so the selection
      // is drawn as its actual islands, each at the centroid of its own part.
      // Only when a single territory is the subject; a comparison has no one
      // archipelago to draw.
      const one = drilled && selection.length === 1 ? selection[0] : null;
      parts.setData(one
        ? (partsOf[one] || []).map((q) => ({
          lat: q.lat, lon: q.lon, colorValue: valueAt(one, year),
        }))
        : [], false);
    }
    chart.redraw();
  }

  // ── drilldown / drill-up ──────────────────────────────────────────────────
  const crumb = document.getElementById('map-breadcrumb');
  const detail = document.getElementById('territory-detail');
  const detailTitle = document.getElementById('detail-title');
  let detailChart = null;

  function paintCrumb() {
    if (!crumb) return;
    const here = selection.length > 1
      ? `${selection.length} territories`
      : selection.length === 1 ? countryName(selection[0]) : null;
    crumb.innerHTML = here
      ? `<button class="crumb-link" data-up="1">Pacific</button>`
        + `<span class="crumb-sep">/</span><span class="crumb-here">${here}</span>`
      : `<span class="crumb-here">Pacific</span>`;
  }

  function drillTo(iso) {
    selection = [iso];
    drilled = true;
    paintSelection();
    paintCrumb();
    const g = geomOf[iso];
    try {
      if (g && chart.mapView.fitToGeometry) chart.mapView.fitToGeometry(g, 24, true, { duration: 600 });
      else throw new Error('no geometry');
    } catch (e) {
      // Tokelau has an observation but no polygon, so frame it by coordinate.
      const [lat, lon] = COORDS[iso] || [];
      if (Number.isFinite(lat)) chart.mapView.setView([lon, lat], 5.2, true, { duration: 600 });
    }
    refreshDetail();
  }

  function drillUp() {
    selection = [];
    drilled = false;
    paintSelection();
    paintCrumb();
    chart.mapView.setView(HOME.center, HOME.zoom, true, { duration: 600 });
    if (detail) detail.hidden = true;
    if (detailChart) { detailChart.destroy(); detailChart = null; }
  }

  if (crumb) {
    crumb.addEventListener('click', (e) => {
      if (e.target.closest('[data-up]')) drillUp();
    });
  }
  const closeBtn = document.getElementById('detail-close');
  if (closeBtn) closeBtn.addEventListener('click', drillUp);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selection.length) drillUp();
  });

  // ── the territory's own record, over time ─────────────────────────────────
  // Built once and re-fed per country, rather than rebuilt on every drilldown:
  // the chart is a fixed frame and the country is what changes inside it.
  function ensureDetailChart() {
    if (detailChart) return detailChart;
    detailChart = Highcharts.chart('detail-chart', {
      chart: {
        backgroundColor: 'transparent', height: 280, style: FONT,
        spacing: [8, 2, 4, 2], animation: { duration: 450 },
      },
      title: { text: null },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        min: Y_MIN, max: Y_MAX, tickInterval: 50, lineColor: '#E2E8F0', tickLength: 0,
        crosshair: { width: 1, color: 'rgba(25,25,25,0.18)' },
        labels: { style: { fontSize: '10px', color: COLORS.light } },
        plotBands: ENSO_EVENTS.map((e) => ({
          from: e.start - 0.5, to: e.end + 0.5,
          color: e.phase === 'el-nino' ? 'rgba(217,95,82,0.07)' : 'rgba(74,144,226,0.07)',
        })),
        plotLines: [{ id: 'cursor', value: year, color: COLORS.ink, width: 1, zIndex: 5, dashStyle: 'Dot' }],
      },
      yAxis: {
        title: { text: null }, gridLineColor: COLORS.grid,
        labels: { format: '{value:.1f}°C', style: { fontSize: '10px', color: COLORS.light } },
        plotLines: [{ id: 'zero', value: 0, color: '#DDD', width: 1, zIndex: 1 }],
      },
      tooltip: {
        useHTML: true, shared: true, backgroundColor: 'rgba(255,255,255,0.97)',
        borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 4, shadow: false,
        style: { fontSize: '12px' },
        headerFormat: '<span class="tt-year">{point.key}</span><br>',
      },
      plotOptions: {
        series: {
          marker: { enabled: false, states: { hover: { enabled: true, radius: 3.5 } } },
          connectNulls: false,
        },
      },
      series: [],
    });
    return detailChart;
  }

  function refreshDetail() {
    if (!detail) return;
    if (!selection.length) {
      detail.hidden = true;
      if (detailChart) { detailChart.destroy(); detailChart = null; }
      return;
    }
    detail.hidden = false;

    const many = selection.length > 1;
    if (detailTitle) {
      detailTitle.textContent = many
        ? `Comparing ${selection.length} territories`
        : countryName(selection[0]);
    }

    // Actual observations only. Years the file does not report stay absent, and
    // a null breaks the line rather than drawing across a gap that isn't there.
    const seriesFor = (iso) => {
      const pts = [];
      for (let y = Y_MIN; y <= Y_MAX; y++) pts.push([y, valueAt(iso, y)]);
      return pts;
    };
    const mean = [];
    for (let y = Y_MIN; y <= Y_MAX; y++) {
      mean.push([y, Number.isFinite(regionalAt[y]) ? regionalAt[y] : null]);
    }

    // One territory has a long-term mean worth drawing; several would need one
    // reference line each, which is noise rather than context.
    const own = seriesFor(selection[0]);
    const vals = own.map((p) => p[1]).filter((v) => v !== null);
    const longTerm = vals.reduce((a, b) => a + b, 0) / vals.length;

    const sub = document.getElementById('detail-sub');
    if (sub) {
      sub.textContent = many
        ? `Surface temperature anomaly · ${Y_MIN}–${Y_MAX} · shift-click the map to add or remove`
        : `Surface temperature anomaly · ${Y_MIN}–${Y_MAX}`;
    }

    const key = document.getElementById('detail-key');
    if (key) {
      key.innerHTML = selection
        .map((iso, n) => `<span class="dk"><i class="dk-line" style="background:${LINES[n % LINES.length]}"></i>`
          + `${countryName(iso)}</span>`)
        .join('')
        + `<span class="dk"><i class="dk-line" style="background:#9C968B"></i>Pacific mean</span>`
        + (many ? '' : `<span class="dk"><i class="dk-dash"></i>its long-term mean ${fmt(longTerm)} °C</span>`);
    }

    const c = ensureDetailChart();
    while (c.series.length) c.series[0].remove(false);

    c.addSeries({
      name: 'Pacific mean', data: mean, color: '#9C968B',
      lineWidth: 1.2, zIndex: 1,
      tooltip: {
        pointFormatter() {
          return `<span class="tt-ref">Pacific mean ${fmt(this.y)} °C</span><br>`;
        },
      },
    }, false);

    selection.forEach((iso, n) => {
      c.addSeries({
        name: countryName(iso), data: seriesFor(iso), color: LINES[n % LINES.length],
        lineWidth: 1.5, zIndex: 2 + n,
        states: { hover: { lineWidth: 1.5 } },
        tooltip: {
          pointFormatter() {
            return `<span class="tt-name">${countryName(iso)}</span> `
              + `<span class="tt-val">${fmt(this.y)} °C</span><br>`;
          },
        },
        // Hovering the record moves the map to that year, so the two halves of
        // the drilldown stay one object rather than two charts.
        point: { events: { mouseOver() { scrubTo(this.x); } } },
      }, false);
    });

    c.addSeries({
      id: 'cursor-point', type: 'scatter', data: cursorPoint(selection[0]),
      color: COLORS.ink, zIndex: 20, enableMouseTracking: false,
      marker: { enabled: true, radius: 4, symbol: 'circle' },
    }, false);

    c.yAxis[0].removePlotLine('ltm');
    if (!many) {
      c.yAxis[0].addPlotLine({
        id: 'ltm', value: longTerm, color: COLORS.accent,
        width: 1, dashStyle: 'Dash', zIndex: 2,
      });
    }
    c.redraw();
    // The popup is absolutely positioned and starts hidden; a chart built into
    // a container with no layout measures zero, so size it once it is on screen.
    requestAnimationFrame(() => c.reflow());
  }

  const cursorPoint = (iso) => {
    const v = valueAt(iso, year);
    return v === null ? [] : [[year, v]];
  };

  // Hovering the detail record scrubs the map. Coalesced to one update per
  // frame — mouseOver fires far faster than the map can usefully redraw.
  let pending = null;
  function scrubTo(y) {
    if (y === year || y == null) return;
    pending = y;
    if (scrubTo.queued) return;
    scrubTo.queued = true;
    requestAnimationFrame(() => {
      scrubTo.queued = false;
      if (pending === null || pending === year) return;
      year = pending;
      stop();
      render();
    });
  }

  // ── one year control, driving every view ──────────────────────────────────
  const track = document.querySelector('.timeline-track');
  const fill = document.querySelector('.timeline-fill');
  const handle = document.querySelector('.timeline-handle');
  const playBtn = document.querySelector('.map-ui .play-btn');
  const yearLabel = document.querySelector('.map-ui-year');
  let timer = null;

  function render() {
    paintSelection();

    const pct = ((year - Y_MIN) / (Y_MAX - Y_MIN)) * 100;
    if (fill) fill.style.width = `${pct}%`;
    if (handle) handle.style.left = `${pct}%`;
    if (yearLabel) yearLabel.textContent = year;

    if (detailChart && selection.length) {
      detailChart.xAxis[0].update({
        plotLines: [{ id: 'cursor', value: year, color: COLORS.ink, width: 1, zIndex: 4, dashStyle: 'Dot' }],
      }, false);
      detailChart.get('cursor-point').setData(cursorPoint(selection[0]), false);
      detailChart.redraw();
    }
  }

  function stop() {
    clearInterval(timer); timer = null;
    if (playBtn) { playBtn.classList.remove('playing'); playBtn.innerHTML = '▶'; playBtn.title = 'play'; }
  }

  if (track) {
    const seek = (clientX) => {
      const r = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      year = Math.round(Y_MIN + t * (Y_MAX - Y_MIN));
      render();
    };
    track.addEventListener('pointerdown', (e) => {
      stop(); seek(e.clientX);
      const move = (ev) => seek(ev.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (timer) return stop();
      if (year >= Y_MAX) year = Y_MIN;
      playBtn.classList.add('playing');
      playBtn.innerHTML = '⏸'; playBtn.title = 'pause';
      timer = setInterval(() => {
        if (year >= Y_MAX) return stop();
        year += 1;
        render();
      }, 95);
    });
  }

  paintCrumb();
  render();
}
