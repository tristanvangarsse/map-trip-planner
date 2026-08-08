# Data folders

- `points/` — JSON arrays of coordinate-based locations.
- `regions/` — GeoJSON boundaries, polygons, lines, or mixed geometry.
- `statistics/` — non-geometric values joined to a region dataset by ISO3 or another stable identifier.
- `routes/` — route and workspace GeoJSON examples.

Keep paths relative to `index.html` when registering a dataset in `assets/js/app.js`.

The local population-density overlay is remote rather than stored in this folder. It reads the WorldPop 2020 1 km and 100 m ArcGIS ImageServer layers configured near the top of `assets/js/app.js`. The local `statistics/population-density-2023.json` file remains the country-average fallback.
