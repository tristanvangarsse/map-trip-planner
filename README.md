# Southeast Asia Map & Trip Planner

A static Leaflet website for exploring Southeast Asia, comparing travel-related reference data, and sketching an itinerary directly in the browser.

**Live website:** https://southeast-asia-map.vangarsse.com

## Features

### Independent map overlays

The top-right **Map data** control starts collapsed. Expand it to turn any combination of reference layers on or off independently:

- major cities;
- vegan-friendly city shortlist;
- major airports;
- rail hubs;
- ferry hubs;
- land border crossings;
- national parks and nature locations;
- local population density at 1 km and 100 m resolution;
- population density by country (legacy comparison);
- Southeast Asian country polygons.

Several layers can remain visible together, and each one can be disabled without affecting the others. You can also load a local JSON or GeoJSON file temporarily without editing the project.

Population-density legends start collapsed and can be expanded when needed.

### Local population density

The default **Local population density (100 m)** overlay uses WorldPop gridded population-density estimates instead of applying one number to an entire country.

- At regional zoom levels, the app displays the lighter 1 km WorldPop grid.
- At zoom level 9 and above, it automatically switches to the 100 m grid for towns, communes, cities, and neighbourhoods.
- Click any visible grid cell for its estimated people per square kilometre.
- The legend reports which resolution is active and includes an opacity slider.
- The map can zoom to level 17 and uses CARTO Voyager map tiles based on OpenStreetMap data. Place labels are rendered in their own pane above reference layers so city and town names remain readable.

The detailed layer uses WorldPop's 2020 global density services:

```text
https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_1km/ImageServer
https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_100m/ImageServer
```

These are modelled raster estimates, not official commune totals or a substitute for a national census. An internet connection is required because the raster is requested from the WorldPop/Esri image services at runtime.

The original **Country-average density (2023)** World Bank choropleth remains available for comparison. Its local values are stored in:

```text
data/statistics/population-density-2023.json
```

Source: World Bank Open Data indicator `EN.POP.DNST` — Population density (people per sq. km of land area):

https://data.worldbank.org/indicator/EN.POP.DNST

### Trip planner

The bottom-right trip planner starts collapsed. Expand it to:

- keep multiple routes visible on the same map;
- create new routes with automatically contrasting colours;
- switch, rename, clear, or delete an active route;
- add numbered route stops by clicking the map;
- drag stops to reposition them;
- rename stops and add notes;
- reorder or remove stops;
- draw extra markers, lines, rectangles, and polygons;
- edit or delete drawn geometry;
- import GeoJSON;
- export the active route or the complete multi-route workspace as GeoJSON.

Each route is a straight-line itinerary. The app does not calculate road, rail, ferry, or flight paths.

The complete workspace is automatically saved in the browser using `localStorage`. Version 2 single-route browser saves and exports are migrated when loaded.

## Run locally

The site loads local datasets through `fetch()`, so serve the project directory instead of opening `index.html` directly with `file://`.

### Python

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Node / npm

```bash
npx serve .
```

Open the localhost address printed in the terminal.

There is no build step. The project is plain HTML, CSS, JavaScript, JSON, and GeoJSON.

## Project structure

```text
.
├── index.html
├── README.md
├── .gitignore
├── .nojekyll
├── assets
│   ├── css
│   │   └── styles.css
│   └── js
│       └── app.js
└── data
    ├── README.md
    ├── points
    │   ├── cities.json
    │   ├── ferry-hubs.json
    │   ├── land-border-crossings.json
    │   ├── major-airports.json
    │   ├── national-parks.json
    │   ├── rail-hubs.json
    │   └── vegan-friendly-cities.json
    ├── regions
    │   └── southeast-asia-countries.geojson
    ├── routes
    │   └── sample-trip.geojson
    └── statistics
        └── population-density-2023.json
```

### Root files

- `index.html` loads Leaflet, Esri Leaflet, Leaflet-Geoman, the stylesheet, and the application script.
- `README.md` documents the project.
- `.nojekyll` keeps GitHub Pages from applying Jekyll processing.
- `.gitignore` excludes common local operating-system files.

