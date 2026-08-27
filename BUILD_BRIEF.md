# Pacific DataViz Challenge 2026 — Build Brief

> **For the coding agent (Claude in Antigravity / VS Code):** This is the authoritative spec.
> Build to this. The narrative arc, data decisions, and honesty constraints below are fixed —
> they were validated against the raw data and against climate science. Do not "improve" the
> arc or swap datasets without flagging it. The human is the designer; you are the implementer.

---

## 0. What this is

An interactive scrollytelling data visualization for the Pacific DataViz Challenge 2026
(theme: Climate Change). It presents a **causal cascade** — each climate effect becomes the
cause of the next — across Pacific Island nations, ending on satellite-measured coastline
retreat.

Reference submissions to match in quality and feel:
- https://holtzy.github.io/pacific-challenge/ (sticky map backbone, country selectors, editorial prose)
- https://hnuradhyaksa.github.io/post/pacific-dataviz-2025 (open on striking visual then explain, warming stripes, serif editorial type)

**Layout model (decided):** persistent map as background backdrop; the temperature/rainfall
charts appear as their own full-width sections that scroll *over* the map; map returns to full
force for the coastline payoff. "Map bookends, charts in the middle."

---

## 1. The narrative arc — "The Line That Moves"

Every section ends by handing its *consequence* to the next section as that section's *cause*.
The connective tissue between beats is the point. Do not present these as 6 independent charts.

| # | Beat | Mechanism (the causal handoff) | Data | Viz |
|---|------|-------------------------------|------|-----|
| 0 | **Cold open** | The coastline is already moving — show it before naming why | `shorelines_annual` (PMTiles) animated 1999→2023 over one atoll | MapLibre, animated year filter |
| ① | **The input** | GHG traps heat → but where does the heat GO? | `GHG_EMI_CAPITA` | horizontal bar, framed as "input" not villain; show internal asymmetry (Palau ~87 vs Marshall ~0.1) |
| ② | **The heat store** | 91% of excess heat goes into the OCEAN → measured as rising temp | `ST_ANOM` + `SST_ANOM` | dual-line time series + warming stripes, country selector. THE ENGINE ROOM |
| ③a | **Water expands** | Warm water takes up more room → thermal expansion = ~half of historical sea rise | `SEA_LVL` | expansion micro-explainer + regional trend line |
| ③b | **Coral bleaches** | Same heat bleaches coral → the reef was the island's seawall | GCRMN trend + Mo'orea (USGS) + SST bleaching-threshold band | reuse ② temp chart with a "bleaching threshold" band; Mo'orea inset |
| ④ | **Coast opens (LOOP CLOSES)** | Living reef kills 97% of wave energy; dead reef doesn't. Higher water + no reef brake = waves hit land at full force. Reef complexity −50% → damaging waves 50× more frequent | converges — no new dataset, this is the causal hinge | transition INTO the map |
| ⑤ | **Measured retreat (PAYOFF)** | Everything above, now observed from space | `rates_of_change` + `shorelines_annual` (PMTiles) | MapLibre choropleth by rate_time (red=erosion, blue=accretion), click-to-inspect transect |
| ⑥ | **A displaced life (coda)** | The moving line is where a house was | `VC_DSR_AFFCT` (Cyclone Winston, Fiji 2016 = 633,584) | single verified marker on map |

**Through-line:** heat → water → reef → coast → life. Beat ④ is the hinge that folds ③a + ③b
back together and makes it a cascade, not a list. This closed causal loop is the thing that beats
the reference submissions — neither of them had one.

**Tone:** NOT injustice, NOT emotional appeal. This is the *physics of the real phenomenon*,
explained plainly enough for a non-scientist. Impact as consequence-of-mechanism.

---

## 2. Data — what's trustworthy and what is NOT

All climate CSVs pre-processed into `data/climate.json` and `data/affected.json` (see §4).
Original source: SPC Pacific Data Hub, `DF_CLIMATE_CHANGE` dataset.

**Trustworthy → build rich interactive:**
- `ST_ANOM` (surface/land temp anomaly) — 1850–2025, 22 countries. Clean. Decadal march −0.22°C (1950s) → +0.57°C (2020s), monotonic from 1980s.
- `SST_ANOM` (sea surface temp anomaly) — 1850–2025, 21 countries. Clean.
- `GHG_EMI_CAPITA` — to 2024, 17 countries. Real. Note 2 industrial outliers (Palau, New Caledonia); everyone else <4 tCO₂e.
- `VC_DSR_AFFCT` (persons affected) — MUST be filtered to this indicator only (done in preprocessing). Fiji 2016 = 633,584 verified.

