const express = require("express");
const https = require("https");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Home
app.get("/", (req, res) => {
  res.send("Stock Watchlist Web App is running");
});

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ✅ RELIABLE YAHOO ENDPOINT (chart API)
app.get("/api/stock", (req, res) => {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1m&range=1d";

  https.get(
    url,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json"
      }
    },
    response => {
      let data = "";

      response.on("data", chunk => {
        data += chunk;
      });

      response.on("end", () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart.result[0];
          const meta = result.meta;

          res.json({
            symbol: meta.symbol,
            price: meta.regularMarketPrice,
            previousClose: meta.chartPreviousClose,
            change:
              meta.regularMarketPrice - meta.chartPreviousClose,
            changePercent:
              ((meta.regularMarketPrice - meta.chartPreviousClose) /
                meta.chartPreviousClose) *
              100,
            high52: meta.fiftyTwoWeekHigh,
            low52: meta.fiftyTwoWeekLow,
            volume: meta.regularMarketVolume,
            currency: meta.currency,
            exchange: meta.exchangeName
          });
        } catch (err) {
          console.error("Parse failed:", err.message);
          res.status(500).json({ error: "Failed to parse Yahoo chart data" });
        }
      });
    }
  ).on("error", err => {
    console.error("Request failed:", err.message);
    res.status(500).json({ error: "Yahoo request failed" });
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
