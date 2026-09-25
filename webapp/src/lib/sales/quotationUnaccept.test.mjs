import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNACCEPT_REASON_MAX,
  canUnacceptQuotation,
  inferredReopenStatus,
  normalizeUnacceptReason,
  quotationReopenAuditSummary,
  quotationUnacceptPromptDetail,
  quotationUnacceptToast,
  reopenStatusLabel,
  siblingsReopenedByUnaccept,
  unacceptReasonError,
} from './quotationUnaccept.js';

test('unaccept reason is trimmed, whitespace-normalized and bounded 10-500', () => {
  assert.equal(normalizeUnacceptReason('  รับใบผิด   ฉบับ  '), 'รับใบผิด ฉบับ');
  assert.match(unacceptReasonError('สั้น'), /อย่างน้อย 10/);
  assert.match(unacceptReasonError('         '), /อย่างน้อย 10/);
  assert.equal(unacceptReasonError('กดรับใบผิดฉบับ — ดีลนี้ปิดด้วยใบอื่น'), '');
  assert.match(unacceptReasonError('ก'.repeat(UNACCEPT_REASON_MAX + 1)), /ไม่เกิน 500/);
});

/* ⭐ มติ 24/09: **เจ้าของดีลปัจจุบัน + ผู้มีอำนาจตัดสิน** ย้อนการรับได้ — ขาเข้า Won เจ้าของดีลกดเองอยู่แล้ว
   (อนุมัติใบเอง 07-18 · รับใบเอง 08-24) ขาออกจึงไม่ต้องรอหัวหน้า · ไม่แตะ Actual เพราะ RPC ปฏิเสธเมื่อมี SO ที่ยังใช้อยู่
   ⚠️ ยึด deal.ownerId ไม่ใช่ขอบเขตทีม — senior_ae/ac/senior_ac แก้ดีลของเพื่อนร่วมทีมได้ แต่ย้อน Won แทนไม่ได้ */
test('ย้อนการรับ: เจ้าของดีลปัจจุบัน + ผู้มีอำนาจตัดสิน · คนอื่นในทีมไม่ได้', () => {
  const deal = { ownerId: 'USR-AE' };
  for (const role of ['admin', 'commercial_director', 'commercial_manager', 'ae_supervisor']) {
    assert.equal(canUnacceptQuotation({ id: 'USR-X', role }, deal), true, role);
  }
  assert.equal(canUnacceptQuotation({ id: 'USR-AE', role: 'ae' }, deal), true);
  assert.equal(canUnacceptQuotation({ id: 'USR-AE', role: 'senior_ae' }, deal), true);
  for (const role of ['ae', 'senior_ae', 'ac', 'senior_ac', 'ac_supervisor']) {
    assert.equal(canUnacceptQuotation({ id: 'USR-TEAMMATE', role }, deal), false, role);
  }
  assert.equal(canUnacceptQuotation({ id: '', role: 'ae' }, { ownerId: '' }), false);
  assert.equal(canUnacceptQuotation({ id: 'USR-AE', role: 'ae' }, null), false);
  assert.equal(canUnacceptQuotation(null, deal), false);
});

// ── ย้อนการรับ = เปิดใบพี่น้องที่ "การรับใบนี้" ปิดไว้คืน (มติเจ้าของ 25/09 · mig 0388) ─────────────
// ⭐ ตัวคิดฝั่ง JS มีไว้ให้พรีวิวในโมดัลเท่านั้น — ตัวเขียนจริงคือ unaccept_quotation_atomic (0388)
//   เทสต์ unacceptReopensSiblings.test.mjs ล็อกให้กติกาสองฝั่งพูดเหมือนกัน
const ACCEPTED = { id: 'QT-X', quoteNumber: 'QT-26090001-0', dealId: 'DL-1' };
const stampBy = (quotationId, prevStatus) => ({ quotationId, quoteNumber: 'QT-?', prevStatus, at: '2026-09-25T03:00:00.000000+00:00' });

test('เปิดคืน: ใบที่การรับใบนี้ประทับตราไว้ → สถานะก่อนปิดตรงตัว', () => {
  const rows = siblingsReopenedByUnaccept(ACCEPTED, [
    { id: 'QT-A', quoteNumber: 'QT-A-0', status: 'closed', approvalStatus: 'approved', closedByAccept: stampBy('QT-X', 'sent') },
    { id: 'QT-B', quoteNumber: 'QT-B-0', status: 'closed', approvalStatus: 'pending', closedByAccept: stampBy('QT-X', 'draft') },
    { id: 'QT-C', quoteNumber: 'QT-C-0', status: 'closed', approvalStatus: 'rejected', metadata: { closedByAccept: stampBy('QT-X', 'rejected') } },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.status, r.inferred]), [
    ['QT-A', 'sent', false], ['QT-B', 'draft', false], ['QT-C', 'rejected', false],
  ]);
});

