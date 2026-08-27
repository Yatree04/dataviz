// src/useClimateData.ts
// Loads and parses the RAW SPC CSVs at runtime — no pre-baked JSON, no hand-typed
// numbers. Same authenticity rationale as the vanilla build: provenance stays
// visible and every value on screen traces back to data/sea_temp.csv and
// data/affected_people.csv, copied verbatim into public/data/.

import { useEffect, useState } from 'react';

export interface AffectedEvent {
  iso: string;
  country: string;
  year: number;
  affected: number;
}

export interface ClimateData {
  ST_ANOM: Record<string, [number, number][]>;
  SST_ANOM: Record<string, [number, number][]>;
  ST_ANOM_REGIONAL: [number, number][];
  SST_ANOM_REGIONAL: [number, number][];
  SEA_LVL_REGIONAL: [number, number][];
  GHG: Record<string, number>;
  GHG_YEAR: number;
  RAIN_ANOM: Record<string, number>;
  RAIN_YEAR: number;
  AFFECTED: AffectedEvent[];
}

const NAMES: Record<string, string> = {
  AS: 'American Samoa', CK: 'Cook Islands', FJ: 'Fiji', FM: 'Micronesia', GU: 'Guam',
  KI: 'Kiribati', MH: 'Marshall Islands', MP: 'N. Mariana Is', NC: 'New Caledonia',
  NR: 'Nauru', NU: 'Niue', PF: 'French Polynesia', PG: 'Papua New Guinea', PN: 'Pitcairn',
  PW: 'Palau', SB: 'Solomon Islands', TK: 'Tokelau', TO: 'Tonga', TV: 'Tuvalu',
  VU: 'Vanuatu', WF: 'Wallis & Futuna', WS: 'Samoa',
};
const countryName = (iso: string) => NAMES[iso] || iso;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].split(',');
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx]; });
    rows.push(row);
  }
  return rows;
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
    .map(([y, [sum, n]]): [number, number] => [y, +(sum / n).toFixed(3)])
    .sort((a, b) => a[0] - b[0]);
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

export function useClimateData() {
  const [data, setData] = useState<ClimateData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [climateText, affectedText] = await Promise.all([
          fetch('data/sea_temp.csv').then((r) => r.text()),
          fetch('data/affected_people.csv').then((r) => r.text()),
        ]);

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
          (target[countryName(iso)] ||= []).push([year, +val.toFixed(3)]);
        }
        for (const series of [ST_ANOM, SST_ANOM, GHG_SERIES, RAIN_SERIES, SEA_LVL]) {
          for (const name of Object.keys(series)) series[name].sort((a, b) => a[0] - b[0]);
        }

        const ghgLatest = latestPerCountry(GHG_SERIES);
        const rainLatest = latestPerCountry(RAIN_SERIES);

        const events: AffectedEvent[] = [];
        for (const r of parseCSV(affectedText)) {
          if (r.INDICATOR !== 'VC_DSR_AFFCT') continue;
          const isTotal = ['SEX', 'AGE', 'URBANIZATION', 'INCOME', 'EDUCATION', 'OCCUPATION', 'DISABILITY']
            .every((k) => !r[k] || r[k] === '_T');
          if (!isTotal) continue;
          const iso = r.GEO_PICT, year = +r.TIME_PERIOD, val = +r.OBS_VALUE;
          if (!iso || !Number.isFinite(year) || !Number.isFinite(val) || val <= 0) continue;
          events.push({ iso, country: countryName(iso), year, affected: Math.round(val) });
        }
        events.sort((a, b) => b.affected - a.affected);

        if (!cancelled) {
          setData({
            ST_ANOM,
            SST_ANOM,
            ST_ANOM_REGIONAL: regionalMean(ST_ANOM),
            SST_ANOM_REGIONAL: regionalMean(SST_ANOM),
            SEA_LVL_REGIONAL: regionalMean(SEA_LVL),
            GHG: ghgLatest.out,
            GHG_YEAR: ghgLatest.year,
            RAIN_ANOM: rainLatest.out,
            RAIN_YEAR: rainLatest.year,
            AFFECTED: events.slice(0, 5),
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
