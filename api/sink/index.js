const express = require('express');
const Redis = require('ioredis');
require('dotenv').config();

const app = express();
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FORCE_ERROR = String(process.env.SINK_FORCE_ERROR || 'false').toLowerCase() === 'true';
const redis = new Redis(REDIS_URL);

app.post('/sink', async (req, res) => {
  const idempotencyKey = req.header('X-Idempotency-Key');
  if (!idempotencyKey) return res.status(400).json({ error: 'Missing X-Idempotency-Key' });
  try {
    const set = await redis.set(`sink:idem:${idempotencyKey}`, '1', 'NX', 'EX', 86400);
    if (set === null) {
      return res.status(200).json({ duplicate: true });
    }
    if (FORCE_ERROR) return res.status(500).json({ ok: false, forced: true });
    console.log('SINK RECEIVED:', JSON.stringify(req.body));
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'sink error' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Sink running on port ${PORT}`);
});
