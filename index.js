const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// --------------------
// Gmail Mailer
// --------------------
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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
  return new Promise(resolve => {
    const safeSymbol = encodeURIComponent(symbol.trim());
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${safeSymbol}?interval=1m&range=1d`;

    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, response => {
      let raw = "";
      response.on("data", d => (raw += d));
      response.on("end", () => {
        try {
          const json = JSON.parse(raw);
          const meta = json.chart?.result?.[0]?.meta;
          if (!meta) return resolve(null);

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
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

// --------------------
// Send email
// --------------------
async function sendAlertEmail(to, symbol, target, price) {
  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `🚨 Stock Alert: ${symbol} crossed ₹${target}`,
      html: `
        <h2>Stock Alert</h2>
        <p><b>${symbol}</b> crossed your target price.</p>
        <p>Target: ₹${target}</p>
        <p>Current: ₹${price}</p>
        <p>— Stock Watchlist App</p>
      `
    });
    console.log("Alert email sent to", to);
  } catch (e) {
    console.error("Email failed:", e.message);
  }
}

// --------------------
// Trigger alert email
// --------------------
app.post("/api/alert", async (req, res) => {
  const { email, symbol, target, price } = req.body;
  if (!email || !symbol || !target || !price) {
    return res.status(400).json({ error: "Missing fields" });
  }

  await sendAlertEmail(email, symbol, target, price);
  res.json({ ok: true });
});

// --------------------
// Single stock
// --------------------
app.get("/api/stock", async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });

  const data = await fetchSingleStock(symbol);
  if (!data) return res.status(404).json({ error: "No data" });
  res.json(data);
});

// --------------------
// Batch prices
// --------------------
app.get("/api/prices", async (req, res) => {
  let symbols = req.query.symbols;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  symbols = symbols.split(",").map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: "No valid symbols" });

  const MAX_PARALLEL = 5;
  const results = {};

  for (let i = 0; i < symbols.length; i += MAX_PARALLEL) {
    const chunk = symbols.slice(i, i + MAX_PARALLEL);
    const data = await Promise.all(chunk.map(fetchSingleStock));
    data.forEach(d => {
      if (d && d.symbol) results[d.symbol] = d;
    });
  }

  res.json(results);
});

// --------------------
// Stock master list
// --------------------
app.get("/api/stocks", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "stocks.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch {
    res.status(500).json({ error: "Stock list failed" });
  }
});

// --------------------
app.get("/api/version", (req, res) => {
  res.json({ version: "fan-out-v1 + mailer" });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
});