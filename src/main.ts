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
  constructor(public i: number, public j: number, public index: number) {}
}

const inventory: Coin[] = [];
const cacheData = new Map<string, Coin[]>();

const shownCaches = new Map<
  string,
  { rect: leaflet.Layer; i: number; j: number }
>();

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

let activePopup: HTMLDivElement;

let autoUpdatePosition = false;
const playerMovementHistory: LatLng[] = [];
let movementHistoryPolyline: leaflet.Polyline | undefined;

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

let updateIntervalId: number | undefined = 0;
let startedTracking = false;
const sensorButton = document.querySelector("#sensor")!;
sensorButton.addEventListener("click", toggleAutoUpdate);
function toggleAutoUpdate() {
  autoUpdatePosition = !autoUpdatePosition;

  if (autoUpdatePosition) {
    updatePosition(); // Update immediately when autoUpdatePosition is turned on
    if (!startedTracking) {
      playerMovementHistory.length = 0;
      startedTracking = true;
    }
    updateIntervalId = setInterval(updatePosition, 2000); // Update every 2 seconds
  } else {
    if (updateIntervalId !== undefined) {
      clearInterval(updateIntervalId);
      updateIntervalId = undefined;
    }
  }
}

function updatePosition() {
  navigator.geolocation.getCurrentPosition((position) => {
    moveTo(position.coords.latitude, position.coords.longitude);
  });
}

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

const resetButton = document.querySelector("#reset")!;
resetButton.addEventListener("click", () => {
  const confirmation = prompt(
    "Are you sure you want to reset the game state? (yes/no)"
  );

  if (confirmation && confirmation.toLowerCase() === "yes") {
    resetGameState();
  }
});

loadGameData();

///////////////
// FUNCTIONS //
///////////////

function resetGameState() {
  cacheData.clear();
  inventory.length = 0;
  updateStatusPanel();

  updateMovementHistoryPolyline();

  moveTo(NULL_ISLAND.lat, NULL_ISLAND.lng);
  playerMovementHistory.length = 0;

  alert("Game state has been reset. Have fun!");

  saveGameData();
}

function moveTo(lat: number, long: number) {
  console.log("Moving to ", lat, ",", long, autoUpdatePosition);
  const newLatLng = leaflet.latLng(lat, long);
  playerMarker.setLatLng(newLatLng);
  map.setView(newLatLng);
  clearOutOfRangeCaches(newLatLng);
  spawnCaches(newLatLng);
  curLat = lat;
  curLng = long;

  playerMovementHistory.push(newLatLng);

  updateMovementHistoryPolyline();
}

function updateMovementHistoryPolyline() {
  if (movementHistoryPolyline) {
    movementHistoryPolyline.remove();
  }

  movementHistoryPolyline = leaflet.polyline(playerMovementHistory, {
    color: "blue",
    weight: 3,
    opacity: 0.7,
  });

  movementHistoryPolyline.addTo(map);
}

function saveGameData() {
  localStorage.setItem(
    "cacheData",
    JSON.stringify(Array.from(cacheData.entries()))
  );
  localStorage.setItem("inventory", JSON.stringify(inventory));
}

function loadGameData() {
  const cachedDataString = localStorage.getItem("cacheData");
  const inventoryString = localStorage.getItem("inventory");

  if (cachedDataString) {
    const cachedDataArray: [string, Coin[]][] = JSON.parse(
      cachedDataString
    ) as [string, Coin[]][];
    cacheData.clear();
    cachedDataArray.forEach(([key, value]) => {
      cacheData.set(key, value);
    });
  }

  if (inventoryString) {
    const loadedInventory: Coin[] = JSON.parse(inventoryString) as Coin[];
    inventory.length = 0;
    inventory.push(...loadedInventory);
    updateStatusPanel();
  }
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

function handlePopupOpen(i: number, j: number, div: HTMLDivElement) {
  if (activePopup == div) {
    return;
  }
  activePopup = div;
  const coins = getCacheStorage(i, j);

  const cacheCoinsDiv = document.createElement("div");
  cacheCoinsDiv.prepend(document.createElement("div"));

  cacheCoinsDiv.id = "cacheCoinsDiv";
  for (const coin of coins) {
    const coinDiv = createCacheCoinDiv(coin, i, j, coins);
    cacheCoinsDiv.append(coinDiv);
  }
  activePopup.append(cacheCoinsDiv);

  const showInvButtonDiv = document.createElement("div");
  showInvButtonDiv.innerHTML = `<button id="InventoryButton">Show my inventory</button>`;
  const showInvButton =
    showInvButtonDiv.querySelector<HTMLButtonElement>("#InventoryButton")!;
  activePopup.append(showInvButtonDiv);

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
        const coinDiv = createInvCoinDiv(coin, i, j, coins);
        inventoryDiv.append(coinDiv);
      }
      showInvButtonDiv.append(inventoryDiv);
      showInvButton.innerHTML = `Hide inventory`;
      return;
    }
    inventoryShowing = !inventoryShowing;
    inventoryDiv.classList.toggle("hidden", !inventoryShowing);
    showInvButton.innerHTML = inventoryShowing
      ? "Hide inventory"
      : "Show my inventory";
  });

  updateCacheCountText(coins.length);
  return;
}

