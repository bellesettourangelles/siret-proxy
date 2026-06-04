const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/siret/:siret', async (req, res) => {
  const { siret } = req.params;
  try {
    const response = await fetch(
      `https://api.insee.fr/api-sirene/3.11/siret/${siret}`,
      {
        headers: {
          'Authorization': `Bearer ${await getInseeToken()}`,
          'Accept': 'application/json'
        }
      }
    );
    if (!response.ok) {
      const fallback = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${siret}&page=1&per_page=1`
      );
      const fallbackData = await fallback.json();
      return res.json({ _source: 'gouv', results: fallbackData.results });
    }
    const data = await response.json();
    res.json(data);
  } catch(e) {
    try {
      const fallback = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${siret}&page=1&per_page=1`
      );
      const fallbackData = await fallback.json();
      return res.json({ _source: 'gouv', results: fallbackData.results });
    } catch(e2) {
      res.status(500).json({ error: e2.message });
    }
  }
});

let inseeToken = null;
let inseeTokenExpiry = 0;

async function getInseeToken() {
  if (inseeToken && Date.now() < inseeTokenExpiry) return inseeToken;
  const credentials = Buffer.from(
    process.env.INSEE_CLIENT_ID + ':' + process.env.INSEE_CLIENT_SECRET
  ).toString('base64');
  const res = await fetch('https://api.insee.fr/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  inseeToken = data.access_token;
  inseeTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return inseeToken;
}

app.post('/register', async (req, res) => {
  const { firstName, lastName, email, password, tags, phone, note } = req.body;
  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/customers.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': process.env.SHOPIFY_API_SECRET
        },
        body: JSON.stringify({
          customer: {
            first_name: firstName || '',
            last_name: lastName || '',
            email,
            password,
            password_confirmation: password,
            tags: tags || '',
            note: note || '',
            phone: phone || '',
            verified_email: true
          }
        })
      }
    );
    const data = await response.json();
    if (data.errors) return res.status(400).json({ errors: data.errors });
    return res.json({ success: true, customer: data.customer });
  } catch(e) {
    return res.status(500).json({ errors: [{ message: e.message }] });
  }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
