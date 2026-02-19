const https = require("https");
const fs = require("fs");
const zlib = require("zlib");

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      const chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        zlib.gunzip(buffer, (err, decoded) => {
          if (err) return reject(err);
          resolve(JSON.parse(decoded.toString()));
        });
      });
    }).on("error", reject);
  });
}

(async () => {
  console.log("Downloading NSE...");
  const nse = await download(
    "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
  );

  console.log("Downloading BSE...");
  const bse = await download(
    "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz"
  );

  const all = [...nse, ...bse]
    .filter(i => i.segment === "NSE_EQ" || i.segment === "BSE_EQ")
    .map(i => ({
  symbol:
    i.segment === "NSE_EQ"
      ? i.trading_symbol + ".NS"
      : i.trading_symbol + ".BO",
  name: i.name
    }));


  fs.writeFileSync("stocks.json", JSON.stringify(all, null, 2));

  console.log("Total stocks:", all.length);
})();
