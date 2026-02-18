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
   📥 DOWNLOAD ALL NSE/BSE STOCKS
===================== */
const zlib = require("zlib");

app.get("/upstock/sync-stocks", async (req, res) => {
  try {

    async function download(url) {
      return new Promise((resolve, reject) => {

        console.log("Downloading:", url);

        https.get(url, response => {

          console.log("Status:", response.statusCode);

          if (response.statusCode !== 200) {
            return reject("Bad status: " + response.statusCode);
          }

          const chunks = [];

          response.on("data", chunk => chunks.push(chunk));

          response.on("end", () => {
            const buffer = Buffer.concat(chunks);

            zlib.gunzip(buffer, (err, decoded) => {
              if (err) {
                console.error("Gunzip error:", err);
                return reject(err);
              }

              try {
                const json = JSON.parse(decoded.toString());
                resolve(json);
              } catch (e) {
                reject("JSON parse error");
              }
            });
          });

        }).on("error", reject);

      });
    }

    // ✅ NEW WORKING URLS
    const nse = await download(
      "https://assets.upstox.com/instruments/NSE.json.gz"
    );

    const bse = await download(
      "https://assets.upstox.com/instruments/BSE.json.gz"
    );

    console.log("NSE count:", nse.length);
    console.log("BSE count:", bse.length);

    const all = [...nse, ...bse]
      .filter(i =>
        i.segment === "NSE_EQ" || i.segment === "BSE_EQ"
      )
      .map(i => ({
        symbol: i.trading_symbol,
        name: i.name
      }));

    console.log("Final EQ stocks:", all.length);

    fs.writeFileSync(
      path.join(__dirname, "stocks.json"),
      JSON.stringify(all, null, 2)
    );

    res.json({
      message: "stocks.json updated",
      total: all.length
    });

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
