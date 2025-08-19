require('dotenv').config();
const mongoose = require('mongoose');
const Redis = require('ioredis');
const { Queue, Worker: BullWorker } = require('bullmq');
const crypto = require('crypto');
const fetch = require('node-fetch');
const pino = require('pino');

const logger = pino({ name: 'droplater-worker', level: process.env.LOG_LEVEL || 'info' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/droplater';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || '5000');
const BACKOFF_LIST = (process.env.DELIVERY_BACKOFF_MS || '1000,5000,25000')
  .split(',')
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x) && x > 0);
const MAX_ATTEMPTS = Number(process.env.MAX_DELIVERY_ATTEMPTS || BACKOFF_LIST.length || 3);

const redis = new Redis(REDIS_URL);

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB connected');
    try {
      const Note = require('./models/note');
      await Note.syncIndexes();
      logger.info('Note indexes synced');
    } catch (e) {
      logger.error({ err: e }, 'Failed to sync Note indexes');
    }
  } catch (err) {
    logger.error({ err }, 'MongoDB connection error');
  }

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error({ err }, 'Redis error'));


  const bullConnection = (() => {
    try {
      const url = new URL(REDIS_URL);
      return { host: url.hostname, port: Number(url.port || 6379), maxRetriesPerRequest: null };
    } catch {
      return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
    }
  })();
  const queue = new Queue('deliver-note', { connection: bullConnection });

  const bullWorker = new BullWorker(
    'deliver-note',
    async (job) => {
      const Note = require('./models/note');
      const noteId = job.data.noteId;
      const idempotencyKey = job.data.idempotencyKey;
      const lockKey = `note:lock:${noteId}`;

      const note = await Note.findById(noteId);
      if (!note) {
        logger.warn({ noteId }, 'Note not found, skipping');
        await redis.del(lockKey);
        return;
      }
      if (note.status === 'delivered' || note.status === 'dead') {
        await redis.del(lockKey);
        return;
      }

      const startedAt = Date.now();
      let response;
      let ok = false;
      let statusCode = 0;
      let errorMessage = '';
      try {
        response = await fetch(note.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Note-Id': note._id.toString(),
            'X-Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            id: note._id.toString(),
            title: note.title,
            body: note.body,
            releaseAt: note.releaseAt.toISOString(),
          }),
        });
        statusCode = response.status;
        ok = response.ok;
        if (!ok) {
          errorMessage = `Non-2xx status`;
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        ok = false;
        errorMessage = err && err.message ? err.message : 'request failed';
      }


      note.attempts.push({
        at: new Date(),
        statusCode,
        ok,
        error: ok ? undefined : errorMessage,
      });

      if (ok) {
        note.status = 'delivered';
        note.deliveredAt = new Date();
        await note.save();
        await redis.del(lockKey);
        logger.info({ noteId, try: job.attemptsMade + 1, statusCode, ok, ms: Date.now() - startedAt }, 'Delivered');
        return;
      }

      const attemptNumber = job.attemptsMade + 1;
      const isFinal = attemptNumber >= MAX_ATTEMPTS;
      note.status = isFinal ? 'dead' : 'failed';
      await note.save();
      logger.warn({ noteId, try: attemptNumber, statusCode, ok, ms: Date.now() - startedAt, error: errorMessage }, isFinal ? 'Final fail, marked dead' : 'Attempt failed');

      if (isFinal) {
        await redis.del(lockKey);
      }

    
      throw new Error(errorMessage || 'delivery failed');
    },
    {
      connection: bullConnection,
      concurrency: 5,
      settings: {
        backoffStrategies: {
          linearList: (attemptsMade) => BACKOFF_LIST[attemptsMade] || BACKOFF_LIST[BACKOFF_LIST.length - 1] || 1000,
        },
      },
    }
  );

  bullWorker.on('error', (err) => logger.error({ err }, 'Bull worker error'));

  async function enqueueDueNotes() {
    try {
      const Note = require('./models/note');
      const now = new Date();
      const due = await Note.find({ status: 'pending', releaseAt: { $lte: now } }).limit(50).lean();
      for (const n of due) {
        const lockKey = `note:lock:${n._id.toString()}`;
        const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 120);
        if (!acquired) continue;
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${n._id.toString()}:${new Date(n.releaseAt).toISOString()}`)
          .digest('hex');
        await queue.add(
          'deliver',
          { noteId: n._id.toString(), idempotencyKey },
          {
            jobId: n._id.toString(),
            attempts: MAX_ATTEMPTS,
            backoff: { type: 'linearList' },
            removeOnComplete: true,
            removeOnFail: true,
          }
        );
      }
    } catch (err) {
      logger.error({ err }, 'Failed to enqueue due notes');
    }
  }

  setInterval(enqueueDueNotes, POLL_INTERVAL_MS);
  logger.info('Worker is running and polling for due notes');
}

start();
