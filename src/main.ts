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
  const plural = coins.length != 1 ? "s" : "";
  container.innerHTML = `
            <div>There is a cache here at "${i},${j}".
            It has <span id="value">${coins.length}</span> coin${plural} in it.</div>
            <button id="Leave">Leave a coin</button>`;

  const leave = container.querySelector<HTMLButtonElement>("#Leave")!;
  let showingInventory = false;
  leave.addEventListener("click", () => {
    if (showingInventory) {
      return;
    }
    showingInventory = true;
    const inventoryDiv = document.createElement("div");
    inventoryDiv.innerHTML = `Coin Inventory:`;
    for (const coin of inventory) {
      const coinDiv = createInvCoinDiv(coin, i, j, container, coins);
      inventoryDiv.append(coinDiv);
    }
    container.append(inventoryDiv);
  });

  for (const coin of coins) {
    const coinDiv = createPitCoinDiv(coin, i, j, container, coins);
    container.append(coinDiv);
  }

  return container;
}

function createPitCoinDiv(
  coin: Coin,
  i: number,
  j: number,
  container: HTMLDivElement,
  coins: Coin[]
) {
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `
    Coin:${coin.i},${coin.j},${coin.index}
    <button id="Take">Take coin</button>`;
  const take = coinDiv.querySelector<HTMLButtonElement>("#Take")!;
  take.addEventListener("click", () => {
    takeCoinFromPit(coin, i, j);
    container.querySelector<HTMLSpanElement>(
      "#value"
    )!.innerHTML = `${coins.length}`;
    statusPanel.innerHTML = `${inventory.length} points accumulated`;
    coinDiv.remove();
  });
  return coinDiv;
}

function createInvCoinDiv(
  coin: Coin,
  i: number,
  j: number,
  container: HTMLDivElement,
  coins: Coin[]
) {
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `
    Coin:${coin.i},${coin.j},${coin.index}
    <button id="Leave">Leave coin</button>`;
  const leave = coinDiv.querySelector<HTMLButtonElement>("#Leave")!;
  leave.addEventListener("click", () => {
    addCoinToPit(coin, i, j);
    container.querySelector<HTMLSpanElement>(
      "#value"
    )!.innerHTML = `${coins.length}`;
    statusPanel.innerHTML = `${inventory.length} points accumulated`;
    container.append(createPitCoinDiv(coin, i, j, container, coins));
    coinDiv.remove();
  });
  return coinDiv;
}

function addCoinToPit(coin: Coin, i: number, j: number) {
  const coins = getPitStorage(i, j);
  coins.push(coin);
  inventory.splice(inventory.indexOf(coin), 1);
}

function takeCoinFromPit(coin: Coin, i: number, j: number) {
  const coins = getPitStorage(i, j);
  inventory.push(coin);
  coins.splice(inventory.indexOf(coin), 1);
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