**Use carefully → mechanism explainers, NOT rankings:**
- `SEA_LVL` — quantized to 0.1m steps. Supports "uniform regional rise," NOT a per-country ranking. Present as regional mechanism with an explicit data-honesty note. Do not imply precision it lacks.
- `RAIN_ANOM` — bidirectional but modest (Nauru drying ~−42mm, Tonga wetting ~+16mm). Supporting texture, not a headline.

**DO NOT USE (traps):**
- `drinking_water.csv` — the big "declines" (Cook Is 99.9→0.5, Solomon 90.5→28.4) are survey/denominator artifacts, NOT real. Excluded. If ever needed, only the modest credible ones (Marshall −10, Amer. Samoa −7.6) with a caveat.
- The other 11 indicators in `affected_people.csv` — mixed units (economic loss in USD stacked with persons). Only `VC_DSR_AFFCT` is clean.

**Honesty constraints (non-negotiable — a Pacific climate scientist is on the jury):**
- Flag SEA_LVL resolution limit in-context.
- The coral beat is site-level (Mo'orea), not per-country. Frame as "mechanism measured at a representative reef" + cite Pacific-wide GCRMN trend. State this openly.
- Never smooth over an interpolation or single-point estimate.

---

## 3. Coral & coastline data sources (external — cite these)

**Coastline (the payoff layer) — Digital Earth Pacific, served as live vector tiles:**
- PMTiles served via WMTS; tile endpoint base: `https://tileserver.prod.digitalearthpacific.io`
- Local file also available: `vnd.pmtiles` (~389MB, MVT, zoom 0–13)
- Layers: `shorelines_annual` (fields: year, certainty; 1999–2023; 947,089 segments),
  `rates_of_change` (fields: rate_time [m/yr, −190 to +264], se_time, sig_time; 10.4M transects),
  `hotspots_zoom_1/2/3` (pre-filtered erosion points per zoom).
- Load via MapLibre GL JS + `pmtiles` protocol library. Do NOT ship the 389MB file to the browser — stream tiles.

**Coral (cite for the ③b→④ link):**
- GCRMN "Status and Trends of Coral Reefs of the Pacific: 1980–2023". DOI 10.59387/WIUJ2936.
  PDF: https://gcrmn.net/wp-content/uploads/2025/08/GCRMN_Pacific_Status_Report_1980-2023.pdf
- Raw open benthic datasets list: https://github.com/GCRMN/gcrmndb_benthos#5-list-of-individual-datasets
- USGS Powell Center coral-cover time series (chartable, incl. Mo'orea 1992–2015):
  https://catalog.data.gov/dataset/time-series-coral-cover-data-from-hawaii-florida-moorea-and-the-virgin-islands
- Allen Coral Atlas (reef extent map overlay, on Pacific Data Hub):
  https://pacificdata.org/data/dataset/allen-coral-atlasd7474a93-7bef-4e13-a282-d56b06933ea8

**Science citations for mechanism text (already verified):**
- Ocean absorbs ~91% of excess heat → NOAA Climate.gov, NASA Sea Level Portal.
- Thermal expansion ≈ half of 20th-c sea rise → NASA / earth.gov.
- Reefs reduce wave energy ~97%; complexity −50% → extreme-height shore waves ~50× more frequent → Carlot et al. 2023 (Sci. Reports, Mo'orea), Ferrario et al. 2014.

---

## 4. Data files (already generated — real, from the CSVs)

### `data/climate.json`
```
{
  "ST_ANOM":  { "Fiji": [[year, value], ...], ..., "__REGIONAL_MEAN__": [[year, value], ...] },
  "SST_ANOM": { ... same shape ... },
  "SEA_LVL":  { "Fiji": [[year, value], ...], ... },   // no regional mean (quantized)
  "RAIN_ANOM":{ ..., "__REGIONAL_MEAN__": [...] },
  "GHG_EMI_CAPITA": { "Palau": [[year, value], ...], ... }
}
```
- Keys are full country names. Values are `[year, value]` pairs, year ascending.
- `__REGIONAL_MEAN__` is the cross-country mean per year (for ST/SST/RAIN only).
- Units: ST/SST_ANOM = °C anomaly; SEA_LVL = meters; RAIN_ANOM = mm; GHG = tCO₂e/capita.

### `data/affected.json`
```
[ { "iso":"FJ", "country":"Fiji", "year":2016, "affected":633584 }, ... ]  // sorted desc
```

---

## 5. Tech stack (all CDN, no build step)

- **D3.js v7** — data load, charts, scales.
- **MapLibre GL JS v4** + **pmtiles v3** — the map backdrop and coastline layers.
- **Intersection Observer** (native) — scroll-driven step transitions.
- **Google Fonts** — a serif for headings (Lora / Vollkorn / Fraunces), Inter for body.
- No framework required. If the human prefers Svelte later, keep chart modules framework-agnostic (pure functions taking a container + data).

---

## 6. Architecture

```
index.html          — semantic structure: header, 7 <section class="step"> beats, footer
css/styles.css      — design tokens (CSS custom props), sticky/scroll layout, chart styles
js/main.js          — entry: load JSON, init map, wire Intersection Observer + country selector
js/map.js           — MapLibre setup, PMTiles protocol, shoreline animation, rates choropleth
js/scroll.js        — Intersection Observer → activates steps, drives map state per beat
charts/temperature.js   — ② dual-line ST vs SST + warming stripes (THE priority chart)
charts/emissions.js     — ① horizontal bar
charts/sealevel.js      — ③a regional trend + expansion note
charts/rainfall.js      — ④ diverging bar
charts/affected.js      — ⑥ event marker data prep
data/climate.json       — (generated, real)
data/affected.json      — (generated, real)
```

**Chart module contract (keep every chart to this signature so they're swappable):**
```js
export function renderTemperature(container, data, opts = {}) {
  // container: DOM element or selector
  // data: the relevant slice of climate.json
  // opts: { country, width, height, palette }
  // returns: { update(newOpts), destroy() }
}
```

---

## 7. Build order (do NOT try to build all at once)

1. **`charts/temperature.js` first** — it's the spine, the cleanest data, and the design
   language (palette, type, motion) gets set here. Get it right, then match the others to it.
2. Scaffold `index.html` + `css/styles.css` with the section structure and sticky layout.
3. `js/map.js` — MapLibre + PMTiles, shoreline animation. **This can't be previewed in a
   sandbox — it needs a real browser + the tile server. Expect to debug from screenshots.**
4. Remaining charts (emissions, sealevel, rainfall) matched to temperature's language.
5. `js/scroll.js` — wire the Intersection Observer, connect beats to map state.
6. `charts/affected.js` + the ⑥ coda marker.
7. Footer: data sources, methodology, the honesty notes, citations.

---

## 8. Design tokens (starting point — the human will refine in Figma)

```css
:root {
  --ocean-deep: #0a2540;
  --ocean-mid:  #1b4965;
  --ocean-warm: #cae9ff;   /* cool end of warming stripe */
  --heat-1: #f5c14e;
  --heat-2: #e8833a;
  --heat-3: #c1362f;       /* hot end of warming stripe / erosion red */
  --accrete: #2a78d6;      /* accretion blue on the map */
  --erode:   #c1362f;      /* erosion red on the map */
  --paper:   #f7f5ef;      /* editorial light ground */
  --ink:     #14110d;
  --font-serif: 'Fraunces','Lora',Georgia,serif;
  --font-sans:  'Inter',system-ui,sans-serif;
  --measure: 680px;        /* text column max-width */
}
```

---

## 9. Authorship & rules (important)

Challenge rules: AI must stay *supportive* (coding, narrative, visuals); entries "primarily
generated by AI" can be disqualified. So:
- The **human owns**: the arc (done), the design/composition (Figma), framing, which data.
- The **agent owns**: implementation, debugging, plumbing.
- The human must be able to read, modify, and explain every part. Write clear, commented,
  non-clever code. No black boxes.

---

## 10. Verification checklist

- [ ] All JSON loads without console errors; every country present.
- [ ] Temperature chart: ST and SST both render, country selector updates both, regional mean line present, warming-stripe band correct cool→hot.
- [ ] Emissions: Palau/New Caledonia visibly outliers; Marshall/Tuvalu near zero.
- [ ] Sea level: shown as regional; data-honesty note visible.
- [ ] Rainfall: Nauru negative, Tonga positive.
- [ ] Map: PMTiles loads from tile server; shorelines animate 1999→2023; rates choropleth red/blue correct; click inspects a transect.
- [ ] Affected coda: Fiji 2016 = 633,584 shows correctly.
- [ ] Scroll: each beat activates its chart/map state; map persists as backdrop, charts scroll over.
- [ ] Every external dataset cited in footer with the sources in §3.
- [ ] Responsive at 360 / 768 / 1440.
