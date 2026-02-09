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
        <td><strong>${i.name}</strong></td>
        <td>₹${fmt(i.oneYear)}</td>
        <td>₹${fmt(i.oneMonth)}</td>
        <td>₹${fmt(i.current)}</td>
        <td>₹${fmt(i.high52)}</td>
        <td>₹${fmt(i.low52)}</td>
        <td class="${pctClass(i.mom)}">${fmt(i.mom)}%</td>
        <td class="${pctClass(i.yoy)}">${fmt(i.yoy)}%</td>
      `;

      indicesTableBody.appendChild(tr);
    });
  } catch (e) {
    console.error("❌ Failed to load indices", e);
  }
}

function startIndicesAutoRefresh() {
  stopIndicesAutoRefresh();
  loadIndices();
  indicesInterval = setInterval(loadIndices, 5 * 60 * 1000); // 5 min
}

function stopIndicesAutoRefresh() {
  if (indicesInterval) {
    clearInterval(indicesInterval);
    indicesInterval = null;
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
