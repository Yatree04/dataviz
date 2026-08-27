// js/data.js
// Loads and cleans the RAW SPC CSVs directly from your repo — no pre-baked JSON.
// This is the authentic path: provenance is visible, the cleaning is reproducible,
// and a juror can see you worked from the official files.
//
// Handles the two gotchas in the SPC exports:
//   1. Duplicate/paired columns (code + human label). d3.csvParse keeps the LAST of a
//      duplicated name, but these files use DISTINCT names (INDICATOR vs Indicator), so
//      we address columns by their exact code-name.
//   2. Trap data: only VC_DSR_AFFCT is clean in affected_people; drinking_water is excluded.
//      See BUILD_BRIEF §2.
//
// Expects the CSVs at repo-root paths below. Adjust FILES if your folder differs.

const FILES = {
  climate: 'data/sea_temp.csv',        // DF_CLIMATE_CHANGE — 13 indicators incl. GHG_EMI_CAPITA
  affected: 'data/affected_people.csv',
  // drinking_water intentionally NOT loaded — series are survey artifacts (BUILD_BRIEF §2)
};

// full-name lookup so charts show readable labels
const NAMES = {
  AS:'American Samoa', CK:'Cook Islands', FJ:'Fiji', FM:'Micronesia', GU:'Guam',
  KI:'Kiribati', MH:'Marshall Islands', MP:'N. Mariana Is', NC:'New Caledonia',
  NR:'Nauru', NU:'Niue', PF:'French Polynesia', PG:'Papua New Guinea', PN:'Pitcairn',
  PW:'Palau', SB:'Solomon Islands', TK:'Tokelau', TO:'Tonga', TV:'Tuvalu',
  VU:'Vanuatu', WF:'Wallis & Futuna', WS:'Samoa',
};
export const countryName = iso => NAMES[iso] || iso;

// indicators we surface (ENV_TAXES and money indicators deliberately omitted)
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
// columns used: CLIMATE_CHANGE_INDICATORS (7), GEO_PICT (9), TIME_PERIOD (11), OBS_VALUE (13)
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
    const name = countryName(iso);
    (out[ind][name] ||= []).push([year, +val.toFixed(3)]);
  }

  // sort each series by year; add regional mean for anomaly indicators
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
    .map(([y, [sum, n]]) => [y, +(sum / n).toFixed(3)])
    .sort((a, b) => a[0] - b[0]);
}

// ── affected_people parser (CLEAN: VC_DSR_AFFCT only) ───────────────────────
// columns: INDICATOR (7), GEO_PICT (9), TIME_PERIOD (27), OBS_VALUE (29)
// This file's rows are already totals (all breakdown dims = '_T'), so no de-dup needed.
// The guard below stays as a safety net in case SPC adds breakdowns in a future export.
function parseAffected(text) {
  const rows = d3.csvParse(text);
  const events = [];
  for (const r of rows) {
    if (r.INDICATOR !== 'VC_DSR_AFFCT') continue;              // the only clean indicator
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
