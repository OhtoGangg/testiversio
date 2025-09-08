import fs from 'fs';
import path from 'path';

const storageFile = path.join(__dirname, 'storage.json');

interface BotSettings {
  isActive: boolean;
  checkIntervalSeconds: number;
  watchedRoleId: string;
  liveRoleId: string;
  announceChannelId: string;
}

interface Streamer {
  discordUserId: string;
  discordUsername: string;
  twitchUsername: string;
  isLive: boolean;
  currentStreamTitle: string | null;
  currentViewers: number;
  announcementMessageId: string | null;
}

interface StorageData {
  streamers: Record<string, Streamer>;
  botSettings: BotSettings;
}

let data: StorageData = {
  streamers: {},
  botSettings: {
    isActive: true,
    checkIntervalSeconds: 60,
    watchedRoleId: process.env.STRIIMAAJA_ROLE_ID || '',
    liveRoleId: process.env.LIVE_ROLE_ID || '',
    announceChannelId: process.env.MAINOSTUS_CHANNEL_ID || '',
  },
};

// Lue olemassa oleva tiedosto jos löytyy
try {
  if (fs.existsSync(storageFile)) {
    const fileData = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
    data = { ...data, ...fileData };
  } else {
    // Luo tiedosto ensimmäistä kertaa
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
  }
} catch (err) {
  console.error('Error reading storage file:', err);
}

// ==========================
// Exported storage functions
// ==========================
export const storage = {
  getBotSettings: async (): Promise<BotSettings> => {
    return data.botSettings;
  },
  updateBotSettings: async (newSettings: Partial<BotSettings>) => {
    data.botSettings = { ...data.botSettings, ...newSettings };
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
  },
  getStreamer: async (discordUserId: string): Promise<Streamer | null> => {
    return data.streamers[discordUserId] || null;
  },
  createStreamer: async (streamer: Streamer) => {
    data.streamers[streamer.discordUserId] = streamer;
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
    return streamer;
  },
  updateStreamer: async (discordUserId: string, updates: Partial<Streamer>) => {
    const streamer = data.streamers[discordUserId];
    if (!streamer) return;
    data.streamers[discordUserId] = { ...streamer, ...updates };
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
  },
  createActivity: async (activity: any) => {
    // Tämä voi vain logata tai tallentaa myöhemmin
    console.log('Activity:', activity);
  },
};
