// กระดิ่งทวง "สัญญาค้างรอลงนาม" (lib/sales/contractNotify.js)
//
// สิ่งที่ต้องล็อก เรียงตามความเสียหายถ้าหลุด:
//   1) **เกณฑ์ต้องเป็นตัวเดียวกับการ์ด/ราง** — กระดิ่งเตือนก่อนที่การ์ดจะนับให้ =
//      คนเปิดหน้ามาแล้วเห็นเลข 0 ทั้งที่เพิ่งได้แจ้งเตือน ⇒ เลิกเชื่อกระดิ่ง
//   2) **หนึ่งคนหนึ่งเด้งต่อวัน** — ใบค้าง 6 ใบต้องไม่กลายเป็นกระดิ่ง 6 อัน
//   3) **ไม่มีเจ้าของ = ไม่ยิง** — ห้ามหว่านหาทั้งทีม (กติกาผู้รับ mig 0185)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SIGNATURE_LATE_DAYS, isContractWaitingOnMe } from './contracts.js';
import {
  CONTRACT_APPROVAL_PENDING_KIND, CONTRACT_APPROVED_KIND, CONTRACT_OVERDUE_KIND,
  contractApprovedNotice, overdueSignatureDedupeKey, overdueSignatureNotices, pendingApprovalNotices,
} from './contractNotify.js';

const NOW = new Date('2026-09-06T03:00:00.000Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const contract = (over) => ({
  id: 'CTR-1', contractNo: 'CT-SD-26080001-0', status: 'awaiting_signature',
  issuedAt: daysAgo(SIGNATURE_LATE_DAYS + 1), ownerId: 'u-1', customerName: 'ลูกค้า ก',
  ...over,
});

test('เกณฑ์ตรงกับการ์ดสรุปและราง — เท่าเกณฑ์พอดียังไม่ทวง เกินหนึ่งวันถึงทวง', () => {
  const onTime = overdueSignatureNotices(
    [contract({ issuedAt: daysAgo(SIGNATURE_LATE_DAYS) })], { now: NOW, dayKey: '2026-09-06' },
  );
  assert.deepEqual(onTime, [], 'ค้างเท่าเกณฑ์พอดีต้องยังไม่ได้กระดิ่ง (การ์ดก็ยังไม่นับ)');

  const late = overdueSignatureNotices([contract()], { now: NOW, dayKey: '2026-09-06' });
  assert.equal(late.length, 1);
  assert.equal(late[0].kind, CONTRACT_OVERDUE_KIND);
  assert.match(late[0].title, new RegExp(`นานสุด ${SIGNATURE_LATE_DAYS + 1} วัน`));
});

test('ใบที่ยังไม่ออกเลข/ลงนามแล้ว ไม่เข้าตัวทวง — ขั้นที่ไม่ได้รอลูกค้าเซ็นไม่ใช่ของค้าง', () => {
  const rows = [
    contract({ id: 'CTR-draft', status: 'draft', issuedAt: null }),
    contract({ id: 'CTR-signed', status: 'signed' }),
    contract({ id: 'CTR-approval', status: 'awaiting_approval' }),
    // ออกเลขแล้วแต่ไม่มีเวลาออก (ของเก่า) — นับไม่ได้ ก็ต้องไม่เดา
    contract({ id: 'CTR-noissued', issuedAt: null }),
  ];
  assert.deepEqual(overdueSignatureNotices(rows, { now: NOW, dayKey: '2026-09-06' }), []);
});

