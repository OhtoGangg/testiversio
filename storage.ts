import fs from 'fs';
import path from 'path';

const FILE_PATH = path.resolve(__dirname, 'storage.json');

interface Streamer {
  discordUserId: string;
  discordUsername: string;
  twitchUsername: string;
  isLive: boolean;
  currentStreamTitle: string | null;
  currentViewers: number;
  announcementMessageId: string | null;
}

interface BotSettings {
  isActive: boolean;
  checkIntervalSeconds: number;
  watchedRoleId: string;
  liveRoleId: string;
  announceChannelId: string;
}

// Lataa data JSON-tiedostosta tai luo tyhjä
let data: {
  streamers: Record<string, Streamer>;
  botSettings: BotSettings;
} = {
  streamers: {},
  botSettings: {
    isActive: true,
    checkIntervalSeconds: 60,
    watchedRoleId: process.env.STRIIMAAJA_ROLE_ID || '',
    liveRoleId: process.env.LIVE_ROLE_ID || '',
    announceChannelId: process.env.MAINOSTUS_CHANNEL_ID || '',
  },
};

try {
  if (fs.existsSync(FILE_PATH)) {
    data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  }
} catch (err) {
  console.error('Error loading storage.json:', err);
}

// Apufunktio tallennukseen
function save() {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

export const storage = {
  // Streamerit
  getStreamer: async (id: string): Promise<Streamer | null> => {
    return data.streamers[id] || null;
  },

  createStreamer: async (streamer: Streamer): Promise<Streamer> => {
    data.streamers[streamer.discordUserId] = streamer;
    save();
    return streamer;
  },

  updateStreamer: async (id: string, updates: Partial<Streamer>): Promise<void> => {
    if (!data.streamers[id]) return;
    data.streamers[id] = { ...data.streamers[id], ...updates };
    save();
  },

  // Bot-asetukset
  getBotSettings: async (): Promise<BotSettings> => {
    return data.botSettings;
  },

  updateBotSettings: async (settings: Partial<BotSettings>): Promise<void> => {
    data.botSettings = { ...data.botSettings, ...settings };
    save();
  },
};
