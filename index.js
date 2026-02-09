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

// =====================
// Firebase Admin Init
// =====================
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_ADMIN)
    )
  });
}
const fdb = admin.firestore();

// =====================
// EmailJS ENV
// =====================
const EMAILJS_SERVICE = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC = process.env.EMAILJS_PUBLIC_KEY;

if (!EMAILJS_SERVICE || !EMAILJS_TEMPLATE || !EMAILJS_PUBLIC) {
  console.warn("⚠️ EmailJS ENV variables missing");
}

// --------------------
// Health
// --------------------
// =======================
// 📊 INDICES API
// =======================
const INDICES = {
  "NIFTY 50": "^NSEI",
  "NIFTY BANK": "^NSEBANK",
  "NIFTY IT": "^CNXIT",
  "NIFTY FMCG": "^CNXFMCG",
  "NIFTY PHARMA": "^CNXPHARMA",
  "NIFTY AUTO": "^CNXAUTO",
  "NIFTY METAL": "^CNXMETAL",
  "NIFTY ENERGY": "^CNXENERGY",
  "SENSEX": "^BSESN"
};

async function fetchIndex(symbol) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;

    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, r => {
      let raw = "";
      r.on("data", d => (raw += d));
      r.on("end", () => {
        try {
          const res = JSON.parse(raw).chart.result[0];
          const prices = res.indicators.quote[0].close.filter(Boolean);

          const latest = prices[prices.length - 1];
          const oneMonthAgo = prices[Math.max(0, prices.length - 22)];
          const oneYearAgo = prices[0];

          resolve({
            current: latest,
            mom: ((latest - oneMonthAgo) / oneMonthAgo) * 100,
            yoy: ((latest - oneYearAgo) / oneYearAgo) * 100
          });
        } catch {
          resolve(null);
        }
      });
    });
  });
}

app.get("/api/indices", async (_, res) => {
  const output = [];

  for (const name in INDICES) {
    const data = await fetchIndex(INDICES[name]);
    if (data) {
      output.push({
        name,
        ...data
      });
    }
  }

  res.json(output);
});
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
// SEND EMAIL (direct)
// --------------------
async function sendAlertEmail({ email, symbol, target, price, change, changePercent }) {
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
}

// --------------------
// APIs
// --------------------
app.get("/api/prices", async (req, res) => {
  let symbols = req.query.symbols;
  if (!symbols) return res.status(400).json({ error: "Missing symbols" });

  symbols = symbols.split(",").map(s => s.trim()).filter(Boolean);
  const results = {};

  const data = await Promise.all(symbols.map(fetchSingleStock));
  data.forEach(d => d && (results[d.symbol] = d));

  // 🔔 ALERT CHECK (THIS IS THE FIX)
  try {
    const users = await fdb.collection("users").get();

    for (const u of users.docs) {
      const alertsSnap = await fdb
        .collection("users")
        .doc(u.id)
        .collection("alerts")
        .where("triggered", "==", false)
        .get();

      for (const docSnap of alertsSnap.docs) {
        const a = docSnap.data();
        const d = results[a.symbol];
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

          await docSnap.ref.update({
            triggered: true,
            triggeredAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
  } catch (e) {
    console.error("❌ Alert processing error:", e.message);
  }

  res.json(results);
});

app.get("/api/stocks", (_, res) => {
  const file = path.join(__dirname, "stocks.json");
  res.json(JSON.parse(fs.readFileSync(file, "utf8")));
});
// --------------------
// 📊 Indices API
// --------------------

app.get("/api/indices", async (_, res) => {
  try {
    const results = [];

    for (const [name, symbol] of Object.entries(INDICES)) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1y&interval=1d`;

      const data = await new Promise(resolve => {
        https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, r => {
          let raw = "";
          r.on("data", d => (raw += d));
          r.on("end", () => {
            try {
              const chart = JSON.parse(raw).chart.result[0];
              const closes = chart.indicators.quote[0].close.filter(Boolean);
              const timestamps = chart.timestamp;

              const current = closes.at(-1);
              const oneMonth = closes[Math.max(0, closes.length - 22)];
              const oneYear = closes[0];

              resolve({
                name,
                symbol,
                current,
                oneMonth,
                oneYear,
                mom:
                  ((current - oneMonth) / oneMonth) * 100,
                yoy:
                  ((current - oneYear) / oneYear) * 100
              });
            } catch {
              resolve(null);
            }
          });
        }).on("error", () => resolve(null));
      });

      if (data) results.push(data);
    }

    res.json(results);
  } catch (e) {
    console.error("❌ Indices API error", e.message);
    res.status(500).json({ error: "Failed to load indices" });
  }
});

// --------------------
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
