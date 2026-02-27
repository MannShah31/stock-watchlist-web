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
let watchlists = {};
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

/* ================== HELPERS ================== */

function getCurrentWatchlist() {
  return watchlists[currentWatchlistName] || [];
}

async function saveWatchlists() {
  await setDoc(
    doc(db, "users", userId),
    { watchlists },
    { merge: true }
  );
}

function rebuildWatchlistSelector() {
  if (!watchlistSelector) return;

  watchlistSelector.innerHTML = "";

  Object.keys(watchlists).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    watchlistSelector.appendChild(opt);
  });

  if (!watchlists[currentWatchlistName]) {
    currentWatchlistName = Object.keys(watchlists)[0];
  }

  watchlistSelector.value = currentWatchlistName;
}

/* ================== AUTO REFRESH ================== */

function startWatchlistAutoRefresh() {
  stopWatchlistAutoRefresh();
  if (!window.watchlistInstance) return;

  watchlistInterval = setInterval(() => {
    window.watchlistInstance.render();
  }, 60000);
}

function stopWatchlistAutoRefresh() {
  if (watchlistInterval) {
    clearInterval(watchlistInterval);
    watchlistInterval = null;
  }
}

function startIndicesAutoRefresh() {
  stopIndicesAutoRefresh();
  loadIndices();
  indicesInterval = setInterval(loadIndices, 300000);
}

function stopIndicesAutoRefresh() {
  if (indicesInterval) {
    clearInterval(indicesInterval);
    indicesInterval = null;
  }
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
function setQuickFilter(type) {
  window.quickFilter = type;

  document.querySelectorAll(".qf-btn").forEach(btn =>
    btn.classList.remove("active")
  );

  const btnId =
    type === "all" ? "filterAll" :
    type === "gainers" ? "filterGainers" :
    "filterLosers";

  document.getElementById(btnId)?.classList.add("active");

  window.watchlistInstance?.render();
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

    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();

      if (data.watchlists && typeof data.watchlists === "object") {
        watchlists = data.watchlists;
      }
      else if (data.watchlist && Array.isArray(data.watchlist)) {
        watchlists = { Default: data.watchlist };

        await setDoc(userRef, {
          watchlists,
          watchlist: null
        }, { merge: true });
      }
      else {
        watchlists = { Default: [] };
        await setDoc(userRef, { watchlists }, { merge: true });
      }
    } else {
      watchlists = { Default: [] };
      await setDoc(userRef, { watchlists });
    }

    if (!Object.keys(watchlists).length) {
      watchlists = { Default: [] };
      await saveWatchlists();
    }

    currentWatchlistName = Object.keys(watchlists)[0];

    rebuildWatchlistSelector();

    const wl = setupWatchlist({
      dropdown,
      search,
      getUserId: () => userId,
      getWatchlist: () => getCurrentWatchlist(),
      setWatchlist: async list => {
        watchlists[currentWatchlistName] = list;
        await saveWatchlists();
      }
    });

    window.watchlistInstance = wl;

    alerts = setupAlerts({
      alertSymbol,
      alertPrice,
      addAlertBtn,
      alertList,
      getUserId: () => userId,
      getWatchlist: () => getCurrentWatchlist()
    });

    wl.render();
    startWatchlistAutoRefresh();

    alerts.populateDropdown();
    alerts.loadAlerts();

    populateFiltersFromWatchlist(getCurrentWatchlist());
    /* 🔥 FILTER LISTENERS */

document.getElementById("industryFilter")
  ?.addEventListener("change", () => {
    window.watchlistInstance?.render();
  });

document.getElementById("categoryFilter")
  ?.addEventListener("change", () => {
    window.watchlistInstance?.render();
  });

document.getElementById("clearFilters")
  ?.addEventListener("click", () => {
    document.getElementById("industryFilter").value = "";
    document.getElementById("categoryFilter").value = "";
    window.quickFilter = "all";

    document.querySelectorAll(".qf-btn").forEach(btn =>
      btn.classList.remove("active")
    );

    document.getElementById("filterAll")?.classList.add("active");

    window.watchlistInstance?.render();
  });

/* 🔥 QUICK FILTER BUTTONS */

document.getElementById("filterAll")
  ?.addEventListener("click", () => setQuickFilter("all"));

document.getElementById("filterGainers")
  ?.addEventListener("click", () => setQuickFilter("gainers"));

document.getElementById("filterLosers")
  ?.addEventListener("click", () => setQuickFilter("losers"));
  },

  onLogout: () => {
    stopWatchlistAutoRefresh();
    stopIndicesAutoRefresh();

    userId = null;
    watchlists = {};
    alerts = null;
    window.watchlistInstance = null;
    window.currentUser = null;

    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
  }
});

