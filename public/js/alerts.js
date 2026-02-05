import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { db } from "./firebase.js";

/**
 * You MUST implement this function
 * It should return the CURRENT PRICE of the symbol
 */
async function getLivePrice(symbol) {
  // 🔴 REPLACE THIS WITH YOUR REAL API
  // Example:
  // const res = await fetch(`/api/price?symbol=${symbol}`)
  // const data = await res.json()
  // return data.price

  throw new Error("getLivePrice() not implemented");
}

export function setupAlerts({
  alertSymbol,
  alertPrice,
  addAlertBtn,
  alertList,
  getUserId,
  getWatchlist
}) {

  /* ---------------- DROPDOWN ---------------- */

  function populateDropdown() {
    alertSymbol.innerHTML = "";

    getWatchlist().forEach(stock => {
      const option = document.createElement("option");
      option.value = stock.symbol;
      option.textContent = `${stock.name} (${stock.symbol})`;
      alertSymbol.appendChild(option);
    });
  }

  /* ---------------- ADD ALERT ---------------- */

  addAlertBtn.onclick = async () => {
    const uid = getUserId();
    if (!uid) return alert("Not logged in");

    const symbol = alertSymbol.value;
    const price = Number(alertPrice.value);

    if (!symbol || !price) {
      return alert("Please fill both symbol and price");
    }

    await addDoc(collection(db, "users", uid, "alerts"), {
      symbol,
      price,
      email: window.currentUser.email,
      triggered: false,
      createdAt: new Date()
    });

    alertPrice.value = "";
    loadAlerts();
  };

  /* ---------------- LOAD ALERTS ---------------- */

  async function loadAlerts() {
    const uid = getUserId();
    if (!uid) return;

    const snap = await getDocs(collection(db, "users", uid, "alerts"));
    alertList.innerHTML = "";

    snap.forEach(docSnap => {
      const alert = docSnap.data();

      const row = document.createElement("div");
      row.className = "alert-row";

      row.innerHTML = `
        <span class="alert-chip">${alert.symbol}</span>
        <span>₹${alert.price}</span>
        <span class="${alert.triggered ? "triggered" : "pending"}">
          ${alert.triggered ? "Triggered" : "Pending"}
        </span>
        <button>✕</button>
      `;

      row.querySelector("button").onclick = async () => {
        await deleteDoc(doc(db, "users", uid, "alerts", docSnap.id));
        loadAlerts();
      };

      alertList.appendChild(row);
    });
  }

  /* ---------------- CHECK & TRIGGER ALERTS ---------------- */

  async function checkAlerts() {
    const uid = getUserId();
    if (!uid) return;

    const snap = await getDocs(collection(db, "users", uid, "alerts"));

    for (const docSnap of snap.docs) {
      const alert = docSnap.data();

      // Skip already triggered alerts
      if (alert.triggered) continue;

      try {
        const livePrice = await getLivePrice(alert.symbol);

        if (livePrice >= alert.price) {
          await updateDoc(
            doc(db, "users", uid, "alerts", docSnap.id),
            {
              triggered: true,
              triggeredAt: new Date(),
              triggeredPrice: livePrice
            }
          );

          // Optional: toast / notification
          console.log(
            `ALERT TRIGGERED: ${alert.symbol} hit ₹${livePrice}`
          );
        }
      } catch (err) {
        console.error("Price fetch failed:", err);
      }
    }

    loadAlerts();
  }

  /* ---------------- AUTO CHECK LOOP ---------------- */

  setInterval(checkAlerts, 30_000); // every 30 seconds

  return {
    populateDropdown,
    loadAlerts,
    checkAlerts
  };
}
