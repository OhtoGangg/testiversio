import 'dotenv/config'; // 🔹 Tämä lataa .env-muuttujat myös paikallisessa kehityksessä
import express from 'express';
import { DiscordBot } from './discord-bot.js';

// 🔹 Tarkistetaan, että Discord token löytyy
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN ei ole asetettu Renderin environment variables -osiossa!');
  process.exit(1); // Lopetetaan deploy, jos token puuttuu
}

const PORT = process.env.PORT || 10000; // Render käyttää port 10000, joten oletetaan se
const app = express();

app.get('/', (req, res) => {
  res.send('✅ Bot toimii ja HTTP-serveri on pystyssä!');
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// 🔹 Käynnistetään Discord-botti
(async () => {
  const bot = new DiscordBot();
  try {
    await bot.initialize();
    console.log('🤖 Discord-botti käynnistetty onnistuneesti!');
  } catch (err) {
    console.error('❌ Virhe botin käynnistyksessä:', err);
  }
})();
