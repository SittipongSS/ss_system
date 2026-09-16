// ── ตัวตัดสิน "จุดที่ TS หาไม่เจอหน้างาน" (มติ 16/09/2026 ข้อ 23 · mig 0362) ────
//
// ⭐ ไฟล์นี้เป็นบ้านเดียวของรหัสเหตุผลและเพรดิเคตที่ทั้งฝั่ง TS และฝั่งขายอ่าน ⇒ ทุกกฎที่
//    เขียนเป็นข้อความในมติต้องมีเทสต์ที่เรียกฟังก์ชันจริง ไม่ใช่ regex บนไฟล์
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_NOTE_MAX, SITE_NOT_FOUND_REASONS, awaitingSiteDecisionCount, canWithdrawSiteNotFound,
  lineAwaitingSiteDecision, lineSiteClosed, lineSiteNotFound, siteClosePatch, siteDecisionChipLabel,
  siteFlagClearPatch, siteFlagTrail, siteNoteError, siteNotFoundInputError, siteNotFoundOf,
  siteNotFoundPatch, siteNotFoundReasonError, siteNotFoundReasonLabel,
} from './siteNotFound.js';

const AT = '2026-09-18T03:00:00.000Z';
const flagged = (extra = {}) => ({
  id: 'SOL-1', installationPoint: 'Empire Tower โถงลิฟต์ ชั้น 3',
  siteNotFoundAt: AT, siteNotFoundById: 'U1', siteNotFoundByName: 'สมชาย',
  siteNotFoundReason: 'name_mismatch', siteNotFoundNote: 'หน้างานมีแค่ล็อบบี้กับชั้น 5',
  ...extra,
});

test('เหตุผลมี 4 ตัว ไม่มีค่าตั้งต้น และรหัสนอกชุดถูกปฏิเสธ', () => {
  assert.equal(SITE_NOT_FOUND_REASONS.length, 4);
  assert.deepEqual(SITE_NOT_FOUND_REASONS.map((r) => r.value),
    ['name_mismatch', 'branch_closed', 'customer_dropped', 'other']);
  for (const r of SITE_NOT_FOUND_REASONS) assert.equal(siteNotFoundReasonError(r.value), null);
  // ไม่เลือกอะไรเลย = ยังตอบไม่ได้ (ไม่ใช่ตกไปที่ตัวแรกเงียบ ๆ)
  assert.ok(siteNotFoundReasonError(''));
  assert.ok(siteNotFoundReasonError(undefined));
  assert.ok(siteNotFoundReasonError('branch-closed'), 'สะกดผิดต้องไม่ผ่าน');
  assert.equal(siteNotFoundReasonLabel('branch_closed'), 'สาขาปิด/ย้ายออกแล้ว');
  assert.equal(siteNotFoundReasonLabel('nope'), null);
});

test('🪤 หมายเหตุบังคับเฉพาะ "อื่น ๆ" — ม็อกวาดบังคับทุกไทล์ ซึ่งมติทับแล้ว', () => {
  assert.ok(siteNotFoundInputError({ reason: 'other', note: '   ' }), 'other ต้องมีหมายเหตุ');
  assert.equal(siteNotFoundInputError({ reason: 'other', note: 'ไม่มีป้ายที่ประตู' }), null);
  for (const code of ['name_mismatch', 'branch_closed', 'customer_dropped']) {
    assert.equal(siteNotFoundInputError({ reason: code, note: '' }), null, code);
  }
  assert.ok(siteNoteError('branch_closed', 'ก'.repeat(SITE_NOTE_MAX + 1)), 'ยาวเกินเพดานต้องไม่ผ่าน');
  assert.equal(siteNoteError('branch_closed', 'ก'.repeat(SITE_NOTE_MAX)), null);
  // นับ code point แบบเดียวกับ length() ของ Postgres — อีโมจิหนึ่งตัวต้องไม่นับเป็นสอง
  assert.equal(siteNoteError('branch_closed', '🙂'.repeat(SITE_NOTE_MAX)), null);
});

