// Rev. ไทม์ไลน์ของดีล + ชุดไทม์ไลน์ของดีลในโครงการ (งวด P2b ยุบดีล/โครงการ · มติเจ้าของ 13/11/2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDealTimelineSnapshot, DEAL_SNAPSHOT_FIELDS, liveTimelineRev, nextTimelineRev, restoreSummaryText, timelineRevBadge,
} from './dealTimelineRevisions.js';
import { attachRowsToProject } from './dealTimelineGen.js';

test('เลข Rev. ถัดไป = สูงสุดที่เคยออก + 1 · ยังไม่เคยออก = 0', () => {
  assert.equal(nextTimelineRev(null), 0);
  assert.equal(nextTimelineRev(undefined), 0);
  assert.equal(nextTimelineRev(0), 1);
  assert.equal(nextTimelineRev(4), 5);
});

test('Rev. บนกระดาษสด: ยังไม่ออก/แก้หลังออก = null · ออกแล้วไม่แก้ = เลขนั้น', () => {
  assert.equal(liveTimelineRev({}), null);
  assert.equal(liveTimelineRev({ timelineRev: 2, timelineRevStale: true }), null);
  assert.equal(liveTimelineRev({ timelineRev: 0, timelineRevStale: false }), 0);
});

test('ป้ายหัวแผง: ฉบับร่าง · Rev. N · Rev. N • แก้แล้ว', () => {
  assert.equal(timelineRevBadge({}).label, 'ฉบับร่าง');
  assert.deepEqual(
    [timelineRevBadge({ timelineRev: 1 }).label, timelineRevBadge({ timelineRev: 1 }).stale],
    ['Rev. 1', false],
  );
  const stale = timelineRevBadge({ timelineRev: 1, timelineRevStale: true });
  assert.equal(stale.label, 'Rev. 1 • แก้แล้ว');
  assert.equal(stale.stale, true);
});

test('snapshot: เก็บช่องดีลที่กระดาษใช้ · ไม่มีเงิน · เรียงขั้นตาม stepOrder', () => {
  const snap = buildDealTimelineSnapshot({
    deal: { id: 'D1', code: 'DL-1', title: 'ดีล', ownerName: 'AE', acOwnerName: 'AC', projectValue: 99999, wonValue: 5, metadata: {} },
    project: { id: 'P1', code: 'PJ-1', acOwner: 'AC', timelineStandardSnapshot: { big: true } },
    tasks: [{ id: 'b', stepOrder: 2 }, { id: 'a', stepOrder: 1 }],
    standard: { id: 'STD' },
  });
  assert.equal(snap.deal.code, 'DL-1');
  assert.equal(snap.deal.acOwnerName, 'AC');
  assert.ok(!('projectValue' in snap.deal) && !('wonValue' in snap.deal), 'snapshot ห้ามพกยอดเงิน');
  assert.ok(!DEAL_SNAPSHOT_FIELDS.some((f) => /value|amount|price|cost/i.test(f)));
  assert.ok(!('timelineStandardSnapshot' in snap.project), 'มาตรฐานเก็บที่ snapshot.standard ช่องเดียว');
  assert.deepEqual(snap.tasks.map((t) => t.id), ['a', 'b']);
  assert.equal(snap.standard.id, 'STD');
});

test('ข้อความผลย้อน', () => {
  assert.match(restoreSummaryText({ overwritten: 2, recreated: 1, deleted: 0 }, 3), /Rev\. 3 แล้ว — เขียนทับ 2, สร้างคืน 1, ลบ 0/);
  assert.match(restoreSummaryText({}, 1), /เหมือนสถานะปัจจุบัน/);
});

test('ชุดไทม์ไลน์ของดีลในโครงการ: ประทับ projectId · ต่อท้ายลำดับโครงการ · ปักหมุดขั้นราก', () => {
  const rows = [
    { id: 'r1', stepOrder: 0, predecessors: [] },
    { id: 'r2', stepOrder: 1, predecessors: ['r1'] },
  ];
  const out = attachRowsToProject(rows, 'P1', [{ stepOrder: 7 }, { stepOrder: 12 }]);
  assert.deepEqual(out.map((r) => [r.id, r.projectId, r.stepOrder, r.startLocked]), [
    ['r1', 'P1', 13, true],
    ['r2', 'P1', 14, false],
  ]);
  assert.deepEqual(attachRowsToProject(rows, 'P1', []).map((r) => r.stepOrder), [0, 1], 'โครงการยังไม่มีขั้น = เริ่ม 0');
});
