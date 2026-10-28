// คำร้องขอเอกสารการเงินของงวด — หลายคำร้องต่องวด (mig 0413 · มติเจ้าของ 28/10/2026)
// ⭐ สิ่งที่ล็อก: กติกา "คำร้องของงวด" ตัวเดียว (installmentId ∪ ตัวชี้รุ่นเก่า) · ตัวแทน (ส่งแล้วก่อน) · ตัวชี้ = คำร้องแรก ·
//   ตัวโหลด/ตัวซิงก์/ตัวผูกตามเลข/ตัวปล่อย (ฐานปลอม) · รูปของไฟล์ migration 0413
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BILLING_INSTALLMENT_SCHEMA_MISSING, billingInstallmentSchemaError, billingPointerFor, installmentRequestLive,
  installmentRequestedIds, installmentRequests, primaryInstallmentRequest,
} from './installmentRequests.js';
import {
  claimPendingRequests, detachRequestFromInstallments, loadInstallmentRequests, loadRequestInstallments,
  releaseInstallmentRequests, syncBillingPointers,
} from './installmentRequestsStore.js';
import { billingRequestedIds, installmentBillingRequested } from './salesOrderPayments.js';

const at = (day) => `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`;
const req = (id, status, installmentId, day = 1) => ({ id, status, installmentId, createdAt: at(day) });

// ── 1. กติกาล้วน ─────────────────────────────────────────────────────────────────────────────
test('installmentRequests: คำร้องที่ installmentId ชี้งวด ∪ ตัวชี้รุ่นเก่า (คำร้องที่ยังไม่รู้งวดตัวเอง) · เก่าก่อน', () => {
  const row = { id: 'I1', billingRequestId: 'R0' };
  const requests = new Map([
    ['R2', req('R2', 'pending', 'I1', 5)],
    ['R1', req('R1', 'draft', 'I1', 3)],
    ['R0', req('R0', 'closed', null, 1)], // ลิงก์รุ่นก่อน 0413
    ['R9', req('R9', 'pending', 'I2', 2)], // งวดอื่น
  ]);
  assert.deepEqual(installmentRequests(row, requests).map((r) => r.id), ['R0', 'R1', 'R2']);
  // ตัวชี้ค้างชี้คำร้องที่ย้ายไปงวดอื่นแล้ว = ไม่นับ (คำร้องหนึ่งใบเกาะได้งวดเดียว)
  assert.deepEqual(installmentRequests({ id: 'I1', billingRequestId: 'R9' }, requests).map((r) => r.id), ['R1', 'R2']);
  // ฐานยังไม่รัน 0413 — แถวไม่มีคีย์ installmentId ⇒ ถอยไปใช้ตัวชี้อย่างเดียว
  assert.deepEqual(installmentRequests({ id: 'I1', billingRequestId: 'R0' }, [{ id: 'R0', status: 'pending' }]).map((r) => r.id), ['R0']);
  assert.deepEqual(installmentRequests({ id: 'I3' }, requests), []);
  assert.deepEqual(installmentRequests(null, requests), []);
  assert.deepEqual(installmentRequests(row, null), []);
});

test('installmentRequestLive / installmentBillingRequested: ขอแล้ว = มีใบที่ส่งแล้วและยังไม่ยกเลิกอย่างน้อยหนึ่งใบ', () => {
  const row = { id: 'I1', billingRequestId: 'R1' };
  const map = (...rows) => new Map(rows.map((r) => [r.id, r]));
  // ⭐ ใบแรก (ตัวชี้) ยกเลิกแล้ว แต่มีใบที่สองที่ส่งแล้ว = ยังนับว่าขอแล้ว (รุ่น 0260 ตอบผิดว่า "ยังไม่ขอ")
  const two = map(req('R1', 'cancelled', 'I1', 1), req('R2', 'pending', 'I1', 2));
  assert.equal(installmentRequestLive(row, two), true);
  assert.equal(installmentBillingRequested(row, two), true, 'ตัวช่วยของแผงงวดตอบตามกติกาเดียวกัน');
  assert.equal(installmentRequestLive(row, map(req('R1', 'draft', 'I1'), req('R2', 'cancelled', 'I1'))), false);
  assert.equal(installmentRequestLive(row, new Map()), false, 'ถูกลบ/อ่านไม่ขึ้น = ยังไม่ขอ');
  assert.deepEqual([...billingRequestedIds([row, { id: 'I2' }], two)], ['I1']);
  assert.deepEqual([...installmentRequestedIds([row, { id: 'I2' }], [...two.values()])], ['I1']);
});

