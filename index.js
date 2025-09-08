// ==============================
// 1️⃣ ENV & moduulit
// ==============================
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

// ==============================
// 2️⃣ ENV-muuttujat
// ==============================
const PORT = process.env.PORT || 3000; // Tarpeeton, mutta voi pitää jos haluat HTTP-serverin
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const STRIIMAAJA_ROLE_ID = process.env.STRIIMAAJA_ROLE_ID;
const LIVESSA_ROLE_ID = process.env.LIVE_ROLE_ID;
const MAINOSTUS_CHANNEL_ID = process.env.MAINOSTUS_CHANNEL_ID;
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
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', async () => {
  console.log(`Kirjauduttu sisään ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  const channel = await guild.channels.fetch(MAINOSTUS_CHANNEL_ID);

  // --- Twitch-liven tarkistus joka minuutti ---
  setInterval(async () => {
    guild.members.cache.forEach(async member => {
      if (!member.roles.cache.has(STRIIMAAJA_ROLE_ID)) return;

      // Twitch-nimi = Discord-nimi pienennettynä
      const twitchName = member.user.username.toLowerCase();

      try {
        const streamRes = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${twitchName}`, {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${TWITCH_ACCESS_TOKEN}`
          }
        });

        const isLive = streamRes.data.data.length > 0;

        if (isLive && !member.roles.cache.has(LIVESSA_ROLE_ID)) {
          await member.roles.add(LIVESSA_ROLE_ID);
          const message = await channel.send(`🔴 ${member.user.username} on nyt **livenä**! https://twitch.tv/${twitchName}`);
          if (!userData[member.id]) userData[member.id] = {};
          userData[member.id]._liveMessageId = message.id;
          saveData();
        } else if (!isLive && member.roles.cache.has(LIVESSA_ROLE_ID)) {
          await member.roles.remove(LIVESSA_ROLE_ID);
          if (userData[member.id]?._liveMessageId) {
            try {
              const msg = await channel.messages.fetch(userData[member.id]._liveMessageId);
              await msg.delete();
            } catch {}
            userData[member.id]._liveMessageId = null;
            saveData();
          }
        }
      } catch (err) {
        console.error('Twitch API error:', err.response?.data || err);
      }
    });
  }, 60000);
});

// Bot login
client.login(TOKEN);

// ==============================
// 5️⃣ Invite-link
// ==============================
console.log(`Lisää bot serverille: https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`);
