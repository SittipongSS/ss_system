// ── เปลือกสคริปต์ backfill "ต้องวางบิลไหม" (scripts/backfill-billing-need-v4.mjs · มติข้อ 4 ทาง 3 · ⛔ เตรียมไว้ ห้ามรันเอง) ──
// ⭐ ตรึงส่วนที่ตัวรัน (billingRuleV4Backfill.test.mjs) ไม่ครอบ — ตัวต่อฐานจริง:
//   1. ค่าตั้งต้น = ซ้อมแห้ง: อ่านอย่างเดียว พิมพ์แผน ไม่มี update/insert ไม่มีไฟล์สำรอง · `--out` เก็บรายชื่อให้คนตรวจ
//   2. `--apply`: สำรองค่าเดิมก่อน PATCH แถวแรก · PATCH ต่อแถวมีเงื่อนไข `billingRuleUpdatedAt` (สตริงดิบ · null ⇒ is.null)
//      · ตรา 'migration-0393' + ชื่อ "ระบบ · ต้องวางบิลไหม ตามมติข้อ 4 (ทาง 3)" · audit_logs ต่อแถว before/after · ไม่แตะ updatedAt
//   3. หยุดก่อนแถวแรก: ด่านหยุด (งวดเปิดที่มีวันวางบิลของลูกค้าที่จะเป็น "ไม่ต้องวางบิล") · ฐานยังไม่รัน 0393
//   4. มีคนแก้ระหว่างรัน = ข้าม ไม่ audit · PATCH พัง = หยุดทั้งรอบ exit 1
// ⚠️ ของปลอมแทนฐานทั้งหมด — ไม่มีเทสต์ไหนแตะฐานจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_OPTION, STAMP_ID, main, makeIo, parseArgs, planDocument, planLines,
} from '../../../scripts/backfill-billing-need-v4.mjs';

const FIXTURES = JSON.parse(readFileSync(new URL('./billingRuleFixtures.json', import.meta.url), 'utf8'));
const NOW = '2026-10-05T01:30:00.000Z';
const RAW_0390 = '2026-09-26T10:00:00.123456+00:00'; // ⚠️ ไมโครวินาที — ผ่าน Date ของ JS แล้วหาย ⇒ ตัวล็อกไม่ตรงแถวไหน

/* ฐานปลอมแบบ PostgREST ย่อ — จดทุกคำสั่งตามลำดับ (`events`) */
function fakeDb({ customers = [], installments = [], orders = [], billingSkipReady = true, changedIds = new Set(), updateError = null, auditError = null } = {}) {
  const events = [];
  const tables = { customers, sales_order_installments: installments, sales_orders: orders };
  const from = (table) => {
    const q = { table, filters: [], op: 'select', cols: '', body: null };
    const run = async () => {
      if (q.op === 'insert') {
        events.push(['insert', table, q.body]);
        return { data: null, error: table === 'audit_logs' ? auditError : null };
      }
      if (q.op === 'update') {
        events.push(['update', table, q.body, q.filters]);
        if (updateError) return { data: null, error: updateError };
        const id = q.filters.find(([op, col]) => op === 'eq' && col === 'id')?.[2];
        return { data: changedIds.has(id) ? [] : [{ id, billingRuleUpdatedAt: q.body.billingRuleUpdatedAt }], error: null };
      }
      events.push(['select', table, q.cols, q.filters]);
      if (table === 'sales_order_installments' && q.cols === 'billingSkip') {
        return billingSkipReady ? { data: [], error: null } : { data: null, error: { code: '42703', message: 'column sales_order_installments.billingSkip does not exist' } };
      }
      let rows = tables[table] || [];
      for (const [op, col, value] of q.filters) {
        if (op === 'in') rows = rows.filter((r) => value.includes(r[col]));
        if (op === 'not-null') rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
      }
      if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
      return { data: rows, error: null };
    };
    const chain = {
      select(cols) { if (q.op === 'select') q.cols = cols; else q.returning = cols; return chain; },
      update(body) { q.op = 'update'; q.body = body; return chain; },
      insert(body) { q.op = 'insert'; q.body = body; return run(); },
      eq(col, value) { q.filters.push(['eq', col, value]); return chain; },
      is(col, value) { q.filters.push(['is', col, value]); return chain; },
      in(col, value) { q.filters.push(['in', col, value]); return chain; },
      not(col, op, value) { if (op === 'is' && value === null) q.filters.push(['not-null', col]); return chain; },
      order() { return chain; },
      limit() { return run(); },
      range(a, b) { q.range = [a, b]; return run(); },
      then(resolve, reject) { return run().then(resolve, reject); },
    };
    return chain;
  };
  return { events, supabase: { from } };
}

