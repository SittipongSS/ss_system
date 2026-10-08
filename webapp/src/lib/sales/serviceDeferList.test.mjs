// ── ทะเบียนใบสั่งขาย × ใบที่ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404 · มติเจ้าของ 01/10 · แผน IMPL_PLAN_DEFER §3.5) ─────────────
//
// ⭐ ใบที่ข้ามการตั้งงานบริการตอนยื่นขึ้นสองคิวบนทะเบียน **โดยไม่มีคิวรี/เลนใหม่**:
//   1. รออนุมัติ — แถวคิวของผู้อนุมัติต่อท้ายด้วยป้าย "ยังไม่ตั้งงานบริการ (ข้ามตอนยื่น)" (`serviceDeferredTag` · จอแค่ต่อสตริง)
//   2. อนุมัติแล้ว — เลน "รอฉันลงมือ" ของเจ้าของดีล + ชิป "ยังไม่ตั้งงานบริการ" ตัวเดิม (`serviceBackfillNeeded`) → ยื่นตรวจแล้วขึ้นคิวผู้จัดการ
//      ด้วยป้าย "งานบริการ (ข้ามตอนยื่น)" แทน "งานบริการ (ใบเดิม)" (`serviceReview.label`)
// ⚠️ route ของทะเบียน import ใต้ node ไม่ได้ (`@/lib/http` ลาก next/headers) ⇒ ยามต้นทางยึดสองนิพจน์ + เทสต์พฤติกรรมของตัวตัดสินที่นิพจน์เรียก
//   🔴 ห้ามแก้บรรทัดป้ายของ 0396 ที่ approvalQueueOnLists.test.mjs ยึดไว้ — ป้ายของ 0404 ต่อ **หลัง** บรรทัดนั้น
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SERVICE_DEFERRED_TEXT, SERVICE_REOPENED_TEXT, serviceBackfillAwaitingReview, serviceBackfillNeeded, serviceSetupDeferred, serviceSetupReopened,
} from './serviceSetup.js';
import { isSalesOrderWaitingOnMe } from './salesOrderWorkflow.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = (rel) => stripComments(readFileSync(join(SRC, rel), 'utf8'));
const LIST_ROUTE = 'app/api/sales-planning/sales-orders/route.js';

const DEFER_COLS = { serviceSetupDeferredAt: '2026-10-02T02:30:00Z', serviceSetupDeferredById: 'U-AE', serviceSetupDeferredByName: 'Kamonrat P.' };
const row = (over = {}) => ({
  id: 'SO1', orderNumber: 'SO-26100005-0', status: 'pending_approval', origin: 'pipeline', dealId: 'DL1',
  deal: { id: 'DL1', line: 'SERVICE', ownerId: 'U-AE' }, createdBy: 'U-AC', submittedBy: 'U-AE',
  supersededById: null, serviceTermsOpenedAt: null, serviceSetupState: null, ...over,
});
const MANUAL_LINE = { id: 'L1', fgCode: null, productId: null, metadata: {}, serviceKind: null };

/* นิพจน์ของ route (ยามข้างล่างยึดไว้ตามตัวอักษร) — เขียนซ้ำที่นี่เพื่อไล่พฤติกรรมกับตัวตัดสินจริง */
const tagOf = (order, businessLine) => (serviceSetupDeferred(order)?.stage === 'pending' && businessLine === 'SERVICE'
  ? SERVICE_DEFERRED_TEXT.queueTag : null);
const reviewLabelOf = (order) => ({
  label: serviceSetupReopened(order) ? SERVICE_REOPENED_TEXT.queueLabel : null,
  ...(serviceSetupDeferred(order) ? { label: SERVICE_DEFERRED_TEXT.queueLabel } : {}),
}).label;

test('ยามต้นทาง: ป้ายของใบที่ข้ามติดที่ server ด้วยตัวตัดสินกลาง + คำจากแคตตาล็อก · ต่อหลังบรรทัดป้ายของ 0396 (ไม่แก้บรรทัดนั้น)', () => {
  const route = code(LIST_ROUTE);
  assert.match(route, /serviceDeferredTag: serviceSetupDeferred\(row\)\?\.stage === 'pending' && businessLineById\.get\(row\.id\) === 'SERVICE'\s*\? SERVICE_DEFERRED_TEXT\.queueTag : null,/);
  const pinned = 'label: serviceSetupReopened(row) ? SERVICE_REOPENED_TEXT.queueLabel : null,';
  const override = '...(serviceSetupDeferred(row) ? { label: SERVICE_DEFERRED_TEXT.queueLabel } : {}),';
  assert.ok(route.includes(pinned), 'บรรทัดป้ายของ 0396 คงเดิมทุกตัวอักษร (approvalQueueOnLists.test.mjs)');
  assert.ok(route.indexOf(override) > route.indexOf(pinned), 'ป้ายของ 0404 ทับได้เพราะอยู่หลัง — และตัวตัดสินไม่ตอบพร้อมกัน');
  assert.equal(route.split('serviceSetupDeferred(').length - 1, 2, 'สองจุด: ป้ายแถวคิวผู้จัดการ + ป้ายต่อท้ายใบรออนุมัติ');
  /* จอ/route ไม่พิมพ์คำเอง */
  assert.doesNotMatch(route, /ข้ามตอนยื่น/);
  /* เลน · ชิป · ตัวนับไม่มีอะไรใหม่ — ใบที่ข้ามเข้าเกณฑ์เดิม (อนุมัติแล้ว · ยังไม่ประทับ) */
  assert.match(route, /_serviceSetupPending: setupPendingIds\.has\(row\.id\),/);
  assert.match(route, /\.filter\(\(row\) => serviceBackfillNeeded\(row, linesByOrder\.get\(row\.id\) \|\| \[\], lineCtx\)\)/);
  assert.doesNotMatch(code('app/api/nav/counts/route.js'), /serviceSetupDeferred|SERVICE_DEFERRED_TEXT/, 'ป้ายตัวเลขบนเมนูนับจากเลนเดิม ไม่ต้องรู้จักการข้าม');
  assert.doesNotMatch(code('lib/sales/salesOrderWorkflow.js'), /serviceSetupDeferred/);
});

