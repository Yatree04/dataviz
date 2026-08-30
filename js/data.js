// js/data.js
// Loads and cleans the RAW SPC CSVs directly from the repo — no pre-baked JSON.
//
// CHANGES IN THIS REVISION
//   1. ERROR_VAL / ERROR_TYPE are now parsed. The SPC export ships a standard error
//      for ST_ANOM and SST_ANOM (median 0.1 °C, still ~0.09 °C in 2020). Ignoring it
//      while drawing 2-decimal tooltips was false precision. Series are now
//      [year, value, se] triples; charts that only destructure [year, value] keep working.
//   2. Baseline constants are declared here, from the SPC metadata, so no chart can
//      silently print the wrong one. SST/ST are vs 1971–2000 (NOAAGlobalTemp v6.0.0),
//      NOT vs 1850–1900. SEA_LVL is vs 1993–2012 (Copernicus DUACS DT2024).
//   3. ENSO_EVENTS and BLEACHING_EVENTS are exported. Almost all interannual structure
//      in Pacific SST, sea level and rainfall is ENSO. Charts annotate it rather than
//      letting the reader attribute it to the emissions trend.
//   4. trailingMean() lets the rainfall beat make a trend claim from a trend statistic
//      instead of from a single year's bar.
//   5. SUSPECT_GHG flags per-capita series that are export artifacts, not footprints.

const FILES = {
  climate: 'data/sea_temp.csv',        // DF_CLIMATE_CHANGE — all indicators
  affected: 'data/affected_people.csv',
  // drinking_water intentionally NOT loaded — series are survey artifacts (BUILD_BRIEF §2)
};

// ── Baselines, taken verbatim from the SPC indicator metadata ───────────────
// Printing these on axes is the whole point of declaring them once.
export const BASELINES = {
  ST_ANOM: '1971–2000',
  SST_ANOM: '1971–2000',
  SEA_LVL: '1993–2012',
  RAIN_ANOM: '1981–2010',   // shown only where the metadata is quoted alongside
};

export const SOURCE_NOTES = {
  SST_ANOM: 'NOAAGlobalTemp v6.0.0, 5° × 5° native resolution, spatially averaged per EEZ.',
  ST_ANOM: 'NOAAGlobalTemp v6.0.0 land component. Over atoll EEZs this shares grid cells with ' +
    'the ocean field and is not an independent land measurement.',
  SEA_LVL: 'Copernicus DUACS DT2024 satellite altimetry, annual mean per EEZ.',
  GHG_EMI_CAPITA: 'World Bank EN.GHG.ALL.PC.CE.AR5. Per SPC metadata this series measures ' +
    'CO₂ only, not all six Kyoto gases, despite the GHG label.',
};

// ── ENSO: the dominant mode of Pacific interannual variability ──────────────
// Restricted to events that are uncontroversial in the literature. Used as
// annotation only — never as a fitted or derived quantity.
export const ENSO_EVENTS = [
  { start: 1982, end: 1983, phase: 'el-nino', label: 'El Niño 1982–83' },
  { start: 1991, end: 1992, phase: 'el-nino', label: 'El Niño 1991–92' },
  { start: 1997, end: 1998, phase: 'el-nino', label: 'El Niño 1997–98' },
  { start: 2015, end: 2016, phase: 'el-nino', label: 'El Niño 2015–16' },
  { start: 1988, end: 1989, phase: 'la-nina', label: 'La Niña 1988–89' },
  { start: 2010, end: 2011, phase: 'la-nina', label: 'La Niña 2010–11' },
  { start: 2020, end: 2022, phase: 'la-nina', label: 'La Niña 2020–22' },
];

// Global mass bleaching events, as listed in the GCRMN Pacific report.
export const BLEACHING_EVENTS = [
  { start: 1998, end: 1998, label: '1st global event' },
  { start: 2010, end: 2010, label: '2nd global event' },
  { start: 2014, end: 2017, label: '3rd global event' },
  { start: 2023, end: 2024, label: '4th global event' },
];

// GHG per-capita series that are implausible on their face and should be flagged,
// not explained. Palau starts at 190.6 t/capita in 1970 and falls ~60% while tourism
// grows — that shape is a denominator/bunkering artifact. Nauru, Guam, Marshall Is,
// N. Mariana Is and American Samoa sit at a flat 0.1 for decades, which is a coverage
// failure rather than a measurement.
export const SUSPECT_GHG = new Set([
  'Palau', 'Nauru', 'Guam', 'Marshall Islands', 'N. Mariana Is', 'American Samoa',
]);

