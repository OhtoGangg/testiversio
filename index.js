// ==============================
// index.js
// ==============================

// 1️⃣ Moduulit
const express = require('express');
const { DiscordBot } = require('./discord-bot.js'); // varmista, että käännät TS -> JS

// 2️⃣ Portti
const PORT = process.env.PORT || 3000;

// 3️⃣ Express-palvelin (terveyscheck)
const app = express();
app.get('/', (req, res) => {
  res.send('Bot toimii ja HTTP-serveri on pystyssä!');
});
app.listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

// 4️⃣ Käynnistä Discord-botti
(async () => {
  const bot = new DiscordBot();
  try {
    await bot.initialize(); // käyttää Renderin ympäristömuuttujia
    console.log('Discord-botti käynnistetty!');
  } catch (err) {
    console.error('Virhe botin käynnistyksessä:', err);
  }
})();
