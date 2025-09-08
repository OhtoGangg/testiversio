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
const GUILD_ID = process.env.GUILD_ID; // Discord palvelimen ID
const LIVESSA_ROLE_ID = process.env.LIVESSA_ROLE_ID; // Rooli, jonka lisäät/laitat pois
const MAINOSTUS_CHANNEL_ID = process.env.MAINOSTUS_CHANNEL_ID; // Viestikanavan ID missä ilmoitukset näkyvät
const STRIIMAAJA_ROLE_ID = process.env.STRIIMAAJA_ROLE_ID; // Striimaajan rooli
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID; // Twitch API Client ID
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN; // Twitch API Access Token

const dataFilePath = './data.json';
let userData = {};

// Funktiot datan lataamiseen ja tallentamiseen
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

// Ladataan data heti käynnistyksen yhteydessä
loadData();

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
] });

client.once('ready', async () => {
    console.log(`Kirjauduttu sisään ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    // Säännöllinen tarkistus
    setInterval(async () => {
        console.log('Tarkistetaan striimaajat...');
        for (const member of members.values()) {
            if (member.roles.cache.has(STRIIMAAJA_ROLE_ID)) {
                // Tarkistetaan, onko tallennettu Twitch-nimi
                if (!userData[member.id]) {
                    userData[member.id] = {
                        twitchName: member.displayName, // Voit muuttaa, jos sinulla on erillinen Twitch-nimi
                        _isLive: false,
                        _liveMessageId: null
                    };
                }

                const twitchUsername = userData[member.id].twitchName;

                try {
                    const response = await axios.get('https://api.twitch.tv/helix/streams', {
                        headers: {
                            'Client-ID': TWITCH_CLIENT_ID,
                            'Authorization': `Bearer ${TWITCH_ACCESS_TOKEN}`
                        },
                        params: {
                            user_login: twitchUsername
                        }
                    });

                    const streamData = response.data.data[0];
                    const title = streamData ? streamData.title : '';
                    const category = streamData ? streamData.game_name : '';

                    const isRSRP = title.includes('#RSRP') || title.includes('RSRP');
                    const isGTA = category === 'GTA V';

                    const isLive = streamData !== undefined && Object.keys(streamData).length > 0;
                    const memberId = member.id;
                    const currentlyLive = userData[memberId]._isLive || false;

                    // Tarkistetaan ehdot ennen ilmoituksen lähettämistä
                    if (isLive && !currentlyLive && isRSRP && isGTA) {
                        const channel = await guild.channels.fetch(MAINOSTUS_CHANNEL_ID);
                     console.log(`Yritetään lähettää viesti ja lisätä rooli jäsenelle ${member.user.tag}`);
const message = await channel.send(`${member.user.username} aloitti striimin! Katso tästä: ${getTwitchUrl(twitchUsername)}`);
console.log(`Viestin lähetetty onnistuneesti. Viestin ID: ${message.id}`);
// Lisätään rooli
await member.roles.add(LIVESSA_ROLE_ID);
console.log(`Rooli lisätty käyttäjälle ${member.user.tag}`);

                        // Lisää "LIVESSÄ" rooli
                        await member.roles.add(LIVESSA_ROLE_ID);

                        // Päivitä data
                        userData[memberId]._isLive = true;
                        userData[memberId]._liveMessageId = message.id;
                        saveData();
                    }
                    // Jos lopettaa striimin tai ehdot eivät täyty, poista viesti ja rooli
                    else if ((!isLive || !isRSRP || !isGTA) && currentlyLive) {
                        const channel = await guild.channels.fetch(MAINOSTUS_CHANNEL_ID);
                        const messageId = userData[member.id]._liveMessageId;
                        if (messageId) {
                            try {
                                const msg = await channel.messages.fetch(messageId);
                                await msg.delete();
                            } catch (err) {
                                console.log('Viestin poisto epäonnistui:', err);
                            }
                        }
                        await member.roles.remove(LIVESSA_ROLE_ID);
                        userData[member.id]._isLive = false;
                        userData[member.id]._liveMessageId = null;
                        saveData();
                    }
                } catch (err) {
                    console.error('Virhe Twitch API:ssä:', err);
                }
            } else {
                // Jos jäsen ei enää roolissa, mutta oli aiemmin live
                if (userData[member.id] && userData[member.id]._isLive) {
                    // Poista viesti ja rooli jos tarpeen
                    const channel = await guild.channels.fetch(MAINOSTUS_CHANNEL_ID);
                    const messageId = userData[member.id]._liveMessageId;
                    if (messageId) {
                        try {
                            const msg = await channel.messages.fetch(messageId);
                            await msg.delete();
                        } catch (err) {
                            console.log('Viestin poisto epäonnistui:', err);
                        }
                    }
                    await member.roles.remove(LIVESSA_ROLE_ID);
                    userData[member.id]._isLive = false;
                    userData[member.id]._liveMessageId = null;
                    saveData();
                }
            }
        }
    }, 60000); // tarkistaa minuutin välein
});

// Funktio Twitch URL:lle
function getTwitchUrl(username) {
    return `https://www.twitch.tv/${username}`;
}

client.login(TOKEN);
