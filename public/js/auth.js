export async function getStocks() {
  return await (await fetch("/api/stocks")).json();
}

export async function getPrices(symbols) {
  const syms = symbols.join(",");
  return await (await fetch(`/api/prices?symbols=${syms}`)).json();
}

export async function sendAlert(payload) {
  return await fetch("/api/alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
