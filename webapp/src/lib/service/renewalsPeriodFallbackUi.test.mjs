// ── ทะเบียนต่อสัญญา: วันหมดถอยไปที่ช่วงบริการของใบ ถึงจอจริง (PR-C · C-D13) ─────────
//
// ⭐ ตัวตัดสินอยู่ที่ `renewals.js` (เทสต์ใน `renewals.test.mjs`) — ไฟล์นี้ยามสองทางที่ของจะหายเงียบ:
//   1) route ไม่ดึง `servicePeriodTo`/`serviceTermsOpenedAt` ⇒ ตัวตัดสินได้ undefined ⇒ ทางถอยไม่เคยทำงาน
//      ทั้งที่เทสต์ของ lib เขียวหมด (บทเรียนเดียวกับ `serviceContractId` ที่เคยหายจน "ทะเบียนว่างถาวร")
//   2) จอไม่บอกว่าวันนั้นมาจากใบ ไม่ใช่จากสัญญา ⇒ ฝ่ายขายเข้าใจว่ามีสัญญาแล้ว
//      และกฎ "ตาเห็นบนแถว = ต้องค้นเจอ" ⇒ ข้อความใต้วันต้องอยู่ในช่องค้นหาด้วย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const ROUTE = stripComments(read('../../app/api/sales-planning/renewals/route.js'));
const PANEL = stripComments(read('../../components/salesPlanning/RenewalsPanel.js'));

test('route ดึงช่วงบริการ + ตราเปิดงานบริการของใบมาให้ตัวตัดสิน', () => {
  const at = ROUTE.indexOf("from('sales_orders')");
  assert.ok(at > 0, 'ต้องมีคำสั่งอ่านใบสั่งขาย');
  const select = ROUTE.slice(at).match(/\.select\('([^']+)'\)/)?.[1] || '';
  assert.match(select, /"serviceContractId"/, 'ทางไปหาสัญญายังต้องอยู่');
  assert.match(select, /"servicePeriodTo"/);
  assert.match(select, /"serviceTermsOpenedAt"/);
  // กฎ 18: ใบสั่งขายอ่านด้วยคอลัมน์ที่ระบุชื่อ กรองสถานะใน JS — ไม่กลายเป็นผู้ต้องสงสัยของยามเงิน
  assert.doesNotMatch(select, /^\s*\*|totalAmount|actualAmount/);
});

test('route เลือกรอบนำของแถวด้วยตัวช่วยตัวเดียวกันทั้ง GET และ POST', () => {
  assert.match(ROUTE, /renewalLeadTerm/);
  assert.doesNotMatch(ROUTE, /row\.terms\.find\(/, 'ห้ามหา "รอบที่หมดเร็วที่สุด" เองในไฟล์นี้อีก');
});

test('จอบอกใต้วันว่าวันหมดมาจากช่วงบริการของใบ และค้นเจอด้วยข้อความเดียวกัน', () => {
  assert.match(PANEL, /ORDER_PERIOD_END_NOTE/);
  assert.match(PANEL, /from "@\/lib\/service\/renewals"/);
  const due = PANEL.slice(PANEL.indexOf('function dueCell'), PANEL.indexOf('export default function'));
  assert.match(due, /row\.endSource === "order_period"/, 'ข้อความใต้วันขึ้นเฉพาะแถวที่ถอยมาใช้ช่วงของใบ');
  assert.match(due, /ORDER_PERIOD_END_NOTE/);
  const hay = PANEL.slice(PANEL.indexOf('const filtered'), PANEL.indexOf('usePagination('));
  assert.match(hay, /ORDER_PERIOD_END_NOTE/, 'ตาเห็นบนแถว = ต้องค้นเจอ');
  assert.match(hay, /endSource === "order_period"/);
  /* mig 0400 (ตรวจทาน lib-03): ใบแยกรายรายการ — วันมาจากช่วงของรายการ ⇒ คำใต้วันของตัวเอง ("…ของรายการ") และค้นเจอด้วยคำเดียวกัน */
  assert.match(due, /row\.endSource === "line_period" && <span className="cell-sub">\{LINE_PERIOD_END_NOTE\}<\/span>/);
  assert.match(hay, /row\.endSource === "line_period" \? LINE_PERIOD_END_NOTE : null/);
  assert.match(PANEL, /import \{ LINE_PERIOD_END_NOTE, ORDER_PERIOD_END_NOTE \} from "@\/lib\/service\/renewals";/);
});

/* review 29/09: ช่องว่างของทะเบียนเคยพูดว่าขึ้นเฉพาะจากสัญญา — ทางถอยไปช่วงบริการของใบก็เอาไซต์ขึ้นทะเบียนได้ ⇒ ต้องพูดด้วย */
test('🔴 ช่องว่างบอกทั้งสองแหล่งของวันหมด (สัญญา · ช่วงบริการของใบที่ยังไม่ผูกสัญญา)', () => {
  const empty = PANEL.slice(PANEL.indexOf('<TableEmpty'), PANEL.indexOf('/>', PANEL.indexOf('<TableEmpty')));
  assert.match(empty, /description="[^"]*สัญญาที่ครอบงานบริการ[^"]*"/);
  assert.match(empty, /description="[^"]*ช่วงบริการของใบ[^"]*ยังไม่ผูกสัญญา[^"]*"/);
});
