const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

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
   SMTP CONFIG
===================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* =====================
   HELPER: YAHOO GET
===================== */
function yahooGET(url) {
  return new Promise(resolve => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, r => {
      let raw = "";
      r.on("data", d => (raw += d));
      r.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

/* =====================
   SAFE MATH
===================== */
function pct(current, past) {
  if (!current || !past) return null;
  return ((current - past) / past) * 100;
}

/* =====================
   FETCH FULL STOCK DATA
===================== */
async function fetchSingleStock(symbol) {
  try {
    const safe = encodeURIComponent(symbol.trim());

    /* -------- PRICE HISTORY -------- */
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

    /* -------- FUNDAMENTALS -------- */
    const fundamentals = await yahooGET(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${safe}?modules=summaryDetail,defaultKeyStatistics`
    );

    let marketCap = null;
    let pe = null;

    if (fundamentals?.quoteSummary?.result?.[0]) {
      const f = fundamentals.quoteSummary.result[0];

      marketCap =
        f.summaryDetail?.marketCap?.raw ??
        f.defaultKeyStatistics?.marketCap?.raw ??
        null;

      pe =
        f.summaryDetail?.trailingPE?.raw ??
        f.defaultKeyStatistics?.trailingPE?.raw ??
        null;
    }

    /* -------- RETURN CLEAN DATA -------- */
    return {
      symbol,
      price: current,

      /* 1D */
      dayChange: prevClose ? current - prevClose : null,
      changePercent: pct(current, prevClose),

      /* 1W / 1M / 3M */
      weekChange: pct(current, weekAgo),
      monthChange: pct(current, monthAgo),
      threeMonthChange: pct(current, threeMonthAgo),

      /* Fundamentals */
      marketCap,
      pe,

      /* 52W */
      high52: Math.max(...closes.slice(-252)),
      low52: Math.min(...closes.slice(-252))
    };

  } catch (e) {
    console.error("❌ fetchSingleStock error:", symbol, e.message);
    return null;
  }
}

/* =====================
   ALERT ENGINE
===================== */
async function checkAllAlerts() {
  try {
    const users = await fdb.collection("users").get();

    for (const u of users.docs) {
      const snap = await fdb
        .collection("users")
        .doc(u.id)
        .collection("alerts")
        .where("triggered", "==", false)
        .get();

      if (snap.empty) continue;

      const alerts = snap.docs.map(d => ({
        id: d.id,
        uid: u.id,
        ...d.data()
      }));

      const symbols = [...new Set(alerts.map(a => a.symbol))];
      const pricesArr = await Promise.all(symbols.map(fetchSingleStock));

      const prices = {};
      pricesArr.forEach(p => p && (prices[p.symbol] = p));

      for (const a of alerts) {
        const d = prices[a.symbol];
        if (!d || !d.price) continue;

        if (d.price >= a.price) {
          await transporter.sendMail({
            from: `"Stock Watchlist" <${process.env.EMAIL_USER}>`,
            to: a.email,
            subject: `🔔 Alert Triggered: ${a.symbol}`,
            html: `
              <h3>Alert Triggered</h3>
              <p><b>${a.symbol}</b></p>
              <p>Target: ₹${a.price}</p>
              <p>Current: ₹${d.price.toFixed(2)}</p>
            `
          });

          await fdb
            .collection("users")
            .doc(a.uid)
            .collection("alerts")
            .doc(a.id)
            .update({
              triggered: true,
              triggeredAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
      }
    }
  } catch (e) {
    console.error("❌ Alert engine error:", e.message);
  }
}

setInterval(checkAllAlerts, 60 * 1000);

/* =====================
   API: PRICES
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
   STOCK MASTER
===================== */
app.get("/api/stocks", (_, res) => {
  res.json(
    JSON.parse(fs.readFileSync(path.join(__dirname, "stocks.json"), "utf8"))
  );
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
