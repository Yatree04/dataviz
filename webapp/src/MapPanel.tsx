// src/MapPanel.tsx
// The real coastline payoff — Digital Earth Pacific vector tiles via MapLibre GL JS.
// Same tile source and layer names as the vanilla build's js/map.js, reimplemented
// as a React component in this UI's visual language. Three modes share one map
// instance: the year-scrubbed shoreline (beat 0's cold open), the erosion/accretion
// rates choropleth (beat 5's payoff), and the Cyclone Winston marker (beat 6's coda).

import { useEffect, useRef, useState } from 'react';
import type { AffectedEvent } from './useClimateData';
import YearScrubber from './YearScrubber';

declare const maplibregl: any;

const TILEJSON_URL = 'https://tileserver.prod.digitalearthpacific.io/data/coastlines.json';
const SOURCE_ID = 'dep-coastlines';
const SHORELINE_SRC = 'shorelines_annual';
const RATES_SRC = 'rates_of_change';

const YEAR_MIN = 1999;
const YEAR_MAX = 2023;

// A minimal self-contained style — no dependency on a third-party basemap
// server (tiles.openfreemap.org previously). If that external style JSON
// failed to load for any reason (down, CORS, rate limit), MapLibre rendered
// nothing at all: no background, no coastline, just the panel's own CSS
// background showing through. This style has nothing to fetch but our own
// data source, so it can't fail the same way.
const BASE_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    { id: 'bg', type: 'background' as const, paint: { 'background-color': '#0a2540' } },
  ],
};

function yearColor(year: number) {
  const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  const r = Math.round(202 + t * (232 - 202));
  const g = Math.round(233 + t * (131 - 233));
  const b = Math.round(255 + t * (58 - 255));
  return `rgb(${r},${g},${b})`;
}

type Mode = 'coastline' | 'rates' | 'winston';

