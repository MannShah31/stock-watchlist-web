import {
  collection,
  addDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from "./firebase.js";

export function setupAlerts({
  alertSymbol,
  alertPrice,
  addAlertBtn,
  alertList,
  getUserId,
  getWatchlist
}) {

  // 🔄 Fill dropdown from watchlist
  function populate() {
    alertSymbol.innerHTML = "";
    getWatchlist().forEach(s => {
      const o = document.createElement("option");
      o.value = s.symbol;
      o.textContent = `${s.name} (${s.symbol})`;
      alertSymbol.appendChild(o);
    });
  }

  // ➕ Add new alert
  addAlertBtn.onclick = async () => {
    const sym = alertSymbol.value;
    const price = +alertPrice.value;
    if (!sym || !price) return alert("Fill both fields");

    await addDoc(collection(db, "users", getUserId(), "alerts"), {
      symbol: sym,
      price,
      email: window.currentUser.email,
      triggered: false,
      createdAt: new Date()
    });

    alertPrice.value = "";
    load();
  };

  // 🔄 Load alerts
  async function load() {
    alertList.innerHTML = "";
    const snap = await getDocs(
      collection(db, "users", getUserId(), "alerts")
    );

    snap.forEach(d => {
      const a = d.data();
      const row = document.createElement("div");
      row.className = "alert-row";

      row.innerHTML = `
        <span class="alert-chip">${a.symbol}</span>
        <span>₹${a.price}</span>
        <span>${a.triggered ? "Triggered" : "Pending"}</span>
        <button>✕</button>
      `;

      row.querySelector("button").onclick = async () => {
        await deleteDoc(d.ref);
        load();
      };

      alertList.appendChild(row);
    });
  }

  return {
    populate,
    load
  };
}
