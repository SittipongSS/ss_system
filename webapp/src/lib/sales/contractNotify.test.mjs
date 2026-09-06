// กระดิ่งทวง "สัญญาค้างรอลงนาม" (lib/sales/contractNotify.js)
//
// สิ่งที่ต้องล็อก เรียงตามความเสียหายถ้าหลุด:
//   1) **เกณฑ์ต้องเป็นตัวเดียวกับการ์ด/ราง** — กระดิ่งเตือนก่อนที่การ์ดจะนับให้ =
//      คนเปิดหน้ามาแล้วเห็นเลข 0 ทั้งที่เพิ่งได้แจ้งเตือน ⇒ เลิกเชื่อกระดิ่ง
//   2) **หนึ่งคนหนึ่งเด้งต่อวัน** — ใบค้าง 6 ใบต้องไม่กลายเป็นกระดิ่ง 6 อัน
//   3) **ไม่มีเจ้าของ = ไม่ยิง** — ห้ามหว่านหาทั้งทีม (กติกาผู้รับ mig 0185)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIGNATURE_LATE_DAYS } from './contracts.js';
import {
  CONTRACT_OVERDUE_KIND, overdueSignatureDedupeKey, overdueSignatureNotices,
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
