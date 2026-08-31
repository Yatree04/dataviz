// js/main.js — entry point.
//
// Loads real CSV data, inits charts + inline map, wires the country selector.
// The map is a single persistent MapLibre instance that is re-parented into
// whichever beat currently owns it (0 → 6 → 7).
//
// CHANGES IN THIS REVISION
//   - Beat ids shifted: exposure is the new beat 5, the rates map is 6, the coda is 7.
//   - The bleaching panel is the SAME temperature module with observed bleaching
//     events switched on, not a fake threshold line. See charts/temperature.js.
//   - charts/reef.js added for the GCRMN composition finding.
//   - Both temperature instances follow the country selector.

import { loadData } from './data.js?v=7';
import { renderTemperature } from '../charts/temperature.js?v=7';
import { renderEmissions } from '../charts/emissions.js?v=7';
import { renderChoropleth } from '../charts/choropleth.js?v=7';
import { renderSeaLevel } from '../charts/sealevel.js?v=7';
import { renderRainfall } from '../charts/rainfall.js?v=7';
import { renderReef } from '../charts/reef.js?v=7';
import { initMap } from './map.js?v=7';
import { initHeroSketch } from './hero-sketch.js?v=7';
import { initTimeline } from './timeline.js?v=7';
import { animateCountUps, initScrollProgress, initProgressRail } from './reveal.js?v=7';

const COUNTRY_DEFAULT = 'Fiji';
const PILL_COUNTRIES = [
  'Fiji', 'Tuvalu', 'Kiribati', 'Marshall Islands', 'Vanuatu',
  'Tonga', 'Samoa', 'Solomon Islands', 'Palau', 'Nauru',
];

const BEATS = [
  { id: 'beat-0', label: 'Cold open · the coastline moves' },
  { id: 'beat-1', label: 'The input · emissions' },
  { id: 'beat-2', label: 'The heat store · ocean warming' },
  { id: 'beat-3a', label: 'Warm water expands' },
  { id: 'beat-3b', label: 'The reef flattens' },
  { id: 'beat-3c', label: 'Rainfall shifts' },
  { id: 'beat-4', label: 'The mechanism · less-broken waves' },
  { id: 'beat-5', label: 'Exposure · who is standing there' },
  { id: 'beat-6', label: 'The measurement · shoreline change' },
  { id: 'beat-7', label: 'Coda · Cyclone Winston' },
];

// Beats that own the map, in scroll order.
const MAP_BEATS = new Set(['0', '6', '7']);

