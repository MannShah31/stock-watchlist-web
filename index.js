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
   📊 INDICES API
===================== */

/* =====================
   📊 INDICES STOCK LIST
===================== */

const NIFTY50 = [
  "RELIANCE.NS","TCS.NS","HDFCBANK.NS","ICICIBANK.NS","INFY.NS",
  "ITC.NS","SBIN.NS","LT.NS","AXISBANK.NS","KOTAKBANK.NS",
  "BHARTIARTL.NS","ASIANPAINT.NS","MARUTI.NS","SUNPHARMA.NS",
  "TITAN.NS","ULTRACEMCO.NS","WIPRO.NS","NESTLEIND.NS",
  "BAJFINANCE.NS","HCLTECH.NS","POWERGRID.NS","NTPC.NS",
  "ADANIENT.NS","ADANIPORTS.NS","ONGC.NS","TATAMOTORS.NS",
  "HINDUNILVR.NS","JSWSTEEL.NS","TECHM.NS","COALINDIA.NS",
  "GRASIM.NS","DRREDDY.NS","INDUSINDBK.NS","HINDALCO.NS",
  "BPCL.NS","CIPLA.NS","APOLLOHOSP.NS","DIVISLAB.NS",
  "EICHERMOT.NS","HEROMOTOCO.NS","BAJAJFINSV.NS","BRITANNIA.NS",
  "UPL.NS","TATACONSUM.NS","M&M.NS","SBILIFE.NS",
  "BAJAJ-AUTO.NS","HDFCLIFE.NS","SHREECEM.NS","LTIM.NS"
];

const SENSEX = [
  "RELIANCE.NS","TCS.NS","HDFCBANK.NS","ICICIBANK.NS","INFY.NS",
  "ITC.NS","SBIN.NS","LT.NS","AXISBANK.NS","KOTAKBANK.NS",
  "BHARTIARTL.NS","ASIANPAINT.NS","MARUTI.NS","SUNPHARMA.NS",
  "TITAN.NS","ULTRACEMCO.NS","WIPRO.NS","NESTLEIND.NS",
  "BAJFINANCE.NS","HCLTECH.NS","POWERGRID.NS","NTPC.NS",
  "ONGC.NS","TATAMOTORS.NS","HINDUNILVR.NS","JSWSTEEL.NS",
  "TECHM.NS","GRASIM.NS","INDUSINDBK.NS","HINDALCO.NS"
];

/* =====================
   📊 INDICES API (STOCK LEVEL)
===================== */

app.get("/api/indices", async (_, res) => {
  try {

    async function fetchGroup(symbols) {
      const data = await Promise.all(symbols.map(fetchSingleStock));
      return data.filter(Boolean);
    }

    const niftyData = await fetchGroup(NIFTY50);
    const sensexData = await fetchGroup(SENSEX);

    res.json({
      nifty50: niftyData,
      sensex: sensexData
    });

  } catch (e) {
    console.error("Indices error:", e);
    res.status(500).json({});
  }
});

async function fetchIndexHistory(symbol) {
  const data = await yahooGET(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`
  );

  if (!data?.chart?.result?.[0]) return null;

  const chart = data.chart.result[0];
  const closes = chart.indicators.quote[0].close.filter(v => v != null);

  if (!closes.length) return null;

  const current = closes.at(-1);
  const oneYearAgo = closes.at(-252);
  const twoYearAgo = closes[0];
  const oneMonthAgo = closes.at(-22);

  const last52 = closes.slice(-252);

  return {
    current,
    oneYearAgo,
    twoYearAgo,
    high52: Math.max(...last52),
    low52: Math.min(...last52),
    mom: ((current - oneMonthAgo) / oneMonthAgo) * 100,
    yoy: ((current - oneYearAgo) / oneYearAgo) * 100
  };
}

app.get("/api/indices", async (_, res) => {
  const result = [];

  for (const [name, symbol] of Object.entries(INDICES)) {
    const data = await fetchIndexHistory(symbol);
    if (data) result.push({ name, ...data });
  }

  res.json(result);
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
