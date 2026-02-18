const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const zlib = require("zlib");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

/* =====================
   FIREBASE ADMIN
===================== */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_ADMIN)
    )
  });
}
const fdb = admin.firestore();

/* =====================
   HELPER
===================== */
function yahooGET(url) {
  return new Promise(resolve => {
    https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0" } },
      r => {
        let raw = "";
        r.on("data", d => (raw += d));
        r.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(null);
          }
        });
      }
    ).on("error", () => resolve(null));
  });
}

function pct(current, past) {
  if (!current || !past) return null;
  return ((current - past) / past) * 100;
}

/* =====================
   FETCH STOCK DATA
===================== */
async function fetchSingleStock(symbol) {
  try {
    const safe = encodeURIComponent(symbol.trim());

    // PRICE HISTORY
    const chartData = await yahooGET(
      `https://query1.finance.yahoo.com/v8/finance/chart/${safe}?range=1y&interval=1d`
    );

    if (!chartData?.chart?.result?.[0]) return null;

    const chart = chartData.chart.result[0];
    const closesRaw = chart.indicators.quote[0].close;

    const closes = closesRaw
      .map((v, i) => v ?? closesRaw[i - 1])
      .filter(v => v != null);

    const current = closes.at(-1);
    const prevClose = closes.at(-2);

    const weekAgo = closes.at(Math.max(closes.length - 6, 0));
    const monthAgo = closes.at(Math.max(closes.length - 22, 0));
    const threeMonthAgo = closes.at(Math.max(closes.length - 66, 0));

    // FUNDAMENTALS (WORKING METHOD)
    const quoteData = await yahooGET(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${safe}`
    );

    const quote = quoteData?.quoteResponse?.result?.[0];

    return {
      symbol,
      price: current,

      dayChange: prevClose ? current - prevClose : null,
      changePercent: pct(current, prevClose),

      weekChange: pct(current, weekAgo),
      monthChange: pct(current, monthAgo),
      threeMonthChange: pct(current, threeMonthAgo),

      marketCap: quote?.marketCap ?? null,
      pe: quote?.trailingPE ?? null,

      high52: Math.max(...closes.slice(-252)),
      low52: Math.min(...closes.slice(-252))
    };

  } catch (e) {
    console.error("fetchSingleStock error:", e.message);
    return null;
  }
}

/* =====================
   API: PRICES  ✅ RESTORED
===================== */
app.get("/api/prices", async (req, res) => {
  const symbols = req.query.symbols?.split(",").map(s => s.trim());
  if (!symbols || !symbols.length) {
    return res.status(400).json({ error: "Missing symbols" });
  }

  const data = await Promise.all(symbols.map(fetchSingleStock));
  const out = {};
  data.forEach(d => d && (out[d.symbol] = d));

  res.json(out);
});

/* =====================
   API: STOCK MASTER
===================== */
app.get("/api/stocks", (_, res) => {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(__dirname, "stocks.json"), "utf8")
    );
    res.json(data);
  } catch (e) {
    console.error("Failed to read stocks.json", e);
    res.status(500).json([]);
  }
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
