// charts/choropleth.js
// Bklit-inspired D3 choropleth map — Pacific nations colored by GHG emissions per capita.
// Uses Natural Earth GeoJSON (110m) filtered to Pacific countries.
// API: renderChoropleth(container, emissionsData) → { update, destroy }

import { SUSPECT_GHG } from '../js/data.js?v=7';

const PACIFIC_ISOS = new Set([
    'FJI', 'WSM', 'TON', 'VUT', 'SLB', 'PNG', 'KIR', 'MHL', 'FSM',
    'PLW', 'TUV', 'NRU', 'COK', 'NIU', 'TKL', 'WLF', 'PYF', 'NCL',
    'GUM', 'MNP', 'ASM', 'PCN'
]);

// Bklit-inspired colour scale: light → dark blue
const COLOR_SCALE = [
    '#b3d7fa', '#85bdf5', '#5ca3ee', '#3b8de8', '#2a78d6',
    '#1e5faa', '#154380'
];
const COLOR_NODATA = '#e8e8e8';
const COLOR_OCEAN = '#f0f6fc';
const COLOR_LAND = '#f5f5f5';

// Map from GeoJSON names → our data names
const NAME_MAP = {
    'Fiji': 'Fiji',
    'Samoa': 'Samoa',
    'Tonga': 'Tonga',
    'Vanuatu': 'Vanuatu',
    'Solomon Is.': 'Solomon Islands',
    'Solomon Islands': 'Solomon Islands',
    'Papua New Guinea': 'Papua New Guinea',
    'New Caledonia': 'New Caledonia',
    'French Polynesia': 'French Polynesia',
    'Kiribati': 'Kiribati',
    'Marshall Is.': 'Marshall Islands',
    'Marshall Islands': 'Marshall Islands',
    'Micronesia': 'Micronesia',
    'Fed. States of Micronesia': 'Micronesia',
    'Palau': 'Palau',
    'Tuvalu': 'Tuvalu',
    'Nauru': 'Nauru',
    'Guam': 'Guam',
    'N. Mariana Is.': 'N. Mariana Is',
    'American Samoa': 'American Samoa',
    'Cook Is.': 'Cook Islands',
    'Cook Islands': 'Cook Islands',
    'Niue': 'Niue',
    'Tokelau': 'Tokelau',
    'Wallis and Futuna': 'Wallis & Futuna',
};

