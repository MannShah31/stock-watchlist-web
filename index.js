const express = require("express");
const https = require("https");
const zlib = require("zlib");

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

// Yahoo Finance – RELIANCE (GZIP SAFE)
app.get("/api/stock", (req, res) => {
  const options = {
    hostname: "query1.finance.yahoo.com",
    path: "/v7/finance/quote?symbols=RELIANCE.NS",
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate"
    }
  };

  const request = https.request(options, response => {
    let stream = response;

    // Handle gzip compression
    if (response.headers["content-encoding"] === "gzip") {
      stream = response.pipe(zlib.createGunzip());
    }

    let body = "";

    stream.on("data", chunk => {
      body += chunk.toString();
    });

    stream.on("end", () => {
      try {
        const json = JSON.parse(body);
        const stock = json?.quoteResponse?.result?.[0];

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
        console.error("Parse error:", err.message);
        res.status(500).json({ error: "Failed to parse Yahoo data" });
      }
    });
  });

  request.on("error", err => {
    console.error("Request error:", err.message);
    res.status(500).json({ error: "Yahoo request failed" });
  });

  request.end();
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
