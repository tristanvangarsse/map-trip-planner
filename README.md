# Southeast Asia Map & Trip Planner

An interactive Leaflet-based map for exploring Southeast Asia and planning trips across the region.

**Live website:** https://southeast-asia-map.vangarsse.com

The project combines reference datasets with a lightweight browser-based trip planner. You can explore cities and travel-related points of interest, display geographic overlays, draw routes and shapes directly on the map, and save your work as GeoJSON.

## Features

### Reference overlays

The map includes a selector in the top-right corner that displays one reference dataset at a time.

Included datasets currently cover:

- major cities;
- vegan-friendly city shortlist;
- airports;
- railway hubs;
- ferry hubs;
- land border crossings;
- national parks and nature locations;
- Southeast Asian country polygons.

Point datasets are stored as JSON, while geographic regions and other complex geometry use GeoJSON.

### Trip planner

The built-in trip planner lets you create your own itinerary directly in the browser.

You can:

- add numbered route stops by clicking the map;
- drag stops to reposition them;
- rename stops and add notes;
- reorder or remove stops;
- automatically connect stops with a route line;
- draw additional markers, lines, rectangles, and polygons;
- edit or delete previously drawn geometry;
- import GeoJSON;
- export only your route or your complete workspace as GeoJSON.

The trip planner starts collapsed to keep the map interface uncluttered.

Your workspace is also saved automatically in the browser, so refreshing the page does not immediately remove your planning data.

> The route line represents a straight-line itinerary between stops. It does not currently calculate actual road, railway, ferry, or flight routes.

## Run locally

The website loads JSON and GeoJSON files using `fetch()`, so it should be served through a local web server instead of opening `index.html` directly with `file://`.

### Python

If Python is installed:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Node / npm

If you prefer Node:

```bash
npx serve .
```

Open the localhost URL shown in the terminal.

No build process is required. The website itself is plain HTML, CSS, and JavaScript.

## Project structure

The main files are:

```text
index.html
styles.css
app.js

*.json
*.geojson
sample-trip.geojson
```

### `index.html`

Contains the page structure and external Leaflet / mapping dependencies.

### `styles.css`

Contains the map UI, controls, marker styles, planner styling, and responsive layout.

### `app.js`

Contains most of the application logic, including:

- Leaflet map setup;
- reference overlays;
- dataset loading;
- marker rendering;
- country polygons;
- trip planner;
- route stops;
- drawing and editing;
- GeoJSON import/export;
- local browser storage.

### JSON files

Used primarily for point-based datasets such as cities, airports, parks, and transport hubs.

### GeoJSON files

Used for polygons, routes, boundaries, lines, or datasets containing multiple geometry types.

## Adding a point dataset

Create a JSON file containing objects with numeric latitude and longitude values.

Example:

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

Then register the dataset in `overlayDefinitions` near the top of `app.js`:

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

The `symbol` property is optional.

Without a symbol, the map can render the feature as a regular circle marker.

Some datasets also use special appearances:

```js
appearance: "city"
```

for city-style labels, or:

```js
appearance: "score"
```

for markers whose size is based on a numeric `score` property.

Supported coordinate property combinations include:

```text
lat / lon
latitude / longitude
lat / lng
```

## Loading a dataset without editing the code

For quick experiments, use:

**Load local JSON / GeoJSON…**

in the map's overlay selector.

The selected file is added temporarily as an overlay for the current browser session.

This is useful for testing new datasets before permanently registering them in `app.js`.

## Adding a region or GeoJSON dataset

GeoJSON is recommended for:

- country or province boundaries;
- national parks with polygon boundaries;
- travel regions;
- routes;
- railway or road lines;
- islands;
- mixed point / line / polygon datasets.

Place the GeoJSON file in the website directory and register it in `overlayDefinitions`.

Example:

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

GeoJSON feature labels are read from common properties such as:

```text
name
label
title
NAME_EN
NAME
ADMIN
```

## GeoJSON route format

A simple route can be represented as a GeoJSON `LineString`:

```json
{
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Example trip"
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [100.5018, 13.7563],
                    [98.9853, 18.7883],
                    [102.1347, 19.8833]
                ]
            }
        }
    ]
}
```

Remember that GeoJSON coordinates use:

```text
longitude, latitude
```

rather than latitude first.

## Data notes

The included datasets are intended primarily as trip-planning references rather than authoritative or exhaustive sources.

In particular:

- the vegan-friendly cities dataset is a curated starter shortlist rather than a live count of vegan restaurants;
- transport datasets are compact reference datasets rather than complete networks;
- nature and park datasets are not exhaustive;
- country polygons are intended for visualization and map context;
- border crossings, transport schedules, visa requirements, prices, opening hours, and travel conditions can change.

Always verify important travel information with current authoritative sources before travelling.

## Ideas for future development

Possible additions include:

- actual road / rail / ferry routing between trip stops;
- distance and travel-time estimation;
- accommodation and cost datasets;
- climate or rainfall overlays by month;
- visa and entry-information overlays;
- live OpenStreetMap queries;
- vegan restaurant counts derived from OpenStreetMap;
- public transport network data;
- filtering datasets by country;
- configurable marker colors and sizes;
- multiple simultaneously visible reference overlays;
- shareable trip URLs;
- cloud or account-based trip saving.

## Built with

- HTML
- CSS
- JavaScript
- Leaflet
- Leaflet-Geoman
- GeoJSON

## License

Add the project license here if you plan to make the repository publicly reusable.

If third-party geographic datasets are added, make sure their individual licenses and attribution requirements are also documented.