async function boot() {
  initHeroSketch('hero-canvas');
  initScrollProgress();

  const { climate, affected } = await loadData();
  document.getElementById('page-loader')?.classList.add('is-hidden');

  // ── Charts ────────────────────────────────────────────────────
  // Beat 2: ocean warming with the standard-error ribbon and ENSO bands.
  const temp = renderTemperature('#chart-temperature', climate, {
    country: COUNTRY_DEFAULT,
    showENSO: true,
  });

  // Beat 3b: the same line, with observed global bleaching events added.
  // ENSO stays on because the bleaching years ARE ENSO years — that overlap is
  // the point, and hiding it would let the reader read bleaching as a pure
  // trend response.
  const bleaching = renderTemperature('#chart-bleaching', climate, {
    country: COUNTRY_DEFAULT,
    showENSO: true,
    showBleachingEvents: true,
    minYear: 1980,
  });

  const emissions = renderEmissions('#chart-emissions', climate.GHG_EMI_CAPITA);
  const sealevel = renderSeaLevel('#chart-sealevel', climate.SEA_LVL);
  const rainfall = renderRainfall('#chart-rainfall', climate.RAIN_ANOM);
  const reef = renderReef('#chart-reef');
  const choropleth = await renderChoropleth('#choropleth-container', climate.GHG_EMI_CAPITA);
  void choropleth;

  // ── Country pill-buttons ──────────────────────────────────────
  const pillContainer = document.getElementById('country-pills');
  const allCountries = Object.keys(climate.SST_ANOM)
    .filter(k => !k.startsWith('__')).sort();

  function setActiveCountry(name) {
    pillContainer.querySelectorAll('.pill').forEach(p => {
      p.classList.toggle('is-active', p.dataset.country === name);
    });
    temp.update({ country: name });
    bleaching.update({ country: name });
  }

  const visiblePills = PILL_COUNTRIES.filter(c => allCountries.includes(c));
  for (const name of visiblePills) {
    const btn = document.createElement('button');
    btn.className = 'pill' + (name === COUNTRY_DEFAULT ? ' is-active' : '');
    btn.dataset.country = name;
    btn.textContent = name;
    btn.addEventListener('click', () => setActiveCountry(name));
    pillContainer.appendChild(btn);
  }

  const remaining = allCountries.filter(c => !visiblePills.includes(c));
  if (remaining.length) {
    const sel = document.createElement('select');
    sel.className = 'pill more-select';
    const def = document.createElement('option');
    def.value = ''; def.textContent = 'More…';
    sel.appendChild(def);
    for (const c of remaining) {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    }
    sel.addEventListener('change', e => {
      if (e.target.value) setActiveCountry(e.target.value);
      e.target.value = '';
    });
    pillContainer.appendChild(sel);
  }

  // Replay a beat's draw-on animation each time its section re-enters view.
  const CHART_BY_BEAT = {
    '1': [emissions],
    '2': [temp],
    '3a': [sealevel],
    '3b': [bleaching, reef],
    '3c': [rainfall],
  };

  // ── Map ───────────────────────────────────────────────────────
  const mapCtl = initMap('map');
  const mapBlock = document.querySelector('.map-block');
  let _timeline = null;

  function moveMapTo(beatId) {
    const target = document.getElementById(beatId);
    const visualHost = target?.querySelector('.map-beat__visual');
    if (visualHost && mapBlock && !visualHost.contains(mapBlock)) {
      visualHost.appendChild(mapBlock);
      requestAnimationFrame(() => mapCtl.map.resize());
    }
  }

  function onYearChange(year) {
    mapCtl.setYear(year);
    const counter = document.getElementById('year-counter');
    if (counter) counter.textContent = year;
  }

  // ── Wayfinding + count-ups ────────────────────────────────────
  const rail = initProgressRail('#progress-rail', BEATS);
  animateCountUps();

  // ── Scroll ────────────────────────────────────────────────────
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const beat = en.target.dataset.beat;
      const wasActive = en.target.classList.contains('is-active');
      en.target.classList.add('is-active');
      rail.setActive(en.target.id);

      if (wasActive) {
        (CHART_BY_BEAT[beat] || []).forEach(chart => chart.update({}));
      }

      handleBeat(
        beat, mapCtl, affected, moveMapTo,
        () => _timeline, (tl) => { _timeline = tl; }, onYearChange
      );
    }
  }, { threshold: 0.3 });
  document.querySelectorAll('.step').forEach(s => io.observe(s));

  // ── Resize ────────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wOf = sel => document.querySelector(sel)?.clientWidth;
      temp.update({ width: wOf('#chart-temperature') });
      bleaching.update({ width: wOf('#chart-bleaching') });
      emissions.update({ width: wOf('#chart-emissions') });
      sealevel.update({ width: wOf('#chart-sealevel') });
      rainfall.update({ width: wOf('#chart-rainfall') });
      reef.update({ width: wOf('#chart-reef') });
      mapCtl.map.resize();
    }, 150);
  });
}

// ── Beat handler ────────────────────────────────────────────────
function handleBeat(beat, mapCtl, affected, moveMapTo, getTimeline, setTimeline, onYearChange) {
  const counter = document.getElementById('year-counter');
  const caption = document.getElementById('map-caption');

  if (!MAP_BEATS.has(beat)) {
    if (counter) counter.hidden = true;
    return;
  }

  switch (beat) {
    case '0':
      moveMapTo('beat-0');
      if (caption) caption.textContent = 'Majuro Atoll, Marshall Islands';
      mapCtl.flyTo([171.0, 7.1], 11);
      mapCtl.showRates(false);
      if (!getTimeline()) {
        const tl = initTimeline('#timeline-container', 1999, 2023, 2000, onYearChange);
        setTimeline(tl);
        onYearChange(2000);
      }
      if (counter) counter.hidden = false;
      break;

    case '6':
      moveMapTo('beat-6');
      if (counter) counter.hidden = true;
      if (caption) caption.textContent = 'Pacific — measured shoreline change rate (m/yr)';
      mapCtl.flyTo([170.0, 5.0], 5);
      mapCtl.showRates(true);
      break;

    case '7': {
      moveMapTo('beat-7');
      if (counter) counter.hidden = true;
      if (caption) caption.textContent = 'Fiji — Cyclone Winston, February 2016';
      const winston = affected.find(e => e.iso === 'FJ' && e.year === 2016);
      mapCtl.flyTo([178.5, -17.7], 7);
      mapCtl.showRates(false);
      if (winston) {
        mapCtl.markEvent(
          [178.5, -17.7],
          `<strong>Cyclone Winston, Fiji 2016</strong><br>` +
          `${winston.affected.toLocaleString()} people affected`
        );
      }
      break;
    }
  }
}

boot().catch(err => {
  console.error('boot failed', err);
  document.getElementById('page-loader')?.classList.add('is-hidden');
  document.body.insertAdjacentHTML('afterbegin',
    `<pre style="color:#c1362f;padding:1.5rem;background:#fff9f9;border-bottom:2px solid #c1362f">
Load error: ${err.message}
Serve this folder over HTTP, not file://
Run: python3 -m http.server 8080
    </pre>`
  );
});
