// ==============================
// 1️⃣ ENV & moduulit
// ==============================
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const axios = require('axios');

// ==============================
// 2️⃣ ENV-muuttujat
// ==============================
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const STRIIMAAJA_ROLE_ID = process.env.STRIIMAAJA_ROLE_ID;
const LIVESSA_ROLE_ID = process.env.LIVE_ROLE_ID;
const MAINOSTUS_CHANNEL_ID = process.env.MAINOSTUS_CHANNEL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;

// ==============================
// 3️⃣ Data.json (vain admin-token tallennetaan)
// ==============================
const fs = require('fs');
const dataFilePath = './data.json';
let data = {};
try { data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8')); } catch {}
function saveData() { fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2)); }

// ==============================
// 4️⃣ Express-palvelin (OAuth2 kirjautuminen adminille)
// ==============================
const app = express();
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

app.get('/auth', (req, res) => {
  const scope = 'identify connections guilds';
  const authUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code received');

  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      scope: 'identify connections guilds'
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const accessToken = tokenRes.data.access_token;

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const user = userRes.data;
    data.adminToken = accessToken;
    saveData();

    res.send(`Tunnistus onnistui! Hei ${user.username}#${user.discriminator}. Voit sulkea tämän ikkunan.`);
    console.log(`Admin ${user.username} kirjautui OAuth2:lla.`);
  } catch (err) {
    console.error('OAuth2 error:', err.response?.data || err);
    res.send('Virhe todennuksessa');
  }
});

// ==============================
// 5️⃣ Discord-botti
// ==============================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  console.log(`Kirjauduttu sisään ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();
  const channel = await guild.channels.fetch(MAINOSTUS_CHANNEL_ID);

  // 1 min välein tarkistus
  setInterval(async () => {
    const adminToken = data.adminToken;
    if (!adminToken) return console.log('Admin ei ole kirjautunut OAuth2:lla');

    guild.members.cache.forEach(async member => {
      if (!member.roles.cache.has(STRIIMAAJA_ROLE_ID)) return;

      try {
        // Discord connections
        const connRes = await axios.get(`https://discord.com/api/users/${member.id}/connections`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });

        const twitchConn = connRes.data.find(c => c.type === 'twitch');
        if (!twitchConn) return;

        const twitchName = twitchConn.name;

        // Twitch stream status
        const streamRes = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${twitchName}`, {
          headers: {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
          }
        });

        const isLive = streamRes.data.data.length > 0;

        if (isLive && !member.roles.cache.has(LIVESSA_ROLE_ID)) {
          await member.roles.add(LIVESSA_ROLE_ID);
          const message = await channel.send(`🔴 ${member.user.username} on nyt **livenä**! https://twitch.tv/${twitchName}`);
          if (!member._liveMessageId) member._liveMessageId = message.id;
        } else if (!isLive && member.roles.cache.has(LIVESSA_ROLE_ID)) {
          await member.roles.remove(LIVESSA_ROLE_ID);
          if (member._liveMessageId) {
            try { await channel.messages.fetch(member._liveMessageId).then(m => m.delete()); } catch {}
            member._liveMessageId = null;
          }
        }

      } catch (err) {
        console.error('Error Twitch/Discord:', err.response?.data || err.message || err);
      }
    });
  }, 60000);
});

client.login(TOKEN);

// ==============================
// 6️⃣ Invite-linkki ja ohjeet
// ==============================
console.log(`Lisää bot serverille: https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=268435584&scope=bot`);
console.log(`Kirjaudu kerran adminina OAuth2:lla: http://localhost:${PORT}/auth`);
