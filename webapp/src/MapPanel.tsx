// src/MapPanel.tsx
// The map, rebuilt on Highcharts Maps as a full-bleed centerpiece rather than a
// boxed panel — one bubble per country, sized/coloured by real ST_ANOM, a year
// slider that restyles the bubbles in place, and double-click-to-zoom into a
// country for a real per-country reading: its full temperature history, GHG,
// rainfall, and any recorded disaster-affected-people events. No literal
// coastline geometry here yet — Digital Earth Pacific's own tile server proved
// unreachable/unverifiable from this build environment; this stays honest about
// what it shows (real per-country annual readings) rather than approximating
// coastline shift with invented geometry.

import { useEffect, useRef, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import type { AffectedEvent, MapCountry } from './useClimateData';
import YearScrubber from './YearScrubber';

const YEAR_MIN = 1985;
const YEAR_MAX = 2025;

const HEAT_2 = '#e8833a';
const HEAT_3 = '#c1362f';
const ACCRETE = '#2a78d6';
const BORDER = '#e2e8f0';
const INK = '#020817';
const INK2 = '#1f2937';
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

export default function MapPanel({
  countries,
  ghg,
  ghgYear,
  rainAnom,
  rainYear,
  affected,
  winstonEvent,
}: {
  countries: MapCountry[];
  ghg: Record<string, number>;
  ghgYear: number;
  rainAnom: Record<string, number>;
  rainYear: number;
  affected: AffectedEvent[];
  winstonEvent?: AffectedEvent;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('temperature');
  const [year, setYear] = useState(YEAR_MAX);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  // Refs so the Highcharts point-click closure always sees current values
  // without rebuilding the chart.
  const clickTrack = useRef<{ iso: string | null; time: number }>({ iso: null, time: 0 });
  const openCountryRef = useRef<(iso: string) => void>(() => {});
  openCountryRef.current = (iso: string) => {
    setSelectedIso(iso);
    const country = countries.find((c) => c.iso === iso);
    const chart = chartRef.current;
    if (country && chart?.mapView) chart.mapView.setView([country.lon, country.lat], 6.2);
  };

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
            labels: { format: '{value:+.1f}°C', style: { color: INK2 } },
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
              cursor: 'pointer',
              marker: { lineWidth: 1, lineColor: 'rgba(2,8,23,0.35)' },
              point: {
                events: {
                  // Highcharts point events don't include a native dblclick —
                  // detect two clicks on the same point within 400ms instead.
                  click: function (this: any) {
                    const iso = this.custom?.iso;
                    if (!iso) return;
                    const now = Date.now();
                    const last = clickTrack.current;
                    if (last.iso === iso && now - last.time < 400) {
                      openCountryRef.current(iso);
                      clickTrack.current = { iso: null, time: 0 };
                    } else {
                      clickTrack.current = { iso, time: now };
                    }
                  },
                },
              },
              tooltip: {
                pointFormatter: function (this: any) {
                  const sign = this.colorValue > 0 ? '+' : '';
                  return `<b>${this.name}</b><br/>ST anomaly: ${sign}${this.colorValue.toFixed(2)}°C<br/><em style="opacity:0.7">double-click to zoom in</em>`;
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
    setSelectedIso(null);
    if (chart.mapView) {
      if (mode === 'winston') chart.mapView.setView([178.4, -18.1], 6);
      else chart.mapView.setView([180, -8], 2.6);
    }
    chart.redraw();
  }, [mode, ready]);

  const selected = countries.find((c) => c.iso === selectedIso);

  const closeCountry = () => {
    setSelectedIso(null);
    const chart = chartRef.current;
    if (chart?.mapView) chart.mapView.setView([180, -8], 2.6);
  };

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

        {/* double-click drill-down panel */}
        {selected && mode === 'temperature' && (
          <CountryPanel
            country={selected}
            ghg={ghg[selected.name]}
            ghgYear={ghgYear}
            rain={rainAnom[selected.name]}
            rainYear={rainYear}
            events={affected.filter((e) => e.country === selected.name)}
            onClose={closeCountry}
          />
        )}
      </div>

      {mode === 'temperature' && (
        <div style={{ marginTop: 14 }}>
          <YearScrubber min={YEAR_MIN} max={YEAR_MAX} value={year} onChange={setYear} tickEvery={5} />
        </div>
      )}

      <p className="caption">
        {mode === 'temperature'
          ? "ST_ANOM · SPC Pacific Data Hub · one bubble per reporting country, sized and coloured by that year's land temperature anomaly. Double-click a bubble to zoom in and read its full record."
          : 'Cyclone Winston, Fiji, 2016 · VC_DSR_AFFCT · SPC Pacific Data Hub.'}
      </p>
    </div>
  );
}

function CountryPanel({
  country, ghg, ghgYear, rain, rainYear, events, onClose,
}: {
  country: MapCountry;
  ghg?: number;
  ghgYear: number;
  rain?: number;
  rainYear: number;
  events: AffectedEvent[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = Highcharts.chart(ref.current, {
      chart: {
        type: 'line',
        height: 140,
        backgroundColor: '#ffffff',
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      xAxis: { lineWidth: 0, tickLength: 0, labels: { style: { fontSize: '10px', color: INK3 } } },
      yAxis: { title: { text: undefined }, labels: { format: '{value:+.1f}°C', style: { fontSize: '10px', color: INK3 } }, gridLineWidth: 1, gridLineColor: BORDER },
      tooltip: { pointFormat: 'ST anomaly: <b>{point.y:+.2f}°C</b>' },
      series: [{ type: 'line', name: country.name, data: country.series, color: HEAT_2, lineWidth: 2, marker: { enabled: false } } as any],
    });
    return () => chart.destroy();
  }, [country]);

  const first = country.series[0];
  const last = country.series[country.series.length - 1];
  const warmed = +(last[1] - first[1]).toFixed(2);

  return (
    <div className="country-panel">
      <div className="country-panel__head">
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK3 }}>
            Country record
          </div>
          <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 700, color: INK, margin: '2px 0 0' }}>
            {country.name}
          </h3>
        </div>
        <button onClick={onClose} className="country-panel__close" aria-label="Close and return to the Pacific view">×</button>
      </div>

      <p style={{ fontSize: 12.5, color: INK2, lineHeight: 1.6, margin: '10px 0 14px' }}>
        Land temperature has moved from <strong>{first[1] > 0 ? '+' : ''}{first[1].toFixed(2)}°C</strong> in {first[0]} to{' '}
        <strong>{last[1] > 0 ? '+' : ''}{last[1].toFixed(2)}°C</strong> in {last[0]} —
        a {warmed >= 0 ? 'rise' : 'fall'} of <strong>{Math.abs(warmed).toFixed(2)}°C</strong>.
      </p>

      <div ref={ref} />

      <div className="country-panel__stats">
        <div>
          <div className="country-panel__stat-label">GHG emissions{ghg !== undefined ? `, ${ghgYear}` : ''}</div>
          <div className="country-panel__stat-value">{ghg !== undefined ? `${ghg.toFixed(1)} tCO₂e/cap` : 'no data'}</div>
        </div>
        <div>
          <div className="country-panel__stat-label">Rainfall anomaly{rain !== undefined ? `, ${rainYear}` : ''}</div>
          <div className="country-panel__stat-value">{rain !== undefined ? `${rain > 0 ? '+' : ''}${rain.toFixed(0)}mm` : 'no data'}</div>
        </div>
      </div>

      {events.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="country-panel__stat-label" style={{ marginBottom: 6 }}>Recorded disaster events · VC_DSR_AFFCT</div>
          {events.slice(0, 4).map((e) => (
            <div key={`${e.iso}-${e.year}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: INK2, padding: '3px 0' }}>
              <span>{e.year}</span>
              <span style={{ fontWeight: 600 }}>{e.affected.toLocaleString()} affected</span>
            </div>
          ))}
        </div>
      )}

      <p className="caption" style={{ marginTop: 12 }}>
        ST_ANOM {first[0]}–{last[0]} · SPC Pacific Data Hub.
      </p>
    </div>
  );
}
