import {
  doc,
  collection,
  addDoc,
  getDocs,
  onSnapshot
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

  /* ================= DESKTOP NOTIFICATION ================= */

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;

    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }

  function showDesktopNotification(symbol, target) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const notification = new Notification("🔔 Stock Alert Triggered!", {
      body: `${symbol} crossed ₹${target}`,
      icon: "/favicon.ico"
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

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

  /* ---------- REALTIME LISTENER ---------- */
  function startRealtimeListener() {

    const alertsRef = collection(db, "users", getUserId(), "alerts");

    onSnapshot(alertsRef, snapshot => {

      alertList.innerHTML = "";

      if (snapshot.empty) {
        alertList.innerHTML = `<p style="opacity:.5">No alerts set</p>`;
        return;
      }

      snapshot.forEach(docSnap => {

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

      // 🔥 Detect modified → triggered true
      snapshot.docChanges().forEach(change => {
        if (
          change.type === "modified" &&
          change.doc.data().triggered === true
        ) {
          const a = change.doc.data();
          showDesktopNotification(a.symbol, a.price);
        }
      });

    });
  }

  /* ---------- LOAD ALERTS (used by app.js) ---------- */
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
  };

  /* ================= INIT ================= */

  requestNotificationPermission();
  startRealtimeListener();

  return {
    populateDropdown,
    loadAlerts
  };
}
