import { Client, GatewayIntentBits, TextChannel, Role, GuildMember } from 'discord.js';
import { storage } from '../storage';
import { TwitchAPI } from './twitch-api';
import { type InsertBotSettings } from '@shared/schema';

export class DiscordBot {
  private client: Client;
  private twitchAPI: TwitchAPI;
  private isInitialized = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private applicationId: string;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.applicationId = process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_APP_ID || '';
    this.twitchAPI = new TwitchAPI();
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.on('ready', () => {
      console.log(`Discord bot logged in as ${this.client.user?.tag}`);
      this.isInitialized = true;
      this.startStreamMonitoring();
    });

    this.client.on('error', (error) => {
      console.error('Discord bot error:', error);
    });
  }

  async initialize(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_BOT_TOKEN not found in environment variables');
    }

    await this.client.login(token);
  }

  private async startStreamMonitoring() {
    const settings = await storage.getBotSettings();
    if (!settings || !settings.isActive) return;

    // Stop existing interval if any
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Start new monitoring cycle
    this.checkInterval = setInterval(
      () => this.checkAllStreamers(),
      (settings.checkIntervalSeconds || 60) * 1000
    );

    // Initial check
    await this.checkAllStreamers();
  }

  private async checkAllStreamers() {
    try {
      const settings = await storage.getBotSettings();
      if (!settings) return;

      const guild = this.client.guilds.cache.first();
      if (!guild) return;

      // Get members with STRIIMAAJA role
      const watchedRole = guild.roles.cache.find(role => 
        role.name === 'STRIIMAAJA' || role.id === settings.watchedRoleId
      );

      if (!watchedRole) {
        console.error('STRIIMAAJA role not found');
        return;
      }

      await guild.members.fetch(); // Ensure we have all members cached
      const membersWithRole = watchedRole.members;

      membersWithRole.forEach(async (member) => {
        await this.checkMemberStream(member, settings);
      });
    } catch (error) {
      console.error('Error checking streamers:', error);
    }
  }

  private async checkMemberStream(member: GuildMember, settings: any) {
    try {
      // Get or create streamer record
      let streamer = await storage.getStreamer(member.id);
      if (!streamer) {
        // Try to find Twitch username from member activities or custom status
        const twitchUsername = await this.findTwitchUsername(member);
        
        streamer = await storage.createStreamer({
          discordUserId: member.id,
          discordUsername: member.displayName || member.user.username,
          twitchUsername: twitchUsername,
          isLive: false,
          currentStreamTitle: null,
          currentViewers: 0,
          announcementMessageId: null,
        });
      }

      if (!streamer.twitchUsername) return;

      // Check current stream status
      const streamData = await this.twitchAPI.getStreamData(streamer.twitchUsername);
      const isQualifyingStream = streamData && 
        streamData.game_name === 'Grand Theft Auto V' &&
        streamData.title.toLowerCase().includes('rsrp');

      // Handle stream state changes
      if (isQualifyingStream && !streamer.isLive) {
        await this.handleStreamStart(member, streamer, streamData, settings);
      } else if (!isQualifyingStream && streamer.isLive) {
        await this.handleStreamEnd(member, streamer, settings);
      } else if (isQualifyingStream && streamer.isLive) {
        // Update stream info if still live
        await storage.updateStreamer(member.id, {
          currentStreamTitle: streamData.title,
          currentViewers: streamData.viewer_count,
        });
      }
    } catch (error) {
      console.error(`Error checking stream for ${member.displayName}:`, error);
    }
  }

  private async findTwitchUsername(member: GuildMember): Promise<string | null> {
    // Try to extract Twitch username from member's activities
    for (const activity of member.presence?.activities || []) {
      if (activity.name === 'Twitch' && activity.state) {
        return activity.state.replace('twitch.tv/', '');
      }
      if (activity.url && activity.url.includes('twitch.tv/')) {
        const match = activity.url.match(/twitch\.tv\/([^\/]+)/);
        return match ? match[1] : null;
      }
    }
    
    // If no Twitch activity found, use Discord username as fallback
    return member.user.username;
  }

  private async handleStreamStart(member: GuildMember, streamer: any, streamData: any, settings: any) {
    try {
      // Add LIVESSÄ role
      const liveRole = member.guild.roles.cache.find(role => 
        role.name === 'LIVESSÄ' || role.id === settings.liveRoleId
      );

      if (liveRole) {
        await member.roles.add(liveRole);
      }

      // Post announcement
      const announceChannel = member.guild.channels.cache.find(channel => 
        channel.name === 'mainostus' || channel.id === settings.announceChannelId
      ) as TextChannel;

      let announcementMessageId = null;
      if (announceChannel) {
        const message = await announceChannel.send({
          embeds: [{
            title: '🔴 LIVE: RSRP Stream!',
            description: `${streamer.discordUsername} aloitti livelähetyksen jota et halua missata, klikkaa tästä äkkiä!`,
            fields: [
              { name: 'Streami', value: streamData.title, inline: false },
              { name: 'Kategoria', value: streamData.game_name, inline: true },
              { name: 'Katsojia', value: streamData.viewer_count.toString(), inline: true },
            ],
            color: 0x9146FF, // Twitch purple
            thumbnail: { url: streamData.thumbnail_url?.replace('{width}', '320').replace('{height}', '180') },
            url: `https://twitch.tv/${streamer.twitchUsername}`,
            timestamp: new Date().toISOString(),
          }],
        });
        announcementMessageId = message.id;
      }

      // Update streamer status
      await storage.updateStreamer(member.id, {
        isLive: true,
        currentStreamTitle: streamData.title,
        currentViewers: streamData.viewer_count,
        announcementMessageId,
      });

      // Log activity
      await storage.createActivity({
        type: 'stream_start',
        streamerDiscordId: member.id,
        streamerUsername: streamer.discordUsername,
        description: `aloitti RSRP striimin: ${streamData.title}`,
      });

      console.log(`Stream started: ${streamer.discordUsername}`);
    } catch (error) {
      console.error(`Error handling stream start for ${streamer.discordUsername}:`, error);
    }
  }

  private async handleStreamEnd(member: GuildMember, streamer: any, settings: any) {
    try {
      // Remove LIVESSÄ role
      const liveRole = member.guild.roles.cache.find(role => 
        role.name === 'LIVESSÄ' || role.id === settings.liveRoleId
      );

      if (liveRole) {
        await member.roles.remove(liveRole);
      }

      // Delete announcement message if it exists
      if (streamer.announcementMessageId) {
        const announceChannel = member.guild.channels.cache.find(channel => 
          channel.name === 'mainostus' || channel.id === settings.announceChannelId
        ) as TextChannel;

        if (announceChannel) {
          try {
            const message = await announceChannel.messages.fetch(streamer.announcementMessageId);
            await message.delete();
          } catch (error) {
            console.error('Could not delete announcement message:', error);
          }
        }
      }

      // Update streamer status
      await storage.updateStreamer(member.id, {
        isLive: false,
        currentStreamTitle: null,
        currentViewers: 0,
        announcementMessageId: null,
      });

      // Log activity
      await storage.createActivity({
        type: 'stream_end',
        streamerDiscordId: member.id,
        streamerUsername: streamer.discordUsername,
        description: 'lopetti striimin',
      });

      console.log(`Stream ended: ${streamer.discordUsername}`);
    } catch (error) {
      console.error(`Error handling stream end for ${streamer.discordUsername}:`, error);
    }
  }

  async getStatus() {
    const settings = await storage.getBotSettings();
    return {
      isOnline: this.isInitialized && this.client.isReady(),
      isActive: settings?.isActive || false,
      guildCount: this.client.guilds.cache.size,
      uptime: this.client.uptime,
    };
  }

  async updateSettings(newSettings: InsertBotSettings) {
    await storage.updateBotSettings(newSettings);
    // Restart monitoring with new settings
    if (this.isInitialized) {
      this.startStreamMonitoring();
    }
  }
}

