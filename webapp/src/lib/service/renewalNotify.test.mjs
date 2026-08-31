// ── กระดิ่งรอบบริการใกล้หมด (PR-E) ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { RENEWAL_BELL_KIND, renewalDedupeKey, renewalNotices } from './renewalNotify.js';
import { SERVICE_BELL_KINDS } from '@/lib/notifications.js';

const row = (over = {}) => ({
  siteId: 'ST1', site: { name: 'ไซต์ A', customerName: 'ลูกค้า ก' },
  endDate: '2026-09-15', daysLeft: 15, state: 'due_soon',
  deal: { id: 'D1', ownerId: 'U1', ownerName: 'AE หนึ่ง' },
  followup: null, ...over,
});

test('kind ที่ยิงจริงต้องอยู่ในกระดิ่ง — ไม่งั้นแจ้งเตือนเงียบหายโดยไม่มีอะไรฟ้อง', () => {
  assert.ok(SERVICE_BELL_KINDS.includes(RENEWAL_BELL_KIND));
});

test('ยิงหาเจ้าของดีลคนเดียว ไม่ใช่ทั้งทีม', () => {
  const [notice] = renewalNotices([row()]);
  assert.deepEqual(notice.userIds, ['U1']);
  assert.equal(notice.kind, RENEWAL_BELL_KIND);
  assert.match(notice.title, /ใกล้หมด/);
  assert.match(notice.body, /ลูกค้า ก/);
});

test('แถวที่มีคนรับเรื่องแล้วไม่ยิงซ้ำ — คนนั้นกำลังตามอยู่', () => {
  assert.deepEqual(renewalNotices([row({ followup: { id: 'F1', status: 'following' } })]), []);
});

test('ไม่มีเจ้าของดีล = ไม่ยิง (ห้ามหว่านหาทุกคน)', () => {
  assert.deepEqual(renewalNotices([row({ deal: null })]), []);
  assert.deepEqual(renewalNotices([row({ deal: { id: 'D1', ownerId: null } })]), []);
});

test('หมดแล้วกับใกล้หมดพูดคนละประโยค', () => {
  const [expired] = renewalNotices([row({ state: 'expired', daysLeft: -3, endDate: '2026-08-28' })]);
  assert.match(expired.title, /หมดแล้ว/);
  assert.doesNotMatch(expired.body, /อีก -3 วัน/);   // นับถอยหลังติดลบอ่านไม่รู้เรื่อง
});

test('กุญแจกันยิงซ้ำผูกกับวันหมด — รอบถัดไปของไซต์เดิมต้องยิงได้', () => {
  assert.equal(renewalDedupeKey('ST1', '2026-09-15'), 'renewal:ST1:2026-09-15');
  assert.notEqual(renewalDedupeKey('ST1', '2026-09-15'), renewalDedupeKey('ST1', '2027-09-15'));
  const [notice] = renewalNotices([row()]);
  assert.equal(notice.dedupeKey, 'renewal:ST1:2026-09-15');
});
