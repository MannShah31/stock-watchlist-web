const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🔥 SINGLE STOCK (CHART API)
app.get("/api/stock", (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;

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
          if (!meta) return res.status(404).json({ error: "No data" });

          res.json({
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
        } catch {
          res.status(500).json({ error: "Parse error" });
        }
      });
    }
  );
});

// 🔥 BATCH STOCK PRICES (QUOTE API — CORRECT)
app.get("/api/prices", (req, res) => {
  const symbols = req.query.symbols;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;

  https.get(
    url,
    { headers: { "User-Agent": "Mozilla/5.0" } },
    response => {
      let raw = "";
      response.on("data", d => (raw += d));
      response.on("end", () => {
        try {
          const json = JSON.parse(raw);
          const results = json.quoteResponse?.result;
          if (!results || !results.length)
            return res.status(404).json({ error: "No data returned" });

          const prices = {};
          results.forEach(r => {
            prices[r.symbol] = {
              price: r.regularMarketPrice,
              previousClose: r.regularMarketPreviousClose,
              change: r.regularMarketChange,
              changePercent: r.regularMarketChangePercent,
              high52: r.fiftyTwoWeekHigh,
              low52: r.fiftyTwoWeekLow,
              volume: r.regularMarketVolume
            };
          });

          res.json(prices);
        } catch {
          res.status(500).json({ error: "Batch parse failed" });
        }
      });
    }
  );
});

// 🔽 STOCK MASTER LIST
app.get("/api/stocks", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "stocks.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: "Stock list failed" });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
