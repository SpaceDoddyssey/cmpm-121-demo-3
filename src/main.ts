import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet, { LatLng } from "leaflet";
import luck from "./luck";
import "./leafletWorkaround";

const NULL_ISLAND = leaflet.latLng(0, 0);

const GAMEPLAY_ZOOM_LEVEL = 18.5;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const PIT_SPAWN_PROBABILITY = 0.1;
const COIN_RATE_MOD = 100;

class Coin {
  public i: number;
  public j: number;
  public index: number;
  constructor(i: number, j: number, index: number) {
    this.i = i;
    this.j = j;
    this.index = index;
  }
}

const inventory: Coin[] = [];
const pitData: Map<string, Coin[]> = new Map<string, Coin[]>();

const mapContainer = document.querySelector<HTMLElement>("#map")!;

const map = leaflet.map(mapContainer, {
  center: NULL_ISLAND,
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

const playerMarker = leaflet.marker(NULL_ISLAND);
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

//let points = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

function makePit(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  const pit = leaflet.rectangle(bounds) as leaflet.Layer;

  pit.bindPopup(createPopup(i, j));
  pit.addTo(map);
}

function getPitStorage(i: number, j: number) {
  const pitKey = `${i},${j}`;
  if (!pitData.has(pitKey)) {
    // If the pit value is not in the lookup table, calculate and store it
    const coins = [];
    const numCoins = Math.floor(luck([pitKey].toString()) * COIN_RATE_MOD);
    for (let index = 0; index < numCoins; index++) {
      coins.push(new Coin(i, j, index));
    }
    pitData.set(pitKey, coins);
    return coins;
  }
  return pitData.get(pitKey)!;
}

function createPopup(i: number, j: number) {
  const coins = getPitStorage(i, j);
  const container = document.createElement("div");
  container.innerHTML = `
            <div>There is a cache here at "${i},${j}".
            It has <span id="value">${coins.length}</span> coin${
    coins.length != 1 ? "s" : ""
  } in it.</div>
            <button id="Drop">Leave a coin</button>`;

  for (const coin of coins) {
    const coinDiv = document.createElement("div");
    coinDiv.innerHTML = `
      Coin:${coin.i},${coin.j},${coin.index}
      <button id="Take">Take coin</button>`;
    const take = coinDiv.querySelector<HTMLButtonElement>("#Take")!;
    take.addEventListener("click", () => {
      inventory.push(coin);
      coins.splice(coins.indexOf(coin), 1);
      container.querySelector<HTMLSpanElement>(
        "#value"
      )!.innerHTML = `${coins.length}`;
      statusPanel.innerHTML = `${inventory.length} points accumulated`;
      coinDiv.remove();
    });
    container.append(coinDiv);
  }
  // const take = container.querySelector<HTMLButtonElement>("#Take")!;
  // take.addEventListener("click", () => {
  //   if (value == 0) {
  //     return;
  //   }
  //   value--;
  //   container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
  //     value.toString();
  //   points++;
  //   statusPanel.innerHTML = `${points} points accumulated`;
  // });
  // const drop = container.querySelector<HTMLButtonElement>("#Drop")!;
  // drop.addEventListener("click", () => {
  //   if (points == 0) {
  //     return;
  //   }
  //   value++;
  //   container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
  //     value.toString();
  //   points--;
  //   statusPanel.innerHTML = `${points} points accumulated`;
  // });
  return container;
}

spawnPits(NULL_ISLAND);
function spawnPits(position: LatLng) {
  const latitude = position.lat;
  const longitude = position.lng;

  const i = Math.floor(latitude / TILE_DEGREES);
  const j = Math.floor(longitude / TILE_DEGREES);

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
