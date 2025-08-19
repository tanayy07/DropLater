const fetch = require('node-fetch');

async function deliverNote(note, idempotencyKey) {
  const response = await fetch(note.webhookUrl, {
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
  return { ok: response.ok, status: response.status };
}

module.exports = { deliverNote };


