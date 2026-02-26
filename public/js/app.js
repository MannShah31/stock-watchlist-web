import { setupAuth } from "./auth.js";
import { getAllStocks } from "./api.js";
import { setupWatchlist } from "./watchlist.js";
import { setupAlerts } from "./alerts.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

/* ================== STATE ================== */
let userId = null;
let watchlists = {};           // 🔥 multiple watchlists
let currentWatchlistName = "Default";
let alerts = null;
let indicesInterval = null;
let watchlistInterval = null;

window.currentUser = null;
window.quickFilter = "all";
window.watchlistInstance = null;

/* ================== DOM ================== */
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

const dropdown = document.getElementById("dropdown");
const search = document.getElementById("search");

const alertSymbol = document.getElementById("alertSymbol");
const alertPrice = document.getElementById("alertPrice");
const addAlertBtn = document.getElementById("addAlertBtn");
const alertList = document.getElementById("alertList");

const watchlistSelector = document.getElementById("watchlistSelector");
const createWatchlistBtn = document.getElementById("createWatchlistBtn");
const deleteWatchlistBtn = document.getElementById("deleteWatchlistBtn");

const indicesTableBody = document.getElementById("indicesTableBody");

const tabWatch = document.getElementById("tabWatch");
const tabAlerts = document.getElementById("tabAlerts");
const tabIndices = document.getElementById("tabIndices");

const watchTab = document.getElementById("watchTab");
const alertsTab = document.getElementById("alertsTab");
const indicesTab = document.getElementById("indicesTab");

/* ================== HELPERS ================== */

function resetScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function getCurrentWatchlist() {
  return watchlists[currentWatchlistName] || [];
}

function setCurrentWatchlist(list) {
  watchlists[currentWatchlistName] = list;
}

async function saveWatchlists() {
  await setDoc(
    doc(db, "users", userId),
    { watchlists },
    { merge: true }
  );
}

/* ================== AUTO REFRESH ================== */

function startWatchlistAutoRefresh() {
  stopWatchlistAutoRefresh();
  if (!window.watchlistInstance) return;

  watchlistInterval = setInterval(() => {
    window.watchlistInstance.render();
  }, 60 * 1000);
}

function stopWatchlistAutoRefresh() {
  if (watchlistInterval) {
    clearInterval(watchlistInterval);
    watchlistInterval = null;
  }
}

/* ================== WATCHLIST SELECTOR ================== */

function rebuildWatchlistSelector() {
  watchlistSelector.innerHTML = "";

  Object.keys(watchlists).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    watchlistSelector.appendChild(opt);
  });

  watchlistSelector.value = currentWatchlistName;
}

/* ================== FILTER BUILDER ================== */

function populateFiltersFromWatchlist(list) {
  const industries = [...new Set(list.map(s => s.industry))].filter(Boolean);
  const categories = [...new Set(list.map(s => s.category))].filter(Boolean);

  const iSelect = document.getElementById("industryFilter");
  const cSelect = document.getElementById("categoryFilter");

  if (!iSelect || !cSelect) return;

  iSelect.innerHTML = '<option value="">All Industries</option>';
  cSelect.innerHTML = '<option value="">All Categories</option>';

  industries.forEach(i => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = i;
    iSelect.appendChild(opt);
  });

  categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    cSelect.appendChild(opt);
  });
}

/* ================== AUTH ================== */

setupAuth({
  loginBtn,
  signupBtn,
  logoutBtn,
  loginScreen,
  appScreen,

  onLogin: async user => {
    userId = user.uid;
    window.currentUser = user;

    loginScreen.style.display = "none";
    appScreen.style.display = "block";

    window.allStocks = await getAllStocks();

    const snap = await getDoc(doc(db, "users", userId));

    if (snap.exists() && snap.data().watchlists) {
      watchlists = snap.data().watchlists;
    } else {
      watchlists = { Default: [] };
      await saveWatchlists();
    }

    currentWatchlistName = Object.keys(watchlists)[0];

    rebuildWatchlistSelector();

    const wl = setupWatchlist({
      dropdown,
      search,
      getUserId: () => userId,
      getWatchlist: getCurrentWatchlist,
      setWatchlist: list => {
        setCurrentWatchlist(list);
        saveWatchlists();
      }
    });

    window.watchlistInstance = wl;

    alerts = setupAlerts({
      alertSymbol,
      alertPrice,
      addAlertBtn,
      alertList,
      getUserId: () => userId,
      getWatchlist: getCurrentWatchlist
    });

    wl.render();
    startWatchlistAutoRefresh();

    alerts.populateDropdown();
    alerts.loadAlerts();

    populateFiltersFromWatchlist(getCurrentWatchlist());
  },

  onLogout: () => {
    stopWatchlistAutoRefresh();
    stopIndicesAutoRefresh();

    userId = null;
    watchlists = {};
    alerts = null;
    window.currentUser = null;
    window.watchlistInstance = null;

    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
  }
});

/* ================== WATCHLIST EVENTS ================== */

watchlistSelector?.addEventListener("change", () => {
  currentWatchlistName = watchlistSelector.value;
  window.watchlistInstance.render();
  populateFiltersFromWatchlist(getCurrentWatchlist());
});

createWatchlistBtn?.addEventListener("click", async () => {
  const name = prompt("Enter new watchlist name:");
  if (!name || watchlists[name]) return;

  watchlists[name] = [];
  currentWatchlistName = name;

  await saveWatchlists();
  rebuildWatchlistSelector();
  window.watchlistInstance.render();
});

deleteWatchlistBtn?.addEventListener("click", async () => {
  if (Object.keys(watchlists).length <= 1) {
    alert("At least one watchlist required");
    return;
  }

  if (!confirm(`Delete "${currentWatchlistName}"?`)) return;

  delete watchlists[currentWatchlistName];
  currentWatchlistName = Object.keys(watchlists)[0];

  await saveWatchlists();
  rebuildWatchlistSelector();
  window.watchlistInstance.render();
});

/* ================== INDICES ================== */

async function loadIndices() {
  try {
    const res = await fetch("/api/indices");
    const data = await res.json();
    indicesTableBody.innerHTML = "";

    data.nifty50?.forEach(d => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.symbol.replace(".NS","")}</td>
        <td>₹${d.price.toFixed(2)}</td>
      `;
      indicesTableBody.appendChild(tr);
    });

  } catch (e) {
    console.error("Indices error", e);
  }
}

function startIndicesAutoRefresh() {
  stopIndicesAutoRefresh();
  loadIndices();
  indicesInterval = setInterval(loadIndices, 5 * 60 * 1000);
}

function stopIndicesAutoRefresh() {
  if (indicesInterval) {
    clearInterval(indicesInterval);
    indicesInterval = null;
  }
}
