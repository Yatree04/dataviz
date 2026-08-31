// site/main.js
// Every chart on this page is built from the real SPC CSVs loaded in data.js.
// Where a quantity cannot carry the weight the prose puts on it, the chart says
// so rather than drawing a smoother line than the data supports.

import { loadData, COLORS, ENSO_EVENTS, slope } from './data.js';
import { buildSSTMap } from './sstmap.js';

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
      { name: 'Pacific countries mean', color: COLORS.primary, data: D.sstRegional.map((p) => p[1]), zIndex: 2 },
      { name: activeCountry, color: COLORS.accent, data: D.sstByCountry[activeCountry].map((p) => p[1]), zIndex: 1 },
    ],
  });

  // Exactly the two toggles the design draws: the regional mean and the
  // Marshall Islands.
  const toggleRow = document.getElementById('temp-toggles');
  const shown = { mean: true, country: true };

  function paintToggles() {
    if (!toggleRow) return;
    toggleRow.innerHTML = `
      <button class="toggle" data-key="mean" data-on="${shown.mean}">
        <span class="swatch"></span>Pacific countries mean
      </button>
      <button class="toggle" data-key="country" data-on="${shown.country}">
        <span class="swatch"></span>${activeCountry}
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

  // ── 7. The map — Pacific overview, drilling into one territory ────────────
  await buildSSTMap(D);

  // ── 8. Figures quoted in the prose, computed rather than typed ────────────
  // Every number the copy asserts is looked up here. If a series is missing the
  // span keeps its em dash, so a broken load reads as broken rather than as a
  // plausible wrong figure.
  const fmtList = (xs) => (xs.length < 2 ? xs.join('')
    : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const signed = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '\u2212' : ''}${Math.abs(v).toFixed(d)}`;

  // The copy spells small counts out, so the computed ones are spelled too —
  // otherwise the figures read as numerals in prose written for words.
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  const words = (n) => {
    if (n < 20) return ONES[n];
    if (n > 99) return String(n);
    const t = TENS[Math.floor(n / 10)], o = n % 10;
    return o ? `${t}-${ONES[o]}` : t;
  };

  // Country names as the prose writes them, which is not always how the data
  // file spells them.
  const prose = (c) => ({ 'Wallis & Futuna': 'Wallis and Futuna', 'Solomon Islands': 'the Solomon Islands' })[c] || c;

  // The copy states the unit once, on the first item, and leaves the rest bare.
  const unitList = (rows, value, unit, join = 'and') => rows.map((r, i) => {
    const v = `${value(r)}${i === 0 ? ` ${unit}` : ''}`;
    return `${prose(r.country)} (${v})`;
  }).reduce((acc, x, i, a) => i === 0 ? x
    : i === a.length - 1 && join ? `${acc} ${join} ${x}` : `${acc}, ${x}`, '');

  // emissions
  const ghg = (c) => D.ghgLatest.find((g) => g.country === c);
  const ghgAt = (c) => { const g = ghg(c); return g ? g.val.toFixed(1) : null; };
  setText('#fig-ghg-below4', cap(words(D.ghgTrustedBelow4)));
  setText('#fig-ghg-trusted', words(D.ghgTrustedCount));
  setText('#fig-ghg-suspect', cap(words(D.ghgTotalCount - D.ghgTrustedCount)));
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
  const flatSpan = flat.length && D.ghgByYear[flat[0]] ? Object.keys(D.ghgByYear[flat[0]]).length : null;
  if (flatSpan) setText('#fig-ghg-flatspan', words(flatSpan));

  // sea-surface temperature
  setText('#fig-sst-territories', words(D.sstTerritories));
  setText('#fig-sst-span', `${D.sstYears[0]} to ${D.sstYears[1]}`);
  setText('#fig-sst-record', `${D.sstYears[1] - D.sstYears[0] + 1}-year`);
  setText('#fig-top10', fmtList(D.top10.map(String)));
  setText('#fig-sst-baseline', signed(D.sstMeanBaseline, 2));
  setText('#fig-sst-recent', signed(D.sstMeanRecent, 2));
  setText('#fig-sst-preind', signed(D.sstPreIndustrial, 2));

  // sea level
  setText('#fig-sea-trend', D.seaTrendMm.toFixed(1));
  setText('#fig-sea-territories', words(D.seaTerritories));
  setText('#fig-sea-span', `${D.seaYears[0]}\u2013${D.seaYears[1]}`);

  // rainfall

  setText('#fig-rain-total', words(D.rainTrends.length));
  setText('#fig-rain-span', `${D.rainYears[0]}\u2013${D.rainYears[1]}`);
  setText('#fig-rain-drying', words(D.rainDrying));
  setText('#fig-rain-wetting', words(D.rainWetting));
  setText('#fig-rain-driest',
    unitList(D.rainTrends.slice(0, 4), (r) => signed(r.trend, 1), 'mm per decade'));
  setText('#fig-rain-wettest',
    unitList(D.rainTrends.slice(-4).reverse(), (r) => signed(r.trend, 1), 'mm per decade'));
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
  // Most-negative first, as the copy lists them.
  const decliners = D.waterChange.filter((r) => r.change < 0).sort((a, b) => a.change - b.change);
  setText('#fig-water-decliner-count', cap(words(decliners.length)));
  setText('#fig-water-decliners',
    unitList(decliners, (r) => signed(r.change, 1), 'points', null));
})();