test('⭐ หนึ่งคนหนึ่งเด้ง — ใบค้างหลายใบรวมเป็นข้อความเดียว ผูกกับใบที่นานสุด', () => {
  const rows = [
    contract({ id: 'CTR-a', contractNo: 'CT-SD-26080001-0', issuedAt: daysAgo(20) }),
    contract({ id: 'CTR-b', contractNo: 'CT-SD-26080002-0', issuedAt: daysAgo(40) }),
    contract({ id: 'CTR-c', contractNo: 'CT-SD-26080003-0', issuedAt: daysAgo(16) }),
  ];
  const notices = overdueSignatureNotices(rows, { now: NOW, dayKey: '2026-09-06' });
  assert.equal(notices.length, 1, 'สามใบของคนเดียวกันต้องได้กระดิ่งใบเดียว');
  assert.deepEqual(notices[0].userIds, ['u-1']);
  assert.match(notices[0].title, /ค้าง 3 ใบ · นานสุด 40 วัน/);
  /* ผูกกับใบที่ค้างนานสุด — ลบใบนั้นแล้วแจ้งเตือนถูกกวาดตาม (purgeNotificationsMany
     ใน DELETE ของสัญญา) · ผูกกับใบแรกที่เจอแทน = แถวกำพร้าที่กดแล้ว 404 */
  assert.equal(notices[0].entityId, 'CTR-b');
  assert.match(notices[0].body, /CT-SD-26080002-0/);
});

test('คนละคนคนละเด้ง และกุญแจกันซ้ำเป็นรายคนรายวัน', () => {
  const rows = [contract({ id: 'CTR-a' }), contract({ id: 'CTR-b', ownerId: 'u-2' })];
  const notices = overdueSignatureNotices(rows, { now: NOW, dayKey: '2026-09-06' });
  assert.equal(notices.length, 2);
  assert.deepEqual(
    notices.map((n) => n.dedupeKey).sort(),
    ['CTLATE-2026-09-06-u-1', 'CTLATE-2026-09-06-u-2'],
  );
  assert.equal(overdueSignatureDedupeKey('2026-09-07', 'u-1'), 'CTLATE-2026-09-07-u-1');
});

test('ไม่มีเจ้าของก็ยังถึงคนที่สร้าง — แต่ไม่มีทั้งคู่ = ไม่ยิง ไม่ใช่หว่านทั้งทีม', () => {
  const rows = [
    contract({ id: 'CTR-a', ownerId: null, createdBy: 'u-9' }),
    contract({ id: 'CTR-b', ownerId: null, createdBy: null }),
  ];
  const notices = overdueSignatureNotices(rows, { now: NOW, dayKey: '2026-09-06' });
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0].userIds, ['u-9']);
});

test('ไม่มีแถวเข้าเกณฑ์ = ลิสต์ว่าง ไม่ใช่ throw — cron ต้องไม่ล้มเพราะวันที่ไม่มีงานค้าง', () => {
  assert.deepEqual(overdueSignatureNotices([], { now: NOW, dayKey: '2026-09-06' }), []);
  assert.deepEqual(overdueSignatureNotices(undefined, { now: NOW, dayKey: '2026-09-06' }), []);
});

/* ══════════════════════════════════════════════════════════════════════════
   ขั้นอนุมัติของ AE Supervisor (2026-09-15)
   🐞 ของจริง: เอกสารแทนสัญญาแนบครบแล้วค้าง 12 วัน ไม่มีใครกด — ช่องทางเดียวคือป้ายเมนู
   ══════════════════════════════════════════════════════════════════════════ */
const APPROVERS = ['sup-1', 'sup-2'];
const DAY = '2026-09-15';

