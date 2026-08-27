// js/main.js — entry point.
// Loads real CSV data, inits charts + inline map, wires pill-button country selector.
// Map lives inline in beat-0 section. Beats 5/6 teleport the map block into their section.
// Keep this thin; logic lives in the chart modules and map.js.

import { loadData } from './data.js?v=5';
import { renderTemperature } from '../charts/temperature.js?v=5';
import { renderEmissions } from '../charts/emissions.js?v=5';
import { renderChoropleth } from '../charts/choropleth.js?v=5';
import { renderSeaLevel } from '../charts/sealevel.js?v=5';
import { renderRainfall } from '../charts/rainfall.js?v=5';
import { initMap } from './map.js?v=5';
import { initHeroSketch } from './hero-sketch.js?v=5';
import { initTimeline } from './timeline.js?v=5';

const COUNTRY_DEFAULT = 'Fiji';
const PILL_COUNTRIES = [
  'Fiji', 'Tuvalu', 'Kiribati', 'Marshall Islands', 'Vanuatu',
  'Tonga', 'Samoa', 'Solomon Islands', 'Palau', 'Nauru',
];

async function boot() {
  // Start hero wave immediately (p5.js loaded globally from CDN)
  initHeroSketch('hero-canvas');

  const { climate, affected } = await loadData();

  // ── Country pill-buttons ──────────────────────────────────────
  const pillContainer = document.getElementById('country-pills');
  const allCountries = Object.keys(climate.ST_ANOM)
    .filter(k => !k.startsWith('__')).sort();

  let activeCountry = COUNTRY_DEFAULT;

  function setActiveCountry(name) {
    activeCountry = name;
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
    def.value = ''; def.textContent = 'More...';
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

  // ── Charts ────────────────────────────────────────────────────
  const temp = renderTemperature('#chart-temperature', climate, { country: COUNTRY_DEFAULT });
  const bleaching = renderTemperature('#chart-bleaching', climate, {
    country: COUNTRY_DEFAULT, showBleachingBand: true,
  });
  const emissions = renderEmissions('#chart-emissions', climate.GHG_EMI_CAPITA);
  const sealevel = renderSeaLevel('#chart-sealevel', climate.SEA_LVL);
  const rainfall = renderRainfall('#chart-rainfall', climate.RAIN_ANOM);
  const choropleth = await renderChoropleth('#choropleth-container', climate.GHG_EMI_CAPITA);
  void emissions; void rainfall; void choropleth;

  // ── Map (inline block) ────────────────────────────────────────
  const mapCtl = initMap('map');
  const mapBlock = document.querySelector('.map-block');
  let _timeline = null;

  function moveMapTo(beatId) {
    const target = document.getElementById(beatId);
    if (target && mapBlock && !target.contains(mapBlock)) {
      // Insert map BEFORE the timeline container (keeps stacking order correct)
      const tlContainer = target.querySelector('#timeline-container');
      target.insertBefore(mapBlock, tlContainer || null);
      mapCtl.map.resize();
    }
  }

  // Called by the timeline whenever the year slider moves
  function onYearChange(year) {
    mapCtl.setYear(year);
    const counter = document.getElementById('year-counter');
    if (counter) counter.textContent = year;
  }

  // ── Scroll: Intersection Observer ─────────────────────────────
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('is-active');
      handleBeat(
        en.target.dataset.beat,
        mapCtl, affected, sealevel,
        moveMapTo,
        () => _timeline,
        (tl) => { _timeline = tl; },
        onYearChange
      );
    }
  }, { threshold: 0.3 });
  document.querySelectorAll('.step').forEach(s => io.observe(s));

  // ── Resize ────────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      temp.update({ width: document.querySelector('#chart-temperature')?.clientWidth });
      bleaching.update({ width: document.querySelector('#chart-bleaching')?.clientWidth });
      emissions.update({ width: document.querySelector('#chart-emissions')?.clientWidth });
      sealevel.update({ width: document.querySelector('#chart-sealevel')?.clientWidth });
      rainfall.update({ width: document.querySelector('#chart-rainfall')?.clientWidth });
    }, 150);
  });
}

// ── Beat handler ──────────────────────────────────────────────────
function handleBeat(beat, mapCtl, affected, sealevel, moveMapTo, getTimeline, setTimeline, onYearChange) {
  const counter = document.getElementById('year-counter');
  const caption = document.getElementById('map-caption');

  switch (beat) {
    case '0':
      moveMapTo('beat-0');
      if (caption) caption.textContent = 'Majuro Atoll, Marshall Islands';
      mapCtl.flyTo([171.0, 7.1], 11);
      mapCtl.showRates(false);
      // ── Init timeline (once, on first entry) ──
      if (!getTimeline()) {
        const tl = initTimeline('#timeline-container', 1999, 2023, 2000, onYearChange);
        setTimeline(tl);
        onYearChange(2000); // set map to starting year
      }
      if (counter) counter.hidden = false;
      break;

    case '5':
      moveMapTo('beat-5');
      if (counter) counter.hidden = true;
      if (caption) caption.textContent = 'Pacific Ocean - coastline erosion rates (m/yr)';
      mapCtl.flyTo([170.0, 5.0], 5);
      mapCtl.showRates(true);
      break;

    case '6': {
      moveMapTo('beat-6');
      if (counter) counter.hidden = true;
      if (caption) caption.textContent = 'Fiji - Cyclone Winston, 2016';
      const winston = affected.find(e => e.iso === 'FJ' && e.year === 2016);
      mapCtl.flyTo([178.5, -17.7], 7);
      mapCtl.showRates(false);
      if (winston) {
        mapCtl.markEvent(
          [178.5, -17.7],
          `<strong>Cyclone Winston, Fiji 2016</strong><br>${winston.affected.toLocaleString()} people affected`
        );
      }
      break;
    }

    default:
      if (counter) counter.hidden = true;
      break;
  }
}

boot().catch(err => {
  console.error('boot failed', err);
  document.body.insertAdjacentHTML('afterbegin',
    `<pre style="color:#c1362f;padding:1.5rem;background:#fff9f9;border-bottom:2px solid #c1362f">
Warning: Load error: ${err.message}
Serve this folder over HTTP, not file://
Run: python -m http.server 8080
    </pre>`
  );
});
