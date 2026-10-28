// ── กระดิ่งของ "นับ Actual รายงวด" (mig 0412) — ผู้รับ · กันแจ้งตัวเอง · กุญแจกันซ้ำ · ชนิดเข้ากระดิ่ง ──────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTALLMENT_ACTUAL_APPROVED_KIND, INSTALLMENT_ACTUAL_REJECTED_KIND, INSTALLMENT_ACTUAL_SUBMITTED_KIND,
  installmentActualDedupeKey, installmentActualNotice, installmentActualReviewerIds, notifyInstallmentActual,
} from './installmentActualNotify.js';
import { NOTIFICATION_BOXES, SALES_ORDER_BELL_KINDS } from '../notifications.js';

const ORDER = {
  id: 'SOR-1', orderNumber: 'SO-26100001-0', customerName: 'บริษัท ทดสอบ จำกัด',
  deal: { id: 'D-1', ownerId: 'U-AE' },
};
const SUBMITTED = {
  id: 'I2', seq: 2, label: 'ก่อนส่งของ', actualStatus: 'submitted',
  actualSubmittedAt: '2026-10-26T03:00:00.000Z', actualSubmittedById: 'U-AE',
};
const directory = (users) => new Map(users.map((u) => [u.id, u]));

test('ชนิดทั้งสามอยู่ใน SALES_ORDER_BELL_KINDS และขึ้นกระดิ่ง (ประกาศเป็นค่าคงที่ — ยามกวาดหา `_KIND =`)', () => {
  for (const kind of [INSTALLMENT_ACTUAL_SUBMITTED_KIND, INSTALLMENT_ACTUAL_APPROVED_KIND, INSTALLMENT_ACTUAL_REJECTED_KIND]) {
    assert.ok(SALES_ORDER_BELL_KINDS.includes(kind), kind);
    assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(kind), kind);
  }
});

test('ผู้อนุมัติที่รับกระดิ่ง = AE Supervisor ที่บัญชีเปิดอยู่ · ไม่มีเลยถอยไป admin · CD/CM ไม่รับ', () => {
  const dir = directory([
    { id: 'U-SUP', role: 'ae_supervisor' },
    { id: 'U-SUP-OFF', role: 'ae_supervisor', disabled: true },
    { id: 'U-CM', role: 'commercial_manager' },
    { id: 'U-ADM', role: 'admin' },
  ]);
  assert.deepEqual(installmentActualReviewerIds(dir), ['U-SUP']);
  assert.deepEqual(installmentActualReviewerIds(directory([{ id: 'U-ADM', role: 'admin' }, { id: 'U-CM', role: 'commercial_manager' }])), ['U-ADM']);
  assert.deepEqual(installmentActualReviewerIds(new Map()), []);
  assert.deepEqual(installmentActualReviewerIds(null), []);
  /* 🐞 review 26/10: AE Sup คนเดียวที่เปิดอยู่ยื่นงวดเอง — เคยตัดตัวเองทิ้งหลังเลือกผู้รับ ⇒ ไม่มีใครได้กระดิ่งเลย (ตัวเขาอนุมัติเองไม่ได้)
     ⇒ ตัดผู้ยื่นก่อน แล้วถอยไป admin (ไม่ใช่ CD/CM — มติ 24/09 ข้อ 6) */
  const lone = directory([
    { id: 'U-SUP', role: 'ae_supervisor' }, { id: 'U-CD', role: 'commercial_director' }, { id: 'U-ADM', role: 'admin' }, { id: 'U-AE', role: 'ae' },
  ]);
  assert.deepEqual(installmentActualReviewerIds(lone, 'U-SUP'), ['U-ADM']);
  assert.deepEqual(installmentActualReviewerIds(lone, 'U-AE'), ['U-SUP'], 'ผู้ยื่นไม่ใช่ AE Sup = AE Sup ตามเดิม');
  assert.deepEqual(installmentActualReviewerIds(dir, 'U-SUP'), ['U-ADM']);
  const notice = installmentActualNotice({
    action: 'actual_submit', order: ORDER, installment: SUBMITTED, reviewerIds: installmentActualReviewerIds(lone, 'U-SUP'), actorId: 'U-SUP',
  });
  assert.deepEqual(notice?.userIds, ['U-ADM'], 'กระดิ่งถึง admin ไม่เงียบ');
});

