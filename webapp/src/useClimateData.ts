// src/useClimateData.ts
// Loads and parses the RAW SPC CSVs at runtime — no pre-baked JSON, no hand-typed
// numbers. Every figure the article states is computed here from the source file,
// so copy and chart cannot drift apart and nothing can be "real-shaped" but wrong.
//
// Beats served (copy deck v2):
//   02 the ledger        GHG_EMI_CAPITA  + suspect-series flags
//   03 where the heat    SST_ANOM        + ENSO bands, 1961–1990 baseline
//   04a the sea          SEA_LVL         + regional mean, fitted trend
//   04b the rain         RAIN_ANOM       + per-country trend & SD
//   07 freshwater lens   SH_H2O_SAFE     + urban/rural gap, 2000→2022 change
//   hero + map          VC_DSR_AFFCT

import { useEffect, useState } from 'react';

export interface AffectedEvent {
  iso: string;
  country: string;
  year: number;
  affected: number;
}

export interface MapCountry {
  iso: string;
  name: string;
  lat: number;
  lon: number;
  series: [number, number][]; // [year, ST_ANOM]
}

export interface RainTrend {
  country: string;
  trend: number;   // mm per decade
  sd: number;      // year-to-year standard deviation, mm
  atoll: boolean;
  series: [number, number][];
}

export interface WaterGap {
  country: string;
  urban: number;
  rural: number;
  gap: number;
  year: number;
  atoll: boolean;
}

export interface WaterChange {
  country: string;
  y2000: number;
  y2022: number;
  change: number;
}

export interface GhgSeries {
  country: string;
  val: number;
  suspect: boolean;
  note?: string;
}

export interface EnsoEvent {
  start: number;
  end: number;
  phase: 'el-nino' | 'la-nina';
  label: string;
}

export interface ClimateData {
  // Beat 03
  SST_REGIONAL: { year: number; anom: number }[];
  SST_BASELINE_LABEL: string;
  SST_TOP10: number[];
  SST_MEAN_BASELINE: number;
  SST_MEAN_RECENT: number;
  ST_ANOM: Record<string, [number, number][]>;
  ST_ANOM_REGIONAL: [number, number][];
  SST_ANOM_REGIONAL: [number, number][];
  // Beat 04a
  SEA_LVL_REGIONAL: { year: number; value: number }[];
  SEA_LVL_TREND_MM: number;
  SEA_LVL_TERRITORIES: number;
  // Beat 04b
  RAIN_TRENDS: RainTrend[];
  RAIN_DRYING: number;
  RAIN_WETTING: number;
  RAIN_YEARS: [number, number];
  RAIN_ANOM: Record<string, number>;
  RAIN_YEAR: number;
  // Beat 02
  GHG_ALL: GhgSeries[];
  GHG: Record<string, number>;
  GHG_YEAR: number;
  GHG_BELOW_4: number;
  GHG_TRUSTED_COUNT: number;
  // Beat 07
  WATER_GAPS: WaterGap[];
  WATER_CHANGE: WaterChange[];
  // Disaster events — the hero stat and the map's country panel / Winston marker
  AFFECTED: AffectedEvent[];
  // shared
  ENSO_EVENTS: EnsoEvent[];
  MAP_COUNTRIES: MapCountry[];
}

const NAMES: Record<string, string> = {
  AS: 'American Samoa', CK: 'Cook Islands', FJ: 'Fiji', FM: 'Micronesia', GU: 'Guam',
  KI: 'Kiribati', MH: 'Marshall Islands', MP: 'N. Mariana Is', NC: 'New Caledonia',
  NR: 'Nauru', NU: 'Niue', PF: 'French Polynesia', PG: 'Papua New Guinea', PN: 'Pitcairn',
  PW: 'Palau', SB: 'Solomon Islands', TK: 'Tokelau', TO: 'Tonga', TV: 'Tuvalu',
  VU: 'Vanuatu', WF: 'Wallis & Futuna', WS: 'Samoa',
};
const countryName = (iso: string) => NAMES[iso] || iso;

// Low-lying atoll states: no rivers, no highland catchment. Fresh water is held
// in a lens recharged by rain alone — which is why the rainfall beat and the
// freshwater beat are the same argument.
const ATOLL_STATES = new Set([
  'Kiribati', 'Tuvalu', 'Marshall Islands', 'Tokelau', 'Nauru', 'Micronesia',
]);

