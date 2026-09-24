// ── ยกเลิกใบเสนอราคา (มติเจ้าของ 24/09 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ") ──
//
// ไฟล์นี้ล็อก "สิ่งที่โมดัลบอก" กับ "สิ่งที่ route ทำจริง" ให้เป็นคำตอบเดียวกัน — กติกาโมดัลอนุมัติ
// (#1223): ทุกการย้อน/ยกเลิกต้องบอกผลลัพธ์ก่อนกด ไม่ใช่ "แน่ใจหรือไม่" เฉย ๆ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTATION_CANCEL_CAUSE,
  buildQuotationCancelPreview,
  cancelForecastSkip,
  quotationCancelBlock,
  quotationCancelMetadata,
  quotationCancelPromptDetail,
  quotationCancelStateError,
  quotationCancelToast,
  requestsToNotifyOnCancel,
} from './quotationCancel.js';

const quote = (over = {}) => ({
  id: 'QT1', quoteNumber: 'QT-26090001-0', dealId: 'DEAL-1', status: 'sent', approvalStatus: 'approved',
  metadata: { paymentPresetVersionId: 'PV-1' },
  ...over,
});

test('เหตุที่ส่งเข้าตัวคิด FC เป็นเหตุ "ดูแลตัวชี้" ไม่ใช่เหตุขึ้นบันได', () => {
  assert.equal(QUOTATION_CANCEL_CAUSE, 'quotation_cancelled');
});

/* ⭐ มติ 24/09: ดีล Lost ไม่คิด FC ใหม่ — ดีล Lost อยู่นอกคิว "FC ไม่ตรงใบเสนอราคา" (ไม่มีใครมาแก้ให้)
   และการเขียน projectValue ใหม่ = แก้ประวัติยอดที่เสียไปย้อนหลัง · Won แช่แข็งอยู่แล้ว (0284) */
test('ดีล Lost/Won ข้ามการคิด FC ใหม่ · ดีลเปิดคิดตามปกติ', () => {
  assert.equal(cancelForecastSkip({ stage: 'lost' }), 'lost');
  assert.equal(cancelForecastSkip({ stage: 'won' }), 'won');
  assert.equal(cancelForecastSkip({ stage: 'in_project' }), 'won');
  assert.equal(cancelForecastSkip({ stage: 'quotation' }), null);
  assert.equal(cancelForecastSkip(null), null);
});

test('metadata.cancel เก็บเหตุผล · ใคร · เมื่อไร · สถานะก่อนยกเลิก — คีย์เดิมของใบอยู่ครบ', () => {
  const meta = quotationCancelMetadata(quote({ approvalStatus: 'pending', status: 'draft' }), {
    reason: 'ลูกค้าเปลี่ยนสเปคทั้งหมด เสนอใบใหม่แทน',
    user: { id: 'USR-AE', name: 'คุณเอ', role: 'ae' },
    at: '2026-09-24T03:00:00.000Z',
  });
  assert.equal(meta.paymentPresetVersionId, 'PV-1', 'ห้ามทับ metadata ทั้งก้อน');
  assert.deepEqual(meta.cancel, {
    reason: 'ลูกค้าเปลี่ยนสเปคทั้งหมด เสนอใบใหม่แทน',
    by: 'USR-AE', byName: 'คุณเอ', byRole: 'ae',
    at: '2026-09-24T03:00:00.000Z',
    fromStatus: 'draft', fromApprovalStatus: 'pending',
  });
});

/* ⭐ SO ที่ยังมีชีวิตบนใบที่ยังไม่ Won ไม่ควรมีอยู่ (สร้าง SO ต้องรับใบก่อน · ย้อนรับต้องไม่มี SO — 0380)
   แต่ถ้ามี = ยอด Actual ห้อยอยู่กับใบที่กำลังจะตาย ⇒ กันไว้ก่อน บอกทางออก */
test('ด่านเดียวของยกเลิกใบ: มีใบสั่งขายที่ยังใช้อยู่ = ต้องจัดการ SO ก่อน', () => {
  assert.equal(quotationCancelBlock({ orders: [] }), '');
  assert.equal(quotationCancelBlock({ orders: [{ status: 'cancelled' }, { status: 'approved', supersededById: 'SO-2' }] }), '');
  assert.match(quotationCancelBlock({ orders: [{ status: 'approved', orderNumber: 'SO-26090001-0' }] }), /SO-26090001-0/);
});

/* ⭐ มติ 24/09: คำร้องเอกสารการเงินที่ออกเลข Express ไปแล้ว — **เตือน + แจ้ง ไม่บล็อก**
   (บล็อก = ทางตันที่ FN คนเดียวปลดได้) · คำร้องที่ปิด/ยกเลิกไปแล้วแต่มีเลขเอกสารก็ยังต้องแจ้ง
   เพราะใบกำกับ/ใบเสร็จนั้นอ้างใบที่ตายแล้ว */
