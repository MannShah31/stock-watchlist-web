const axios = require("axios");

const API_KEY = "YOUR_API_KEY";
const API_SECRET = "YOUR_API_SECRET";
const CODE = "PASTE_AUTH_CODE_HERE";
const REDIRECT_URI = "http://localhost";

async function getToken() {
  const res = await axios.post(
    "https://api.upstox.com/v2/login/authorization/token",
    {
      code: CODE,
      client_id: API_KEY,
      client_secret: API_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    },
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  console.log("ACCESS TOKEN:");
  console.log(res.data.access_token);
}

getToken();
