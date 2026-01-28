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

// Yahoo Finance – RELIANCE
app.get("/api/stock", (req, res) => {
  const options = {
    hostname: "query1.finance.yahoo.com",
    path: "/v7/finance/quote?symbols=RELIANCE.NS",
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9"
    }
  };

  https
    .request(options, yahooRes => {
      let data = "";

      yahooRes.on("data", chunk => {
        data += chunk;
      });

      yahooRes.on("end", () => {
        try {
          const json = JSON.parse(data);
          const stock = json.quoteResponse.result[0];

          if (!stock) {
            return res.status(404).json({ error: "Stock not found" });
          }

          res.json({
            symbol: stock.symbol,
            name: stock.longName || stock.shortName,
            price: stock.regularMarketPrice,
            change: stock.regularMarketChange,
            changePercent: stock.regularMarketChangePercent,
            volume: stock.regularMarketVolume,
            high52: stock.fiftyTwoWeekHigh,
            low52: stock.fiftyTwoWeekLow,
            lastUpdated: stock.regularMarketTime
          });
        } catch (err) {
          res.status(500).json({ error: "Failed to parse Yahoo data" });
        }
      });
    })
    .on("error", err => {
      console.error("Yahoo request failed:", err.message);
      res.status(500).json({ error: "Failed to fetch stock data" });
    })
    .end();
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
