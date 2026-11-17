// "ต่อจากคำร้อง" + บรีฟ "แก้จากกลิ่น" (ม-164 PR-4) — logic ล้วน + ฝั่ง DB กับตัวจำลอง (ห้ามต่อฐานจริง)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  briefSourceMissingError, briefSourceRequired, continueRequestError, orderSourceScents,
} from './scentContinue.js';
import {
  briefSourceScentError, checkContinueTarget, loadContinueCandidates, loadContinueRefs,
} from './scentContinueAdmin.js';
import { normalizeScentBriefs } from './scentBriefs.js';

const fg = (category, qty) => ({ fgCode: `FG-1-${category}`, qty: String(qty) });

test('ใบขายแก้ไขกลิ่นล้วน = บรีฟต้องเลือกกลิ่นตั้งต้น · ใบที่มีงานออกแบบใหม่ปน = ไม่บังคับ', () => {
  assert.equal(briefSourceRequired([fg('03-010', 1)]), true);
  assert.equal(briefSourceRequired([fg('03-010', 1), fg('03-002', 1)]), false);
  assert.equal(briefSourceRequired([fg('01-001', 500)]), false);
  assert.equal(briefSourceRequired([]), false);
  // VARIDA: SO-26080018-0 ขาย 03-010 ⇒ บรีฟที่ไม่มีกลิ่นตั้งต้นส่งไม่ได้
  assert.match(briefSourceMissingError([{ label: 'แก้ Body Oil' }], [fg('03-010', 1)]), /"แก้ Body Oil".*ต้องเลือกกลิ่นตั้งต้น/);
  assert.equal(briefSourceMissingError([{ label: 'x', sourceScentId: 'SC-1' }], [fg('03-010', 1)]), null);
  assert.equal(briefSourceMissingError([{ label: 'x' }], [fg('03-002', 1)]), null);
});

test('ใบเดิมที่ต่อได้: พัฒนากลิ่น · ไม่ยกเลิก · ลูกค้าเดียวกัน · ไม่ใช่ตัวเอง · ปิดแล้วก็ได้', () => {
  const prev = { id: 'R1', kind: 'scent_dev', status: 'closed', customerId: 'C1' };
  assert.equal(continueRequestError({ kind: 'scent_dev', prev, sameTaxEntity: true }), null);
  assert.match(continueRequestError({ kind: 'billing_doc', prev, sameTaxEntity: true }), /เฉพาะคำร้องพัฒนากลิ่น/);
  assert.match(continueRequestError({ kind: 'scent_dev', prev: null }), /ไม่พบ/);
  assert.match(continueRequestError({ requestId: 'R1', kind: 'scent_dev', prev, sameTaxEntity: true }), /ตัวเอง/);
  assert.match(continueRequestError({ kind: 'scent_dev', prev: { ...prev, status: 'cancelled' }, sameTaxEntity: true }), /ยกเลิก/);
  assert.match(continueRequestError({ kind: 'scent_dev', prev: { ...prev, kind: 'formula_dev' }, sameTaxEntity: true }), /พัฒนากลิ่น/);
  assert.match(continueRequestError({ kind: 'scent_dev', prev, sameTaxEntity: false }), /ลูกค้ารายอื่น/);
});

test('ตัวเลือกกลิ่นตั้งต้น: กลิ่นที่คอนเฟิร์มในใบเดิมขึ้นก่อน', () => {
  const scents = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  assert.deepEqual(orderSourceScents(scents, ['C']).map((s) => s.id), ['C', 'A', 'B']);
  assert.deepEqual(orderSourceScents(scents).map((s) => s.id), ['A', 'B', 'C']);
});

test('บรีฟพาช่องกลิ่นตั้งต้นผ่านตัวจัดรูป', () => {
  const { briefs } = normalizeScentBriefs([{ label: 'x', sourceScentId: ' SC-1 ' }, { label: 'y' }]);
  assert.equal(briefs[0].sourceScentId, 'SC-1');
  assert.equal(briefs[1].sourceScentId, null);
});

