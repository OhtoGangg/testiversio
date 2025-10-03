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

    // ✅ Uusi, oikea tapa Discord.js v15+
    this.client.once('clientReady', () => {
      console.log(`✅ Logged in as ${this.client.user.tag}`);
      this.startStreamMonitoring();
    });

    // 🔹 Varmuuden vuoksi legacy fallback (jos käytössä vanhempi versio)
    this.client.once('ready', () => {
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
        const linkedUsers = Object.entries(storage.streamers)
          .map(([id, data]) => `<@${id}> → ${data.twitchUsername || '❌ Ei linkitetty'}`)
          .join('\n') || 'Ei yhtään linkitettyä käyttäjää.';
        await message.channel.send(`🔗 **Linkitetyt jäsenet:**\n${linkedUsers}`);
      }

      if (content === '!status') {
        try {
          await message.channel.send('Kusipaskakännit vaan ja vetoja!');
        } catch (err) {
          await message.channel.send('Botti lähti lomalle, pärjätkää vitun näädät!');
        }
      }

      // 💡 Lisäys: mahdollistaa Twitch-linkityksen Discord-komennolla
      if (content.startsWith('!link ')) {
        const twitchName = content.split(' ')[1];
        if (!twitchName) return message.reply('⚠️ Anna Twitch-nimi! Käyttö: `!link twitchnimesi`');

        storage.streamers[message.author.id] = { twitchUsername: twitchName };
        storage.save();

        await message.reply(`✅ Twitch-nimi **${twitchName}** linkitetty onnistuneesti!`);
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
    console.log('\n🔍 Tarkistetaan striimaajat...');
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

    let liveCount = 0;
    let totalCount = members.size;

    for (const member of members.values()) {
      const streamer = storage.streamers[member.id];
      if (!streamer?.twitchUsername) {
        console.log(`⚠️ ${member.user.username} ei ole linkittänyt Twitch-nimeä.`);
        continue;
      }

      console.log(`🎯 Tarkistetaan ${member.user.username} (${streamer.twitchUsername}) Twitchissä...`);
      const streamData = await this.twitchAPI.getStreamData(streamer.twitchUsername);

      const isQualifyingStream =
        streamData &&
        streamData.game_name === 'Grand Theft Auto V' &&
        (streamData.title.toLowerCase().includes('rsrp') || streamData.title.toLowerCase().includes('#rsrp'));

      const isLive = !!isQualifyingStream;
      const liveRole = guild.roles.cache.get(liveRoleId);
      const announceChannel = guild.channels.cache.get(announceChannelId);

      if (isLive) {
        liveCount++;
        console.log(`✅ ${member.user.username} on LIVE (${streamData.title})`);
        if (!member.roles.cache.has(liveRoleId)) {
          await member.roles.add(liveRole);
          if (announceChannel) {
            const msg = await announceChannel.send(
              `🎥 **${member.user.username}** on nyt livenä!\n🔗 https://twitch.tv/${streamer.twitchUsername}`
            );
            storage.liveMessages[member.id] = msg.id;
            storage.save();
          }
        }
      } else {
        console.log(`📴 ${member.user.username} ei ole livenä.`);
        if (member.roles.cache.has(liveRoleId)) {
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

    console.log(`📊 Yhteenveto: ${liveCount}/${totalCount} striimaajaa livenä.`);
    console.log('✅ Tarkistus valmis.\n');
  }
}
