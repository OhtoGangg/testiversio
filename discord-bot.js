const { Client, GatewayIntentBits } = require('discord.js');
const { storage } = require('./storage');
const { TwitchAPI } = require('./twitch-api');

class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
      ]
    });

    this.twitchAPI = new TwitchAPI();
    this.isInitialized = false;
    this.checkInterval = null;

    this.client.on('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user.tag}`);
      this.isInitialized = true;
      this.startStreamMonitoring();
    });

    this.client.on('error', (error) => console.error('Discord bot error:', error));
  }

  async initialize() {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('DISCORD_BOT_TOKEN not set');
    await this.client.login(token);
  }

  async startStreamMonitoring() {
    const settings = await storage.getBotSettings();
    if (!settings?.isActive) return;

    if (this.checkInterval) clearInterval(this.checkInterval);

    this.checkInterval = setInterval(() => this.checkAllStreamers(), (settings.checkIntervalSeconds || 60) * 1000);
    await this.checkAllStreamers();
  }

  async checkAllStreamers() {
    const settings = await storage.getBotSettings();
    if (!settings) return;

    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const watchedRole = guild.roles.cache.find(r => r.id === settings.watchedRoleId);
    if (!watchedRole) return console.error('STRIIMAAJA role not found');

    await guild.members.fetch();
    watchedRole.members.forEach(member => this.checkMemberStream(member, settings));
  }

  async checkMemberStream(member, settings) {
    let streamer = await storage.getStreamer(member.id);
    if (!streamer) {
      streamer = await storage.createStreamer({
        discordUserId: member.id,
        discordUsername: member.displayName,
        twitchUsername: member.user.username,
        isLive: false,
        currentStreamTitle: null,
        currentViewers: 0,
        announcementMessageId: null
      });
    }

    if (!streamer.twitchUsername) return;

    const streamData = await this.twitchAPI.getStreamData(streamer.twitchUsername);
    const isLive = !!streamData;

    if (isLive && !streamer.isLive) await this.handleStreamStart(member, streamer, streamData, settings);
    else if (!isLive && streamer.isLive) await this.handleStreamEnd(member, streamer, settings);
    else if (isLive && streamer.isLive) {
      await storage.updateStreamer(member.id, {
        currentStreamTitle: streamData.title,
        currentViewers: streamData.viewer_count
      });
    }
  }

  async handleStreamStart(member, streamer, streamData, settings) {
    const liveRole = member.guild.roles.cache.find(r => r.id === settings.liveRoleId);
    if (liveRole) await member.roles.add(liveRole);

    const announceChannel = member.guild.channels.cache.find(c => c.id === settings.announceChannelId);
    let msgId = null;
    if (announceChannel) {
      const message = await announceChannel.send(`🔴 ${streamer.discordUsername} on nyt livenä! https://twitch.tv/${streamer.twitchUsername}`);
      msgId = message.id;
    }

    await storage.updateStreamer(member.id, {
      isLive: true,
      currentStreamTitle: streamData.title,
      currentViewers: streamData.viewer_count,
      announcementMessageId: msgId
    });
  }

  async handleStreamEnd(member, streamer, settings) {
    const liveRole = member.guild.roles.cache.find(r => r.id === settings.liveRoleId);
    if (liveRole) await member.roles.remove(liveRole);

    if (streamer.announcementMessageId) {
      const channel = member.guild.channels.cache.find(c => c.id === settings.announceChannelId);
      if (channel) {
        try {
          const message = await channel.messages.fetch(streamer.announcementMessageId);
          await message.delete();
        } catch {}
      }
    }

    await storage.updateStreamer(member.id, {
      isLive: false,
      currentStreamTitle: null,
      currentViewers: 0,
      announcementMessageId: null
    });
  }
}

module.exports = { DiscordBot };
