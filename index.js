const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// --------------------
// Health check
// --------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --------------------
// Helper: fetch single stock safely
// --------------------
function fetchSingleStock(symbol) {
  return new Promise((resolve, reject) => {
    const safeSymbol = encodeURIComponent(symbol.trim());
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${safeSymbol}?interval=1m&range=1d`;

    https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      response => {
        let raw = "";

        response.on("data", d => (raw += d));
        response.on("end", () => {
          try {
            const json = JSON.parse(raw);
            const meta = json.chart?.result?.[0]?.meta;

            if (!meta) {
              return resolve(null);
            }

            resolve({
              symbol: meta.symbol,
              price: meta.regularMarketPrice,
              previousClose: meta.chartPreviousClose,
              change: meta.regularMarketPrice - meta.chartPreviousClose,
              changePercent:
                ((meta.regularMarketPrice - meta.chartPreviousClose) /
                  meta.chartPreviousClose) *
                100,
              high52: meta.fiftyTwoWeekHigh,
              low52: meta.fiftyTwoWeekLow,
              volume: meta.regularMarketVolume
            });
          } catch (err) {
            resolve(null);
          }
        });
      }
    ).on("error", () => resolve(null));
  });
}

// --------------------
// Single stock API (kept for testing)
///api/stock?symbol=RELIANCE.NS
// --------------------
app.get("/api/stock", async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: "Missing symbol" });
  }

  const data = await fetchSingleStock(symbol);
  if (!data) {
    return res.status(404).json({ error: "No data" });
  }

  res.json(data);
});

// --------------------
// 🔥 BATCH PRICES (SERVER-SIDE FAN-OUT)
// /api/prices?symbols=A,B,C
// --------------------
app.get("/api/prices", async (req, res) => {
  let symbols = req.query.symbols;
  if (!symbols) {
    return res.status(400).json({ error: "Missing symbols" });
  }

  symbols = symbols
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (!symbols.length) {
    return res.status(400).json({ error: "No valid symbols" });
  }

  // Limit concurrency (Yahoo-safe)
  const MAX_PARALLEL = 5;
  const results = {};

  for (let i = 0; i < symbols.length; i += MAX_PARALLEL) {
    const chunk = symbols.slice(i, i + MAX_PARALLEL);
    const data = await Promise.all(chunk.map(fetchSingleStock));

    data.forEach(d => {
      if (d && d.symbol) {
        results[d.symbol] = d;
      }
    });
  }

  res.json(results);
});

// --------------------
// Stock master list
// --------------------
app.get("/api/stocks", (req, res) => {
  try {
    const data = fs.readFileSync(
      path.join(__dirname, "stocks.json"),
      "utf-8"
    );
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: "Stock list failed" });
  }
});

// --------------------
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
app.get("/api/version", (req, res) => {
  res.json({ version: "fan-out-v1" });
});
