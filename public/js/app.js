import { setupAuth } from "./auth.js";
import { getAllStocks } from "./api.js";
import { setupWatchlist } from "./watchlist.js";
import { setupAlerts } from "./alerts.js";

let userId = null;
let watchlist = [];
window.currentUser = null;

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

const stockGrid = document.getElementById("stockGrid");
const dropdown = document.getElementById("dropdown");
const search = document.getElementById("search");

// alerts UI
const alertSymbol = document.getElementById("alertSymbol");
const alertPrice = document.getElementById("alertPrice");
const addAlertBtn = document.getElementById("addAlertBtn");
const alertList = document.getElementById("alertList");

const tabWatch = document.getElementById("tabWatch");
const tabAlerts = document.getElementById("tabAlerts");
const watchTab = document.getElementById("watchTab");
const alertsTab = document.getElementById("alertsTab");

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

    const watch = setupWatchlist({
      stockGrid,
      dropdown,
      search,
      getUserId: () => userId,
      getWatchlist: () => watchlist,
      setWatchlist: v => (watchlist = v)
    });

    const alerts = setupAlerts({
      alertSymbol,
      alertPrice,
      addAlertBtn,
      alertList,
      getUserId: () => userId,
      getWatchlist: () => watchlist
    });

    watch.render();
    alerts.populate();
    alerts.load();
  },

  onLogout: () => {
    userId = null;
    watchlist = [];
    window.currentUser = null;

    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
  }
});

// tab switch
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
};
