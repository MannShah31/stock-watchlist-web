import { collection, addDoc, getDocs, deleteDoc, updateDoc, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getPrices } from "./api.js";

export function setupAlerts({
  alertSymbol,
  alertPrice,
  addAlertBtn,
  alertList,
  getUserId,
  getWatchlist
}) {

  addAlertBtn.onclick = async () => {
    const symbol = alertSymbol.value;
    const price = +alertPrice.value;

    if (!symbol || !price) {
      alert("Fill both fields");
      return;
    }

    await addDoc(collection(db, "users", getUserId(), "alerts"), {
      symbol,
      price,
      email: auth.currentUser.email,
      triggered: false,
      createdAt: serverTimestamp(),
      triggeredAt: null
    });

    alertPrice.value = "";
    loadAlerts();
  };

  async function loadAlerts() {
    alertList.innerHTML = "";
    const snap = await getDocs(collection(db, "users", getUserId(), "alerts"));
    snap.forEach(d => renderAlert({ id: d.id, ...d.data() }));
  }

  async function renderAlert(a) {
    const row = document.createElement("div");
    row.className = "alert-row";
    row.innerHTML = `
      <span class="alert-chip">${a.symbol}</span>
      <span>₹${a.price}</span>
      <span>${a.triggered ? "Triggered" : "Pending"}</span>
      <button>✕</button>
    `;

    row.querySelector("button").onclick = async () => {
      await deleteDoc(doc(db, "users", getUserId(), "alerts", a.id));
      loadAlerts();
    };

    alertList.appendChild(row);
  }

  return { loadAlerts };
}
