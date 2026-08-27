// js/map.js
// The Pacific coastline map for Beat 0.
// Uses DEP XYZ vector tiles for shorelines_annual (1999–2023).
//
// API:
//   initMap(containerId) → { map, setYear, showRates, flyTo, markEvent }
//   setYear(year)  — show ONLY that year's coastline with cross-fade transition
//   showRates(on)  — toggle the rates_of_change dot layer

const TILEJSON_URL = 'https://tileserver.prod.digitalearthpacific.io/data/coastlines.json';
const SOURCE_ID = 'dep-coastlines';
const SHORELINE_SRC = 'shorelines_annual';
const RATES_SRC = 'rates_of_change';
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

const YEAR_MIN = 1999;
const YEAR_MAX = 2023;

// Colour ramp: 1999 = cool blue → 2023 = warm orange
function yearColor(year) {
  const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  // Interpolate rgb(202,233,255) → rgb(232,131,58)
  const r = Math.round(202 + t * (232 - 202));
  const g = Math.round(233 + t * (131 - 233));
  const b = Math.round(255 + t * (58 - 255));
  return `rgb(${r},${g},${b})`;
}

export function initMap(containerId = 'map') {
  const map = new maplibregl.Map({
    container: containerId,
    style: BASEMAP_STYLE,
    center: [171.0, 7.1],
    zoom: 9,
    attributionControl: true,
  });

  map.on('error', (e) => {
    if (e.error?.message?.includes('style')) {
      console.warn('Basemap style failed; using fallback.', e.error.message);
    }
  });

  let currentYear = YEAR_MIN;
  let sourceReady = false;

  map.on('load', () => {
    map.addSource(SOURCE_ID, { type: 'vector', url: TILEJSON_URL });

    // ── Single shoreline layer — filtered to ONE year at a time ──
    // We use MapLibre's setFilter + paint transition for smooth year switching.
    map.addLayer({
      id: 'shoreline-bg',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': SHORELINE_SRC,
      paint: {
        'line-color': '#ccc',
        'line-width': 1,
        'line-opacity': 0.25,
      },
    });

    map.addLayer({
      id: 'shoreline-active',
      type: 'line',
      source: SOURCE_ID,
      'source-layer': SHORELINE_SRC,
      filter: ['==', ['get', 'year'], currentYear],
      paint: {
        'line-color': yearColor(currentYear),
        'line-width': 2.5,
        'line-opacity': 1,
        'line-opacity-transition': { duration: 350, delay: 0 },
      },
    });

    // ── rates_of_change dot layer (beat ⑤) ──
    map.addLayer({
      id: 'rates',
      type: 'circle',
      source: SOURCE_ID,
      'source-layer': RATES_SRC,
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 12, 4],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'rate_time'],
          -5, '#c1362f',
          0, '#f7f5ef',
          5, '#2a78d6',
        ],
        'circle-opacity': 0.75,
      },
    });

    map.on('click', 'rates', (e) => {
      const f = e.features[0];
      const rate = f.properties.rate_time;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${rate > 0 ? 'Accreting' : 'Eroding'}</strong><br>${rate.toFixed(1)} m/yr`)
        .addTo(map);
    });
    map.on('mouseenter', 'rates', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'rates', () => { map.getCanvas().style.cursor = ''; });

    sourceReady = true;

    // Show initial year
    applyYear(currentYear);
  });

  // ── Private: apply year filter + colour instantly or after source ready ──
  function applyYear(year) {
    currentYear = year;
    if (!map.getLayer('shoreline-active')) return;

    // Filter the active layer to only this year
    map.setFilter('shoreline-active', ['==', ['get', 'year'], year]);

    // Update colour smoothly via setPaintProperty
    map.setPaintProperty('shoreline-active', 'line-color', yearColor(year));

    // Update the year counter DOM (if present)
    const counter = document.getElementById('year-counter');
    if (counter) {
      counter.hidden = false;
      counter.textContent = year;
    }
  }

  // ── Public API ────────────────────────────────────────────
  return {
    map,

    // Set the visible coastline year (called by the timeline widget)
    setYear(year) {
      if (sourceReady) {
        applyYear(year);
      } else {
        // Queue the year for when the source is ready
        currentYear = year;
        map.once('sourcedata', (e) => {
          if (e.sourceId === SOURCE_ID && map.isSourceLoaded(SOURCE_ID)) {
            applyYear(currentYear);
          }
        });
      }
    },

    // Legacy — now a no-op (timeline replaces the auto-animation)
    animateShorelines() {
      // Replaced by the timeline widget — does nothing
    },

    showRates(on = true) {
      if (map.getLayer('rates')) {
        map.setLayoutProperty('rates', 'visibility', on ? 'visible' : 'none');
      }
    },

    flyTo(center, zoom) {
      map.flyTo({ center, zoom, duration: 1800 });
    },

    markEvent(lngLat, label) {
      const elm = document.createElement('div');
      elm.className = 'event-marker';
      new maplibregl.Marker({ element: elm })
        .setLngLat(lngLat)
        .setPopup(new maplibregl.Popup().setHTML(label))
        .addTo(map);
    },
  };
}
