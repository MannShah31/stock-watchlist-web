import {
  doc,
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  query,
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

  let shownNotifications = new Set();

  /* ================= DESKTOP NOTIFICATION ================= */

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;

    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }

function showDesktopNotification(symbol, target) {

  console.log("Notification permission:", Notification.permission);

  if (!("Notification" in window)) {
    console.log("Notifications not supported");
    return;
  }

  if (Notification.permission !== "granted") {
    console.log("Permission not granted");
    return;
  }

  const notification = new Notification("🔔 Stock Alert Triggered!", {
    body: `${symbol} crossed ₹${target}`
  });

  console.log("Notification triggered");
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

  /* ---------- REAL-TIME LISTENER ---------- */
  function startRealtimeListener() {
    const q = query(
      collection(db, "users", getUserId(), "alerts")
    );

    onSnapshot(q, snapshot => {

      alertList.innerHTML = "";

      if (snapshot.empty) {
        alertList.innerHTML = `<p style="opacity:.5">No alerts set</p>`;
        return;
      }

      snapshot.forEach(docSnap => {

        const a = docSnap.data();
        const alertId = docSnap.id;

        const div = document.createElement("div");
        div.className = "alert-item";

        div.innerHTML = `
          <span>${a.symbol}</span>
          <span>₹${a.price}</span>
          <span>${a.triggered ? "✅ Triggered" : "⏳ Waiting"}</span>
        `;

        alertList.appendChild(div);

        // 🔥 SHOW DESKTOP POPUP ONLY ON FIRST TRIGGER
        if (a.triggered && !shownNotifications.has(alertId)) {
          showDesktopNotification(a.symbol, a.price);
          shownNotifications.add(alertId);
        }

      });
    });
  }

  /* ---------- LOAD ALERTS (fallback manual load) ---------- */
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