test('เปิดคืน: ใบที่การรับ "ใบอื่น" ปิดไว้ ไม่แตะ · ใบที่ยังเปิด/ตัวใบเอง/ใบยกเลิก ไม่อยู่ในลิสต์', () => {
  const rows = siblingsReopenedByUnaccept(ACCEPTED, [
    { id: 'QT-X', quoteNumber: 'QT-26090001-0', status: 'accepted', approvalStatus: 'approved' },
    { id: 'QT-D', quoteNumber: 'QT-D-0', status: 'closed', approvalStatus: 'approved', closedByAccept: stampBy('QT-OTHER', 'sent') },
    { id: 'QT-E', quoteNumber: 'QT-E-0', status: 'sent', approvalStatus: 'approved' },
    { id: 'QT-F', quoteNumber: 'QT-F-0', status: 'cancelled', approvalStatus: 'approved' },
    { id: 'QT-G', quoteNumber: 'QT-G-1', status: 'revised', approvalStatus: 'approved' },
  ]);
  assert.deepEqual(rows, []);
});

test('ใบปิดรุ่นเก่า (ไม่มีตรา): เดาจากผลอนุมัติ — approved/not_required → อนุมัติแล้ว · ที่เหลือ → ร่าง', () => {
  const rows = siblingsReopenedByUnaccept(ACCEPTED, [
    { id: 'QT-1', quoteNumber: 'QT-1-0', status: 'closed', approvalStatus: 'approved' },
    { id: 'QT-2', quoteNumber: 'QT-2-0', status: 'closed', approvalStatus: 'not_required', metadata: {} },
    { id: 'QT-3', quoteNumber: 'QT-3-0', status: 'closed', approvalStatus: 'pending' },
    { id: 'QT-4', quoteNumber: 'QT-4-0', status: 'closed', approvalStatus: 'not_submitted' },
    { id: 'QT-5', quoteNumber: 'QT-5-0', status: 'closed', approvalStatus: 'rejected' },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.status, r.inferred]), [
    ['QT-1', 'sent', true], ['QT-2', 'sent', true], ['QT-3', 'draft', true], ['QT-4', 'draft', true], ['QT-5', 'draft', true],
  ]);
  assert.equal(inferredReopenStatus('approved'), 'sent');
  assert.equal(inferredReopenStatus(undefined), 'draft');
});

test('ใบปิดรุ่นเก่าที่พิสูจน์ได้ว่าปิดโดยการรับใบที่ถูกยกเลิกไปทางใบสั่งขาย (มติข้อ 4) → คงปิด', () => {
  const at = '2026-08-10T03:04:05.123456+00:00';
  const rows = siblingsReopenedByUnaccept(ACCEPTED, [
    { id: 'QT-OLD', quoteNumber: 'QT-OLD-0', status: 'cancelled', approvalStatus: 'approved', acceptedAt: at, updatedAt: '2026-08-20T00:00:00+00:00' },
    { id: 'QT-H', quoteNumber: 'QT-H-0', status: 'closed', approvalStatus: 'approved', updatedAt: at },
    // ตัวใบที่กำลังย้อนเองไม่นับเป็น "การรับใบอื่น" แม้เวลาจะตรง
    { id: 'QT-I', quoteNumber: 'QT-I-0', status: 'closed', approvalStatus: 'approved', updatedAt: '2026-09-01T00:00:00+00:00' },
  ].concat([{ ...ACCEPTED, status: 'accepted', acceptedAt: '2026-09-01T00:00:00+00:00' }]));
  assert.deepEqual(rows.map((r) => r.id), ['QT-I']);
});

test('ตราที่สถานะเดิมเพี้ยน → ถอยไปเดาจากผลอนุมัติ ไม่เปิดเป็นค่าที่ไม่รู้จัก', () => {
  const rows = siblingsReopenedByUnaccept(ACCEPTED, [
    { id: 'QT-J', quoteNumber: 'QT-J-0', status: 'closed', approvalStatus: 'approved', closedByAccept: stampBy('QT-X', 'accepted') },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.status, r.inferred]), [['QT-J', 'sent', true]]);
});

