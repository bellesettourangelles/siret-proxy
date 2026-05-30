const express = require('express');
const fetch = require('node-fetch');
const app = express();

const INSEE_API_KEY = process.env.INSEE_API_KEY;
const API_VERSION = '2025-10';

// CORS : POST ajouté pour /register. Origine '*' provisoire (on durcira à l'étape 5).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Lecture du corps JSON (nécessaire pour POST /register)
app.use(express.json());

// ---- Route SIRET existante (inchangée) ----
app.get('/siret/:siret', async (req, res) => {
  const { siret } = req.params;
  if (!/^\d{14}$/.test(siret)) {
    return res.status(400).json({ error: 'SIRET invalide' });
  }
  try {
    const response = await fetch(
      `https://api.insee.fr/api-sirene/3.11/siret/${siret}`,
      { headers: { 'X-INSEE-Api-Key-Integration': INSEE_API_KEY, 'Accept': 'application/json' } }
    );
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return res.status(response.status).json(data);
    } catch (e) {
      return res.status(502).json({ error: 'Réponse INSEE invalide', status: response.status, raw: text.slice(0, 300) });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Erreur serveur', detail: e.message });
  }
});

// ---- NOUVEAU : token Admin via Client Credentials (mis en cache ~24h) ----
let _adminToken = null;
let _adminTokenExpiry = 0;

async function getAdminToken() {
  if (_adminToken && Date.now() < _adminTokenExpiry) return _adminToken;
  const r = await fetch(`https://${process.env.SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error('token_error ' + r.status + ' ' + JSON.stringify(data));
  }
  _adminToken = data.access_token;
  _adminTokenExpiry = Date.now() + ((data.expires_in || 86400) - 300) * 1000; // marge 5 min
  return _adminToken;
}

// ---- NOUVEAU : re-vérif SIRET côté serveur (on ne fait pas confiance au navigateur) ----
async function siretEstActif(siret) {
  const response = await fetch(
    `https://api.insee.fr/api-sirene/3.11/siret/${siret}`,
    { headers: { 'X-INSEE-Api-Key-Integration': INSEE_API_KEY, 'Accept': 'application/json' } }
  );
  if (response.status !== 200) return false;
  const data = await response.json();
  const etab = data && data.etablissement;
  const periode = etab && etab.periodesEtablissement && etab.periodesEtablissement[0];
  return !!(periode && periode.etatAdministratifEtablissement === 'A');
}

// ---- NOUVEAU : création du client ----
app.post('/register', async (req, res) => {
  const { type, firstName, lastName, email, phone, siret } = req.body || {};

  if (!lastName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  let tags = ['customer'];
  let note = '';

  if (type === 'pro') {
    if (!/^\d{14}$/.test(siret || '')) return res.status(400).json({ error: 'invalid_siret' });
    const actif = await siretEstActif(siret).catch(() => false);
    if (!actif) return res.status(400).json({ error: 'invalid_siret' });
    tags = ['wholesale_pending'];
    note = 'siret:' + siret;
  }

  const cleanPhone = (phone || '').replace(/\s/g, '');
  const input = {
    firstName: firstName || null,
    lastName,
    email,
    phone: /^\+\d{8,15}$/.test(cleanPhone) ? cleanPhone : null,
    tags,
    note
  };

  try {
    const token = await getAdminToken();
    const r = await fetch(`https://${process.env.SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: `mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) { customer { id } userErrors { field message } }
        }`,
        variables: { input }
      })
    });
    const data = await r.json();
    const result = data && data.data && data.data.customerCreate;

    if (result && result.userErrors && result.userErrors.length) {
      const msg = result.userErrors[0].message || '';
      return res.status(400).json({ error: /taken|already/i.test(msg) ? 'email_taken' : 'shopify_error', message: msg });
    }
    if (!result || !result.customer) {
      return res.status(502).json({ error: 'no_customer', detail: data });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'upstream', detail: e.message });
  }
});

app.listen(process.env.PORT || 3000);