// GHG per-capita series that fail a plausibility check. Palau is recorded at
// 190.6 t/capita in 1970 falling ~60% while tourism grows — a bunkering or
// denominator artifact, not a footprint. The others sit at a flat 0.1–0.2 for
// five decades, which is a coverage failure rather than a measurement.
const SUSPECT_GHG: Record<string, string> = {
  Palau: '190.6 t/capita in 1970 — four times any national total ever recorded',
  Nauru: 'flat 0.1–0.2 t for 55 consecutive years',
  Guam: 'flat 0.1–0.2 t for 55 consecutive years',
  'Marshall Islands': 'flat 0.1–0.2 t for 55 consecutive years',
  'N. Mariana Is': 'flat 0.1–0.2 t for 55 consecutive years',
  'American Samoa': 'flat 0.1–0.2 t for 55 consecutive years',
};

// ENSO events restricted to those uncontroversial in the literature. Used as
// annotation only — never as a fitted or derived quantity.
const ENSO_EVENTS: EnsoEvent[] = [
  { start: 1982, end: 1983, phase: 'el-nino', label: 'El Niño 1982–83' },
  { start: 1991, end: 1992, phase: 'el-nino', label: 'El Niño 1991–92' },
  { start: 1997, end: 1998, phase: 'el-nino', label: 'El Niño 1997–98' },
  { start: 2015, end: 2016, phase: 'el-nino', label: 'El Niño 2015–16' },
  { start: 2023, end: 2024, phase: 'el-nino', label: 'El Niño 2023–24' },
  { start: 1988, end: 1989, phase: 'la-nina', label: 'La Niña 1988–89' },
  { start: 2010, end: 2011, phase: 'la-nina', label: 'La Niña 2010–11' },
  { start: 2020, end: 2022, phase: 'la-nina', label: 'La Niña 2020–22' },
];

const COORDS: Record<string, [number, number]> = {
  WF: [-13.2823, -176.1745], SB: [-9.428, 159.9498], CK: [-21.2078, -159.775],
  TK: [-9.3809, -171.2158], FJ: [-18.1416, 178.4419], NC: [-22.2758, 166.4581],
  MH: [7.1164, 171.1858], PN: [-25.0667, -130.1], PF: [-17.5516, -149.5585],
  MP: [15.1778, 145.7508], GU: [13.4443, 144.7937], PW: [7.5006, 134.6242],
  VU: [-17.7333, 168.3273], TO: [-21.1393, -175.2049], FM: [6.9248, 158.1611],
  AS: [-14.2756, -170.7025], NU: [-19.0554, -169.918], NR: [-0.5477, 166.9209],
  KI: [1.3382, 172.9716], TV: [-8.5211, 179.1983], PG: [-9.4438, 147.1803],
  WS: [-13.8506, -171.7513],
};

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Split one CSV line, honouring double-quoted fields that contain commas.
 *
 * This matters: 755 rows in sea_temp.csv carry the country name
 * "Micronesia, Federated State of". A naive split(',') shifts every column
 * after it by one, so Micronesia's year and value were read out of the wrong
 * columns and the country silently dropped out of every derived statistic.
 * affected_people.csv and drinking_water.csv have the same pattern.
 */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }  // escaped ""
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx]; });
    rows.push(row);
  }
  return rows;
}