/* ลูกค้าชุดเล็กจากรายชื่อจริงของไฟล์ตัวอย่าง (ทาง 3) */
const CUSTOMERS = () => [
  { id: 'c018', arCode: 'AR-018', billingRule: { credit: false }, billingRuleUpdatedAt: RAW_0390, billingRuleUpdatedById: 'migration-0390', billingRuleUpdatedByName: 'ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)' }, // โอนก่อน → ไม่ต้องวางบิล
  { id: 'c112', arCode: 'AR-112', billingRule: { credit: false }, billingRuleUpdatedAt: RAW_0390, billingRuleUpdatedById: 'migration-0390', billingRuleUpdatedByName: 'x' }, // เคยขอ → ชำระวันวางบิล
  { id: 'c108', arCode: 'AR-108', billingRule: null, billingRuleUpdatedAt: null }, // เคยขอ (ยังไม่ตั้ง) → ยังไม่ตั้งรอบ
  { id: 'c999', arCode: 'AR-999', billingRule: { credit: false, note: 'ลูกค้าเก่า' }, billingRuleUpdatedAt: RAW_0390 }, // ไม่มีหลักฐาน → ยังไม่ระบุ
  { id: 'c777', arCode: 'AR-777', billingRule: null, billingRuleUpdatedAt: null }, // ยังไม่ระบุอยู่แล้ว — ไม่เขียน
  { id: 'c109', arCode: 'AR-109', billingRule: null, billingRuleUpdatedAt: null }, // สหมิตร — ไม่แตะ
  { id: 'c281', arCode: 'AR-281', billingRule: { billing: { mode: 'monthly', days: [21] }, payment: { mode: 'monthly', rounds: [{ day: 30, monthOffset: 1 }] } }, billingRuleUpdatedAt: '2026-09-28T03:50:00+00:00' },
];

const run = async ({ argv = [], db = fakeDb({ customers: CUSTOMERS() }) } = {}) => {
  const lines = [];
  const files = [];
  const code = await main({
    argv, supabase: db.supabase, fixtures: FIXTURES, log: (l) => lines.push(l), now: () => NOW,
    writeFile: (file, text) => { files.push([file, JSON.parse(text)]); db.events.push(['file', file]); },
    backupDir: '/tmp/never-used-in-test',
  });
  return { code, lines, files, events: db.events };
};
const writes = (events) => events.filter(([op]) => op === 'update' || op === 'insert');

test('parseArgs: ตั้งต้น = ทาง 3 ซ้อมแห้ง · --dry-run ชนะ --apply เสมอ · ค่าผิด = error', () => {
  assert.equal(DEFAULT_OPTION, 3);
  assert.deepEqual(parseArgs([]), { option: 3, apply: false, out: '', help: false, error: '' });
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.equal(parseArgs(['--apply', '--dry-run']).apply, false);
  assert.equal(parseArgs(['--dry-run', '--apply']).apply, false, 'สองอันขัดกัน = ไม่เขียน');
  assert.equal(parseArgs(['--option=1']).option, 1);
  assert.equal(parseArgs(['--option', '4']).option, 4);
  assert.equal(parseArgs(['--out=plan.json']).out, 'plan.json');
  assert.match(parseArgs(['--option=9']).error, /1–4/);
  assert.match(parseArgs(['--force']).error, /ไม่รู้จัก/);
});

