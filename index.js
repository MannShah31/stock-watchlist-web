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

console.log("📨 EmailJS Loaded:", {
  service: !!EMAILJS_SERVICE,
  template: !!EMAILJS_TEMPLATE,
  publicKey: !!EMAILJS_PUBLIC
});

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

          const closes = [];
          for (let i = 0; i < rawCloses.length; i++) {
            if (rawCloses[i] != null) closes.push(rawCloses[i]);
            else if (closes.length) closes.push(closes[closes.length - 1]);
          }

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
async function sendAlertEmail(payload) {
  console.log("📧 Sending email:", payload);

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE,
      template_id: EMAILJS_TEMPLATE,
      user_id: EMAILJS_PUBLIC,
      template_params: payload
    })
  });

  const text = await res.text();
  console.log("📨 EmailJS response:", text);

  if (!res.ok) {
    throw new Error(text);
  }
}

/* =====================
   🔔 ALERT ENGINE (DEBUG)
===================== */
async function checkAllAlerts() {
  console.log("⏰ Alert engine tick");

  try {
    const users = await fdb.collection("users").get();
    console.log("👥 Users found:", users.size);

    for (const u of users.docs) {
      const snap = await fdb
        .collection("users")
        .doc(u.id)
        .collection("alerts")
        .where("triggered", "==", false)
        .get();

      console.log(`🔔 Alerts for ${u.id}:`, snap.size);
      if (snap.empty) continue;

      const alerts = snap.docs.map(d => ({
        id: d.id,
        uid: u.id,
        ...d.data()
      }));

      const symbols = [...new Set(alerts.map(a => a.symbol))];
      console.log("📈 Fetching prices for:", symbols);

      const pricesArr = await Promise.all(symbols.map(fetchSingleStock));
      const prices = {};
      pricesArr.forEach(p => p && (prices[p.symbol] = p));

      console.log("💰 Prices:", prices);

      for (const a of alerts) {
        const d = prices[a.symbol];
        if (!d) continue;

        console.log(
          `🧪 Checking ${a.symbol}: current=${d.price} target=${a.price}`
        );

        if (d.price >= a.price) {
          console.log("🔥 ALERT TRIGGERED:", a.symbol);

          await sendAlertEmail({
            to_email: a.email,
            symbol: a.symbol,
            alert_price: a.price,
            current_price: d.price,
            change: d.change,
            change_percent: d.changePercent
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
    console.error("❌ Alert engine crash:", e.message);
  }
}

/* 🔥 RUN EVERY 60s */
setInterval(checkAllAlerts, 60 * 1000);

/* =====================
   API: PRICES (NO ALERTS HERE)
===================== */
app.get("/api/prices", async (req, res) => {
  const symbols = req.query.symbols?.split(",").map(s => s.trim());
  if (!symbols || !symbols.length) {
    return res.status(400).json({ error: "Missing symbols" });
  }

  const data = await Promise.all(symbols.map(fetchSingleStock));
  const prices = {};
  data.forEach(d => d && (prices[d.symbol] = d));

  res.json(prices);
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
