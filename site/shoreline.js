// site/shoreline.js
// Shoreline change as a Pacific tile map: one hexagon per territory.
//
// SOURCE. Digital Earth Pacific's `rates_of_change` layer. It is not in this
// repository: Mapping.qgz references ./dep_ls_coastlines_0-7-0-55.gpkg by
// relative path, and only the project file and its style database were
// committed. No CSV here carries a rate, shoreline, coast or transect column.
//
// So this panel reads data/shoreline_rates.csv and draws exactly what that file
// contains. Absent the file, every hexagon is drawn as unavailable — never as
// zero, and never with a filled-in number. The expected columns are:
//
//   iso,rate_m_per_year,period_start,period_end,n_transects
//
// one row per territory, iso being the ISO-3166 alpha-2 code the rest of this
// project uses. Rates are the mean of the real per-transect values for that
// territory; nothing is interpolated across territories that have none.
//
// The hexagon fill is CUMULATIVE DISPLACEMENT — how far the shoreline has moved
// in total over the reported window — derived as rate x (period_end -
// period_start). It is a restatement of two published columns, not a new
// measurement. A row that reports a rate but no window has no cumulative value
// and stays unavailable rather than being coloured from the rate alone, which
// would put two different units on one scale.

import { COORDS, countryName, COLORS } from './data.js';

// A small diverging bracket set, in the page's own palette, rather than a
// continuous ramp — closer in feel to the reference's data-class legend and
// easier to read at a glance than a gradient with no named steps.
const BRACKETS = [
  { max: -20, color: '#A32C25', label: '< \u221220 m' },
  { max: 0, color: '#D9887F', label: '\u221220\u20130 m' },
  { max: 20, color: '#8FB6DE', label: '0\u201320 m' },
  { max: Infinity, color: '#2A5D9C', label: '> 20 m' },
];
const NO_DATA = '#E4E2DE';
const NO_DATA_EDGE = '#B9B4AC';

/** Hex positions derived from each territory's real coordinates, so the layout
 *  is as traceable as the values. North to south, west to east, with the
 *  Pacific's antimeridian span unwrapped to 0-360 first. */
function hexLayout(isos) {
  const ROWS = 9, COLS = 13;
  const pts = isos
    .filter((iso) => COORDS[iso])
    .map((iso) => ({ iso, lat: COORDS[iso][0], lon: ((COORDS[iso][1] % 360) + 360) % 360 }));
  if (!pts.length) return [];
  const lons = pts.map((d) => d.lon), lats = pts.map((d) => d.lat);
  const lo = Math.min(...lons), hi = Math.max(...lons);
  const la = Math.min(...lats), lb = Math.max(...lats);
  const taken = new Set();

  // North first, then west, so the crowded equatorial band settles before the
  // outliers and collisions resolve outward from the true position.
  pts.sort((a, b) => (b.lat - a.lat) || (a.lon - b.lon));
  for (const d of pts) {
    const y0 = Math.round(((d.lon - lo) / (hi - lo || 1)) * (COLS - 1));
    const x0 = Math.round(((lb - d.lat) / (lb - la || 1)) * (ROWS - 1));
    let best = null;
    for (let r = 0; r < 14 && !best; r++) {
      for (let dx = -r; dx <= r && !best; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = x0 + dx, y = y0 + dy;
          if (x < 0 || y < 0 || x >= ROWS || y >= COLS) continue;
          if (!taken.has(`${x},${y}`)) { best = { x, y }; break; }
        }
      }
    }
    if (!best) continue;
    taken.add(`${best.x},${best.y}`);
    d.x = best.x; d.y = best.y;
  }

  // Drop bands nothing landed in, so the grid reads as a compact schematic
  // rather than an expanse of empty ocean. Relative order is preserved.
  const ux = [...new Set(pts.map((d) => d.x))].sort((a, b) => a - b);
  const uy = [...new Set(pts.map((d) => d.y))].sort((a, b) => a - b);
  const rx = Object.fromEntries(ux.map((v, i) => [v, i]));
  const ry = Object.fromEntries(uy.map((v, i) => [v, i]));
  return pts.map((d) => ({ iso: d.iso, x: rx[d.x], y: ry[d.y] }));
}

/** The published file, parsed strictly. A row without a finite rate is not a
 *  zero — it is dropped, and its territory stays unavailable. */
function parseRates(text) {
  const rows = {};
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return rows;
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const iIso = col('iso'), iRate = col('rate_m_per_year');
  if (iIso < 0 || iRate < 0) return rows;
  const iA = col('period_start'), iB = col('period_end'), iN = col('n_transects');
  for (const line of lines.slice(1)) {
    const c = line.split(',').map((v) => v.trim());
    const iso = c[iIso];
    const rate = Number(c[iRate]);
    if (!iso || !Number.isFinite(rate)) continue;
    const from = iA >= 0 && Number.isFinite(Number(c[iA])) ? Number(c[iA]) : null;
    const to = iB >= 0 && Number.isFinite(Number(c[iB])) ? Number(c[iB]) : null;
    const years = from !== null && to !== null ? to - from : null;
    rows[iso] = {
      rate, from, to, years,
      // total metres moved across the reported window
      cumulative: years !== null ? rate * years : null,
      n: iN >= 0 && Number.isFinite(Number(c[iN])) ? Number(c[iN]) : null,
    };
  }
  return rows;
}