test('⭐ ซ้อมแห้ง (ค่าตั้งต้น): อ่านอย่างเดียว · พิมพ์แผนจัดกลุ่มตามปลายทาง · ไม่มี update/insert/ไฟล์สำรอง', async () => {
  const { code, lines, files, events } = await run();
  assert.equal(code, 0);
  assert.deepEqual(writes(events), []);
  assert.deepEqual(files, [], 'ซ้อมแห้งไม่สร้างไฟล์สำรอง');
  const text = lines.join('\n');
  assert.match(text, /ซ้อมแห้ง — ทาง 3/);
  assert.match(text, /ไม่มีเครดิต · ชำระวันวางบิล → ไม่ต้องวางบิล \(1\): AR-018/);
  assert.match(text, /ไม่มีเครดิต · ชำระวันวางบิล → วางบิลได้ทุกวัน · ชำระวันวางบิล \(1\): AR-112/);
  assert.match(text, /ยังไม่ระบุ → ต้องวางบิล · ยังไม่ตั้งรอบ \(1\): AR-108/);
  assert.match(text, /ไม่มีเครดิต · ชำระวันวางบิล → ยังไม่ระบุ \(1\): AR-999/);
  assert.doesNotMatch(text, /AR-109|AR-281|AR-777/, 'สหมิตร · ตั้งแล้ว · ไม่เปลี่ยน — ไม่อยู่ในแผน');
  assert.match(text, /หมายเหตุเดิมจะหายจากการ์ด.*AR-999/);
  assert.match(text, /ต่างจาก data survey/, 'ชุดเล็กไม่ใช่ 553 ราย — ต้องเตือนให้คนตรวจ');
});

test('ซ้อม + --out: เก็บรายชื่อให้คนตรวจเป็น JSON (ทุกแถวที่จะเขียน · ก่อน/หลัง · ตรา)', async () => {
  const { code, files } = await run({ argv: ['--out=/tmp/plan.json'] });
  assert.equal(code, 0);
  assert.equal(files.length, 1);
  const [file, doc] = files[0];
  assert.equal(file, '/tmp/plan.json');
  assert.equal(doc.apply, false);
  assert.equal(doc.stampId, STAMP_ID);
  assert.equal(doc.stampName, 'ระบบ · ต้องวางบิลไหม ตามมติข้อ 4 (ทาง 3)');
  assert.deepEqual(doc.changes.map((c) => c.arCode).sort(), ['AR-018', 'AR-108', 'AR-112', 'AR-999']);
  assert.deepEqual(doc.counts, { none: 1, required: 2, unknown: 3, untouched: 1 });
  assert.deepEqual(doc.noteLost, ['AR-999']);
});

