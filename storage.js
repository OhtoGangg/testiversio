// storage.js
import fs from 'fs';

const storageFile = './storage.json';
let storageData = {};
try { 
  storageData = JSON.parse(fs.readFileSync(storageFile, 'utf8')); 
} catch {}

// Kaikki ID:t ja tokenit luetaan environment-muuttujista
export const storage = {
  botSettings: {
    watchedRoleId: process.env.STRIIMAAJA_ROLE_ID,    // STRIIMAAJA-roolin ID
    liveRoleId: process.env.LIVE_ROLE_ID,             // LIVESSÄ-roolin ID
    announceChannelId: process.env.MAINOSTUS_CHANNEL_ID, // Mainoskanavan ID
    checkIntervalSeconds: 60                           // Tarkistusväli sekunteina
  },
  liveMessages: storageData.liveMessages || {},       // Tallennetaan lähetetyt mainosviestit
  streamers: storageData.streamers || {},             // Discord ID → Twitch username

  getBotSettings() { return this.botSettings; },

  async getStreamer(id) { 
    return this.streamers[id] || null; 
  },

  async createStreamer(data) { 
    this.streamers[data.discordUserId] = data; 
    this.save(); 
    return data; 
  },

  async updateStreamer(id, data) { 
    this.streamers[id] = { ...this.streamers[id], ...data }; 
    this.save(); 
  },

  save() { 
    fs.writeFileSync(storageFile, JSON.stringify({ ...this }, null, 2)); 
  }
};
