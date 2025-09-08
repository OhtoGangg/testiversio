import fs from 'fs';

const storageFile = './storage.json';
let storageData = {};
try { storageData = JSON.parse(fs.readFileSync(storageFile, 'utf8')); } catch {}

export const storage = {
  botSettings: storageData.botSettings || {},
  liveMessages: storageData.liveMessages || {},
  streamers: storageData.streamers || {},

  getBotSettings() { return this.botSettings; },
  async getStreamer(id) { return this.streamers[id] || null; },
  async createStreamer(data) { this.streamers[data.discordUserId] = data; this.save(); return data; },
  async updateStreamer(id, data) { this.streamers[id] = { ...this.streamers[id], ...data }; this.save(); },
  save() { fs.writeFileSync(storageFile, JSON.stringify({ ...this }, null, 2)); }
};
