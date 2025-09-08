import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const STORAGE_FILE = path.join(__dirname, 'storage.json');

interface BotSettings {
  isActive: boolean;
  checkIntervalSeconds: number;
  watchedRoleId: string;
  liveRoleId: string;
  announceChannelId: string;
}

interface StreamerData {
  discordUserId: string;
  discordUsername: string;
  twitchUsername: string | null;
  isLive: boolean;
  currentStreamTitle: string | null;
  currentViewers: number;
  announcementMessageId: string | null;
}

interface StorageData {
  streamers: Record<string, StreamerData>;
  botSettings: BotSettings;
}

// Lataa storage.json
let storage: StorageData = {
  streamers: {},
  botSettings: {
    isActive: true,
    checkIntervalSeconds: 60,
    watchedRoleId: process.env.STRIIMAAJA_ROLE_ID || '',
    liveRoleId: process.env.LIVE_ROLE_ID || '',
    announceChannelId: process.env.MAINOSTUS_CHANNEL_ID || '',
  },
};

if (fs.existsSync(STORAGE_FILE)) {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    storage.streamers = parsed.streamers || {};

    // Jos .env:ssa on arvoja, ne korvaavat storage.jsonin
    storage.botSettings = {
      isActive: parsed.botSettings?.isActive ?? true,
      checkIntervalSeconds: parsed.botSettings?.checkIntervalSeconds ?? 60,
      watchedRoleId: process.env.STRIIMAAJA_ROLE_ID || parsed.botSettings?.watchedRoleId || '',
      liveRoleId: process.env.LIVE_ROLE_ID || parsed.botSettings?.liveRoleId || '',
      announceChannelId: process.env.MAINOSTUS_CHANNEL_ID || parsed.botSettings?.announceChannelId || '',
    };
  } catch (err) {
    console.error('Error parsing storage.json:', err);
  }
}

// Tallentaa storage.json
function save() {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), 'utf8');
}

// =================================
// Streamer helperit
// =================================
export async function getStreamer(discordUserId: string): Promise<StreamerData | null> {
  return storage.streamers[discordUserId] || null;
}

export async function createStreamer(streamer: StreamerData): Promise<StreamerData> {
  storage.streamers[streamer.discordUserId] = streamer;
  save();
  return streamer;
}

export async function updateStreamer(discordUserId: string, updates: Partial<StreamerData>) {
  const streamer = storage.streamers[discordUserId];
  if (!streamer) return null;
  storage.streamers[discordUserId] = { ...streamer, ...updates };
  save();
  return storage.streamers[discordUserId];
}

// =================================
// Bot settings helperit
// =================================
export async function getBotSettings(): Promise<BotSettings> {
  return storage.botSettings;
}

export async function updateBotSettings(updates: Partial<BotSettings>) {
  storage.botSettings = { ...storage.botSettings, ...updates };
  save();
}

// =================================
// Export storage object tarvittaessa
// =================================
export const storageObj = storage;