function createPopup(i: number, j: number) {
  const popup = document.createElement("div");
  popup.innerHTML = `
            <div>There is a cache here at "${i},${j}".
            It has <span id=value>999</span> coin<span id=plural></span> in it.</div>`;
  return popup;
}

function createCacheCoinDiv(coin: Coin, i: number, j: number, coins: Coin[]) {
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `
    Coin:${coin.i},${coin.j},${coin.index}
    <button id="Take">Take coin</button>`;
  const take = coinDiv.querySelector<HTMLButtonElement>("#Take")!;
  take.addEventListener("click", () => {
    takeCoinFromCache(coin, i, j);
    coinDiv.style.display = "none";
    const invDiv = activePopup.querySelector<HTMLDivElement>("#Inventory");
    if (invDiv != null) {
      invDiv.append(createInvCoinDiv(coin, i, j, coins));
    }
  });
  return coinDiv;
}

function createInvCoinDiv(coin: Coin, i: number, j: number, coins: Coin[]) {
  const coinDiv = document.createElement("div");
  coinDiv.innerHTML = `
    Coin:${coin.i},${coin.j},${coin.index}
    <button id="Leave">Leave coin</button>`;
  const leave = coinDiv.querySelector<HTMLButtonElement>("#Leave")!;
  leave.addEventListener("click", () => {
    addCoinToCache(coin, i, j);
    activePopup
      .querySelector<HTMLDivElement>("#cacheCoinsDiv")!
      .append(createCacheCoinDiv(coin, i, j, coins));
    coinDiv.style.display = "none";
  });
  return coinDiv;
}

function addCoinToCache(coin: Coin, i: number, j: number) {
  const coins = getCacheStorage(i, j);
  coins.push(coin);
  inventory.splice(inventory.indexOf(coin), 1);
  updateCacheCountText(coins.length);
  saveGameData();
}

function takeCoinFromCache(coin: Coin, i: number, j: number) {
  const coins = getCacheStorage(i, j);
  inventory.push(coin);
  coins.splice(coins.indexOf(coin), 1);
  updateCacheCountText(coins.length);
  saveGameData();
}

function updateCacheCountText(count: number) {
  activePopup.querySelector<HTMLSpanElement>("#value")!.innerHTML = `${count}`;
  updateStatusPanel();
  const pluralSpan = activePopup.querySelector<HTMLSpanElement>("#plural")!;
  pluralSpan.innerHTML = count !== 1 ? "s" : "";
}

function updateStatusPanel() {
  statusPanel.innerHTML = `${inventory.length} coin${
    inventory.length !== 1 ? "s" : ""
  } accumulated`;
}

function clearOutOfRangeCaches(position: LatLng) {
  const i = Math.floor(position.lat / TILE_DEGREES);
  const j = Math.floor(position.lng / TILE_DEGREES);

  const keysToRemove: string[] = [];
  for (const [key, value] of shownCaches) {
    if (
      Math.abs(value.i - i) > NEIGHBORHOOD_SIZE ||
      Math.abs(value.j - j) > NEIGHBORHOOD_SIZE
    ) {
      value.rect.remove();
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    shownCaches.delete(key);
  }
}

function spawnCaches(position: LatLng) {
  const i = Math.floor(position.lat / TILE_DEGREES);
  const j = Math.floor(position.lng / TILE_DEGREES);

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
  const cacheKey = `${i},${j}`;
  if (shownCaches.has(cacheKey)) {
    return;
  }

  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  const cacheRect = leaflet.rectangle(bounds) as leaflet.Layer;

  const div = createPopup(i, j);
  cacheRect.bindPopup(div);
  cacheRect.on("popupopen", () => {
    handlePopupOpen(i, j, div);
  });
  shownCaches.set(cacheKey, { rect: cacheRect, i, j });

  cacheRect.addTo(map);
}