test('🔴 --apply: สำรองก่อน PATCH แรก · PATCH ต่อแถวมีเงื่อนไขตัวล็อก (สตริงดิบ / is.null) · ตรา migration-0393 · audit ต่อแถว', async () => {
  const { code, events, files, lines } = await run({ argv: ['--apply'] });
  assert.equal(code, 0, lines.join('\n'));
  const firstUpdate = events.findIndex(([op]) => op === 'update');
  const backupAt = events.findIndex(([op]) => op === 'file');
  assert.ok(backupAt >= 0 && backupAt < firstUpdate, 'ไฟล์สำรองต้องมาก่อนแถวแรก');
  const [backupFile, backup] = files[0];
  assert.ok(backupFile.startsWith('/tmp/never-used-in-test/backfill-billing-need-v4-'));
  assert.equal(backup.customers.find((c) => c.arCode === 'AR-018').billingRuleUpdatedAt, RAW_0390, 'ค่าเดิมครบสี่ช่อง');

  const updates = events.filter(([op]) => op === 'update');
  assert.equal(updates.length, 4);
  for (const [, table, body, filters] of updates) {
    assert.equal(table, 'customers');
    assert.deepEqual(Object.keys(body).sort(), ['billingRule', 'billingRuleUpdatedAt', 'billingRuleUpdatedById', 'billingRuleUpdatedByName'],
      'ไม่แตะ updatedAt ของลูกค้า (แบบ 0390) · ไม่เขียนธง legacyNoCredit');
    assert.equal(body.billingRuleUpdatedById, 'migration-0393');
    assert.equal(body.billingRuleUpdatedByName, 'ระบบ · ต้องวางบิลไหม ตามมติข้อ 4 (ทาง 3)');
    assert.equal(body.billingRuleUpdatedAt, NOW);
    assert.ok(body.billingRule === null || !('legacyNoCredit' in body.billingRule));
  }
  const byId = (id) => updates.find(([, , , f]) => f.some(([op, col, v]) => op === 'eq' && col === 'id' && v === id));
  // ตัวล็อก: แถวที่ 0390 เขียน = สตริงดิบตัวอักษรต่อตัวอักษร · แถวที่ไม่เคยตั้ง = is.null
  assert.ok(byId('c018')[3].some(([op, col, v]) => op === 'eq' && col === 'billingRuleUpdatedAt' && v === RAW_0390));
  assert.ok(byId('c108')[3].some(([op, col, v]) => op === 'is' && col === 'billingRuleUpdatedAt' && v === null));
  assert.deepEqual(byId('c018')[2].billingRule, { v: 4, need: 'none' });
  assert.equal(byId('c999')[2].billingRule, null);

  const audits = events.filter(([op, table]) => op === 'insert' && table === 'audit_logs').map(([, , body]) => body);
  assert.equal(audits.length, 4);
  const a018 = audits.find((a) => a.entityId === 'c018');
  assert.equal(a018.entityType, 'customer');
  assert.equal(a018.action, 'update');
  assert.equal(a018.actorId, STAMP_ID);
  assert.deepEqual(a018.before, {
    billingRule: { credit: false }, billingRuleUpdatedAt: RAW_0390, billingRuleUpdatedById: 'migration-0390',
    billingRuleUpdatedByName: 'ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)',
  }, 'audit_logs.before = ทางกู้ (ไม่มีถังขยะ)');
  assert.deepEqual(a018.after.billingRule, { v: 4, need: 'none' });
  assert.equal(a018.after.billingRuleUpdatedById, STAMP_ID);
  assert.match(a018.summary, /AR-018 → ไม่ต้องวางบิล$/);
  assert.ok(lines.some((l) => /เขียนแล้ว 4 แถว · ข้าม 0 แถว/.test(l)));
});

test('🔴 ด่านหยุด: ลูกค้าที่จะเป็น "ไม่ต้องวางบิล" มีงวดเปิดที่มีวันวางบิล = ออกก่อนแถวแรก (ไม่มีไฟล์สำรอง ไม่มี PATCH)', async () => {
  const db = fakeDb({
    customers: CUSTOMERS(),
    installments: [{ id: 'I-1', salesOrderId: 'SO-1', status: 'pending', kind: 'regular', billingDate: '2026-10-10', refundedAt: null }],
    orders: [{ id: 'SO-1', customerId: 'c018', status: 'approved' }],
  });
  const { code, lines, files, events } = await run({ argv: ['--apply'], db });
  assert.equal(code, 1);
  assert.deepEqual(writes(events), []);
  assert.deepEqual(files, []);
  assert.ok(lines.some((l) => /หยุด: 1 งวดเปิด/.test(l)));
  assert.ok(lines.some((l) => /⛔ งวดที่หยุดทั้งรอบ: I-1 \(2026-10-10\)/.test(l)));
});

test('ด่านหยุดดูเฉพาะใบที่ยังใช้ — งวดของใบยกเลิก/ถูกออก Rev. ทับ · งวดคืนเงินแล้ว ไม่หยุด · ใบหาไม่เจอ = หยุดไว้ก่อน', async () => {
  const dated = (id, over = {}) => ({ id, salesOrderId: id.replace('I', 'SO'), status: 'pending', kind: 'regular', billingDate: '2026-10-10', refundedAt: null, ...over });
  const db = fakeDb({
    customers: CUSTOMERS(),
    installments: [dated('I-1'), dated('I-2'), dated('I-3', { refundedAt: '2026-09-01T00:00:00Z' })],
    orders: [{ id: 'SO-1', customerId: 'c018', status: 'cancelled' }, { id: 'SO-2', customerId: 'c018', status: 'revised' }, { id: 'SO-3', customerId: 'c018', status: 'approved' }],
  });
  const { io } = makeIo(db.supabase);
  assert.deepEqual(await io.loadDatedOpenInstallments(), []);
  const orphan = fakeDb({ customers: CUSTOMERS(), installments: [dated('I-9')], orders: [] });
  const [row] = await makeIo(orphan.supabase).io.loadDatedOpenInstallments();
  assert.deepEqual(row, { id: 'I-9', customerId: null, status: 'pending', kind: 'regular', billingDate: '2026-10-10' });
});

