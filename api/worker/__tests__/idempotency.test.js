const { generateIdempotencyKey } = require('../lib/idempotency');

test('generates stable sha256 for noteId + releaseAt', () => {
  const k1 = generateIdempotencyKey('abc123', '2020-01-01T00:00:00.000Z');
  const k2 = generateIdempotencyKey('abc123', '2020-01-01T00:00:00.000Z');
  expect(k1).toBe(k2);
  const k3 = generateIdempotencyKey('abc123', '2020-01-01T00:00:01.000Z');
  expect(k3).not.toBe(k1);
});


