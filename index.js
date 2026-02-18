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
   🔐 UPSTOX LOGIN ROUTE
===================== */
app.get("/upstock/login", (req, res) => {
  const url =
    `https://api.upstox.com/v2/login/authorization/dialog` +
    `?response_type=code` +
    `&client_id=${process.env.UPSTOX_CLIENT_ID}` +
    `&redirect_uri=${process.env.UPSTOX_REDIRECT_URI}`;

  res.redirect(url);
});

/* =====================
   🔄 UPSTOX CALLBACK
===================== */
app.get("/upstock/callback", (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send("No authorization code received");
  }

  const postData = new URLSearchParams({
    code,
    client_id: process.env.UPSTOX_CLIENT_ID,
    client_secret: process.env.UPSTOX_CLIENT_SECRET,
    redirect_uri: process.env.UPSTOX_REDIRECT_URI,
    grant_type: "authorization_code"
  }).toString();

  const options = {
    hostname: "api.upstox.com",
    path: "/v2/login/authorization/token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": postData.length
    }
  };

  const request = https.request(options, response => {
    let data = "";

    response.on("data", chunk => (data += chunk));
    response.on("end", () => {
      try {
        const parsed = JSON.parse(data);

        if (parsed.access_token) {
          console.log("✅ UPSTOX ACCESS TOKEN:", parsed.access_token);
          res.send("Upstox connected successfully! Check logs for token.");
        } else {
          res.send(parsed);
        }
      } catch {
        res.send(data);
      }
    });
  });

  request.write(postData);
  request.end();
});

/* =====================
   🧪 TEST UPSTOX PROFILE
===================== */
app.get("/upstock/profile", (req, res) => {
  const token = process.env.UPSTOX_ACCESS_TOKEN;

  if (!token) {
    return res.send("Access token not set in environment variables");
  }

  const options = {
    hostname: "api.upstox.com",
    path: "/v2/user/profile",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  https.request(options, response => {
    let data = "";
    response.on("data", chunk => (data += chunk));
    response.on("end", () => {
      res.send(data);
    });
  }).end();
});
/* =====================
   📥 DOWNLOAD ALL NSE/BSE STOCKS
===================== */
app.get("/upstock/sync-stocks", (req, res) => {
  const token = process.env.UPSTOX_ACCESS_TOKEN;

  if (!token) {
    return res.send("Access token missing");
  }

  const options = {
    hostname: "api.upstox.com",
    path: "/v2/market/instruments",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  https.request(options, response => {
    let data = "";
    response.on("data", chunk => (data += chunk));
    response.on("end", () => {
      try {
        const parsed = JSON.parse(data);

        if (!parsed.data) {
          return res.send(parsed);
        }

        const stocks = parsed.data
          .filter(i =>
            i.exchange === "NSE_EQ" || i.exchange === "BSE_EQ"
          )
          .map(i => ({
            symbol: i.trading_symbol,
            name: i.name
          }));

        fs.writeFileSync(
          path.join(__dirname, "stocks.json"),
          JSON.stringify(stocks, null, 2)
        );

        res.send({
          message: "stocks.json updated",
          total: stocks.length
        });

      } catch (e) {
        res.send(data);
      }
    });
  }).end();
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
