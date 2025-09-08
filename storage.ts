import fs from 'fs';
import path from 'path';

const storageFilePath = path.resolve(__dirname, 'storage.json');

export interface StreamerData {
  discordUserId: string;
  discordUsername: string;
  twitchUsername: string | null;
  isLive: boolean;
  currentStreamTitle: string | null;
  currentViewers: number;
  announcementMessageId: string | null;
}

export interface BotSettings {
  isActive: boolean;
  checkIntervalSeconds: number;
  watchedRoleId: string;
  liveRoleId: string;
  announceChannelId: string;
}

interface StorageData {
  streamers: Record<string, StreamerData>;
  botSettings: BotSettings;
}

function readStorage(): StorageData {
  try {
    const raw = fs.readFileSync(storageFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const defaultData: StorageData = {
      streamers: {},
      botSettings: {
        isActive: true,
        checkIntervalSeconds: 60,
        watchedRoleId: '',
        liveRoleId: '',
        announceChannelId: ''
      }
    };
    writeStorage(defaultData);
    return defaultData;
  }
}

function writeStorage(data: StorageData) {
  fs.writeFileSync(storageFilePath, JSON.stringify(data, null, 2));
}

export const storage = {
  getBotSettings: async (): Promise<BotSettings> => readStorage().botSettings,
  updateBotSettings: async (newSettings: Partial<BotSettings>) => {
    const data = readStorage();
    data.botSettings = { ...data.botSettings, ...newSettings };
    writeStorage(data);
  },
  getStreamer: async (discordUserId: string): Promise<StreamerData | null> => {
    const data = readStorage();
    return data.streamers[discordUserId] || null;
  },
  createStreamer: async (streamer: StreamerData) => {
    const data = readStorage();
    data.streamers[streamer.discordUserId] = streamer;
    writeStorage(data);
    return streamer;
  },
  updateStreamer: async (discordUserId: string, updates: Partial<StreamerData>) => {
    const data = readStorage();
    if (!data.streamers[discordUserId]) return;
    data.streamers[discordUserId] = { ...data.streamers[discordUserId], ...updates };
    writeStorage(data);
  },
  createActivity: async (activity: any) => {
    // voit lisätä loggausta jos haluat
    console.log('Activity:', activity);
  }
};
