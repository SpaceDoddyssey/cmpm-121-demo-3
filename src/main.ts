import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet, { LatLng } from "leaflet";
import luck from "./luck";
import "./leafletWorkaround";

const NULL_ISLAND = leaflet.latLng(0, 0);

const GAMEPLAY_ZOOM_LEVEL = 18.5;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const COIN_RATE_MOD = 100;
const MOVE_STEP = 0.0001;

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
const cacheData: Map<string, Coin[]> = new Map<string, Coin[]>();

const shownCaches: string[] = [];

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

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

spawnCaches(NULL_ISLAND);
let curLat = 0;
let curLng = 0;

const sensorButton = document.querySelector("#sensor")!;
sensorButton.addEventListener("click", () => {
  navigator.geolocation.watchPosition((position) => {
    moveTo(position.coords.latitude, position.coords.longitude);
  });
});

document.querySelector("#north")!.addEventListener("click", () => {
  moveTo(curLat + MOVE_STEP, curLng);
});
document.querySelector("#south")!.addEventListener("click", () => {
  moveTo(curLat - MOVE_STEP, curLng);
});
document.querySelector("#east")!.addEventListener("click", () => {
  moveTo(curLat, curLng + MOVE_STEP);
});
document.querySelector("#west")!.addEventListener("click", () => {
  moveTo(curLat, curLng - MOVE_STEP);
});

///////////////
// FUNCTIONS //
///////////////

function moveTo(lat: number, long: number) {
  playerMarker.setLatLng(leaflet.latLng(lat, long));
  map.setView(playerMarker.getLatLng());
  spawnCaches(leaflet.latLng(lat, long));
  curLat = lat;
  curLng = long;
}

function getCacheStorage(i: number, j: number) {
  const cacheKey = `${i},${j}`;
  if (!cacheData.has(cacheKey)) {
    // If the cache value is not in the lookup table, calculate and store it
    const coins = [];
    const numCoins = Math.floor(luck([cacheKey].toString()) * COIN_RATE_MOD);
    for (let index = 0; index < numCoins; index++) {
      coins.push(new Coin(i, j, index));
    }
    cacheData.set(cacheKey, coins);
    return coins;
  }
  return cacheData.get(cacheKey)!;
}

function createPopup(i: number, j: number) {
  const coins = getCacheStorage(i, j);
  const container = document.createElement("div");
  const plural = coins.length != 1 ? "s" : "";
  container.innerHTML = `
            <div>There is a cache here at "${i},${j}".
            It has <span id="value">${coins.length}</span> coin${plural} in it.</div>`;

  const cacheCoinsDiv = document.createElement("div");
  cacheCoinsDiv.prepend(document.createElement("div"));

  cacheCoinsDiv.id = "cacheCoinsDiv";
  for (const coin of coins) {
    const coinDiv = createCacheCoinDiv(coin, i, j, container, coins);
    cacheCoinsDiv.append(coinDiv);
  }
  container.append(cacheCoinsDiv);

  const showInvButtonDiv = document.createElement("div");
  showInvButtonDiv.innerHTML = `<button id="InventoryButton">Show my inventory</button>`;
  const showInvButton =
    showInvButtonDiv.querySelector<HTMLButtonElement>("#InventoryButton")!;
  container.append(showInvButtonDiv);

  let inventoryMade = false;
  let inventoryShowing = false;
  const inventoryDiv = document.createElement("div");
  inventoryDiv.id = "Inventory";
  showInvButton.addEventListener("click", () => {
    if (!inventoryMade) {
      inventoryMade = true;
      inventoryShowing = true;
      inventoryDiv.innerHTML = `Coin Inventory:`;
      for (const coin of inventory) {
        const coinDiv = createInvCoinDiv(coin, i, j, container, coins);
        inventoryDiv.append(coinDiv);
      }
      showInvButtonDiv.append(inventoryDiv);
      showInvButton.innerHTML = `Hide inventory`;
      return;
    }
    if (inventoryShowing) {
      inventoryShowing = false;
      inventoryDiv.classList.add("hidden");
      showInvButton.innerHTML = `Show my inventory`;
    } else {
      inventoryShowing = true;
      inventoryDiv.classList.remove("hidden");
      showInvButton.innerHTML = `Hide inventory`;
    }
  });

  return container;
}

function createCacheCoinDiv(
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
    takeCoinFromCache(coin, i, j);
    container.querySelector<HTMLSpanElement>(
      "#value"
    )!.innerHTML = `${coins.length}`;
    statusPanel.innerHTML = `${inventory.length} points accumulated`;
    coinDiv.style.display = "none";
    const invDiv = container.querySelector<HTMLDivElement>("#Inventory");
    if (invDiv != null) {
      invDiv.append(createInvCoinDiv(coin, i, j, container, coins));
    }
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
    addCoinToCache(coin, i, j);
    container.querySelector<HTMLSpanElement>(
      "#value"
    )!.innerHTML = `${coins.length}`;
    statusPanel.innerHTML = `${inventory.length} points accumulated`;
    container
      .querySelector<HTMLDivElement>("#cacheCoinsDiv")!
      .append(createCacheCoinDiv(coin, i, j, container, coins));
    coinDiv.style.display = "none";
  });
  return coinDiv;
}

function addCoinToCache(coin: Coin, i: number, j: number) {
  const coins = getCacheStorage(i, j);
  coins.push(coin);
  inventory.splice(inventory.indexOf(coin), 1);
}

function takeCoinFromCache(coin: Coin, i: number, j: number) {
  const coins = getCacheStorage(i, j);
  inventory.push(coin);
  coins.splice(inventory.indexOf(coin), 1);
}

function spawnCaches(position: LatLng) {
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

      if (luck([newI, newJ].toString()) < CACHE_SPAWN_PROBABILITY) {
        makeCache(newI, newJ);
      }
    }
  }
}

function makeCache(i: number, j: number) {
  if (shownCaches.includes(`${i},${j}`)) {
    return;
  }
  shownCaches.push(`${i},${j}`);

  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  const cache = leaflet.rectangle(bounds) as leaflet.Layer;

  cache.bindPopup(createPopup(i, j));
  cache.addTo(map);
}
