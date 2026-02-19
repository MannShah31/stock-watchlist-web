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
function resetScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

/* ================== INDICES ================== */
async function loadIndices() {
  try {
    const res = await fetch("/api/indices");
    const data = await res.json();

    indicesTableBody.innerHTML = "";

    function renderGroup(title, stocks) {
      const headerRow = document.createElement("tr");
      headerRow.innerHTML = `
        <td colspan="10" style="font-weight:700;color:#60a5fa;padding-top:20px;">
          ${title}
        </td>
      `;
      indicesTableBody.appendChild(headerRow);

      stocks.forEach(d => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d.symbol.replace(".NS","")}</td>
          <td>₹${d.price.toFixed(2)}</td>
          <td class="${d.dayChange >= 0 ? "pos" : "neg"}">
            ₹${d.dayChange?.toFixed(2) ?? "-"}
          </td>
          <td>${d.weekChange?.toFixed(2) ?? "-"}%</td>
          <td>${d.monthChange?.toFixed(2) ?? "-"}%</td>
          <td>${d.threeMonthChange?.toFixed(2) ?? "-"}%</td>
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


function startIndicesAutoRefresh() {
  stopIndicesAutoRefresh();
  loadIndices();
  indicesInterval = setInterval(loadIndices, 5 * 60 * 1000); // 5 mins
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

    resetScroll();

    // default → Watchlist
    tabWatch.classList.add("active");
    tabAlerts.classList.remove("active");
    tabIndices.classList.remove("active");

    watchTab.style.display = "block";
    alertsTab.style.display = "none";
    indicesTab.style.display = "none";

    window.allStocks = await getAllStocks();

    console.log("Loaded stocks count:", window.allStocks?.length);

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
    stopIndicesAutoRefresh();

    userId = null;
    watchlist = [];
    alerts = null;
    window.currentUser = null;

    alertList.innerHTML = "";
    alertSymbol.innerHTML = "";
    indicesTableBody.innerHTML = "";

    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
  }
});

/* ================== TAB SWITCHING ================== */
tabWatch.onclick = () => {
  resetScroll();
  stopIndicesAutoRefresh();

  tabWatch.classList.add("active");
  tabAlerts.classList.remove("active");
  tabIndices.classList.remove("active");

  watchTab.style.display = "block";
  alertsTab.style.display = "none";
  indicesTab.style.display = "none";
};

tabAlerts.onclick = () => {
  resetScroll();
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
  resetScroll();

  tabIndices.classList.add("active");
  tabWatch.classList.remove("active");
  tabAlerts.classList.remove("active");

  watchTab.style.display = "none";
  alertsTab.style.display = "none";
  indicesTab.style.display = "block";

  startIndicesAutoRefresh();
};