export async function renderChoropleth(container, emissionsData, opts = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return { update() { }, destroy() { } };

    const state = {
        width: opts.width || el.clientWidth || 900,
        height: opts.height || 480,
        indicator: opts.indicator || 'emissions',
    };

    el.innerHTML = '';
    el.classList.add('is-loading');

    // ── Load world GeoJSON ─────────────────────────────────
    let world;
    try {
        const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topo = await resp.json();
        // topojson → geojson (inline since we can't import)
        world = topojsonFeature(topo, topo.objects.countries);
    } catch (err) {
        console.error('Choropleth: failed to load world atlas', err);
        el.innerHTML = '<p class="nodata">Could not load map data.</p>';
        el.classList.remove('is-loading');
        return { update() { }, destroy() { } };
    }

    el.classList.remove('is-loading');

    // Minimal topojson.feature inline (to avoid CDN dependency)
    function topojsonFeature(topology, object) {
        const arcs = topology.arcs;
        function decodeArc(arcIndex) {
            const arc = arcs[arcIndex < 0 ? ~arcIndex : arcIndex];
            const coords = [];
            let x = 0, y = 0;
            for (const [dx, dy] of arc) {
                x += dx; y += dy;
                coords.push([
                    x * topology.transform.scale[0] + topology.transform.translate[0],
                    y * topology.transform.scale[1] + topology.transform.translate[1]
                ]);
            }
            if (arcIndex < 0) coords.reverse();
            return coords;
        }
        function decodeRing(indices) {
            return indices.reduce((ring, i) => ring.concat(decodeArc(i)), []);
        }
        function decodeGeometry(geom) {
            if (geom.type === 'Polygon') {
                return { type: 'Polygon', coordinates: geom.arcs.map(decodeRing) };
            }
            if (geom.type === 'MultiPolygon') {
                return { type: 'MultiPolygon', coordinates: geom.arcs.map(poly => poly.map(decodeRing)) };
            }
            return geom;
        }
        return {
            type: 'FeatureCollection',
            features: object.geometries.map(g => ({
                type: 'Feature',
                id: g.id,
                properties: g.properties || {},
                geometry: decodeGeometry(g),
            }))
        };
    }

    // ── Build emissions lookup (latest value per country) ────
    function buildLookup(data) {
        const lookup = {};
        for (const [country, pts] of Object.entries(data)) {
            if (country.startsWith('__') || !Array.isArray(pts) || !pts.length) continue;
            const latest = pts[pts.length - 1];
            lookup[country] = { year: latest[0], value: latest[1] };
        }
        return lookup;
    }

    const emissions = buildLookup(emissionsData);
    const values = Object.values(emissions).map(d => d.value).filter(v => v > 0);

    // ── LOG BINNING ────────────────────────────────────────────────────────
    // The old scale was `val / maxVal` with maxVal = Palau's 86.7. That put every
    // other Pacific nation in the first colour bin, so the map rendered as one flat
    // tone and carried no information. The data spans three orders of magnitude
    // (0.1 → 86.7 t), so it needs a log scale.
    //
    // maxVal is computed from TRUSTED series only. Palau's series is an export
    // artifact (190.6 t/capita in 1970, falling ~60% since) and must not be allowed
    // to set the top of the ramp for everyone else.
    const trustedValues = Object.entries(emissions)
        .filter(([country]) => !SUSPECT_GHG.has(country))
        .map(([, d]) => d.value)
        .filter(v => v > 0);

    const LO = 0.1;
    const HI = Math.max(d3.max(trustedValues) || 4, 1);

    function getColor(val, country) {
        if (val == null || val <= 0) return COLOR_NODATA;
        if (country && SUSPECT_GHG.has(country)) return 'url(#choro-suspect-hatch)';
        const t = Math.min(Math.max(
            (Math.log10(val) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO)), 0), 1);
        const idx = Math.min(Math.floor(t * COLOR_SCALE.length), COLOR_SCALE.length - 1);
        return COLOR_SCALE[idx];
    }

    // Resolve GeoJSON feature name → our data name
    function featureName(f) {
        const n = f.properties?.name || f.properties?.NAME || '';
        return NAME_MAP[n] || n;
    }

    function featureValue(f) {
        const name = featureName(f);
        return emissions[name] || null;
    }

    // ── Projection: Mercator centered on the Pacific ───────
    const projection = d3.geoMercator()
        .center([170, -5])
        .scale(state.width * 1.1)
        .translate([state.width / 2, state.height / 2]);

    const path = d3.geoPath().projection(projection);

    // ── Tooltip (Bklit dark glass style) ───────────────────
    d3.select(el).style('position', 'relative');
    const tip = d3.select(el).append('div').attr('class', 'bklit-tooltip');

    // ── SVG ────────────────────────────────────────────────
    const svg = d3.select(el).append('svg')
        .attr('viewBox', `0 0 ${state.width} ${state.height}`)
        .attr('role', 'img')
        .attr('aria-label', 'Pacific choropleth map showing GHG emissions per capita');

    // Ocean background
    svg.append('rect')
        .attr('width', state.width).attr('height', state.height)
        .attr('fill', COLOR_OCEAN);

    // Graticule (Bklit-style)
    const graticule = d3.geoGraticule().step([10, 10]);
    svg.append('path')
        .datum(graticule())
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(0,0,0,0.06)')
        .attr('stroke-width', 0.5);

    // Country paths
    const countries = svg.selectAll('path.country')
        .data(world.features)
        .enter().append('path')
        .attr('class', 'country')
        .attr('d', path)
        .attr('fill', f => {
            const d = featureValue(f);
            return d ? getColor(d.value, featureName(f)) : COLOR_LAND;
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0)
        .style('cursor', f => featureValue(f) ? 'pointer' : 'default')
        .style('transition', 'opacity 0.4s var(--ease-bklit, ease)');

    // Bklit-style staggered reveal animation
    countries.transition()
        .delay((_, i) => 200 + i * 8)
        .duration(600)
        .ease(d3.easeCubicOut)
        .attr('opacity', 1);

    // Hover interactions (Bklit-style fade-others)
    countries
        .on('mouseenter', function (event, f) {
            const d = featureValue(f);
            const name = featureName(f);
            if (!d) return;

            // Fade others
            countries.attr('opacity', 0.35);
            d3.select(this)
                .attr('opacity', 1)
                .attr('stroke', '#1a1a1a')
                .attr('stroke-width', 1.5);

            const [mx, my] = d3.pointer(event, el);
            tip.style('opacity', 1)
                .style('left', `${Math.min(mx + 14, el.clientWidth - 200)}px`)
                .style('top', `${my - 50}px`)
                .html(
                    `<span class="tt-dot" style="background:${getColor(d.value)}"></span>` +
                    `<strong>${name}</strong><br>` +
                    `<span class="tt-label">GHG emissions per capita</span><br>` +
                    `<span class="tt-value">${d.value.toFixed(1)} tCO₂e</span> ` +
                    `<span class="tt-label">(${d.year})</span>`
                );
        })
        .on('mousemove', function (event) {
            const [mx, my] = d3.pointer(event, el);
            tip.style('left', `${Math.min(mx + 14, el.clientWidth - 200)}px`)
                .style('top', `${my - 50}px`);
        })
        .on('mouseleave', function () {
            countries.attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 0.5);
            tip.style('opacity', 0);
        });

    // ── Legend ─────────────────────────────────────────────
    // Hatch pattern def for flagged series (appended to the map svg).
    const _defs = svg.append('defs');
    const _pat = _defs.append('pattern')
        .attr('id', 'choro-suspect-hatch')
        .attr('width', 5).attr('height', 5)
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('patternTransform', 'rotate(45)');
    _pat.append('rect').attr('width', 5).attr('height', 5).attr('fill', '#e7e3d9');
    _pat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5)
        .attr('stroke', '#b8b2a6').attr('stroke-width', 2);

    const legendContainer = document.createElement('div');
    legendContainer.className = 'choropleth-legend';
    legendContainer.innerHTML = `
    <span>${LO} t</span>
    ${COLOR_SCALE.map(c => `<span class="legend-block" style="background:${c}"></span>`).join('')}
    <span>${HI.toFixed(0)} t</span>
    <span class="legend-hatch" title="Series flagged as an export artifact"></span>
    <span>flagged</span>
    <span style="margin-left:auto;font-style:italic">t CO₂ per capita · log scale</span>
  `;
    el.appendChild(legendContainer);

    return {
        update(newOpts = {}) {
            Object.assign(state, newOpts);
            // Could re-render with different data/indicator
        },
        destroy() { el.innerHTML = ''; },
    };
}
