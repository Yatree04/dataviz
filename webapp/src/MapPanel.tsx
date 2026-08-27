// src/MapPanel.tsx
// The map, rebuilt on Highcharts Maps. The previous MapLibre + Digital Earth
// Pacific vector-tile build kept failing silently in the browser (wrong/blocked
// tile source) and was undebuggable without live network access. This version
// uses the same pattern as Highcharts' own "population history by country" and
// "lightning strikes" map demos: a world topology fetched once at runtime, one
// bubble per country sized/coloured by real ST_ANOM, a year slider that restyles
// the bubbles in place (no reload), and click-to-drill into a country's full
// history — all real data, no coastline geometry we can't verify.

import { useEffect, useRef, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import type { AffectedEvent, MapCountry } from './useClimateData';
import YearScrubber from './YearScrubber';

const YEAR_MIN = 1985;
const YEAR_MAX = 2025;

const HEAT_3 = '#c1362f';
const ACCRETE = '#2a78d6';
const BORDER = '#e2e8f0';
const INK = '#020817';
const INK3 = '#9ca3af';

type Mode = 'temperature' | 'winston';

function valueAtYear(series: [number, number][], year: number): number | null {
  const hit = series.find(([y]) => y === year);
  return hit ? hit[1] : null;
}

function bubbleZ(anomaly: number) {
  return 6 + Math.min(Math.abs(anomaly), 1.5) * 14;
}

function bubbleData(countries: MapCountry[], year: number) {
  return countries.map((c) => {
    const v = valueAtYear(c.series, year) ?? 0;
    return { lat: c.lat, lon: c.lon, z: bubbleZ(v), colorValue: v, name: c.name, custom: { iso: c.iso } };
  });
}

export default function MapPanel({ countries, winstonEvent }: { countries: MapCountry[]; winstonEvent?: AffectedEvent }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('temperature');
  const [year, setYear] = useState(YEAR_MAX);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const setSelectedIsoRef = useRef(setSelectedIso);
  setSelectedIsoRef.current = setSelectedIso;

  // Build the chart once, after fetching the world topology.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const topology = await fetch('https://code.highcharts.com/mapdata/custom/world.topo.json')
          .then((r) => {
            if (!r.ok) throw new Error(`world topology fetch failed: ${r.status}`);
            return r.json();
          });
        if (cancelled || !containerRef.current) return;

        const winstonPoint = winstonEvent
          ? [{
              lat: -18.14, lon: 178.44, z: 22, colorValue: 0,
              name: `Cyclone Winston · ${winstonEvent.country} ${winstonEvent.year}`,
              custom: { affected: winstonEvent.affected },
            }]
          : [];

        chartRef.current = Highcharts.mapChart(containerRef.current, {
          chart: { backgroundColor: '#eaf2fb', animation: false },
          title: { text: undefined },
          credits: { enabled: false },
          accessibility: { enabled: false },
          mapNavigation: { enabled: true, buttonOptions: { verticalAlign: 'bottom' } },
          mapView: {
            projection: { name: 'EqualEarth', rotation: [-180] },
            center: [180, -8],
            zoom: 2.6,
          },
          colorAxis: {
            min: -1.3,
            max: 1.3,
            stops: [[0, ACCRETE], [0.5, '#f7f5ef'], [1, HEAT_3]] as any,
            labels: { format: '{value:+.1f}°C' },
          },
          legend: { enabled: false },
          series: [
            {
              type: 'map',
              name: 'Pacific',
              mapData: topology,
              nullColor: '#e2e8f0',
              borderColor: '#64748b',
              borderWidth: 0.75,
              enableMouseTracking: false,
              showInLegend: false,
            },
            {
              type: 'mapbubble',
              id: 'temp-bubbles',
              name: 'ST anomaly',
              data: bubbleData(countries, YEAR_MAX),
              minSize: 6,
              maxSize: 26,
              visible: true,
              marker: { lineWidth: 1, lineColor: 'rgba(2,8,23,0.35)' },
              point: {
                events: {
                  click: function (this: any) {
                    setSelectedIsoRef.current(this.custom?.iso ?? null);
                  },
                },
              },
              tooltip: {
                pointFormatter: function (this: any) {
                  const sign = this.colorValue > 0 ? '+' : '';
                  return `<b>${this.name}</b><br/>ST anomaly: ${sign}${this.colorValue.toFixed(2)}°C`;
                },
              },
            } as any,
            {
              type: 'mapbubble',
              id: 'winston-marker',
              name: 'Cyclone Winston',
              data: winstonPoint,
              minSize: 22,
              maxSize: 22,
              color: HEAT_3,
              visible: false,
              marker: { lineWidth: 2, lineColor: '#fff' },
              tooltip: {
                pointFormatter: function (this: any) {
                  return `<b>${this.name}</b><br/>${this.custom.affected.toLocaleString()} people affected`;
                },
              },
            } as any,
          ],
        });

        setReady(true);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Year scrub — restyle the existing bubbles, no rebuild.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    const series = chart.get('temp-bubbles');
    if (!series) return;
    (series as any).setData(bubbleData(countries, year), true, { duration: 400 });
  }, [year, ready, countries]);

  // Mode toggle.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    const temp = chart.get('temp-bubbles') as any;
    const winston = chart.get('winston-marker') as any;
    temp?.setVisible(mode === 'temperature', false);
    winston?.setVisible(mode === 'winston', false);
    if (chart.mapView) {
      if (mode === 'winston') chart.mapView.setView([178.4, -18.1], 6);
      else chart.mapView.setView([180, -8], 2.6);
    }
    chart.redraw();
  }, [mode, ready]);

  const selected = countries.find((c) => c.iso === selectedIso);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([
          ['temperature', 'Temperature by year, 1985–2025'],
          ['winston', 'Cyclone Winston, 2016'],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`chip${mode === m ? ' active' : ''}`}
            style={{ border: `1px solid ${BORDER}` }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="map-panel">
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {mode === 'temperature' && <div className="map-year-badge">{year}</div>}
        {loadError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, background: 'rgba(10,37,64,0.92)', color: '#fff', textAlign: 'center',
          }}>
            <div style={{ maxWidth: 420 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f5c14e', marginBottom: 8 }}>
                Map data didn't load
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.85 }}>{loadError}</div>
            </div>
          </div>
        )}
      </div>

      {mode === 'temperature' && (
        <div style={{ marginTop: 14 }}>
          <YearScrubber min={YEAR_MIN} max={YEAR_MAX} value={year} onChange={setYear} tickEvery={5} />
        </div>
      )}

      {selected && mode === 'temperature' && (
        <CountryHistory country={selected} onClose={() => setSelectedIso(null)} />
      )}

      <p className="caption">
        {mode === 'temperature'
          ? "ST_ANOM · SPC Pacific Data Hub · one bubble per reporting country, sized and coloured by that year's land temperature anomaly. Click a bubble for its full history."
          : 'Cyclone Winston, Fiji, 2016 · VC_DSR_AFFCT · SPC Pacific Data Hub.'}
      </p>
    </div>
  );
}

function CountryHistory({ country, onClose }: { country: MapCountry; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = Highcharts.chart(ref.current, {
      chart: {
        type: 'line',
        height: 160,
        backgroundColor: '#ffffff',
        plotBorderColor: BORDER,
        plotBorderWidth: 1,
        plotBorderRadius: 5,
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: { lineWidth: 0, tickLength: 0 },
      yAxis: { title: { text: undefined }, labels: { format: '{value:+.1f}°C' }, gridLineWidth: 1 },
      tooltip: { pointFormat: 'ST anomaly: <b>{point.y:+.2f}°C</b>' },
      series: [{ type: 'line', name: country.name, data: country.series, color: INK, marker: { enabled: false } } as any],
    });
    return () => chart.destroy();
  }, [country]);

  const first = country.series[0][0];
  const last = country.series[country.series.length - 1][0];

  return (
    <div style={{ marginTop: 14, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>
          {country.name} — ST anomaly, {first}–{last}
        </span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', color: INK3, cursor: 'pointer', fontSize: 12 }}>
          close ×
        </button>
      </div>
      <div ref={ref} style={{ background: '#ffffff' }} />
    </div>
  );
}