test('⛔ ฐานยังไม่รัน 0393: --apply ออกทันทีไม่อ่านไม่เขียน · ซ้อมแห้งยังพิมพ์แผนได้พร้อมคำเตือน', async () => {
  const apply = await run({ argv: ['--apply'], db: fakeDb({ customers: CUSTOMERS(), billingSkipReady: false }) });
  assert.equal(apply.code, 1);
  assert.deepEqual(writes(apply.events), []);
  assert.ok(!apply.events.some(([op, table]) => op === 'select' && table === 'customers'), 'ไม่เริ่มอ่านลูกค้าด้วยซ้ำ');
  assert.ok(apply.lines.some((l) => /ยังไม่รัน migration 0393/.test(l)));
  const dry = await run({ db: fakeDb({ customers: CUSTOMERS(), billingSkipReady: false }) });
  assert.equal(dry.code, 0);
  assert.ok(dry.lines.some((l) => /ซ้อมได้ แต่เขียนจริงไม่ได้/.test(l)));
});

test('มีคนแก้ระหว่างรัน (ตัวล็อกไม่ตรง) = ข้าม ไม่ audit · PATCH พัง = หยุดทั้งรอบ exit 1 พร้อมจำนวนที่เขียนไปแล้ว', async () => {
  const changed = await run({ argv: ['--apply'], db: fakeDb({ customers: CUSTOMERS(), changedIds: new Set(['c112']) }) });
  assert.equal(changed.code, 0);
  const audited = changed.events.filter(([op, t]) => op === 'insert' && t === 'audit_logs').map(([, , b]) => b.entityId);
  assert.ok(!audited.includes('c112'));
  assert.equal(audited.length, 3);
  assert.ok(changed.lines.some((l) => /ข้าม AR-112: มีคนแก้ระหว่างรัน/.test(l)));

  const broken = await run({ argv: ['--apply'], db: fakeDb({ customers: CUSTOMERS(), updateError: { code: '23514', message: 'violates check constraint "customers_billing_rule_shape"' } }) });
  assert.equal(broken.code, 1);
  assert.equal(broken.events.filter(([op]) => op === 'update').length, 1, 'หยุดที่แถวแรกที่พัง');
  assert.ok(broken.lines.some((l) => /หยุดกลางทาง: .*23514.* — เขียนไปแล้ว 0 แถว/.test(l)));
});

test('audit ไม่ลง = รายงานเป็น error (exit 1) — แถวถูกเขียนแล้ว ค่าเดิมอยู่ในไฟล์สำรอง', async () => {
  const out = await run({ argv: ['--apply'], db: fakeDb({ customers: CUSTOMERS(), auditError: { message: 'boom' } }) });
  assert.equal(out.code, 1);
  assert.ok(out.lines.some((l) => /audit ไม่ลง 4 แถว/.test(l)));
});

test('planLines / planDocument รับแผนว่างได้ (ตัวรันหยุดก่อนวางแผน)', () => {
  assert.deepEqual(planLines(null), []);
  const doc = planDocument({ ok: false, error: 'x', plan: null, noteLost: [] }, { option: 3, apply: false, at: NOW });
  assert.equal(doc.ok, false);
  assert.deepEqual(doc.changes, []);
});

test('สคริปต์ไม่รันเองตอนถูก import · ไม่มีค่าลับในไฟล์ · อ่านรายชื่อจากไฟล์ตัวอย่างชุดเดียวกับเทสต์ตัวคิด', () => {
  const src = readFileSync(new URL('../../../scripts/backfill-billing-need-v4.mjs', import.meta.url), 'utf8');
  assert.match(src, /const isMain = process\.argv\[1\] && import\.meta\.url === pathToFileURL/);
  assert.match(src, /billingRuleFixtures\.json/);
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{20,}/, 'ห้ามฝังคีย์');
  assert.match(src, /⛔ \*\*เตรียมไว้ ห้ามรันจริงเอง\*\*/);
});
