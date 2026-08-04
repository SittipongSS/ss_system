// ── ยอดรวมบริษัทต้องกระทบกับผลรวมรายทีมได้ ─────────────────────────────────
//
// แดชบอร์ดคืนตัวเลขสองระดับที่คนอ่านเอามาเทียบกันเสมอ:
//   totals.*  ยอดรวมทั้งฝ่าย
//   byTeam[]  แยกรายทีม (หน้า "ผลงานขาย" วาดเป็นแถวทีม + แถวบริษัท)
// ถ้าดีลบางใบถูกนับใน totals แต่หายจาก byTeam ⇒ สองแถวไม่ตรงกันโดยไม่มีอะไรบอก
// แล้วคนจะไปไล่หาว่า "ยอดหายไปไหน" ทั้งที่ข้อมูลอยู่ครบ
//
// 🐞 เดิม route กรอง `.filter((b) => b.team)` ทิ้งถังของดีลที่ไม่ระบุทีม
// เอื้อมถึงจริง: ฟอร์มสร้างดีลไม่มีช่องทีม → ทีมมาจาก `user.team` ล้วน และ
// **แอดมิน/AE Supervisor ไม่มีทีม** ⇒ ดีลที่สองตำแหน่งนี้เปิดจะไร้ทีมทันที
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { forecastAccuracyRollup, isRealLostDeal, wonMonthOf } from './dashboardMetrics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/dashboard/route.js'), 'utf8');

test('byTeam ต้องไม่ทิ้งถังของดีลที่ไม่ระบุทีม', () => {
  assert.doesNotMatch(
    route, /\.filter\(\(b\) => b\.team\)/,
    'ตัดถัง null ทิ้ง = ดีลไร้ทีมนับใน totals แต่หายจากตารางทีม ⇒ ยอดสองระดับไม่ตรงกัน',
  );
});

/* ทีมของดีลมาจากบัญชีผู้สร้าง ไม่ได้มาจากฟอร์ม — ตรึงไว้เพื่อให้เหตุผลข้างบนยังจริง
   ถ้าวันหนึ่งฟอร์มมีช่องทีม/บังคับทีม เงื่อนไขจะเปลี่ยนและควรกลับมาทบทวนตรงนี้ */
test('ทีมของดีลมาจาก user.team (ฟอร์มไม่มีช่องทีม) — ต้นเหตุที่ทำให้เกิดดีลไร้ทีม', () => {
  const post = readFileSync(join(ROOT, 'src/app/api/sales-planning/deals/route.js'), 'utf8');
  assert.match(post, /team: body\.team \|\| user\.team \|\| null/);
  const form = readFileSync(join(ROOT, 'src/components/salesPlanning/DealFormFields.js'), 'utf8');
  assert.doesNotMatch(form, /name="team"|label="ทีม"/, 'ฟอร์มยังไม่มีช่องทีม');
});

// ── กติกาการรวมยอดที่หน้าเว็บกับ server ต้องใช้ชุดเดียวกัน ──────────────────
test('FC Total = เปิด + Won + แพ้ (ไม่เอา Actual มาแทน FC ของดีลที่ปิดแล้ว)', () => {
  const open = [{ projectValue: 100 }];
  const won = [{ projectValue: 200, wonValue: 180, metadata: { actualSource: 'sale_order' } }];
  const lost = [{ projectValue: 50 }];
  const r = forecastAccuracyRollup(open, won, lost);
  assert.equal(r.fullForecast, 350, 'FC Total ต้องคิดจาก projectValue ของทั้งสามกลุ่ม');
  assert.equal(r.remainingForecast, 100, 'FC คงเหลือ = เฉพาะดีลที่ยังเปิด');
  assert.equal(r.wonValue, 180, 'Actual = ยอดจาก SO ที่อนุมัติแล้ว');
  assert.equal(r.forecastVariance, 180 - 200 - 50);
});

test('Actual นับเฉพาะที่ยืนยันว่ามาจาก Sale Order ที่อนุมัติแล้ว', () => {
  // ดีล Won ที่ยังไม่มี SO อนุมัติ → Actual = 0 (wonValue เป็นแค่ cache จากใบเสนอราคา)
  const r = forecastAccuracyRollup([], [{ projectValue: 200, wonValue: 180, metadata: {} }], []);
  assert.equal(r.wonValue, 0, 'ยังไม่มี actualSource=sale_order ห้ามนับเป็น Actual');
  assert.equal(r.fullForecast, 200, 'แต่ FC ของมันยังอยู่ในภาพรวม');
});

test('ดีลที่ถูกยุบ/แทนที่ของสายสหมิตร ไม่ใช่ "แพ้จริง"', () => {
  assert.equal(isRealLostDeal({ stage: 'lost' }), true);
  assert.equal(isRealLostDeal({ stage: 'lost', metadata: { sahamitMergedIntoDealId: 'D9' } }), false);
  assert.equal(isRealLostDeal({ stage: 'lost', metadata: { sahamitSupersededByRoundId: 'R2' } }), false);
});

/* เดือนที่นับ Actual มาก่อนเดือน FC เสมอ — ดีลที่ FC ไว้เดือนหนึ่งแต่ปิดได้อีกเดือน
   จะย้ายไปนับ (ทั้ง Actual **และ FC ของตัวเอง**) ที่เดือนที่ปิด ไม่ค้างที่เดือน FC เดิม

   ⭐ มติผู้ใช้ 2026-08-05: **ตั้งใจให้เป็นแบบนี้** เพราะเส้นทางทำงานจริงคือ SA/AE
   เลื่อนเดือน FC ตามความเป็นจริงอยู่แล้ว เดือน FC กับเดือนที่ปิดจึงควรตรงกันเอง
   ตรึงลำดับ fallback ไว้เพราะมันเป็นตัวกำหนดว่ายอดไปโผล่เดือนไหน */
test('ลำดับการเลือกเดือนของยอด Won', () => {
  assert.equal(wonMonthOf({ metadata: { wonMonth: '2026-03' }, confirmedAt: '2026-05-01', forecastMonth: '2026-01' }), '2026-03');
  assert.equal(wonMonthOf({ confirmedAt: '2026-05-01T00:00:00Z', forecastMonth: '2026-01' }), '2026-05');
  assert.equal(wonMonthOf({ forecastMonth: '2026-01' }), '2026-01', 'ไม่มีข้อมูลอื่น = ใช้เดือน FC');
});
