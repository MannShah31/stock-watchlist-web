const https = require("https");
const fs = require("fs");

function yahooPOST(path, body) {
  return new Promise((resolve) => {
    const options = {
      hostname: "query2.finance.yahoo.com",
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function fetchExchange(exchange, suffix) {
  console.log(`Downloading ${exchange}...`);

  const body = {
    size: 2500,
    offset: 0,
    sortField: "marketCap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: {
      operator: "AND",
      operands: [
        {
          operator: "EQ",
          operands: ["region", "in"]
        },
        {
          operator: "EQ",
          operands: ["exchange", exchange]
        }
      ]
    }
  };

  const data = await yahooPOST("/v1/finance/screener", body);

  if (!data?.finance?.result?.[0]?.quotes) {
    console.log(`❌ Failed to load ${exchange}`);
    return [];
  }

  return data.finance.result[0].quotes.map((q) => ({
    name: q.shortName || q.symbol,
    symbol: q.symbol.endsWith(suffix)
      ? q.symbol
      : `${q.symbol}${suffix}`
  }));
}

async function run() {
  const nse = await fetchExchange("NSI", ".NS");
  const bse = await fetchExchange("BSE", ".BO");

  const all = [...nse, ...bse];

  // Remove duplicates
  const unique = [];
  const seen = new Set();

  for (const stock of all) {
    if (!seen.has(stock.symbol)) {
      seen.add(stock.symbol);
      unique.push(stock);
    }
  }

  fs.writeFileSync("stocks.json", JSON.stringify(unique, null, 2));

  console.log("✅ stocks.json updated");
  console.log("Total stocks:", unique.length);
}

run();
