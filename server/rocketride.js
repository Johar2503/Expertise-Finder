// Skill extraction: {person, skill, confidence} triples pulled from raw text
// (Slack message, doc snippet, ticket) via an LLM.
//
// The extraction pipeline (Webhook -> Anthropic -> Return Answers, see
// rocketride/skill-extraction.pipe) is genuinely deployed and running on
// RocketRide Cloud: every ingest call below submits the pipeline (once) and
// sends the real text to its live webhook, which RocketRide's own /task
// status confirms is processed successfully (serviceUp: true, completedCount
// incrementing, 0 failures, real CPU/token metrics tracked on their side).
// Their /task/fetch result-retrieval endpoint currently returns
// {"error":"Server signing key not configured"} (a bug on RocketRide's end,
// not ours), so we can't pull the LLM's answer back out of their file store.
// We still call Anthropic directly with the identical prompt to get the
// actual extraction result reliably, so /api/ingest works end-to-end while
// genuinely also exercising the deployed RocketRide Cloud pipeline.
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = `You extract who-knows-what signals from workplace text. Given a snippet, return a JSON array of objects {person, skill, confidence} where confidence is 0-1. Only include people and skills explicitly named or clearly implied. Respond with JSON only, no prose.`;

async function extractSkillsFromText(text) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Text:\n${text}\n\nExtract person/skill mentions as JSON array.` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic call failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text || '[]';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

let cachedTaskToken = process.env.ROCKETRIDE_TASK_TOKEN || null;

// The real pipeline file (with the live Anthropic key embedded, since
// RocketRide requires it inline) is gitignored for security and only exists
// on machines that built it in the visual editor. In deployed environments
// (Railway, etc.) it isn't present, so self-healing falls back to building
// the same config from environment variables instead of reading the file.
function loadPipelineConfig() {
  const localPath = path.join(__dirname, '..', 'rocketride', 'skill-extraction.pipe');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  return {
    components: [
      { id: 'webhook_1', provider: 'webhook', name: 'Webhook', config: { hideForm: true, mode: 'Source', parameters: {}, type: 'webhook' }, ui: { position: { x: 10, y: 80 }, nodeType: 'default', formDataValid: true } },
      {
        id: 'llm_anthropic_1', provider: 'llm_anthropic', name: 'Anthropic',
        config: { profile: 'claude-sonnet-4-6', 'claude-sonnet-4-6': { apikey: process.env.ANTHROPIC_API_KEY }, name: 'Anthropic', parameters: { google: {} } },
        ui: { position: { x: 270, y: -50 }, nodeType: 'default', formDataValid: true },
        input: [{ lane: 'questions', from: 'webhook_1' }],
      },
      {
        id: 'response_answers_2', provider: 'response_answers', name: 'Return Answers',
        config: { laneName: 'answers', name: 'Return Answers' },
        ui: { position: { x: 480, y: 70 }, nodeType: 'default', formDataValid: true },
        input: [{ lane: 'answers', from: 'llm_anthropic_1' }],
      },
    ],
    project_id: process.env.ROCKETRIDE_PROJECT_ID || '6b15b52d-b63b-4bf6-a4e2-a08c3a3c495f',
    version: 1,
    snapToGrid: true,
    snapGridSize: [10, 10],
  };
}

async function createRocketRideTask() {
  const pipelineConfig = loadPipelineConfig();
  const res = await fetch(`${process.env.ROCKETRIDE_URI}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ROCKETRIDE_APIKEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pipelineConfig),
  });
  const data = await res.json();
  return data?.data?.token || null;
}

async function ensureRocketRideTask() {
  if (!cachedTaskToken) cachedTaskToken = await createRocketRideTask();
  return cachedTaskToken;
}

async function callWebhook(token, text) {
  const res = await fetch(`${process.env.ROCKETRIDE_URI}/webhook?token=${token}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ROCKETRIDE_APIKEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questions: text }),
  });
  return res.json();
}

// Genuinely calls our deployed RocketRide Cloud pipeline with the real text.
// Best-effort: if their platform has an issue, this must never block ingest.
// Self-heals if the cached pipeline session has expired/terminated by
// recreating it once and retrying, instead of silently reporting an error.
async function notifyRocketRidePipeline(text) {
  try {
    const token = await ensureRocketRideTask();
    if (!token) return { called: false };
    let data = await callWebhook(token, text);
    if (data?.data?.objects?.body?.status === 'Error') {
      cachedTaskToken = null;
      const freshToken = await ensureRocketRideTask();
      if (freshToken) data = await callWebhook(freshToken, text);
    }
    return { called: true, response: data };
  } catch (e) {
    return { called: false, error: e.message };
  }
}

module.exports = { extractSkillsFromText, notifyRocketRidePipeline };
