import {
  doc,
  collection,
  addDoc,
  getDocs,
  onSnapshot,
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

  // 🔥 Prevent duplicate desktop notifications
  const shownNotifications = new Set();

  /* ================= DESKTOP NOTIFICATION ================= */

  function requestNotificationPermission() {
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().then(permission => {
        console.log("Notification permission:", permission);
      });
    }
  }

  function showDesktopNotification(symbol, target, alertId) {

    if (!("Notification" in window)) return;

    if (Notification.permission !== "granted") {
      console.log("Notifications not granted");
      return;
    }

    // 🔥 Prevent duplicate popup
    if (shownNotifications.has(alertId)) return;

    const notification = new Notification("🚨 Stock Alert Triggered!", {
      body: `${symbol} crossed ₹${target}`,
      icon: "/favicon.ico",
      tag: alertId
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    setTimeout(() => {
      notification.close();
    }, 8000);

    shownNotifications.add(alertId);
  }

  /* ================= POPULATE DROPDOWN ================= */

  function populateDropdown() {
    alertSymbol.innerHTML = "";

    const list = getWatchlist();

    if (!list.length) return;

    list.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.symbol;
      opt.textContent = `${s.name} (${s.symbol})`;
      alertSymbol.appendChild(opt);
    });
  }

  /* ================= REAL-TIME LISTENER ================= */

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
        const alertId = docSnap.id;

        const div = document.createElement("div");
        div.className = "alert-item";

        div.innerHTML = `
          <span>${a.symbol}</span>
          <span>₹${a.price}</span>
          <span>${a.triggered ? "✅ Triggered" : "⏳ Waiting"}</span>
          <button class="delete-alert" data-id="${alertId}">✕</button>
        `;

        alertList.appendChild(div);

        // 🔥 Show popup if triggered
        if (a.triggered === true) {
          showDesktopNotification(a.symbol, a.price, alertId);
        }
      });

      // 🔥 Attach delete listeners
      document.querySelectorAll(".delete-alert").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;

          await deleteDoc(
            doc(db, "users", getUserId(), "alerts", id)
          );

          shownNotifications.delete(id);
        };
      });

    });
  }

  /* ================= LOAD ALERTS (MANUAL REFRESH) ================= */

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
      const alertId = docSnap.id;

      const div = document.createElement("div");
      div.className = "alert-item";

      div.innerHTML = `
        <span>${a.symbol}</span>
        <span>₹${a.price}</span>
        <span>${a.triggered ? "✅ Triggered" : "⏳ Waiting"}</span>
        <button class="delete-alert" data-id="${alertId}">✕</button>
      `;

      alertList.appendChild(div);
    });
  }

  /* ================= ADD ALERT ================= */

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
