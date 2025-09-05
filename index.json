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

// Discord-asiakas
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] });

client.once('ready', async () => {
    console.log(`Kirjauduttu sisään nimellä ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    // Tarkistetaan säännöllisesti
    setInterval(async () => {
        for (const member of members.values()) {
            // Tarkistetaan, onko jäsenellä "Striimaaja" rooli
            if (member.roles.cache.has(STRIIMAAJA_ROLE_ID)) {
                // Tarkistetaan, onko tallennettu Twitch-käyttäjänimi
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
                    const isLive = response.data.data.length > 0;
                    const memberId = member.id;

                    const currentlyLive = userData[memberId]._isLive || false;

                    // Jos menee liveen
                    if (isLive && !currentlyLive) {
                        const channel = guild.channels.cache.get(MAINOSTUS_CHANNEL_ID);
                        const message = await channel.send(`${member.user.username} aloitti striimin! Katso tästä: ${getTwitchUrl(twitchUsername)}`);

                        // Lisää "LIVESSÄ" rooli
                        await member.roles.add(LIVESSA_ROLE_ID);

                        // Päivitä data
                        userData[memberId]._isLive = true;
                        userData[memberId]._liveMessageId = message.id;
                        saveData();
                    }
                    // Jos lopettaa striimin
                    else if (!isLive && currentlyLive) {
                        const channel = guild.channels.cache.get(MAINOSTUS_CHANNEL_ID);
                        const messageId = userData[memberId]._liveMessageId;
                        if (messageId) {
                            try {
                                const msg = await channel.messages.fetch(messageId);
                                await msg.delete();
                            } catch (err) {
                                console.log('Viestin poisto epäonnistui:', err);
                            }
                        }
                        // Poista "LIVESSÄ" rooli
                        await member.roles.remove(LIVESSA_ROLE_ID);

                        // Päivitä data
                        userData[memberId]._isLive = false;
                        userData[memberId]._liveMessageId = null;
                        saveData();
                    }
                } catch (err) {
                    console.error('Virhe Twitch API:ssä:', err);
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
