// site/main.js
// Every chart on this page is built from the real SPC CSVs loaded in data.js.
// Where a quantity cannot carry the weight the prose puts on it, the chart says
// so rather than drawing a smoother line than the data supports.

import { loadData, COLORS, ENSO_EVENTS, slope } from './data.js';

const FONT = { fontFamily: 'Inter, sans-serif' };
const AXIS_LABEL = { style: { fontSize: '10px', color: COLORS.light } };

/** ENSO shading, shared by every time-series chart on the page. */
function ensoBands(years) {
  const idx = (y) => years.indexOf(y);
  return ENSO_EVENTS.map((e) => {
    const from = idx(e.start), to = idx(e.end);
    if (from < 0 && to < 0) return null;
    return {
      from: (from < 0 ? 0 : from) - 0.5,
      to: (to < 0 ? years.length - 1 : to) + 0.5,
      color: e.phase === 'el-nino' ? 'rgba(217,95,82,0.07)' : 'rgba(74,144,226,0.07)',
    };
  }).filter(Boolean);
}

const baseChart = (extra = {}) => ({
  backgroundColor: 'transparent',
  style: FONT,
  ...extra,
});

const setText = (sel, value) => {
  // querySelectorAll, not querySelector — several figures are quoted in more
  // than one place (the rainfall span appears in both the lede and the caption).
  document.querySelectorAll(sel).forEach((el) => { el.textContent = value; });
};

