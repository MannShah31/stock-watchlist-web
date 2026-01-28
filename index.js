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

// 🔥 DYNAMIC STOCK PRICE API
app.get("/api/stock", (req, res) => {
  const symbol = req.query.symbol;

  if (!symbol) {
    return res.status(400).json({ error: "Missing symbol" });
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;

  https.get(
    url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json"
      }
    },
    response => {
      let raw = "";

      response.on("data", chunk => {
        raw += chunk;
      });

      response.on("end", () => {
        try {
          const json = JSON.parse(raw);

          if (!json.chart?.result?.length) {
            return res.status(404).json({ error: "Stock data not found" });
          }

          const meta = json.chart.result[0].meta;

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
            volume: meta.regularMarketVolume,
            exchange: meta.exchangeName,
            currency: meta.currency
          });
        } catch (err) {
          console.error("Parse error:", err.message);
          res.status(500).json({ error: "Failed to parse stock data" });
        }
      });
    }
  ).on("error", err => {
    console.error("Request failed:", err.message);
    res.status(500).json({ error: "Stock request failed" });
  });
});

// 🔽 STOCK MASTER LIST (DROPDOWN)
app.get("/api/stocks", (req, res) => {
  try {
    const filePath = path.join(__dirname, "stocks.json");
    const data = fs.readFileSync(filePath, "utf-8");
    const stocks = JSON.parse(data);
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: "Failed to load stock list" });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
