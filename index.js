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
   🔐 UPSTOX LOGIN
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
  if (!code) return res.send("No authorization code received");

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
          console.log("✅ ACCESS TOKEN:", parsed.access_token);
          res.send("Upstox connected. Save access_token to env.");
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
   📥 SYNC NSE + BSE STOCKS
===================== */
app.get("/upstock/sync-stocks", async (req, res) => {
  try {
    const token = process.env.UPSTOX_ACCESS_TOKEN;

    if (!token) {
      return res.status(400).send("UPSTOX_ACCESS_TOKEN not set");
    }

    const options = {
      hostname: "api.upstox.com",
      path: "/v2/instruments",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    };

    https.request(options, response => {
      let data = "";

      console.log("Status Code:", response.statusCode);

      response.on("data", chunk => (data += chunk));

      response.on("end", () => {
        console.log("RAW RESPONSE:");
        console.log(data);

        res.send("Check Render logs for full Upstox response.");
      });

    }).end();

  } catch (e) {
    console.error("SYNC ERROR:", e);
    res.status(500).send("Failed to sync stocks");
  }
});


/* =====================
   START SERVER
===================== */
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
