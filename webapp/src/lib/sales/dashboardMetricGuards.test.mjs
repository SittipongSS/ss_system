/* ยามของสามจุดที่ตัวเลขเคยหายเงียบ (ตรวจ 2026-09-16) — เดือนเวลาไทย · วันคาดปิด · เป้าทีม vs เป้ารายคน */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wonMonthOf } from '@/lib/sales/dashboardMetrics';
import { buildMatrix, windowStat } from '@/lib/sales/performanceMath';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('wonMonthOf: ดีลที่ยังไม่มีใบอนุมัติ คิดเดือนจาก confirmedAt **เวลาไทย** ไม่ใช่ UTC', () => {
  // 2026-09-01 03:00 เวลาไทย = 2026-08-31T20:00Z — เดิมตกไปเดือน ส.ค. ขณะที่ DB (mig 0279) คิดเป็น ก.ย.
  assert.equal(wonMonthOf({ confirmedAt: '2026-08-31T20:00:00+00:00' }), '2026-09');
  assert.equal(wonMonthOf({ confirmedAt: '2026-09-01T03:00:00+07:00' }), '2026-09');
  // เดือนสุดท้ายของเดือนก่อนเวลาไทยยังอยู่เดือนนั้น (16:59Z = 23:59 ไทย)
  assert.equal(wonMonthOf({ confirmedAt: '2026-08-31T16:59:00+00:00' }), '2026-08');
  // ใบอนุมัติแล้วยังชนะเสมอ (ค่าที่ trigger เขียนเป็นเวลาไทยอยู่แล้ว)
  assert.equal(wonMonthOf({ metadata: { wonMonth: '2026-07' }, confirmedAt: '2026-08-31T20:00:00+00:00' }), '2026-07');
});

test('PATCH ดีล: ล้างวันที่คาดปิดไม่ได้ — เดือน FC มาจากช่องนี้ช่องเดียว', () => {
  const src = read('src/app/api/sales-planning/deals/[id]/route.js');
  // ด่านต้องอยู่ **ก่อน** ลูปคัดลอกช่อง ไม่งั้นค่าว่างถูกเขียนลง expectedCloseDate ได้แม้ forecastMonth ไม่ขยับ
  assert.match(src, /if \('expectedCloseDate' in body && !monthKey\(body\.expectedCloseDate\)\) \{\n\s*return badRequest\(/);
  assert.ok(src.indexOf("if ('expectedCloseDate' in body && !monthKey(body.expectedCloseDate))")
    < src.indexOf("for (const key of ['expectedCloseDate', 'lostReason', 'notes', 'team'])"), 'ด่านต้องมาก่อนลูปคัดลอกช่อง');
  assert.doesNotMatch(src, /patch\.forecastMonth = monthKey\(body\.expectedCloseDate\) \|\| null;/);
});

test('เป้าทีมกลืนเป้ารายคน: API ส่งผลรวมรายคนมาด้วย · matrix/windowStat พาไปถึงจอ · ไม่ปนกับ target', () => {
  const route = read('src/app/api/sales-planning/dashboard/route.js');
  assert.match(route, /teamMap\[key\]\.targetPersonSum = parts\.person;/);
  assert.match(route, /teamMap\[key\]\.target = parts\.level > 0 \? parts\.level : parts\.person;/);
  // ห้ามเอาไปบวกในช่องยอด/เป้า/ขาด-เกิน
  for (const line of route.split('\n').filter((l) => /targetPersonSum/.test(l) && !/^\s*(\/\/|\*)/.test(l))) {
    assert.doesNotMatch(line, /\b(target|won|gap|targetGap|fcTotal|weighted)\s*(\+=|=[^=>])/, line.trim());
  }
  const matrix = buildMatrix([{
    month: '2026-10',
    totals: { targetAmount: 13620000 },
    byTeam: [{ team: 'SV', target: 2340000, targetPersonSum: 2990000 }],
    byOwner: [],
  }], { months: ['2026-10'] });
  const team = matrix.teams.find((t) => t.team === 'SV');
  const stat = windowStat(team, { startIdx: 0, endIdx: 0, carryOn: false });
  assert.equal(stat.target, 2340000, 'เป้าของแถว = เป้าระดับทีมตามเดิม');
  assert.equal(stat.targetPersonSum, 2990000, 'ผลรวมรายคนมาถึงจอเพื่อขึ้นคำเตือน');
  assert.equal(stat.mustClose, 2340000, 'ต้องปิดไม่ขยับ');
  const board = read('src/components/salesPlanning/dashboard/performance/MorningBoard.js');
  /* คำเตือนต้องเทียบ **รายเดือนในงวด** และ **ทั้งสองทาง** — เทียบยอดรวมทั้งงวดทางเดียว เดือนที่เกินจะไปหักล้าง
     เดือนที่ขาด แล้วคำเตือนเงียบทั้งที่แถวทีมไม่เท่าผลรวมแถวคน */
  assert.match(board, /isTeam && targetMismatch\(row\)/);
  assert.match(board, /for \(let i = win\.startIdx; i <= win\.endIdx; i \+= 1\)/);
  assert.match(board, /Math\.abs\(p - Number\(row\.target\?\.\[i\] \|\| 0\)\) > 0\.5/);
});

test('หน้ารายการดีล: อ่าน project_tasks แบบซอยลิสต์ + ไล่หน้า + เช็ก error ครบสามชั้น', () => {
  const src = read('src/app/api/sales-planning/deals/route.js');
  const block = src.slice(src.indexOf('const stepMap = new Map();'), src.indexOf('const rows = visible.map'));
  assert.match(block, /fetchInChunks\(visible\.map\(\(d\) => d\.id\), \(chunk\) => fetchAllResult\(/);
  assert.match(block, /\.in\('dealId', chunk\)/);
  assert.match(block, /if \(taskError\) return fail\(taskError\.message, 500\);/);
});
