# DropLater

How to run with Docker Compose
- docker compose up -d
- API: http://localhost:3001 (GET /health)
- Admin: http://localhost:5173
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

Scripts
- API/Worker/Sink are dockerized. Admin runs via compose dev service.
- In worker container: `npm test`, `npm run seed` (placeholder)