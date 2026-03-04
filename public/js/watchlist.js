import { getPrices } from "./api.js";

export function setupWatchlist({
  getWatchlist,
  setWatchlist
}) {

  const tableBody = document.getElementById("stockTableBody");

  // 🔥 Always grab fresh DOM references
  const searchInput = document.getElementById("search");
  const dropdownBox = document.getElementById("dropdown");

  // 🔥 Store previous prices for flash comparison
  const previousPrices = {};

  /* ================= SEARCH ================= */

  searchInput.addEventListener("input", e => {

    const q = e.target.value.toLowerCase().trim();
    dropdownBox.innerHTML = "";

    if (!q) return;

    const results = window.allStocks
      .filter(s => {
        const name = (s.name || "").toLowerCase();
        const symbol = (s.symbol || "").toLowerCase();
        return name.includes(q) || symbol.includes(q);
      })
      .slice(0, 10);

    results.forEach(s => {
      const d = document.createElement("div");
      d.className = "option";
      d.textContent = `${s.name} (${s.symbol})`;
      d.onclick = () => addStock(s);
      dropdownBox.appendChild(d);
    });

  });

  /* ================= ADD STOCK ================= */

  async function addStock(s) {

    let list = getWatchlist();

    if (list.find(x => x.symbol === s.symbol)) return;

    list = [...list, s];

    await setWatchlist(list);

    dropdownBox.innerHTML = "";
    searchInput.value = "";

    render();
  }

  /* ================= RENDER ================= */

  async function render() {

    const rawList = getWatchlist();

    // 🔥 Enrich stock objects
    const stockMap = Object.fromEntries(
      window.allStocks.map(s => [
        s.symbol.trim().toUpperCase(),
        s
      ])
    );

    let list = rawList.map(s => {
      const key = s.symbol?.trim().toUpperCase();
      return stockMap[key] || s;
    });

    /* ===== Industry / Category Filters ===== */

    const industry = document.getElementById("industryFilter")?.value;
    const category = document.getElementById("categoryFilter")?.value;

    if (industry || category) {
      list = list.filter(s =>
        (!industry || s.industry === industry) &&
        (!category || s.category === category)
      );
    }

    /* ===== No Stocks Case ===== */

    if (!list.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="opacity:.5">
            No stocks match selected filters
          </td>
        </tr>`;
      return;
    }

    /* ===== Fetch Prices ===== */

    const priceData = await getPrices(list.map(s => s.symbol));

    /* ===== Quick Filter ===== */

    const activeQuickFilter = window.quickFilter || "all";

    if (activeQuickFilter !== "all") {
      list = list.filter(s => {
        const d = priceData[s.symbol];
        if (!d) return false;

        if (activeQuickFilter === "gainers") return d.dayChange > 0;
        if (activeQuickFilter === "losers") return d.dayChange < 0;

        return true;
      });
    }

    tableBody.innerHTML = "";

    if (!list.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="opacity:.5">
            No stocks match selected filters
          </td>
        </tr>`;
      return;
    }

    /* ===== Render Rows ===== */

    for (const s of list) {

      const d = priceData[s.symbol];
      if (!d) continue;

      const screenerSymbol = s.symbol
        .replace(".NS", "")
        .replace(".BO", "");

      const oldPrice = previousPrices[s.symbol];
      const newPrice = d.price;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>
          <a href="https://www.screener.in/company/${screenerSymbol}/"
             target="_blank"
             style="color:#60a5fa;text-decoration:none;font-weight:600">
            ${s.name}
          </a>
        </td>

        <td class="price-cell">
          ₹${newPrice?.toFixed(2) ?? "-"}
        </td>

        <td class="${d.dayChange >= 0 ? "pos" : "neg"}">
          ₹${d.dayChange?.toFixed(2) ?? "-"}
        </td>

        <td class="${d.dayChangePercent >= 0 ? "pos" : "neg"}">
          ${d.dayChangePercent?.toFixed(2) ?? "-"}%
        </td>
      
        <td class="${d.weekChange >= 0 ? "pos" : "neg"}">
          ${d.weekChange?.toFixed(2) ?? "-"}%
        </td>

        <td class="${d.monthChange >= 0 ? "pos" : "neg"}">
          ${d.monthChange?.toFixed(2) ?? "-"}%
        </td>

        <td class="${d.threeMonthChange >= 0 ? "pos" : "neg"}">
          ${d.threeMonthChange?.toFixed(2) ?? "-"}%
        </td>

        <td>${d.high52?.toFixed(2) ?? "-"}</td>
        <td>${d.low52?.toFixed(2) ?? "-"}</td>

        <td>
          <button class="remove-btn" data-sym="${s.symbol}">✕</button>
        </td>
      `;

      tableBody.appendChild(tr);

      /* ===== Price Flash Animation ===== */

      if (oldPrice !== undefined && newPrice !== oldPrice) {

        const priceCell = tr.querySelector(".price-cell");

        if (newPrice > oldPrice) {
          priceCell.classList.add("flash-up");
        } else if (newPrice < oldPrice) {
          priceCell.classList.add("flash-down");
        }

        setTimeout(() => {
          priceCell.classList.remove("flash-up", "flash-down");
        }, 1000);
      }

      previousPrices[s.symbol] = newPrice;

      /* ===== Remove Stock ===== */

      tr.querySelector(".remove-btn").onclick = async () => {

        let updated = getWatchlist()
          .filter(x => x.symbol !== s.symbol);

        await setWatchlist(updated);

        render();
      };
    }
  }

  return { render };
}
