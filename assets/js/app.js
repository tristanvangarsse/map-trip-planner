(() => {
    "use strict";

    const SEA_BOUNDS = [
        [-12, 91],
        [29, 142],
    ];
    const STORAGE_KEY = "southeast-asia-trip-workspace-v2";
    const REGION_FILE = "data/regions/southeast-asia-countries.geojson";
    const POPULATION_DENSITY_FILE =
        "data/statistics/population-density-2023.json";

    const map = L.map("map", {
        zoomControl: true,
        minZoom: 3,
        maxZoom: 12,
        zoomSnap: 0.25,
        maxBounds: [
            [-28, 70],
            [45, 165],
        ],
        maxBoundsViscosity: 0.65,
    });

    map.fitBounds(SEA_BOUNDS);

    L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Tiles © Esri",
            maxZoom: 10,
            detectRetina: true,
        },
    ).addTo(map);

    createPane("whiteOverlay", 250, "none");
    createPane("countryBorders", 350, "none");
    createPane("dataOverlay", 450, "auto");
    createPane("plannerOverlay", 650, "auto");

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
    let activeOverlay = null;
    let activeOverlayControl = null;
    let overlaySelectionSerial = 0;

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
            id: "population-density",
            name: "Population density (2023)",
            type: "population-density",
            file: POPULATION_DENSITY_FILE,
            regionFile: REGION_FILE,
            description:
                "Country-level people per square kilometre of land area. Hover or click a country for its value; the legend uses a stepped scale.",
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

    function createPopulationDensityLegend(dataset) {
        const control = L.control({ position: "bottomleft" });
        control.onAdd = () => {
            const container = L.DomUtil.create("div", "density-legend");
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
                <div class="density-legend__title">Population density</div>
                <div class="density-legend__unit">People/km² · ${escapeHtml(dataset.year || "")}</div>
                ${rows}
                ${sourceUrl ? `<a class="density-legend__source" href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Source: ${source}</a>` : ""}
            `;
            return container;
        };
        return control;
    }

    function renderPopulationDensityOverlay(dataset, regions, definition) {
        if (!Array.isArray(dataset?.countries)) {
            throw new Error(`${definition.file} must contain a countries array`);
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

        const data = await loadJson(definition.file);
        let layer;
        if (definition.type === "points") {
            layer = renderPointOverlay(data, definition);
        } else if (definition.type === "geojson") {
            layer = renderGeoJsonOverlay(data, definition);
        } else if (definition.type === "population-density") {
            const regions = await loadJson(definition.regionFile);
            layer = renderPopulationDensityOverlay(data, regions, definition);
        } else {
            throw new Error(`Unknown overlay type: ${definition.type}`);
        }

        loadedOverlays.set(definition.id, layer);
        return layer;
    }

    async function selectOverlay(id, ui) {
        const serial = ++overlaySelectionSerial;

        if (activeOverlay) {
            map.removeLayer(activeOverlay);
            activeOverlay = null;
        }
        if (activeOverlayControl) {
            map.removeControl(activeOverlayControl);
            activeOverlayControl = null;
        }

        ui.error.textContent = "";
        if (!id) {
            ui.description.textContent = "No optional dataset is visible.";
            return;
        }

        const definition = overlayDefinitions.find((item) => item.id === id);
        if (!definition) return;

        ui.description.textContent = `Loading ${definition.name}…`;
        try {
            const layer = await loadOverlay(definition);
            if (serial !== overlaySelectionSerial) return;
            layer.addTo(map);
            activeOverlay = layer;
            if (layer._mapDataControl) {
                layer._mapDataControl.addTo(map);
                activeOverlayControl = layer._mapDataControl;
            }
            ui.description.textContent = definition.description || "";
        } catch (error) {
            console.error(error);
            ui.error.textContent = error.message;
            ui.description.textContent = "The dataset could not be displayed.";
            const none = document.querySelector(
                'input[name="data-overlay"][value=""]',
            );
            if (none) none.checked = true;
        }
    }

    const OverlayPicker = L.Control.extend({
        options: { position: "topright" },

        onAdd() {
            const container = L.DomUtil.create("div", "overlay-picker");
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            container.innerHTML = `
                <div class="control-heading">
                    <div class="control-title">Map data</div>
                </div>
                <p class="control-subtitle">Choose one reference layer.</p>
                <div class="overlay-picker__choices"></div>
                <button class="overlay-picker__load" type="button">Load local JSON / GeoJSON…</button>
                <input class="overlay-picker__file" type="file" accept=".json,.geojson,application/json,application/geo+json" hidden />
                <div class="overlay-picker__description"></div>
                <div class="overlay-picker__error" role="alert"></div>
            `;

            const choicesElement = container.querySelector(
                ".overlay-picker__choices",
            );
            const loadButton = container.querySelector(".overlay-picker__load");
            const fileInput = container.querySelector(".overlay-picker__file");
            const description = container.querySelector(
                ".overlay-picker__description",
            );
            const error = container.querySelector(".overlay-picker__error");

            const appendChoice = (choice, checked = false) => {
                const label = document.createElement("label");
                const input = document.createElement("input");
                const text = document.createElement("span");
                input.type = "radio";
                input.name = "data-overlay";
                input.value = choice.id;
                input.checked = checked;
                text.textContent = choice.name || choice.id;
                label.append(input, text);
                choicesElement.append(label);
                return input;
            };

            appendChoice({ id: "", name: "None" });
            for (const definition of overlayDefinitions) {
                appendChoice(definition, definition.id === "cities");
            }

            container.addEventListener("change", (event) => {
                if (event.target?.name === "data-overlay") {
                    selectOverlay(event.target.value, { description, error });
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
                    input.checked = true;
                    await selectOverlay(id, { description, error });
                } catch (loadError) {
                    console.error(loadError);
                    error.textContent =
                        loadError.message || `Could not load ${file.name}.`;
                    description.textContent =
                        "The local dataset could not be displayed.";
                }
            });

            selectOverlay("cities", { description, error });
            return container;
        },
    });

    map.addControl(new OverlayPicker());

    /* Trip route and sketch workspace */
    const routeGroup = L.featureGroup([], { pmIgnore: true }).addTo(map);
    const routeLine = L.polyline([], {
        pane: "plannerOverlay",
        color: "#9c2554",
        weight: 4,
        opacity: 0.9,
        dashArray: "10 7",
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
        pmIgnore: true,
    }).addTo(routeGroup);
    const sketchGroup = L.featureGroup().addTo(map);

    let routeStops = [];
    let selectedStopId = null;
    let addingStops = false;
    let restoreInProgress = false;
    let persistTimer = null;
    let plannerUi = null;

    function makeId() {
        if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
        return `stop-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function makeStopIcon(number, selected = false) {
        return L.divIcon({
            className: `route-stop-icon${selected ? " is-selected" : ""}`,
            html: `<span>${number}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -15],
        });
    }

    function addRouteStop(latlng, properties = {}, options = {}) {
        const stop = {
            id: properties.id || makeId(),
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
            icon: makeStopIcon(routeStops.length + 1),
        });
        stop.marker = marker;

        marker.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            selectRouteStop(stop.id);
        });
        marker.on("drag", updateRouteGeometry);
        marker.on("dragend", () => {
            updateRouteGeometry();
            schedulePersist();
        });

        marker.addTo(routeGroup);
        routeStops.push(stop);
        updateRouteGeometry();
        if (options.select !== false) selectRouteStop(stop.id);
        if (options.persist !== false) schedulePersist();
        return stop;
    }

    function updateRouteGeometry() {
        routeLine.setLatLngs(routeStops.map((stop) => stop.marker.getLatLng()));
        routeStops.forEach((stop, index) => {
            stop.marker.setIcon(
                makeStopIcon(index + 1, stop.id === selectedStopId),
            );
            const label = stop.name || `Stop ${index + 1}`;
            stop.marker.unbindTooltip();
            stop.marker.bindTooltip(label, {
                direction: "top",
                offset: [0, -14],
            });
        });
        updatePlannerSummary();
    }

    function routeDistanceKm() {
        let metres = 0;
        for (let index = 1; index < routeStops.length; index += 1) {
            metres += routeStops[index - 1].marker
                .getLatLng()
                .distanceTo(routeStops[index].marker.getLatLng());
        }
        return metres / 1000;
    }

    function updatePlannerSummary() {
        if (!plannerUi) return;
        const count = routeStops.length;
        const distance = routeDistanceKm();
        plannerUi.summary.textContent = `${count} ${count === 1 ? "stop" : "stops"} · ${distance.toLocaleString(undefined, { maximumFractionDigits: 0 })} km straight-line distance`;
        plannerUi.undo.disabled = count === 0;
        plannerUi.clearRoute.disabled = count === 0;
        plannerUi.exportRoute.disabled = count === 0;
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

    function selectRouteStop(id) {
        selectedStopId = id;
        const stop = routeStops.find((item) => item.id === id) || null;
        if (plannerUi) {
            plannerUi.editor.hidden = !stop;
            if (stop) {
                const index = routeStops.indexOf(stop);
                plannerUi.editorTitle.textContent = `Edit stop ${index + 1}`;
                plannerUi.stopName.value = stop.name;
                plannerUi.stopNotes.value = stop.notes;
                plannerUi.moveUp.disabled = index === 0;
                plannerUi.moveDown.disabled = index === routeStops.length - 1;
            }
        }
        updateRouteGeometry();
    }

    function deleteRouteStop(id) {
        const index = routeStops.findIndex((item) => item.id === id);
        if (index < 0) return;
        routeGroup.removeLayer(routeStops[index].marker);
        routeStops.splice(index, 1);
        selectedStopId = null;
        if (plannerUi) plannerUi.editor.hidden = true;
        updateRouteGeometry();
        schedulePersist();
    }

    function moveSelectedStop(delta) {
        const index = routeStops.findIndex(
            (item) => item.id === selectedStopId,
        );
        const destination = index + delta;
        if (index < 0 || destination < 0 || destination >= routeStops.length)
            return;
        [routeStops[index], routeStops[destination]] = [
            routeStops[destination],
            routeStops[index],
        ];
        selectRouteStop(selectedStopId);
        schedulePersist();
    }

    function clearRoute(options = {}) {
        for (const stop of routeStops) routeGroup.removeLayer(stop.marker);
        routeStops = [];
        selectedStopId = null;
        routeLine.setLatLngs([]);
        if (plannerUi) plannerUi.editor.hidden = true;
        updateRouteGeometry();
        if (options.persist !== false) schedulePersist();
    }

    map.on("click", (event) => {
        if (addingStops) {
            addRouteStop(event.latlng);
        } else if (selectedStopId) {
            selectRouteStop(null);
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

    function routeFeatures() {
        const features = routeStops.map((stop, index) => {
            const latlng = stop.marker.getLatLng();
            return {
                type: "Feature",
                properties: {
                    kind: "route-stop",
                    id: stop.id,
                    order: index + 1,
                    name: stop.name || `Stop ${index + 1}`,
                    notes: stop.notes || "",
                },
                geometry: {
                    type: "Point",
                    coordinates: [latlng.lng, latlng.lat],
                },
            };
        });

        if (routeStops.length >= 2) {
            features.push({
                type: "Feature",
                properties: {
                    kind: "route-line",
                    name: "Trip route",
                    distanceKmStraightLine: Number(
                        routeDistanceKm().toFixed(1),
                    ),
                },
                geometry: {
                    type: "LineString",
                    coordinates: routeStops.map((stop) => {
                        const latlng = stop.marker.getLatLng();
                        return [latlng.lng, latlng.lat];
                    }),
                },
            });
        }

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

    function makeFeatureCollection(features, scope) {
        return {
            type: "FeatureCollection",
            metadata: {
                application: "Southeast Asia trip planner",
                scope,
                exportedAt: new Date().toISOString(),
                routeDistanceIsStraightLine: true,
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

    function loadWorkspaceData(data, options = {}) {
        const collection = normalizeFeatureCollection(data);
        const features = collection.features.filter(Boolean);
        const stopFeatures = features
            .filter(
                (feature) =>
                    feature.geometry?.type === "Point" &&
                    feature.properties?.kind === "route-stop",
            )
            .sort(
                (a, b) =>
                    Number(a.properties?.order || 0) -
                    Number(b.properties?.order || 0),
            );
        const sketchFeaturesToLoad = features.filter(
            (feature) =>
                feature.properties?.kind !== "route-stop" &&
                feature.properties?.kind !== "route-line",
        );

        restoreInProgress = true;
        clearRoute({ persist: false });
        clearSketches({ persist: false });

        for (const feature of stopFeatures) {
            const [lon, lat] = feature.geometry.coordinates || [];
            if (
                !Number.isFinite(Number(lat)) ||
                !Number.isFinite(Number(lon))
            ) {
                continue;
            }
            addRouteStop(
                [Number(lat), Number(lon)],
                {
                    id: feature.properties?.id,
                    name: feature.properties?.name || "",
                    notes: feature.properties?.notes || "",
                },
                { select: false, persist: false },
            );
        }

        importSketchFeatures(sketchFeaturesToLoad);
        selectRouteStop(null);
        restoreInProgress = false;
        updateRouteGeometry();

        const bounds = L.featureGroup([routeGroup, sketchGroup]).getBounds();
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
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            loadWorkspaceData(JSON.parse(raw), {
                fit: false,
                persist: false,
            });
            setPlannerMessage(
                "Restored your browser-saved workspace.",
                "success",
            );
        } catch (error) {
            console.warn("Could not restore workspace", error);
            localStorage.removeItem(STORAGE_KEY);
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
                        <div class="planner-section__title">Route</div>
                        <p class="planner-hint">Add stops, drag them into place, and edit their names. The line connects stops in order.</p>
                        <div class="planner-actions">
                            <button class="js-add-stops" type="button" aria-pressed="false">Add route stops</button>
                            <button class="js-undo" type="button">Undo last</button>
                            <button class="js-export-route" type="button">Export route</button>
                            <button class="js-clear-route danger" type="button">Clear route</button>
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
                        <p class="planner-hint">Export the complete workspace or import any GeoJSON. Route stops are preserved as editable numbered points.</p>
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

            plannerUi.addStops.addEventListener("click", () => {
                setAddingStops(!addingStops);
                setPlannerMessage(
                    addingStops
                        ? "Click the map to add stops. Press Escape when finished."
                        : "Route editing paused.",
                );
            });

            plannerUi.undo.addEventListener("click", () => {
                const last = routeStops.at(-1);
                if (last) deleteRouteStop(last.id);
            });

            plannerUi.clearRoute.addEventListener("click", () => {
                if (routeStops.length && confirm("Clear all route stops?")) {
                    clearRoute();
                    setPlannerMessage("Route cleared.");
                }
            });

            plannerUi.exportRoute.addEventListener("click", () => {
                downloadGeoJson(
                    makeFeatureCollection(routeFeatures(), "route"),
                    `southeast-asia-route-${dateStamp()}.geojson`,
                );
                setPlannerMessage("Route GeoJSON downloaded.", "success");
            });

            plannerUi.stopName.addEventListener("input", () => {
                const stop = routeStops.find(
                    (item) => item.id === selectedStopId,
                );
                if (!stop) return;
                stop.name = plannerUi.stopName.value;
                updateRouteGeometry();
                schedulePersist();
            });

            plannerUi.stopNotes.addEventListener("input", () => {
                const stop = routeStops.find(
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
                if (selectedStopId) deleteRouteStop(selectedStopId);
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
                    routeGroup,
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
                        routeStops.length > 0 ||
                        sketchGroup.getLayers().length > 0;
                    if (
                        hasWorkspace &&
                        !confirm(
                            "Replace the current route and drawings with this file?",
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

            updatePlannerSummary();
            return container;
        },
    });

    map.addControl(new PlannerControl());
    restoreSavedWorkspace();
})();
