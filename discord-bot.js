// discord-bot.js
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { storage } from './storage.js';
import { TwitchAPI } from './twitch-api.js';
import fetch from 'node-fetch'; // Keep-alive pingille

export class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
      ],
    });

    this.twitchAPI = new TwitchAPI();
    this.checkInterval = null;

    this.client.on('ready', async () => {
      console.log(`✅ Logged in as ${this.client.user.tag}`);
      for (const guild of this.client.guilds.cache.values()) {
        await guild.members.fetch({ withPresences: true });
      }
      this.startStreamMonitoring();
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const content = message.content.toLowerCase();

      if (content === 'paska botti') await message.channel.send('Pidä turpas kiinni! 😤');
      if (content === '!status') await message.channel.send('Botti toimii ja tarkkailee striimejä! 👀');
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
    const guild = this.client.guilds.cache.first();
    if (!guild) return console.log('⚠️ Ei löytynyt guildia');

    const watchedRoleId = storage.botSettings?.watchedRoleId;
    const liveRoleId = storage.botSettings?.liveRoleId;

    if (!watchedRoleId) return console.log('⚠️ watchedRoleId ei ole asetettu storageen!');

    await guild.members.fetch({ withPresences: true });
    const members = guild.members.cache.filter(m => m.roles.cache.has(watchedRoleId));

    console.log(`👥 STRIIMAAJA-roolissa jäseniä: ${members.size}`);
    console.log('👤 Jäsenet:', members.map(m => m.user.username).join(', '));

    let liveCount = 0;
    for (const member of members.values()) {
      await this.checkMemberLiveStatus(member);
      if (member.roles.cache.has(liveRoleId)) liveCount++;
    }

    console.log(`📊 Nyt livenä: ${liveCount} / ${members.size} striimaajaa.`);
    console.log('✅ Tarkistus valmis.\n');
  }

  async checkMemberLiveStatus(member) {
    const { liveRoleId, announceChannelId, hostRoleId, hostAnnounceChannelId } = storage.botSettings;
    const guild = member.guild;
    const announceChannel = guild.channels.cache.get(announceChannelId);
    const hostAnnounceChannel = guild.channels.cache.get(hostAnnounceChannelId);
    const presence = member.presence;

    if (!presence || !presence.activities.length) return;

    // Etsi Twitch-aktiviteetti
    const twitchActivity = presence.activities.find(
      act => act.type === 1 && act.url?.includes('twitch.tv')
    );

    if (!twitchActivity) return;

    const twitchUsername = twitchActivity.url?.split('/').pop()?.toLowerCase();
    const streamData = await this.twitchAPI.getStreamData(twitchUsername);

    if (!streamData) return;

    const isHost = member.roles.cache.has(hostRoleId);

    // 🔹 Jos kyseessä on JUONTAJA
    if (isHost) {
      if (!member.roles.cache.has(liveRoleId)) {
        await member.roles.add(liveRoleId);
        console.log(`🎙️ JUONTAJA ${member.user.username} meni liveen!`);

        if (hostAnnounceChannel) {
          // Lähetetään ensin teksti
          await hostAnnounceChannel.send(
            `@everyone JUONTAJA PISTI LIVET TULILLE! LUVASSA TAJUNNAN RÄJÄYTTÄVÄT SETIT!\nhttps://twitch.tv/${twitchUsername}`
          );

          // Lähetetään erikseen embed
          const embed = new EmbedBuilder()
            .setColor('#ff0050')
            .setAuthor({ name: `${member.user.username} on nyt LIVE!`, iconURL: member.user.displayAvatarURL() })
            .setTitle(streamData.title)
            .setURL(`https://twitch.tv/${twitchUsername}`)
            .setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
            .setTimestamp();

          const msg = await hostAnnounceChannel.send({ embeds: [embed] });
          storage.liveMessages[member.id] = msg.id;
          storage.save();
        }
      }
      return; // Ei tarvita muuta logiikkaa juontajalle
    }

    // 🔹 Muut striimaajat (RSRP + GTA V -ehdot)
    const isQualifyingStream =
      streamData.game_name === 'Grand Theft Auto V' &&
      (streamData.title.toLowerCase().includes('rsrp') ||
        streamData.title.toLowerCase().includes('#rsrp'));

    if (isQualifyingStream && !member.roles.cache.has(liveRoleId)) {
      await member.roles.add(liveRoleId);
      console.log(`✅ ${member.user.username} meni liveen ja täytti ehdot.`);

      if (announceChannel) {
        await announceChannel.send(
          `@everyone 🚨 ${member.user.username} aloitti livelähetyksen jota et halua missata!\n📽️ https://twitch.tv/${twitchUsername}`
        );

        const embed = new EmbedBuilder()
          .setColor('#9146FF')
          .setAuthor({ name: `${member.user.username} on nyt LIVE!`, iconURL: member.user.displayAvatarURL() })
          .setTitle(streamData.title)
          .setURL(`https://twitch.tv/${twitchUsername}`)
          .setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
          .setTimestamp();

        const msg = await announceChannel.send({ embeds: [embed] });
        storage.liveMessages[member.id] = msg.id;
        storage.save();
      }
    }

    // 🔹 Lopetti streamin
    if (!isQualifyingStream && member.roles.cache.has(liveRoleId)) {
      console.log(`📴 ${member.user.username} lopetti striimin.`);
      await member.roles.remove(liveRoleId);
      delete storage.liveMessages[member.id];
      storage.save();
    }
  }
}

// 🔹 Keep-alive ping Renderille
const KEEP_ALIVE_URL = 'https://livebot-9vdn.onrender.com';
setInterval(async () => {
  try {
    await fetch(KEEP_ALIVE_URL);
    console.log('🟢 Keep-alive ping lähetetty Renderille');
  } catch (err) {
    console.log('⚠️ Keep-alive ping epäonnistui:', err.message);
  }
}, 1000 * 60 * 5);
