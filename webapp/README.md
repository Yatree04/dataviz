# The Line That Moves — React build

This is the same "Line That Moves" Pacific climate story as the repo root, in the
visual language of the uploaded Figma Make UI (React + Vite + Recharts), wired to
the **real** SPC Pacific Data Hub data instead of that export's hand-typed
placeholder numbers, with a real MapLibre coastline map added (the uploaded UI had
none).

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
  computed from real data, nothing is hand-typed.
- **Removed with no replacement:** the RCP8.5-by-2100 warming projection (dumbbell
  chart) and the "land area at risk by 2100" bars. No dataset here supports either
  claim — the uploaded export's numbers for these were invented ("real-shaped"),
  and inventing precision the data doesn't have is exactly the trap this brief's
  honesty constraints warn against.
- **Replaced:** the Mo'orea coral-cover chart (also invented numbers) with a real
  SST-anomaly-vs-bleaching-threshold chart, reusing the same real ocean-heat series
  from beat ②, matching the framing already used in the vanilla build.
- **Added:** a real map section (`src/MapPanel.tsx`) — the year-scrubbed coastline,
  the erosion/accretion rates choropleth, and the Cyclone Winston marker, all from
  the same Digital Earth Pacific vector tiles the vanilla build uses. The uploaded
  UI had no map at all.
- Every dynamic number in the prose (GHG outliers, rainfall extremes, decadal
  temperature march, sea-level rise, the affected-people ranking) is now computed
  from the loaded data rather than typed inline, so it can't drift out of sync with
  the CSVs again.

## Notes

- MapLibre needs a real network path to `tileserver.prod.digitalearthpacific.io`
  and the `openfreemap.org` basemap — it won't render tiles in a sandboxed/offline
  environment, same as the vanilla build's map.
