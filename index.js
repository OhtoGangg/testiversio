// ==============================
// 1️⃣ ENV & moduulit
// ==============================
require('dotenv').config();
const http = require('http');
const url = require('url');
const querystring = require('querystring');
const axios = require('axios');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');

// ==============================
// 2️⃣ ENV-muuttujat
// ==============================
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const GUILD_ID = process.env.GUILD_ID;
const LIVESSA_ROLE_ID = process.env.LIVE_ROLE_ID;
const MAINOSTUS_CHANNEL_ID = process.env.MAINOSTUS_CHANNEL_ID;
const STRIIMAAJA_ROLE_ID = process.env.STRIIMAAJA_ROLE_ID;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;
const TOKEN = process.env.DISCORD_TOKEN;
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;

// ==============================
// 3️⃣ Data.json
// ==============================
const dataFilePath = './data.json';
let userData = {};

try {
  userData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
} catch {
  userData = {};
}

function saveData() {
  fs.writeFileSync(dataFilePath, JSON.stringify(userData, null, 2));
}

// ==============================
// 4️⃣ Discord-botti
// ==============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once('ready', async () => {
  console.log(`Kirjauduttu sisään ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  // Tässä voit laittaa Twitch-tarkistuksen tai roolien hallinnan
});

// Bot login
client.login(TOKEN);

// ==============================
// 5️⃣ HTTP-serveri (OAuth2)
// ==============================
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url);

  // --- /auth endpoint ---
  if (parsedUrl.pathname === '/auth') {
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.writeHead(302, { 'Location': authUrl });
    res.end();
  }
  // --- /callback endpoint ---
  else if (parsedUrl.pathname === '/callback') {
    const qs = querystring.parse(parsedUrl.query);
    const code = qs.code;

    try {
      // Tokenin hakeminen
      const tokenRes = await axios.post(
        'https://discord.com/api/oauth2/token',
        querystring.stringify({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          scope: 'identify guilds'
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenRes.data.access_token;

      // Käyttäjätietojen hakeminen
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      const userId = userRes.data.id;
      const username = userRes.data.username;

      // Tallennetaan data.json
      userData[userId] = { discordId: userId, username, twitchName: null, _isLive: false, _liveMessageId: null };
      saveData();

      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(`<h1>Kiitos, ${username}! Kirjautuminen onnistui.</h1>`);
    } catch (err) {
      console.error('OAuth2 error:', err.response?.data || err);
      res.writeHead(500);
      res.end('Virhe tapahtui.');
    }
  }
  // --- muu ---
  else {
    res.writeHead(404);
    res.end('404 - Not Found');
  }
});

// Serverin käynnistys
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ==============================
// 6️⃣ Invite-link
// ==============================
console.log(`Lisää bot serverille: https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`);