test('โมดัลย้อนการรับบอกผลก่อนกด: ใบไหนเปิดกลับเป็นอะไร + โครงการคงอยู่ ย้ายได้ที่ไหน', () => {
  const detail = quotationUnacceptPromptDetail({
    quoteNumber: 'QT-26090001-0',
    reopen: [
      { id: 'QT-A', quoteNumber: 'QT-A-0', status: 'sent', approvalStatus: 'approved', inferred: false },
      { id: 'QT-B', quoteNumber: 'QT-B-0', status: 'draft', approvalStatus: 'pending', inferred: true },
    ],
    project: { id: 'PJ-1', code: 'PJ-26080001', name: 'ห้างสาขาบางนา' },
  });
  assert.match(detail, /สิ่งที่จะเกิดขึ้นทันที/);
  assert.match(detail, /เปิดกลับ 2 ใบ/);
  assert.match(detail, /QT-A-0 → อนุมัติแล้ว/);
  assert.match(detail, /QT-B-0 → รออนุมัติ/);
  assert.match(detail, /กลับเข้าคิวผู้อนุมัติ/);
  assert.match(detail, /QT-B-0 ถูกปิดก่อนระบบเริ่มจำสถานะเดิม/);
  assert.match(detail, /PJ-26080001 · ห้างสาขาบางนา/);
  assert.match(detail, /ไม่ถอดโครงการ/);
  assert.match(detail, /ย้ายไปโครงการอื่น/);
  assert.doesNotMatch(detail, /ถอน/);
});

test('โมดัลย้อนการรับ: ไม่มีใบให้เปิด = บอกตรง ๆ · ไม่รู้โครงการก็ยังบอกว่าโครงการคงเดิม', () => {
  const detail = quotationUnacceptPromptDetail({ quoteNumber: 'QT-1', reopen: [], project: null });
  assert.match(detail, /ไม่มีใบเสนอราคาฉบับอื่นที่ต้องเปิดกลับ/);
  assert.match(detail, /ดีลยังอยู่ในโครงการเดิม/);
  assert.match(detail, /ย้ายไปโครงการอื่น/);
  // พรีวิวอ่านไม่ขึ้น (null) ต้องไม่พัง — โมดัลยังต้องเปิดได้
  assert.match(quotationUnacceptPromptDetail(null), /ย้ายไปโครงการอื่น/);
});

test('ป้ายสถานะที่เปิดกลับ: ภาษาเดียวกับจอ (sent = อนุมัติแล้ว) · ร่างแยกตามแกนอนุมัติ', () => {
  assert.equal(reopenStatusLabel({ status: 'sent' }), 'อนุมัติแล้ว');
  assert.equal(reopenStatusLabel({ status: 'rejected' }), 'ถูกปฏิเสธ');
  assert.equal(reopenStatusLabel({ status: 'draft', approvalStatus: 'pending' }), 'รออนุมัติ');
  assert.equal(reopenStatusLabel({ status: 'draft', approvalStatus: 'rejected' }), 'ถูกตีกลับ');
  assert.equal(reopenStatusLabel({ status: 'draft', approvalStatus: 'not_submitted' }), 'ฉบับร่าง');
});

test('audit ต่อใบที่เปิดกลับ + toast หลังกด บอกผลจริงจากฐาน', () => {
  assert.equal(
    quotationReopenAuditSummary({ quoteNumber: 'QT-A-0', status: 'sent', inferred: false }, 'QT-26090001-0'),
    'เปิดใบเสนอราคา QT-A-0 กลับเป็น “อนุมัติแล้ว” — ย้อนการรับ QT-26090001-0',
  );
  assert.match(
    quotationReopenAuditSummary({ quoteNumber: 'QT-B-0', status: 'draft', approvalStatus: 'pending', inferred: true }, 'QT-1'),
    /“รออนุมัติ” — ย้อนการรับ QT-1 \(ใบปิดก่อนระบบจำสถานะเดิม — อ่านจากผลอนุมัติ\)/,
  );
  assert.equal(quotationUnacceptToast('QT-1', {}), 'ย้อนการรับ QT-1 แล้ว');
  assert.equal(
    quotationUnacceptToast('QT-1', { reopened: [{ quoteNumber: 'QT-A-0' }, { quoteNumber: 'QT-B-0' }] }),
    'ย้อนการรับ QT-1 แล้ว · เปิดใบกลับ 2 ใบ (QT-A-0, QT-B-0)',
  );
  assert.match(
    quotationUnacceptToast('QT-1', { reopened: [], forecast: { changed: true, previousValue: 1000, value: 800 } }),
    /FC .*1,000.* → .*800/,
  );
  assert.match(quotationUnacceptToast('QT-1', { forecast: { warning: 'เขียนไม่ผ่าน' } }), /FC ยังไม่ขยับ: เขียนไม่ผ่าน/);
});
