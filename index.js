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

    /* =========================
       1️⃣ PRICE + HISTORY
    ========================== */
    const chartData = await yahooGET(
      `https://query1.finance.yahoo.com/v8/finance/chart/${safe}?range=1y&interval=1d`
    );

    if (!chartData?.chart?.result?.[0]) return null;

    const chart = chartData.chart.result[0];
    const closesRaw = chart.indicators.quote[0].close;

    const closes = closesRaw
      .map((v, i) => v ?? closesRaw[i - 1])
      .filter(v => v != null);

    if (!closes.length) return null;

    const current = closes.at(-1);
    const prevClose = closes.at(-2);

    const weekAgo = closes.at(Math.max(closes.length - 6, 0));
    const monthAgo = closes.at(Math.max(closes.length - 22, 0));
    const threeMonthAgo = closes.at(Math.max(closes.length - 66, 0));

    /* =========================
       2️⃣ FUNDAMENTALS (STABLE)
    ========================== */
    const quoteData = await yahooGET(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${safe}`
    );

    const quote = quoteData?.quoteResponse?.result?.[0];

    const marketCap = quote?.marketCap ?? null;
    const pe = quote?.trailingPE ?? null;

    return {
      symbol,
      price: current,

      dayChange: prevClose ? current - prevClose : null,
      changePercent: prevClose
        ? ((current - prevClose) / prevClose) * 100
        : null,

      weekChange: weekAgo
        ? ((current - weekAgo) / weekAgo) * 100
        : null,

      monthChange: monthAgo
        ? ((current - monthAgo) / monthAgo) * 100
        : null,

      threeMonthChange: threeMonthAgo
        ? ((current - threeMonthAgo) / threeMonthAgo) * 100
        : null,

      marketCap,
      pe,

      high52: Math.max(...closes.slice(-252)),
      low52: Math.min(...closes.slice(-252))
    };

  } catch (e) {
    console.error("fetchSingleStock error:", symbol, e.message);
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
