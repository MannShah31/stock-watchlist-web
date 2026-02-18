import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getPrices } from "./api.js";

export function setupWatchlist({
  stockGrid,
  dropdown,
  search,
  getUserId,
  getWatchlist,
  setWatchlist
}) {

  const tableBody = document.getElementById("stockTableBody");

  /* ---------- SEARCH ---------- */
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

  /* ---------- ADD STOCK ---------- */
  async function addStock(s) {
    let list = getWatchlist();
    if (list.find(x => x.symbol === s.symbol)) return;

    list.push(s);
    await setDoc(
      doc(db, "users", getUserId()),
      { watchlist: list },
      { merge: true }
    );

    setWatchlist(list);
    dropdown.innerHTML = "";
    search.value = "";
    render();
  }

  /* ---------- RENDER TABLE ---------- */
  async function render() {
    const list = getWatchlist();
    tableBody.innerHTML = "";

    if (!list.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="11" style="opacity:.5">
            Add stocks to your watchlist
          </td>
        </tr>`;
      return;
    }

    const priceData = await getPrices(list.map(s => s.symbol));

    for (const s of list) {
      const d = priceData[s.symbol];
      if (!d) continue;

      const screenerSymbol = s.symbol
        .replace(".NS", "")
        .replace(".BO", "");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <a href="https://www.screener.in/company/${screenerSymbol}/"
             target="_blank"
             style="color:#60a5fa;text-decoration:none;font-weight:600">
            ${s.name}
          </a>
        </td>

        <td>₹${d.price?.toFixed(2) ?? "-"}</td>

        <td class="${d.dayChange >= 0 ? "pos" : "neg"}">
          ${d.dayChange ? `₹${d.dayChange.toFixed(2)}` : "-"}
        </td>

        <td class="${d.weekChange >= 0 ? "pos" : "neg"}">
          ${d.weekChange ? d.weekChange.toFixed(2) + "%" : "-"}
        </td>

        <td class="${d.monthChange >= 0 ? "pos" : "neg"}">
          ${d.monthChange ? d.monthChange.toFixed(2) + "%" : "-"}
        </td>

        <td class="${d.threeMonthChange >= 0 ? "pos" : "neg"}">
          ${d.threeMonthChange ? d.threeMonthChange.toFixed(2) + "%" : "-"}
        </td>

        <td>
          ${d.marketCap
            ? `₹${(d.marketCap / 1e7).toFixed(2)} Cr`
            : "-"}
        </td>

        <td>
          ${d.pe ? d.pe.toFixed(1) : "-"}
        </td>

        <td>${d.high52?.toFixed(2) ?? "-"}</td>
        <td>${d.low52?.toFixed(2) ?? "-"}</td>

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
    }
  }

  return { render };
}
