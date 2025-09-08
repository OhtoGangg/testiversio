import fetch from 'node-fetch';

export class TwitchAPI {
  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.accessToken = process.env.TWITCH_ACCESS_TOKEN || '';
    this.baseURL = 'https://api.twitch.tv/helix';
    if (!this.clientId || !this.accessToken) {
      console.error('Missing Twitch API credentials.');
    }
  }

  async makeRequest(endpoint) {
    if (!this.clientId || !this.accessToken) {
      throw new Error('Twitch API credentials not configured');
    }
    const res = await fetch(`${this.baseURL}${endpoint}`, {
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
    if (!res.ok) throw new Error(`Twitch API error: ${res.status} ${res.statusText}`);
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