test('⭐ รอผู้อนุมัติ = ใบรอรับรองการลงนาม + เอกสารแทนสัญญาที่แนบแล้ว · หนึ่งคนหนึ่งเด้ง', () => {
  const rows = [
    { id: 'CTR-ext-ready', status: 'draft', source: 'external', createdAt: '2026-09-03T03:00:00Z', customerName: 'เคพี' },
    { id: 'CTR-signed', status: 'awaiting_approval', source: 'generated', contractNo: 'CT-SD-26090001-0', createdAt: '2026-09-10T03:00:00Z' },
    // ⚠️ ร่าง external ที่ยังไม่แนบ — ปุ่มอนุมัติกดไม่ได้ ห้ามทวง
    { id: 'CTR-ext-empty', status: 'draft', source: 'external', createdAt: '2026-09-01T03:00:00Z' },
    // ร่างที่ระบบเจน ไม่ใช่งานของผู้อนุมัติ
    { id: 'CTR-gen-draft', status: 'draft', source: 'generated', createdAt: '2026-09-01T03:00:00Z' },
  ];
  const notices = pendingApprovalNotices(rows, {
    docReadyIds: new Set(['CTR-ext-ready']), approverIds: APPROVERS, dayKey: DAY,
  });
  assert.equal(notices.length, 2, 'ผู้อนุมัติสองคน = สองเด้ง ไม่ใช่เด้งต่อใบ');
  assert.deepEqual(notices.map((n) => n.userIds), [['sup-1'], ['sup-2']]);
  assert.equal(notices[0].kind, CONTRACT_APPROVAL_PENDING_KIND);
  assert.match(notices[0].title, /2 ใบ/);
  assert.match(notices[0].body, /เอกสารแทนสัญญา 1 ใบ · รับรองการลงนาม 1 ใบ/);
  // ผูกกับใบที่รอนานสุด — ใบนั้นคือใบที่ต้องเห็นก่อน
  assert.equal(notices[0].entityId, 'CTR-ext-ready');
  assert.deepEqual(notices.map((n) => n.dedupeKey), ['CTAPPROVE-2026-09-15-sup-1', 'CTAPPROVE-2026-09-15-sup-2']);
});

test('ไม่มีใบรอ หรือไม่มีผู้อนุมัติ = ไม่ยิง', () => {
  const ready = [{ id: 'C1', status: 'awaiting_approval' }];
  assert.deepEqual(pendingApprovalNotices([], { approverIds: APPROVERS, dayKey: DAY }), []);
  assert.deepEqual(pendingApprovalNotices(ready, { approverIds: [], dayKey: DAY }), []);
  // ไม่ส่งชุดแนบแล้ว = ร่าง external ไม่นับ (ไม่เดาว่าแนบแล้ว)
  assert.deepEqual(pendingApprovalNotices([{ id: 'C2', status: 'draft', source: 'external' }], {
    approverIds: APPROVERS, dayKey: DAY,
  }), []);
});

/* 🔴 รีวิว 25/09: เอกสารแทนสัญญาของใบสั่งขายย้อนหลัง (0374) คือร่าง external ที่ฟอร์มคีย์ใบแนบไฟล์ให้แล้ว
   แต่อนุมัติพร้อมใบสั่งขาย ไม่ใช่ที่หน้าสัญญา ⇒ เลน "รอฉันรับรอง" ตัดทิ้ง · กระดิ่งต้องตัดด้วย ไม่งั้น AE Sup
   ได้กระดิ่งทุกเช้าแล้วกดเข้าไปไม่เจอใบ (ของเดิมนับ เพราะเขียนเงื่อนไขเอง + cron ไม่ select `metadata`) */
test('🔴 เอกสารแทนสัญญาของใบสั่งขายย้อนหลังไม่เข้ากระดิ่ง — ตัดสินด้วยเลนเดียวกับ ?waiting=1', () => {
  const substitute = {
    id: 'CTR-sub', status: 'draft', source: 'external', createdAt: '2026-09-23T03:00:00Z',
    metadata: { historicalSalesOrderId: 'SOR-H1' },
  };
  assert.deepEqual(pendingApprovalNotices([substitute], {
    docReadyIds: new Set(['CTR-sub']), approverIds: APPROVERS, dayKey: DAY,
  }), [], 'มีไฟล์แล้วก็ไม่ใช่งานของหน้าสัญญา');
  const withReal = pendingApprovalNotices([substitute, { id: 'CTR-real', status: 'draft', source: 'external', createdAt: '2026-09-24T03:00:00Z' }], {
    docReadyIds: new Set(['CTR-sub', 'CTR-real']), approverIds: APPROVERS, dayKey: DAY,
  });
  assert.equal(withReal.length, 2);
  assert.match(withReal[0].title, /1 ใบ/);
  assert.equal(withReal[0].entityId, 'CTR-real');
  // ชุดที่นับต้องเท่ากับเลนผู้อนุมัติของทะเบียนเป๊ะ
  const lane = [substitute, { id: 'CTR-real', status: 'draft', source: 'external' }]
    .filter((row) => isContractWaitingOnMe(row, { user: { role: 'ae_supervisor' }, externalDocReady: true }))
    .map((row) => row.id);
  assert.deepEqual(lane, ['CTR-real']);
});

