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

// verify on startup
mailer.verify(err => {
  if (err) console.error("❌ Mailer error:", err);
  else console.log("✅ Mail server ready");
});

// --------------------
// Health
// --------------------
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

// --------------------
// Yahoo fetch
// --------------------
function fetchSingleStock(symbol) {
  return new Promise(resolve => {
    const safe = encodeURIComponent(symbol.trim());
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${safe}?interval=1m&range=1d`;

    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, r => {
      let raw = "";
      r.on("data", d => (raw += d));
      r.on("end", () => {
        try {
          const meta = JSON.parse(raw).chart?.result?.[0]?.meta;
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
// SEND MAIL ONLY
// --------------------
app.post("/api/alert", async (req, res) => {
  const { email, symbol, target, price } = req.body;

  if (!email || !symbol || !target || !price) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    await mailer.sendMail({
      from: `"Stock Watchlist" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🚨 ${symbol} crossed ₹${target}`,
      html: `
        <h2>Stock Alert Triggered</h2>
        <p><b>${symbol}</b> crossed your target.</p>
        <p>Target: ₹${target}</p>
        <p>Current: ₹${price}</p>
      `
    });

    console.log("📧 MAIL SENT →", email);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ MAIL FAILED:", err);
    res.status(500).json({ error: "Mail failed" });
  }
});

// --------------------
// APIs
// --------------------
app.get("/api/stock", async (req, res) => {
  const data = await fetchSingleStock(req.query.symbol);
  data ? res.json(data) : res.status(404).json({ error: "No data" });
});

app.get("/api/prices", async (req, res) => {
  let symbols = req.query.symbols;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  symbols = symbols.split(",").map(s => s.trim()).filter(Boolean);
  const results = {};

  for (let i = 0; i < symbols.length; i += 5) {
    const chunk = symbols.slice(i, i + 5);
    const data = await Promise.all(chunk.map(fetchSingleStock));
    data.forEach(d => d && (results[d.symbol] = d));
  }

  res.json(results);
});

app.get("/api/stocks", (req, res) => {
  const file = path.join(__dirname, "stocks.json");
  res.json(JSON.parse(fs.readFileSync(file, "utf8")));
});

app.get("/api/version", (_, res) => {
  res.json({ version: "fan-out-v1 + mailer + frontend-triggers" });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
