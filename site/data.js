// site/data.js
// Loads and parses the raw SPC CSVs at runtime. Every figure on the page is
// computed here from the source file — nothing is hand-typed, so copy and
// chart cannot drift apart.

export const COLORS = {
  red: '#D95F52',
  blue: '#4A90E2',
  gold: '#F0AD4E',
  accent: '#E8833A',
  primary: '#2A78D6',
  ink: '#191919',
  muted: '#666666',
  light: '#999999',
  grid: '#f0f0f0',
};

const NAMES = {
  AS: 'American Samoa', CK: 'Cook Islands', FJ: 'Fiji', FM: 'Micronesia', GU: 'Guam',
  KI: 'Kiribati', MH: 'Marshall Islands', MP: 'N. Mariana Is', NC: 'New Caledonia',
  NR: 'Nauru', NU: 'Niue', PF: 'French Polynesia', PG: 'Papua New Guinea', PN: 'Pitcairn',
  PW: 'Palau', SB: 'Solomon Islands', TK: 'Tokelau', TO: 'Tonga', TV: 'Tuvalu',
  VU: 'Vanuatu', WF: 'Wallis & Futuna', WS: 'Samoa',
};
export const countryName = (iso) => NAMES[iso] || iso;

// Low-lying atoll states: no rivers, no highland catchment. Fresh water sits in
// a lens recharged by rain alone, which is why the rainfall and freshwater
// beats are the same argument.
export const ATOLL_STATES = new Set([
  'Kiribati', 'Tuvalu', 'Marshall Islands', 'Tokelau', 'Nauru', 'Micronesia',
]);

// GHG per-capita series that fail a plausibility check. Palau is recorded at
// 190.6 t/capita in 1970, falling ~60% while tourism grows — a bunkering or
// denominator artifact rather than a footprint. The rest sit at a flat 0.1–0.2
// for five decades, which is a coverage failure, not a measurement.
export const SUSPECT_GHG = {
  Palau: '190.6 t/capita in 1970 — four times any national figure recorded anywhere',
  Nauru: 'flat 0.1–0.2 t for 55 consecutive years',
  Guam: 'flat 0.1–0.2 t for 55 consecutive years',
  'Marshall Islands': 'flat 0.1–0.2 t for 55 consecutive years',
  'N. Mariana Is': 'flat 0.1–0.2 t for 55 consecutive years',
  'American Samoa': 'flat 0.1–0.2 t for 55 consecutive years',
};

// Restricted to events uncontroversial in the literature. Annotation only —
// never a fitted or derived quantity.
export const ENSO_EVENTS = [
  { start: 1982, end: 1983, phase: 'el-nino' },
  { start: 1991, end: 1992, phase: 'el-nino' },
  { start: 1997, end: 1998, phase: 'el-nino' },
  { start: 2015, end: 2016, phase: 'el-nino' },
  { start: 2023, end: 2024, phase: 'el-nino' },
  { start: 1988, end: 1989, phase: 'la-nina' },
  { start: 2010, end: 2011, phase: 'la-nina' },
  { start: 2020, end: 2022, phase: 'la-nina' },
];

export const COORDS = {
  WF: [-13.2823, -176.1745], SB: [-9.428, 159.9498], CK: [-21.2078, -159.775],
  TK: [-9.3809, -171.2158], FJ: [-18.1416, 178.4419], NC: [-22.2758, 166.4581],
  MH: [7.1164, 171.1858], PN: [-25.0667, -130.1], PF: [-17.5516, -149.5585],
  MP: [15.1778, 145.7508], GU: [13.4443, 144.7937], PW: [7.5006, 134.6242],
  VU: [-17.7333, 168.3273], TO: [-21.1393, -175.2049], FM: [6.9248, 158.1611],
  AS: [-14.2756, -170.7025], NU: [-19.0554, -169.918], NR: [-0.5477, 166.9209],
  KI: [1.3382, 172.9716], TV: [-8.5211, 179.1983], PG: [-9.4438, 147.1803],
  WS: [-13.8506, -171.7513],
};

// ── CSV parsing ─────────────────────────────────────────────────────────────

/**
 * Split one CSV line, honouring double-quoted fields that contain commas.
 * 755 rows in sea_temp.csv carry the country name
 * "Micronesia, Federated State of" — a naive split(',') shifts every later
 * column, so Micronesia's year and value get read from the wrong fields and the
 * country silently disappears from every derived statistic.
 */
