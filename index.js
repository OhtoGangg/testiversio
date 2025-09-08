// ==============================
// 1️⃣ ENV & moduulit
// ==============================
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

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
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN;

// ==============================
// 3️⃣ Data.json (admin token + live message id)
// ==============================
const dataFilePath = './data.json';
let data = {};
try { data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8')); } catch {}
function saveData() { fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2)); }

// ==============================
// 4️⃣ Express-palvelin (OAuth2 adminille)
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

  const checkedUsers = {}; // tallentaa viimeksi tarkistetun streamin

  setInterval(async () => {
    const adminToken = data.adminToken;
    if (!adminToken) return console.log('Admin ei ole kirjautunut OAuth2:lla');

    const streamerMembers = guild.members.cache.filter(m => m.roles.cache.has(STRIIMAAJA_ROLE_ID));

    for (const member of streamerMembers.values()) {
      try {
        // Hae Discord connections
        const connRes = await axios.get(`https://discord.com/api/users/${member.id}/connections`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });

        const twitchConn = connRes.data.find(c => c.type === 'twitch');
        if (!twitchConn) continue;
        const twitchName = twitchConn.name;

        // Jos viimeksi tarkistettu 1 min sisällä, ohita
        if (checkedUsers[twitchName] && Date.now() - checkedUsers[twitchName] < 60000) continue;
        checkedUsers[twitchName] = Date.now();

        // Twitch API
        const streamRes = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${twitchName}`, {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${TWITCH_ACCESS_TOKEN}`
          }
        });

        const isLive = streamRes.data.data.length > 0;

        if (isLive && !member.roles.cache.has(LIVESSA_ROLE_ID)) {
          await member.roles.add(LIVESSA_ROLE_ID);
          const msg = await channel.send(`🔴 ${member.user.username} on nyt **livenä**! https://twitch.tv/${twitchName}`);
          if (!data.liveMessages) data.liveMessages = {};
          data.liveMessages[member.id] = msg.id;
          saveData();
        } else if (!isLive && member.roles.cache.has(LIVESSA_ROLE_ID)) {
          await member.roles.remove(LIVESSA_ROLE_ID);
          if (data.liveMessages?.[member.id]) {
            try { await channel.messages.fetch(data.liveMessages[member.id]).then(m => m.delete()); } catch {}
            delete data.liveMessages[member.id];
            saveData();
          }
        }

      } catch (err) {
        console.error(`Virhe käyttäjällä ${member.user.username}:`, err.response?.data || err.message || err);
      }
    }

  }, 60000); // 1 minuutti
});

client.login(TOKEN);

// ==============================
// 6️⃣ Invite-linkki ja ohjeet
// ==============================
console.log(`Lisää bot serverille: https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=268435584&scope=bot`);
console.log(`Kirjaudu kerran adminina OAuth2:lla: http://localhost:${PORT}/auth`);
