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

  // On teste les 3 méthodes d'auth possibles pour l'API INSEE
  const attempts = [
    { 'Authorization': `Bearer ${INSEE_API_KEY}`, 'Accept': 'application/json' },
    { 'X-INSEE-Api-Key-Integration': INSEE_API_KEY, 'Accept': 'application/json' },
    { 'apiKey': INSEE_API_KEY, 'Accept': 'application/json' },
  ];

  let lastStatus = 0;
  let lastText = '';

  for (const headers of attempts) {
    try {
      const response = await fetch(
        `https://api.insee.fr/entreprises/sirene/V3.11/siret/${siret}`,
        { headers }
      );

      const text = await response.text();
      lastStatus = response.status;
      lastText = text;

      // Si on obtient du JSON valide et pas une erreur HTML
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          const data = JSON.parse(text);
          return res.status(response.status).json(data);
        } catch(e) {}
      }

    } catch(e) {
      lastText = e.message;
    }
  }

  // Aucune méthode n'a fonctionné — on retourne le détail pour déboguer
  return res.status(502).json({
    error: 'Toutes les méthodes ont échoué',
    lastStatus,
    lastResponse: lastText.slice(0, 500)
  });
});

app.listen(process.env.PORT || 3000);
