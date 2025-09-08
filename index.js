import 'dotenv/config';
import express from 'express';
import { DiscordBot } from './discord-bot.js';

const PORT = process.env.PORT || 10000;

const app = express();
app.get('/', (req, res) => res.send('Bot toimii! HTTP-serveri pystyssä.'));
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

(async () => {
  const bot = new DiscordBot();
  try {
    await bot.initialize();
    console.log('Discord-botti käynnistetty!');
  } catch (err) {
    console.error('Virhe botin käynnistyksessä:', err);
  }
})();
