// Small helpers shared by App.tsx — all operate on real loaded series, nothing hand-typed.

export function decadeMean(series: [number, number][], decadeStart: number): number | null {
  const vals = series.filter(([y]) => y >= decadeStart && y < decadeStart + 10).map(([, v]) => v);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function stripeColor(anomaly: number, min: number, max: number): string {
  const t = (anomaly - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.5) {
    const u = clamped * 2;
    const r = Math.round(20 + u * 235);
    const g = Math.round(60 + u * 195);
    const b = Math.round(160 + u * 95);
    return `rgb(${r},${g},${b})`;
  }
  const u = (clamped - 0.5) * 2;
  const r = 255;
  const g = Math.round(255 - u * 215);
  const b = Math.round(255 - u * 255);
  return `rgb(${r},${g},${b})`;
}
