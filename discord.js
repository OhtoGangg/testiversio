// Importataan tarvittavat kirjastot
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Luodaan uusi Discord asiakas
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Kun botti on valmis
client.once('ready', () => {
    console.log('Bot on käynnistynyt!');
});

// Reagoi viesteihin
client.on('messageCreate', message => {
    if (message.author.bot) return; // Älä reagoi omiin viesteihin

    // Esimerkki komento
    if (message.content === '!hello') {
        message.channel.send('Hei! Tämä on botin vastaus.');
    }
});

// Kirjaudu sisään tokenilla
client.login(process.env.DISCORD_TOKEN);
