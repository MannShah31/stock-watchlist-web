import { setupAuth } from "./auth.js";
import { getAllStocks } from "./api.js";
import { setupWatchlist } from "./watchlist.js";

import { loadAlerts, renderAlerts, checkAlerts } from "./alerts.js";
import { deleteDoc, doc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

let userId = null;
let watchlist = [];

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

const stockGrid = document.getElementById("stockGrid");
const dropdown = document.getElementById("dropdown");
const search = document.getElementById("search");

const alertSymbol = document.getElementById("alertSymbol");
const alertPrice = document.getElementById("alertPrice");
const addAlertBtn = document.getElementById("addAlertBtn");
const alertList = document.getElementById("alertList");

setupAuth({
  loginBtn, signupBtn, logoutBtn,
  loginScreen, appScreen,
  onLogin: async user => {
    userId = user.uid;
    loginScreen.style.display="none";
    appScreen.style.display="block";

    window.allStocks = await getAllStocks();

    const { render } = setupWatchlist({
      stockGrid, dropdown, search,
      getUserId:()=>userId,
      getWatchlist:()=>watchlist,
      setWatchlist:v=>watchlist=v
    });

    render();

    // 🔔 ALERTS — initialize
    populateAlertDropdown();
    await loadAlerts(userId);
    renderAlerts(alertList, deleteAlert);
    setInterval(() => checkAlerts(userId), 30000);
  },
  onLogout: ()=>{
    userId=null; watchlist=[];
    loginScreen.style.display="flex";
    appScreen.style.display="none";
  }
});

// ---------------------------------
// Alerts UI logic
// ---------------------------------
function populateAlertDropdown(){
  alertSymbol.innerHTML="";
  watchlist.forEach(s=>{
    const o=document.createElement("option");
    o.value=s.symbol;
    o.textContent=`${s.name} (${s.symbol})`;
    alertSymbol.appendChild(o);
  });
}

addAlertBtn.onclick = async () => {
  const s = alertSymbol.value;
  const p = +alertPrice.value;
  if(!s || !p) return alert("Fill both fields");

  await addDoc(collection(db,"users",userId,"alerts"),{
    symbol: s,
    price: p,
    email: auth.currentUser.email,
    triggered: false,
    createdAt: serverTimestamp(),
    triggeredAt: null
  });

  alertPrice.value = "";
  await loadAlerts(userId);
  renderAlerts(alertList, deleteAlert);
};

async function deleteAlert(id){
  await deleteDoc(doc(db,"users",userId,"alerts",id));
  await loadAlerts(userId);
  renderAlerts(alertList, deleteAlert);
}
