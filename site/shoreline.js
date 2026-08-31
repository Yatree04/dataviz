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

import { COORDS, countryName, COLORS } from './data.js';

const RETREAT = '#C1362F';   // metres lost per year
const ACCRETE = '#2A78D6';   // metres gained per year
const MID = '#F7F4ED';
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
    rows[iso] = {
      rate,
      from: iA >= 0 ? c[iA] : null,
      to: iB >= 0 ? c[iB] : null,
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
  const withData = layout.filter((d) => rates[d.iso]);

  // Symmetric about zero, scaled to the largest real rate present, so the
  // midpoint is genuinely no change rather than the middle of the data.
  const peak = withData.length
    ? Math.max(...withData.map((d) => Math.abs(rates[d.iso].rate))) || 1
    : 1;

  const data = layout.map((d) => {
    const rec = rates[d.iso];
    return {
      x: d.x, y: d.y, iso: d.iso, name: countryName(d.iso),
      value: rec ? rec.rate : null,
      rec: rec || null,
      color: rec ? undefined : NO_DATA,
      borderColor: rec ? 'rgba(25,25,25,0.25)' : NO_DATA_EDGE,
      dashStyle: rec ? 'Solid' : 'ShortDash',
    };
  });

  Highcharts.chart(host, {
    chart: {
      type: 'tilemap', inverted: true, backgroundColor: 'transparent',
      height: 420, style: { fontFamily: 'Inter, sans-serif' }, spacing: [4, 4, 4, 4],
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: { visible: false },
    yAxis: { visible: false },
    colorAxis: {
      min: -peak, max: peak,
      startOnTick: false, endOnTick: false,
      stops: [[0, RETREAT], [0.5, MID], [1, ACCRETE]],
    },
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
        if (!this.rec) return '';
        const r = this.rec;
        const sign = r.rate > 0 ? '+' : r.rate < 0 ? '−' : '';
        return `<span class="tt-name">${this.name}</span><br>`
          + `<span class="tt-val">${sign}${Math.abs(r.rate).toFixed(2)} m/year</span> `
          + `<span class="tt-ref">${r.rate < 0 ? 'retreat' : r.rate > 0 ? 'accretion' : 'no change'}</span><br>`
          + (r.from && r.to ? `<span class="tt-ref">${r.from}–${r.to}</span>` : '')
          + (r.n !== null ? `<span class="tt-ref"> · ${r.n.toLocaleString()} transects</span>` : '');
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
          style: { fontSize: '10px', fontWeight: '500', textOutline: 'none', color: '#3A2D2D' },
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

  if (note) {
    const n = withData.length;
    note.innerHTML = n
      ? `<span id="fig-shore-n">${n}</span> of ${layout.length} territories carry a rate in `
        + `<code>data/shoreline_rates.csv</code>; the rest are drawn unavailable, not zero.`
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