### `assets/`

- `assets/css/styles.css` contains the map controls, marker styles, planner UI, popups, and both population-density legends.
- `assets/js/app.js` contains map setup, label-rich basemap rendering, zoom-aware WorldPop rasters, independently toggled overlays, multi-route editing, drawing tools, import/export, and browser saving.

### `data/`

- `data/points/` contains coordinate-based JSON datasets.
- `data/regions/` contains polygon or other geographic boundary datasets.
- `data/statistics/` contains indicator values joined to geographic features by an identifier such as ISO3.
- `data/routes/` contains example or saved route GeoJSON files.

## Adding a point overlay

Create a JSON array in `data/points/` with numeric latitude and longitude values:

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

Register it in `overlayDefinitions` near the top of `assets/js/app.js`:

```js
{
    id: "example-places",
    name: "Example places",
    type: "points",
    file: "data/points/example-places.json",
    symbol: "●",
    description: "A short explanation shown under the selector.",
}
```

Supported coordinate combinations are:

```text
lat / lon
latitude / longitude
lat / lng
```

`symbol` is optional. Without it, points are rendered as circle markers.

Special appearances currently supported by the existing renderer include:

```js
appearance: "city"
```

for city-style labels, and:

```js
appearance: "score"
```

for circle markers sized using a numeric `score` property.

## Adding a polygon, line, or mixed GeoJSON overlay

Place the file in `data/regions/` and register it in `overlayDefinitions`:

```js
{
    id: "provinces",
    name: "Provinces",
    type: "geojson",
    file: "data/regions/provinces.geojson",
    description: "Administrative level-one boundaries.",
    style: {
        color: "#202b35",
        weight: 1,
        fillColor: "#7aa6c2",
        fillOpacity: 0.3,
    },
}
```

GeoJSON labels are read from common properties including:

```text
name
label
title
NAME_EN
NAME
ADMIN
```

GeoJSON coordinates use longitude first:

```text
[longitude, latitude]
```

## Updating the population-density data

Edit:

```text
data/statistics/population-density-2023.json
```

Each country record uses an ISO3 code that matches `ISO_A3` in the country GeoJSON:

```json
{
    "iso3": "THA",
    "name": "Thailand",
    "value": 140.35
}
```

When changing to a newer year:

1. replace the country values;
2. update the top-level `year` field;
3. rename the file if desired;
4. update `POPULATION_DENSITY_FILE` in `assets/js/app.js`;
5. update the overlay name and description if the displayed year changed.

The choropleth thresholds and colours are defined in `DENSITY_CLASSES` in `assets/js/app.js`.

## Loading a local dataset

Use **Load local JSON / GeoJSON…** in the top-right control.

A loaded file is available only for the current browser session. To make it permanent, place it in the appropriate `data/` folder and add it to `overlayDefinitions`.

## Data notes

The bundled datasets are compact planning references, not exhaustive or authoritative travel databases.

- Vegan-friendly city scores are a starter shortlist, not live restaurant counts.
- Transport and nature datasets contain selected locations only.
- Country population density does not show variation within a country.
- Border openings, visa rules, schedules, prices, safety conditions, and venue status can change.

Verify important travel information with current authoritative sources before travelling.

## Deployment

The project can be deployed directly from the repository root with GitHub Pages:

```text
Branch: main
Folder: / (root)
```

The custom domain is configured in GitHub Pages settings. Cloudflare can remain the DNS provider or proxy, depending on the domain configuration.

The query strings on the local CSS and JavaScript references in `index.html` are cache-busting version values. Update them after future asset changes when aggressive browser or CDN caching is a concern.

## Built with

- HTML
- CSS
- JavaScript
- Leaflet
- Leaflet-Geoman
- GeoJSON

## License and attribution

Add a code license before presenting the repository as generally reusable.

Keep attribution and usage terms for external map tiles and datasets. The basemap displays OpenStreetMap and CARTO attribution. The local density layer identifies WorldPop/Esri, and the country-level density file records its World Bank source.
