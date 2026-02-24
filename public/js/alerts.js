import {
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  deleteDoc,
  doc
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

  /* ================= POPULATE DROPDOWN ================= */

  function populateDropdown() {
    alertSymbol.innerHTML = "";

    getWatchlist().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.symbol;
      opt.textContent = `${s.name} (${s.symbol})`;
      alertSymbol.appendChild(opt);
    });
  }

  /* ================= REALTIME LISTENER ================= */

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
          <button class="remove-alert" data-id="${alertId}">✕</button>
        `;

        alertList.appendChild(div);

        // 🔥 Show popup only when modified → triggered = true
        snapshot.docChanges().forEach(change => {
          if (
            change.type === "modified" &&
            change.doc.id === alertId &&
            change.doc.data().triggered === true
          ) {
            showDesktopNotification(a.symbol, a.price);
          }
        });

      });

      /* ===== REMOVE BUTTON HANDLER ===== */

      document.querySelectorAll(".remove-alert").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;

          await deleteDoc(
            doc(db, "users", getUserId(), "alerts", id)
          );
        };
      });

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
    populateDropdown
  };
}
