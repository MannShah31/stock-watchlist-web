import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { getPrices } from "./api.js";

export function setupWatchlist({ stockGrid, dropdown, search, getUserId, getWatchlist, setWatchlist }) {

  let activeIndex = -1;

  search.addEventListener("input", e => {
    const q = e.target.value.toLowerCase().trim();
    dropdown.innerHTML = "";
    activeIndex = -1;
    if (!q) return;

    window.allStocks.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.symbol.toLowerCase().includes(q) ||
      (s.sector && s.sector.toLowerCase().includes(q))
    ).slice(0, 12).forEach(s => {
      const d = document.createElement("div");
      d.className = "option";
      d.textContent = `${s.name} (${s.symbol})`;
      d.onclick = () => addStock(s);
      dropdown.appendChild(d);
    });
  });

  async function addStock(s){
    let list = getWatchlist();
    if(list.find(x=>x.symbol===s.symbol)) return;
    list.push(s);
    await setDoc(doc(db,"users",getUserId()),{watchlist:list},{merge:true});
    setWatchlist(list);
    dropdown.innerHTML=""; search.value="";
    render();
  }

  async function render(){
    const list = getWatchlist();
    if(!list.length){
      stockGrid.innerHTML = `<p style="opacity:.5">Add stocks to your watchlist</p>`;
      return;
    }

    const data = await getPrices(list.map(s=>s.symbol));
    stockGrid.innerHTML = "";

    list.forEach(s => {
      const d = data[s.symbol];
      if(!d) return;

      const div = document.createElement("div");
      div.className = `stock-card ${d.change >= 0 ? "pos" : "neg"}`;

      div.innerHTML = `
        <div style="display:flex;justify-content:space-between">
          <strong>${s.name}</strong>
          <button onclick="window.removeStock('${s.symbol}')">✕</button>
        </div>
        <div class="price">₹${d.price.toFixed(2)}</div>
        <div class="${d.change>=0?'green':'red'}">${d.changePercent.toFixed(2)}%</div>
      `;
      stockGrid.appendChild(div);
    });
  }

  window.removeStock = async sym => {
    let list = getWatchlist().filter(s=>s.symbol!==sym);
    await setDoc(doc(db,"users",getUserId()),{watchlist:list},{merge:true});
    setWatchlist(list);
    render();
  };

  return { render };
}
