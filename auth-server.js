import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code received');

  const params = new URLSearchParams();
  params.append('client_id', process.env.TWITCH_CLIENT_ID);
  params.append('client_secret', process.env.TWITCH_CLIENT_SECRET);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', 'https://livebot-9vdn.onrender.com/auth/twitch/callback');

  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: params
    });
    const data = await response.json();
    console.log('Twitch OAuth token:', data);

    res.send('✅ Twitch authorisointi valmis! Katso konsoli.');
  } catch (err) {
    console.error(err);
    res.send('❌ Virhe authorisoinnissa');
  }
});

app.listen(PORT, () => console.log(`Auth server running on port ${PORT}`));
