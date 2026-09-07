// ── "โชว์ที่ให้กรอก" กับ "บล็อกการรับรอง" เป็นคนละคำถาม ────────────────────
//
// 🐞 **วันนี้ยุบเป็นสวิตช์ตัวเดียว** — `orderHasServiceRounds` คุมทั้งการโชว์แท็บ/ช่อง
//   และด่านเงิน ⇒ ใบบนเส้นบริการที่บรรทัดไม่มีรหัส FG (บรรทัด "พิมพ์เอง" ของใบเสนอราคา)
//   เปิดแท็บสัญญาไม่ได้และไม่มีช่องกรอกช่วงครอบ · วัดจริง 08/09/2026: เส้นบริการ 30 ใบ
//   เข้าเกณฑ์แคบแค่ 8 ⇒ 22 ใบตัน
//
// 🔴 และแก้ด้วยการ *ขยายเกณฑ์เดิม* ไม่ได้ — มันคือสวิตช์ของด่าน "ต้องมีช่วงครอบก่อน
//   บัญชีรับรองงวด" ⇒ ขยายเมื่อไร 22 ใบจริงบน production รับรองงวดไม่ได้ทันที
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderHasServiceRounds, orderOnServiceLine } from './serviceOrders.js';
import { installmentActionError } from './salesOrderPayments.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SERVICE_DEAL = { id: 'D1', line: 'SERVICE' };
const PRODUCT_DEAL = { id: 'D2', line: 'PRODUCT' };
const SERVICE_PROJECT = { id: 'P1', line: 'SERVICE' };

const order = (over = {}) => ({ id: 'SO1', dealId: 'D1', deal: SERVICE_DEAL, lines: [], ...over });
const pkgLine = { id: 'L1', fgCode: 'FG-AAAA-02-001-00001' };
const manualLine = { id: 'L2', fgCode: null };

/* ══ สองเกณฑ์ ต่างกันตรงไหน ═══════════════════════════════════════════ */

test('🔑 บรรทัด "พิมพ์เอง" (ไม่มีรหัส FG) — เส้นบริการใช่ แต่ไม่เข้าเกณฑ์แคบ', () => {
  const o = order({ lines: [manualLine] });
  assert.equal(orderOnServiceLine(o), true, 'ต้องได้แท็บสัญญาและช่องครอบคลุมบริการ');
  assert.equal(orderHasServiceRounds(o, o.lines), false, 'ด่านเงินยังไม่จับ — ตั้งใจ');
});

test('ใบที่มีบรรทัดหมวด 02-001 เข้าทั้งสองเกณฑ์', () => {
  const o = order({ lines: [manualLine, pkgLine] });
  assert.equal(orderOnServiceLine(o), true);
  assert.equal(orderHasServiceRounds(o, o.lines), true);
});

/* 🔴 ตัวกว้างต้องไม่ลากใบสายสินค้าเข้ามา — ไม่งั้นใบขายของทั่วไปได้แท็บสัญญาบริการ */
test('🔴 ใบสายสินค้าไม่เข้าเกณฑ์ไหนเลย แม้จะมีบรรทัดหมวด 02-001', () => {
  const o = order({ dealId: 'D2', deal: PRODUCT_DEAL, lines: [pkgLine] });
  assert.equal(orderOnServiceLine(o), false);
  assert.equal(orderHasServiceRounds(o, o.lines), false);
});

/* ⚠️ สายมีสามค่า — null (ยังไม่ระบุ) ต้องไม่ถูกอ่านว่าเป็นบริการ */
test('⚠️ ใบที่ยังไม่ระบุสาย ไม่เข้าเกณฑ์ (fail-closed)', () => {
  assert.equal(orderOnServiceLine(order({ deal: { id: 'D3', line: null } })), false);
  assert.equal(orderOnServiceLine({}), false);
});

/* ⭐ สายอ่าน "โครงการก่อน แล้วดีล" — ตัวกว้างต้องเคารพลำดับเดียวกัน */
test('โครงการทับสายของดีลได้ทั้งสองเกณฑ์', () => {
  const o = order({ dealId: 'D2', deal: PRODUCT_DEAL, projectId: 'P1', project: SERVICE_PROJECT });
  assert.equal(orderOnServiceLine(o), true);
});