test('ยื่นงวด → ผู้อนุมัติ (ไม่รวมคนกด) · หัวข้อมีเลขที่ใบ · บอกยอดประมาณ · ลิงก์แท็บการชำระ', () => {
  const notice = installmentActualNotice({
    action: 'actual_submit', order: ORDER, installment: SUBMITTED, reviewerIds: ['U-SUP', 'U-AE'], actorId: 'U-AE', estimate: 33000,
  });
  assert.deepEqual(notice.userIds, ['U-SUP']);
  assert.equal(notice.kind, INSTALLMENT_ACTUAL_SUBMITTED_KIND);
  assert.equal(notice.entityType, 'sales_order');
  assert.equal(notice.entityId, 'SOR-1');
  assert.match(notice.title, /SO-26100001-0/);
  assert.match(notice.body, /งวดที่ 2 ก่อนส่งของ/);
  assert.match(notice.body, /33,000\.00 \(ก่อน VAT\)/);
  assert.equal(notice.href, '/sa/sales-orders/SOR-1?tab=payment');
  assert.equal(notice.dedupeKey, `INSTACT-actual_submit-I2-${SUBMITTED.actualSubmittedAt}`);
  // ไม่มีผู้อนุมัติเลย (หรือผู้อนุมัติคือคนกดเอง) = ไม่ยิง
  assert.equal(installmentActualNotice({ action: 'actual_submit', order: ORDER, installment: SUBMITTED, reviewerIds: [], actorId: 'U-AE' }), null);
  assert.equal(installmentActualNotice({ action: 'actual_submit', order: ORDER, installment: SUBMITTED, reviewerIds: ['U-AE'], actorId: 'U-AE' }), null);
});

test('อนุมัติ/ตีกลับ → ผู้ยื่นของรอบนั้น + เจ้าของดีลปัจจุบัน (ไม่ซ้ำ · ไม่รวมคนกด)', () => {
  const approved = { ...SUBMITTED, actualStatus: 'approved', actualAmount: 33000, actualApprovedAt: '2026-10-27T01:00:00.000Z' };
  const notice = installmentActualNotice({
    action: 'actual_approve', order: { ...ORDER, deal: { ownerId: 'U-AE2' } }, installment: approved, before: SUBMITTED, actorId: 'U-SUP',
  });
  assert.deepEqual(notice.userIds.sort(), ['U-AE', 'U-AE2']);
  assert.equal(notice.kind, INSTALLMENT_ACTUAL_APPROVED_KIND);
  assert.match(notice.body, /33,000\.00 \(ก่อน VAT\) เข้า Actual แล้ว/);
  assert.equal(notice.dedupeKey, `INSTACT-actual_approve-I2-${approved.actualApprovedAt}`);

  const rejected = { ...SUBMITTED, actualStatus: 'rejected', actualRejectedAt: '2026-10-27T01:00:00.000Z' };
  const back = installmentActualNotice({
    action: 'actual_reject', order: ORDER, installment: rejected, before: SUBMITTED, actorId: 'U-SUP', reason: 'ยังไม่ได้ส่งของงวดนี้',
  });
  assert.deepEqual(back.userIds, ['U-AE']);
  assert.equal(back.kind, INSTALLMENT_ACTUAL_REJECTED_KIND);
  assert.match(back.body, /ยังไม่ได้ส่งของงวดนี้/);

  // admin ที่ยื่นเองแล้วอนุมัติเอง (RPC ยอม) — คนเดียวกับผู้ยื่น/เจ้าของดีล = ไม่มีใครต้องรู้
  assert.equal(installmentActualNotice({
    action: 'actual_approve', order: ORDER, installment: approved, before: SUBMITTED, actorId: 'U-AE',
  }), null);
});

