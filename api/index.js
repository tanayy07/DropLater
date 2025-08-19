const express = require('express');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const dayjs = require('dayjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());
// CORS for admin dev server (when calling API directly via axios baseURL)
app.use((req, res, next) => {
  const allowed = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.ADMIN_ORIGIN,
  ].filter(Boolean));
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/droplater';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || '60');


function sendError(res, status, message, details) {
  return res.status(status).json({ error: message, details });
}


mongoose.connect(MONGODB_URI).then(async () => {
  console.log('API: MongoDB connected');
  try {
    const Note = require('./models/note');
    await Note.syncIndexes();
    console.log('API: Note indexes synced');
  } catch (e) {
    console.error('API: Failed to sync Note indexes', e);
  }
}).catch((err) => {
  console.error('API: MongoDB connection error', err);
});


const redis = new Redis(REDIS_URL);
redis.on('connect', () => console.log('API: Redis connected'));
redis.on('error', (err) => console.error('API: Redis error', err));

app.get('/', function (req, res) {
  res.send('API is running!');
});

app.get('/health', async (req, res) => {
  try {
    const redisPing = await redis.ping();
    const mongoReady = mongoose.connection.readyState === 1;
    res.status(200).json({ ok: true, mongo: mongoReady ? 'up' : 'down', redis: redisPing === 'PONG' ? 'up' : 'down' });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});


const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
});
app.use(limiter);


app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== ADMIN_TOKEN) return sendError(res, 401, 'Unauthorized');
  next();
});


const createNoteSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  releaseAt: z.string().datetime(),
  webhookUrl: z.string().url()
});


app.post('/api/notes', async (req, res) => {
  try {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, 'Invalid payload', parsed.error.issues);
    const { title, body, releaseAt, webhookUrl } = parsed.data;
    const Note = require('./models/note');
    const note = await Note.create({
      title,
      body,
      releaseAt: dayjs(releaseAt).toDate(),
      webhookUrl,
      status: 'pending',
      attempts: [],
      deliveredAt: null
    });
    return res.status(201).json({ id: note._id.toString() });
  } catch (err) {
    return sendError(res, 500, 'Internal error');
  }
});

app.get('/api/notes', async (req, res) => {
  try {
    const status = req.query.status;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = 20;
    const Note = require('./models/note');
    const query = {};
    if (status) query.status = status;
    const [items, total] = await Promise.all([
      Note.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Note.countDocuments(query)
    ]);
    const mapped = items.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      status: n.status,
      lastAttemptCode: n.attempts.length ? n.attempts[n.attempts.length - 1].statusCode : null
    }));
    return res.json({ page, pageSize, total, items: mapped });
  } catch (err) {
    return sendError(res, 500, 'Internal error');
  }
});

app.post('/api/notes/:id/replay', async (req, res) => {
  try {
    const id = req.params.id;
    const Note = require('./models/note');
    const note = await Note.findById(id);
    if (!note) return sendError(res, 404, 'Not found');
    if (note.status === 'dead' || note.status === 'failed') {
      note.status = 'pending';
      await note.save();
      return res.json({ ok: true });
    }
    return sendError(res, 400, 'Only failed or dead notes can be replayed');
  } catch (err) {
    return sendError(res, 500, 'Internal error');
  }
});


app.delete('/api/notes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const Note = require('./models/note');
    const deleted = await Note.findByIdAndDelete(id);
    if (!deleted) return sendError(res, 404, 'Not found');
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, 'Internal error');
  }
});


app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    const indexPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.send('Admin UI not built yet. Build admin and mount to /app/public.');
  });
  

app.listen(PORT, function ()  {
  console.log(`API running on port ${PORT}`);
});
