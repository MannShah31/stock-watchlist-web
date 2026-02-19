import {
  doc,
  collection,
  addDoc,
  getDocs,
  updateDoc
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

  /* ---------- POPULATE DROPDOWN ---------- */
  function populateDropdown() {
    alertSymbol.innerHTML = "";

    getWatchlist().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.symbol;
      opt.textContent = `${s.name} (${s.symbol})`;
      alertSymbol.appendChild(opt);
    });
  }

  /* ---------- LOAD ALERTS ---------- */
  async function loadAlerts() {
    alertList.innerHTML = "";

    const snap = await getDocs(
      collection(db, "users", getUserId(), "alerts")
    );

    if (snap.empty) {
      alertList.innerHTML = `<p style="opacity:.5">No alerts set</p>`;
      return;
    }

    snap.forEach(docSnap => {
      const a = docSnap.data();

      const div = document.createElement("div");
      div.className = "alert-item";

      div.innerHTML = `
        <span>${a.symbol}</span>
        <span>₹${a.price}</span>
        <span>${a.triggered ? "✅ Triggered" : "⏳ Waiting"}</span>
      `;

      alertList.appendChild(div);
    });
  }

  /* ---------- ADD ALERT ---------- */
  addAlertBtn.onclick = async () => {
    const symbol = alertSymbol.value;
    const price = parseFloat(alertPrice.value);

    if (!symbol || !price) {
      alert("Enter valid alert");
      return;
    }

    await addDoc(
      collection(db, "users", getUserId(), "alerts"),
      {
        symbol,
        price,
        triggered: false,
        createdAt: new Date()
      }
    );

    alertPrice.value = "";
    loadAlerts();
  };

  return {
    populateDropdown,
    loadAlerts
  };
}