(async () => {
  let D;
  try {
    D = await loadData();
  } catch (e) {
    console.error('Data load failed:', e);
    document.querySelectorAll('.chart').forEach((el) => {
      el.innerHTML = '<p style="padding:2rem;color:#999;font-size:14px">'
        + 'Could not load the source CSVs. Serve this over HTTP, not file://.</p>';
    });
    return;
  }
  window.__DATA__ = D;   // handy for inspection

  Highcharts.setOptions({
    lang: { thousandsSep: ',' },
    credits: { enabled: false },
    title: { text: null },
  });

  // ── 1. Emissions, animated by year ────────────────────────────────────────
  // A racing bar over the real GHG_EMI_CAPITA series. The six implausible
  // series are drawn in a muted hatch-grey and labelled, not hidden: a gap you
  // can see is more honest than a country that quietly vanishes.
  const START = 1970, END = 2024, TOP_N = 16;
  const btn = document.getElementById('play-pause-button');
  const input = document.getElementById('play-range');

  const suspectNames = new Set(D.ghgLatest.filter((g) => g.suspect).map((g) => g.country));

  function emissionsFor(year) {
    return Object.entries(D.ghgByYear)
      .map(([country, byYear]) => ({
        name: country,
        y: byYear[year] ?? null,
        color: suspectNames.has(country) ? 'rgba(153,153,153,0.45)'
          : COLORS.red,
        suspect: suspectNames.has(country),
      }))
      .filter((p) => p.y !== null)
      .sort((a, b) => b.y - a.y)
      .slice(0, TOP_N);
  }

  const racing = Highcharts.chart('chart-emissions', {
    chart: baseChart({ type: 'bar', animation: { duration: 450 }, height: 460 }),
    subtitle: {
      text: `<span style="font-size:64px;font-weight:700;color:#ececec;font-family:Lora,serif">${START}</span>`,
      floating: true, align: 'right', verticalAlign: 'bottom', useHTML: true, y: 4,
    },
    legend: { enabled: false },
    xAxis: { type: 'category', lineWidth: 0, tickWidth: 0, labels: { style: { fontSize: '10px' } } },
    yAxis: {
      title: { text: null }, type: 'logarithmic',
      gridLineColor: COLORS.grid,
      labels: { ...AXIS_LABEL, format: '{value}t' },
    },
    tooltip: {
      useHTML: true,
      pointFormatter() {
        return `<b>${this.name}</b><br>${this.y.toFixed(1)} tCO₂e per capita`
          + (this.suspect ? '<br><em style="color:#999">excluded — implausible series</em>' : '');
      },
    },
    plotOptions: {
      series: {
        animation: false, groupPadding: 0, pointPadding: 0.12, borderWidth: 0,
        dataSorting: { enabled: true, matchByName: true },
        dataLabels: { enabled: true, format: '{point.y:.1f}', style: { fontWeight: '500', textOutline: 'none' } },
      },
    },
    series: [{ type: 'bar', name: String(START), data: emissionsFor(START) }],
  });

  function renderYear() {
    const y = +input.value;
    racing.setSubtitle({
      text: `<span style="font-size:64px;font-weight:700;color:#ececec;font-family:Lora,serif">${y}</span>`,
    });
    racing.series[0].update({ name: String(y), data: emissionsFor(y) }, true);
    setText('#emissions-year', y);
  }

  function stop() {
    btn.title = 'play'; btn.innerHTML = '▶';
    clearInterval(racing.sequenceTimer);
    racing.sequenceTimer = undefined;
  }
  if (btn && input) {
    input.min = START; input.max = END; input.value = START;
    btn.addEventListener('click', () => {
      if (racing.sequenceTimer) return stop();
      if (+input.value >= END) input.value = START;
      btn.title = 'pause'; btn.innerHTML = '⏸';
      racing.sequenceTimer = setInterval(() => {
        input.value = +input.value + 1;
        renderYear();
        if (+input.value >= END) stop();
      }, 420);
    });
    input.addEventListener('input', () => { stop(); renderYear(); });
  }

  // ── 2. Warming stripes — every year of the regional record ────────────────
  const stripeHost = document.getElementById('stripe-band');
  if (stripeHost) {
    const pts = D.sstRegional;
    const vals = pts.map((p) => p[1]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const colour = (v) => {
      const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
      return t < 0.5
        ? `rgb(${Math.round(20 + t * 2 * 235)},${Math.round(60 + t * 2 * 195)},${Math.round(160 + t * 2 * 95)})`
        : `rgb(255,${Math.round(255 - (t - 0.5) * 2 * 215)},${Math.round(255 - (t - 0.5) * 2 * 255)})`;
    };
    // The design marks a point partway along this band. Rather than an arbitrary
    // year, the marker sits on the coldest year in the record — the other end of
    // the range the stripes are scaled against.
    const coldest = pts.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    const coldPct = ((coldest - pts[0][0]) / (pts[pts.length - 1][0] - pts[0][0])) * 100;
    stripeHost.innerHTML =
      `<div class="stripes">
        ${pts.map(([y, v]) =>
          `<div title="${y}: ${v > 0 ? '+' : ''}${v.toFixed(2)}°C" style="background:${colour(v)}"></div>`
        ).join('')}
      </div>
      <div class="band-axis">
        <span>${pts[0][0]}</span>
        <span class="mid" style="margin-left:calc(${coldPct.toFixed(1)}% - 5rem)">coldest ${coldest}</span>
        <span>${pts[pts.length - 1][0]}</span>
      </div>`;
  }

  // ── 3. Temperature, regional mean + a selected country ────────────────────
  const tempYears = D.sstRegional.map((p) => p[0]);
  const countryList = Object.keys(D.sstByCountry).sort();
  let activeCountry = countryList.includes('Marshall Islands') ? 'Marshall Islands' : countryList[0];

  const tempChart = Highcharts.chart('chart-temp', {
    chart: baseChart({ type: 'line', height: 380 }),
    xAxis: {
      categories: tempYears.map(String),
      tickInterval: 25, lineWidth: 0, tickWidth: 0,
      labels: { ...AXIS_LABEL },
      plotBands: ensoBands(tempYears),
    },
    yAxis: {
      title: { text: null }, gridLineColor: COLORS.grid,
      labels: { ...AXIS_LABEL, format: '{value:.1f}°C' },
      plotLines: [{ value: 0, color: '#ddd', width: 1, zIndex: 2 }],
    },
    legend: { enabled: false },
    tooltip: { shared: true, valueDecimals: 2, valueSuffix: '°C' },
    plotOptions: { line: { lineWidth: 1.5, marker: { enabled: false } } },
    series: [
      { name: 'Pacific countries mean', color: COLORS.gold, data: D.sstRegional.map((p) => p[1]), zIndex: 2 },
      { name: activeCountry, color: COLORS.accent, data: D.sstByCountry[activeCountry].map((p) => p[1]), zIndex: 1 },
    ],
  });

  // Two toggles, as the design draws them: the regional mean and one country.
  // The country pills below choose which country the second toggle refers to.
  const toggleRow = document.getElementById('temp-toggles');
  const shown = { mean: true, country: true };

  function paintToggles() {
    if (!toggleRow) return;
    toggleRow.innerHTML = `
      <button class="toggle" data-key="mean" data-on="${shown.mean}">
        <span class="swatch"></span>Pacific countries mean
      </button>
      <button class="toggle" data-key="country" data-on="${shown.country}">
        <span class="swatch"></span><span id="legend-country">${activeCountry}</span>
      </button>`;
  }
  paintToggles();

  if (toggleRow) {
    toggleRow.addEventListener('click', (e) => {
      const b = e.target.closest('.toggle');
      if (!b) return;
      const key = b.dataset.key;
      // Never let both series go dark — an empty axis is not a state worth reaching.
      if (shown[key] && !shown[key === 'mean' ? 'country' : 'mean']) return;
      shown[key] = !shown[key];
      tempChart.series[key === 'mean' ? 0 : 1].setVisible(shown[key], true);
      paintToggles();
    });
  }

  // Country pills choose which country the second series traces.
  const pillRow = document.getElementById('temp-countries');
  if (pillRow) {
    pillRow.innerHTML = countryList
      .map((c) => `<button class="pill-button${c === activeCountry ? ' active' : ''}" data-country="${c}">${c}</button>`)
      .join('');
    pillRow.addEventListener('click', (e) => {
      const b = e.target.closest('.pill-button');
      if (!b) return;
      activeCountry = b.dataset.country;
      pillRow.querySelectorAll('.pill-button').forEach((x) => x.classList.toggle('active', x === b));
      tempChart.series[1].update({ name: activeCountry, data: D.sstByCountry[activeCountry].map((p) => p[1]) });
      if (!shown.country) { shown.country = true; tempChart.series[1].setVisible(true, true); }
      paintToggles();
    });
  }

  // ── 4. Sea level — regional mean only, with the rounding envelope drawn ────
  // The file is quantised to 0.1 m, so a country comparison is not available at
  // any zoom. The envelope makes the resolution visible instead of footnoting it.
  const seaYears = D.seaRegional.map((p) => p[0]);
  const seaVals = D.seaRegional.map((p) => p[1]);
  const m = slope(D.seaRegional);
  const midX = (seaYears[0] + seaYears[seaYears.length - 1]) / 2;
  const midY = seaVals.reduce((a, b) => a + b, 0) / seaVals.length;

  Highcharts.chart('chart-sea-level', {
    chart: baseChart({ type: 'area', height: 360 }),
    xAxis: {
      categories: seaYears.map(String), tickInterval: 3, lineWidth: 0, tickWidth: 0,
      labels: { ...AXIS_LABEL }, plotBands: ensoBands(seaYears),
    },
    yAxis: {
      title: { text: null }, gridLineColor: COLORS.grid,
      labels: { ...AXIS_LABEL, format: '{value:.2f}m' },
    },
    legend: { enabled: false },
    tooltip: { valueDecimals: 3, valueSuffix: ' m' },
    series: [
      {
        type: 'arearange', name: '±0.05 m rounding envelope', color: 'rgba(74,144,226,0.10)',
        lineWidth: 0, marker: { enabled: false }, enableMouseTracking: false, zIndex: 0,
        data: D.seaRegional.map((p) => [p[1] - 0.05, p[1] + 0.05]),
      },
      {
        type: 'area', name: 'Regional mean', step: 'left', color: COLORS.blue, lineWidth: 2, zIndex: 2,
        marker: { enabled: true, radius: 3, fillColor: COLORS.blue },
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, 'rgba(74,144,226,0.20)'], [1, 'rgba(74,144,226,0)']],
        },
        data: seaVals,
      },
      {
        type: 'line', name: `fitted trend +${D.seaTrendMm.toFixed(1)} mm/yr`,
        color: COLORS.ink, dashStyle: 'ShortDash', lineWidth: 1.5, zIndex: 3,
        marker: { enabled: false }, enableMouseTracking: false,
        data: seaYears.map((y) => midY + (y - midX) * m),
      },
    ],
  });

  // ── 5. Rainfall — fitted trend per territory, not a single year ───────────
  // The prose makes a trend claim, and one year of an anomaly series is weather.
  const rain = D.rainTrends;
  Highcharts.chart('chart-rainfall', {
    chart: baseChart({ type: 'bar', height: Math.max(360, rain.length * 26) }),
    xAxis: {
      categories: rain.map((r) => r.country + (r.atoll ? ' ◆' : '')),
      lineWidth: 0, tickWidth: 0, labels: { style: { fontSize: '11px' } },
    },
    yAxis: {
      title: { text: 'mm per decade', style: { fontSize: '10px', color: COLORS.light } },
      gridLineColor: COLORS.grid,
      labels: { ...AXIS_LABEL, format: '{value:+.0f}' },
      plotLines: [{ value: 0, color: '#ddd', width: 1.5, zIndex: 3 }],
    },
    legend: { enabled: false },
    tooltip: {
      useHTML: true,
      pointFormatter() {
        const r = rain[this.index];
        return `<b>${r.country}</b><br>${r.trend > 0 ? '+' : ''}${r.trend.toFixed(2)} mm/decade`
          + `<br>year-to-year SD ${r.sd.toFixed(1)} mm`
          + (r.atoll ? '<br><em style="color:#999">atoll state — rain-fed lens</em>' : '');
      },
    },
    plotOptions: { bar: { pointWidth: 10, borderWidth: 0 } },
    series: [{
      name: 'Trend',
      data: rain.map((r) => ({ y: r.trend, color: r.trend < 0 ? COLORS.red : COLORS.blue })),
    }],
  });

  // ── 6. Water access — urban/rural gap, and 2000→2022 change ───────────────
  function dumbbells(host, rows, cfg) {
    if (!host) return;
    const lo = Math.min(...rows.flatMap((r) => [cfg.a(r), cfg.b(r)]));
    const hi = Math.max(...rows.flatMap((r) => [cfg.a(r), cfg.b(r)]));
    const pct = (v) => ((v - lo) / (hi - lo || 1)) * 100;
    host.innerHTML = rows.map((r) => {
      const a = cfg.a(r), b = cfg.b(r);
      const left = Math.min(pct(a), pct(b)), right = 100 - Math.max(pct(a), pct(b));
      const v = cfg.value(r);
      return `<div class="dumbbell-row">
        <div class="dumbbell-label">${r.country}</div>
        <div class="dumbbell-track">
          <div class="dumbbell-line" style="left:${left}%;right:${right}%"></div>
          <div class="dumbbell-dot ${cfg.dotA(r)}" style="left:${pct(a)}%" title="${cfg.titleA(r)}"></div>
          <div class="dumbbell-dot ${cfg.dotB(r)}" style="left:${pct(b)}%" title="${cfg.titleB(r)}"></div>
        </div>
        <div class="dumbbell-value ${v.cls}">${v.text}</div>
      </div>`;
    }).join('');
  }

  dumbbells(document.getElementById('dumbbell-gap'), D.waterGaps, {
    a: (r) => r.rural, b: (r) => r.urban,
    dotA: () => 'dot-orange', dotB: () => 'dot-blue',
    titleA: (r) => `rural ${r.rural.toFixed(1)}%`,
    titleB: (r) => `urban ${r.urban.toFixed(1)}%`,
    value: (r) => ({ text: `${r.gap.toFixed(0)}pt`, cls: r.gap >= 20 ? 'value-red' : 'text-muted' }),
  });

  dumbbells(document.getElementById('dumbbell-change'), D.waterChange, {
    a: (r) => r.start, b: (r) => r.end,
    dotA: (r) => (r.change < 0 ? 'dot-red' : 'dot-grey'),
    dotB: (r) => (r.change < 0 ? 'dot-grey' : 'dot-blue'),
    titleA: (r) => `${r.firstYear}: ${r.start.toFixed(1)}%`,
    titleB: (r) => `${r.lastYear}: ${r.end.toFixed(1)}%`,
    value: (r) => ({
      text: `${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}pt`,
      cls: r.change < 0 ? 'value-red' : 'value-blue',
    }),
  });

  // ── 7. The map — one bubble per country, scrubbed by year ─────────────────
  await buildMap(D);

  // ── 8. Figures quoted in the prose, computed rather than typed ────────────
  // Every number the copy asserts is looked up here. If a series is missing the
  // span keeps its em dash, so a broken load reads as broken rather than as a
  // plausible wrong figure.
  const fmtList = (xs) => (xs.length < 2 ? xs.join('')
    : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const signed = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '\u2212' : ''}${Math.abs(v).toFixed(d)}`;

  // emissions
  const ghg = (c) => D.ghgLatest.find((g) => g.country === c);
  const ghgAt = (c) => { const g = ghg(c); return g ? g.val.toFixed(1) : null; };
  setText('#fig-ghg-below4', D.ghgTrustedBelow4);
  setText('#fig-ghg-trusted', D.ghgTrustedCount);
  setText('#fig-ghg-suspect', D.ghgTotalCount - D.ghgTrustedCount);
  for (const [id, c] of [['kiribati', 'Kiribati'], ['solomon', 'Solomon Islands'],
    ['tuvalu', 'Tuvalu'], ['newcaledonia', 'New Caledonia']]) {
    const v = ghgAt(c);
    if (v !== null) setText(`#fig-ghg-${id}`, v);
  }
  const palau = D.ghgByYear['Palau'];
  if (palau) {
    const ys = Object.keys(palau).map(Number).sort((a, b) => a - b);
    setText('#fig-ghg-palau-first', palau[ys[0]].toFixed(1));
    setText('#fig-ghg-palau-firstyear', ys[0]);
    setText('#fig-ghg-palau-last', palau[ys[ys.length - 1]].toFixed(1));
    setText('#fig-ghg-palau-lastyear', ys[ys.length - 1]);
  }
  // The flat series are the suspect ones other than Palau, whose problem is the
  // opposite: an impossible magnitude rather than an impossible constancy.
  const flat = D.ghgLatest.filter((g) => g.suspect && g.country !== 'Palau').map((g) => g.country);
  setText('#fig-ghg-flat', fmtList(flat));
  const flatSpan = flat.length && D.ghgByYear[flat[0]] ? Object.keys(D.ghgByYear[flat[0]]).length : null;
  if (flatSpan) setText('#fig-ghg-flatspan', flatSpan);

  // sea-surface temperature
  setText('#fig-sst-territories', D.sstTerritories);
  setText('#fig-sst-span', `${D.sstYears[0]} to ${D.sstYears[1]}`);
  setText('#fig-sst-record', `${D.sstYears[1] - D.sstYears[0] + 1}-year`);
  setText('#fig-top10', fmtList(D.top10.map(String)));
  setText('#fig-sst-baseline', signed(D.sstMeanBaseline, 2));
  setText('#fig-sst-recent', signed(D.sstMeanRecent, 2));
  setText('#fig-sst-preind', signed(D.sstPreIndustrial, 2));

  // sea level
  setText('#fig-sea-trend', D.seaTrendMm.toFixed(1));
  setText('#fig-sea-territories', D.seaTerritories);
  setText('#fig-sea-span', `${D.seaYears[0]}\u2013${D.seaYears[1]}`);

  // rainfall
  const withTrend = (r) => `${r.country} (${signed(r.trend, 1)} mm per decade)`;
  setText('#fig-rain-total', D.rainTrends.length);
  setText('#fig-rain-span', `${D.rainYears[0]}\u2013${D.rainYears[1]}`);
  setText('#fig-rain-drying', D.rainDrying);
  setText('#fig-rain-wetting', D.rainWetting);
  setText('#fig-rain-driest', fmtList(D.rainTrends.slice(0, 4).map(withTrend)));
  setText('#fig-rain-wettest', fmtList(D.rainTrends.slice(-4).reverse().map(withTrend)));
  const rainSd = (c) => (D.rainTrends.find((r) => r.country === c) || {}).sd;
  if (rainSd('Nauru') != null) setText('#fig-rain-nauru-sd', rainSd('Nauru').toFixed(1));
  if (rainSd('New Caledonia') != null) setText('#fig-rain-nc-sd', rainSd('New Caledonia').toFixed(1));

  // water access
  const chg = (c) => D.waterChange.find((r) => r.country === c);
  const gapOf = (c) => D.waterGaps.find((r) => r.country === c);
  const ki = chg('Kiribati'), kiGap = gapOf('Kiribati');
  if (ki) { setText('#fig-water-ki-start', ki.start.toFixed(1)); setText('#fig-water-ki-end', ki.end.toFixed(1)); }
  if (kiGap) setText('#fig-water-ki-gap', kiGap.gap.toFixed(1));
  const widest = D.waterGaps[0];
  if (widest) {
    setText('#fig-water-widest', widest.country);
    setText('#fig-water-widest-gap', widest.gap.toFixed(1));
    const nat = chg(widest.country);
    if (nat) setText('#fig-water-widest-national', nat.end.toFixed(1));
  }
  if (gapOf('Vanuatu')) setText('#fig-water-vu-gap', gapOf('Vanuatu').gap.toFixed(1));
  if (gapOf('Fiji')) setText('#fig-water-fj-gap', gapOf('Fiji').gap.toFixed(1));
  const decliners = D.waterChange.filter((r) => r.change < 0);
  setText('#fig-water-decliner-count', decliners.length);
  setText('#fig-water-decliners',
    fmtList(decliners.map((r) => `${r.country} (${signed(r.change, 1)} points)`)));
})();

