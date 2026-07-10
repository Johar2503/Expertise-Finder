// Thin wrapper around Butterbase's REST API: auth, database (search history /
// ingested docs), and payment (Pro tier unlock for multi-hop search).
//
// NOTE: Butterbase's exact SDK/endpoint shapes come from your project's docs
// in dashboard.butterbase.ai once you're signed in. This wrapper assumes a
// conventional REST shape (Bearer key, JSON body) so the rest of the app has
// a stable interface to call — adjust the fetch calls below to match the
// real API surface, the app logic elsewhere does not need to change.
const fetch = require('node-fetch');

const BASE = process.env.BUTTERBASE_PROJECT_URL;
const KEY = process.env.BUTTERBASE_API_KEY;

function headers() {
  return {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };
}

async function verifySession(token) {
  const res = await fetch(`${BASE}/auth/session`, {
    headers: { ...headers(), 'X-User-Token': token },
  });
  if (!res.ok) throw new Error('Invalid session');
  return res.json(); // { userId, email, isPro }
}

async function logSearch(userId, query, resultCount) {
  await fetch(`${BASE}/db/search_history`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ userId, query, resultCount, ts: new Date().toISOString() }),
  });
}

async function logIngestedDoc(userId, sourceText, extractedSkillCount) {
  await fetch(`${BASE}/db/ingested_docs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ userId, sourceText, extractedSkillCount, ts: new Date().toISOString() }),
  });
}

async function isProUser(userId) {
  const res = await fetch(`${BASE}/payments/subscription-status?userId=${userId}`, {
    headers: headers(),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.active === true;
}

async function createProCheckout(userId) {
  const res = await fetch(`${BASE}/payments/checkout`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ userId, priceId: process.env.BUTTERBASE_PRO_PRICE_ID }),
  });
  return res.json(); // { checkoutUrl }
}

module.exports = { verifySession, logSearch, logIngestedDoc, isProUser, createProCheckout };
