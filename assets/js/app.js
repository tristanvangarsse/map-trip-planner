(() => {
    "use strict";

    const SEA_BOUNDS = [
        [-12, 91],
        [29, 142],
    ];
    const STORAGE_KEY = "southeast-asia-trip-workspace-v3";
    const LEGACY_STORAGE_KEY = "southeast-asia-trip-workspace-v2";
    const REGION_FILE = "data/regions/southeast-asia-countries.geojson";
    const POPULATION_DENSITY_FILE =
        "data/statistics/population-density-2023.json";
    const WORLDPOP_DENSITY_1KM_URL =
        "https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_1km/ImageServer";
    const WORLDPOP_DENSITY_100M_URL =
        "https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Population_Density_100m/ImageServer";
    const WORLDPOP_DENSITY_YEAR = 2020;
    const WORLDPOP_DETAIL_ZOOM = 9;

    const map = L.map("map", {
        zoomControl: true,
        minZoom: 3,
        maxZoom: 17,

        // Allow smooth fractional zooming.
        zoomSnap: 0,

        // We handle trackpad/mouse zoom ourselves.
        scrollWheelZoom: false,

        maxBounds: [
            [-28, 70],
            [45, 165],
        ],
        maxBoundsViscosity: 0.65,
    });

    map.fitBounds(SEA_BOUNDS);

    const mapContainer = map.getContainer();

    /*
     * Custom MacBook / trackpad zoom.
     *
     * Increase TRACKPAD_ZOOM_SPEED if you want a stronger zoom.
     * 0.025 = moderate
     * 0.04  = strong
     * 0.06  = very strong
     */
    const TRACKPAD_ZOOM_SPEED = 0.3;

    mapContainer.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();

            const currentZoom = map.getZoom();

            let zoomDelta;

            if (event.ctrlKey) {
                /*
                 * macOS pinch-to-zoom.
                 *
                 * Pinch events usually have relatively small deltaY values,
                 * so amplify them substantially.
                 */
                zoomDelta = -event.deltaY * TRACKPAD_ZOOM_SPEED;
            } else {
                /*
                 * Normal two-finger vertical scrolling / mouse wheel.
                 * Make each gesture fairly strong too.
                 */
                zoomDelta = -Math.sign(event.deltaY) * 0.65;
            }

            const newZoom = Math.max(
                map.getMinZoom(),
                Math.min(map.getMaxZoom(), currentZoom + zoomDelta),
            );

            const point = map.mouseEventToContainerPoint(event);

            map.setZoomAround(point, newZoom);
        },
        {
            passive: false,
        },
    );

    createPane("whiteOverlay", 250, "none");
    createPane("dataOverlay", 450, "auto");
    createPane("countryBorders", 525, "none");
    createPane("placeLabels", 575, "none");
    createPane("plannerOverlay", 650, "auto");

    const cartoAttribution =
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    const cartoTileOptions = {
        subdomains: "abcd",
        maxZoom: 20,
        maxNativeZoom: 20,
    };

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
        {
            ...cartoTileOptions,
            attribution: cartoAttribution,
        },
    ).addTo(map);

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
        {
            ...cartoTileOptions,
            pane: "placeLabels",
            attribution: "",
            interactive: false,
        },
    ).addTo(map);

    L.rectangle(
        [
            [-90, -180],
            [90, 180],
        ],
        {
            pane: "whiteOverlay",
            stroke: false,
            fillColor: "#ffffff",
            fillOpacity: 0.06,
            interactive: false,
            pmIgnore: true,
        },
    ).addTo(map);

    const jsonCache = new Map();
    const loadedOverlays = new Map();
    const activeOverlays = new Map();
    const overlayToggleSerials = new Map();

    const overlayDefinitions = [
        {
            id: "cities",
            name: "Major cities",
            type: "points",
            file: "data/points/cities.json",
            appearance: "city",
            permanentLabels: true,
            description: "Reference city labels from the original map.",
        },
        {
            id: "vegan-cities",
            name: "Vegan-friendly city shortlist",
            type: "points",
            file: "data/points/vegan-friendly-cities.json",
            appearance: "score",
            description:
                "Starter planning scores, not live restaurant counts. Click a city for notes and verify venues before travel.",
        },
        {
            id: "airports",
            name: "Major airports",
            type: "points",
            file: "data/points/major-airports.json",
            symbol: "✈",
            description:
                "Major international and regional airport reference points.",
        },
        {
            id: "rail-hubs",
            name: "Rail hubs",
            type: "points",
            file: "data/points/rail-hubs.json",
            symbol: "▥",
            description:
                "Selected intercity and cross-border railway stations.",
        },
        {
            id: "ferry-hubs",
            name: "Ferry hubs",
            type: "points",
            file: "data/points/ferry-hubs.json",
            symbol: "⚓",
            description:
                "Selected ferry terminals useful for island and cross-border planning.",
        },
        {
            id: "border-crossings",
            name: "Land border crossings",
            type: "points",
            file: "data/points/land-border-crossings.json",
            symbol: "↔",
            description:
                "Geographic reference only. Opening status, visas and local conditions can change.",
        },
        {
            id: "parks",
            name: "National parks and nature",
            type: "points",
            file: "data/points/national-parks.json",
            symbol: "▲",
            description:
                "Selected parks and natural areas shown by approximate centre point.",
        },
        {
            id: "population-density-local",
            name: "Local population density (100 m)",
            type: "population-density-grid",
            lowResolutionUrl: WORLDPOP_DENSITY_1KM_URL,
            highResolutionUrl: WORLDPOP_DENSITY_100M_URL,
            year: WORLDPOP_DENSITY_YEAR,
            switchZoom: WORLDPOP_DETAIL_ZOOM,
            description:
                "Local WorldPop density estimates. The map uses a 1 km grid at regional zoom and automatically switches to a 100 m grid around towns, communes and neighbourhoods. Click the map for the estimated value.",
        },
        {
            id: "population-density",
            name: "Country-average density (2023)",
            type: "population-density",
            file: POPULATION_DENSITY_FILE,
            regionFile: REGION_FILE,
            description:
                "Country-level World Bank average. Use the local density layer above for town, commune and neighbourhood detail.",
        },
        {
            id: "countries",
            name: "Countries (region polygons)",
            type: "geojson",
            file: REGION_FILE,
            description:
                "Real country polygons. This is the model to use for administrative or other region-shaped datasets.",
            style(feature) {
                const name = getFeatureName(feature);
                return {
                    color: "#202b35",
                    weight: 1.2,
                    fillColor: colorForName(name),
                    fillOpacity: 0.4,
                };
            },
        },
    ];

    loadJson(REGION_FILE)
        .then((data) => {
            L.geoJSON(data, {
                pane: "countryBorders",
                interactive: false,
                style: {
                    color: "#111820",
                    weight: 1,
                    fillOpacity: 0,
                },
                onEachFeature(_feature, layer) {
                    layer.options.pmIgnore = true;
                },
            }).addTo(map);
        })
        .catch((error) => console.error(error));

    function createPane(name, zIndex, pointerEvents) {
        const pane = map.createPane(name);
        pane.style.zIndex = String(zIndex);
        pane.style.pointerEvents = pointerEvents;
        return pane;
    }

    async function loadJson(file) {
        if (!jsonCache.has(file)) {
            jsonCache.set(
                file,
                fetch(file).then((response) => {
                    if (!response.ok) {
                        throw new Error(`Could not load ${file}`);
                    }
                    return response.json();
                }),
            );
        }
        return jsonCache.get(file);
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getFeatureName(feature) {
        const properties = feature?.properties || {};
        return (
            properties.name ||
            properties.label ||
            properties.title ||
            properties.NAME_EN ||
            properties.NAME ||
            properties.ADMIN ||
            "Region"
        );
    }

    function colorForName(name) {
        const countryColors = {
            Brunei: "#ffb300",
            Cambodia: "#ff3300",
            Indonesia: "#00ff66",
            Laos: "#ffe600",
            Malaysia: "#8c00ff",
            Myanmar: "#ff9100",
            Philippines: "#fd0098",
            Singapore: "#73ff00",
            Thailand: "#0400ff",
            "East Timor": "#fffb00",
            Vietnam: "#00fcfc",
        };

        return countryColors[name] || "#999999";
    }

    function propertyRows(properties, excludedKeys, options = {}) {
        const limit = options.limit || 12;
        const lowercaseOnly = Boolean(options.lowercaseOnly);
        const entries = Object.entries(properties || {})
            .filter(([key, value]) => {
                if (
                    excludedKeys.has(key) ||
                    value === null ||
                    value === undefined ||
                    value === ""
                ) {
                    return false;
                }
                if (lowercaseOnly && /^[A-Z0-9_]+$/.test(key)) return false;
                return true;
            })
            .slice(0, limit);

        if (!entries.length) return "";
        const rows = entries
            .map(([key, value]) => {
                const shown =
                    typeof value === "object" ? JSON.stringify(value) : value;
                return `<tr><th>${escapeHtml(key.replaceAll("_", " "))}</th><td>${escapeHtml(shown)}</td></tr>`;
            })
            .join("");
        return `<table class="data-popup__properties">${rows}</table>`;
    }

    function buildPointPopup(item) {
        const title = escapeHtml(
            item.name || item.label || item.title || "Map point",
        );
        const country = escapeHtml(item.country || item.countries || "");
        const code = item.code ? ` · ${escapeHtml(item.code)}` : "";
        const summary =
            item.summary || item.description
                ? `<div>${escapeHtml(item.summary || item.description)}</div>`
                : "";
        const numericScore = Number(item.score);
        const score = Number.isFinite(numericScore)
            ? `<div class="data-popup__score">Score: ${escapeHtml(numericScore)}</div>`
            : "";
        const note =
            item.planningNote || item.note
                ? `<div class="data-popup__note">${escapeHtml(item.planningNote || item.note)}</div>`
                : "";
        const extras = propertyRows(
            item,
            new Set([
                "name",
                "label",
                "title",
                "lat",
                "lon",
                "latitude",
                "longitude",
                "lng",
                "country",
                "countries",
                "code",
                "summary",
                "description",
                "score",
                "planningNote",
                "note",
            ]),
        );

        return `<div class="data-popup">
            <div class="data-popup__title">${title}</div>
            ${country || code ? `<div class="data-popup__meta">${country}${code}</div>` : ""}
            ${score}${summary}${note}${extras}
        </div>`;
    }

    function buildRegionPopup(feature) {
        const properties = feature?.properties || {};
        const name = escapeHtml(getFeatureName(feature));
        const formal = properties.FORMAL_EN
            ? escapeHtml(properties.FORMAL_EN)
            : "";
        const iso = properties.ISO_A3 ? escapeHtml(properties.ISO_A3) : "";
        const description =
            properties.description || properties.summary || properties.note;
        const category =
            properties.category || properties.country || properties.countries;
        const extras = propertyRows(
            properties,
            new Set([
                "name",
                "label",
                "title",
                "NAME_EN",
                "NAME",
                "ADMIN",
                "FORMAL_EN",
                "ISO_A3",
                "description",
                "summary",
                "note",
                "category",
                "country",
                "countries",
            ]),
            { lowercaseOnly: true },
        );
        return `<div class="data-popup">
            <div class="data-popup__title">${name}</div>
            ${formal && formal !== name ? `<div>${formal}</div>` : ""}
            ${category ? `<div class="data-popup__meta">${escapeHtml(category)}</div>` : ""}
            ${iso ? `<div class="data-popup__meta">ISO: ${iso}</div>` : ""}
            ${description ? `<div>${escapeHtml(description)}</div>` : ""}
            ${extras}
        </div>`;
    }

    const DENSITY_CLASSES = [
        { min: 0, max: 50, label: "Under 50", color: "#ffffcc" },
        { min: 50, max: 100, label: "50–99", color: "#ffeda0" },
        { min: 100, max: 150, label: "100–149", color: "#fed976" },
        { min: 150, max: 300, label: "150–299", color: "#feb24c" },
        { min: 300, max: 500, label: "300–499", color: "#fd8d3c" },
        { min: 500, max: 1000, label: "500–999", color: "#e31a1c" },
        { min: 1000, max: Infinity, label: "1,000+", color: "#800026" },
    ];

    function densityClassForValue(value) {
        if (!Number.isFinite(value)) return null;
        return (
            DENSITY_CLASSES.find(
                (item) => value >= item.min && value < item.max,
            ) || DENSITY_CLASSES.at(-1)
        );
    }

    function densityColor(value) {
        return densityClassForValue(value)?.color || "#d4d9df";
    }

    function numericDensity(value) {
        if (value === null || value === undefined || value === "") return NaN;
        const number = Number(value);
        return Number.isFinite(number) ? number : NaN;
    }

    function formatDensity(value) {
        if (!Number.isFinite(value)) return "No data";
        return new Intl.NumberFormat("en", {
            maximumFractionDigits: value >= 1000 ? 0 : 1,
        }).format(value);
    }

    function buildPopulationDensityPopup(record, dataset) {
        const name = escapeHtml(record?.name || "Country");
        const value = numericDensity(record?.value);
        const year = escapeHtml(dataset.year || "");
        const indicator = escapeHtml(dataset.indicator || "");
        const unit = escapeHtml(
            dataset.unit || "people per sq. km of land area",
        );
        const source = escapeHtml(dataset.source || "Source");
        const sourceUrl = escapeHtml(dataset.sourceUrl || "");

        return `<div class="data-popup density-popup">
            <div class="data-popup__title">${name}</div>
            <div class="density-popup__value">${formatDensity(value)}</div>
            <div class="data-popup__meta">${unit}${year ? ` · ${year}` : ""}</div>
            ${indicator ? `<div class="density-popup__indicator">Indicator: ${indicator}</div>` : ""}
            ${sourceUrl ? `<a class="density-popup__source" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${source}</a>` : `<div>${source}</div>`}
        </div>`;
    }

    function enableLegendCollapse(container) {
        const button = container.querySelector(".density-legend__collapse");
        if (!button) return;
        button.addEventListener("click", () => {
            const collapsed = container.classList.toggle(
                "density-legend--collapsed",
            );
            button.textContent = collapsed ? "+" : "−";
            button.setAttribute("aria-expanded", String(!collapsed));
            button.setAttribute(
                "aria-label",
                collapsed ? "Expand map legend" : "Collapse map legend",
            );
        });
    }

    function createPopulationDensityLegend(dataset) {
        const control = L.control({ position: "bottomleft" });
        control.onAdd = () => {
            const container = L.DomUtil.create(
                "div",
                "density-legend density-legend--collapsed",
            );
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            const rows = DENSITY_CLASSES.map(
                (item) => `<div class="density-legend__row">
                    <span class="density-legend__swatch" style="background:${item.color}"></span>
                    <span>${item.label}</span>
                </div>`,
            ).join("");
            const sourceUrl = escapeHtml(dataset.sourceUrl || "");
            const source = escapeHtml(dataset.source || "World Bank Open Data");

            container.innerHTML = `
                <div class="density-legend__heading">
                    <div class="density-legend__title">Population density</div>
                    <button class="control-collapse density-legend__collapse" type="button" aria-label="Expand map legend" aria-expanded="false">+</button>
                </div>
                <div class="density-legend__body">
                    <div class="density-legend__unit">People/km² · ${escapeHtml(dataset.year || "")}</div>
                    ${rows}
                    ${sourceUrl ? `<a class="density-legend__source" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Source: ${source}</a>` : ""}
                </div>
            `;
            enableLegendCollapse(container);
            return container;
        };
        return control;
    }

    const LOCAL_DENSITY_CLASSES = [
        { min: 0, max: 5, label: "Under 5", color: "#fff7ec" },
        { min: 5, max: 25, label: "5–24", color: "#fee8c8" },
        { min: 25, max: 100, label: "25–99", color: "#fdd49e" },
        { min: 100, max: 500, label: "100–499", color: "#fdbb84" },
        { min: 500, max: 2500, label: "500–2,499", color: "#fc8d59" },
        { min: 2500, max: 10000, label: "2,500–9,999", color: "#ef6548" },
        { min: 10000, max: 30000, label: "10,000–29,999", color: "#d7301f" },
        { min: 30000, max: Infinity, label: "30,000+", color: "#7f0000" },
    ];

    const WORLDPOP_DENSITY_RENDERING_RULE = {
        rasterFunction: "Colormap",
        rasterFunctionArguments: {
            Colormap: LOCAL_DENSITY_CLASSES.map((item, index) => {
                const rgb = item.color
                    .slice(1)
                    .match(/.{2}/g)
                    .map((channel) => Number.parseInt(channel, 16));
                return [index + 1, ...rgb];
            }),
            Raster: {
                rasterFunction: "Remap",
                rasterFunctionArguments: {
                    InputRanges: [
                        0.000001, 5, 5, 25, 25, 100, 100, 500, 500, 2500, 2500,
                        10000, 10000, 30000, 30000, 5000000,
                    ],
                    OutputValues: [1, 2, 3, 4, 5, 6, 7, 8],
                    AllowUnmatched: false,
                    Raster: "$$",
                },
                outputPixelType: "U8",
            },
        },
        outputPixelType: "U8",
    };

    function rawPixelValue(results) {
        const raw = results?.pixel?.properties?.value;
        if (Array.isArray(raw)) return numericDensity(raw[0]);
        if (typeof raw === "string" && raw.includes(",")) {
            return numericDensity(raw.split(",")[0]);
        }
        return numericDensity(raw);
    }

    function buildLocalDensityPopup(results, definition, resolution) {
        const value = rawPixelValue(results);
        const coordinates = results?.pixel?.geometry?.coordinates;
        const position =
            Array.isArray(coordinates) && coordinates.length >= 2
                ? `<div class="density-popup__position">${Number(coordinates[1]).toFixed(4)}, ${Number(coordinates[0]).toFixed(4)}</div>`
                : "";

        if (!Number.isFinite(value) || value <= 0) {
            return `<div class="data-popup density-popup">
                <div class="data-popup__title">Local population density</div>
                <div class="density-popup__empty">No mapped residential population at this pixel.</div>
                <div class="data-popup__meta">WorldPop ${escapeHtml(definition.year)} · ${escapeHtml(resolution)}</div>
                ${position}
            </div>`;
        }

        return `<div class="data-popup density-popup">
            <div class="data-popup__title">Local population density</div>
            <div class="density-popup__value">${formatDensity(value)}</div>
            <div class="data-popup__meta">estimated people/km² · WorldPop ${escapeHtml(definition.year)}</div>
            <div class="density-popup__resolution">Grid resolution: ${escapeHtml(resolution)}</div>
            ${position}
            <a class="density-popup__source" href="${escapeHtml(definition.highResolutionUrl)}" target="_blank" rel="noopener noreferrer">Open WorldPop service details</a>
        </div>`;
    }

    function createLocalDensityLegend(definition, layer) {
        const control = L.control({ position: "bottomleft" });
        let container = null;
        let status = null;
        let zoomHandler = null;

        const updateStatus = () => {
            if (!status) return;
            const detailed = map.getZoom() >= definition.switchZoom;
            status.textContent = detailed
                ? "100 m local grid active"
                : `1 km regional grid · zoom to ${definition.switchZoom}+ for 100 m detail`;
            status.classList.toggle("is-detailed", detailed);
        };

        control.onAdd = () => {
            container = L.DomUtil.create(
                "div",
                "density-legend density-legend--local density-legend--collapsed",
            );
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            const rows = LOCAL_DENSITY_CLASSES.map(
                (item) => `<div class="density-legend__row">
                    <span class="density-legend__swatch" style="background:${item.color}"></span>
                    <span>${item.label}</span>
                </div>`,
            ).join("");

            container.innerHTML = `
                <div class="density-legend__heading">
                    <div class="density-legend__title">Local population density</div>
                    <button class="control-collapse density-legend__collapse" type="button" aria-label="Expand map legend" aria-expanded="false">+</button>
                </div>
                <div class="density-legend__body">
                    <div class="density-legend__unit">Estimated people/km² · ${escapeHtml(definition.year)}</div>
                    <div class="density-legend__status" role="status"></div>
                    ${rows}
                    <label class="density-legend__opacity">
                        <span>Layer opacity</span>
                        <input type="range" min="25" max="95" value="68" step="1" aria-label="Population-density layer opacity" />
                    </label>
                    <div class="density-legend__hint">Click any visible cell for its estimate. Values are modelled grid estimates, not administrative-boundary totals.</div>
                    <a class="density-legend__source" href="${escapeHtml(definition.highResolutionUrl)}" target="_blank" rel="noopener noreferrer">Source: WorldPop / Esri</a>
                </div>
            `;

            enableLegendCollapse(container);
            status = container.querySelector(".density-legend__status");
            const opacity = container.querySelector(
                ".density-legend__opacity input",
            );
            opacity.addEventListener("input", () => {
                layer.setDensityOpacity(Number(opacity.value) / 100);
            });

            zoomHandler = updateStatus;
            map.on("zoomend", zoomHandler);
            updateStatus();
            return container;
        };

        control.onRemove = () => {
            if (zoomHandler) map.off("zoomend", zoomHandler);
            zoomHandler = null;
            container = null;
            status = null;
        };

        return control;
    }

    function renderPopulationDensityGridOverlay(definition) {
        if (!L.esri?.imageMapLayer) {
            throw new Error(
                "The local density service could not start because Esri Leaflet did not load.",
            );
        }

        const yearStart = new Date(Date.UTC(definition.year, 0, 1));
        const yearEnd = new Date(Date.UTC(definition.year, 11, 31, 23, 59, 59));
        const commonOptions = {
            pane: "dataOverlay",
            opacity: 0.68,
            format: "png32",
            noData: 0,
            from: yearStart,
            to: yearEnd,
            useCors: true,
            renderingRule: WORLDPOP_DENSITY_RENDERING_RULE,
        };

        const regionalLayer = L.esri.imageMapLayer({
            ...commonOptions,
            url: definition.lowResolutionUrl,
        });
        const detailedLayer = L.esri.imageMapLayer({
            ...commonOptions,
            url: definition.highResolutionUrl,
        });

        regionalLayer.options.pmIgnore = true;
        detailedLayer.options.pmIgnore = true;
        regionalLayer.bindPopup((error, results) => {
            if (error || !results?.pixel) return false;
            return buildLocalDensityPopup(results, definition, "1 km");
        });
        detailedLayer.bindPopup((error, results) => {
            if (error || !results?.pixel) return false;
            return buildLocalDensityPopup(results, definition, "100 m");
        });

        const group = L.layerGroup([], { pmIgnore: true });
        let activeResolutionLayer = null;

        const syncResolution = () => {
            if (!group._map) return;
            const nextLayer =
                map.getZoom() >= definition.switchZoom
                    ? detailedLayer
                    : regionalLayer;
            if (nextLayer === activeResolutionLayer) return;
            if (
                activeResolutionLayer &&
                group.hasLayer(activeResolutionLayer)
            ) {
                group.removeLayer(activeResolutionLayer);
            }
            group.addLayer(nextLayer);
            activeResolutionLayer = nextLayer;
        };

        group.on("add", () => {
            map.on("zoomend", syncResolution);
            syncResolution();
        });
        group.on("remove", () => {
            map.off("zoomend", syncResolution);
            if (
                activeResolutionLayer &&
                group.hasLayer(activeResolutionLayer)
            ) {
                group.removeLayer(activeResolutionLayer);
            }
            activeResolutionLayer = null;
        });

        group.setDensityOpacity = (opacity) => {
            regionalLayer.setOpacity(opacity);
            detailedLayer.setOpacity(opacity);
        };
        group._mapDataControl = createLocalDensityLegend(definition, group);
        return group;
    }

    function renderPopulationDensityOverlay(dataset, regions, definition) {
        if (!Array.isArray(dataset?.countries)) {
            throw new Error(
                `${definition.file} must contain a countries array`,
            );
        }

        const byIso = new Map(
            dataset.countries.map((record) => [
                String(record.iso3 || "").toUpperCase(),
                record,
            ]),
        );

        const styleForFeature = (feature) => {
            const iso = String(
                feature?.properties?.ISO_A3 ||
                    feature?.properties?.ADM0_A3 ||
                    "",
            ).toUpperCase();
            const value = numericDensity(byIso.get(iso)?.value);
            return {
                color: "#3d4650",
                weight: 1.1,
                opacity: 0.9,
                fillColor: densityColor(value),
                fillOpacity: Number.isFinite(value) ? 0.82 : 0.35,
            };
        };

        const layer = L.geoJSON(regions, {
            pane: "dataOverlay",
            style: styleForFeature,
            onEachFeature(feature, featureLayer) {
                featureLayer.options.pmIgnore = true;
                const iso = String(
                    feature?.properties?.ISO_A3 ||
                        feature?.properties?.ADM0_A3 ||
                        "",
                ).toUpperCase();
                const record = byIso.get(iso) || {
                    name: getFeatureName(feature),
                    value: null,
                };
                const value = numericDensity(record.value);
                const tooltipValue = Number.isFinite(value)
                    ? `${formatDensity(value)} people/km²`
                    : "No data";

                featureLayer.bindTooltip(
                    `${record.name || getFeatureName(feature)}: ${tooltipValue}`,
                    { sticky: true },
                );
                featureLayer.bindPopup(
                    buildPopulationDensityPopup(record, dataset),
                );
                featureLayer.on({
                    mouseover() {
                        featureLayer.setStyle({
                            color: "#111820",
                            weight: 2.2,
                            fillOpacity: Number.isFinite(value) ? 0.94 : 0.45,
                        });
                        featureLayer.bringToFront();
                    },
                    mouseout() {
                        featureLayer.setStyle(styleForFeature(feature));
                    },
                });
            },
        });

        layer._mapDataControl = createPopulationDensityLegend(dataset);
        return layer;
    }

    function renderPointOverlay(items, definition) {
        if (!Array.isArray(items)) {
            throw new Error(`${definition.file} must contain a JSON array`);
        }

        const group = L.layerGroup([], { pmIgnore: true });

        for (const item of items) {
            const lat = Number(item.lat ?? item.latitude);
            const lon = Number(item.lon ?? item.lng ?? item.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                console.warn("Skipping point without numeric lat/lon:", item);
                continue;
            }

            let marker;
            if (definition.appearance === "city") {
                marker = L.marker([lat, lon], {
                    pane: "dataOverlay",
                    pmIgnore: true,
                    icon: L.divIcon({
                        className: "city-dot",
                        html: "<div></div>",
                        iconSize: [10, 10],
                        iconAnchor: [5, 5],
                    }),
                });
            } else if (definition.symbol) {
                marker = L.marker([lat, lon], {
                    pane: "dataOverlay",
                    pmIgnore: true,
                    icon: L.divIcon({
                        className: "data-symbol",
                        html: escapeHtml(definition.symbol),
                        iconSize: [25, 25],
                        iconAnchor: [12.5, 12.5],
                    }),
                });
            } else {
                const score = Number.isFinite(item.score) ? item.score : 2;
                marker = L.circleMarker([lat, lon], {
                    pane: "dataOverlay",
                    pmIgnore: true,
                    radius: 5 + Math.max(1, Math.min(score, 5)) * 1,
                    color: "#145c22",
                    weight: 1.5,
                    fillColor: "#48d56e",
                    fillOpacity: 0.72,
                });
            }

            const pointLabel = item.name || item.label || item.title;
            if (pointLabel) {
                marker.bindTooltip(String(pointLabel), {
                    permanent: Boolean(definition.permanentLabels),
                    direction: "right",
                    offset: definition.permanentLabels ? [2, 0] : [8, 0],
                    className: definition.permanentLabels ? "city-label" : "",
                });
            }

            if (definition.appearance !== "city" || item.summary) {
                marker.bindPopup(buildPointPopup(item));
            }

            group.addLayer(marker);
        }

        return group;
    }

    function renderGeoJsonOverlay(data, definition) {
        return L.geoJSON(data, {
            pane: "dataOverlay",
            style: definition.style || {
                color: "#202b35",
                weight: 1.2,
                fillColor: "#7aa6c2",
                fillOpacity: 0.3,
            },
            pointToLayer(feature, latlng) {
                return L.circleMarker(latlng, {
                    pane: "dataOverlay",
                    radius: 7,
                    color: "#202b35",
                    fillColor: "#fff",
                    fillOpacity: 0.85,
                    pmIgnore: true,
                });
            },
            onEachFeature(feature, layer) {
                layer.options.pmIgnore = true;
                const label = getFeatureName(feature);
                if (label) layer.bindTooltip(String(label));
                layer.bindPopup(buildRegionPopup(feature));
            },
        });
    }

    async function loadOverlay(definition) {
        if (loadedOverlays.has(definition.id)) {
            return loadedOverlays.get(definition.id);
        }

        let layer;
        if (definition.type === "population-density-grid") {
            layer = renderPopulationDensityGridOverlay(definition);
        } else {
            const data = await loadJson(definition.file);
            if (definition.type === "points") {
                layer = renderPointOverlay(data, definition);
            } else if (definition.type === "geojson") {
                layer = renderGeoJsonOverlay(data, definition);
            } else if (definition.type === "population-density") {
                const regions = await loadJson(definition.regionFile);
                layer = renderPopulationDensityOverlay(
                    data,
                    regions,
                    definition,
                );
            } else {
                throw new Error(`Unknown overlay type: ${definition.type}`);
            }
        }

        loadedOverlays.set(definition.id, layer);
        return layer;
    }

    function updateOverlayPanelStatus(ui, latestDefinition = null) {
        const visibleDefinitions = overlayDefinitions.filter((definition) =>
            activeOverlays.has(definition.id),
        );
        if (!visibleDefinitions.length) {
            ui.description.textContent = "No reference layers are visible.";
            return;
        }

        const countText = `${visibleDefinitions.length} ${visibleDefinitions.length === 1 ? "layer" : "layers"} visible.`;
        ui.description.textContent = latestDefinition?.description
            ? `${countText} ${latestDefinition.description}`
            : countText;
    }

    async function setOverlayEnabled(id, enabled, ui, input = null) {
        const serial = (overlayToggleSerials.get(id) || 0) + 1;
        overlayToggleSerials.set(id, serial);
        const definition = overlayDefinitions.find((item) => item.id === id);
        if (!definition) return;

        ui.error.textContent = "";
        if (!enabled) {
            const active = activeOverlays.get(id);
            if (active) {
                if (active.control) map.removeControl(active.control);
                if (map.hasLayer(active.layer)) map.removeLayer(active.layer);
                activeOverlays.delete(id);
            }
            updateOverlayPanelStatus(ui, definition);
            return;
        }

        if (activeOverlays.has(id)) {
            updateOverlayPanelStatus(ui, definition);
            return;
        }

        if (input) input.disabled = true;
        ui.description.textContent = `Loading ${definition.name}…`;
        try {
            const layer = await loadOverlay(definition);
            if (
                overlayToggleSerials.get(id) !== serial ||
                (input && !input.checked)
            ) {
                return;
            }

            layer.addTo(map);
            const control = layer._mapDataControl || null;
            if (control) control.addTo(map);
            activeOverlays.set(id, { layer, control });
            updateOverlayPanelStatus(ui, definition);
        } catch (error) {
            console.error(error);
            if (input) input.checked = false;
            ui.error.textContent = error.message;
            ui.description.textContent = `${definition.name} could not be displayed.`;
        } finally {
            if (input) input.disabled = false;
        }
    }

    const OverlayPicker = L.Control.extend({
        options: { position: "topright" },

        onAdd() {
            const container = L.DomUtil.create(
                "div",
                "overlay-picker overlay-picker--collapsed",
            );
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            container.innerHTML = `
                <div class="control-heading">
                    <div class="control-title">Map data</div>
                    <button class="control-collapse" type="button" aria-label="Expand map data" aria-expanded="false">+</button>
                </div>
                <div class="overlay-picker__body">
                    <p class="control-subtitle">Turn reference layers on or off independently.</p>
                    <div class="overlay-picker__choices"></div>
                    <button class="overlay-picker__load" type="button">Load local JSON / GeoJSON…</button>
                    <input class="overlay-picker__file" type="file" accept=".json,.geojson,application/json,application/geo+json" hidden />
                    <div class="overlay-picker__description"></div>
                    <div class="overlay-picker__error" role="alert"></div>
                </div>
            `;

            const collapse = container.querySelector(".control-collapse");
            const choicesElement = container.querySelector(
                ".overlay-picker__choices",
            );
            const loadButton = container.querySelector(".overlay-picker__load");
            const fileInput = container.querySelector(".overlay-picker__file");
            const description = container.querySelector(
                ".overlay-picker__description",
            );
            const error = container.querySelector(".overlay-picker__error");
            const ui = { description, error };

            collapse.addEventListener("click", () => {
                const collapsed = container.classList.toggle(
                    "overlay-picker--collapsed",
                );
                collapse.textContent = collapsed ? "+" : "−";
                collapse.setAttribute("aria-expanded", String(!collapsed));
                collapse.setAttribute(
                    "aria-label",
                    collapsed ? "Expand map data" : "Collapse map data",
                );
            });

            const appendChoice = (choice, checked = false) => {
                const label = document.createElement("label");
                const input = document.createElement("input");
                const text = document.createElement("span");
                input.type = "checkbox";
                input.name = "data-overlay";
                input.value = choice.id;
                input.checked = checked;
                input.setAttribute("aria-label", choice.name || choice.id);
                text.textContent = choice.name || choice.id;
                if (choice.description) label.title = choice.description;
                label.append(input, text);
                choicesElement.append(label);
                return input;
            };

            const defaultOverlayIds = new Set([
                "cities",
                "population-density-local",
            ]);
            const defaultInputs = [];
            for (const definition of overlayDefinitions) {
                const checked = defaultOverlayIds.has(definition.id);
                const input = appendChoice(definition, checked);
                if (checked) defaultInputs.push([definition.id, input]);
            }

            container.addEventListener("change", (event) => {
                if (event.target?.name === "data-overlay") {
                    setOverlayEnabled(
                        event.target.value,
                        event.target.checked,
                        ui,
                        event.target,
                    );
                }
            });

            loadButton.addEventListener("click", () => {
                fileInput.value = "";
                fileInput.click();
            });

            fileInput.addEventListener("change", async () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                error.textContent = "";
                description.textContent = `Loading ${file.name}…`;

                try {
                    const data = JSON.parse(await file.text());
                    const geoJsonTypes = new Set([
                        "FeatureCollection",
                        "Feature",
                        "Point",
                        "MultiPoint",
                        "LineString",
                        "MultiLineString",
                        "Polygon",
                        "MultiPolygon",
                        "GeometryCollection",
                    ]);
                    const type = Array.isArray(data)
                        ? "points"
                        : geoJsonTypes.has(data?.type)
                          ? "geojson"
                          : null;
                    if (!type) {
                        throw new Error(
                            "Use a lat/lon point array or valid GeoJSON.",
                        );
                    }

                    const baseId =
                        file.name
                            .toLowerCase()
                            .replace(/\.[^.]+$/, "")
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, "") || "local-data";
                    let id = `local-${baseId}`;
                    let number = 2;
                    while (overlayDefinitions.some((item) => item.id === id)) {
                        id = `local-${baseId}-${number}`;
                        number += 1;
                    }

                    const definition = {
                        id,
                        name: `${file.name} (local)`,
                        type,
                        file: file.name,
                        description:
                            "Loaded from this browser session. Add the file to overlayDefinitions to make it permanent.",
                    };
                    const layer =
                        type === "points"
                            ? renderPointOverlay(data, definition)
                            : renderGeoJsonOverlay(data, definition);

                    overlayDefinitions.push(definition);
                    loadedOverlays.set(id, layer);
                    const input = appendChoice(definition, true);
                    await setOverlayEnabled(id, true, ui, input);
                } catch (loadError) {
                    console.error(loadError);
                    error.textContent =
                        loadError.message || `Could not load ${file.name}.`;
                    description.textContent =
                        "The local dataset could not be displayed.";
                }
            });

            updateOverlayPanelStatus(ui);
            for (const [id, input] of defaultInputs) {
                setOverlayEnabled(id, true, ui, input);
            }
            return container;
        },
    });

    map.addControl(new OverlayPicker());

    /* Trip routes and sketch workspace */
    const ROUTE_PALETTE = [
        { color: "#d81b60", dark: "#8a103a" },
        { color: "#1565c0", dark: "#0c3d78" },
        { color: "#ef6c00", dark: "#914100" },
        { color: "#2e7d32", dark: "#174b1b" },
        { color: "#7b1fa2", dark: "#48125e" },
        { color: "#00838f", dark: "#004d54" },
        { color: "#c62828", dark: "#761616" },
        { color: "#6d4c41", dark: "#3e2923" },
        { color: "#827717", dark: "#4f480d" },
        { color: "#3949ab", dark: "#202a68" },
    ];

    const routesGroup = L.featureGroup([], { pmIgnore: true }).addTo(map);
    const sketchGroup = L.featureGroup().addTo(map);

    let routes = [];
    let activeRouteId = null;
    let selectedStopId = null;
    let addingStops = false;
    let restoreInProgress = false;
    let persistTimer = null;
    let plannerUi = null;
    let routeColorCursor = 0;

    function makeId(prefix = "item") {
        if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function generatedRouteStyle(index) {
        if (index < ROUTE_PALETTE.length) return ROUTE_PALETTE[index];
        const hue = Math.round((index * 137.508 + 330) % 360);
        return {
            color: `hsl(${hue}, 72%, 42%)`,
            dark: `hsl(${hue}, 72%, 25%)`,
        };
    }

    function routeDisplayName(route, fallbackIndex = null) {
        const index =
            fallbackIndex === null ? routes.indexOf(route) : fallbackIndex;
        return route?.name?.trim() || `Route ${Math.max(0, index) + 1}`;
    }

    function getRoute(id) {
        return routes.find((route) => route.id === id) || null;
    }

    function getActiveRoute() {
        return getRoute(activeRouteId) || routes[0] || null;
    }

    function createRoute(properties = {}, options = {}) {
        const requestedIndex = Number(properties.colorIndex);
        const colorIndex = Number.isInteger(requestedIndex)
            ? requestedIndex
            : routeColorCursor;
        const generated = generatedRouteStyle(colorIndex);
        const color = properties.color || generated.color;
        const dark = properties.dark || generated.dark;
        routeColorCursor = Math.max(routeColorCursor, colorIndex + 1);

        const group = L.featureGroup([], { pmIgnore: true }).addTo(routesGroup);
        const line = L.polyline([], {
            pane: "plannerOverlay",
            color,
            weight: 4,
            opacity: 0.85,
            dashArray: "10 7",
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
            pmIgnore: true,
        }).addTo(group);

        const route = {
            id: properties.id || makeId("route"),
            name: properties.name || `Route ${routes.length + 1}`,
            color,
            dark,
            colorIndex,
            group,
            line,
            stops: [],
        };
        routes.push(route);

        if (options.activate !== false) {
            activeRouteId = route.id;
            selectedStopId = null;
        }
        updateAllRouteGeometry();
        syncRouteControls();
        if (options.persist !== false) schedulePersist();
        return route;
    }

    function makeStopIcon(route, number, selected = false) {
        return L.divIcon({
            className: "route-stop-wrapper",
            html: `<span class="route-stop-icon${selected ? " is-selected" : ""}" style="--route-color:${route.color};--route-color-dark:${route.dark}">${number}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -16],
        });
    }

    function addRouteStop(routeId, latlng, properties = {}, options = {}) {
        const route = getRoute(routeId) || getActiveRoute();
        if (!route) return null;

        const stop = {
            id: properties.id || makeId("stop"),
            name: properties.name || "",
            notes: properties.notes || "",
            marker: null,
        };

        const marker = L.marker(latlng, {
            pane: "plannerOverlay",
            draggable: true,
            keyboard: true,
            riseOnHover: true,
            pmIgnore: true,
            icon: makeStopIcon(route, route.stops.length + 1),
        });
        stop.marker = marker;

        marker.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            selectRouteStop(route.id, stop.id);
        });
        marker.on("drag", () => updateRouteGeometry(route));
        marker.on("dragend", () => {
            updateRouteGeometry(route);
            schedulePersist();
        });

        marker.addTo(route.group);
        route.stops.push(stop);
        updateRouteGeometry(route);
        if (options.select !== false) selectRouteStop(route.id, stop.id);
        if (options.persist !== false) schedulePersist();
        return stop;
    }

    function updateRouteGeometry(route) {
        if (!route) return;
        const active = route.id === activeRouteId;
        route.line.setLatLngs(
            route.stops.map((stop) => stop.marker.getLatLng()),
        );
        route.line.setStyle({
            color: route.color,
            weight: active ? 5 : 3.5,
            opacity: active ? 0.95 : 0.68,
        });

        route.stops.forEach((stop, index) => {
            const selected = active && stop.id === selectedStopId;
            stop.marker.setIcon(makeStopIcon(route, index + 1, selected));
            const stopName = stop.name || `Stop ${index + 1}`;
            const label = `${routeDisplayName(route)} · ${stopName}`;
            stop.marker.unbindTooltip();
            stop.marker.bindTooltip(label, {
                direction: "top",
                offset: [0, -15],
            });
        });
        updatePlannerSummary();
    }

    function updateAllRouteGeometry() {
        for (const route of routes) updateRouteGeometry(route);
    }

    function routeDistanceKm(route) {
        if (!route) return 0;
        let metres = 0;
        for (let index = 1; index < route.stops.length; index += 1) {
            metres += route.stops[index - 1].marker
                .getLatLng()
                .distanceTo(route.stops[index].marker.getLatLng());
        }
        return metres / 1000;
    }

    function updatePlannerSummary() {
        if (!plannerUi) return;
        const route = getActiveRoute();
        const count = route?.stops.length || 0;
        const distance = routeDistanceKm(route);
        const totalStops = routes.reduce(
            (sum, item) => sum + item.stops.length,
            0,
        );
        plannerUi.summary.textContent = route
            ? `${routeDisplayName(route)}: ${count} ${count === 1 ? "stop" : "stops"} · ${distance.toLocaleString(undefined, { maximumFractionDigits: 0 })} km straight-line · ${routes.length} ${routes.length === 1 ? "route" : "routes"} / ${totalStops} total stops`
            : "No route is available.";
        plannerUi.undo.disabled = count === 0;
        plannerUi.clearRoute.disabled = count === 0;
        plannerUi.exportRoute.disabled = count === 0;
        plannerUi.deleteRoute.disabled = routes.length <= 1;
    }

    function syncRouteControls() {
        if (!plannerUi) return;
        const route = getActiveRoute();
        plannerUi.routeSelect.replaceChildren(
            ...routes.map((item, index) => {
                const option = document.createElement("option");
                option.value = item.id;
                option.textContent = routeDisplayName(item, index);
                return option;
            }),
        );
        if (route) {
            plannerUi.routeSelect.value = route.id;
            plannerUi.routeName.value = route.name;
            plannerUi.routeSwatch.style.background = route.color;
            plannerUi.routeSwatch.title = `${routeDisplayName(route)} color`;
        } else {
            plannerUi.routeName.value = "";
            plannerUi.routeSwatch.style.background = "transparent";
        }
        plannerUi.editor.hidden = true;
        updatePlannerSummary();
    }

    function setActiveRoute(id) {
        const route = getRoute(id);
        if (!route) return;
        activeRouteId = route.id;
        selectedStopId = null;
        syncRouteControls();
        updateAllRouteGeometry();
    }

    function selectRouteStop(routeId, stopId) {
        const route = getRoute(routeId);
        const stop = route?.stops.find((item) => item.id === stopId) || null;
        if (!route || !stop) {
            selectedStopId = null;
            if (plannerUi) plannerUi.editor.hidden = true;
            updateAllRouteGeometry();
            return;
        }

        activeRouteId = route.id;
        selectedStopId = stop.id;
        syncRouteControls();
        if (plannerUi) {
            const index = route.stops.indexOf(stop);
            plannerUi.editor.hidden = false;
            plannerUi.editorTitle.textContent = `Edit stop ${index + 1}`;
            plannerUi.stopName.value = stop.name;
            plannerUi.stopNotes.value = stop.notes;
            plannerUi.moveUp.disabled = index === 0;
            plannerUi.moveDown.disabled = index === route.stops.length - 1;
        }
        updateAllRouteGeometry();
    }

    function deleteRouteStop(routeId, stopId) {
        const route = getRoute(routeId);
        if (!route) return;
        const index = route.stops.findIndex((item) => item.id === stopId);
        if (index < 0) return;
        route.group.removeLayer(route.stops[index].marker);
        route.stops.splice(index, 1);
        selectedStopId = null;
        if (plannerUi) plannerUi.editor.hidden = true;
        updateRouteGeometry(route);
        schedulePersist();
    }

    function moveSelectedStop(delta) {
        const route = getActiveRoute();
        if (!route) return;
        const index = route.stops.findIndex(
            (item) => item.id === selectedStopId,
        );
        const destination = index + delta;
        if (index < 0 || destination < 0 || destination >= route.stops.length) {
            return;
        }
        [route.stops[index], route.stops[destination]] = [
            route.stops[destination],
            route.stops[index],
        ];
        selectRouteStop(route.id, selectedStopId);
        schedulePersist();
    }

    function clearActiveRoute(options = {}) {
        const route = getActiveRoute();
        if (!route) return;
        for (const stop of route.stops) route.group.removeLayer(stop.marker);
        route.stops = [];
        selectedStopId = null;
        route.line.setLatLngs([]);
        if (plannerUi) plannerUi.editor.hidden = true;
        updateRouteGeometry(route);
        if (options.persist !== false) schedulePersist();
    }

    function deleteActiveRoute(options = {}) {
        const route = getActiveRoute();
        if (!route) return;
        routesGroup.removeLayer(route.group);
        routes = routes.filter((item) => item.id !== route.id);
        selectedStopId = null;
        activeRouteId = routes[0]?.id || null;
        if (!routes.length && options.createReplacement !== false) {
            createRoute({}, { activate: true, persist: false });
        }
        syncRouteControls();
        updateAllRouteGeometry();
        if (options.persist !== false) schedulePersist();
    }

    function clearAllRoutes(options = {}) {
        for (const route of routes) routesGroup.removeLayer(route.group);
        routes = [];
        activeRouteId = null;
        selectedStopId = null;
        routeColorCursor = 0;
        if (options.createDefault !== false) {
            createRoute({}, { activate: true, persist: false });
        }
        syncRouteControls();
        if (options.persist !== false) schedulePersist();
    }

    function setAddingStops(enabled) {
        addingStops = Boolean(enabled);
        document.body.classList.toggle("map-is-adding-stops", addingStops);
        if (plannerUi) {
            plannerUi.addStops.classList.toggle("is-active", addingStops);
            plannerUi.addStops.textContent = addingStops
                ? "Finish adding"
                : "Add route stops";
            plannerUi.addStops.setAttribute(
                "aria-pressed",
                String(addingStops),
            );
        }
    }

    map.on("click", (event) => {
        if (addingStops) {
            let route = getActiveRoute();
            if (!route) route = createRoute({}, { persist: false });
            addRouteStop(route.id, event.latlng);
        } else if (selectedStopId) {
            selectedStopId = null;
            if (plannerUi) plannerUi.editor.hidden = true;
            updateAllRouteGeometry();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && addingStops) setAddingStops(false);
    });

    function setupGeoman() {
        if (!map.pm) return false;

        map.pm.addControls({
            position: "topleft",
            drawMarker: true,
            drawCircleMarker: false,
            drawPolyline: true,
            drawRectangle: true,
            drawPolygon: true,
            drawCircle: false,
            drawText: false,
            editMode: true,
            dragMode: true,
            cutPolygon: false,
            removalMode: true,
            rotateMode: false,
        });

        map.pm.setGlobalOptions({
            layerGroup: sketchGroup,
            pane: "plannerOverlay",
            snappable: true,
            continueDrawing: false,
            pathOptions: {
                pane: "plannerOverlay",
                color: "#5c4ab0",
                weight: 3,
                fillColor: "#8a77d4",
                fillOpacity: 0.18,
            },
            markerStyle: {
                pane: "plannerOverlay",
                draggable: true,
            },
        });

        map.on("pm:create", (event) => {
            const layer = event.layer;
            layer.options.pane = "plannerOverlay";
            layer.options.pmIgnore = false;
            layer.feature = layer.feature || {
                type: "Feature",
                properties: {},
            };
            layer.feature.properties = {
                ...(layer.feature.properties || {}),
                kind: "sketch",
                shape: event.shape || "Geometry",
                name:
                    layer.feature.properties?.name ||
                    `${event.shape || "Sketch"} ${sketchGroup.getLayers().length + 1}`,
            };
            sketchGroup.addLayer(layer);
            prepareSketchLayer(layer);
            schedulePersist();
        });

        map.on("pm:remove", (event) => {
            if (sketchGroup.hasLayer(event.layer)) {
                sketchGroup.removeLayer(event.layer);
                schedulePersist();
            }
        });
        map.on("pm:edit pm:dragend pm:cut", schedulePersist);
        return true;
    }

    function prepareSketchLayer(layer) {
        layer.options.pmIgnore = false;
        if (layer.setStyle && !layer.options.color) {
            layer.setStyle({
                color: "#5c4ab0",
                weight: 3,
                fillColor: "#8a77d4",
                fillOpacity: 0.18,
            });
        }
        const name = layer.feature?.properties?.name;
        if (name) layer.bindTooltip(String(name));
        layer.on("dragend", schedulePersist);
        if (globalThis.L?.PM?.reInitLayer) L.PM.reInitLayer(layer);
    }

    const geomanAvailable = setupGeoman();

    function routeFeatures(routesToExport = routes) {
        const features = [];
        routesToExport.forEach((route, routeIndex) => {
            route.stops.forEach((stop, stopIndex) => {
                const latlng = stop.marker.getLatLng();
                features.push({
                    type: "Feature",
                    properties: {
                        kind: "route-stop",
                        routeId: route.id,
                        routeName: routeDisplayName(route, routeIndex),
                        routeColor: route.color,
                        routeColorDark: route.dark,
                        routeColorIndex: route.colorIndex,
                        routeOrder: routeIndex + 1,
                        id: stop.id,
                        order: stopIndex + 1,
                        name: stop.name || `Stop ${stopIndex + 1}`,
                        notes: stop.notes || "",
                    },
                    geometry: {
                        type: "Point",
                        coordinates: [latlng.lng, latlng.lat],
                    },
                });
            });

            if (route.stops.length >= 2) {
                features.push({
                    type: "Feature",
                    properties: {
                        kind: "route-line",
                        routeId: route.id,
                        routeName: routeDisplayName(route, routeIndex),
                        routeColor: route.color,
                        routeColorDark: route.dark,
                        routeColorIndex: route.colorIndex,
                        routeOrder: routeIndex + 1,
                        distanceKmStraightLine: Number(
                            routeDistanceKm(route).toFixed(1),
                        ),
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: route.stops.map((stop) => {
                            const latlng = stop.marker.getLatLng();
                            return [latlng.lng, latlng.lat];
                        }),
                    },
                });
            }
        });
        return features;
    }

    function sketchFeatures() {
        const features = [];
        sketchGroup.eachLayer((layer) => {
            if (typeof layer.toGeoJSON !== "function") return;
            const feature = layer.toGeoJSON();
            feature.properties = {
                ...(feature.properties || {}),
                ...(layer.feature?.properties || {}),
                kind: layer.feature?.properties?.kind || "sketch",
            };
            features.push(feature);
        });
        return features;
    }

    function routeMetadata(routesToExport = routes) {
        return routesToExport.map((route, index) => ({
            id: route.id,
            name: routeDisplayName(route, index),
            color: route.color,
            dark: route.dark,
            colorIndex: route.colorIndex,
            order: index + 1,
        }));
    }

    function makeFeatureCollection(features, scope, routesToExport = routes) {
        return {
            type: "FeatureCollection",
            metadata: {
                application: "Southeast Asia trip planner",
                version: 3,
                scope,
                exportedAt: new Date().toISOString(),
                routeDistanceIsStraightLine: true,
                activeRouteId,
                routeColorCursor,
                routes: routeMetadata(routesToExport),
            },
            features,
        };
    }

    function downloadGeoJson(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/geo+json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function dateStamp() {
        return new Date().toISOString().slice(0, 10);
    }

    function filenameSlug(value) {
        return (
            String(value || "route")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "route"
        );
    }

    function clearSketches(options = {}) {
        sketchGroup.clearLayers();
        if (options.persist !== false) schedulePersist();
    }

    function normalizeFeatureCollection(data) {
        if (
            data?.type === "FeatureCollection" &&
            Array.isArray(data.features)
        ) {
            return data;
        }
        if (data?.type === "Feature") {
            return { type: "FeatureCollection", features: [data] };
        }
        if (data?.type && data.coordinates) {
            return {
                type: "FeatureCollection",
                features: [{ type: "Feature", properties: {}, geometry: data }],
            };
        }
        throw new Error("The selected file is not valid GeoJSON.");
    }

    function importSketchFeatures(features) {
        if (!features.length) return;
        const layer = L.geoJSON(
            { type: "FeatureCollection", features },
            {
                pane: "plannerOverlay",
                style(feature) {
                    return {
                        pane: "plannerOverlay",
                        color: feature.properties?.stroke || "#5c4ab0",
                        weight: Number(feature.properties?.strokeWidth) || 3,
                        fillColor: feature.properties?.fill || "#8a77d4",
                        fillOpacity:
                            Number(feature.properties?.fillOpacity) || 0.18,
                    };
                },
                pointToLayer(feature, latlng) {
                    return L.marker(latlng, {
                        pane: "plannerOverlay",
                        draggable: true,
                        pmIgnore: false,
                    });
                },
                onEachFeature(feature, itemLayer) {
                    itemLayer.options.pane = "plannerOverlay";
                    itemLayer.options.pmIgnore = false;
                    itemLayer.feature = feature;
                    prepareSketchLayer(itemLayer);
                },
            },
        );
        layer.eachLayer((itemLayer) => sketchGroup.addLayer(itemLayer));
    }

    function routeDescriptorsFromCollection(collection, stopFeatures) {
        const metadataRoutes = Array.isArray(collection.metadata?.routes)
            ? collection.metadata.routes
            : [];
        const descriptors = new Map();

        metadataRoutes.forEach((item, index) => {
            const id = item.id || `route-${index + 1}`;
            descriptors.set(id, {
                id,
                name: item.name || `Route ${index + 1}`,
                color: item.color,
                dark: item.dark,
                colorIndex: Number.isFinite(Number(item.colorIndex))
                    ? Number(item.colorIndex)
                    : index,
                order: Number(item.order) || index + 1,
            });
        });

        stopFeatures.forEach((feature, index) => {
            const properties = feature.properties || {};
            const id = properties.routeId || "route-1";
            if (!descriptors.has(id)) {
                descriptors.set(id, {
                    id,
                    name:
                        properties.routeName ||
                        (id === "route-1"
                            ? "Trip route"
                            : `Route ${index + 1}`),
                    color: properties.routeColor,
                    dark: properties.routeColorDark,
                    colorIndex: Number.isFinite(
                        Number(properties.routeColorIndex),
                    )
                        ? Number(properties.routeColorIndex)
                        : descriptors.size,
                    order:
                        Number(properties.routeOrder) || descriptors.size + 1,
                });
            }
        });

        return [...descriptors.values()].sort(
            (a, b) => Number(a.order || 0) - Number(b.order || 0),
        );
    }

    function loadWorkspaceData(data, options = {}) {
        const collection = normalizeFeatureCollection(data);
        const features = collection.features.filter(Boolean);
        const stopFeatures = features.filter(
            (feature) =>
                feature.geometry?.type === "Point" &&
                feature.properties?.kind === "route-stop",
        );
        const sketchFeaturesToLoad = features.filter(
            (feature) =>
                feature.properties?.kind !== "route-stop" &&
                feature.properties?.kind !== "route-line",
        );
        const descriptors = routeDescriptorsFromCollection(
            collection,
            stopFeatures,
        );

        restoreInProgress = true;
        clearAllRoutes({
            createDefault: false,
            persist: false,
        });
        clearSketches({ persist: false });

        for (const descriptor of descriptors) {
            createRoute(descriptor, { activate: false, persist: false });
        }
        if (!routes.length) {
            createRoute({}, { activate: false, persist: false });
        }

        const routeOrder = new Map(
            routes.map((route, index) => [route.id, index]),
        );
        stopFeatures
            .slice()
            .sort((a, b) => {
                const routeA = a.properties?.routeId || "route-1";
                const routeB = b.properties?.routeId || "route-1";
                const routeDifference =
                    (routeOrder.get(routeA) || 0) -
                    (routeOrder.get(routeB) || 0);
                if (routeDifference) return routeDifference;
                return (
                    Number(a.properties?.order || 0) -
                    Number(b.properties?.order || 0)
                );
            })
            .forEach((feature) => {
                const [lon, lat] = feature.geometry.coordinates || [];
                if (
                    !Number.isFinite(Number(lat)) ||
                    !Number.isFinite(Number(lon))
                ) {
                    return;
                }
                const routeId = feature.properties?.routeId || routes[0].id;
                addRouteStop(
                    getRoute(routeId)?.id || routes[0].id,
                    [Number(lat), Number(lon)],
                    {
                        id: feature.properties?.id,
                        name: feature.properties?.name || "",
                        notes: feature.properties?.notes || "",
                    },
                    { select: false, persist: false },
                );
            });

        importSketchFeatures(sketchFeaturesToLoad);
        activeRouteId =
            getRoute(collection.metadata?.activeRouteId)?.id || routes[0].id;
        routeColorCursor = Math.max(
            routeColorCursor,
            Number(collection.metadata?.routeColorCursor) || 0,
        );
        selectedStopId = null;
        restoreInProgress = false;
        syncRouteControls();
        updateAllRouteGeometry();

        const bounds = L.featureGroup([routesGroup, sketchGroup]).getBounds();
        if (options.fit !== false && bounds.isValid()) {
            map.fitBounds(bounds.pad(0.18), { maxZoom: 8 });
        }
        if (options.persist !== false) schedulePersist();
    }

    function schedulePersist() {
        if (restoreInProgress) return;
        clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            try {
                const workspace = makeFeatureCollection(
                    [...routeFeatures(), ...sketchFeatures()],
                    "workspace",
                );
                localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
                setPlannerMessage("Saved in this browser.", "success");
            } catch (error) {
                console.warn("Could not save workspace", error);
                setPlannerMessage("Browser save was unavailable.", "error");
            }
        }, 180);
    }

    function restoreSavedWorkspace() {
        try {
            const current = localStorage.getItem(STORAGE_KEY);
            const legacy = current
                ? null
                : localStorage.getItem(LEGACY_STORAGE_KEY);
            const raw = current || legacy;
            if (!raw) {
                createRoute({}, { activate: true, persist: false });
                return;
            }
            loadWorkspaceData(JSON.parse(raw), {
                fit: false,
                persist: false,
            });
            if (legacy) schedulePersist();
            setPlannerMessage(
                legacy
                    ? "Migrated and restored your saved route."
                    : "Restored your browser-saved workspace.",
                "success",
            );
        } catch (error) {
            console.warn("Could not restore workspace", error);
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            clearAllRoutes({ persist: false });
        }
    }

    function setPlannerMessage(message, type = "") {
        if (!plannerUi) return;
        plannerUi.message.textContent = message;
        plannerUi.message.classList.toggle("is-error", type === "error");
        plannerUi.message.classList.toggle("is-success", type === "success");
    }

    const PlannerControl = L.Control.extend({
        options: { position: "bottomright" },

        onAdd() {
            const container = L.DomUtil.create(
                "div",
                "planner-panel planner-panel--collapsed",
            );
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            container.innerHTML = `
                <div class="control-heading">
                    <div class="control-title">Trip planner</div>
                    <button class="control-collapse" type="button" aria-label="Expand trip planner" aria-expanded="false">+</button>
                </div>
                <div class="planner-body">
                    <section class="planner-section">
                        <div class="planner-section__title">Routes</div>
                        <p class="planner-hint">Keep several independent routes on the map. New routes automatically receive a strongly contrasting color.</p>
                        <div class="route-manager">
                            <label>Active route
                                <span class="route-manager__select-row">
                                    <span class="route-color-swatch" aria-hidden="true"></span>
                                    <select class="js-route-select" aria-label="Active route"></select>
                                </span>
                            </label>
                            <label>Route name
                                <input class="js-route-name" type="text" maxlength="120" placeholder="e.g. Eastern Indonesia" />
                            </label>
                        </div>
                        <div class="planner-actions">
                            <button class="js-new-route" type="button">New route</button>
                            <button class="js-delete-route danger" type="button">Delete route</button>
                            <button class="js-add-stops" type="button" aria-pressed="false">Add route stops</button>
                            <button class="js-undo" type="button">Undo last</button>
                            <button class="js-export-route" type="button">Export active</button>
                            <button class="js-clear-route danger" type="button">Clear active</button>
                        </div>
                        <div class="route-summary" aria-live="polite"></div>
                        <div class="stop-editor" hidden>
                            <div class="planner-section__title js-editor-title">Edit stop</div>
                            <label>Name
                                <input class="js-stop-name" type="text" maxlength="120" placeholder="e.g. Chiang Mai" />
                            </label>
                            <label>Notes
                                <textarea class="js-stop-notes" maxlength="1000" placeholder="Transport, accommodation, dates…"></textarea>
                            </label>
                            <div class="stop-editor__actions">
                                <button class="js-move-up" type="button">Earlier</button>
                                <button class="js-move-down" type="button">Later</button>
                                <button class="js-delete-stop danger" type="button">Delete</button>
                            </div>
                        </div>
                    </section>
                    <section class="planner-section">
                        <div class="planner-section__title">Extra map drawings</div>
                        <p class="planner-hint">Use the drawing toolbar at top-left for additional markers, lines, rectangles or polygons. Its edit, drag and remove modes work on those sketches.</p>
                        <div class="planner-actions">
                            <button class="js-clear-sketches danger" type="button">Clear drawings</button>
                            <button class="js-fit-workspace" type="button">Fit workspace</button>
                        </div>
                    </section>
                    <section class="planner-section">
                        <div class="planner-section__title">GeoJSON files</div>
                        <p class="planner-hint">Export all routes and drawings, or import a saved workspace. Older single-route exports remain supported.</p>
                        <div class="planner-actions">
                            <button class="js-export-all" type="button">Export all</button>
                            <button class="js-import" type="button">Import GeoJSON</button>
                        </div>
                        <input class="js-file" type="file" accept=".geojson,.json,application/geo+json,application/json" hidden />
                        <div class="planner-message" role="status"></div>
                    </section>
                </div>
            `;

            plannerUi = {
                container,
                collapse: container.querySelector(".control-collapse"),
                routeSelect: container.querySelector(".js-route-select"),
                routeName: container.querySelector(".js-route-name"),
                routeSwatch: container.querySelector(".route-color-swatch"),
                newRoute: container.querySelector(".js-new-route"),
                deleteRoute: container.querySelector(".js-delete-route"),
                addStops: container.querySelector(".js-add-stops"),
                undo: container.querySelector(".js-undo"),
                exportRoute: container.querySelector(".js-export-route"),
                clearRoute: container.querySelector(".js-clear-route"),
                summary: container.querySelector(".route-summary"),
                editor: container.querySelector(".stop-editor"),
                editorTitle: container.querySelector(".js-editor-title"),
                stopName: container.querySelector(".js-stop-name"),
                stopNotes: container.querySelector(".js-stop-notes"),
                moveUp: container.querySelector(".js-move-up"),
                moveDown: container.querySelector(".js-move-down"),
                deleteStop: container.querySelector(".js-delete-stop"),
                clearSketches: container.querySelector(".js-clear-sketches"),
                fitWorkspace: container.querySelector(".js-fit-workspace"),
                exportAll: container.querySelector(".js-export-all"),
                importButton: container.querySelector(".js-import"),
                fileInput: container.querySelector(".js-file"),
                message: container.querySelector(".planner-message"),
            };

            plannerUi.collapse.addEventListener("click", () => {
                const collapsed = container.classList.toggle(
                    "planner-panel--collapsed",
                );
                plannerUi.collapse.textContent = collapsed ? "+" : "−";
                plannerUi.collapse.setAttribute(
                    "aria-expanded",
                    String(!collapsed),
                );
            });

            plannerUi.routeSelect.addEventListener("change", () => {
                setActiveRoute(plannerUi.routeSelect.value);
            });

            plannerUi.routeName.addEventListener("input", () => {
                const route = getActiveRoute();
                if (!route) return;
                route.name = plannerUi.routeName.value;
                const option = [...plannerUi.routeSelect.options].find(
                    (item) => item.value === route.id,
                );
                if (option) option.textContent = routeDisplayName(route);
                updateRouteGeometry(route);
                schedulePersist();
            });

            plannerUi.newRoute.addEventListener("click", () => {
                const route = createRoute();
                setPlannerMessage(
                    `${routeDisplayName(route)} created in ${route.color}.`,
                    "success",
                );
            });

            plannerUi.deleteRoute.addEventListener("click", () => {
                const route = getActiveRoute();
                if (
                    route &&
                    confirm(`Delete ${routeDisplayName(route)} and its stops?`)
                ) {
                    deleteActiveRoute();
                    setPlannerMessage("Route deleted.");
                }
            });

            plannerUi.addStops.addEventListener("click", () => {
                setAddingStops(!addingStops);
                setPlannerMessage(
                    addingStops
                        ? `Click the map to add stops to ${routeDisplayName(getActiveRoute())}. Press Escape when finished.`
                        : "Route editing paused.",
                );
            });

            plannerUi.undo.addEventListener("click", () => {
                const route = getActiveRoute();
                const last = route?.stops.at(-1);
                if (route && last) deleteRouteStop(route.id, last.id);
            });

            plannerUi.clearRoute.addEventListener("click", () => {
                const route = getActiveRoute();
                if (
                    route?.stops.length &&
                    confirm(`Clear all stops from ${routeDisplayName(route)}?`)
                ) {
                    clearActiveRoute();
                    setPlannerMessage("Active route cleared.");
                }
            });

            plannerUi.exportRoute.addEventListener("click", () => {
                const route = getActiveRoute();
                if (!route) return;
                downloadGeoJson(
                    makeFeatureCollection(routeFeatures([route]), "route", [
                        route,
                    ]),
                    `${filenameSlug(routeDisplayName(route))}-${dateStamp()}.geojson`,
                );
                setPlannerMessage(
                    "Active route GeoJSON downloaded.",
                    "success",
                );
            });

            plannerUi.stopName.addEventListener("input", () => {
                const route = getActiveRoute();
                const stop = route?.stops.find(
                    (item) => item.id === selectedStopId,
                );
                if (!stop) return;
                stop.name = plannerUi.stopName.value;
                updateRouteGeometry(route);
                schedulePersist();
            });

            plannerUi.stopNotes.addEventListener("input", () => {
                const route = getActiveRoute();
                const stop = route?.stops.find(
                    (item) => item.id === selectedStopId,
                );
                if (!stop) return;
                stop.notes = plannerUi.stopNotes.value;
                schedulePersist();
            });

            plannerUi.moveUp.addEventListener("click", () =>
                moveSelectedStop(-1),
            );
            plannerUi.moveDown.addEventListener("click", () =>
                moveSelectedStop(1),
            );
            plannerUi.deleteStop.addEventListener("click", () => {
                const route = getActiveRoute();
                if (route && selectedStopId) {
                    deleteRouteStop(route.id, selectedStopId);
                }
            });

            plannerUi.clearSketches.addEventListener("click", () => {
                if (
                    sketchGroup.getLayers().length === 0 ||
                    confirm("Clear all extra drawings?")
                ) {
                    clearSketches();
                    setPlannerMessage("Extra drawings cleared.");
                }
            });

            plannerUi.fitWorkspace.addEventListener("click", () => {
                const bounds = L.featureGroup([
                    routesGroup,
                    sketchGroup,
                ]).getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds.pad(0.18), { maxZoom: 9 });
                } else {
                    setPlannerMessage("There is no route or drawing to fit.");
                }
            });

            plannerUi.exportAll.addEventListener("click", () => {
                const data = makeFeatureCollection(
                    [...routeFeatures(), ...sketchFeatures()],
                    "workspace",
                );
                downloadGeoJson(
                    data,
                    `southeast-asia-trip-${dateStamp()}.geojson`,
                );
                setPlannerMessage("Workspace GeoJSON downloaded.", "success");
            });

            plannerUi.importButton.addEventListener("click", () => {
                plannerUi.fileInput.value = "";
                plannerUi.fileInput.click();
            });

            plannerUi.fileInput.addEventListener("change", async () => {
                const file = plannerUi.fileInput.files?.[0];
                if (!file) return;
                try {
                    const data = JSON.parse(await file.text());
                    const hasWorkspace =
                        routes.some((route) => route.stops.length > 0) ||
                        sketchGroup.getLayers().length > 0;
                    if (
                        hasWorkspace &&
                        !confirm(
                            "Replace the current routes and drawings with this file?",
                        )
                    ) {
                        return;
                    }
                    loadWorkspaceData(data, { fit: true, persist: true });
                    setPlannerMessage(`Imported ${file.name}.`, "success");
                } catch (error) {
                    console.error(error);
                    setPlannerMessage(
                        error.message || "Could not import that file.",
                        "error",
                    );
                }
            });

            if (!geomanAvailable) {
                plannerUi.clearSketches.disabled = true;
                setPlannerMessage(
                    "The drawing plugin did not load; route tools still work.",
                    "error",
                );
            }

            syncRouteControls();
            return container;
        },
    });

    map.addControl(new PlannerControl());
    restoreSavedWorkspace();
})();