async function buildMap(D) {
  const host = document.getElementById('chart-sst-map');
  if (!host || typeof Highcharts.mapChart !== 'function') return;

  let topology;
  try {
    topology = await fetch('https://code.highcharts.com/mapdata/custom/world.topo.json').then((r) => r.json());
  } catch (e) {
    host.classList.add('pending');
    host.style.minHeight = '';
    host.innerHTML = '<div><p class="pending-title">Map topology did not load</p>'
      + '<p class="pending-body">The world outline is fetched from the Highcharts map CDN. '
      + 'Nothing else on this page depends on it — the temperature figures above are '
      + 'computed from the same series the map would draw.</p></div>';
    return;
  }

  const YEAR_MIN = 1985, YEAR_MAX = 2025;
  const valueAt = (series, year) => (series.find((p) => p[0] === year) || [])[1] ?? null;
  const bubbles = (year) => D.mapCountries.map((c) => {
    const v = valueAt(c.series, year) ?? 0;
    return {
      lat: c.lat, lon: c.lon, name: c.name, colorValue: v,
      z: 6 + Math.min(Math.abs(v), 1.5) * 14,
    };
  });

  const chart = Highcharts.mapChart(host, {
    chart: { backgroundColor: 'transparent', animation: false, height: 520 },
    mapView: { projection: { name: 'EqualEarth', rotation: [-180] }, center: [180, -8], zoom: 2.6 },
    mapNavigation: { enabled: true, buttonOptions: { verticalAlign: 'bottom' } },
    colorAxis: {
      min: -1.3, max: 1.3,
      stops: [[0, COLORS.blue], [0.5, '#F4F1EA'], [1, COLORS.red]],
      labels: { format: '{value:+.1f}°C', style: { fontSize: '10px', color: COLORS.light } },
    },
    legend: { enabled: false },
    series: [
      {
        type: 'map', mapData: topology, nullColor: '#E8E4DA',
        borderColor: '#C9C2B4', borderWidth: 0.6,
        enableMouseTracking: false, showInLegend: false,
      },
      {
        type: 'mapbubble', id: 'temp', name: 'ST anomaly', data: bubbles(YEAR_MAX),
        minSize: 6, maxSize: 26, marker: { lineWidth: 1, lineColor: 'rgba(25,25,25,0.3)' },
        tooltip: {
          pointFormatter() {
            return `<b>${this.name}</b><br>${this.colorValue > 0 ? '+' : ''}${this.colorValue.toFixed(2)}°C`;
          },
        },
      },
    ],
  });

  // Year scrubber wired to the existing markup.
  const track = document.querySelector('.timeline-track');
  const fill = document.querySelector('.timeline-fill');
  const handle = document.querySelector('.timeline-handle');
  const playBtn = document.querySelector('.map-ui .play-btn');
  const yearLabel = document.querySelector('.map-ui-year');
  let year = YEAR_MAX, timer = null;

  function render() {
    chart.get('temp').setData(bubbles(year), true, { duration: 350 });
    const pct = ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100;
    if (fill) fill.style.width = `${pct}%`;
    if (handle) handle.style.left = `${pct}%`;
    if (yearLabel) yearLabel.textContent = year;
  }

  function stop() {
    clearInterval(timer); timer = null;
    if (playBtn) playBtn.classList.remove('playing');
  }

  if (track) {
    const seek = (clientX) => {
      const r = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      year = Math.round(YEAR_MIN + t * (YEAR_MAX - YEAR_MIN));
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
      if (year >= YEAR_MAX) year = YEAR_MIN;
      playBtn.classList.add('playing');
      timer = setInterval(() => {
        year = year >= YEAR_MAX ? YEAR_MIN : year + 1;
        render();
      }, 380);
    });
  }
  render();
}