/* ══ ด่านเงินต้องไม่ขยับ ══════════════════════════════════════════════ */

/* 🔴 หัวใจของใบนี้: เปิดจอกว้างขึ้นแล้ว **ห้าม** ทำให้ใครรับรองงวดไม่ได้ */
test('🔴 ใบที่เพิ่งได้ช่องกรอก ต้องยังรับรองงวดได้โดยไม่มีช่วงครอบ', () => {
  const o = order({ lines: [manualLine] });
  const row = { id: 'I1', seq: 1, status: 'reported', amount: 100, coversFrom: null, coversTo: null };
  const fn = { id: 'U1', role: 'finance', department: 'FN' };
  const gate = installmentActionError(row, 'confirm', fn, {
    rows: [row], orderTotal: 100,
    serviceRounds: orderHasServiceRounds(o, o.lines),
  });
  assert.equal(gate, null, 'ด่านเงินต้องเงียบ — ไม่งั้นคือหยุดรับเงินของใบจริง');
});

test('ใบที่เข้าเกณฑ์แคบ ยังถูกบล็อกเหมือนเดิมเมื่อไม่มีช่วงครอบ', () => {
  const o = order({ lines: [pkgLine] });
  const row = { id: 'I1', seq: 1, status: 'reported', amount: 100, coversFrom: null, coversTo: null };
  const fn = { id: 'U1', role: 'finance', department: 'FN' };
  const gate = installmentActionError(row, 'confirm', fn, {
    rows: [row], orderTotal: 100,
    serviceRounds: orderHasServiceRounds(o, o.lines),
  });
  assert.match(gate || '', /ช่วงครอบบริการ/);
});

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────── */

test('🔴 ด่านเงินต้องยังอ่านเกณฑ์แคบ — ห้ามเผลอสลับเป็นตัวกว้าง', () => {
  const panel = code('../../components/salesPlanning/SalesOrderPaymentPanel.js');
  assert.match(panel, /serviceRounds: hasServiceRounds/);
  assert.match(panel, /const hasServiceRounds = orderHasServiceRounds\(/);
  assert.match(panel, /const showCoverage = orderOnServiceLine\(order\);/);
  // คอลัมน์/ช่องกรอกใช้ตัวกว้าง
  assert.match(panel, /\{showCoverage \? <th>ครอบคลุมบริการ<\/th> : null\}/);
  // คำเตือน "รับรองแล้วแต่ไม่มีช่วงครอบ" ผูกกับด่านเงิน ไม่ใช่การโชว์
  assert.match(panel, /const coverageAlert = !hasServiceRounds/);
});

test('🔑 แท็บสัญญาเปิดกว้าง · แท็บงานบริการยังแคบ', () => {
  const page = code('../../app/sales-planning/sales-orders/[id]/page.js');
  assert.match(page, /onServiceLine \? \["contract"\] : \[\]/);
  assert.match(page, /hasServiceRounds \? \["service"\] : \[\]/,
    'ตารางกรอกรอบตีกลับบรรทัดนอกหมวด 02-001 ⇒ เปิดกว้างจะได้แท็บที่ไม่มีแถวให้กรอก');
});

/* 🐞 ตัวรับ ctx อ่าน `projectsById` ไม่ใช่ `project` ⇒ คีย์นั้นเป็นอาร์กิวเมนต์ตาย
   ที่อ่านแล้วเข้าใจผิดว่าทำงาน · ของจริงต้องแนบ `order.project` มาให้ */
test('🔴 ห้ามส่งคีย์ ctx ที่ตัวรับไม่เคยอ่าน และด่านเงินต้องเห็นโครงการ', () => {
  const route = code('../../app/api/sales-planning/sales-orders/[id]/installments/route.js');
  assert.doesNotMatch(route, /\{ project: order\.project \}/);
  assert.match(route, /from\('projects'\)\.select\('id, line'\)/,
    'ต้องแนบโครงการมาให้ ไม่งั้นด่านเงินอ่านสายจากดีลอย่างเดียว');
  assert.match(route, /serviceRounds: orderHasServiceRounds\(order, order\.lines\)/);

  const page = code('../../app/sales-planning/sales-orders/[id]/page.js');
  assert.doesNotMatch(page, /\{ project: order\?\.project \}/);
});
