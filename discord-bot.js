// discord-bot.js
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { storage } from './storage.js';
import { TwitchAPI } from './twitch-api.js';

export class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.twitchAPI = new TwitchAPI();
    this.checkInterval = null;

    this.client.on('ready', () => {
      console.log(`✅ Logged in as ${this.client.user.tag}`);
      this.startStreamMonitoring();
    });

    // 💬 Komennot
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      const content = message.content.toLowerCase();

      if (content === 'paska botti') {
        await message.channel.send('Pidä turpas kiinni! 😤');
      }

      if (content === '!linked') {
        await message.channel.send('Linkitetyt jäsenet: ...');
      }

      if (content === '!status') {
        await message.channel.send('Botti toimii ja tarkkailee striimejä! 👀');
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
      console.log('⚠️ Ei löytynyt guildia');
      return;
    }

    const watchedRoleId = storage.botSettings?.watchedRoleId;
    const liveRoleId = storage.botSettings?.liveRoleId;
    const announceChannelId = storage.botSettings?.announceChannelId;

    await guild.members.fetch();
    const members = guild.members.cache.filter(m => m.roles.cache.has(watchedRoleId));
    console.log(`👥 Tarkistetaan ${members.size} striimaajaa, joilla on STRIIMAAJA-rooli.`);

    for (const member of members.values()) {
      const streamer = storage.streamers[member.id];
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
      const announceChannel = guild.channels.cache.get(announceChannelId);

      // Jos käyttäjä on livenä (ja täyttää ehdot)
      if (isLive && !member.roles.cache.has(liveRoleId)) {
        console.log(`✅ ${member.user.username} on LIVE (RSRP + GTA V)`);

        await member.roles.add(liveRoleId);

        // Luo embed Twitch-viesti
        const embed = new EmbedBuilder()
          .setColor('#9146FF')
          .setTitle(`${streamData.title}`)
          .setURL(`https://twitch.tv/${streamer.twitchUsername}`)
          .setAuthor({ name: `${member.user.username} on nyt livenä!`, iconURL: member.user.displayAvatarURL() })
          .setDescription(`🚨 ${member.user.username} aloitti livelähetyksen jota et halua missata!\n📽️ Klikkaa tästä: [Twitch-kanava](https://twitch.tv/${streamer.twitchUsername})`)
          .setThumbnail(member.user.displayAvatarURL())
          .setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
          .setTimestamp()
          .setFooter({ text: 'RSRP Live-seuranta 🔴' });

        const msg = await announceChannel.send({ embeds: [embed] });
        storage.liveMessages[member.id] = msg.id;
        storage.save();
      }

      // Jos käyttäjä ei enää ole livenä
      else if (!isLive && member.roles.cache.has(liveRoleId)) {
        console.log(`📴 ${member.user.username} ei ole enää livenä.`);
        await member.roles.remove(liveRoleId);

        // Poistetaan aiempi viesti
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
