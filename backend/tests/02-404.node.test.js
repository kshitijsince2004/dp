import test, { after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import app from '../src/app.js';
import db from '../src/config/db.js';

after(async () => {
  await db.destroy();
});

test('Unknown route returns 404 JSON', async () => {
  const res = await supertest(app).get('/api/v1/__nope__');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.success, false);
  assert.ok(typeof res.body.message === 'string');
});
