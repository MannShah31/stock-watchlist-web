const express = require("express");
const https = require("https");

const app = express();
app.use(express.static("public"));

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
      let raw = "";

      response.on("data", chunk => {
        raw += chunk;
      });

      response.on("end", () => {
        try {
          const json = JSON.parse(raw);

          // 🔍 LOG WHAT YAHOO ACTUALLY SENT (first 300 chars)
          console.log(
            "Yahoo raw response:",
            JSON.stringify(json).slice(0, 300)
          );

          // ❌ Yahoo explicitly returned an error
          if (json.chart?.error) {
            return res.status(503).json({
              error: "Yahoo blocked the request",
              yahooError: json.chart.error
            });
          }

          // ❌ No data
          if (!json.chart?.result || !json.chart.result.length) {
            return res.status(503).json({
              error: "No stock data returned from Yahoo"
            });
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
          console.error("Yahoo parse failed. Raw:", raw.slice(0, 300));
          res.status(500).json({
            error: "Yahoo response not usable"
          });
        }
      });
    }
  ).on("error", err => {
    console.error("Yahoo request failed:", err.message);
    res.status(500).json({ error: "Yahoo request failed" });
  });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
