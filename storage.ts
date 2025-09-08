import fs from 'fs';
const FILE = './storage.json';

let data: any = {};
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}

export const storage = {
  getStreamer: async (id: string) => data.streamers?.[id] || null,
  createStreamer: async (streamer: any) => {
    if (!data.streamers) data.streamers = {};
    data.streamers[streamer.discordUserId] = streamer;
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    return streamer;
  },
  updateStreamer: async (id: string, updates: any) => {
    if (!data.streamers?.[id]) return;
    data.streamers[id] = { ...data.streamers[id], ...updates };
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  },
  getBotSettings: async () => ({
    isActive: true,
    checkIntervalSeconds: 60,
    watchedRoleId: process.env.STRIIMAAJA_ROLE_ID,
    liveRoleId: process.env.LIVE_ROLE_ID,
    announceChannelId: process.env.MAINOSTUS_CHANNEL_ID,
  }),
  updateBotSettings: async (settings: any) => {},
};
