const crypto = require('crypto');

function generateIdempotencyKey(noteId, releaseAtIso) {
  const input = `${noteId}:${releaseAtIso}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

module.exports = { generateIdempotencyKey };