test('primaryInstallmentRequest: ส่งแล้วก่อน → ร่าง → ใบที่ตาย · ไม่มี = null', () => {
  const row = { id: 'I1' };
  assert.equal(primaryInstallmentRequest(row, [req('A', 'cancelled', 'I1', 1), req('B', 'draft', 'I1', 2), req('C', 'pending', 'I1', 3)]).id, 'C');
  assert.equal(primaryInstallmentRequest(row, [req('A', 'cancelled', 'I1', 1), req('B', 'draft', 'I1', 2)]).id, 'B');
  assert.equal(primaryInstallmentRequest(row, [req('A', 'cancelled', 'I1', 1)]).id, 'A');
  assert.equal(primaryInstallmentRequest(row, []), null);
});

test('billingPointerFor: ตัวชี้ = คำร้องแรก (เก่าสุด · ทุกสถานะ) ที่ installmentId ชี้งวด — ไม่นับลิงก์รุ่นเก่า', () => {
  const requests = [req('B', 'pending', 'I1', 5), req('A', 'cancelled', 'I1', 2), req('Z', 'pending', 'I2', 1), req('L', 'pending', null, 1)];
  assert.equal(billingPointerFor('I1', requests), 'A');
  assert.equal(billingPointerFor('I3', requests), null);
  assert.equal(billingPointerFor('', requests), null);
});

test('billingInstallmentSchemaError: เฉพาะคอลัมน์ของ 0413 — อย่างอื่นไม่โทษ migration นี้', () => {
  assert.equal(billingInstallmentSchemaError({ code: 'PGRST204', message: "Could not find the 'installmentSeq' column" }), BILLING_INSTALLMENT_SCHEMA_MISSING);
  assert.equal(billingInstallmentSchemaError({ code: '42703', message: 'column dept_requests.installmentId does not exist' }), BILLING_INSTALLMENT_SCHEMA_MISSING);
  assert.equal(billingInstallmentSchemaError({ code: '42703', message: 'column x.billingSkip does not exist' }), null);
  assert.equal(billingInstallmentSchemaError({ code: '23514', message: 'installmentId' }), null);
  assert.equal(billingInstallmentSchemaError(null), null);
  assert.match(BILLING_INSTALLMENT_SCHEMA_MISSING, /รอรัน migration 0413/);
});

