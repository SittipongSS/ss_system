// ── เทสต์ตัวรัน backfill "ต้องวางบิลไหม" (รอมติ ข้อ 4 ทาง 3) — ของปลอมแทนฐาน · ไม่มีอะไรแตะฐานจริง ──────────────
// ⭐ ซ้อมแห้งเป็นค่าตั้งต้น · ด่านหยุดก่อนแถวแรก · เขียนแบบมีเงื่อนไขตัวล็อก (มีคนแก้ระหว่างรัน = ข้าม) · audit ต่อแถว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKFILL_STAMP_ID, backfillEvidenceOf, backfillStampName, runNeedBackfill } from './billingRuleV4Backfill.js';

const { backfill: BACKFILL } = JSON.parse(readFileSync(new URL('./billingRuleFixtures.json', import.meta.url), 'utf8'));

/* ลูกค้าจำลองชุดเล็ก: รูปเดิมที่เคยขอใบวางบิล · รูปเดิมโอนก่อน · ยังไม่ตั้งที่เคยขอ · สหมิตร · ตั้งแล้ว · รูปเดิมไม่มีหลักฐาน (มีหมายเหตุ) */
const customers = () => [
  { id: 'c730', arCode: 'AR-730', billingRule: { credit: false }, billingRuleUpdatedAt: '2026-09-26T10:00:00.123456+00:00' },
  { id: 'c148', arCode: 'AR-148', billingRule: { credit: false, note: 'โอนก่อน' }, billingRuleUpdatedAt: '2026-09-26T10:00:00.123456+00:00' },
  { id: 'c267', arCode: 'AR-267', billingRule: null, billingRuleUpdatedAt: null },
  { id: 'c109', arCode: 'AR-109', billingRule: null, billingRuleUpdatedAt: null },
  { id: 'c015', arCode: 'AR-015', billingRule: { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } }, billingRuleUpdatedAt: '2026-09-27T01:00:00+00:00' },
  { id: 'c999', arCode: 'AR-999', billingRule: { credit: false, note: 'ลูกค้าเก่า' }, billingRuleUpdatedAt: '2026-09-26T10:00:00.123456+00:00' },
];

function fakeIo({ installments = [], changedIds = new Set() } = {}) {
  const calls = { patch: [], audit: [], log: [] };
  return {
    calls,
    io: {
      loadCustomers: async () => customers(),
      loadDatedOpenInstallments: async () => installments,
      patchCustomer: async (args) => { calls.patch.push(args); return !changedIds.has(args.id); },
      audit: async (args) => { calls.audit.push(args); },
      log: (line) => { calls.log.push(line); },
    },
  };
}

test('backfillEvidenceOf — รวมสองกลุ่ม (รูปเดิม + ยังไม่ตั้ง) จากไฟล์ตัวอย่าง · ข้ามสหมิตร · รายชื่อให้คนตรวจ', () => {
  const { evidence, review, skipArCodes } = backfillEvidenceOf(BACKFILL);
  assert.equal(evidence.billed.size, 14);
  assert.equal(evidence.prepaid.size, 38);
  assert.ok(evidence.billed.has('AR-730') && evidence.billed.has('AR-267') && evidence.prepaid.has('AR-148'));
  assert.deepEqual(skipArCodes, ['AR-109']);
  assert.ok(review.includes('AR-035') && review.includes('AR-622'));
});