test('🔴 cron เลือก `metadata` มากับแถว — ขาดแล้วตัวตัดใบแทนของใบย้อนหลังตอบ false เงียบ ๆ', () => {
  const route = readFileSync(new URL('../../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  const block = route.slice(route.indexOf('async function notifyPendingContractApprovals'));
  assert.match(block.slice(0, 1600), /\.select\('[^']*\bmetadata\b[^']*'\)/);
  // ผู้รับกระดิ่ง = กลุ่มตำแหน่ง ไม่ใช่ชื่อตำแหน่งตรง ๆ (CD/CM อนุมัติได้แต่ไม่รับกระดิ่ง · มติ 24/09 ข้อ 6)
  assert.match(block, /SALES_BELL_ROLES\.includes\(u\.role\)/);
  /* 🔴 รีวิว 25/09 รอบสอง: อ่านไฟล์แนบพังต้องโยน (strict) ไม่ใช่ได้ชุดว่างแล้วรายงาน "ไม่มีใบรออนุมัติ"
     · มีใบรอแต่ไม่มีผู้รับต้องเป็น error ไม่ใช่ "ไม่มีใบรอ" */
  assert.match(block, /externalDocReadyIds\(supabase, rows, null, \{ anyViewer: true, strict: true \}\)/);
  assert.match(block, /if \(!approverIds\.length\) \{\s*\n\s*return \{ sent: 0, pending: pending\.length, error:/);
});

test('⭐ อนุมัติแล้วแจ้งเจ้าของใบ + คนสร้าง — ไม่แจ้งคนที่กดเอง', () => {
  const contract = {
    id: 'CTR-1', contractNo: 'CT-SR-26090001-0', kind: 'service', source: 'external',
    ownerId: 'u-own', createdBy: 'u-sup', customerName: 'โกลเบิล สปอร์ต',
  };
  const notice = contractApprovedNotice(contract, { id: 'u-sup', name: 'หัวหน้า' });
  assert.deepEqual(notice.userIds, ['u-own'], 'คนกดเป็นคนสร้างเอง ต้องไม่ได้กระดิ่งของตัวเอง');
  assert.equal(notice.kind, CONTRACT_APPROVED_KIND);
  assert.match(notice.title, /เอกสารแทนสัญญา/);
  assert.match(notice.body, /ผูกเข้าใบสั่งขาย/, 'สัญญาบริการต้องบอกขั้นถัดไป');
  assert.equal(notice.dedupeKey, 'CTAPPROVED-CTR-1');

  const generated = contractApprovedNotice({ ...contract, kind: 'scent_design', source: 'generated' }, { id: 'u-x' });
  assert.match(generated.title, /รับรองการลงนาม/);
  assert.doesNotMatch(generated.body, /ใบสั่งขาย/, 'สัญญาออกแบบกลิ่นไม่มีใบให้ผูก');
  assert.deepEqual(generated.userIds, ['u-own', 'u-sup']);
});

test('ไม่มีใครต้องรู้ = null ไม่ใช่แถวแจ้งเตือนว่าง', () => {
  assert.equal(contractApprovedNotice({ id: 'C', ownerId: 'u-1', createdBy: 'u-1' }, { id: 'u-1' }), null);
  assert.equal(contractApprovedNotice(null, { id: 'u-1' }), null);
});
