# Southeast Asia map and trip planner

A static Leaflet website with:

- a top-right selector that displays **one reference dataset at a time**;
- point JSON overlays for cities, a vegan-friendly shortlist, airports, rail hubs, ferry hubs, land crossings, and parks;
- a real GeoJSON polygon overlay for Southeast Asian countries;
- numbered, draggable route stops with an automatically connected route line;
- extra point, line, rectangle, and polygon drawing/editing through Leaflet-Geoman;
- import and export of route/workspace GeoJSON;
- automatic local browser saving.

## Run it locally

The page loads JSON with `fetch()`, so serve the directory instead of opening `index.html` directly from `file://`.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Using the trip planner

1. Select **Add route stops**, then click the map for each stop.
2. Drag a numbered stop to move it. Click it to edit its name, notes, or order.
3. Use the small drawing toolbar at top-left for extra markers, lines, rectangles, and polygons. Its edit, drag, and removal modes apply to those extra drawings.
4. Select **Export route** for only the itinerary, or **Export all** for the route plus all extra drawings.
5. **Import GeoJSON** restores files exported by the site. Ordinary third-party GeoJSON is imported as editable extra drawings.

The route line is a straight-line itinerary. It does not follow roads, railways, ferries, or flight paths.

## Adding another point overlay

Create a JSON array containing numeric `lat` and `lon` values. Other properties are optional and appear in popups when supported.

```json
[
  {
    "name": "Example place",
    "country": "Thailand",
    "lat": 13.7563,
    "lon": 100.5018,
    "summary": "Why this place matters for the trip."
  }
]
```

Register it in `overlayDefinitions` near the top of `app.js`:

```js
{
    id: "example-places",
    name: "Example places",
    type: "points",
    file: "example-places.json",
    symbol: "●",
    description: "A short explanation shown under the selector.",
}
```

`symbol` is optional. Without it, points are rendered as circles. Use `appearance: "city"` for permanent city-style labels or `appearance: "score"` for markers sized using a numeric `score` property.

For quick testing, use **Load local JSON / GeoJSON…** in the top-right selector. The file is added as a temporary radio option for the current browser session; no code edit is required. Point arrays may use `lat`/`lon`, `latitude`/`longitude`, or `lat`/`lng`.

## Adding a region, line, or mixed GeoJSON overlay

GeoJSON is the recommended format for polygons, administrative areas, lines, or mixed geometry. Put the file next to `index.html`, then register it:

```js
{
    id: "provinces",
    name: "Provinces",
    type: "geojson",
    file: "provinces.geojson",
    description: "Administrative level-one boundaries.",
    style: {
        color: "#202b35",
        weight: 1,
        fillColor: "#7aa6c2",
        fillOpacity: 0.3,
    },
}
```

GeoJSON labels are read from `properties.name`, `label`, `title`, `NAME_EN`, `NAME`, or `ADMIN`.

## Data notes

- `southeast-asia-countries.geojson` is extracted from the Natural Earth-style country file that was already bundled with the supplied project. It contains the 11 sovereign Southeast Asian countries in that source.
- The transport and nature files are compact planning reference points, not exhaustive datasets.
- `vegan-friendly-cities.json` is deliberately a starter shortlist with broad 1–5 planning scores, not a live restaurant count. Edit it as your research develops and verify current venues before travel.
- Border availability, visa rules, transport timetables, safety conditions, prices, and venue opening status can change. Treat these files as map references rather than official travel advice.

## Main files

- `index.html` — page shell and CDN dependencies.
- `styles.css` — map controls and marker styling.
- `app.js` — overlays, route editor, GeoJSON import/export, and local saving.
- `*.json` — point datasets.
- `southeast-asia-countries.geojson` — polygon region example and border layer.
- `sample-trip.geojson` — importable three-stop route example.
