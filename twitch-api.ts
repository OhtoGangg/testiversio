import fetch from 'node-fetch';

export interface TwitchStreamData {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids: string[];
}

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
}

export class TwitchAPI {
  private clientId: string;
  private accessToken: string;
  private baseURL = 'https://api.twitch.tv/helix';

  constructor() {
    this.clientId = process.env.TWITCH_CLIENT_ID || '';
    this.accessToken = process.env.TWITCH_ACCESS_TOKEN || '';

    if (!this.clientId || !this.accessToken) {
      console.error('Missing Twitch API credentials.');
    }
  }

  private async makeRequest(endpoint: string): Promise<any> {
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

  async getUser(username: string): Promise<TwitchUser | null> {
    const data = await this.makeRequest(`/users?login=${encodeURIComponent(username)}`);
    return data.data?.[0] || null;
  }

  async getStreamData(username: string): Promise<TwitchStreamData | null> {
    const data = await this.makeRequest(`/streams?user_login=${encodeURIComponent(username)}`);
    return data.data?.[0] || null;
  }
}
