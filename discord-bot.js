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
      await this.client.guilds.cache.forEach(async guild => {
        await guild.members.fetch({ withPresences: true });
      });
      this.startStreamMonitoring();
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const content = message.content.toLowerCase();

      if (content === 'paska botti') await message.channel.send('Pidä turpas kiinni! 😤');
      if (content === '!status') await message.channel.send('Botti toimii ja tarkkailee striimejä! 👀');
    });

    this.client.on('guildMemberUpdate', async (oldMember, newMember) => {
      const watchedRoleId = storage.botSettings?.watchedRoleId;
      if (!watchedRoleId) return;

      if (!oldMember.roles.cache.has(watchedRoleId) && newMember.roles.cache.has(watchedRoleId)) {
        console.log(`🟢 ${newMember.user.username} sai STRIIMAAJA-roolin, tarkistetaan striimi heti...`);
        await this.checkMemberLiveStatus(newMember);
      }

      if (oldMember.roles.cache.has(watchedRoleId) && !newMember.roles.cache.has(watchedRoleId)) {
        console.log(`🔴 ${newMember.user.username} menetti STRIIMAAJA-roolin.`);
        const liveRoleId = storage.botSettings?.liveRoleId;
        if (newMember.roles.cache.has(liveRoleId)) {
          await newMember.roles.remove(liveRoleId);
          console.log(`📴 ${newMember.user.username} poistettu LIVESSÄ-roolista roolin poiston vuoksi.`);
        }
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
    const guild = this.client.guilds.cache.first();
    if (!guild) {
      console.log('⚠️ Ei löytynyt guildia');
      return;
    }

    const watchedRoleId = storage.botSettings?.watchedRoleId;
    const liveRoleId = storage.botSettings?.liveRoleId;

    if (!watchedRoleId) {
      console.log('⚠️ watchedRoleId ei ole asetettu storageen!');
      return;
    }

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
    const liveRoleId = storage.botSettings?.liveRoleId;
    const announceChannelId = storage.botSettings?.announceChannelId;
    const guild = member.guild;
    const announceChannel = guild.channels.cache.get(announceChannelId);

    const twitchActivity = member.presence?.activities.find(act => act.type === 1 && act.url?.includes('twitch.tv'));

    if (!twitchActivity) {
      console.log(`ℹ️ ${member.user.username} ei ole live-tilassa (twitch activitya ei havaittu).`);
      return;
    }

    const twitchUsername = twitchActivity.url.split('/').pop();
    console.log(`🎥 ${member.user.username} on livenä: ${twitchActivity.url}`);

    try {
      const streamData = await this.twitchAPI.getStreamData(twitchUsername);

      if (!streamData) {
        console.log(`⚠️ ${member.user.username}: Ei aktiivista striimiä Twitchissä.`);
        return;
      }

      const isQualifyingStream =
        streamData.game_name === 'Just Chatting' &&
        (streamData.title.toLowerCase().includes('VOI') || streamData.title.toLowerCase().includes('tähän'));

      if (isQualifyingStream && !member.roles.cache.has(liveRoleId)) {
        console.log(`✅ ${member.user.username} täyttää ehdot (Just Chatting + 🔴) → annetaan LIVESSÄ-rooli ja postataan mainos.`);
        await member.roles.add(liveRoleId);

        if (announceChannel) {
          const embed = new EmbedBuilder()
            .setColor('#9146FF')
            .setTitle(streamData.title)
            .setURL(`https://twitch.tv/${twitchUsername}`)
            .setAuthor({ name: `${member.user.username} on nyt livenä!`, iconURL: member.user.displayAvatarURL() })
            .setDescription(`🚨 ${member.user.username} aloitti livelähetyksen jota et halua missata!\n📽️ Klikkaa tästä: [Twitch-kanava](https://twitch.tv/${twitchUsername})`)
            .setThumbnail(member.user.displayAvatarURL())
            .setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720'))
            .setTimestamp();

          const msg = await announceChannel.send({ embeds: [embed] });
          storage.liveMessages[member.id] = msg.id;
          storage.save();
        }
      } else if (!isQualifyingStream && !member.roles.cache.has(liveRoleId)) {
        console.log(`🚫 ${member.user.username} on livenä, mutta striimi ei täytä ehtoja (ei Just Chatting tai ei 🔴).`);
      } else if (!streamData && member.roles.cache.has(liveRoleId)) {
        console.log(`📴 ${member.user.username} lopetti striimin.`);
        await member.roles.remove(liveRoleId);

        if (announceChannel && storage.liveMessages[member.id]) {
          try {
            const msg = await announceChannel.messages.fetch(storage.liveMessages[member.id]);
            await msg.delete();
          } catch (err) {
            console.log(`⚠️ Viestin poistaminen epäonnistui: ${err.message}`);
          }
          delete storage.liveMessages[member.id];
          storage.save();
        }
      }
    } catch (err) {
      console.log(`⚠️ Twitch API virhe ${member.user.username}: ${err.message}`);
    }
  }
}

// 🔹 Keep-alive ping Renderille 5 minuutin välein
const KEEP_ALIVE_URL = 'https://livebot-9vdn.onrender.com';
setInterval(async () => {
  try {
    await fetch(KEEP_ALIVE_URL);
    console.log('🟢 Keep-alive ping lähetetty Renderille');
  } catch (err) {
    console.log('⚠️ Keep-alive ping epäonnistui:', err.message);
  }
}, 1000 * 60 * 5); // 5 minuutin välein
