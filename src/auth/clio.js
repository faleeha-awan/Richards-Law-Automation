const axios = require('axios');

const CLIO_BASE = 'https://eu.app.clio.com';
const TOKEN_URL = `${CLIO_BASE}/oauth/token`;
const AUTH_URL  = `${CLIO_BASE}/oauth/authorize`;

let tokenStore = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
};

function getAuthorizationUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIO_CLIENT_ID,
    redirect_uri: process.env.CLIO_REDIRECT_URI,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.CLIO_CLIENT_ID,
      client_secret: process.env.CLIO_CLIENT_SECRET,
      redirect_uri: process.env.CLIO_REDIRECT_URI,
    });

    const bodyString = params.toString();
    console.log('FULL REQUEST BODY:', bodyString);

    const response = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    saveTokens(response.data);
    return response.data;
  } catch (err) {
    console.error('Full Clio token error:', JSON.stringify(err.response?.data, null, 2));
    throw err;
  }
}

async function refreshAccessToken() {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenStore.refresh_token,
  });

  const credentials = Buffer.from(
    `${process.env.CLIO_CLIENT_ID}:${process.env.CLIO_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
  });

  saveTokens(response.data);
  return response.data;
}

async function getValidAccessToken() {
  if (!tokenStore.access_token) {
    throw new Error('Not authenticated with Clio. Please visit /auth/clio to connect.');
  }
  const now = Date.now();
  if (tokenStore.expires_at && now >= tokenStore.expires_at - 60000) {
    console.log('Access token expiring soon, refreshing...');
    await refreshAccessToken();
  }
  return tokenStore.access_token;
}

function saveTokens(data) {
  tokenStore.access_token  = data.access_token;
  tokenStore.refresh_token = data.refresh_token;
  tokenStore.expires_at    = Date.now() + (data.expires_in * 1000);
  console.log('✅ Clio tokens saved successfully');
}

function isAuthenticated() {
  return !!tokenStore.access_token;
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  isAuthenticated,
};