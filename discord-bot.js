import { Client, GatewayIntentBits } from 'discord.js';
import { storage } from './storage.js';
import { TwitchAPI } from './twitch-api.js';

export class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
      ]
    });
    this.twitchAPI = new TwitchAPI();
    this.checkInterval = null;

    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}`);
      this.startStreamMonitoring();
    });
  }

  async initialize() {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new Error('DISCORD_BOT_TOKEN puuttuu');
    await this.client.login(token);
  }

  startStreamMonitoring() {
    const intervalSeconds = storage.botSettings?.checkIntervalSeconds || 60;
    this.checkInterval = setInterval(() => this.checkAllStreamers(), intervalSeconds * 1000);
  }

  async checkAllStreamers() {
    const guild = this.client.guilds.cache.first();
    if (!guild) return;

    const watchedRoleId = storage.botSettings?.watchedRoleId;
    const liveRoleId = storage.botSettings?.liveRoleId;
    const announceChannelId = storage.botSettings?.announceChannelId;

    await guild.members.fetch();
    const members = guild.members.cache.filter(m => m.roles.cache.has(watchedRoleId));

    for (const member of members.values()) {
      const streamer = await storage.getStreamer(member.id);
      if (!streamer?.twitchUsername) continue;

      const streamData = await this.twitchAPI.getStreamData(streamer.twitchUsername);
      const isLive = !!streamData;

      const liveRole = guild.roles.cache.get(liveRoleId);
      const announceChannel = guild.channels.cache.get(announceChannelId);

      if (isLive && !member.roles.cache.has(liveRoleId)) {
        member.roles.add(liveRole);
        if (announceChannel) {
          const msg = await announceChannel.send(`${member.user.username} on nyt livenä! https://twitch.tv/${streamer.twitchUsername}`);
          storage.liveMessages[member.id] = msg.id;
        }
      } else if (!isLive && member.roles.cache.has(liveRoleId)) {
        member.roles.remove(liveRole);
        if (announceChannel && storage.liveMessages[member.id]) {
          try { await announceChannel.messages.fetch(storage.liveMessages[member.id]).then(m => m.delete()); } catch {}
          delete storage.liveMessages[member.id];
        }
      }
    }
  }
}
