import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet, { LatLng } from "leaflet";
import luck from "./luck";
import "./leafletWorkaround";

const MERRILL_CLASSROOM = leaflet.latLng({
  lat: 36.9995,
  lng: -122.0533,
});

const GAMEPLAY_ZOOM_LEVEL = 18.5;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const PIT_SPAWN_PROBABILITY = 0.1;

const mapContainer = document.querySelector<HTMLElement>("#map")!;

const map = leaflet.map(mapContainer, {
  center: MERRILL_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet.marker(MERRILL_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const sensorButton = document.querySelector("#sensor")!;
sensorButton.addEventListener("click", () => {
  navigator.geolocation.watchPosition((position) => {
    playerMarker.setLatLng(
      leaflet.latLng(position.coords.latitude, position.coords.longitude)
    );
    map.setView(playerMarker.getLatLng());
    const { latitude, longitude } = position.coords;
    spawnPits(leaflet.latLng(latitude, longitude));
  });
});

let points = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

function makePit(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [
      MERRILL_CLASSROOM.lat + i * TILE_DEGREES,
      MERRILL_CLASSROOM.lng + j * TILE_DEGREES,
    ],
    [
      MERRILL_CLASSROOM.lat + (i + 1) * TILE_DEGREES,
      MERRILL_CLASSROOM.lng + (j + 1) * TILE_DEGREES,
    ],
  ]);

  const pit = leaflet.rectangle(bounds) as leaflet.Layer;

  pit.bindPopup(createPopup(i, j));
  pit.addTo(map);
}

const pitData: Map<string, number> = new Map<string, number>();

function getPitValue(pitKey: string) {
  if (!pitData.has(pitKey)) {
    // If the pit value is not in the lookup table, calculate and store it
    const calculatedValue = Math.floor(luck([pitKey].toString()) * 100);
    pitData.set(pitKey, calculatedValue);
    return calculatedValue;
  }
  return pitData.get(pitKey)!;
}

function createPopup(i: number, j: number) {
  let value = getPitValue(`${i},${j}`);
  const container = document.createElement("div");
  container.innerHTML = `
            <div>There is a pit here at "${i},${j}". It has value <span id="value">${value}</span>.</div>
            <button id="Take">Take coin</button><button id="Drop">Drop coin</button>`;
  const take = container.querySelector<HTMLButtonElement>("#Take")!;
  take.addEventListener("click", () => {
    if (value == 0) {
      return;
    }
    value--;
    container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
      value.toString();
    points++;
    statusPanel.innerHTML = `${points} points accumulated`;
  });
  const drop = container.querySelector<HTMLButtonElement>("#Drop")!;
  drop.addEventListener("click", () => {
    if (points == 0) {
      return;
    }
    value++;
    container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
      value.toString();
    points--;
    statusPanel.innerHTML = `${points} points accumulated`;
  });
  return container;
}

spawnPits(MERRILL_CLASSROOM);
function spawnPits(position: LatLng) {
  const latitude = position.lat;
  const longitude = position.lng;

  const i = Math.floor((latitude - MERRILL_CLASSROOM.lat) / TILE_DEGREES);
  const j = Math.floor((longitude - MERRILL_CLASSROOM.lng) / TILE_DEGREES);

  for (let deltaI = -NEIGHBORHOOD_SIZE; deltaI < NEIGHBORHOOD_SIZE; deltaI++) {
    for (
      let deltaJ = -NEIGHBORHOOD_SIZE;
      deltaJ < NEIGHBORHOOD_SIZE;
      deltaJ++
    ) {
      const newI = i + deltaI;
      const newJ = j + deltaJ;

      if (luck([newI, newJ].toString()) < PIT_SPAWN_PROBABILITY) {
        makePit(newI, newJ);
      }
    }
  }
}
