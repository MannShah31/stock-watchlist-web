import { collection, getDocs, updateDoc, doc, serverTimestamp } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getPrices } from "./api.js";

let alerts = [];

export async function loadAlerts(userId) {
  alerts = [];
  const snap = await getDocs(collection(db, "users", userId, "alerts"));
  snap.forEach(d => alerts.push({ id: d.id, ...d.data() }));
  return alerts;
}

export function renderAlerts(alertListEl, deleteFn) {
  alertListEl.innerHTML = "";
  alerts.forEach(a => {
    const row = document.createElement("div");
    row.className = "alert-row";
    row.innerHTML = `
      <span class="alert-chip">${a.symbol}</span>
      <span>₹${a.price}</span>
      <span>${a.triggered ? "Triggered" : "Pending"}</span>
      <span>${a.createdAt?.toDate?.().toLocaleString() || ""}</span>
      <span>${a.triggeredAt?.toDate?.().toLocaleString() || "-"}</span>
      <button>✕</button>
    `;
    row.querySelector("button").onclick = () => deleteFn(a.id);
    alertListEl.appendChild(row);
  });
}

export async function checkAlerts(userId) {
  if (!alerts.length) return;

  const symbols = alerts.map(a => a.symbol);
  const data = await getPrices(symbols);

  for (const a of alerts) {
    if (a.triggered) continue;
    const d = data[a.symbol];
    if (!d) continue;

    if (d.price >= a.price) {
      await fetch("/api/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: a.email,
          symbol: a.symbol,
          target: a.price,
          price: d.price,
          change: d.change,
          changePercent: d.changePercent
        })
      });

      await updateDoc(
        doc(db, "users", userId, "alerts", a.id),
        { triggered: true, triggeredAt: serverTimestamp() }
      );
    }
  }
}
