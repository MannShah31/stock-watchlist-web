import { setupAuth } from "./auth.js";
import { getAllStocks } from "./api.js";
import { setupWatchlist } from "./watchlist.js";

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
  },
  onLogout: ()=>{
    userId=null; watchlist=[];
    loginScreen.style.display="flex";
    appScreen.style.display="none";
  }
});
