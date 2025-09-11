// discord-bot.js
import { Client, GatewayIntentBits } from 'discord.js';
import { storage } from './storage.js';
import { TwitchAPI } from './twitch-api.js';

export class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Varmista, että tämä intent on käytössä
      ],
    });

    this.twitchAPI = new TwitchAPI();
    this.checkInterval = null;

    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}`);
      this.startStreamMonitoring();
    });

    // Lisätty komentoihin liittyvä kuuntelija
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return; // Älä vastaa botin omiin viesteihin

      const content = message.content.toLowerCase();

      if (content === '!linked') {
        // Tässä voit lisätä logiikan linkitettyjen jäsenien hakemiseen
        // Esimerkki: vastaa yksinkertaisesti
        await message.channel.send('Linkitetyt jäsenet: ...'); // Muokkaa haluamaksesi
      }

      if (content === '!status') {
        try {
          // Voit lisätä tarkastuksia tähän
          await message.channel.send('Kusipaskakännit vaan ja vetoja!');
        } catch (err) {
          await message.channel.send('Botti lähti lomalle, pärjätkää vitun näädät!');
        }
      }
    });
  }

  async initialize() {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('DISCORD_BOT_TOKEN puuttuu');
    await this.client.login(token);
  }

  startStreamMonitoring() {
    const intervalSeconds = storage.botSettings?.checkIntervalSeconds || 60;
    this.checkInterval = setInterval(() => this.checkAllStreamers(), intervalSeconds * 1000);
  }

  async checkAllStreamers() {
    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const watchedRoleId = storage.botSettings?.watchedRoleId;
    const liveRoleId = storage.botSettings?.liveRoleId;
    const announceChannelId = storage.botSettings?.announceChannelId;

    await guild.members.fetch();
    const members = guild.members.cache.filter(m => m.roles.cache.has(watchedRoleId));

    for (const member of members.values()) {
      let streamer = storage.streamers[member.id];
      if (!streamer?.twitchUsername) continue;

      const streamData = await this.twitchAPI.getStreamData(streamer.twitchUsername);

      // ✅ Tarkistus: GTA V + otsikko sisältää RSRP tai #RSRP
      const isQualifyingStream = streamData &&
        streamData.game_name === 'Grand Theft Auto V' &&
        (streamData.title.toLowerCase().includes('rsrp') || streamData.title.toLowerCase().includes('#rsrp'));

      const isLive = !!isQualifyingStream;

      const guildRoles = guild.roles.cache;
      const liveRole = guildRoles.get(liveRoleId);
      const announceChannel = guild.channels.cache.get(announceChannelId);

      if (isLive && !member.roles.cache.has(liveRoleId)) {
        await member.roles.add(liveRole);
        if (announceChannel) {
          const msg = await announceChannel.send(`${member.user.username} on nyt livenä! https://twitch.tv/${streamer.twitchUsername}`);
          storage.liveMessages[member.id] = msg.id;
          storage.save();
        }
      } else if (!isLive && member.roles.cache.has(liveRoleId)) {
        await member.roles.remove(liveRole);
        if (announceChannel && storage.liveMessages[member.id]) {
          try { 
            const msg = await announceChannel.messages.fetch(storage.liveMessages[member.id]);
            await msg.delete(); 
          } catch {}
          delete storage.liveMessages[member.id];
          storage.save();
        }
      }
    }
  }
}
