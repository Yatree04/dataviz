# The Line That Moves — React build

This is the same "Line That Moves" Pacific climate story as the repo root, in the
visual language of the uploaded Figma Make UI (React + Vite), wired to the
**real** SPC Pacific Data Hub data instead of that export's hand-typed placeholder
numbers, with all charts and the map built on Highcharts / Highcharts Maps.

## Run it

```bash
cd webapp
npm install
npm run dev       # dev server, http://localhost:5173
# or
npm run build && npm run preview   # production build
```

## What changed from the uploaded export

- **`src/useClimateData.ts`** replaces `src/data.ts`. It fetches and parses the raw
  CSVs in `public/data/` (copies of `../data/sea_temp.csv` and
  `../data/affected_people.csv`) at load time — every number on the page is
  computed from real data, nothing is hand-typed. It also assembles
  `MAP_COUNTRIES` — each reporting country's real annual ST_ANOM series paired
  with its real capital-city coordinates — for the map.
- **Removed with no replacement:** the RCP8.5-by-2100 warming projection (dumbbell
  chart) and the "land area at risk by 2100" bars. No dataset here supports either
  claim — the uploaded export's numbers for these were invented ("real-shaped"),
  and inventing precision the data doesn't have is exactly the trap this brief's
  honesty constraints warn against.
- **Replaced:** the Mo'orea coral-cover chart (also invented numbers) with a real
  SST-anomaly-vs-bleaching-threshold chart, reusing the same real ocean-heat series
  from beat ②, matching the framing already used in the vanilla build.
- **Charts:** all charts (GHG bar, temperature line, sea-level area, bleaching
  area, rainfall diverging bar) are built on Highcharts via a small wrapper
  (`src/HChart.tsx`) — Recharts has been dropped.
- **Map (`src/MapPanel.tsx`):** rebuilt on Highcharts Maps after the original
  MapLibre + Digital Earth Pacific vector-tile build stayed broken in the browser
  (likely a source-layer or basemap mismatch that couldn't be diagnosed without
  live network access to the tile server). The new map fetches a world topology
  once at runtime, plots one bubble per reporting country sized/coloured by real
  ST_ANOM, and includes:
  - a year slider + play/pause, styled after Highcharts' own "lightning strikes"
    animated-map demo — dragging or playing restyles the existing bubbles in
    place rather than reloading anything;
  - click-to-drill on any bubble to see that country's full measured history,
    styled after Highcharts' "population history by country" demo;
  - a second mode for the single verified Cyclone Winston (2016) event.
- Every dynamic number in the prose (GHG outliers, rainfall extremes, decadal
  temperature march, sea-level rise, the affected-people ranking) is computed
  from the loaded data rather than typed inline, so it can't drift out of sync
  with the CSVs.

## Notes

- The map fetches `https://code.highcharts.com/mapdata/custom/world.topo.json`
  at runtime — it needs a live network path to that CDN, same as any Highcharts
  Maps app. It won't render in a fully offline/sandboxed environment.
