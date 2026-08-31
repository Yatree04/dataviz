// src/RainSmallMultiples.tsx
// Beat 04b — "The islands with no rivers are the ones drying out."
//
// 22 sparkline panels, one per territory, sorted by fitted trend from driest to
// wettest. Atoll states (no rivers, no highland catchment — fresh water held in
// a rain-fed lens) are outlined, because the finding is that they cluster at the
// drying end. Replaces a single-year bar chart: the surrounding copy makes a
// trend claim, and one year of an anomaly series is weather.

import type { RainTrend } from './useClimateData';

const HEAT_3 = '#c1362f';
const ACCRETE = '#2a78d6';
const BORDER = '#e2e8f0';
const INK = '#020817';
const INK3 = '#9ca3af';

const W = 150;
const H = 54;
const PAD = 3;

function Panel({ t, yMin, yMax, xMin, xMax }: {
  t: RainTrend; yMin: number; yMax: number; xMin: number; xMax: number;
}) {
  const sx = (y: number) => PAD + ((y - xMin) / (xMax - xMin)) * (W - PAD * 2);
  const sy = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin)) * (H - PAD * 2);
  const colour = t.trend < 0 ? HEAT_3 : ACCRETE;

  const path = t.series.map(([y, v], i) => `${i ? 'L' : 'M'}${sx(y).toFixed(1)},${sy(v).toFixed(1)}`).join('');

  // Draw the fitted slope across the full span rather than re-deriving it.
  const first = t.series[0][0], last = t.series[t.series.length - 1][0];
  const mid = t.series.reduce((a, [, v]) => a + v, 0) / t.series.length;
  const midYear = (first + last) / 2;
  const perYear = t.trend / 10;
  const y1 = mid + (first - midYear) * perYear;
  const y2 = mid + (last - midYear) * perYear;

  return (
    <div style={{
      border: `1px solid ${t.atoll ? INK : BORDER}`,
      borderWidth: t.atoll ? 1.5 : 1,
      borderRadius: 4,
      padding: '6px 7px 5px',
      background: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: INK, lineHeight: 1.2 }}>
          {t.country}
          {t.atoll && <span title="Atoll state — rain-fed freshwater lens" style={{ color: INK3, fontWeight: 400 }}> ◆</span>}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: colour, whiteSpace: 'nowrap' }}>
          {t.trend > 0 ? '+' : ''}{t.trend.toFixed(1)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} stroke={BORDER} strokeWidth={1} />
        <path d={path} fill="none" stroke={colour} strokeWidth={1} opacity={0.45} />
        <line
          x1={sx(first)} y1={sy(y1)} x2={sx(last)} y2={sy(y2)}
          stroke={colour} strokeWidth={2} strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function RainSmallMultiples({ trends }: { trends: RainTrend[] }) {
  if (!trends.length) return null;

  const all = trends.flatMap((t) => t.series.map(([, v]) => v));
  const yMin = Math.min(...all), yMax = Math.max(...all);
  const years = trends.flatMap((t) => t.series.map(([y]) => y));
  const xMin = Math.min(...years), xMax = Math.max(...years);

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 8,
      }}>
        {trends.map((t) => (
          <Panel key={t.country} t={t} yMin={yMin} yMax={yMax} xMin={xMin} xMax={xMax} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10, fontSize: 10.5, color: INK3 }}>
        <span><span style={{ color: HEAT_3, fontWeight: 700 }}>Red</span> drying · <span style={{ color: ACCRETE, fontWeight: 700 }}>blue</span> wetting</span>
        <span>◆ atoll state — rain-fed freshwater lens</span>
        <span>Thick line = fitted trend, mm per decade</span>
      </div>
    </div>
  );
}
