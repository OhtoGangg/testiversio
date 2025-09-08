import { Client, GatewayIntentBits, TextChannel, GuildMember } from 'discord.js';
import { storage } from './storage';
import { TwitchAPI } from './twitch-api';

type InsertBotSettings = {
  isActive?: boolean;
  checkIntervalSeconds?: number;
  watchedRoleId?: string;
  liveRoleId?: string;
  announceChannelId?: string;
};

export class DiscordBot {
  private client: Client;
  private twitchAPI: TwitchAPI;
  private isInitialized = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.twitchAPI = new TwitchAPI();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.on('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      this.isInitialized = true;
      this.startStreamMonitoring();
    });

    this.client.on('error', (error) => console.error('Discord bot error:', error));
  }

  async initialize(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('DISCORD_BOT_TOKEN not set');
    await this.client.login(token);
  }

  private async startStreamMonitoring() {
    const settings = await storage.getBotSettings();
    if (!settings?.isActive) return;

    if (this.checkInterval) clearInterval(this.checkInterval);

    this.checkInterval = setInterval(
      () => this.checkAllStreamers(),
      (settings.checkIntervalSeconds || 60) * 1000
    );

    await this.checkAllStreamers();
  }

  private async checkAllStreamers() {
    const settings = await storage.getBotSettings();
    if (!settings) return;

    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const watchedRole = guild.roles.cache.find(role => role.id === settings.watchedRoleId);
    if (!watchedRole) return console.error('STRIIMAAJA role not found');

    await guild.members.fetch();
    watchedRole.members.forEach(member => this.checkMemberStream(member, settings));
  }

  private async checkMemberStream(member: GuildMember, settings: InsertBotSettings) {
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

    if (isLive && !streamer.isLive) {
      await this.handleStreamStart(member, streamer, streamData, settings);
    } else if (!isLive && streamer.isLive) {
      await this.handleStreamEnd(member, streamer, settings);
    } else if (isLive && streamer.isLive) {
      await storage.updateStreamer(member.id, {
        currentStreamTitle: streamData!.title,
        currentViewers: streamData!.viewer_count,
      });
    }
  }

  private async handleStreamStart(member: GuildMember, streamer: any, streamData: any, settings: InsertBotSettings) {
    const liveRole = member.guild.roles.cache.find(r => r.id === settings.liveRoleId);
    if (liveRole) await member.roles.add(liveRole);

    const announceChannel = member.guild.channels.cache.find(c => c.id === settings.announceChannelId) as TextChannel;
    let msgId = null;
    if (announceChannel) {
      const message = await announceChannel.send({
        content: `🔴 ${streamer.discordUsername} on nyt livenä! https://twitch.tv/${streamer.twitchUsername}`
      });
      msgId = message.id;
    }

    await storage.updateStreamer(member.id, {
      isLive: true,
      currentStreamTitle: streamData.title,
      currentViewers: streamData.viewer_count,
      announcementMessageId: msgId
    });
  }

  private async handleStre
