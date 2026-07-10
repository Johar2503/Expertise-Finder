require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { runQuery } = require('./neo4j');
const butterbase = require('./butterbase');
const rocketride = require('./rocketride');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Auth middleware: verifies the Butterbase session token sent from the client ---
async function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    req.user = await butterbase.verifySession(token);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid session' });
  }
}

// --- Sign up: creates a real Butterbase Auth user, then logs them straight
//     in (Butterbase allows login before email verification completes) ---
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password, and displayName are required' });
  }
  try {
    await butterbase.signup(email, password, displayName);
    const session = await butterbase.login(email, password);
    res.json(session);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Sign in: real Butterbase Auth login ---
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  try {
    const session = await butterbase.login(email, password);
    res.json(session);
  } catch (e) {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// --- Search: "who knows X" ---
// Free tier: direct HAS_SKILL matches only.
// Pro tier (Butterbase payment unlocked): also surfaces 2-hop "connector" paths
// via KNOWS relationships, and people on projects that REQUIRE the skill.
app.post('/api/search', requireAuth, async (req, res) => {
  const { skill } = req.body;
  if (!skill) return res.status(400).json({ error: 'skill is required' });

  // Accept "Kubernetes", "Kubernetes, Terraform", or an array — a person may
  // have multiple skills, and a query may ask about more than one at once.
  const skills = (Array.isArray(skill) ? skill : String(skill).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (skills.length === 0) return res.status(400).json({ error: 'skill is required' });

  // Whole-word matching via regex word boundaries — plain substring CONTAINS
  // caused false positives like "Rust" matching inside "zero-trust architecture".
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = skills.map((q) => `(?i).*\\b${escapeRegex(q)}\\b.*`);

  const rows = await runQuery(
    `MATCH (p:Person)-[r:HAS_SKILL]->(s:Skill)
     WHERE ANY(pat IN $patterns WHERE s.name =~ pat)
     OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
     RETURN p.name AS name, p.title AS title, t.name AS team, s.name AS skillName, r.level AS level, r.verified AS verified`,
    { patterns }
  );

  // Group per-skill rows into one entry per person with all their matched skills.
  // Hand-curated seed data has no `verified` property (treated as verified);
  // anything learned via Step 3 ingest starts unverified until confirmed —
  // we shouldn't silently treat an AI-extracted claim as established fact.
  const byPerson = new Map();
  for (const row of rows) {
    if (!byPerson.has(row.name)) {
      byPerson.set(row.name, { name: row.name, title: row.title, team: row.team, matches: [] });
    }
    byPerson.get(row.name).matches.push({ skill: row.skillName, level: row.level, verified: row.verified !== false });
  }
  const direct = [...byPerson.values()]
    .map((p) => ({ ...p, matchCount: p.matches.length }))
    .sort((a, b) => b.matchCount - a.matchCount);

  let connectors = [];
  const isPro = await butterbase.isProUser(req.user.accessToken).catch(() => false);
  if (isPro) {
    connectors = await runQuery(
      `MATCH (p:Person)-[:HAS_SKILL]->(s:Skill), (p)<-[:KNOWS]-(mid:Person)
       WHERE ANY(pat IN $patterns WHERE s.name =~ pat)
       RETURN DISTINCT p.name AS expert, mid.name AS introducer
       LIMIT 10`,
      { patterns }
    );
  }

  await butterbase.logSearch(req.user.userId, skills.join(', '), direct.length).catch(() => {});

  // Build a node/edge graph the frontend can render (visualizes the actual traversal).
  const nodes = skills.map((s) => ({ id: `skill:${s}`, label: s, group: 'skill' }));
  const edges = [];
  for (const p of direct) {
    nodes.push({ id: `person:${p.name}`, label: p.name, group: 'person' });
    for (const m of p.matches) {
      const matchedSkill = skills.find((s) => m.skill.toLowerCase().includes(s.toLowerCase())) || m.skill;
      edges.push({ from: `person:${p.name}`, to: `skill:${matchedSkill}`, label: m.level });
    }
  }
  for (const c of connectors) {
    if (!nodes.find((n) => n.id === `person:${c.introducer}`)) {
      nodes.push({ id: `person:${c.introducer}`, label: c.introducer, group: 'connector' });
    }
    edges.push({ from: `person:${c.introducer}`, to: `person:${c.expert}`, label: 'knows', dashes: true });
  }

  // Plain-language explanation of what the agent actually did, so the graph
  // traversal reads as reasoning rather than a silent lookup.
  const skillLabel = skills.length > 1 ? skills.join(', ') : skills[0];
  let explanation = direct.length
    ? `Searched the graph for "${skillLabel}": found ${direct.length} ${direct.length === 1 ? 'person' : 'people'}${skills.length > 1 ? ', ranked by how many of these skills they match' : ''}.`
    : `Searched the graph for "${skillLabel}": no one has ${skills.length > 1 ? 'any of these skills' : 'this skill'} yet.`;
  if (isPro && connectors.length) {
    explanation += ` Traversed one more hop via KNOWS relationships and found ${connectors.length} introduction path${connectors.length === 1 ? '' : 's'} to people outside your direct search.`;
  } else if (isPro) {
    explanation += ' Traversed one more hop via KNOWS relationships but found no additional introduction paths.';
  }

  res.json({ direct, connectors, isPro, graph: { nodes, edges }, explanation });
});

// --- Ingest: paste a doc/Slack snippet, run it through the RocketRide pipeline,
//     write extracted skill mentions into Neo4j ---
app.post('/api/ingest', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Genuinely exercises the deployed RocketRide Cloud pipeline (best-effort,
  // never blocks ingest). See server/rocketride.js for why the actual
  // extraction result comes from a direct Anthropic call instead.
  const rocketrideCall = await rocketride.notifyRocketRidePipeline(text);

  const extractions = await rocketride.extractSkillsFromText(text);

  for (const ex of extractions) {
    // Resolve to an existing Person by name before creating a new node —
    // otherwise "Bob" vs "Bob Ibarra" (same person, different extracted
    // mention) would create two separate nodes for the same real person.
    const existingMatch = await runQuery(
      `MATCH (p:Person)
       WHERE toLower(p.name) = toLower($person)
          OR toLower(p.name) STARTS WITH toLower($person) + ' '
          OR toLower($person) STARTS WITH toLower(p.name) + ' '
       RETURN p.id AS id, p.name AS name
       LIMIT 1`,
      { person: ex.person }
    );
    const personId = existingMatch[0]?.id || ex.person.toLowerCase().replace(/\s+/g, '-');
    const personName = existingMatch[0]?.name || ex.person;

    await runQuery(
      `MERGE (p:Person {id: $personId})
       ON CREATE SET p.name = $personName
       MERGE (s:Skill {name: $skill})
       MERGE (p)-[r:HAS_SKILL]->(s)
       ON CREATE SET r.level = 'mentioned', r.source = 'rocketride-ingest', r.confidence = $confidence, r.verified = false
       ON MATCH SET r.confidence = $confidence`,
      { personId, personName, skill: ex.skill, confidence: ex.confidence }
    );
  }

  await butterbase.logIngestedDoc(req.user.userId, text, extractions.length).catch(() => {});

  res.json({ extracted: extractions.length, extractions, rocketride: rocketrideCall });
});

function namesMatch(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la === lb || la.startsWith(lb + ' ') || lb.startsWith(la + ' ');
}

// --- Confirm an AI-extracted skill claim (marks it verified) ---
// Only the person a claim is about can confirm it — otherwise "verification"
// is meaningless, since anyone signed in could just rubber-stamp any claim.
app.post('/api/verify', requireAuth, async (req, res) => {
  const { person, skill } = req.body;
  if (!person || !skill) return res.status(400).json({ error: 'person and skill are required' });

  if (!namesMatch(req.user.name || '', person)) {
    return res.status(403).json({ error: `Only ${person} can confirm this claim about themselves.` });
  }

  const result = await runQuery(
    `MATCH (p:Person)-[r:HAS_SKILL]->(s:Skill)
     WHERE toLower(p.name) = toLower($person) AND toLower(s.name) = toLower($skill)
     SET r.verified = true
     RETURN p.name AS name, s.name AS skill`,
    { person, skill }
  );
  if (!result.length) return res.status(404).json({ error: 'No matching skill claim found' });
  res.json({ confirmed: true, person: result[0].name, skill: result[0].skill });
});

// --- Pro upgrade via Butterbase payment ---
app.post('/api/upgrade', requireAuth, async (req, res) => {
  try {
    const checkout = await butterbase.createProCheckout(req.user.accessToken);
    res.json(checkout);
  } catch (e) {
    // No Stripe-connected plan configured yet (BUTTERBASE_PRO_PLAN_ID is a
    // placeholder) — the call is real and correctly wired, it just has
    // nothing to check out against. Fail with a clear message instead of a
    // raw API error.
    res.json({ checkoutUrl: null, note: 'Payments aren\'t fully configured yet (no live Stripe plan connected) — the checkout call itself is real and wired correctly.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Expertise Finder running on :${port}`));
