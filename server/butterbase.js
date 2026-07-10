// Real Butterbase integration, verified endpoint-by-endpoint against the live
// API (see rocketride.js comment style — same approach). Two base URLs:
//   - Auth API:    https://api.butterbase.ai/auth/{app_id}/...
//   - Data/Billing: https://api.butterbase.ai/v1/{app_id}/...
// Auth/billing calls use the END USER's access token (returned from
// login/signup), never the app's admin API key — that key is only used for
// admin-level calls like schema management and backend-initiated DB writes.
const fetch = require('node-fetch');

const APP_ID = process.env.BUTTERBASE_APP_ID;
const ADMIN_KEY = process.env.BUTTERBASE_API_KEY;
const AUTH_BASE = `https://api.butterbase.ai/auth/${APP_ID}`;
const DATA_BASE = `https://api.butterbase.ai/v1/${APP_ID}`;

async function signup(email, password, displayName) {
  const res = await fetch(`${AUTH_BASE}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  if (!res.ok) throw new Error(`Signup failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function login(email, password) {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_in, user: {...} }
}

async function verifySession(accessToken) {
  const res = await fetch(`${AUTH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Invalid session');
  const user = await res.json();
  return { userId: user.id, name: user.display_name, email: user.email, accessToken };
}

async function logSearch(userId, query, resultCount) {
  await fetch(`${DATA_BASE}/search_history`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, query, result_count: resultCount, ts: new Date().toISOString() }),
  });
}

async function logIngestedDoc(userId, sourceText, extractedSkillCount) {
  await fetch(`${DATA_BASE}/ingested_docs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, source_text: sourceText, extracted_skill_count: extractedSkillCount, ts: new Date().toISOString() }),
  });
}

async function isProUser(accessToken) {
  const res = await fetch(`${DATA_BASE}/billing/subscription`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.subscription && data.subscription.status === 'active';
}

async function createProCheckout(accessToken) {
  const res = await fetch(`${DATA_BASE}/billing/subscribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: process.env.BUTTERBASE_PRO_PLAN_ID }),
  });
  if (!res.ok) throw new Error(`Checkout failed: ${res.status} ${await res.text()}`);
  return res.json(); // { checkoutUrl }
}

module.exports = { signup, login, verifySession, logSearch, logIngestedDoc, isProUser, createProCheckout };
