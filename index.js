// Lisätään palvelimen koodi
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
  res.end('<h1>Palvelu on käynnissä</h1>');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Discord.js ja muu koodi
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN; // Discord-botin token
const GUILD_ID = process.env.GUILD_ID;
const LIVESSA_ROLE_ID = process.env.LIVESSA_ROLE_ID;
const MAINOSTUS_CHANNEL_ID = process.env.MAINOSTUS_CHANNEL_ID;
const STRIIMAAJA_ROLE_ID = process.env.STRIIMAAJA_ROLE_ID;

const dataFilePath = './data.json';
let userData = {};

// Ladataan data
function loadData() {
  try {
    const rawData = fs.readFileSync(dataFilePath, 'utf8');
    userData = JSON.parse(rawData);
  } catch (err) {
    console.log('Ei voitu lukea data.json-tiedostoa, luodaan uusi.');
    userData = {};
  }
}

function saveData() {
  fs.writeFileSync(dataFilePath, JSON.stringify(userData, null, 2));
}
loadData();

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
] });

// OHJELMAN OSA: OAuth2 palvelin (samalla tiedostolla)
const url = require('url');
const querystring = require('querystring');

const CLIENT_ID = 'OMA_CLIENT_ID'; // Korvaa omalla
const CLIENT_SECRET = 'OMA_CLIENT_SECRET'; // Korvaa omalla
const REDIRECT_URI = `http://localhost:${PORT}/callback`; // Sama kuin OAuth2 asetuksissa

// OAuth2 kirjautumisen aloitus
if (true) { // Tämä pitää muuttaa, esim. commandilla tai erikseen
  // Esimerkki: avaa URL käyttäjälle
  console.log(`Avaa selaimessa: http://localhost:${PORT}/auth`);
}

// OAuth2 -tapahtuma
server.on('request', async (req, res) => {
  const parsedUrl = url.parse(req.url);
  if (parsedUrl.pathname === '/auth') {
    // Lähetetään käyttäjälle OAuth2 kirjautumislinkki
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.writeHead(302, { Location: authUrl });
    res.end();
  } else if (parsedUrl.pathname === '/callback') {
    const qs = querystring.parse(parsedUrl.query);
    const code = qs.code;

    // Vaihe 1: hakee token
    try {
      const tokenRes = await axios.post('https://discord.com/api/oauth2/token', querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        scope: 'identify guilds'
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const accessToken = tokenRes.data.access_token;

      // Vaihe 2: hakee käyttäjätiedot
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const userId = userRes.data.id;
      const username = userRes.data.username;

      // Tallennetaan data
      userData[userId] = {
        discordId: userId,
        username: username,
        twitchName: null, // Voit lisätä Twitch-nimen myöhemmin
        _isLive: false,
        _liveMessageId: null
      };
      saveData();

      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(`<h1>Kiitos, ${username}! Kirjautuminen onnistui.</h1>`);
    } catch (err) {
      console.error('OAuth2 token tai käyttäjätietojen haku epäonnistui:', err);
      res.writeHead(500);
      res.end('Virhe tapahtui.');
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Discord-botin logiikka
client.once('ready', async () => {
  console.log(`Kirjauduttu sisään ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();

  setInterval(async () => {
    // ... (kuten aiemmin: Twitchin tarkistus ja roolien hallinta)
  }, 60000);
});

// Helper-funktio Twitch URL
function getTwitchUrl(username) {
  return `https://www.twitch.tv/${username}`;
}

client.login(TOKEN);