test('สถานะของบรรทัด: ว่าง · รอตัดสิน · ปิดแล้ว', () => {
  const blank = { id: 'SOL-0' };
  assert.equal(lineSiteNotFound(blank), false);
  assert.equal(lineAwaitingSiteDecision(blank), false);

  const open = flagged();
  assert.equal(lineSiteNotFound(open), true);
  assert.equal(lineAwaitingSiteDecision(open), true);
  assert.equal(canWithdrawSiteNotFound(open), true);

  const closed = flagged({ siteClosedAt: AT, siteClosedById: 'U9' });
  assert.equal(lineSiteClosed(closed), true);
  // ⭐ ปิดแล้วยังติดธง — คิวยังต้องตัดจุดนี้ออก แต่ไม่ใช่ "รอฝ่ายขายตัดสิน" อีกต่อไป
  assert.equal(lineSiteNotFound(closed), true);
  assert.equal(lineAwaitingSiteDecision(closed), false);
  assert.equal(canWithdrawSiteNotFound(closed), false, 'ตัดสินแล้วถอนไม่ได้');
});

test('ตัวนับ/ป้ายของชิป นับเฉพาะจุดที่ยังรอตัดสิน', () => {
  const lines = [{ id: 'a' }, flagged({ id: 'b' }), flagged({ id: 'c', siteClosedAt: AT, siteClosedById: 'U9' })];
  assert.equal(awaitingSiteDecisionCount(lines), 1);
  assert.equal(siteDecisionChipLabel(1), 'รอฝ่ายขายตัดสิน 1 จุด');
});

test('ก้อนที่เขียนลงแถว: ครบทั้งชุดตอนแจ้ง · ว่างทั้งชุดตอนล้าง', () => {
  const patch = siteNotFoundPatch({ reason: 'other', note: '  หน้างานปิด  ', user: { id: 'U1', name: 'สมชาย' }, at: AT });
  assert.deepEqual(patch, {
    siteNotFoundAt: AT, siteNotFoundById: 'U1', siteNotFoundByName: 'สมชาย',
    siteNotFoundReason: 'other', siteNotFoundNote: 'หน้างานปิด',
  });
  // หมายเหตุว่าง = null ไม่ใช่สตริงว่าง (CHECK อ่าน IS NULL ไม่ได้อ่าน '')
  assert.equal(siteNotFoundPatch({ reason: 'branch_closed', note: '   ', user: {}, at: AT }).siteNotFoundNote, null);

  const cleared = siteFlagClearPatch();
  assert.equal(Object.keys(cleared).length, 9);
  for (const v of Object.values(cleared)) assert.equal(v, null);
  // ⭐ ล้างธงต้องล้างตราปิดด้วย — ตราปิดที่ไม่มีธงรองรับทำให้ CHECK ของ 0362 ตาย
  assert.equal(cleared.siteClosedAt, null);
  // ตัวล้างต้องคืนก้อนใหม่ทุกครั้ง (ผู้เรียกแก้ต่อได้โดยไม่กระทบคนอื่น)
  assert.notEqual(siteFlagClearPatch(), cleared);

  const close = siteClosePatch({ note: '', user: { id: 'U9', name: 'หมิง' }, at: AT });
  assert.deepEqual(close, {
    siteClosedAt: AT, siteClosedById: 'U9', siteClosedByName: 'หมิง', siteClosedNote: null,
  });
});

test('ก้อน audit แคบแค่ 9 ช่องของธง ไม่พกราคาทั้งบรรทัด', () => {
  const trail = siteFlagTrail({ ...flagged(), lineTotal: 30160, unitPrice: 30160 });
  assert.equal(Object.keys(trail).length, 9);
  assert.equal(trail.lineTotal, undefined);
  assert.equal(trail.siteClosedAt, null, 'ช่องที่ยังว่างต้องเป็น null ไม่ใช่หายไป');
});

test('สรุปให้จออ่าน — ไม่มีธง = null', () => {
  assert.equal(siteNotFoundOf({ id: 'x' }), null);
  const info = siteNotFoundOf(flagged({ siteClosedAt: AT, siteClosedByName: 'หมิง' }));
  assert.equal(info.reasonLabel, 'ชื่อจุดไม่ตรงกับหน้างาน');
  assert.equal(info.byName, 'สมชาย');
  assert.equal(info.closed, true);
  assert.equal(info.closedByName, 'หมิง');
});
