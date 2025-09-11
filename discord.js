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

    try {
        // Komento: !linked
        if (message.content === '!linked') {
            const user = await client.users.fetch(message.author.id);
            const connections = await user.fetchConnections();

            if (connections.size === 0) {
                message.channel.send('Sinulla ei ole linkitettyjä tilejä.');
                return;
            }

            const twitchConn = connections.find(conn => conn.type === 'twitch');

            if (twitchConn) {
                message.channel.send(`Twitch käyttäjä: ${twitchConn.name}`);
            } else {
                message.channel.send('Ei Twitch-yhteyttä löytynyt.');
            }
        }

        // Komento: !status
        if (message.content === '!status') {
            message.channel.send('Kusipaskakännit vaan ja vetoja!');
        }
    } catch (error) {
        console.error('Virhe komennossa:', error);
        message.channel.send('Botti lähti lomalle, pärjätkää vitun näädät!');
    }
});