test('ป้ายต่อท้ายใบรออนุมัติ: เฉพาะใบที่ผู้ยื่นเลือกข้าม · ยังรออนุมัติ · สาย SERVICE — อย่างอื่น null', () => {
  assert.equal(tagOf(row(DEFER_COLS), 'SERVICE'), 'ยังไม่ตั้งงานบริการ (ข้ามตอนยื่น)');
  assert.equal(tagOf(row(), 'SERVICE'), null, 'ใบรออนุมัติปกติ (รวมใบที่ยื่นค้างก่อน deploy)');
  assert.equal(tagOf(row(DEFER_COLS), 'PRODUCT'), null, 'สายถูกเปลี่ยนระหว่างรออนุมัติ — ไม่มีงานบริการให้พูดถึง');
  assert.equal(tagOf(row(DEFER_COLS), null), null);
  /* อนุมัติแล้ว = ชิป "ยังไม่ตั้งงานบริการ" เดิมรับช่วงต่อ · สถานะอื่นตราเป็นแค่ประวัติ */
  for (const status of ['approved', 'approval_revoked', 'cancelled', 'revised', 'draft', 'rejected']) {
    assert.equal(tagOf(row({ ...DEFER_COLS, status }), 'SERVICE'), null, status);
  }
  assert.equal(tagOf(row({ ...DEFER_COLS, origin: 'historical' }), 'SERVICE'), null);
});

test('หลังอนุมัติแบบข้าม: ใบขึ้นเลน "รอฉันลงมือ" ของเจ้าของดีลด้วยเกณฑ์เดิม → ยื่นตรวจแล้วย้ายไปคิวผู้จัดการพร้อมป้าย "งานบริการ (ข้ามตอนยื่น)"', () => {
  const approved = row({ ...DEFER_COLS, status: 'approved' });
  assert.equal(serviceBackfillNeeded(approved, [MANUAL_LINE]), true, 'ชิป "ยังไม่ตั้งงานบริการ" + เลนเจ้าของดีลหยิบใบเอง');
  assert.equal(isSalesOrderWaitingOnMe(approved, { userId: 'U-AE', role: 'ae', serviceBackfillNeeded: true }), true, 'เจ้าของดีลต้องลงมือ');
  assert.equal(isSalesOrderWaitingOnMe(approved, { userId: 'U-AC', role: 'ac', serviceBackfillNeeded: true }), false, 'ผู้สร้างแทนไม่ใช่คนลงมือ');
  assert.equal(isSalesOrderWaitingOnMe(approved, { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor', serviceBackfillNeeded: true }), false, 'ยังไม่ยื่นตรวจ — ไม่ใช่งานของผู้จัดการ');
  assert.equal(reviewLabelOf(approved), 'งานบริการ (ข้ามตอนยื่น)');

  const submitted = { ...approved, serviceSetupState: 'submitted', serviceSetupSubmittedById: 'U-AE' };
  assert.equal(serviceBackfillAwaitingReview(submitted), true);
  assert.equal(isSalesOrderWaitingOnMe(submitted, { userId: 'U-SUP', reviewer: true, role: 'ae_supervisor' }), true, 'คิวผู้จัดการ');
  assert.equal(isSalesOrderWaitingOnMe(submitted, { userId: 'U-AE', role: 'ae', serviceBackfillNeeded: true }), false, 'รอผู้จัดการ — ไม่ใช่งานของเจ้าของดีลแล้ว');
  assert.equal(reviewLabelOf(submitted), 'งานบริการ (ข้ามตอนยื่น)');

  /* ลำดับป้ายของแถวคิวผู้จัดการ: เปิดแก้ทีหลัง = ป้ายของ 0396 · ใบเดิม = null (จอใช้ "งานบริการ (ใบเดิม)") */
  const reopenedLater = { ...submitted, serviceSetupReopenedAt: '2026-10-09T03:00:00Z', serviceSetupReopenedByName: 'Kamonrat P.' };
  assert.equal(reviewLabelOf(reopenedLater), 'แก้งานบริการ (หลังอนุมัติ)');
  const deferredLater = { ...submitted, serviceSetupReopenedAt: '2026-09-20T03:00:00Z', serviceSetupReopenedByName: 'Kamonrat P.' };
  assert.equal(reviewLabelOf(deferredLater), 'งานบริการ (ข้ามตอนยื่น)');
  const legacy = row({ status: 'approved', serviceSetupState: 'submitted' });
  assert.equal(reviewLabelOf(legacy), null);
  /* ผู้จัดการอนุมัติแล้ว (ประทับ) — ออกจากทุกคิว ป้ายไม่เหลือ */
  const stamped = { ...submitted, serviceSetupState: null, serviceTermsOpenedAt: '2026-10-06T03:00:00Z' };
  assert.equal(serviceBackfillNeeded(stamped, [MANUAL_LINE]), false);
  assert.equal(serviceSetupDeferred(stamped), null);
});
