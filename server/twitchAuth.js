import axios from 'axios';

let cachedToken = null;
let expiresAt = 0;

export async function getAppToken() {
  if (cachedToken && Date.now() < expiresAt - 60000) return cachedToken;

  const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    }
  });

  cachedToken = res.data.access_token;
  expiresAt = Date.now() + res.data.expires_in * 1000;
  console.log('🔑 Twitch app token refreshed');
  return cachedToken;
}
