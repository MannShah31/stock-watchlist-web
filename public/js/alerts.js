import { collection, addDoc, getDocs, deleteDoc, doc } from
  "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";

export function setupAlerts({
  alertSymbol,
  alertPrice,
  addAlertBtn,
  alertList,
  getUserId,
  getWatchlist
}) {

  function populateDropdown() {
    alertSymbol.innerHTML = "";
    getWatchlist().forEach(s => {
      const o = document.createElement("option");
      o.value = s.symbol;
      o.textContent = `${s.name} (${s.symbol})`;
      alertSymbol.appendChild(o);
    });
  }

  addAlertBtn.onclick = async () => {
    const uid = getUserId();
    if (!uid) return alert("Not logged in");

    const symbol = alertSymbol.value;
    const price = Number(alertPrice.value);
    if (!symbol || !price) return alert("Fill both");

    await addDoc(collection(db, "users", uid, "alerts"), {
      symbol,
      price,
      triggered: false,
      createdAt: new Date()
    });

    alertPrice.value = "";
    loadAlerts();
  };

  async function loadAlerts() {
    const uid = getUserId();
    if (!uid) return;

    const snap = await getDocs(collection(db, "users", uid, "alerts"));
    alertList.innerHTML = "";

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
        await deleteDoc(doc(db, "users", uid, "alerts", d.id));
        loadAlerts();
      };
      alertList.appendChild(row);
    });
  }

  return {
    populateDropdown,
    loadAlerts
  };
}
