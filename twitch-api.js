// twitch-api.js
import fetch from 'node-fetch';

export class TwitchAPI {
  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
    this.accessToken = process.env.TWITCH_ACCESS_TOKEN || '';
    this.baseURL = 'https://api.twitch.tv/helix';

    if (!this.clientId || !this.clientSecret) {
      console.error('⚠️ Missing Twitch API credentials (Client ID or Client Secret).');
    }
  }

  // Hakee uuden access tokenin automaattisesti
  async refreshToken() {
    if (!this.clientId || !this.clientSecret) throw new Error('Missing Twitch Client ID/Secret');

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    });

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: params,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twitch token error: ${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    console.log('🔑 Twitch access token päivitetty');
    return this.accessToken;
  }

  async makeRequest(endpoint) {
    if (!this.accessToken) await this.refreshToken();

    const res = await fetch(`${this.baseURL}${endpoint}`, {
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Token vanhentunut, yritä uudelleen
        console.log('🔄 Twitch token vanhentunut, päivitetään ja yritetään uudelleen...');
        await this.refreshToken();
        return this.makeRequest(endpoint);
      }
      throw new Error(`Twitch API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async getUser(username) {
    const data = await this.makeRequest(`/users?login=${encodeURIComponent(username)}`);
    return data.data?.[0] || null;
  }

  async getStreamData(username) {
    const data = await this.makeRequest(`/streams?user_login=${encodeURIComponent(username)}`);
    return data.data?.[0] || null;
  }
}
