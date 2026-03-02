const axios = require('axios');
const fs = require('fs');

const CLIO_BASE = 'https://eu.app.clio.com';
const TOKEN_URL = `${CLIO_BASE}/oauth/token`;
const AUTH_URL  = `${CLIO_BASE}/oauth/authorize`;
const TOKEN_FILE = '/tmp/clio_tokens.json';

function saveTokens(data) {
  const tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + (data.expires_in * 1000),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));
  console.log('✅ Clio tokens saved successfully');
}

function getTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading token file:', e.message);
  }
  return null;
}

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

    console.log('FULL REQUEST BODY:', params.toString());

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
  const tokens = getTokens();
  if (!tokens?.refresh_token) {
    throw new Error('No refresh token available.');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
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
  const tokens = getTokens();
  if (!tokens?.access_token) {
    throw new Error('Not authenticated with Clio. Please visit /auth/clio to connect.');
  }
  const now = Date.now();
  if (tokens.expires_at && now >= tokens.expires_at - 60000) {
    console.log('Access token expiring soon, refreshing...');
    await refreshAccessToken();
    return getTokens().access_token;
  }
  return tokens.access_token;
}

function isAuthenticated() {
  const tokens = getTokens();
  return !!(tokens?.access_token);
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  isAuthenticated,
};