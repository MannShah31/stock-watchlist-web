const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

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
   EMAILJS CONFIG
===================== */
const EMAILJS_SERVICE = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC = process.env.EMAILJS_PUBLIC_KEY;

/* =====================
   HEALTH
===================== */
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

/* =====================
   📊 INDICES CONFIG
===================== */
const INDICES = {
  "Nifty 50": "^NSEI",
  "Nifty Bank": "^NSEBANK",
  "Nifty IT": "^CNXIT",
  "Nifty FMCG": "^CNXFMCG",
  "Nifty Pharma": "^CNXPHARMA",
  "Nifty Auto": "^CNXAUTO",
  "Nifty Metal": "^CNXMETAL",
  "Nifty Energy": "^CNXENERGY",
  "Sensex": "^BSESN"
};

function fetchIndexHistory(symbol) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=2y&interval=1d`;

    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, r => {
      let raw = "";
      r.on("data", d => (raw += d));
      r.on("end", () => {
        try {
          const chart = JSON.parse(raw).chart.result[0];
          const rawCloses = chart.indicators.quote[0].close;

          // fill nulls safely
          const closes = rawCloses.map((v, i) =>
            v ?? rawCloses[i - 1]
          ).filter(Boolean);

          if (closes.length < 260) return resolve(null);

          const current = closes.at(-1);
          const oneMonthAgo = closes.at(-22);
          const oneYearAgo = closes.at(-252);
          const twoYearAgo = closes[0];
          const last52 = closes.slice(-252);

          resolve({
            current,
            oneYearAgo,
            twoYearAgo,
            high52: Math.max(...last52),
            low52: Math.min(...last52),
            mom: ((current - oneMonthAgo) / oneMonthAgo) * 100,
            yoy: ((current - oneYearAgo) / oneYearAgo) * 100
          });
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => resolve(null));
  });
}

app.get("/api/indices", async (_, res) => {
  const results = [];
  for (const [name, symbol] of Object.entries(INDICES)) {
    const data = await fetchIndexHistory(symbol);
    if (data) results.push({ name, ...data });
  }
  res.json(results);
});

/* =====================
   STOCK PRICE FETCH
===================== */
function fetchSingleStock(symbol) {
  return new Promise(resolve => {
    const safe = encodeURIComponent(symbol.trim());
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${safe}?interval=1m&range=1d`;

    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, r => {
      let raw = "";
      r.on("data", d => (raw += d));
      r.on("end", () => {
        try {
          const meta = JSON.parse(raw).chart.result[0].meta;
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

/* =====================
   EMAIL SENDER
===================== */
async function sendAlertEmail({ email, symbol, target, price, change, changePercent }) {
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE,
      template_id: EMAILJS_TEMPLATE,
      user_id: EMAILJS_PUBLIC,
      template_params: {
        to_email: email,
        symbol,
        alert_price: target,
        current_price: price,
        change,
        change_percent: changePercent
      }
    })
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

/* =====================
   🔔 ALERT ENGINE (BACKGROUND)
===================== */
async function checkAllAlerts() {
  try {
    const users = await fdb.collection("users").get();

    for (const u of users.docs) {
      const alertsSnap = await fdb
        .collection("users")
        .doc(u.id)
        .collection("alerts")
        .where("triggered", "==", false)
        .get();

      if (alertsSnap.empty) continue;

      const alerts = alertsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        uid: u.id
      }));

      const symbols = [...new Set(alerts.map(a => a.symbol))];
      const pricesArr = await Promise.all(symbols.map(fetchSingleStock));

      const prices = {};
      pricesArr.forEach(p => p && (prices[p.symbol] = p));

      for (const a of alerts) {
        const d = prices[a.symbol];
        if (!d) continue;

        if (d.price >= a.price) {
          await sendAlertEmail({
            email: a.email,
            symbol: a.symbol,
            target: a.price,
            price: d.price,
            change: d.change,
            changePercent: d.changePercent
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

/* run every 60 seconds */
setInterval(checkAllAlerts, 60 * 1000);

/* =====================
   API: PRICES
===================== */
app.get("/api/prices", async (req, res) => {
  const symbols = req.query.symbols?.split(",").map(s => s.trim());
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

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
