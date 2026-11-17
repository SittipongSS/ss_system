// ตัวห่อ route ของ /api/ext/v1 — ยืนยันคีย์ทุกคำขอ · จดประวัติทุกครั้ง (ผ่าน/ไม่ผ่าน) · ไม่เปิด CORS · ทุก route ใต้ ext ผ่านตัวห่อ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extApiGet } from './handler.js';
import { callLogRow } from './callLog.js';

const req = (url, headers = {}) => new Request(url, { headers });
const harness = (auth) => {
  const logs = [];
  let t = 1000;
  const deps = {
    getSupabase: () => ({ fake: true }),
    authenticate: async () => auth,
    record: async (_db, row) => { logs.push(row); },
    clock: () => (t += 5),
  };
  return { logs, deps };
};

test('คีย์ไม่ผ่าน: ตอบตามตัวยืนยัน · จดประวัติ clientId = null · ไม่เรียกงานจริง', async () => {
  const { logs, deps } = harness({ status: 401, error: 'invalid_key', message: 'x' });
  let ran = false;
  const GET = extApiGet(async () => { ran = true; return { body: {} }; }, deps);
  const res = await GET(req('https://suk.example/api/ext/v1/sales-orders?after=1', { authorization: 'Bearer bad' }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'invalid_key');
  assert.equal(ran, false);
  assert.deepEqual([logs[0].clientId, logs[0].status], [null, 401]);
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'ไม่เปิด CORS');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('ผ่าน: ส่ง params ของ route · จด clientId + rowCount · งานพัง = 500 ข้อความกลาง (ไม่หลุดรายละเอียด)', async () => {
  const { logs, deps } = harness({ client: { id: 'APC-1' } });
  const GET = extApiGet(async ({ params }) => ({ body: { got: params.orderNumber }, rowCount: 1 }), deps);
  const res = await GET(req('https://suk.example/api/ext/v1/sales-orders/SO-1'), { params: Promise.resolve({ orderNumber: 'SO-1' }) });
  assert.deepEqual([res.status, await res.json()], [200, { got: 'SO-1' }]);
  assert.deepEqual([logs[0].clientId, logs[0].status, logs[0].rowCount], ['APC-1', 200, 1]);
  const boom = extApiGet(async () => { throw new Error('relation "secret_table" does not exist'); }, deps);
  const err = await boom(req('https://suk.example/api/ext/v1/sales-orders'));
  const body = await err.json();
  assert.equal(err.status, 500);
  assert.ok(!JSON.stringify(body).includes('secret_table'), 'ข้อความ error ภายในต้องไม่หลุดถึงปลายทาง');
  assert.equal(logs[1].status, 500);
});

test('ประวัติการเรียก: เก็บ path + query (ตัด 500) · ไม่มี header คีย์ · ip ตัวแรก · ระยะเวลา', () => {
  const row = callLogRow({ url: `https://suk.example/api/ext/v1/sales-orders?after=1&x=${'y'.repeat(900)}`, status: 200, startedAt: 100, now: 142, ip: '1.2.3.4, 10.0.0.1', rowCount: 3 });
  assert.equal(row.path, '/api/ext/v1/sales-orders');
  assert.equal(row.query.length, 500);
  assert.equal(row.ip, '1.2.3.4');
  assert.equal(row.durationMs, 42);
  assert.ok(!('authorization' in row) && !JSON.stringify(row).includes('ssk_'));
});

/* ⚠️ /api/ext/v1/** ข้ามด่าน session ของ proxy ⇒ route ทุกไฟล์ใต้ app/api/ext ต้องตรวจคีย์ผ่าน extApiGet และอ่านอย่างเดียว */
test('ทุก route ใต้ app/api/ext: export GET = extApiGet(...) เท่านั้น · ไม่มีเมธอดเขียน', () => {
  const root = new URL('../../app/api/ext/', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'route.js') files.push(full);
    }
  };
  walk(root);
  assert.ok(files.length >= 2);
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /export const GET = extApiGet\(/, file);
    assert.doesNotMatch(src, /export (const|async function|function) (POST|PUT|PATCH|DELETE)\b/, file);
    assert.doesNotMatch(src, /getCurrentUser|withUser/, `${file}: ไม่มี session ให้ใช้`);
  }
});
