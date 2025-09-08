const fs = require('fs');
const path = require('path');

const storageFilePath = path.resolve(__dirname, 'storage.json');

function readStorage() {
  try {
    const raw = fs.readFileSync(storageFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const defaultData = {
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

function writeStorage(data) {
  fs.writeFileSync(storageFilePath, JSON.stringify(data, null, 2));
}

const storage = {
  getBotSettings: async () => readStorage().botSettings,
  updateBotSettings: async (newSettings) => {
    const data = readStorage();
    data.botSettings = { ...data.botSettings, ...newSettings };
    writeStorage(data);
  },
  getStreamer: async (discordUserId) => {
    const data = readStorage();
    return data.streamers[discordUserId] || null;
  },
  createStreamer: async (streamer) => {
    const data = readStorage();
    data.streamers[streamer.discordUserId] = streamer;
    writeStorage(data);
    return streamer;
  },
  updateStreamer: async (discordUserId, updates) => {
    const data = readStorage();
    if (!data.streamers[discordUserId]) return;
    data.streamers[discordUserId] = { ...data.streamers[discordUserId], ...updates };
    writeStorage(data);
  },
  createActivity: async (activity) => {
    console.log('Activity:', activity);
  }
};

module.exports = { storage };