/* ตัวจำลอง supabase แบบเล็ก — select · in · eq · neq · order · limit · maybeSingle */
function fakeSupabase(tables) {
  return {
    from(table) {
      const filters = [];
      let single = false;
      let hi = Infinity;
      const b = {
        select() { return b; },
        in(col, values) { filters.push((r) => values.includes(r[col])); return b; },
        eq(col, value) { filters.push((r) => r[col] === value); return b; },
        neq(col, value) { filters.push((r) => r[col] !== value); return b; },
        order() { return b; },
        limit(n) { hi = n - 1; return b; },
        range(lo, h) { hi = h; return b; },
        maybeSingle() { single = true; return b; },
        then(resolve, reject) {
          const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r))).slice(0, hi + 1);
          return Promise.resolve({ data: single ? (rows[0] || null) : rows, error: null }).then(resolve, reject);
        },
      };
      return b;
    },
  };
}
const deps = { siblings: async (_sb, id) => (id === 'C1' ? ['C1', 'C1B'] : [id]) };
const db = () => ({
  dept_requests: [
    { id: 'R1', docNo: 'SB-26080006', kind: 'scent_dev', status: 'closed', customerId: 'C1B', createdAt: '2026-08-01' },
    { id: 'R2', docNo: 'RQ-2', kind: 'scent_dev', status: 'cancelled', customerId: 'C1', createdAt: '2026-09-01' },
    { id: 'R3', docNo: 'RQ-3', kind: 'scent_dev', status: 'acknowledged', customerId: 'C1', createdAt: '2026-10-01', continuesRequestId: 'R1' },
    { id: 'R9', docNo: 'RQ-9', kind: 'scent_dev', status: 'closed', customerId: 'C9', createdAt: '2026-10-02' },
  ],
  dept_request_items: [
    { id: 'I1', requestId: 'R1', outcome: 'confirmed', producedScentId: 'SC-1' },
    { id: 'I2', requestId: 'R1', outcome: 'rejected', producedScentId: 'SC-2' },
  ],
  scents: [
    { id: 'SC-1', code: 'PF1', name: 'One', customerId: 'C1B', status: 'active' },
    { id: 'SC-9', code: 'PF9', name: 'Nine', customerId: 'C9', status: 'active' },
  ],
  registry_customer_shares: [],
});

test('ตรวจใบเดิม: ลูกค้าเดียวกันทั้งนิติบุคคล (C1 กับ C1B) ผ่าน · ลูกค้าอื่นไม่ผ่าน · ว่าง = ไม่ต่อ', async () => {
  assert.equal((await checkContinueTarget(fakeSupabase(db()), { prevId: 'R1', kind: 'scent_dev', customerId: 'C1' }, deps)).error, null);
  assert.match((await checkContinueTarget(fakeSupabase(db()), { prevId: 'R9', kind: 'scent_dev', customerId: 'C1' }, deps)).error, /ลูกค้ารายอื่น/);
  assert.deepEqual(await checkContinueTarget(fakeSupabase(db()), { prevId: '', kind: 'scent_dev', customerId: 'C1' }, deps), { error: null, prev: null });
});

test('รายการใบเดิม: ลูกค้าเดียวกัน · ไม่รวมใบยกเลิก/ตัวเอง · ใหม่สุดก่อน · พากลิ่นที่คอนเฟิร์ม', async () => {
  const rows = await loadContinueCandidates(fakeSupabase(db()), { customerId: 'C1', excludeId: 'R3' }, deps);
  assert.deepEqual(rows.map((r) => r.docNo), ['SB-26080006']);
  assert.deepEqual(rows[0].confirmedScentIds, ['SC-1']);
  const hidden = await loadContinueCandidates(fakeSupabase(db()), { customerId: 'C1', canRead: () => false }, deps);
  assert.deepEqual(hidden, []);
});

test('กลิ่นตั้งต้น: ของลูกค้าเดียวกัน (พี่น้องนิติบุคคล) ผ่าน · ลูกค้าอื่น/ไม่มีจริงไม่ผ่าน · กลิ่นเดิมไม่ตรวจซ้ำ', async () => {
  const sb = fakeSupabase(db());
  assert.equal(await briefSourceScentError(sb, [{ label: 'x', sourceScentId: 'SC-1' }], { customerId: 'C1' }, deps), null);
  assert.match(await briefSourceScentError(sb, [{ label: 'x', sourceScentId: 'SC-9' }], { customerId: 'C1' }, deps), /ลูกค้ารายอื่น/);
  assert.match(await briefSourceScentError(sb, [{ label: 'x', sourceScentId: 'SC-X' }], { customerId: 'C1' }, deps), /ไม่พบกลิ่นตั้งต้น/);
  assert.equal(await briefSourceScentError(sb, [{ label: 'x', sourceScentId: 'SC-9' }], { customerId: 'C1', keep: (id) => id === 'SC-9' }, deps), null);
});

test('ลิงก์สองทางของใบ: ต่อจาก · มีใบต่อ', async () => {
  const sb = fakeSupabase(db());
  const r3 = await loadContinueRefs(sb, { id: 'R3', continuesRequestId: 'R1' });
  assert.equal(r3.continuesRequest.docNo, 'SB-26080006');
  const r1 = await loadContinueRefs(sb, { id: 'R1', continuesRequestId: null });
  assert.deepEqual(r1.continuedBy.map((r) => r.docNo), ['RQ-3']);
});
