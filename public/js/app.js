import { setupAuth } from "./auth.js";
import { getAllStocks } from "./api.js";
import { setupWatchlist } from "./watchlist.js";
import { setupAlerts } from "./alerts.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

/* ================== STATE ================== */
let userId = null;
let watchlist = [];
let alerts = null;
let indicesInterval = null;

window.currentUser = null;

/* ================== DOM ================== */
const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

// watchlist UI
const stockGrid = document.getElementById("stockGrid");
const dropdown = document.getElementById("dropdown");
const search = document.getElementById("search");

// alerts UI
const alertSymbol = document.getElementById("alertSymbol");
const alertPrice = document.getElementById("alertPrice");
const addAlertBtn = document.getElementById("addAlertBtn");
const alertList = document.getElementById("alertList");

// indices UI
const indicesTableBody = document.getElementById("indicesTableBody");

// tabs
const tabWatch = document.getElementById("tabWatch");
const tabAlerts = document.getElementById("tabAlerts");
const tabIndices = document.getElementById("tabIndices");

const watchTab = document.getElementById("watchTab");
const alertsTab = document.getElementById("alertsTab");
const indicesTab = document.getElementById("indicesTab");

/* ================== HELPERS ================== */
function pctClass(v) {
  return v >= 0 ? "pos" : "neg";
}

function fmt(n) {
  return n === null || n === undefined ? "-" : n.toFixed(2);
}

/* ================== INDICES ================== */
async function loadIndices() {
  try {
    const res = await fetch("/api/indices");
    const data = await res.json();

    indicesTableBody.innerHTML = "";

    data.forEach(i => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i.name}</td>
        <td>₹${i.twoYearAgo?.toFixed(2) || "-"}</td>
        <td>₹${i.oneYearAgo?.toFixed(2) || "-"}</td>
        <td>₹${i.current.toFixed(2)}</td>
        <td>₹${i.high52.toFixed(2)}</td>
        <td>₹${i.low52.toFixed(2)}</td>
        <td class="${i.mom >= 0 ? "pos" : "neg"}">
          ${i.mom.toFixed(2)}%
        </td>
        <td class="${i.yoy >= 0 ? "pos" : "neg"}">
          ${i.yoy.toFixed(2)}%
        </td>
      `;
      indicesTableBody.appendChild(tr);
    });
  } catch (e) {
    console.error("Failed to load indices", e);
  }
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

    // default tab → Watchlist
    tabWatch.classList.add("active");
    tabAlerts.classList.remove("active");
    tabIndices.classList.remove("active");

    watchTab.style.display = "block";
    alertsTab.style.display = "none";
    indicesTab.style.display = "none";

    // load master stocks
    window.allStocks = await getAllStocks();

    // restore watchlist
    const snap = await getDoc(doc(db, "users", userId));
    watchlist = snap.exists() ? snap.data().watchlist || [] : [];

    const wl = setupWatchlist({
      stockGrid,
      dropdown,
      search,
      getUserId: () => userId,
      getWatchlist: () => watchlist,
      setWatchlist: v => (watchlist = v)
    });

    alerts = setupAlerts({
      alertSymbol,
      alertPrice,
      addAlertBtn,
      alertList,
      getUserId: () => userId,
      getWatchlist: () => watchlist
    });

    wl.render();
    alerts.populateDropdown();
    alerts.loadAlerts();
  },

  onLogout: () => {
    userId = null;
    watchlist = [];
    alerts = null;
    window.currentUser = null;

    stopIndicesAutoRefresh();

    alertList.innerHTML = "";
    alertSymbol.innerHTML = "";
    indicesTableBody.innerHTML = "";

    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
  }
});

/* ================== TAB SWITCHING ================== */
tabWatch.onclick = () => {
  stopIndicesAutoRefresh();

  tabWatch.classList.add("active");
  tabAlerts.classList.remove("active");
  tabIndices.classList.remove("active");

  watchTab.style.display = "block";
  alertsTab.style.display = "none";
  indicesTab.style.display = "none";
};

tabAlerts.onclick = () => {
  stopIndicesAutoRefresh();

  tabAlerts.classList.add("active");
  tabWatch.classList.remove("active");
  tabIndices.classList.remove("active");

  watchTab.style.display = "none";
  alertsTab.style.display = "block";
  indicesTab.style.display = "none";

  if (alerts) {
    alerts.populateDropdown();
    alerts.loadAlerts();
  }
};

tabIndices.onclick = () => {
  tabIndices.classList.add("active");
  tabWatch.classList.remove("active");
  tabAlerts.classList.remove("active");

  watchTab.style.display = "none";
  alertsTab.style.display = "none";
  indicesTab.style.display = "block";

  startIndicesAutoRefresh();
};