function splitCSVLine(line) {
  const out = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = splitCSVLine(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

// ── maths ───────────────────────────────────────────────────────────────────

/** Ordinary least squares slope of y on x. */
export function slope(pts) {
  const n = pts.length;
  if (n < 3) return 0;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const d = n * sxx - sx * sx;
  return d === 0 ? 0 : (n * sxy - sx * sy) / d;
}

function stdev(v) {
  const n = v.length;
  if (n < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
}

function regionalMean(series) {
  const byYear = new Map();
  for (const pts of Object.values(series)) {
    for (const [y, v] of pts) {
      const b = byYear.get(y) || [0, 0];
      byYear.set(y, [b[0] + v, b[1] + 1]);
    }
  }
  return [...byYear.entries()]
    .map(([y, [s, n]]) => [y, s / n])
    .sort((a, b) => a[0] - b[0]);
}

const meanOver = (series, lo, hi) => {
  const v = series.filter((p) => p[0] >= lo && p[0] <= hi).map((p) => p[1]);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

const isTotal = (r) =>
  ['SEX', 'AGE', 'URBANIZATION', 'INCOME', 'EDUCATION', 'OCCUPATION', 'DISABILITY']
    .every((k) => !r[k] || r[k] === '_T');

// ── loader ──────────────────────────────────────────────────────────────────

export async function loadData() {
  const [climateText, affectedText, waterText] = await Promise.all([
    fetch('data/sea_temp.csv').then((r) => r.text()),
    fetch('data/affected_people.csv').then((r) => r.text()),
    fetch('data/drinking_water.csv').then((r) => r.text()),
  ]);

  const ST = {}, SST = {}, GHG = {}, RAIN = {}, SEA = {};
  for (const r of parseCSV(climateText)) {
    const ind = r.CLIMATE_CHANGE_INDICATORS;
    const iso = r.GEO_PICT;
    const year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
    if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;
    const t = ind === 'ST_ANOM' ? ST : ind === 'SST_ANOM' ? SST
      : ind === 'GHG_EMI_CAPITA' ? GHG : ind === 'RAIN_ANOM' ? RAIN
      : ind === 'SEA_LVL' ? SEA : null;
    if (!t) continue;
    (t[countryName(iso)] ||= []).push([year, val]);
  }
  for (const o of [ST, SST, GHG, RAIN, SEA]) {
    for (const k in o) o[k].sort((a, b) => a[0] - b[0]);
  }

  // ── temperature, re-based to the 1961–1990 climatological baseline ────────
  const sstRaw = regionalMean(SST);
  const baseline = meanOver(sstRaw, 1961, 1990);
  const sstRegional = sstRaw.map(([y, v]) => [y, +(v - baseline).toFixed(3)]);
  const sstByCountry = {};
  for (const [c, pts] of Object.entries(SST)) {
    sstByCountry[c] = pts.map(([y, v]) => [y, +(v - baseline).toFixed(3)]);
  }
  const top10 = [...sstRaw].sort((a, b) => b[1] - a[1]).slice(0, 10).map((p) => p[0]);

  // The prose also quotes a pre-industrial comparison. That is a different
  // baseline from the 1961–1990 one the chart is drawn against, so it is
  // computed on the raw series rather than the re-based one.
  const lastYear = sstRaw[sstRaw.length - 1][0];
  const sstPreIndustrial = +(
    meanOver(sstRaw, lastYear - 9, lastYear) - meanOver(sstRaw, 1850, 1900)
  ).toFixed(2);
  const sstColdestYear = [...sstRaw].sort((a, b) => a[1] - b[1])[0][0];

  // ── sea level ─────────────────────────────────────────────────────────────
  const seaRegional = regionalMean(SEA).map(([y, v]) => [y, +v.toFixed(4)]);
  const seaTrendMm = slope(seaRegional) * 1000;

  // ── rainfall trend and variability per territory ──────────────────────────
  const rainTrends = Object.entries(RAIN)
    .filter(([, p]) => p.length > 5)
    .map(([country, series]) => ({
      country,
      trend: +(slope(series) * 10).toFixed(2),
      sd: +stdev(series.map((p) => p[1])).toFixed(1),
      atoll: ATOLL_STATES.has(country),
      series,
    }))
    .sort((a, b) => a.trend - b.trend);
  const rainYears = Object.values(RAIN).flat().map((p) => p[0]);

  // ── emissions ─────────────────────────────────────────────────────────────
  const ghgByYear = {};   // country -> {year: val}
  for (const [c, pts] of Object.entries(GHG)) {
    ghgByYear[c] = Object.fromEntries(pts);
  }
  const ghgLatest = Object.entries(GHG)
    .map(([country, pts]) => ({
      country,
      val: pts[pts.length - 1][1],
      year: pts[pts.length - 1][0],
      suspect: country in SUSPECT_GHG,
      note: SUSPECT_GHG[country],
    }))
    .sort((a, b) => b.val - a.val);

  // ── disaster events ───────────────────────────────────────────────────────
  const affected = [];
  for (const r of parseCSV(affectedText)) {
    // VC_DSR_AFFCT is the only clean indicator in this file — the others mix
    // units, one reporting persons and another economic loss in USD.
    if (r.INDICATOR !== 'VC_DSR_AFFCT' || !isTotal(r)) continue;
    const iso = r.GEO_PICT, year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
    if (!iso || !Number.isFinite(year) || !Number.isFinite(val) || val <= 0) continue;
    affected.push({ iso, country: countryName(iso), year, affected: Math.round(val) });
  }
  affected.sort((a, b) => b.affected - a.affected);

  // ── safely managed drinking water (SDG 6.1.1) ─────────────────────────────
  const ur = {}, total = {};
  for (const r of parseCSV(waterText)) {
    if (r.INDICATOR !== 'SH_H2O_SAFE') continue;
    const iso = r.GEO_PICT, year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
    if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;
    const name = countryName(iso), u = r.URBANIZATION;
    if (u === 'U' || u === 'R') ((ur[name] ||= {})[u] ||= {})[year] = val;
    else if (u === '_T' || !u) (total[name] ||= {})[year] = val;
  }
  const waterGaps = Object.entries(ur).map(([country, d]) => {
    if (!d.U || !d.R) return null;
    const shared = Object.keys(d.U).map(Number).filter((y) => y in d.R);
    if (!shared.length) return null;
    const year = Math.max(...shared);
    return {
      country, year, urban: d.U[year], rural: d.R[year],
      gap: +(d.U[year] - d.R[year]).toFixed(1),
      atoll: ATOLL_STATES.has(country),
    };
  }).filter(Boolean).sort((a, b) => b.gap - a.gap);

  // Fixed endpoints, not each country's own first and last reported year:
  // comparing different spans per country would make the changes incomparable
  // and invents decliners that are really just shorter records.
  const W_FROM = 2000, W_TO = 2022;
  const waterChange = Object.entries(total).map(([country, ys]) => {
    if (!(W_FROM in ys) || !(W_TO in ys)) return null;
    return {
      country, firstYear: W_FROM, lastYear: W_TO,
      start: ys[W_FROM], end: ys[W_TO],
      change: +(ys[W_TO] - ys[W_FROM]).toFixed(1),
    };
  }).filter(Boolean).sort((a, b) => b.change - a.change);

  const mapCountries = Object.entries(COORDS).map(([iso, [lat, lon]]) => {
    const series = ST[countryName(iso)];
    if (!series || !series.length) return null;
    return { iso, name: countryName(iso), lat, lon, series };
  }).filter(Boolean);

  return {
    sstRegional, sstByCountry, sstBaselineLabel: '1961–1990', top10,
    sstMeanBaseline: +(meanOver(sstRaw, 1961, 1990) - baseline).toFixed(2),
    sstMeanRecent: +(meanOver(sstRaw, 1995, 2024) - baseline).toFixed(2),
    sstPreIndustrial, sstColdestYear,
    sstTerritories: Object.keys(SST).length,
    sstYears: [sstRaw[0][0], sstRaw[sstRaw.length - 1][0]],
    seaRegional, seaTrendMm: +seaTrendMm.toFixed(1),
    seaTerritories: Object.keys(SEA).length,
    seaYears: [seaRegional[0][0], seaRegional[seaRegional.length - 1][0]],
    rainTrends,
    rainDrying: rainTrends.filter((r) => r.trend < 0).length,
    rainWetting: rainTrends.filter((r) => r.trend > 0).length,
    rainYears: [Math.min(...rainYears), Math.max(...rainYears)],
    ghgByYear, ghgLatest,
    ghgTrustedBelow4: ghgLatest.filter((g) => !g.suspect && g.val < 4).length,
    ghgTrustedCount: ghgLatest.filter((g) => !g.suspect).length,
    ghgTotalCount: ghgLatest.length,
    affected, waterGaps, waterChange, mapCountries,
  };
}
