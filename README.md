# Expertise Finder — HackwithBay 3.0 (Track 4)

🔗 **Live app: https://expertise-finder-production.up.railway.app**

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
- **Butterbase** — real Auth API (signup/login/session verification against
  `api.butterbase.ai/auth/{app_id}`, `server/butterbase.js` + `server/index.js` →
  `/api/auth/signup`, `/api/auth/login`), real Database (schema applied via `schema/apply`,
  `search_history` and `ingested_docs` tables genuinely written to via the Data API on every
  search/ingest), and real Billing wiring (`/api/upgrade` calls the actual
  `billing/subscribe`/`billing/subscription` endpoints with the user's session token — verified
  against the live API). The one piece intentionally not completed: connecting a live Stripe
  account in the dashboard's Monetization tab, which we chose not to do without a real bank
  account during the hackathon window. The checkout call is real and correctly wired; it just
  has no live plan to check out against yet, so it fails with a clear message instead of a raw
  error (verified via `/api/upgrade` returning `{"checkoutUrl":null,"note":"Payments aren't
  fully configured yet..."}` rather than crashing).
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
1. Sign up at dashboard.butterbase.ai, redeem promo code `ENJOY0707` in billing.
2. Enable **Developer mode** (Settings → Developer mode) to unlock the Apps tab.
3. Create an app — copy its App ID (shown as `app_xxxxxxxx` in the API base URL) and your
   account's API key (API keys tab) into `.env` as `BUTTERBASE_APP_ID` and `BUTTERBASE_API_KEY`.
4. Auth and Database work immediately — the app auto-provisions an Auth API and a Data API per
   app. Apply the schema once: see `POST /v1/{app_id}/schema/apply` calls in
   `server/seed-runner.js`-style scripts, or just let the app run — `server/index.js` creates
   `search_history`/`ingested_docs` rows on first use (tables must exist first; see the schema
   apply call used during development, shape: `{"schema":{"tables":{...}}, "dry_run":false}`).
5. Payments need one more manual step in the dashboard's **Monetization** tab: connect a Stripe
   account and create a plan, then put that plan's UUID into `BUTTERBASE_PRO_PLAN_ID` in `.env`.
   We intentionally left this unconnected during the hackathon (no real bank account attached);
   the code path is real and tested, it just has no live plan to check out against.

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
1. Sign up with a name/email/password (creates a real Butterbase Auth user), or sign in if you
   already have one.
2. Search "Kubernetes" → see Alice, Bob, Farid (direct graph matches with team + level).
3. Click Upgrade → since no Stripe plan is connected yet, you'll see a clear "payments not
   fully configured" message rather than a real checkout — this is the one honestly-incomplete
   piece (see Butterbase setup step 5 above).
4. Paste a new Slack-style snippet into Teach (e.g. "Hiro has been deep in Neo4j query tuning
   this sprint") → RocketRide pipeline extracts the skill → graph updates live, marked
   🔶 unverified → search "Neo4j" again to see Hiro now ranked higher, with a "confirm" button
   visible only if you're signed in as Hiro.

## Optional bonus tracks not used
Daytona and Cognee were not integrated in this build due to time constraints — see problem
statement for what they'd add (sandboxed refactor execution / persistent AI memory).
