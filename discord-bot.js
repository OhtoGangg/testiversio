// discord-bot.js
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { storage } from './storage.js';
import { TwitchAPI } from './twitch-api.js';
import fetch from 'node-fetch';

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

    // 🔹 Lue .env-arvot
    this.hostRoleId = process.env.JUONTAJA_ROLE_ID;
    this.contentCreatorRoleId = process.env.SISALLONTUOTTAJA_ROLE_ID;
    this.liveRoleId = process.env.LIVE_ROLE_ID;
    this.hostAnnounceChannelId = process.env.ILMOITUKSET_CHANNEL_ID;
    this.contentAnnounceChannelId = process.env.MAINOSTUS_CHANNEL_ID;
    this.checkIntervalSeconds = parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10);

    this.client.on('ready', async () => {
      console.log(`✅ Kirjauduttu sisään nimellä ${this.client.user.tag}`);
      for (const guild of this.client.guilds.cache.values()) {
        await guild.members.fetch({ withPresences: true });
      }
      this.startStreamMonitoring();
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const content = message.content.toLowerCase();
      if (content === '!status') {
        await message.channel.send('🟢 Botti toimii ja tarkkailee striimejä!');
      }
    });
  }

  async initialize() {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('❌ DISCORD_BOT_TOKEN puuttuu .env-tiedostosta');
    await this.client.login(token);
  }

  startStreamMonitoring() {
    console.log(`🕐 Aloitetaan striimien seuranta (${this.checkIntervalSeconds}s välein)...`);
    this.checkInterval = setInterval(() => this.checkAllStreamers(), this.checkIntervalSeconds * 1000);
  }

  async checkAllStreamers() {
    const guild = this.client.guilds.cache.first();
    if (!guild) return console.log('⚠️ Ei löytynyt guildia.');

    await guild.members.fetch({ withPresences: true });

    const members = guild.members.cache.filter(m =>
      m.roles.cache.has(this.hostRoleId) || m.roles.cache.has(this.contentCreatorRoleId)
    );

    let liveCount = 0;
    for (const member of members.values()) {
      const isLive = await this.checkMemberLiveStatus(member);
      if (isLive) liveCount++;
    }

    console.log(`📊 Tarkistettu ${members.size} jäsentä → ${liveCount} live-tilassa.\n`);
  }

  async checkMemberLiveStatus(member) {
    const guild = member.guild;
    const hostChannel = guild.channels.cache.get(this.hostAnnounceChannelId);
    const contentChannel = guild.channels.cache.get(this.contentAnnounceChannelId);
    const presence = member.presence;

    if (!presence || !presence.activities?.length) {
      await this.removeLiveRole(member, hostChannel, contentChannel);
      return false;
    }

    const twitchActivity = presence.activities.find(
      act => act.type === 1 && act.url?.includes('twitch.tv')
    );
    if (!twitchActivity) {
      await this.removeLiveRole(member, hostChannel, contentChannel);
      return false;
    }

    const twitchUsername =
      twitchActivity.url.split('/').pop()?.toLowerCase() || member.user.username.toLowerCase();

    try {
      const streamData = await this.twitchAPI.getStreamData(twitchUsername);
      if (!streamData) return false;

      const isHost = member.roles.cache.has(this.hostRoleId);
      const isContentCreator = member.roles.cache.has(this.contentCreatorRoleId);

      if (isHost) {
        await this.handleLivePost(member, twitchUsername, streamData, hostChannel, 'JUONTAJA');
      } else if (isContentCreator) {
        await this.handleLivePost(member, twitchUsername, streamData, contentChannel, 'SISÄLLÖNTUOTTAJA');
      }

      return true;
    } catch (err) {
      console.log(`⚠️ Twitch API virhe käyttäjälle ${member.user.tag}: ${err.message}`);
      return false;
    }
  }

  async handleLivePost(member, twitchUsername, streamData, announceChannel, type) {
    if (!announceChannel) {
      console.log(`⚠️ ${type}-kanavaa ei löytynyt!`);
      return;
    }
    if (member.roles.cache.has(this.liveRoleId)) return;

    await member.roles.add(this.liveRoleId);
    console.log(`✅ ${type} ${member.user.username} meni liveen!`);

    if (type === 'JUONTAJA') {
      await announceChannel.send(
        `@everyone JUONTAJA PISTI LIVET TULILLE! 🔥\n📽️ https://twitch.tv/${twitchUsername}`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(type === 'JUONTAJA' ? '#ff0050' : '#9146FF')
      .setTitle(type === 'JUONTAJA' ? streamData.title : 'LIVE JOTA ET HALUA MISSATA:')
      .setAuthor({ name: twitchUsername, iconURL: member.user.displayAvatarURL() })
      .setDescription(type === 'SISÄLLÖNTUOTTAJA' ? streamData.title : '')
      .setURL(`https://twitch.tv/${twitchUsername}`)
      .setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
      .setTimestamp();

    const msg = await announceChannel.send({ embeds: [embed] });
    storage.liveMessages[member.id] = msg.id;
    storage.save();

    // 📢 Lisätty lokitus
    console.log(`📢 Lähetettiin ilmoitus ${type}-kanavalle (${announceChannel.name}) käyttäjältä ${member.user.username}`);
  }

  async removeLiveRole(member, hostChannel, contentChannel) {
    if (!member.roles.cache.has(this.liveRoleId)) return;

    await member.roles.remove(this.liveRoleId);
    console.log(`📴 ${member.user.tag} lopetti striimin → live-rooli poistettu.`);

    const channels = [hostChannel, contentChannel];
    for (const channel of channels) {
      if (channel && storage.liveMessages[member.id]) {
        try {
          const msg = await channel.messages.fetch(storage.liveMessages[member.id]);
          await msg.delete();
        } catch {}
      }
    }

    delete storage.liveMessages[member.id];
    storage.save();
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
