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

    // Lue .env-arvot
    this.hostRoleId = process.env.HOST_ROLE_ID; // JUONTAJA-rooli
    this.contentCreatorRoleId = process.env.SISALLONTUOTTAJA_ROLE_ID; // SISÄLLÖNTUOTTAJA-rooli
    this.liveRoleId = process.env.LIVE_ROLE_ID;
    this.ilmoituksetChannelId = process.env.ILMOITUKSET_CHANNEL_ID; // JUONTAJILLE
    this.mainostusChannelId = process.env.MAINOSTUS_CHANNEL_ID; // SISÄLLÖNTUOTTAJILLE
    this.checkIntervalSeconds = parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10);

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
  const intervalSeconds = 10; // Kovakoodattu 10 sekuntia
  console.log(`🕐 Aloitetaan striimien seuranta (${intervalSeconds}s välein)...`);
  this.checkInterval = setInterval(() => this.checkAllStreamers(), intervalSeconds * 1000);
  }

  async checkAllStreamers() {
    const guild = this.client.guilds.cache.first();
    if (!guild) return console.log('⚠️ Ei löytynyt guildia');

    await guild.members.fetch({ withPresences: true });

    const members = guild.members.cache.filter(m =>
      m.roles.cache.has(this.hostRoleId) || m.roles.cache.has(this.contentCreatorRoleId)
    );

    let liveCount = 0;
    for (const member of members.values()) {
      const isLive = await this.checkMemberLiveStatus(member);
      if (isLive) liveCount++;
    }

    console.log(`📊 Nyt livenä: ${liveCount} / ${members.size} tarkkailtavaa.`);
    console.log('✅ Tarkistus valmis.\n');
  }

  async checkMemberLiveStatus(member) {
    const guild = member.guild;
    const ilmoituksetChannel = guild.channels.cache.get(this.ilmoituksetChannelId);
    const mainostusChannel = guild.channels.cache.get(this.mainostusChannelId);
    const presence = member.presence;

    if (!presence || !presence.activities?.length) {
      await this.removeLiveRole(member, ilmoituksetChannel, mainostusChannel);
      return false;
    }

    const twitchActivity = presence.activities.find(act => act.type === 1 && act.url?.includes('twitch.tv'));
    if (!twitchActivity) {
      await this.removeLiveRole(member, ilmoituksetChannel, mainostusChannel);
      return false;
    }

    const twitchUsername = twitchActivity.url.split('/').pop()?.toLowerCase() || member.user.username.toLowerCase();

    try {
      const streamData = await this.twitchAPI.getStreamData(twitchUsername);
      if (!streamData) return false;

      const isHost = member.roles.cache.has(this.hostRoleId);
      const isContentCreator = member.roles.cache.has(this.contentCreatorRoleId);

      if (isHost) {
        console.log(`🎯 LIVE: JUONTAJA ${member.user.tag}`);
        await this.handleLivePost(member, twitchUsername, streamData, ilmoituksetChannel, 'JUONTAJA');
      } else if (isContentCreator) {
        console.log(`🎯 LIVE: SISÄLLÖNTUOTTAJA ${member.user.tag}`);
        await this.handleLivePost(member, twitchUsername, streamData, mainostusChannel, 'SISÄLLÖNTUOTTAJA');
      }

      return true;
    } catch (err) {
      console.log(`⚠️ Twitch API virhe ${member.user.tag}: ${err.message}`);
      return false;
    }
  }

  async handleLivePost(member, twitchUsername, streamData, announceChannel, type) {
    if (!announceChannel) return;
    if (member.roles.cache.has(this.liveRoleId)) return;

    await member.roles.add(this.liveRoleId);
    console.log(`✅ ${type} ${member.user.username} meni liveen!`);

    // Viesti-tekstit roolikohtaisesti
    let messageText;
    if (type === 'JUONTAJA') {
      messageText = `@everyone JUONTAJA PISTI LIVET TULILLE! 🔥\n📽️ https://twitch.tv/${twitchUsername}`;
    } else {
      messageText = `🚨 <@${member.id}> aloitti livelähetyksen jota et halua missata!\n📽️ https://twitch.tv/${twitchUsername}`;
    }

    await announceChannel.send(messageText);

    const embed = new EmbedBuilder()
      .setColor(type === 'JUONTAJA' ? '#ff0050' : '#9146FF')
      .setAuthor({ name: `${member.user.username} on nyt LIVE!`, iconURL: member.user.displayAvatarURL() })
      .setTitle(streamData.title)
      .setURL(`https://twitch.tv/${twitchUsername}`)
      .setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
      .setTimestamp();

    const msg = await announceChannel.send({ embeds: [embed] });
    storage.liveMessages[member.id] = msg.id;
    storage.save();
  }

  async removeLiveRole(member, ilmoituksetChannel, mainostusChannel) {
    if (!member.roles.cache.has(this.liveRoleId)) return;

    await member.roles.remove(this.liveRoleId);
    console.log(`📴 ${member.user.tag} lopetti striimin → live-rooli poistettu.`);

    const channels = [ilmoituksetChannel, mainostusChannel];
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
