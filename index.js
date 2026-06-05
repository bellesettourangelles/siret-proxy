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

app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query;
  console.log('=== AUTH CALLBACK reçu ===', { code, shop });
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      })
    });
    const data = await response.json();
    console.log('=== SHOPIFY ACCESS TOKEN ===', data.access_token);
    res.send('TOKEN OK: ' + data.access_token);
  } catch(e) {
    console.log('=== ERREUR CALLBACK ===', e.message);
    res.status(500).send('Erreur: ' + e.message);
  }
});

app.get('/siret/:siret', async (req, res) => {
  res.json({ _source: 'test', message: 'ok' });
});

app.post('/register', async (req, res) => {
  res.json({ success: false, message: 'token manquant' });
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
