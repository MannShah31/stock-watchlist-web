export async function getAllStocks() {
  return await (await fetch("/api/stocks")).json();
}

export async function getPrices(symbols) {
  const syms = symbols.join(",");
  return await (await fetch(`/api/prices?symbols=${syms}`)).json();
}
