export function setupIndices({ tableBody }) {

  async function loadIndices() {
    const res = await fetch("/api/indices");
    const data = await res.json();

    tableBody.innerHTML = "";

    data.forEach(i => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${i.name}</td>
        <td>${i.current.toFixed(2)}</td>
        <td style="color:${i.mom >= 0 ? "#22c55e" : "#ef4444"}">
          ${i.mom.toFixed(2)}%
        </td>
        <td style="color:${i.yoy >= 0 ? "#22c55e" : "#ef4444"}">
          ${i.yoy.toFixed(2)}%
        </td>
      `;

      tableBody.appendChild(tr);
    });
  }

  // initial load
  loadIndices();

  // auto refresh every 5 min
  setInterval(loadIndices, 5 * 60 * 1000);

  return { loadIndices };
}
