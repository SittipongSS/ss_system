// ยอด SO "รออนุมัติ" บนหน้าโครงการ (มติผู้ใช้ 2026-09-11 · mig 0353)
// ล็อกสามเรื่อง: (1) ตัวเลขรออนุมัติเป็นกองแยก ไม่ไหลเข้า Actual (2) แถวดีลอ่าน Actual
// ตัวเดียวกับ KPI ไม่ใช่ wonValue ดิบ (3) แถว SO แยกสามทางด้วยตัวกลาง
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasPendingApproval,
  projectDealValue,
  projectSalesOrderAmount,
  sumProjectRollups,
} from './projectPendingApproval.js';
import { rollupDeals } from '../sales/projectRollup.js';
import { SALES_ORDER_STATUS_LABELS } from '../sales/salesOrderWorkflow.js';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const ALL_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'revised', 'approval_revoked', 'cancelled'];

// รูปจริงบน prod 2026-09-11: ดีล Won ที่ SO ยังรออนุมัติ — trigger เขียน wonValue 0 + สองคีย์ใหม่
const pendingWon = (over = {}) => ({
  stage: 'won', dealType: 'NPD', projectValue: 108000, wonValue: 0,
  metadata: { actualSource: 'sale_order', soPendingAmount: 108000, soPendingCount: 1 },
  ...over,
});

test('hasPendingApproval: ยอด > 0 หรือมีใบ (ใบยอด 0 บาทก็นับว่ามี)', () => {
  assert.equal(hasPendingApproval({ pendingApproval: 5, pendingApprovalCount: 1 }), true);
  assert.equal(hasPendingApproval({ pendingApproval: 0, pendingApprovalCount: 1 }), true);
  assert.equal(hasPendingApproval({ pendingApproval: 0, pendingApprovalCount: 0 }), false);
  // payload รุ่นก่อน / ไม่มีคีย์ = ไม่มี
  assert.equal(hasPendingApproval({}), false);
  assert.equal(hasPendingApproval(null), false);
  assert.equal(hasPendingApproval(undefined), false);
});

test('sumProjectRollups: รออนุมัติเป็นกองที่สาม ไม่ปนกับ actual', () => {
  const projects = [
    { dealsRollup: rollupDeals([pendingWon(), { stage: 'qualified', dealType: 'RE-ORDER', projectValue: 20000, metadata: {} }]) },
    { dealsRollup: rollupDeals([{ stage: 'won', dealType: 'SCENT', projectValue: 50000, wonValue: 50000, metadata: { actualSource: 'sale_order', soPendingAmount: 7000, soPendingCount: 2 } }]) },
  ];
  const t = sumProjectRollups(projects);
  assert.equal(t.actual, 50000, 'Actual = ใบอนุมัติล้วน');
  assert.equal(t.pendingApproval, 108000 + 7000);
  assert.equal(t.pendingApprovalCount, 1 + 2);
  assert.equal(t.fcTotal, 108000 + 20000 + 50000);
  assert.equal(t.fcRemaining, 20000, 'ดีล Won ที่รออนุมัติไม่กลับเข้า FC คงเหลือ');
  assert.equal(t.deals, 3);
});

test('sumProjectRollups: โครงการที่ไม่มี rollup / payload รุ่นก่อน = ศูนย์ ไม่พัง', () => {
  const t = sumProjectRollups([
    {},
    { dealsRollup: null },
    { dealsRollup: { fcTotal: 10, actual: 4, fcRemaining: 6, dealCount: 2 } }, // ไม่มีสองคีย์ใหม่
  ]);
  assert.deepEqual(t, { fcTotal: 10, actual: 4, pendingApproval: 0, pendingApprovalCount: 0, fcRemaining: 6, deals: 2 });
  assert.deepEqual(sumProjectRollups(), sumProjectRollups([]));
  assert.equal(sumProjectRollups(null).actual, 0);
});

test('แถวดีล Won ที่ SO รออนุมัติ: Actual 0 + รออนุมัติแยก (เดิมขึ้น ฿0.00 "ปิดจริง" เฉย ๆ)', () => {
  const v = projectDealValue(pendingWon());
  assert.equal(v.closed, true);
  assert.equal(v.value, 0);
  assert.equal(v.pendingApproval, 108000);
  assert.equal(v.pendingApprovalCount, 1);
});

test('แถวดีล Won มีทั้งใบอนุมัติแล้วและใบรออนุมัติ — โชว์ทั้งสองกอง ไม่เลือกอย่างใดอย่างหนึ่ง', () => {
  const v = projectDealValue(pendingWon({ wonValue: 200000, metadata: { actualSource: 'sale_order', soPendingAmount: 100000, soPendingCount: 1 } }));
  assert.equal(v.value, 200000);
  assert.equal(v.pendingApproval, 100000);
});

test('แถวดีล Won อ่าน Actual ตัวเดียวกับ KPI (wonAmt) — ไม่ใช่ wonValue ดิบ', () => {
  // ไม่มี actualSource = cache ที่ DB ไม่ได้รับรอง ⇒ 0 เหมือน rollup (เดิมแถวโชว์ 77 แต่ KPI โชว์ 0)
  const raw = { stage: 'won', projectValue: 100, wonValue: 77, metadata: {} };
  assert.equal(projectDealValue(raw).value, 0);
  assert.equal(projectDealValue(raw).value, rollupDeals([raw]).actual);
  // ดีลย้ายระบบ (legacy) ยังนับ
  assert.equal(projectDealValue({ ...raw, metadata: { actualSource: 'legacy' } }).value, 77);
  // stage เก่าก่อน mig 0082 ยังเป็น Won
  const old = projectDealValue(pendingWon({ stage: 'in_project' }));
  assert.equal(old.closed, true);
  assert.equal(old.pendingApproval, 108000);
});