const NAMES = {
  AS: 'American Samoa', CK: 'Cook Islands', FJ: 'Fiji', FM: 'Micronesia', GU: 'Guam',
  KI: 'Kiribati', MH: 'Marshall Islands', MP: 'N. Mariana Is', NC: 'New Caledonia',
  NR: 'Nauru', NU: 'Niue', PF: 'French Polynesia', PG: 'Papua New Guinea', PN: 'Pitcairn',
  PW: 'Palau', SB: 'Solomon Islands', TK: 'Tokelau', TO: 'Tonga', TV: 'Tuvalu',
  VU: 'Vanuatu', WF: 'Wallis & Futuna', WS: 'Samoa',
};
export const countryName = iso => NAMES[iso] || iso;

const CLIMATE_INDICATORS = ['ST_ANOM', 'SST_ANOM', 'SEA_LVL', 'RAIN_ANOM', 'GHG_EMI_CAPITA'];

export async function loadData() {
  const [climateRaw, affectedRaw] = await Promise.all([
    d3.text(FILES.climate),
    d3.text(FILES.affected),
  ]);
  const climate = parseClimate(climateRaw);
  const affected = parseAffected(affectedRaw);
  return { climate, affected, countryName };
}

// ── DF_CLIMATE_CHANGE parser ───────────────────────────────────────────────
function parseClimate(text) {
  const rows = d3.csvParse(text);
  const out = {};
  for (const ind of CLIMATE_INDICATORS) out[ind] = {};

  for (const r of rows) {
    const ind = r.CLIMATE_CHANGE_INDICATORS;
    if (!out[ind]) continue;
    const iso = r.GEO_PICT;
    const year = +r.TIME_PERIOD;
    const val = +r.OBS_VALUE;
    if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;

    // ERROR_TYPE is 'SE' for the temperature indicators; blank elsewhere.
    const seRaw = r.ERROR_VAL;
    const se = (r.ERROR_TYPE === 'SE' && seRaw !== '' && Number.isFinite(+seRaw))
      ? +seRaw : null;

    const name = countryName(iso);
    (out[ind][name] ||= []).push([year, +val.toFixed(3), se]);
  }

  for (const ind of CLIMATE_INDICATORS) {
    for (const name of Object.keys(out[ind])) out[ind][name].sort((a, b) => a[0] - b[0]);
    if (['ST_ANOM', 'SST_ANOM', 'RAIN_ANOM'].includes(ind)) {
      out[ind].__REGIONAL_MEAN__ = regionalMean(out[ind]);
    }
  }
  return out;
}

function regionalMean(series) {
  const byYear = new Map();
  for (const [name, pts] of Object.entries(series)) {
    if (name.startsWith('__')) continue;
    for (const [y, v] of pts) {
      const b = byYear.get(y) || [0, 0];
      byYear.set(y, [b[0] + v, b[1] + 1]);
    }
  }
  return [...byYear.entries()]
    .map(([y, [sum, n]]) => [y, +(sum / n).toFixed(3), null])
    .sort((a, b) => a[0] - b[0]);
}

// ── Trend helpers ──────────────────────────────────────────────────────────
// A single year of a noisy anomaly series is weather. These give the beat text
// something it can honestly call a tendency.

/** Mean of the last `n` observations of a [year, value, se] series. */
export function trailingMean(pts, n = 10) {
  if (!Array.isArray(pts) || !pts.length) return null;
  const tail = pts.slice(-n);
  return {
    value: tail.reduce((s, p) => s + p[1], 0) / tail.length,
    from: tail[0][0],
    to: tail[tail.length - 1][0],
    n: tail.length,
  };
}

/** Ordinary least-squares slope per decade, for captions that quote a rate. */
export function slopePerDecade(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den === 0 ? null : (num / den) * 10;
}

// ── affected_people parser (CLEAN: VC_DSR_AFFCT only) ───────────────────────
function parseAffected(text) {
  const rows = d3.csvParse(text);
  const events = [];
  for (const r of rows) {
    if (r.INDICATOR !== 'VC_DSR_AFFCT') continue;
    const isTotal = ['SEX', 'AGE', 'URBANIZATION', 'INCOME', 'EDUCATION', 'OCCUPATION', 'DISABILITY']
      .every(k => !r[k] || r[k] === '_T');
    if (!isTotal) continue;
    const iso = r.GEO_PICT, year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
    if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;
    events.push({ iso, country: countryName(iso), year, affected: Math.round(val) });
  }
  events.sort((a, b) => b.affected - a.affected);
  return events;
}
