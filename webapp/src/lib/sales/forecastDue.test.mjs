// ── "ดีลใบไหนต้องเลื่อนเดือน FC" ──────────────────────────────────────────
//
// กติกา (มติผู้ใช้ 2026-08-05): ระบบไม่ทบยอดข้ามเดือน — SA/AE ต้องเลื่อนเดือน FC
// ให้ตรงความจริงเอง แต่เดิม **ไม่มีอะไรบอกว่าใบไหนต้องเลื่อน**
// ตรวจ prod 2026-08-05: ดีลที่ยังเปิด 144 ใบ ค้างเดือน FC ที่ผ่านไปแล้ว 71 ใบ (~6 ล้าน)
//
// เกณฑ์ต้องมาจากที่เดียว เพราะมีสามที่ใช้: ป้ายในแถว · ตัวกรอง · แถบนับถอยหลัง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FORECAST_REVIEW_DAYS, daysLeftInMonth, forecastDueState,
  forecastReviewWindow, isForecastOverdue, monthsBetween,
} from './forecastDue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const NOW = '2026-08';
const open = (over = {}) => ({ stage: 'quotation', forecastMonth: '2026-08', ...over });

test('monthsBetween ข้ามปีได้', () => {
  assert.equal(monthsBetween('2026-07', '2026-08'), 1);
  assert.equal(monthsBetween('2025-09', '2026-08'), 11);
  assert.equal(monthsBetween('2026-08', '2026-08'), 0);
  assert.equal(monthsBetween('2026-09', '2026-08'), -1, 'FC เดือนหน้า = ยังไม่ถึง');
  assert.equal(monthsBetween(null, '2026-08'), null);
});

test('เลยกำหนด = เดือน FC ผ่านไปแล้ว และดีลยังเปิดอยู่', () => {
  assert.equal(forecastDueState(open({ forecastMonth: '2026-07' }), NOW).overdue, true);
  assert.equal(forecastDueState(open({ forecastMonth: '2026-07' }), NOW).monthsLate, 1);
  assert.equal(forecastDueState(open({ forecastMonth: '2025-09' }), NOW).monthsLate, 11);
  assert.equal(forecastDueState(open(), NOW).overdue, false, 'เดือนนี้ = ยังไม่เลย');
  assert.equal(forecastDueState(open({ forecastMonth: '2026-12' }), NOW).overdue, false);
});

/* ⭐ ดีลที่ปิดแล้วต้องไม่ขึ้นว่าเลยกำหนด — มันจบไปแล้ว ไม่มีอะไรให้เลื่อน
   ถ้าไม่กันตรงนี้ ดีล Won/Lost เก่า ๆ จะท่วมตัวกรองจนของจริงหาไม่เจอ */
test('ดีลที่ปิดแล้ว (Won/Lost/in_project) ไม่นับว่าเลยกำหนด', () => {
  for (const stage of ['won', 'in_project', 'lost']) {
    assert.equal(forecastDueState({ stage, forecastMonth: '2025-01' }, NOW).overdue, false, stage);
  }
});

test('ยังไม่ระบุเดือน = คนละอาการกับเลยกำหนด (แยกป้าย/แยกตัวกรอง)', () => {
  const s = forecastDueState(open({ forecastMonth: null }), NOW);
  assert.equal(s.missing, true);
  assert.equal(s.overdue, false, 'ไม่มีเดือนก็ไม่รู้ว่าเลยหรือยัง — ห้ามเดา');
});

test('ไม่รู้วันนี้ (ยังไม่ทันอ่านนาฬิกาใน effect) ต้องไม่ฟ้องผิด', () => {
  assert.equal(isForecastOverdue(open({ forecastMonth: '2020-01' }), null), false);
});

test('นับวันที่เหลือของเดือน — รวมเดือนที่มี 28/30/31 วัน', () => {
  assert.equal(daysLeftInMonth('2026-08-31'), 0);
  assert.equal(daysLeftInMonth('2026-08-25'), 6);
  assert.equal(daysLeftInMonth('2026-02-28'), 0, 'ก.พ. ปีปกติ');
  assert.equal(daysLeftInMonth('2024-02-28'), 1, 'ปีอธิกสุรทิน');
  assert.equal(daysLeftInMonth('2026-04-30'), 0, 'เดือน 30 วัน');
  assert.equal(daysLeftInMonth(''), null);
});

test('หน้าต่างทบทวน FC = 7 วันสุดท้ายของเดือน', () => {
  assert.equal(FORECAST_REVIEW_DAYS, 7);
  assert.equal(forecastReviewWindow('2026-08-25').active, true, 'เหลือ 6 วัน');
  assert.equal(forecastReviewWindow('2026-08-24').active, true, 'เหลือ 7 วัน');
  assert.equal(forecastReviewWindow('2026-08-23').active, false, 'เหลือ 8 วัน — ยังไม่เตือน');
  assert.equal(forecastReviewWindow('2026-08-31').daysLeft, 0, 'วันสุดท้ายยังเตือน');
  assert.equal(forecastReviewWindow(null).active, false);
});

// ── ฝั่งหน้าจอต้องใช้เกณฑ์ตัวเดียวกันทั้งสามที่ ────────────────────────────
const page = () => readFileSync(join(ROOT, 'src/app/sales-planning/deals/page.js'), 'utf8');
const cell = () => readFileSync(join(ROOT, 'src/components/salesPlanning/ForecastMonthCell.js'), 'utf8');