export async function buildShorelineTilemap() {
  const host = document.getElementById('chart-shoreline');
  const note = document.getElementById('shoreline-note');
  if (!host || typeof Highcharts !== 'object') return;

  let rates = {};
  let loaded = false;
  try {
    const r = await fetch('data/shoreline_rates.csv');
    if (r.ok) { rates = parseRates(await r.text()); loaded = true; }
  } catch (e) { /* absent is a valid state, handled below */ }

  const isos = Object.keys(COORDS);
  const layout = hexLayout(isos);
  // Only territories whose row yields a cumulative displacement can be coloured.
  const withData = layout.filter((d) => rates[d.iso] && rates[d.iso].cumulative !== null);

  // Brackets scale to whatever cumulative range the real data spans, so the
  // legend always describes values actually on the map rather than a fixed
  // +-20 m guess that might not fit the loaded file.
  const mag = withData.length
    ? Math.max(20, ...withData.map((d) => Math.abs(rates[d.iso].cumulative)))
    : 20;
  const brackets = [
    { max: -mag / 2, color: BRACKETS[0].color, label: `< \u2212${(mag / 2).toFixed(0)} m` },
    { max: 0, color: BRACKETS[1].color, label: `\u2212${(mag / 2).toFixed(0)}\u20130 m` },
    { max: mag / 2, color: BRACKETS[2].color, label: `0\u2013${(mag / 2).toFixed(0)} m` },
    { max: Infinity, color: BRACKETS[3].color, label: `> ${(mag / 2).toFixed(0)} m` },
  ];
  const bracketOf = (v) => brackets.find((b) => v <= b.max) || brackets[brackets.length - 1];

  const data = layout.map((d) => {
    const rec = rates[d.iso];
    const has = rec && rec.cumulative !== null;
    return {
      x: d.x, y: d.y, iso: d.iso, name: countryName(d.iso),
      value: has ? rec.cumulative : null,
      rec: rec || null,
      color: has ? bracketOf(rec.cumulative).color : NO_DATA,
      borderColor: has ? 'rgba(255,255,255,0.85)' : NO_DATA_EDGE,
      dashStyle: has ? 'Solid' : 'ShortDash',
    };
  });

  Highcharts.chart(host, {
    chart: {
      type: 'tilemap', inverted: true, backgroundColor: 'transparent',
      height: 440, style: { fontFamily: 'Inter, sans-serif' }, spacing: [8, 8, 8, 8],
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: { visible: false },
    yAxis: { visible: false },
    colorAxis: { visible: false },
    tooltip: {
      useHTML: true, backgroundColor: 'rgba(255,255,255,0.97)',
      borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 4, shadow: false,
      style: { fontSize: '12px' },
      headerFormat: '',
      // A null point is not shown by pointFormatter at all, so the territories
      // with no rate need this one — otherwise an unavailable hexagon is silent
      // on hover, which is the opposite of marking it unavailable.
      nullFormatter() {
        return `<span class="tt-name">${this.name}</span><br>`
          + '<span class="tt-ref">no shoreline rate in this dataset</span>';
      },
      pointFormatter() {
        if (this.value == null) return '';
        const r = this.rec;
        const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
        const dir = r.cumulative < 0 ? 'retreat' : r.cumulative > 0 ? 'accretion' : 'no change';
        return `<span class="tt-name">${this.name}</span><br>`
          + `<span class="tt-val">${sign(r.cumulative)}${Math.abs(r.cumulative).toFixed(1)} m</span> `
          + `<span class="tt-ref">cumulative ${dir}, ${r.from}\u2013${r.to}</span><br>`
          + `<span class="tt-ref">${sign(r.rate)}${Math.abs(r.rate).toFixed(2)} m/year mean rate`
          + (r.n !== null ? ` · ${r.n.toLocaleString()} transects` : '') + '</span>';
      },
    },
    plotOptions: {
      series: {
        // Null points are inert by default, which would leave an unavailable
        // territory silent on hover. It has to be able to say it has no value.
        nullInteraction: true,
        states: { hover: { brightness: 0 }, inactive: { opacity: 1 } },
        borderWidth: 1,
        dataLabels: {
          enabled: true, format: '{point.iso}',
          style: { fontSize: '11px', fontWeight: '700', textOutline: '1px rgba(255,255,255,0.65)' },
        },
        point: {
          events: {
            click() {
              if (!this.rec) return;
              // Only offered where the source actually carries a detail layer.
              window.dispatchEvent(new CustomEvent('shoreline:select', {
                detail: { iso: this.iso, ...this.rec },
              }));
            },
          },
        },
      },
    },
    series: [{ name: 'Shoreline change', data }],
  });

  const keyHost = document.getElementById('shoreline-key');
  if (keyHost) {
    keyHost.innerHTML = withData.length
      ? brackets.map((b) => `<span class="dk"><i class="dk-dot" style="background:${b.color}"></i>${b.label}</span>`).join('')
        + `<span class="dk"><i class="dk-dot dk-dot--nodata"></i>no data</span>`
      : `<span class="dk"><i class="dk-dot dk-dot--nodata"></i>no data — every territory</span>`;
  }

  if (note) {
    const n = withData.length;
    note.innerHTML = n
      ? `<span id="fig-shore-n">${n}</span> of ${layout.length} territories carry a rate and a `
        + `reported window in <code>data/shoreline_rates.csv</code>, coloured by cumulative `
        + `displacement over that window; the rest are drawn unavailable, not zero.`
      : `No rate is drawn for any territory. Digital Earth Pacific&rsquo;s `
        + `<code>rates_of_change</code> layer is not in this repository — `
        + `<code>Mapping.qgz</code> points at <code>dep_ls_coastlines_0-7-0-55.gpkg</code> `
        + `by relative path, and only the project file was committed. Export that layer&rsquo;s `
        + `per-territory means to <code>site/data/shoreline_rates.csv</code> as `
        + `<code>iso,rate_m_per_year,period_start,period_end,n_transects</code> and every `
        + `hexagon below fills from it. Until then each one says it has no value, `
        + `because it does not.`;
  }
  return { placed: layout.length, withData: withData.length, loaded };
}
