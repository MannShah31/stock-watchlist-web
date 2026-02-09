import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getPrices } from "./api.js";

export function setupWatchlist({
  stockGrid, // no longer used but kept for compatibility
  dropdown,
  search,
  getUserId,
  getWatchlist,
  setWatchlist
}) {

  const tableBody = document.getElementById("stockTableBody");

  search.addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    dropdown.innerHTML = "";
    if (!q) return;

    window.allStocks
      .filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.symbol.toLowerCase().includes(q)
      )
      .slice(0, 10)
      .forEach(s => {
        const d = document.createElement("div");
        d.className = "option";
        d.textContent = `${s.name} (${s.symbol})`;
        d.onclick = () => addStock(s);
        dropdown.appendChild(d);
      });
  });

  async function addStock(s) {
    let list = getWatchlist();
    if (list.find(x => x.symbol === s.symbol)) return;

    list.push(s);
    await setDoc(doc(db, "users", getUserId()), { watchlist: list }, { merge: true });
    setWatchlist(list);
    dropdown.innerHTML = "";
    search.value = "";
    render();
  }

  async function render() {
    const list = getWatchlist();
    tableBody.innerHTML = "";

    if (!list.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="opacity:.5">Add stocks to your watchlist</td>
        </tr>`;
      return;
    }

    const data = await getPrices(list.map(s => s.symbol));

    list.forEach(s => {
      const d = data[s.symbol];
      if (!d) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.name}</td>
        <td>₹${d.price.toFixed(2)}</td>
        <td class="${d.change >= 0 ? "pos" : "neg"}">
          ${d.changePercent.toFixed(2)}%
        </td>
        <td>${d.volume.toLocaleString()}</td>
        <td>${d.high52}</td>
        <td>${d.low52}</td>
        <td>
          <button class="remove-btn" data-sym="${s.symbol}">✕</button>
        </td>
      `;

      tr.querySelector(".remove-btn").onclick = async () => {
        let updated = getWatchlist().filter(x => x.symbol !== s.symbol);
        await setDoc(
          doc(db, "users", getUserId()),
          { watchlist: updated },
          { merge: true }
        );
        setWatchlist(updated);
        render();
      };

      tableBody.appendChild(tr);
    });
  }

  return { render };
}