test('คำร้องที่ต้องแจ้ง = ยังเดินอยู่ หรือมีเลขเอกสารการเงินออกแล้ว · ผู้รับ = ผู้ขอ + ผู้รับผิดชอบ', () => {
  const requests = [
    { id: 'RQ-1', docNo: 'RQ-26090001', kind: 'billing_doc', status: 'acknowledged', requestedById: 'u-ae', assigneeId: 'u-fn', assigneeName: 'FN หนึ่ง' },
    { id: 'RQ-2', docNo: 'RQ-26090002', kind: 'billing_doc', status: 'closed', requestedById: 'u-ae', acknowledgedById: 'u-fn2', acknowledgedByName: 'FN สอง' },
    { id: 'RQ-3', docNo: 'RQ-26090003', kind: 'billing_doc', status: 'closed', requestedById: 'u-ae' },
    { id: 'RQ-4', docNo: 'RQ-26090004', kind: 'billing_doc', status: 'pending', requestedById: 'u-ae' },
    { id: 'RQ-5', docNo: 'RQ-26090005', kind: 'billing_doc', status: 'cancelled', requestedById: 'u-ae' },
  ];
  const items = [
    { requestId: 'RQ-1', docNumber: 'IV-6909-001' },
    { requestId: 'RQ-2', docNumber: 'RE-6909-002' },
    { requestId: 'RQ-2', docNumber: '  ' },
    { requestId: 'RQ-2', docNumber: 'RE-6909-002' },
    { requestId: 'RQ-3', docNumber: null },
  ];
  const got = requestsToNotifyOnCancel(requests, items, { actorId: 'u-ae' });
  assert.deepEqual(got.map((r) => r.id), ['RQ-1', 'RQ-2', 'RQ-4']);
  assert.deepEqual(got[0].docNumbers, ['IV-6909-001']);
  assert.deepEqual(got[1].docNumbers, ['RE-6909-002'], 'เลขซ้ำ/ว่างถูกกรอง');
  // ผู้รับผิดชอบถอยไปคนที่กดรับเรื่องเมื่อยังไม่มอบหมาย (requestAssignee) · ไม่เด้งใส่คนกดยกเลิกเอง
  assert.deepEqual(got[0].recipientIds, ['u-fn']);
  assert.deepEqual(got[1].recipientIds, ['u-fn2']);
  assert.deepEqual(got[2].recipientIds, [], 'ใบที่ยังไม่มีใครรับ + ผู้ขอคือคนกด = ไม่มีใครให้เด้ง (แถวเธรดยังลง)');
  const other = requestsToNotifyOnCancel(requests, items, { actorId: 'u-manager' });
  assert.deepEqual(other[0].recipientIds, ['u-ae', 'u-fn']);
});

const followingDeal = { id: 'DEAL-1', stage: 'quotation', projectValue: 1000000, forecastSource: 'quotation', forecastQuotationId: 'QT1' };

test('พรีวิว: FC ขยับ · ร่างสัญญาปิดตาม · สัญญาที่ออกเลขแล้วอยู่ต่อ · คำร้องการเงินพร้อมเลขเอกสาร', () => {
  const preview = buildQuotationCancelPreview({
    quote: quote(),
    deal: followingDeal,
    forecast: { changed: true, value: 500000, previousValue: 1000000, reason: 'pointer_gone', resolved: { source: 'manual', quotationId: null, reason: 'pointer_gone' } },
    quotations: [quote()],
    contracts: [
      { id: 'CT-D', contractNo: null, status: 'draft' },
      { id: 'CT-S', contractNo: 'CT-SD-26090001-0', status: 'signed' },
      { id: 'CT-X', contractNo: null, status: 'cancelled' },
    ],
    requests: [{ id: 'RQ-1', docNo: 'RQ-26090001', status: 'acknowledged', docNumbers: ['IV-6909-001'], recipientIds: ['u-fn'] }],
    orders: [{ id: 'SO-1', orderNumber: 'SO-26090001-0', status: 'cancelled' }],
  });
  assert.equal(preview.quoteNumber, 'QT-26090001-0');
  assert.equal(preview.blocked, '');
  assert.deepEqual(preview.forecast, {
    skipped: null, changed: true, before: 1000000, after: 500000, reason: 'pointer_gone', pinCleared: false, followQuoteNumber: null,
  });
  assert.deepEqual(preview.contracts, { drafts: 1, kept: [{ id: 'CT-S', contractNo: 'CT-SD-26090001-0', status: 'signed' }] });
  assert.deepEqual(preview.requests, [{ id: 'RQ-1', docNo: 'RQ-26090001', status: 'acknowledged', docNumbers: ['IV-6909-001'] }]);
  assert.deepEqual(preview.cancelledOrders, [{ id: 'SO-1', orderNumber: 'SO-26090001-0' }]);

  const detail = quotationCancelPromptDetail(preview);
  assert.match(detail, /^⚠️ ย้อนกลับเองไม่ได้/);
  assert.match(detail, /FC ของดีล ฿1,000,000\.00 → ฿500,000\.00/);
  assert.match(detail, /ร่างสัญญา 1 ใบถูกยกเลิกตาม/);
  assert.match(detail, /CT-SD-26090001-0/);
  assert.match(detail, /ยังมีผล/);
  assert.match(detail, /IV-6909-001/);
  assert.match(detail, /ไม่ยกเลิกเอกสารให้/);
  assert.match(detail, /SO-26090001-0/);
  assert.match(detail, /สถานะดีลไม่เปลี่ยน/);
  assert.match(detail, /ลายน้ำ “ยกเลิก”/);
});