/** Ordinary least squares slope of y on x. */
function slope(pts: [number, number][]): number {
  const n = pts.length;
  if (n < 3) return 0;
  const sx = pts.reduce((a, [x]) => a + x, 0);
  const sy = pts.reduce((a, [, y]) => a + y, 0);
  const sxx = pts.reduce((a, [x]) => a + x * x, 0);
  const sxy = pts.reduce((a, [x, y]) => a + x * y, 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

function stdev(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
}

function regionalMean(series: Record<string, [number, number][]>): [number, number][] {
  const byYear = new Map<number, [number, number]>();
  for (const pts of Object.values(series)) {
    for (const [y, v] of pts) {
      const b = byYear.get(y) || [0, 0];
      byYear.set(y, [b[0] + v, b[1] + 1]);
    }
  }
  return [...byYear.entries()]
    .map(([y, [sum, n]]): [number, number] => [y, +(sum / n).toFixed(4)])
    .sort((a, b) => a[0] - b[0]);
}

function meanOver(series: [number, number][], lo: number, hi: number): number {
  const v = series.filter(([y]) => y >= lo && y <= hi).map(([, x]) => x);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function latestPerCountry(series: Record<string, [number, number][]>) {
  const out: Record<string, number> = {};
  let year = 0;
  for (const [name, pts] of Object.entries(series)) {
    if (!pts.length) continue;
    const [y, v] = pts[pts.length - 1];
    out[name] = v;
    year = Math.max(year, y);
  }
  return { out, year };
}

/** Rows where every disaggregation dimension is total — the only comparable ones. */
const isTotal = (r: Record<string, string>) =>
  ['SEX', 'AGE', 'URBANIZATION', 'INCOME', 'EDUCATION', 'OCCUPATION', 'DISABILITY']
    .every((k) => !r[k] || r[k] === '_T');

// ── hook ────────────────────────────────────────────────────────────────────

export function useClimateData() {
  const [data, setData] = useState<ClimateData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [climateText, affectedText, waterText] = await Promise.all([
          fetch('data/sea_temp.csv').then((r) => r.text()),
          fetch('data/affected_people.csv').then((r) => r.text()),
          fetch('data/drinking_water.csv').then((r) => r.text()),
        ]);

        // ── climate indicators ──────────────────────────────────────────────
        const ST_ANOM: Record<string, [number, number][]> = {};
        const SST_ANOM: Record<string, [number, number][]> = {};
        const GHG_SERIES: Record<string, [number, number][]> = {};
        const RAIN_SERIES: Record<string, [number, number][]> = {};
        const SEA_LVL: Record<string, [number, number][]> = {};

        for (const r of parseCSV(climateText)) {
          const ind = r.CLIMATE_CHANGE_INDICATORS;
          const iso = r.GEO_PICT;
          const year = +r.TIME_PERIOD;
          const val = +r.OBS_VALUE;
          if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;
          const target =
            ind === 'ST_ANOM' ? ST_ANOM :
            ind === 'SST_ANOM' ? SST_ANOM :
            ind === 'GHG_EMI_CAPITA' ? GHG_SERIES :
            ind === 'RAIN_ANOM' ? RAIN_SERIES :
            ind === 'SEA_LVL' ? SEA_LVL : null;
          if (!target) continue;
          (target[countryName(iso)] ||= []).push([year, val]);
        }
        for (const series of [ST_ANOM, SST_ANOM, GHG_SERIES, RAIN_SERIES, SEA_LVL]) {
          for (const name of Object.keys(series)) series[name].sort((a, b) => a[0] - b[0]);
        }

        // ── Beat 03: SST re-based to the 1961–1990 climatological baseline ──
        const sstRegionalRaw = regionalMean(SST_ANOM);
        const sstBaseline = meanOver(sstRegionalRaw, 1961, 1990);
        const SST_REGIONAL = sstRegionalRaw.map(({ 0: year, 1: v }) => ({
          year, anom: +(v - sstBaseline).toFixed(3),
        }));
        const SST_TOP10 = [...sstRegionalRaw]
          .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([y]) => y);

        // ── Beat 04a: sea level regional mean + fitted trend ────────────────
        const seaRegional = regionalMean(SEA_LVL);
        const SEA_LVL_REGIONAL = seaRegional.map(([year, value]) => ({ year, value }));
        const SEA_LVL_TREND_MM = slope(seaRegional) * 1000;

        // ── Beat 04b: rainfall trend and variability per territory ──────────
        const RAIN_TRENDS: RainTrend[] = Object.entries(RAIN_SERIES)
          .filter(([, pts]) => pts.length > 5)
          .map(([country, pts]) => ({
            country,
            trend: +(slope(pts) * 10).toFixed(2),
            sd: +stdev(pts.map(([, v]) => v)).toFixed(1),
            atoll: ATOLL_STATES.has(country),
            series: pts,
          }))
          .sort((a, b) => a.trend - b.trend);
        const rainYearsAll = Object.values(RAIN_SERIES).flat().map(([y]) => y);

        // ── Beat 02: emissions, with suspect series flagged not hidden ──────
        const ghgLatest = latestPerCountry(GHG_SERIES);
        const GHG_ALL: GhgSeries[] = Object.entries(ghgLatest.out)
          .map(([country, val]) => ({
            country, val,
            suspect: country in SUSPECT_GHG,
            note: SUSPECT_GHG[country],
          }))
          .sort((a, b) => b.val - a.val);
        const trusted = GHG_ALL.filter((g) => !g.suspect);

        const rainLatest = latestPerCountry(RAIN_SERIES);

        // ── Beat 09: affected persons and mortality ─────────────────────────
        const events: AffectedEvent[] = [];
        for (const r of parseCSV(affectedText)) {
          // VC_DSR_AFFCT is the only clean indicator in this file — the others
          // mix units, one reporting persons and another economic loss in USD
          // under a similar label.
          if (r.INDICATOR !== 'VC_DSR_AFFCT') continue;
          if (!isTotal(r)) continue;
          const iso = r.GEO_PICT, year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
          if (!iso || !Number.isFinite(year) || !Number.isFinite(val) || val <= 0) continue;
          events.push({ iso, country: countryName(iso), year, affected: Math.round(val) });
        }
        events.sort((a, b) => b.affected - a.affected);

        // ── Beat 07: safely managed drinking water (SDG 6.1.1) ──────────────
        const urbanRural: Record<string, Record<string, Record<number, number>>> = {};
        const waterTotal: Record<string, Record<number, number>> = {};
        for (const r of parseCSV(waterText)) {
          if (r.INDICATOR !== 'SH_H2O_SAFE') continue;
          const iso = r.GEO_PICT, year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
          if (!iso || !Number.isFinite(year) || !Number.isFinite(val)) continue;
          const name = countryName(iso);
          const u = r.URBANIZATION;
          if (u === 'U' || u === 'R') {
            ((urbanRural[name] ||= {})[u] ||= {})[year] = val;
          } else if (u === '_T' || !u) {
            (waterTotal[name] ||= {})[year] = val;
          }
        }
        const WATER_GAPS: WaterGap[] = Object.entries(urbanRural)
          .map(([country, d]) => {
            if (!d.U || !d.R) return null;
            const shared = Object.keys(d.U).map(Number).filter((y) => y in d.R);
            if (!shared.length) return null;
            const year = Math.max(...shared);
            const urban = d.U[year], rural = d.R[year];
            return {
              country, urban, rural,
              gap: +(urban - rural).toFixed(1),
              year,
              atoll: ATOLL_STATES.has(country),
            };
          })
          .filter((x): x is WaterGap => x !== null)
          .sort((a, b) => b.gap - a.gap);
        const WATER_CHANGE: WaterChange[] = Object.entries(waterTotal)
          .map(([country, ys]) => {
            const yrs = Object.keys(ys).map(Number).sort((a, b) => a - b);
            if (yrs.length < 2) return null;
            const first = yrs[0], last = yrs[yrs.length - 1];
            return {
              country, y2000: ys[first], y2022: ys[last],
              change: +(ys[last] - ys[first]).toFixed(1),
            };
          })
          .filter((x): x is WaterChange => x !== null)
          .sort((a, b) => a.change - b.change);

        const MAP_COUNTRIES: MapCountry[] = Object.entries(COORDS)
          .map(([iso, [lat, lon]]): MapCountry | null => {
            const series = ST_ANOM[countryName(iso)];
            if (!series || !series.length) return null;
            return { iso, name: countryName(iso), lat, lon, series };
          })
          .filter((c): c is MapCountry => c !== null);

        if (!cancelled) {
          setData({
            SST_REGIONAL,
            SST_BASELINE_LABEL: '1961–1990',
            SST_TOP10,
            SST_MEAN_BASELINE: +(meanOver(sstRegionalRaw, 1961, 1990) - sstBaseline).toFixed(3),
            SST_MEAN_RECENT: +(meanOver(sstRegionalRaw, 1995, 2024) - sstBaseline).toFixed(3),
            ST_ANOM,
            ST_ANOM_REGIONAL: regionalMean(ST_ANOM),
            SST_ANOM_REGIONAL: sstRegionalRaw,
            SEA_LVL_REGIONAL,
            SEA_LVL_TREND_MM: +SEA_LVL_TREND_MM.toFixed(1),
            SEA_LVL_TERRITORIES: Object.keys(SEA_LVL).length,
            RAIN_TRENDS,
            RAIN_DRYING: RAIN_TRENDS.filter((r) => r.trend < 0).length,
            RAIN_WETTING: RAIN_TRENDS.filter((r) => r.trend > 0).length,
            RAIN_YEARS: [Math.min(...rainYearsAll), Math.max(...rainYearsAll)],
            RAIN_ANOM: rainLatest.out,
            RAIN_YEAR: rainLatest.year,
            GHG_ALL,
            GHG: ghgLatest.out,
            GHG_YEAR: ghgLatest.year,
            GHG_BELOW_4: trusted.filter((g) => g.val < 4).length,
            GHG_TRUSTED_COUNT: trusted.length,
            WATER_GAPS,
            WATER_CHANGE,
            AFFECTED: events,
            ENSO_EVENTS,
            MAP_COUNTRIES,
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, error };
}