/* review รอบสาม 26/10: งวดที่แจ้งสลิป/รับรองไว้แล้ว (แถวที่ยกมา · จ่ายก่อนอนุมัติใบ) — กระดิ่งอนุมัติไม่ชวนไปแจ้งสลิปซ้ำ */
test('อนุมัติงวดที่แจ้งสลิปไว้แล้ว = ไม่บอกให้แจ้งสลิป · ยังไม่แจ้ง = บอกเหมือนเดิม', () => {
  const approve = (status) => installmentActualNotice({
    action: 'actual_approve', order: { ...ORDER, deal: { ownerId: 'U-AE2' } }, actorId: 'U-SUP', before: SUBMITTED,
    installment: { ...SUBMITTED, status, actualStatus: 'approved', actualAmount: 33000, actualApprovedAt: '2026-10-27T01:00:00.000Z' },
  }).body;
  assert.match(approve('pending'), /แจ้งสลิปงวดนี้ได้ที่แท็บการชำระ$/);
  assert.match(approve('reported'), /สลิปงวดนี้แจ้งไว้แล้ว รอบัญชีรับรอง$/);
  assert.match(approve('confirmed'), /งวดนี้บัญชีรับรองเงินแล้ว$/);
  for (const status of ['reported', 'confirmed']) assert.doesNotMatch(approve(status), /แจ้งสลิปงวดนี้ได้/);
});

test('ดึงกลับ/คำสั่งอื่นไม่แจ้ง · ของไม่ครบไม่ยิง', () => {
  assert.equal(installmentActualNotice({ action: 'actual_withdraw', order: ORDER, installment: SUBMITTED, actorId: 'U-AE' }), null);
  assert.equal(installmentActualNotice({ action: 'actual_submit', order: { id: 'SOR-1' }, installment: SUBMITTED, reviewerIds: ['U-SUP'] }), null);
  assert.equal(installmentActualNotice({ action: 'actual_submit', order: ORDER, installment: null, reviewerIds: ['U-SUP'] }), null);
  assert.equal(installmentActualDedupeKey('actual_submit', { id: 'I1' }), null, 'ไม่มีเวลาของรอบ = ไม่มีกุญแจ');
});

test('notifyInstallmentActual: ยื่น = อ่านทะเบียนผู้ใช้หาผู้อนุมัติแล้วเขียนแถวเดียวต่อคน · ดึงกลับไม่ยิง · ไม่ throw', async () => {
  const inserted = [];
  const supabase = {
    from(table) {
      assert.equal(table, 'notifications');
      return {
        upsert: async (rows) => { inserted.push(...rows); return { error: null }; },
        insert: async (rows) => { inserted.push(...rows); return { error: null }; },
      };
    },
  };
  let directoryReads = 0;
  const loadDirectory = async () => {
    directoryReads += 1;
    return directory([{ id: 'U-SUP', role: 'ae_supervisor' }, { id: 'U-AE', role: 'ae' }]);
  };
  assert.equal(notifyInstallmentActual(supabase, { action: 'actual_withdraw', order: ORDER, installment: SUBMITTED, loadDirectory }), false);
  assert.equal(notifyInstallmentActual(supabase, {
    action: 'actual_submit', order: ORDER, installment: SUBMITTED, actor: { id: 'U-AE', name: 'เอ ขายดี' }, loadDirectory,
  }), true);
  // นอกบริบท request ของ Next ⇒ ยิงตรง (ไม่รอ) — รอให้ microtask ไหลจบ
  for (let i = 0; i < 20 && !inserted.length; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(directoryReads, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].userId, 'U-SUP');
  assert.equal(inserted[0].kind, INSTALLMENT_ACTUAL_SUBMITTED_KIND);
  assert.equal(inserted[0].actorName, 'เอ ขายดี');
  assert.equal(inserted[0].updateId, `INSTACT-actual_submit-I2-${SUBMITTED.actualSubmittedAt}`);
});
