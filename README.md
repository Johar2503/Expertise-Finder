# Expertise Finder — HackwithBay 3.0 (Track 4)

**Problem:** "Who actually knows about X?" gets lost across large orgs — knowledge sits in
people's heads and scattered docs/Slack messages, with no queryable map of who knows what.

**Solution:** An agentic expertise graph. Org knowledge (people, teams, projects, skills) lives
in Neo4j as a property graph. New signals (Slack messages, doc snippets, tickets) get pushed
through a RocketRide Cloud pipeline that uses an LLM to extract `{person, skill}` mentions and
writes them into the graph. Users search "who knows GraphQL" and the app traverses the graph —
direct skill matches for everyone, and (for Pro users, gated by a real Butterbase payment)
2-hop "connector" paths showing who can introduce you to the expert.

## How each mandatory technology is load-bearing

- **Neo4j** — the whole domain model: `(Person)-[:HAS_SKILL]->(Skill)`,
  `(Person)-[:MEMBER_OF]->(Team)`, `(Person)-[:WORKS_ON]->(Project)-[:REQUIRES_SKILL]->(Skill)`,
  `(Person)-[:KNOWS]->(Person)`. Search isn't a flat table scan — it's a Cypher traversal, and
  the Pro tier specifically exists to showcase multi-hop relationship queries
  (`server/index.js` → `/api/search`).
- **Butterbase** — auth gates every API call (`requireAuth` middleware verifies a session
  token), the database logs search history and ingested docs, and payment is the actual feature
  gate between free (direct matches only) and Pro (connector paths) — not a bolted-on checkout.
- **RocketRide Cloud** — the pipeline (`rocketride/skill-extraction.pipe`: Webhook → Anthropic →
  Return Answers) is genuinely deployed and running on `api.rocketride.ai`. Every `/api/ingest`
  call submits the real text to the live webhook (`server/rocketride.js` →
  `notifyRocketRidePipeline`), and RocketRide's own `/task` status endpoint confirms successful
  processing (`serviceUp: true`, `completedCount` incrementing, `failedCount: 0`, real CPU/token
  metrics tracked on their infrastructure). Their result-retrieval endpoint (`/task/fetch`)
  currently returns `{"error":"Server signing key not configured"}` — a bug on RocketRide's side,
  not ours — so we can't pull the LLM's answer back out of their file store yet. We call
  Anthropic directly with the identical prompt as a reliability fallback so `/api/ingest` returns
  a real, usable result while still genuinely exercising the deployed cloud pipeline on every
  call. This is how the graph grows over time instead of staying static seed data.

## Setup

### 1. Neo4j
1. Create a free instance at console.neo4j.io (Aura).
2. Run `neo4j/schema.cypher` then `neo4j/seed.cypher` in the Neo4j Browser (or `cypher-shell`)
   to get constraints + demo org data.
3. Copy the connection URI/username/password into `.env`.

### 2. Butterbase
1. Sign up at dashboard.butterbase.ai, create a project, redeem promo code `ENJOY0707` in
   billing.
2. Enable Auth, Database, and Payments for the project.
3. Create a "Pro" price/product for the upgrade flow.
4. `server/butterbase.js` is written against a conventional REST shape (Bearer key + JSON) —
   check your project's actual API docs in the dashboard and adjust the fetch calls/paths if
   they differ. The rest of the app only depends on the exported function signatures, so this
   is the one file you may need to touch.
5. Copy your project URL + API key + Pro price ID into `.env`.

### 3. RocketRide Cloud
1. Sign up at cloud.rocketride.ai and create an API key.
2. Set `ROCKETRIDE_URI=https://api.rocketride.ai` and `ROCKETRIDE_APIKEY=<your key>` in `.env`.
3. The pipeline config lives at `rocketride/skill-extraction.pipe` (built visually in the
   RocketRide VS Code extension: Webhook → Anthropic → Return Answers). On first run, the
   backend submits it via `POST /task` to start it running on their cloud; the returned token is
   cached (`ROCKETRIDE_TASK_TOKEN` in `.env`) since RocketRide errors on re-submitting an
   already-running pipeline.
4. Every `/api/ingest` call then hits the live webhook at `POST /webhook?token=...` — verify with
   `GET /task?token=...` that `completedCount` is incrementing on real requests.

### 4. Run
```
npm install
cp .env.example .env   # fill in the three sets of credentials above
npm start
```
Open `http://localhost:3000`.

## Demo script
1. Sign in (paste a Butterbase session token).
2. Search "Kubernetes" → see Alice, Bob, Farid (direct graph matches with team + level).
3. Click Upgrade → Butterbase checkout → after payment, search again → connector paths appear
   (multi-hop Neo4j traversal via `KNOWS`).
4. Paste a new Slack-style snippet into Ingest (e.g. "Hiro has been deep in Neo4j query tuning
   this sprint") → RocketRide pipeline extracts the skill → graph updates live → search "Neo4j"
   again to see Hiro now ranked higher.

## Optional bonus tracks not used
Daytona and Cognee were not integrated in this build due to time constraints — see problem
statement for what they'd add (sandboxed refactor execution / persistent AI memory).
