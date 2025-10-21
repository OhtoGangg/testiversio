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
    // 🔹 SISÄLLÖNTUOTTAJAT
    watchedRoleId: process.env.SISALLONTUOTTAJA_ROLE_ID,  // SISÄLLÖNTUOTTAJA-roolin ID
    announceChannelId: process.env.MAINOSTUS_CHANNEL_ID,  // Mainoskanava

    // 🔹 JUONTAJAT
    hostRoleId: process.env.JUONTAJA_ROLE_ID,             // JUONTAJA-roolin ID
    hostAnnounceChannelId: process.env.ILMOITUKSET_CHANNEL_ID, // Ilmoitukset-kanava

    // 🔹 Yleiset
    liveRoleId: process.env.LIVE_ROLE_ID,                 // LIVESSÄ-roolin ID
    checkIntervalSeconds: Number(process.env.CHECK_INTERVAL_SECONDS) || 60
  },

  liveMessages: storageData.liveMessages || {},           // Tallennetaan lähetetyt mainosviestit
  streamers: storageData.streamers || {},                 // Discord ID → Twitch username

  getBotSettings() { 
    return this.botSettings; 
  },

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
    const { liveMessages, streamers } = this;
    fs.writeFileSync(storageFile, JSON.stringify({ liveMessages, streamers }, null, 2)); 
  }
};