test('แถวดีลเปิด/แพ้: FC ตามเดิม · ไม่มียอดรออนุมัติ (FC อยู่ใน FC คงเหลือแล้ว)', () => {
  const open = projectDealValue({ stage: 'quotation', projectValue: 20000, metadata: { soPendingAmount: 999, soPendingCount: 1 } });
  assert.deepEqual(open, { closed: false, value: 20000, pendingApproval: 0, pendingApprovalCount: 0 });
  const lost = projectDealValue({ stage: 'lost', projectValue: 5000, metadata: {} });
  assert.equal(lost.closed, false);
  assert.equal(lost.value, 5000);
  assert.equal(projectDealValue({ stage: 'qualified', projectValue: null }).value, 0);
});

test('แถว SO: สามทาง — อนุมัติ = Actual · รออนุมัติ = ยอดใบ · ที่เหลือไม่นับ', () => {
  for (const status of ALL_STATUSES) {
    const cell = projectSalesOrderAmount({ status, actualAmount: 1000, totalAmount: 1070 });
    const expected = status === 'approved' ? 'actual' : status === 'pending_approval' ? 'pending_approval' : 'excluded';
    assert.equal(cell.kind, expected, status);
    // ยอดก่อน VAT (actualAmount) เสมอ ไม่ใช่ totalAmount · ใบที่ไม่นับได้ 0
    assert.equal(cell.amount, expected === 'excluded' ? 0 : 1000, status);
    assert.equal(cell.documentAmount, 1000, status);
    // ป้ายจากทะเบียนกลาง — ครบทุกสถานะ รวม revised/approval_revoked ที่แผนที่เก่าไม่มี
    assert.equal(cell.statusLabel, SALES_ORDER_STATUS_LABELS[status], status);
  }
});

test('แถว SO: ค่าขอบ — ยอดติดลบ/ว่าง = 0 · สถานะแปลก = ข้อความดิบ ไม่ใช่ว่าง', () => {
  assert.equal(projectSalesOrderAmount({ status: 'pending_approval', actualAmount: -5 }).amount, 0);
  assert.equal(projectSalesOrderAmount({ status: 'approved', actualAmount: null }).amount, 0);
  const odd = projectSalesOrderAmount({ status: 'weird', actualAmount: 10 });
  assert.equal(odd.kind, 'excluded');
  assert.equal(odd.statusLabel, 'weird');
  assert.equal(projectSalesOrderAmount(null).kind, 'excluded');
  assert.equal(projectSalesOrderAmount(null).statusLabel, '');
});

/* ── ด่านซอร์ส: สองจอต้องเดินผ่านตัวกลาง ─────────────────────────────── */
const HUB = 'src/components/pm/ProjectDealsHub.js';
const LIST = 'src/app/sa/projects/page.js';

test('ProjectDealsHub: แถวดีลไม่อ่าน wonValue ดิบ · SO ไม่มีแผนที่สถานะของตัวเอง', () => {
  const src = read(HUB);
  assert.doesNotMatch(src, /deal\.wonValue\s*\?\?/, 'แถวดีลต้องอ่านผ่าน projectDealValue (wonAmt)');
  assert.match(src, /projectDealValue\(deal\)/);
  assert.match(src, /projectSalesOrderAmount\(order\)/);
  assert.doesNotMatch(src, /order\.status === "approved" \? order\.actualAmount/, 'ยอดแถว SO ต้องแยกสามทางผ่านตัวกลาง');
  assert.doesNotMatch(src, /draft: "ร่าง"/, 'ป้ายสถานะ SO มาจาก SALES_ORDER_STATUS_LABELS');
  assert.match(src, /<PendingApprovalAmount\b/);
  assert.match(src, /hint=\{hasPendingApproval\(r\)/, 'KPI Actual มีบรรทัดรองรออนุมัติ');
});

test('/sa/projects: KPI + แถวใช้ชิ้นกลาง · ไม่เพิ่มคอลัมน์ · Actual ไม่บวกยอดรออนุมัติ', () => {
  const src = read(LIST);
  assert.match(src, /sumProjectRollups\(filtered\)/);
  assert.equal((src.match(/<PendingApprovalAmount\b/g) || []).length, 2, 'KPI Actual 1 + เซลล์ Actual ต่อแถว 1');
  assert.equal((src.match(/colSpan=\{8\}/g) || []).length, 2, 'บรรทัดรอง ไม่ใช่คอลัมน์ใหม่');
  for (const rel of [LIST, HUB]) {
    assert.doesNotMatch(read(rel), /actual\s*\+[^;\n]*pendingApproval|pendingApproval[^;\n]*\+\s*[\w.]*actual/i,
      `${rel} บวกยอดรออนุมัติเข้า Actual (มติ 2026-09-11 ห้ามเด็ดขาด)`);
  }
});

test('/sa/projects: บรรทัดรออนุมัติใน note ของการ์ด Actual รับขนาดจาก note (ไม่ใหญ่กว่าป้ายการ์ด)', () => {
  // ตัวกลางตั้ง fs-5 ไว้สำหรับบรรทัดรองในตาราง · note ของการ์ดเป็น fs-1 — ทรงเดียวกับการ์ดบนแดชบอร์ดส่วนตัว
  const css = read('src/app/sa/projects/page.module.css');
  const rule = css.match(/\.metricPending:global\(\.so-pending-approval\)\s*\{([^}]*)\}/);
  assert.ok(rule, 'ต้องต่อ :global(.so-pending-approval) ให้ specificity ชนะกฎตัวกลาง');
  assert.match(rule[1], /font-size:\s*inherit/);
  assert.match(read(LIST), /className=\{styles\.metricPending\}/);
});
