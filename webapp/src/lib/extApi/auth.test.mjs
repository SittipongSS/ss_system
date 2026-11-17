// ยืนยันตัวของ API ภายนอก — ทุกทางที่ไม่ผ่าน · ทางผ่าน · ฐานล่ม ≠ คีย์ผิด
import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateApiClient, parseApiKey, sha256Hex } from './auth.js';
import { newApiKey } from '../../../scripts/issue-api-key.mjs';
import { fakeDb } from './fakeDb.testutil.mjs';

const SECRET = 'abcdefghijklmnopqrstuvwxyzABCDEF0123456789';
const TOKEN = `ssk_k1k2k3k4_${SECRET}`;
const client = (over = {}) => ({ id: 'APC-1', name: 'ทีม X', keyId: 'k1k2k3k4', keyHash: sha256Hex(SECRET), scopes: ['so:read'], revokedAt: null, lastUsedAt: null, ...over });

test('แกะ header: ต้องเป็น Bearer ssk_<8 ตัว>_<secret ≥32> เท่านั้น', () => {
  assert.deepEqual(parseApiKey(`Bearer ${TOKEN}`), { keyId: 'k1k2k3k4', secret: SECRET });
  for (const bad of [null, '', TOKEN, `Basic ${TOKEN}`, 'Bearer ssk_short_x', `Bearer ssk_K1K2K3K4_${SECRET}`, `Bearer xyz_k1k2k3k4_${SECRET}`, `Bearer ssk_k1k2k3k4_${SECRET} extra`]) {
    assert.equal(parseApiKey(bad), null, String(bad));
  }
});

test('ไม่ผ่าน = 401 รูปเดียวกันทุกทาง (ไม่บอกว่าผิดที่ keyId หรือ secret)', async () => {
  const cases = [
    [undefined, [client()]],
    ['Bearer nope', [client()]],
    [`Bearer ssk_zzzzzzzz_${SECRET}`, [client()]],
    [`Bearer ssk_k1k2k3k4_${'x'.repeat(40)}`, [client()]],
    [`Bearer ${TOKEN}`, [client({ revokedAt: '2026-11-17T00:00:00Z' })]],
  ];
  for (const [header, rows] of cases) {
    const res = await authenticateApiClient(fakeDb({ api_clients: rows }), header);
    assert.deepEqual([res.status, res.error], [401, 'invalid_key'], String(header));
    assert.equal(res.client, undefined);
  }
});

test('คีย์ถูกแต่ไม่มี scope = 403 missing_scope · อ่านฐานไม่ได้ = 500 (ห้ามตอบ 401)', async () => {
  const noScope = await authenticateApiClient(fakeDb({ api_clients: [client({ scopes: [] })] }), `Bearer ${TOKEN}`);
  assert.deepEqual([noScope.status, noScope.error], [403, 'missing_scope']);
  const down = await authenticateApiClient(fakeDb({ api_clients: [client()] }, { failOn: () => true }), `Bearer ${TOKEN}`);
  assert.equal(down.status, 500);
});

test('ผ่าน: คืนแถวไม่มี keyHash · อัปเดต lastUsedAt ไม่เกินนาทีละครั้ง', async () => {
  const db = fakeDb({ api_clients: [client()] });
  const now = new Date('2026-11-17T03:00:00Z');
  const ok = await authenticateApiClient(db, `Bearer ${TOKEN}`, { now });
  assert.equal(ok.client.id, 'APC-1');
  assert.ok(!('keyHash' in ok.client));
  assert.equal(db.tables.api_clients[0].lastUsedAt, now.toISOString());
  const writesBefore = db.calls.filter((c) => c.op === 'update').length;
  await authenticateApiClient(db, `Bearer ${TOKEN}`, { now: new Date(now.getTime() + 30_000) });
  assert.equal(db.calls.filter((c) => c.op === 'update').length, writesBefore, 'ภายในหนึ่งนาทีไม่เขียนซ้ำ');
  await authenticateApiClient(db, `Bearer ${TOKEN}`, { now: new Date(now.getTime() + 61_000) });
  assert.equal(db.calls.filter((c) => c.op === 'update').length, writesBefore + 1);
});

test('สคริปต์ออกคีย์: คีย์ที่สุ่มได้ผ่านตัวแกะ และ hash ตรงกับ secret', () => {
  for (let i = 0; i < 50; i += 1) {
    const { keyId, secret, token, keyHash } = newApiKey();
    assert.deepEqual(parseApiKey(`Bearer ${token}`), { keyId, secret });
    assert.equal(keyHash, sha256Hex(secret));
    assert.match(keyHash, /^[0-9a-f]{64}$/);
  }
});