test('พรีวิว: ดีล Lost/Won/ดีลที่ยังกรอกยอดเอง = "FC ไม่เปลี่ยน" พร้อมเหตุ · ไม่มีบรรทัดสัญญา/คำร้องถ้าไม่มี', () => {
  const lost = buildQuotationCancelPreview({ quote: quote(), deal: { ...followingDeal, stage: 'lost' }, forecast: null });
  assert.equal(lost.forecast.skipped, 'lost');
  const lostDetail = quotationCancelPromptDetail(lost);
  assert.match(lostDetail, /FC ไม่เปลี่ยน \(ดีล Lost/);
  assert.doesNotMatch(lostDetail, /สัญญา/);
  assert.doesNotMatch(lostDetail, /คำร้อง/);

  const won = buildQuotationCancelPreview({ quote: quote(), deal: { ...followingDeal, stage: 'won' }, forecast: null });
  assert.match(quotationCancelPromptDetail(won), /FC ไม่เปลี่ยน \(ดีลปิด Won แล้ว/);

  const held = buildQuotationCancelPreview({
    quote: quote(), deal: { ...followingDeal, forecastSource: 'manual' },
    forecast: { changed: false, reason: 'needs_user_choice', value: 1000000, pendingValue: 800000 },
  });
  assert.equal(held.forecast.changed, false);
  assert.match(quotationCancelPromptDetail(held), /FC ไม่เปลี่ยน/);
});

test('พรีวิว: FC ย้ายไปใบอื่นบอกเลขที่ · ปลดปักบอกด้วย · ใบรออนุมัติบอกว่าคำขอปิดไปพร้อมกัน', () => {
  const other = { id: 'QT2', quoteNumber: 'QT-26090002-0' };
  const preview = buildQuotationCancelPreview({
    quote: quote({ approvalStatus: 'pending', status: 'draft' }),
    deal: followingDeal,
    forecast: { changed: true, value: 300000, previousValue: 1000000, reason: 'lowest', resolved: { source: 'quotation', quotationId: 'QT2', reason: 'lowest', pinCleared: true } },
    quotations: [quote(), other],
  });
  assert.equal(preview.forecast.followQuoteNumber, 'QT-26090002-0');
  assert.equal(preview.forecast.pinCleared, true);
  const detail = quotationCancelPromptDetail(preview);
  assert.match(detail, /เดินตาม QT-26090002-0/);
  assert.match(detail, /ปลดการปัก/);
  assert.match(detail, /คำขออนุมัติที่ค้างอยู่ปิดไปพร้อมใบ/);
});

test('toast หลังยกเลิก บอกยอด FC ที่ขยับจริง · FC เขียนไม่ผ่านต้องไม่เงียบ', () => {
  assert.equal(quotationCancelToast('QT-1', null), 'ยกเลิกใบเสนอราคา QT-1 แล้ว');
  assert.equal(quotationCancelToast('QT-1', { changed: false, reason: 'single' }), 'ยกเลิกใบเสนอราคา QT-1 แล้ว · FC ไม่เปลี่ยน');
  assert.equal(
    quotationCancelToast('QT-1', { changed: true, previousValue: 1000000, value: 500000 }),
    'ยกเลิกใบเสนอราคา QT-1 แล้ว · FC ฿1,000,000.00 → ฿500,000.00',
  );
  assert.match(quotationCancelToast('QT-1', { changed: false, warning: 'timeout' }), /FC ยังไม่ขยับ: timeout/);
});

test('ใบที่ยกเลิกไม่ได้บอกทางที่ถูกแทน — Won ใช้ย้อนการรับ · ร่างไม่เคยยื่นใช้ลบ', () => {
  assert.match(quotationCancelStateError({ status: 'accepted' }), /ย้อนการรับ/);
  assert.match(quotationCancelStateError({ status: 'draft', approvalStatus: 'not_submitted' }), /ลบใบเสนอราคา/);
  assert.match(quotationCancelStateError({ status: 'cancelled' }), /ยกเลิกไปแล้ว/);
  assert.match(quotationCancelStateError({ status: 'revised' }), /ฉบับล่าสุด/);
  assert.match(quotationCancelStateError({ status: 'closed' }), /ปิดแล้ว/);
});