export default function MapPanel({ winstonEvent }: { winstonEvent?: AffectedEvent }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mode, setMode] = useState<Mode>('coastline');
  const [year, setYear] = useState(2023);
  const [ready, setReady] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const markerAdded = useRef(false);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || typeof maplibregl === 'undefined') return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE as any,
      center: [171.0, 7.1],
      zoom: 9,
      attributionControl: true,
    });
    mapRef.current = map;

    // Surface failures instead of a silent blank map — this is the thing
    // that made the earlier bug invisible in the browser console.
    map.on('error', (e: any) => {
      console.error('MapLibre error:', e?.error || e);
      if (e?.sourceId === SOURCE_ID || /coastlines\.json/.test(e?.error?.message || '')) {
        setSourceError(e?.error?.message || 'Failed to load the coastline tile source.');
      }
    });

    map.on('load', () => {
      map.addSource(SOURCE_ID, { type: 'vector', url: TILEJSON_URL });

      map.addLayer({
        id: 'shoreline-bg', type: 'line', source: SOURCE_ID, 'source-layer': SHORELINE_SRC,
        paint: { 'line-color': '#ccc', 'line-width': 1, 'line-opacity': 0.25 },
      });
      map.addLayer({
        id: 'shoreline-active', type: 'line', source: SOURCE_ID, 'source-layer': SHORELINE_SRC,
        filter: ['==', ['get', 'year'], 2023],
        paint: {
          'line-color': yearColor(2023), 'line-width': 2.5, 'line-opacity': 1,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
      map.addLayer({
        id: 'rates', type: 'circle', source: SOURCE_ID, 'source-layer': RATES_SRC,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 12, 4],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'rate_time'],
            -5, '#c1362f', 0, '#f7f5ef', 5, '#2a78d6',
          ],
          'circle-opacity': 0.75,
        },
      });

      // Diagnostic: the vector source can load successfully with zero
      // matching features if the real tiles use different source-layer
      // names than 'shorelines_annual' / 'rates_of_change' — that fails
      // silently (no 'error' event), it just renders nothing. Check once
      // the source has actually finished loading tiles at this view.
      map.once('idle', () => {
        const shorelineFeatures = map.querySourceFeatures(SOURCE_ID, { sourceLayer: SHORELINE_SRC });
        if (shorelineFeatures.length === 0) {
          const msg = `No features found in source-layer "${SHORELINE_SRC}" — the tile source loaded, but this layer name likely doesn't match the real data. Check the tile source's actual layer names.`;
          console.warn(msg);
          setSourceError(msg);
        }
      });

      map.on('click', 'rates', (e: any) => {
        const f = e.features[0];
        const rate = f.properties.rate_time;
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${rate > 0 ? 'Accreting' : 'Eroding'}</strong><br>${rate.toFixed(1)} m/yr`)
          .addTo(map);
      });
      map.on('mouseenter', 'rates', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'rates', () => { map.getCanvas().style.cursor = ''; });

      setReady(true);
    });

    return () => map.remove();
  }, []);

  // React to mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (mode === 'coastline') {
      map.setLayoutProperty('rates', 'visibility', 'none');
      if (map.getLayer('shoreline-active')) {
        map.setLayoutProperty('shoreline-active', 'visibility', 'visible');
        map.setLayoutProperty('shoreline-bg', 'visibility', 'visible');
      }
      map.flyTo({ center: [171.0, 7.1], zoom: 11, duration: 1200 });
    } else if (mode === 'rates') {
      map.setLayoutProperty('rates', 'visibility', 'visible');
      if (map.getLayer('shoreline-active')) {
        map.setLayoutProperty('shoreline-active', 'visibility', 'none');
        map.setLayoutProperty('shoreline-bg', 'visibility', 'none');
      }
      map.flyTo({ center: [170.0, 5.0], zoom: 5, duration: 1200 });
    } else if (mode === 'winston') {
      map.setLayoutProperty('rates', 'visibility', 'none');
      if (map.getLayer('shoreline-active')) {
        map.setLayoutProperty('shoreline-active', 'visibility', 'none');
        map.setLayoutProperty('shoreline-bg', 'visibility', 'none');
      }
      map.flyTo({ center: [178.5, -17.7], zoom: 7, duration: 1200 });
      if (!markerAdded.current && winstonEvent) {
        markerAdded.current = true;
        const el = document.createElement('div');
        el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#c1362f;border:2px solid #fff;box-shadow:0 0 0 5px rgba(193,54,47,0.3),0 0 0 10px rgba(193,54,47,0.12);';
        new maplibregl.Marker({ element: el })
          .setLngLat([178.5, -17.7])
          .setPopup(new maplibregl.Popup().setHTML(
            `<strong>Cyclone Winston, ${winstonEvent.country} ${winstonEvent.year}</strong><br>${winstonEvent.affected.toLocaleString()} people affected`
          ))
          .addTo(map);
      }
    }
  }, [mode, ready, winstonEvent]);

  // Year scrub
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || mode !== 'coastline') return;
    if (!map.getLayer('shoreline-active')) return;
    map.setFilter('shoreline-active', ['==', ['get', 'year'], year]);
    map.setPaintProperty('shoreline-active', 'line-color', yearColor(year));
  }, [year, ready, mode]);

  const caption =
    mode === 'coastline' ? 'Majuro Atoll, Marshall Islands · Landsat annual shorelines' :
    mode === 'rates' ? 'Pacific Ocean · coastline erosion / accretion rates (m/yr)' :
    'Fiji · Cyclone Winston, 2016';

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([
          ['coastline', 'Coastline, 1999–2023'],
          ['rates', 'Erosion / accretion'],
          ['winston', 'Cyclone Winston, 2016'],
        ] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`chip${mode === m ? ' active' : ''}`}
            style={{ border: '1px solid var(--border)' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="map-panel">
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        <div className="map-caption">{caption}</div>
        {mode === 'coastline' && <div className="map-year-badge">{year}</div>}
        {sourceError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, background: 'rgba(10,37,64,0.92)', color: '#fff', textAlign: 'center',
          }}>
            <div style={{ maxWidth: 420 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f5c14e', marginBottom: 8 }}>
                Coastline data didn't load
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.85 }}>{sourceError}</div>
            </div>
          </div>
        )}
      </div>

      {mode === 'coastline' && (
        <div style={{ marginTop: 14 }}>
          <YearScrubber min={YEAR_MIN} max={YEAR_MAX} value={year} onChange={setYear} tickEvery={4} />
        </div>
      )}

      {mode === 'rates' && (
        <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
          <span style={{ color: '#c1362f', fontWeight: 700 }}>Red</span> retreats ·{' '}
          <span style={{ color: '#2a78d6', fontWeight: 700 }}>blue</span> builds. Click any point for its rate.
        </p>
      )}

      <p className="caption">
        Digital Earth Pacific · Landsat annual shorelines 1999–2023 + rates_of_change layer (10.4M transects).
      </p>
    </div>
  );
}