test('⭐ ค่าตั้งต้น = ซ้อมแห้ง — วางแผน + ตรวจครบ แต่ไม่เขียนแถวไหน', async () => {
  const { io, calls } = fakeIo();
  const out = await runNeedBackfill(io, { option: 3, backfill: BACKFILL });
  assert.equal(out.ok, true);
  assert.equal(out.dryRun, true);
  assert.equal(out.written, 0);
  assert.equal(calls.patch.length, 0);
  assert.equal(calls.audit.length, 0);
  const byAr = Object.fromEntries(out.plan.changes.map((c) => [c.arCode, c.after]));
  assert.deepEqual(byAr['AR-730'], { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 0, runs: null }, 'เคยขอใบวางบิล (รูปเดิม) = ชำระวันวางบิล');
  assert.deepEqual(byAr['AR-148'], { v: 4, need: 'none', note: 'โอนก่อน' }, 'โอนก่อน = ไม่ต้องวางบิล · หมายเหตุติดไป');
  assert.deepEqual(byAr['AR-267'], { v: 4, need: 'required', billing: null }, 'เคยขอ (ยังไม่ตั้ง) = ต้องวางบิลยังไม่ตั้งรอบ');
  assert.equal(byAr['AR-999'], null, 'รูปเดิมไม่มีหลักฐาน = ยังไม่ระบุ');
  assert.equal('AR-109' in byAr, false, 'สหมิตรไม่แตะ');
  assert.equal('AR-015' in byAr, false, 'ตั้งแล้วไม่แตะ');
  assert.deepEqual(out.noteLost, ['AR-999'], 'หมายเหตุของรูปเดิมที่กลายเป็นยังไม่ระบุ — บอกให้คนตาม');
  assert.ok(calls.log.some((line) => /ซ้อมแห้ง/.test(line)));
});

test('⭐ ด่านหยุดก่อนแถวแรก — ลูกค้าที่จะเป็น "ไม่ต้องวางบิล" มีงวดเปิดที่มีวันวางบิล = ไม่เขียนอะไรเลยแม้สั่ง apply', async () => {
  const { io, calls } = fakeIo({ installments: [{ id: 'i1', customerId: 'c148', status: 'pending', kind: 'regular', billingDate: '2026-10-05' }] });
  const out = await runNeedBackfill(io, { option: 3, apply: true, backfill: BACKFILL });
  assert.equal(out.ok, false);
  assert.match(out.error, /หยุด: 1 งวด/);
  assert.equal(calls.patch.length, 0);
  assert.equal(calls.audit.length, 0);
});

test('apply — เขียนทีละแถวด้วยตัวล็อกสตริงดิบ + ตราระบบ · มีคนแก้ระหว่างรัน = ข้าม (ไม่ทับคำตอบของคน) · audit เฉพาะแถวที่เขียนจริง', async () => {
  const { io, calls } = fakeIo({ changedIds: new Set(['c267']) });
  const out = await runNeedBackfill(io, { option: 3, apply: true, backfill: BACKFILL });
  assert.equal(out.ok, true);
  assert.equal(out.dryRun, false);
  assert.deepEqual(out.skippedChanged, ['c267']);
  assert.equal(out.written, calls.patch.length - 1);
  const p730 = calls.patch.find((p) => p.id === 'c730');
  assert.equal(p730.baseUpdatedAt, '2026-09-26T10:00:00.123456+00:00', 'สตริงดิบ ไม่ผ่าน Date (ไมโครวินาทีต้องอยู่)');
  assert.equal(calls.patch.find((p) => p.id === 'c267').baseUpdatedAt, null, 'แถวที่ยังไม่เคยตั้ง = is.null');
  assert.equal(p730.stampId, BACKFILL_STAMP_ID);
  assert.equal(p730.stampName, backfillStampName(3));
  assert.deepEqual(calls.audit.map((a) => a.id).sort(), calls.patch.filter((p) => p.id !== 'c267').map((p) => p.id).sort());
  assert.match(calls.audit.find((a) => a.id === 'c730').summary, /AR-730 → วางบิลได้ทุกวัน · ชำระวันวางบิล/);
});

test('ทางเลือกที่ไม่รู้จัก = ไม่ทำอะไร', async () => {
  const { io, calls } = fakeIo();
  const out = await runNeedBackfill(io, { option: 7, apply: true, backfill: BACKFILL });
  assert.equal(out.ok, false);
  assert.equal(calls.patch.length, 0);
});
