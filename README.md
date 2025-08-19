# DropLater

How to run with Docker Compose
- docker compose up -d
- API: http://localhost:3001 (GET /health)
- Admin (served by API if built): http://localhost:3001
- Dev Admin via Vite: http://localhost:5173
- Sink: http://localhost:4000/sink

Environment variables
- In compose:
  - API: `MONGODB_URI`, `REDIS_URL`, `ADMIN_TOKEN`, `RATE_LIMIT_PER_MINUTE`
  - WORKER: `MONGODB_URI`, `REDIS_URL`, `POLL_INTERVAL_MS`, `DELIVERY_BACKOFF_MS`, `MAX_DELIVERY_ATTEMPTS`
  - SINK: `REDIS_URL`, `SINK_FORCE_ERROR`

Example curl commands
```bash
# Health
curl http://localhost:3001/health

# Create note
curl -X POST http://localhost:3001/api/notes \
 -H "Authorization: Bearer changeme" \
 -H "Content-Type: application/json" \
 -d '{"title":"Hello","body":"Ship me later","releaseAt":"2000-01-01T00:00:10.000Z","webhookUrl":"http://sink:4000/sink"}'

# List
curl -H "Authorization: Bearer changeme" "http://localhost:3001/api/notes?status=pending&page=1"

# Replay
curl -X POST -H "Authorization: Bearer changeme" "http://localhost:3001/api/notes/<id>/replay"
```

Tests
- Unit: `worker/lib/idempotency` key generation
- Integration (lightweight): schema + idempotency key and mock sink path

Dev scripts (root)
- Start infra: `npm run dev:compose`
- Stop infra: `npm run down`
- API dev: `npm run dev:api`
- Worker dev: `npm run dev:worker`
- Sink dev: `npm run dev:sink`
- Admin dev: `npm run dev:admin`
- Tests: `npm test`
- Format worker: `npm run format`
- Seed example: `npm run seed`

Scripts
- API/Worker/Sink are dockerized. Admin runs via compose dev service.
- In worker container: `npm test`, `npm run seed` (placeholder)

## Get this code locally (clone + dependencies)

### Prerequisites
- Git
- Node.js 20+ and npm (recommend npm 10+)
- Docker Desktop (for MongoDB/Redis via Compose)

### Clone the repository
```bash
git clone https://github.com/tanayy07/DropLater.git
cd DropLater/droplater
```

### Open in your IDE
- VS Code: `code .`
- JetBrains/WebStorm: Open the `droplater` folder

### Install dependencies (for local dev without Compose)
Install per service:
```bash
# Admin UI
cd admin && npm install && cd ..

# API
cd api && npm install && cd ..

# Worker
cd api/worker && npm install && cd ../..

# Sink
cd api/sink && npm install && cd ../..
```

### Environment variables (optional for local dev)
- Defaults are sensible; you can run without `.env`. If you want explicit files:
  - Copy `env.example` values into service-specific `.env` files:
    - `api/.env` (PORT=3000, MONGODB_URI, REDIS_URL, ADMIN_TOKEN, RATE_LIMIT_PER_MINUTE)
    - `api/worker/.env` (MONGODB_URI, REDIS_URL, POLL_INTERVAL_MS, DELIVERY_BACKOFF_MS, MAX_DELIVERY_ATTEMPTS)
    - `api/sink/.env` (PORT=4000, REDIS_URL, SINK_FORCE_ERROR)

### Run (quick start)
- With Docker Compose (recommended):
```bash
docker compose up -d
# API on http://localhost:3001, Sink on http://localhost:4000/sink
```

- Local dev (separate terminals):
```bash
# Infra
docker compose up -d mongo redis

# API
cd api && npm run dev

# Worker
cd api/worker && npm run dev

# Sink
cd api/sink && npm run dev

# Admin
cd admin && npm run dev
```

## Where this project is useful (use‑cases and adopters)

DropLater is a minimal, production‑style template for "schedule now, deliver later, exactly once" workflows backed by MongoDB, Redis, and BullMQ. Typical places it fits:

- Payments/Fintech callbacks: ensure exactly‑once delivery of payment status webhooks and retries on failure (e.g., payment processors, payout providers).
- E‑commerce platforms: delayed or scheduled webhooks (order created/updated, fulfillment, refunds) to merchants’ endpoints.
- SaaS webhook platforms: reliable outbound webhooks with idempotency for integrations and partners.
- Messaging and bot ecosystems: sending scheduled notifications to Slack/Discord/Teams endpoints with retry and dedupe.
- Logistics/Delivery tracking: time‑based notifications to partner systems when a status changes.
- Marketing automation/CRM: schedule outbound events (drips, reminders) to internal or third‑party endpoints.
- Platform/Infra teams: a simple building block for delayed jobs + idempotent delivery in microservices.

Examples of companies/domains with similar needs: payment processors (e.g., Stripe‑style callbacks), e‑commerce platforms (e.g., Shopify‑style webhooks), developer tools and code hosts (e.g., GitHub‑style webhooks), chat platforms (e.g., Slack‑style webhooks), CRMs/automation tools (e.g., HubSpot/Segment‑style events). These are illustrative; this repo is independent.

### Why idempotency matters
- Network calls can duplicate; idempotency ensures receivers perform the action once.
- Retries with backoff improve delivery reliability without risking duplicate processing.
