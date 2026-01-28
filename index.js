const express = require("express");
const app = express();

// IMPORTANT for Codespaces
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Home route
app.get("/", (req, res) => {
  res.send("Stock Watchlist Web App is running");
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Fetch ONE stock from Yahoo Finance (Reliance)
app.get("/api/stock", async (req, res) => {
  try {
    const yahooUrl =
      "https://query1.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS";

    const response = await fetch(yahooUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const data = await response.json();
    const stock = data.quoteResponse.result[0];

    if (!stock) {
      return res.status(404).json({ error: "Stock data not found" });
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
  } catch (error) {
    console.error("Yahoo fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch stock data" });
  }
});

// START SERVER (Codespaces compatible)
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});