/* ================== WATCHLIST EVENTS ================== */

watchlistSelector?.addEventListener("change", () => {
  currentWatchlistName = watchlistSelector.value;
  window.watchlistInstance?.render();
  populateFiltersFromWatchlist(getCurrentWatchlist());
});

createWatchlistBtn?.addEventListener("click", async () => {
  const name = prompt("Enter new watchlist name:");
  if (!name || watchlists[name]) return;

  watchlists[name] = [];
  currentWatchlistName = name;

  await saveWatchlists();
  rebuildWatchlistSelector();
  window.watchlistInstance?.render();
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
  window.watchlistInstance?.render();
});

/* ================== INDICES ================== */

async function loadIndices() {
  try {
    const res = await fetch("/api/indices");
    const data = await res.json();

    indicesTableBody.innerHTML = "";

    function renderGroup(title, stocks) {

      const headerRow = document.createElement("tr");
      headerRow.innerHTML = `
        <td colspan="8" style="font-weight:700;color:#60a5fa;padding-top:20px;">
          ${title}
        </td>
      `;
      indicesTableBody.appendChild(headerRow);

      stocks.forEach(d => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${d.symbol.replace(".NS","")}</td>

          <td>₹${d.price?.toFixed(2) ?? "-"}</td>

          <td class="${d.dayChange >= 0 ? "pos" : "neg"}">
            ₹${d.dayChange?.toFixed(2) ?? "-"}
          </td>

          <td class="${d.weekChange >= 0 ? "pos" : "neg"}">
            ${d.weekChange?.toFixed(2) ?? "-"}%
          </td>

          <td class="${d.monthChange >= 0 ? "pos" : "neg"}">
            ${d.monthChange?.toFixed(2) ?? "-"}%
          </td>

          <td class="${d.threeMonthChange >= 0 ? "pos" : "neg"}">
            ${d.threeMonthChange?.toFixed(2) ?? "-"}%
          </td>

          <td>${d.high52?.toFixed(2) ?? "-"}</td>

          <td>${d.low52?.toFixed(2) ?? "-"}</td>
        `;

        indicesTableBody.appendChild(tr);
      });
    }

    renderGroup("Nifty 50", data.nifty50 || []);
    renderGroup("Sensex", data.sensex || []);

  } catch (e) {
    console.error("Failed to load indices", e);
  }
}
/* ================= TAB SWITCHING ================= */

const tabWatch = document.getElementById("tabWatch");
const tabAlerts = document.getElementById("tabAlerts");
const tabIndices = document.getElementById("tabIndices");

const watchTab = document.getElementById("watchTab");
const alertsTab = document.getElementById("alertsTab");
const indicesTab = document.getElementById("indicesTab");

tabWatch.onclick = () => {

  tabWatch.classList.add("active");
  tabAlerts.classList.remove("active");
  tabIndices.classList.remove("active");

  watchTab.style.display = "block";
  alertsTab.style.display = "none";
  indicesTab.style.display = "none";

  startWatchlistAutoRefresh();
  stopIndicesAutoRefresh();
};

tabAlerts.onclick = () => {

  tabAlerts.classList.add("active");
  tabWatch.classList.remove("active");
  tabIndices.classList.remove("active");

  watchTab.style.display = "none";
  alertsTab.style.display = "block";
  indicesTab.style.display = "none";

  stopWatchlistAutoRefresh();
  stopIndicesAutoRefresh();

  alerts?.populateDropdown();
  alerts?.loadAlerts();
};

tabIndices.onclick = () => {

  tabIndices.classList.add("active");
  tabWatch.classList.remove("active");
  tabAlerts.classList.remove("active");

  watchTab.style.display = "none";
  alertsTab.style.display = "none";
  indicesTab.style.display = "block";

  stopWatchlistAutoRefresh();
  startIndicesAutoRefresh();
};
