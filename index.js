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
   HEALTH
===================== */
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

/* =====================
   🔧 HELPERS
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
   📈 STOCK DATA (FULL)
===================== */
async function fetchSingleStock(symbol) {
  try {
    const enc = encodeURIComponent(symbol);

    // 🔹 Price history (3 months)
    const chartURL =
      `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?range=3mo&interval=1d`;
    const chartJSON = await yahooGET(chartURL);
    const chart = chartJSON?.chart?.result?.[0];
    if (!chart) return null;

    const closesRaw = chart.indicators.quote[0].close;
    const closes = closesRaw
      .map((v, i) => v ?? closesRaw[i - 1])
      .filter(v => v != null);

    const current = closes.at(-1);
    const prevClose = closes.at(-2);

    const pct = (from, to) => ((to - from) / from) * 100;

    const oneWeek = closes.at(-6);
    const oneMonth = closes.at(-22);
    const threeMonth = closes[0];

    // 🔹 Market Cap + PE
    const qsURL =
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=price,summaryDetail`;
    const qsJSON = await yahooGET(qsURL);
    const qs = qsJSON?.quoteSummary?.result?.[0];

    return {
      symbol,

      price: current,
      dayChangeRs: current - prevClose,
      dayChangePct: pct(prevClose, current),

      weekChange: oneWeek ? pct(oneWeek, current) : null,
      monthChange: oneMonth ? pct(oneMonth, current) : null,
      threeMonthChange: threeMonth ? pct(threeMonth, current) : null,

      marketCap: qs?.price?.marketCap?.raw ?? null,
      pe: qs?.summaryDetail?.trailingPE?.raw ?? null,

      high52: qs?.summaryDetail?.fiftyTwoWeekHigh?.raw ?? null,
      low52: qs?.summaryDetail?.fiftyTwoWeekLow?.raw ?? null
    };
  } catch (e) {
    console.error("❌ fetchSingleStock error:", symbol, e.message);
    return null;
  }
}

/* =====================
   🔔 ALERT ENGINE
===================== */
async function checkAllAlerts() {
  console.log("⏰ Alert engine tick");

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
      if (!d) continue;

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

        console.log("🔥 Alert triggered:", a.symbol);
      }
    }
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

  console.log("📊 Price fetch:", symbols);

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
