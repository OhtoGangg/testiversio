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

    await guild.members.fetch({ withPresences: true });

    const members = guild.members.cache.filter(m =>
      m.roles.cache.has(storage.botSettings.hostRoleId) ||
      m.roles.cache.has('SISALLONTUOTTAJA_ROLE_ID')
    );

    console.log(`👥 Tarkkailtavia striimaajia: ${members.size}`);
    console.log('👤 Jäsenet:', members.map(m => m.user.username).join(', '));

    let liveCount = 0;
    for (const member of members.values()) {
      await this.checkMemberLiveStatus(member);
      if (member.roles.cache.has(storage.botSettings.liveRoleId)) liveCount++;
    }

    console.log(`📊 Nyt livenä: ${liveCount} / ${members.size} tarkkailtavaa.`);
    console.log('✅ Tarkistus valmis.\n');
  }

  async checkMemberLiveStatus(member) {
    const { liveRoleId, hostRoleId } = storage.botSettings;
    const guild = member.guild;

    const hostAnnounceChannel = guild.channels.cache.get('1026638924870856724'); // juontaja
    const contentAnnounceChannel = guild.channels.cache.get('1064874379399409664'); // sisällöntuottaja

    const presence = member.presence;

    if (!presence || !presence.activities?.length) {
      console.log(`Ei presencea tai aktiviteetteja: ${member.user.tag}`);
      await this.removeLiveRole(member, liveRoleId, hostAnnounceChannel, contentAnnounceChannel);
      return;
    }

    console.log(`🎯 Presence-aktiviteetit käyttäjälle ${member.user.tag}:`);
    for (const act of presence.activities) {
      console.log(`- Tyyppi: ${act.type}, Nimi: ${act.name}, URL: ${act.url || 'ei urlia'}, State: ${act.state || 'ei statea'}`);
    }

    const twitchActivity = presence.activities.find(act => act.type === 1 && act.url?.includes('twitch.tv'));

    if (!twitchActivity) {
      console.log(`${member.user.tag} ei ole live Twitchissä.`);
      await this.removeLiveRole(member, liveRoleId, hostAnnounceChannel, contentAnnounceChannel);
      return;
    }

    const twitchUsername = twitchActivity.url.split('/').pop()?.toLowerCase() || member.user.username.toLowerCase();

    try {
      const streamData = await this.twitchAPI.getStreamData(twitchUsername);
      if (!streamData) {
        console.log(`⚠️ ${member.user.tag}: Ei aktiivista striimiä Twitchissä.`);
        return;
      }

      const isHost = member.roles.cache.has(hostRoleId);
      const isContentCreator = member.roles.cache.has('SISALLONTUOTTAJA_ROLE_ID');

      if (isHost) {
        await this.handleLivePost(member, twitchUsername, streamData, hostAnnounceChannel, liveRoleId, 'JUONTAJA');
      } else if (isContentCreator) {
        await this.handleLivePost(member, twitchUsername, streamData, contentAnnounceChannel, liveRoleId, 'SISÄLLÖNTUOTTAJA');
      }
    } catch (err) {
      console.log(`⚠️ Twitch API virhe ${member.user.tag}: ${err.message}`);
    }
  }

  async handleLivePost(member, twitchUsername, streamData, announceChannel, liveRoleId, type) {
    if (!announceChannel) return;

    if (!member.roles.cache.has(liveRoleId)) {
      await member.roles.add(liveRoleId);
      console.log(`✅ ${type} ${member.user.username} meni liveen!`);

      const rolePing = type === 'JUONTAJA'
        ? '@everyone JUONTAJA PISTI LIVET TULILLE! 🔥'
        : `🚨 ${member.user.username} aloitti livelähetyksen jota et halua missata!`;

      await announceChannel.send(`${rolePing}\n📽️ https://twitch.tv/${twitchUsername}`);

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
  }

  async removeLiveRole(member, liveRoleId, hostAnnounceChannel, contentAnnounceChannel) {
    if (!member.roles.cache.has(liveRoleId)) return;

    await member.roles.remove(liveRoleId);
    console.log(`📴 ${member.user.tag} lopetti striimin → live-rooli poistettu.`);

    const channels = [hostAnnounceChannel, contentAnnounceChannel];
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
}, 1000 * 60 * 5); // 5 minuutin välein
