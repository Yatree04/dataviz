# The Line That Moves — Pacific DataViz Challenge 2026

An interactive scrollytelling piece on the Pacific climate cascade: **heat → water → reef →
coast → life**, ending on satellite-measured coastline retreat. Built to match the quality of
the 2025 winners (Holtzy, Hnuradhyaksa) — see `BUILD_BRIEF.md` for the full spec.

---

## Folder structure (put files here)

```
pacific-dataviz/
├── index.html
├── README.md
├── BUILD_BRIEF.md          ← the spec. Read this first (feed it to your agent).
├── css/
│   └── styles.css
├── js/
│   ├── main.js             ← entry point
│   ├── data.js             ← loads + cleans the RAW SPC CSVs in-browser
│   └── map.js              ← MapLibre + PMTiles coastline
├── charts/
│   ├── temperature.js      ← DONE — the reference chart. Match the others to it.
│   ├── emissions.js        ← TODO(agent)
│   ├── sealevel.js         ← TODO(agent)
│   └── rainfall.js         ← TODO(agent)
└── data/
    ├── sea_temp.csv        ← YOUR raw file (DF_CLIMATE_CHANGE)
    ├── affected_people.csv ← YOUR raw file
    ├── drinking_water.csv  ← present but intentionally unused (see BUILD_BRIEF §2)
    └── vnd.pmtiles         ← coastline tiles (optional if streaming from tile server)
```

> **Important:** `js/data.js` reads `data/sea_temp.csv` and `data/affected_people.csv` directly.
> Copy your raw CSVs into `data/`. No pre-processing step — the cleaning happens in the browser,
> so your provenance is visible and reproducible (this matters for the challenge's authenticity).

---

## Run it

Must be served over HTTP (ES modules + fetch won't work from `file://`):

```bash
cd pacific-dataviz
npx http-server -p 8080 -c-1
# open http://localhost:8080
```

or

```bash
python3 -m http.server 8080
```

---

## Data cleaning already handled (js/data.js)

- **Duplicate SPC headers** — addressed by exact code-column names (`INDICATOR` vs `Indicator`).
- **The affected-people trap** — only `VC_DSR_AFFCT` is loaded; the other 11 indicators mix
  economic loss (USD) with persons and would produce nonsense (e.g. a fake "374 million affected").
- **The drinking-water trap** — excluded entirely; its big "declines" are survey/denominator
  artifacts, not real (Cook Is 99.9→0.5 etc.). See BUILD_BRIEF §2.
- **Regional means** computed for ST/SST/RAIN anomalies.

Verified real values your build should reproduce:
- Fiji 2016 (Cyclone Winston) = **633,584** persons affected.
- ST_ANOM decadal march: −0.22 °C (1950s) → +0.57 °C (2020s).
- GHG outliers: Palau ~87, New Caledonia ~18 tCO₂e/capita; everyone else < 4.

---

## Build order (don't build all at once)

1. **`charts/temperature.js` is done** — study it. It defines the module contract and the design
   language (palette from CSS vars, draw-on animation, end labels, regional mean, bleaching band).
2. Build `emissions.js`, `sealevel.js`, `rainfall.js` to the **same signature**:
   ```js
   export function renderX(container, dataSlice, opts) { /* ... */ return { update, destroy }; }
   ```
   and the same visual language. Wire them in `js/main.js` (TODO markers are there).
3. **The map (`js/map.js`) last** — it needs a real browser + tile server and CANNOT be
   sandbox-previewed. Confirm the tile URL from your `.wmts` file first (TODO markers in map.js).
   Expect a few screenshot-debug rounds.
4. Framing copy in `index.html` is placeholder — **write it in your own voice.** That's the part
   that must be yours (challenge rules + it's what makes it feel authored, not generated).

---

## What makes it win (from studying the references)

- **Holtzy**: sticky map backbone, country selector driving all charts, clean editorial prose,
  generous whitespace. → your map-backdrop layout + `#country-select`.
- **Hnuradhyaksa**: opens on the striking visual then explains it; warming stripes; one element
  transforming as you scroll; serif editorial type. → your beat-0 coastline cold-open + the
  temperature line that becomes the bleaching chart in ③b.
- **Your edge over both**: a *closed causal loop* (beat ④ folds thermal expansion + reef death
  back together). Neither winner had one. Lead with that in your problem statement.

---

## Authorship (challenge rules)

AI must stay *supportive*. You own the arc (done), the design (Figma), the copy, the data
decisions. The agent owns implementation and debugging. Be able to read, modify, and explain
every file — you may have to.

## Citations (footer — see BUILD_BRIEF §3 for links)

SPC Pacific Data Hub (DF_CLIMATE_CHANGE, VC_DSR_AFFCT) · Digital Earth Pacific (coastline) ·
GCRMN Status & Trends of Coral Reefs of the Pacific 1980–2023, DOI 10.59387/WIUJ2936 ·
Carlot et al. 2023 & Ferrario et al. 2014 (reef wave attenuation) · NASA/NOAA (ocean heat, thermal expansion).
