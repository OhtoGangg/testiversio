// Importataan tarvittavat kirjastot
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Luodaan uusi Discord asiakas ja määritellään intentsit
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers
] });

// Kun botti on valmis
client.once('ready', () => {
    console.log('Bot on käynnistynyt!');
});

// Reagoi viesteihin
client.on('messageCreate', async message => {
    if (message.author.bot) return; // Älä reagoi omiin viesteihin

    // Esimerkki komento linked accounts hakemiseen
    if (message.content === '!linked') {
        try {
            // Hae käyttäjän tiedot
            const user = await message.author.fetch();

            // Tarkista, onko käyttäjä linkittänyt tilinsä
            const connections = await user.fetchConnections();

            if (connections.size === 0) {
                message.channel.send('Sinulla ei ole linkitettyjä tilejä.');
                return;
            }

            // Etsi Twitch-yhteys
            const twitchConn = connections.find(conn => conn.type === 'twitch');

            if (twitchConn) {
                message.channel.send(`Twitch käyttäjä: ${twitchConn.name}`);
            } else {
                message.channel.send('Ei Twitch-yhteyttä löytynyt.');
            }
        } catch (error) {
            console.error('Virhe linked accounts hakemisessa:', error);
            message.channel.send('Virhe linked accounts hakemisessa. Varmista, että sinulla on oikeudet ja tilisi on linkitetty.');
        }
    }
});
