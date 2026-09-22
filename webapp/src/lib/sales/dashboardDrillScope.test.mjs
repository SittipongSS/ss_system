/* ยามของ "ตัวเลขบนแท็บผลงานขาย ↔ รายการที่กดเข้าไปดู" (ตรวจ 2026-09-16)
   🐞 ตัวเลขทุกช่องบนแท็บเป็นยอด **ทั้งบริษัท** (dashboard route ไม่กรองขอบเขตโดยตั้งใจ) แต่ลิ้นชักยิง
      /api/sales-planning/deals ซึ่งกรองตามสิทธิ์ (ae = ของตัวเอง · senior_ae/ac = ทีม) ⇒ กดยอดบริษัทแล้ว
      รายการรวมไม่ถึง โดยไม่มีอะไรบอก
   ⭐ **มติผู้ใช้ 2026-09-16: คงขอบเขตเดิม ไม่ขยายสิทธิ์อ่านแถวดีล — แต่ลิ้นชักต้องเขียนบอกว่ารายการถูกกรอง**
      (ทางเลือกที่ถูกปฏิเสธ: ปลดขอบเขตให้ลิ้นชัก ⇒ AE อ่านแถวดีลของทุกทีมได้ครบทุกช่อง)
   🐞 งวด "ไตรมาส" ส่ง month = null ⇒ ลิ้นชักตกไปกิ่ง "ทั้งปี" ⇒ กด Q3 ได้รายการ 12 เดือน และหัวเขียนว่า "ทั้งปี" */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLES } from '@/lib/permissions';
import { salesPlanningViewScope } from '@/lib/salesPlanning';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const dealsRoute = read('src/app/api/sales-planning/deals/route.js');
const modal = read('src/components/salesPlanning/DealDrillDownModal.js');
const board = read('src/components/salesPlanning/dashboard/performance/MorningBoard.js');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('deals route: ขอบเขตรายแถวยังบังคับครบสองชั้น — ห้ามมีสวิตช์ปลดขอบเขตจาก query', () => {
  const src = codeOnly(dealsRoute);
  assert.match(src, /let q = applyDealScope\(q0, user\);/);
  // ด่านที่สอง (รายแถว) ยังครอบทุกแถว — แกนรับของ (2026-09-22) คัดงวดต่อจาก `scoped` ไม่ใช่แทนที่
  assert.match(src, /const scoped = \(data \|\| \[\]\)\.filter\(\(d\) => inSalesViewScope\(user, d\)\);/);
  assert.match(src, /const visible = axis === 'delivery' \? scoped\.filter\(\(d\) => dealInReportPeriod\(d, period, 'delivery'\)\) : scoped;/);
  // ⛔ กันการกลับไปทางที่ปฏิเสธไปแล้ว: พารามิเตอร์ใด ๆ ที่ทำให้ข้ามสองด่านนี้
  assert.doesNotMatch(src, /params\.get\('scope'\)/);
  assert.doesNotMatch(src, /overview \? q0/);
  assert.doesNotMatch(src, /overview \|\| inSalesViewScope/);
});

test('ทุก role ที่เห็นแท็บ แต่ขอบเขตแคบกว่าบริษัท ต้องได้ข้อความบอกในลิ้นชัก', () => {
  // ตรวจกับทะเบียน role จริง ไม่ใช่ชื่อที่แต่งเอง (ชื่อที่ไม่มีอยู่จริงทำให้ยามผ่านฟรี)
  const narrow = ROLES.filter((r) => ['team', 'own'].includes(salesPlanningViewScope(r)));
  assert.deepEqual(narrow.sort(), ['ac', 'ae', 'senior_ae'], 'สาม role นี้คือคนที่รายการจะไม่ตรงกับตัวเลข');
  assert.equal(salesPlanningViewScope('admin'), 'all');
  assert.equal(salesPlanningViewScope('viewer'), 'all');
  // ลิ้นชักตัดสินจากตัวกลางตัวเดียวกับ API ไม่ใช่เขียนรายชื่อ role ไว้เอง
  assert.match(modal, /import \{ salesPlanningViewScope \} from "@\/lib\/salesPlanning";/);
  assert.match(modal, /const viewScope = salesPlanningViewScope\(role\);/);
  assert.match(modal, /viewScope === 'team'/);
  assert.match(modal, /viewScope === 'own'/);
  assert.match(modal, /\{scopeNote && <p className="cell-sub">\{scopeNote\}<\/p>\}/);
  for (const text of ['รายการนี้แสดงเฉพาะดีลของทีมคุณ', 'รายการนี้แสดงเฉพาะดีลที่คุณเป็นเจ้าของ']) {
    assert.ok(modal.includes(text), text);
    assert.ok(modal.includes('ตัวเลขบนแผงเป็นยอดทั้งบริษัท'), 'ต้องบอกด้วยว่าตัวเลขข้างบนกว้างกว่า');
  }
  assert.doesNotMatch(modal, /\/api\/sales-planning\/deals\?scope=/, 'ลิ้นชักต้องไม่ขอสิทธิ์พิเศษ');
});

test('ลิ้นชักกรองงวดด้วยรายชื่อเดือนก่อนกิ่งปี และหัวใช้คำของงวดที่แถบส่งมา', () => {
  const matcher = modal.slice(modal.indexOf('const periodMatcher'), modal.indexOf('const PENDING_APPROVAL_METRIC'));
  assert.match(matcher, /Array\.isArray\(filter\.months\) && filter\.months\.length/);
  assert.ok(matcher.indexOf('filter.months') < matcher.indexOf('filter.year'), 'รายชื่อเดือนต้องมาก่อนกิ่งปี');
  assert.match(modal, /const periodLabel = filter\.periodText \|\| filter\.month/);
});

test('MorningBoard ส่งเดือนของงวด + คำของงวดให้ลิ้นชัก — ไตรมาสไม่กลายเป็นทั้งปี · รออนุมัติยังล็อกเดือนปัจจุบัน', () => {
  const src = codeOnly(board);
  assert.match(src, /const winMonths = \(matrix\.company\?\.months \|\| \[\]\)\.slice\(win\.startIdx, win\.endIdx \+ 1\);/);
  assert.match(src, /months = winMonths/);
  assert.match(src, /periodText: month === pendingMonth && months\?\.length === 1 \? month : periodLabel\(win\)/);
  assert.match(src, /"pendingApproval", \{ month: pendingMonth, months: \[pendingMonth\]/);
});
