import { setupAuth } from "./auth.js";
import { getAllStocks } from "./api.js";
import { setupWatchlist } from "./watchlist.js";
import { setupAlerts } from "./alerts.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

/* ------------------ STATE ------------------ */
let userId = null;
let watchlist = [];
let alerts = null;

window.currentUser = null;

/* ------------------ DOM ------------------ */
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

// tabs
const tabWatch = document.getElementById("tabWatch");
const tabAlerts = document.getElementById("tabAlerts");
const watchTab = document.getElementById("watchTab");
const alertsTab = document.getElementById("alertsTab");

/* ------------------ AUTH ------------------ */
setupAuth({
  loginBtn,
  signupBtn,
  logoutBtn,
  loginScreen,
  appScreen,

  onLogin: async user => {
    userId = user.uid;
    window.currentUser = user;

    // show app
    loginScreen.style.display = "none";
    appScreen.style.display = "block";

    // ✅ ALWAYS open Watchlist tab on login
    tabWatch.classList.add("active");
    tabAlerts.classList.remove("active");
    watchTab.style.display = "block";
    alertsTab.style.display = "none";

    // load all stocks master list
    window.allStocks = await getAllStocks();

    // ✅ restore watchlist from Firestore
    const snap = await getDoc(doc(db, "users", userId));
    watchlist = snap.exists() ? snap.data().watchlist || [] : [];

    // setup watchlist module
    const wl = setupWatchlist({
      stockGrid,
      dropdown,
      search,
      getUserId: () => userId,
      getWatchlist: () => watchlist,
      setWatchlist: v => (watchlist = v)
    });

    // setup alerts module (ONCE per login)
    alerts = setupAlerts({
      alertSymbol,
      alertPrice,
      addAlertBtn,
      alertList,
      getUserId: () => userId,
      getWatchlist: () => watchlist
    });

    // initial renders
    wl.render();
    alerts.populateDropdown();
    alerts.loadAlerts();
  },

  onLogout: () => {
    userId = null;
    watchlist = [];
    alerts = null;
    window.currentUser = null;

    // cleanup UI
    alertList.innerHTML = "";
    alertSymbol.innerHTML = "";

    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
  }
});

/* ------------------ TAB SWITCHING ------------------ */
tabWatch.onclick = () => {
  tabWatch.classList.add("active");
  tabAlerts.classList.remove("active");

  watchTab.style.display = "block";
  alertsTab.style.display = "none";
};

tabAlerts.onclick = () => {
  tabAlerts.classList.add("active");
  tabWatch.classList.remove("active");

  watchTab.style.display = "none";
  alertsTab.style.display = "block";

  // refresh alerts view when opened
  if (alerts) {
    alerts.populateDropdown();
    alerts.loadAlerts();
  }
};
