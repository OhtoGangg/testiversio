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
        GatewayIntentBits.MessageContent, // viestien kuuntelua varten
      ],
    });

    this.twitchAPI = new TwitchAPI();
    this.checkInterval = null;

    this.client.on('clientReady', () => {
      console.log(`✅ Logged in as ${this.client.user.tag}`);
      this.startStreamMonitoring();
    });

    // 🔹 Fallback (jos Discord.js-versio ei tue clientReady)
    this.client.on('ready', () => {
      console.log(`✅ Logged in as ${this.client.user.tag} (legacy ready-event)`);
      this.startStreamMonitoring();
    });

    // 💬 Komentojen käsittely
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return; // ei vastaa muille boteille

      const content = message.content.toLowerCase();

      if (content === 'paska botti') {
        await message.channel.send('Pidä turpas kiinni! Mulla on sun IP-osoite, en lähtis fronttaa...');
      }

      if (content === '!linked') {
        await message.channel.send('Linkitetyt jäsenet: ...');
      }

      if (content === '!status') {
        try {
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
    console.log(`🕐 Aloitetaan striimien seuranta (${intervalSeconds}s välein)...`);
    this.checkInterval = setInterval(() => this.checkAllStreamers(), intervalSeconds * 1000);
  }

  async checkAllStreamers() {
    console.log('🔍 Tarkistetaan striimaajat...');
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      console.log('⚠️ Ei löytynyt guildia (palvelinta)');
      return;
    }

    const watchedRoleId = storage.botSettings?.watchedRoleId;
    const liveRoleId = storage.botSettings?.liveRoleId;
    const announceChannelId = storage.botSettings?.announceChannelId;

    await guild.members.fetch();
    const members = guild.members.cache.filter(m => m.roles.cache.has(watchedRoleId));

    console.log(`👥 Tarkistetaan ${members.size} striimaajaa, joilla on STRIIMAAJA-rooli.`);

    for (const member of members.values()) {
      let streamer = storage.streamers[member.id];
      if (!streamer?.twitchUsername) {
        console.log(`⚠️ ${member.user.username} ei ole linkittänyt Twitch-nimeä.`);
        continue;
      }

      console.log(`🎯 Tarkistetaan ${streamer.twitchUsername} (${member.user.username}) Twitchissä...`);

      const streamData = await this.twitchAPI.getStreamData(streamer.twitchUsername);

      const isQualifyingStream = streamData &&
        streamData.game_name === 'Grand Theft Auto V' &&
        (streamData.title.toLowerCase().includes('rsrp') || streamData.title.toLowerCase().includes('#rsrp'));

      const isLive = !!isQualifyingStream;

      const liveRole = guild.roles.cache.get(liveRoleId);
      const announceChannel = guild.channels.cache.get(announceChannelId);

      if (isLive && !member.roles.cache.has(liveRoleId)) {
        console.log(`✅ ${member.user.username} on LIVE (RSRP + GTA V)`);
        await member.roles.add(liveRole);
        if (announceChannel) {
          const msg = await announceChannel.send(
            `${member.user.username} on nyt livenä! 🎥 https://twitch.tv/${streamer.twitchUsername}`
          );
          storage.liveMessages[member.id] = msg.id;
          storage.save();
        }
      } else if (!isLive && member.roles.cache.has(liveRoleId)) {
        console.log(`📴 ${member.user.username} ei ole enää livenä.`);
        await member.roles.remove(liveRole);
        if (announceChannel && storage.liveMessages[member.id]) {
          try {
            const msg = await announceChannel.messages.fetch(storage.liveMessages[member.id]);
            await msg.delete();
          } catch {}
          delete storage.liveMessages[member.id];
          storage.save();
        }
      } else {
        console.log(`⏸️ ${member.user.username} ei ole LIVE (tai ei täytä ehtoja).`);
      }
    }

    console.log('✅ Tarkistus valmis.\n');
  }
}