test('ป้ายในแถว · ตัวกรอง · แถบเตือน อ่านจาก forecastDueState ตัวเดียวกัน', () => {
  assert.match(cell(), /forecastDueState\(deal, currentMonth\)/, 'ป้ายในแถว');
  const src = page();
  assert.match(src, /forecastDueState\(deal, currentMonth\)/, 'ตัวกรอง + ตัวนับ');
  assert.match(src, /forecastReviewWindow\(today\)/, 'แถบนับถอยหลัง');
});

/* ⚠️ เดือน FC เป็นค่าที่ **server อนุมานจากวันที่คาดปิด** และไม่รับจาก client
   (มติ 2026-07-16) — ช่องแก้ในแถวจึงต้องส่ง expectedCloseDate เท่านั้น */
test('แก้ในแถวส่ง expectedCloseDate ไม่ใช่ forecastMonth', () => {
  const src = cell();
  assert.match(src, /JSON\.stringify\(\{ expectedCloseDate: value \|\| null \}\)/);
  assert.doesNotMatch(src, /forecastMonth:/, 'ห้ามส่ง forecastMonth — server ไม่รับอยู่แล้ว');
  // ใช้ตัวเลือกวันเดียวกับฟอร์มแก้ดีล ไม่ประดิษฐ์ตัวเลือกเดือนใหม่
  assert.match(src, /import DateInput from "@\/components\/ui\/DateInput"/);
  const form = readFileSync(join(ROOT, 'src/components/salesPlanning/DealFormFields.js'), 'utf8');
  assert.match(form, /<DateInput value=\{form\.expectedCloseDate/, 'ฟอร์มก็ใช้ตัวเดียวกัน');
});

/* บันทึกหนึ่งครั้ง = ประวัติ FC หนึ่งแถว (sales_deal_forecasts) ที่ใช้วัดความแม่นยำ
   auto-save ในตารางจะทำให้ประวัติเต็มไปด้วยค่าที่คนแค่กดผ่าน */
test('ต้องมีปุ่มบันทึก ไม่ auto-save', () => {
  const src = cell();
  assert.match(src, /onClick=\{save\}/, 'มีปุ่มบันทึกของตัวเอง');
  assert.doesNotMatch(src, /onChange=\{\(v\) => \{[\s\S]*save\(\)/, 'ห้ามเซฟทันทีที่เลือกวัน');
  const route = readFileSync(join(ROOT, 'src/app/api/sales-planning/deals/[id]/route.js'), 'utf8');
  assert.match(route, /sales_deal_forecasts/, 'ยืนยันว่าการเซฟเขียนประวัติจริง');
});

/* ── ป้ายในคอลัมน์ต้องกว้างเท่ากันทั้งคอลัมน์ ──────────────────────────────
   มติผู้ใช้ 2026-08-05 (ขอทั้งคิวลีดและไปป์ไลน์ดีล) — ป้ายที่กว้างตามความยาว
   ข้อความทำให้กวาดตาลงคอลัมน์ไม่ได้
   ⚠️ ความกว้างต้องมาจากฝั่ง**ผู้เรียก** ไม่ใช่ฝังใน helper: ป้ายชุดเดียวกันนี้ถูกใช้
   บนการ์ด/หน้ารายละเอียดด้วย ซึ่งควรพอดีข้อความ ไม่ใช่ยืดเต็มคอลัมน์ */
test('ป้ายในตารางกว้างเท่ากันทั้งคอลัมน์ — ทุกตารางสายงานขาย', () => {
  /* ⚠️ อยู่ใน globals ไม่ใช่ *.module.css — 5 ตารางใช้ร่วมกัน และ audit:ui ห้ามยืม
     module.css ข้ามโฟลเดอร์ (ของใช้ร่วม → globals.css หรือ components/ui/) */
  const globals = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
  assert.match(globals, /\.ui-badge-cell\s*\{[^}]*min-width:\s*var\(--cell-badge-w/);
  const WIDTHS = ['stage', 'fc', 'deal-type', 'doc', 'lead', 'channel'];
  for (const cls of WIDTHS) {
    assert.match(globals, new RegExp(`\\.ui-badge-w-${cls}\\s*\\{[^}]*--cell-badge-w`), `ต้องกำหนดความกว้างของ ${cls}`);
  }

  /* ทุกตารางต้องดึงความกว้างจากชุดกลางชุดเดียวกัน — ปล่อยให้แต่ละหน้าประกาศเอง
     เมื่อไร กฎเดียวกันจะถูกก๊อปหลายชุดแล้วเพี้ยนหากัน */
  const TABLES = [
    'src/app/sales-planning/deals/page.js',
    'src/app/sales-planning/leads/page.js',
    'src/app/sales-planning/quotations/page.js',
    'src/app/sales-planning/sales-orders/page.js',
    'src/app/sa/projects/page.js',
  ];
  for (const rel of TABLES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(src, /ui-badge-cell/, `${rel} ต้องใส่คลาสความกว้างให้ป้ายในตาราง`);
    assert.match(src, /ui-badge-w-/, `${rel} ต้องระบุความกว้างของคอลัมน์ด้วย`);
  }
});

test('helper ป้ายรับ className ได้ แต่ไม่ฝังความกว้างไว้เอง', () => {
  const ui = readFileSync(join(ROOT, 'src/components/salesPlanning/ui.js'), 'utf8');
  for (const fn of ['stageBadge', 'forecastBadge', 'dealTypeBadge']) {
    assert.match(ui, new RegExp(`export function ${fn}\\([^)]*className = ""`), `${fn} ต้องรับ className`);
  }
  assert.doesNotMatch(ui, /min-width/, 'ห้ามฝังความกว้างใน helper — การ์ด/หน้ารายละเอียดใช้ตัวเดียวกัน');
});