// ── 2. ตัวแตะฐาน (ฐานปลอม: จดทุกคำสั่ง · ตอบตามตาราง) ────────────────────────────────────────────
function fakeDb({ tables = {}, errors = {}, onUpdate = null } = {}) {
  const calls = [];
  const matches = (row, filters) => filters.every(([op, col, val]) => {
    if (op === 'eq') return row[col] === val;
    if (op === 'neq') return row[col] !== val;
    if (op === 'in') return val.includes(row[col]);
    if (op === 'is') return (row[col] ?? null) === val;
    if (op === 'notnull') return row[col] !== null && row[col] !== undefined;
    return true;
  });
  function builder(table) {
    const q = { table, op: 'select', filters: [], patch: null, columns: null };
    calls.push(q);
    const run = () => {
      const failure = (errors[`${table}:${q.op}`] || errors[table])?.(q);
      if (failure) return { data: null, error: failure };
      const rows = (tables[table] || []).filter((row) => matches(row, q.filters));
      if (q.op === 'update') {
        rows.forEach((row) => Object.assign(row, q.patch));
        onUpdate?.(q, rows);
      }
      return { data: rows.map((row) => ({ ...row })), error: null };
    };
    const chain = {
      select(columns) { if (q.op === 'select') q.columns = columns; return chain; },
      update(patch) { q.op = 'update'; q.patch = patch; return chain; },
      eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
      neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
      in(col, val) { q.filters.push(['in', col, val]); return chain; },
      is(col, val) { q.filters.push(['is', col, val]); return chain; },
      not(col) { q.filters.push(['notnull', col]); return chain; },
      order() { return chain; },
      limit() { return chain; },
      async range() { return run(); },
      async maybeSingle() { const out = run(); return { data: out.data?.[0] ?? null, error: out.error }; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return chain;
  }
  return { calls, from: (table) => builder(table) };
}
const missingColumn = (q) => (q.columns?.includes('installmentId') || q.filters.some(([, col]) => col === 'installmentId')
  ? { code: '42703', message: 'column dept_requests.installmentId does not exist' } : null);

test('loadInstallmentRequests: ตามงวด (installmentId) ∪ ตามตัวชี้ที่ยังไม่ได้มา · กรอง billing_doc ทั้งสองเส้น', async () => {
  const db = fakeDb({
    tables: {
      dept_requests: [
        { id: 'R1', kind: 'billing_doc', status: 'pending', installmentId: 'I1' },
        { id: 'R0', kind: 'billing_doc', status: 'closed', installmentId: null },
        { id: 'X', kind: 'document', status: 'pending', installmentId: null },
      ],
    },
  });
  const out = await loadInstallmentRequests(db, [{ id: 'I1', billingRequestId: 'R1' }, { id: 'I2', billingRequestId: 'R0' }]);
  assert.equal(out.error, null);
  assert.equal(out.schemaReady, true);
  assert.deepEqual(out.data.map((r) => r.id).sort(), ['R0', 'R1']);
  const reads = db.calls.filter((c) => c.table === 'dept_requests');
  assert.deepEqual(reads[0].filters, [['in', 'installmentId', ['I1', 'I2']], ['eq', 'kind', 'billing_doc']]);
  assert.deepEqual(reads[1].filters, [['in', 'id', ['R0']], ['eq', 'kind', 'billing_doc']], 'ตัวชี้ที่ได้มาแล้ว (R1) ไม่อ่านซ้ำ');
  assert.match(reads[0].columns, /"installmentId", "installmentSeq", "createdAt"/);
});

test('loadInstallmentRequests: ฐานยังไม่รัน 0413 = ถอยไปอ่านตามตัวชี้ (ไม่เอ่ยคอลัมน์ใหม่) · อ่านพลาดอย่างอื่น = error', async () => {
  const db = fakeDb({
    tables: { dept_requests: [{ id: 'R1', kind: 'billing_doc', status: 'pending' }] },
    errors: { dept_requests: missingColumn },
  });
  const out = await loadInstallmentRequests(db, [{ id: 'I1', billingRequestId: 'R1' }], { select: 'id, status' });
  assert.equal(out.schemaReady, false);
  assert.equal(out.error, null);
  assert.deepEqual(out.data.map((r) => r.id), ['R1']);
  assert.equal(db.calls.at(-1).columns, 'id, status');
  const broken = fakeDb({ errors: { dept_requests: () => ({ code: '08006', message: 'boom' }) } });
  const failed = await loadInstallmentRequests(broken, [{ id: 'I1' }]);
  assert.equal(failed.error.message, 'boom', 'อ่านพลาด ≠ ยังไม่ขอ');
});

test('syncBillingPointers: ตัวชี้ = คำร้องแรก · ไม่มีแล้ว = ว่าง · ลิงก์รุ่นเก่าคงไว้ เว้นแต่สั่ง drop · เขียนเฉพาะแถวที่ต่าง', async () => {
  const tables = {
    dept_requests: [
      { id: 'A', kind: 'billing_doc', installmentId: 'I1', createdAt: at(2) },
      { id: 'B', kind: 'billing_doc', installmentId: 'I1', createdAt: at(1) },
      { id: 'L', kind: 'billing_doc', installmentId: null, createdAt: at(1) },
      { id: 'GONE', kind: 'billing_doc', installmentId: 'I9', createdAt: at(1) },
    ],
    sales_order_installments: [
      { id: 'I1', billingRequestId: 'A' }, // ต้องเป็น B (เก่ากว่า)
      { id: 'I2', billingRequestId: 'GONE' }, // ไม่มีคำร้องชี้แล้ว (ย้ายไป I9) = ว่าง
      { id: 'I3', billingRequestId: 'L' }, // ลิงก์รุ่นเก่า = คงไว้
      { id: 'I4', billingRequestId: null }, // ไม่มีอะไร = ไม่เขียน
    ],
  };
  const db = fakeDb({ tables });
  const out = await syncBillingPointers(db, ['I1', 'I2', 'I3', 'I4'], { now: '2026-10-28T00:00:00Z' });
  assert.equal(out.error, null);
  assert.deepEqual(out.changed, [{ id: 'I1', before: 'A', after: 'B' }, { id: 'I2', before: 'GONE', after: null }]);
  assert.equal(tables.sales_order_installments[2].billingRequestId, 'L');
  const writes = db.calls.filter((c) => c.op === 'update');
  assert.deepEqual(writes.map((w) => w.patch), [
    { billingRequestId: 'B', updatedAt: '2026-10-28T00:00:00Z' },
    { billingRequestId: null, updatedAt: '2026-10-28T00:00:00Z' },
  ]);
  // ถอดลิงก์รุ่นเก่า (drop) = ตัวชี้ว่าง
  const dropped = await syncBillingPointers(db, ['I3'], { drop: ['L'] });
  assert.deepEqual(dropped.changed, [{ id: 'I3', before: 'L', after: null }]);
  assert.deepEqual(await syncBillingPointers(db, []), { changed: [], error: null });
});

test('claimPendingRequests: ผูกคำร้องที่เลือกเลขงวดจากแผน QT ตอนสร้างแถว · ข้ามยกเลิก · เติมใบสั่งขาย · CAS · ซิงก์ตัวชี้', async () => {
  const tables = {
    dept_requests: [
      { id: 'P1', kind: 'billing_doc', quotationId: 'QT-1', status: 'pending', salesOrderId: null, installmentId: null, installmentSeq: 1, createdAt: at(1) },
      { id: 'P2', kind: 'billing_doc', quotationId: 'QT-1', status: 'draft', salesOrderId: 'SO-1', installmentId: null, installmentSeq: 2, createdAt: at(2) },
      { id: 'P3', kind: 'billing_doc', quotationId: 'QT-1', status: 'cancelled', salesOrderId: null, installmentId: null, installmentSeq: 1, createdAt: at(3) },
      { id: 'P4', kind: 'billing_doc', quotationId: 'QT-1', status: 'pending', salesOrderId: null, installmentId: null, installmentSeq: 5, createdAt: at(4) },
      { id: 'P5', kind: 'billing_doc', quotationId: 'QT-2', status: 'pending', salesOrderId: null, installmentId: null, installmentSeq: 1, createdAt: at(5) },
    ],
    sales_order_installments: [{ id: 'N1', billingRequestId: null }, { id: 'N2', billingRequestId: null }],
  };
  const db = fakeDb({ tables });
  const out = await claimPendingRequests(db, {
    order: { id: 'SO-1', quotationId: 'QT-1' },
    rows: [{ id: 'N1', seq: 1 }, { id: 'N2', seq: 2 }],
  });
  assert.equal(out.error, null);
  assert.deepEqual(out.claimed, [{ requestId: 'P1', installmentId: 'N1' }, { requestId: 'P2', installmentId: 'N2' }]);
  assert.equal(tables.dept_requests[0].salesOrderId, 'SO-1', 'คำร้องที่ขอจากหน้า QT ได้ใบสั่งขาย');
  assert.equal(tables.dept_requests[2].installmentId, null, 'ยกเลิกแล้วไม่ผูก');
  assert.equal(tables.dept_requests[3].installmentId, null, 'เลขที่ไม่มีในชุด = รอ');
  assert.equal(tables.dept_requests[4].installmentId, null, 'คนละใบเสนอราคา');
  assert.deepEqual(tables.sales_order_installments.map((r) => r.billingRequestId), ['P1', 'P2']);
  const writes = db.calls.filter((c) => c.op === 'update' && c.table === 'dept_requests');
  assert.ok(writes.every((w) => w.filters.some(([op, col, val]) => op === 'is' && col === 'installmentId' && val === null)), 'CAS');
  assert.deepEqual(await claimPendingRequests(db, { order: { id: 'SO-9', quotationId: null }, rows: [{ id: 'N1', seq: 1 }] }), { claimed: [], error: null });
  // ฐานยังไม่รัน 0413 = ไม่มีอะไรรอผูก (ไม่ใช่ error)
  const premig = fakeDb({ errors: { dept_requests: missingColumn } });
  assert.deepEqual(await claimPendingRequests(premig, { order: { id: 'SO-1', quotationId: 'QT-1' }, rows: [{ id: 'N1', seq: 1 }] }), { claimed: [], error: null });
});

test('releaseInstallmentRequests: ล้างทั้ง id และเลข (ไม่อุ้มข้ามการตั้งงวดใหม่) · ฐานยังไม่รัน 0413 = ไม่มีอะไรปล่อย', async () => {
  const tables = { dept_requests: [{ id: 'A', installmentId: 'D1', installmentSeq: 1 }, { id: 'B', installmentId: 'X', installmentSeq: 2 }] };
  const out = await releaseInstallmentRequests(fakeDb({ tables }), ['D1']);
  assert.deepEqual(out, { released: ['A'], error: null });
  assert.deepEqual(tables.dept_requests[0], { id: 'A', installmentId: null, installmentSeq: null });
  assert.equal(tables.dept_requests[1].installmentId, 'X');
  assert.deepEqual(await releaseInstallmentRequests(fakeDb({ errors: { dept_requests: missingColumn } }), ['D1']), { released: [], error: null });
});

test('detachRequestFromInstallments: ล้างลิงก์ของคำร้อง แล้วคำร้องถัดไปของงวดขึ้นเป็นตัวชี้แทน', async () => {
  const tables = {
    dept_requests: [
      { id: 'GO', kind: 'billing_doc', installmentId: 'I1', createdAt: at(1) },
      { id: 'NEXT', kind: 'billing_doc', installmentId: 'I1', createdAt: at(2) },
    ],
    sales_order_installments: [{ id: 'I1', billingRequestId: 'GO' }],
  };
  const out = await detachRequestFromInstallments(fakeDb({ tables }), 'GO');
  assert.deepEqual(out, { installmentIds: ['I1'], error: null });
  assert.equal(tables.dept_requests[0].installmentId, null);
  assert.equal(tables.sales_order_installments[0].billingRequestId, 'NEXT');
});

test('loadRequestInstallments: installmentId ก่อน · ไม่มี = หาตามตัวชี้ (ลิงก์รุ่นเก่า)', async () => {
  const tables = { sales_order_installments: [{ id: 'I1', billingRequestId: 'OLD' }, { id: 'I2', billingRequestId: null }] };
  assert.deepEqual((await loadRequestInstallments(fakeDb({ tables }), { id: 'NEW', installmentId: 'I2' })).data.map((r) => r.id), ['I2']);
  assert.deepEqual((await loadRequestInstallments(fakeDb({ tables }), { id: 'OLD', installmentId: null })).data.map((r) => r.id), ['I1']);
  assert.deepEqual((await loadRequestInstallments(fakeDb({ tables }), {})).data, []);
});

// ── 3. รูปของไฟล์ migration ─────────────────────────────────────────────────────────────────────
const SQL = readFileSync(new URL('../../../supabase/migrations/0413_billing_request_installment.sql', import.meta.url), 'utf8');
const CODE = SQL.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

test('0413: สองคอลัมน์บน dept_requests · FK ON DELETE SET NULL · CHECK รูป · ดัชนีสองตัว · backfill รันซ้ำได้ · ไม่แตะงวด', () => {
  assert.match(CODE, /^BEGIN;/m);
  assert.match(CODE, /^COMMIT;/m);
  assert.match(CODE, /ADD COLUMN IF NOT EXISTS "installmentId" text,\s*ADD COLUMN IF NOT EXISTS "installmentSeq" smallint;/);
  assert.match(CODE, /FOREIGN KEY \("installmentId"\) REFERENCES public\.sales_order_installments\(id\) ON DELETE SET NULL/);
  assert.match(CODE, /OR kind = 'billing_doc'\)/);
  assert.match(CODE, /"installmentSeq" BETWEEN 1 AND 12 AND "quotationId" IS NOT NULL/);
  assert.match(CODE, /CREATE INDEX dept_requests_installment_idx/);
  assert.match(CODE, /CREATE INDEX dept_requests_installment_pending_idx/);
  // backfill: เฉพาะคำร้องที่ยังว่าง (รันซ้ำ = 0 แถว) · เฉพาะ billing_doc
  const backfill = CODE.slice(CODE.indexOf('UPDATE public.dept_requests'), CODE.indexOf('COMMIT;'));
  assert.match(backfill, /r\."installmentId" IS NULL/);
  assert.match(backfill, /r\.kind = 'billing_doc'/);
  assert.doesNotMatch(CODE, /ALTER TABLE public\.sales_order_installments/, 'ไม่แตะตารางงวด (SQL ของ 0376–0378 อ่านตัวชี้เดิม)');
  assert.doesNotMatch(CODE, /^\s*(DELETE FROM|TRUNCATE)\b|\bDROP (COLUMN|TABLE)\b/im, 'ไม่ลบข้อมูล/คอลัมน์');
});
