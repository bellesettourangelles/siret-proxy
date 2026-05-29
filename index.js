const express = require('express');
const fetch = require('node-fetch');
const app = express();

const ALLOWED_ORIGIN = 'https://bellesettourangelles.fr';
const INSEE_API_KEY = process.env.INSEE_API_KEY;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/siret/:siret', async (req, res) => {
  const { siret } = req.params;

  if (!/^\d{14}$/.test(siret)) {
    return res.status(400).json({ error: 'SIRET invalide' });
  }

  try {
    const response = await fetch(
      `https://api.insee.fr/entreprises/sirene/V3.11/siret/${siret}`,
      {
        headers: {
          'X-INSEE-Api-Key-Integration': INSEE_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return res.status(response.status).json(data);
    } catch(e) {
      return res.status(502).json({
        error: 'Réponse INSEE invalide',
        status: response.status,
        raw: text.slice(0, 300)
      });
    }

  } catch(e) {
    return res.status(500).json({ error: 'Erreur serveur', detail: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy démarré');
});
