// src/HChart.tsx
// A thin React wrapper around Highcharts.chart — same imperative-init pattern
// as the map, styled to match the examples: bordered/rounded plot area, no
// heavy chrome, muted axis lines. Kept deliberately small rather than pulling
// in highcharts-react-official's synchronization machinery we don't need for
// charts that only re-render when their data prop changes.

import { useEffect, useRef } from 'react';
import Highcharts from 'highcharts';

const BORDER = '#e2e8f0';

export default function HChart({ options, height = 260 }: { options: Highcharts.Options; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Highcharts.Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = Highcharts.chart(ref.current, {
      chart: {
        backgroundColor: '#ffffff',
        plotBackgroundColor: '#ffffff',
        plotBorderColor: BORDER,
        plotBorderWidth: 1,
        plotBorderRadius: 5,
        style: { fontFamily: "'Inter', sans-serif" },
        height,
        ...options.chart,
      },
      title: { text: undefined },
      credits: { enabled: false },
      ...options,
    });
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // A real HTML-level background (not just the SVG's own fill) — some
  // browser dark-mode heuristics and extensions key off the DOM element's
  // own background rather than repainting SVG shape fills.
  return <div ref={ref} style={{ background: '#ffffff', borderRadius: 5 }} />;
}
