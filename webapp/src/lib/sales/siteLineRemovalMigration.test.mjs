// ── ยามของ mig 0366 "ถอดจุดติดตั้งออกจากใบย้อนหลัง" ───────────────────────────
//
// 🔴 ฟังก์ชันนี้ **ลบแถวและเขียนเงินพร้อมกัน** — ด่านที่หายไปหนึ่งชั้นแปลว่ายอดหัวใบไม่ตรง
//    บรรทัด หรือรอบขายของโซนถูก CASCADE ทิ้งเงียบ ๆ พร้อมประวัติการบริการทั้งเส้น
//
// 🔑 มติที่ตรึงไว้ที่นี่ (ข้อ 23 ส่วน ข2):
//    · ถอดได้เฉพาะจุดที่ TS แจ้งและฝ่ายขายยังไม่ตัดสิน · ห้ามถอดบรรทัดสุดท้าย
//    · ห้ามถอดบรรทัดที่ผูกโซนแล้ว · ห้ามถอดเมื่อใบมีส่วนลดหัวใบ
//    · งวดที่คีย์ไว้ต้องไม่เกินยอดใหม่ · ใบที่เหลือยอด 0 ต้องยกเว้นด่านเงินไว้ก่อน
//    · ลบบรรทัด + เขียนเงิน อยู่ในฟังก์ชันเดียว (= ทรานแซกชันเดียว)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { REMOVE_REASON_MAX, REMOVE_REASON_MIN } from './siteLineRemoval.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE = '0366_sales_order_line_remove.sql';
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const squeeze = (sql) => stripComments(sql).replace(/\s+/g, ' ').trim();

const RAW = read(FILE);
const SQL = stripComments(RAW);
const FN = squeeze(SQL.slice(
  SQL.indexOf('CREATE OR REPLACE FUNCTION public.remove_historical_sales_order_line'),
  SQL.indexOf('\n$$;'),
));

test('0366: หัวไฟล์บอกลำดับรัน · วิธีลองแบบ ROLLBACK · คำสั่งตรวจหลังรัน', () => {
  const header = RAW.slice(0, RAW.indexOf('\nBEGIN;'));
  assert.match(header, /รันก่อน merge โค้ด JS/);
  assert.match(header, /ลองก่อนรันจริง/);
  assert.match(header, /--\s+ROLLBACK;/);
  assert.match(header, /ตรวจหลังรัน/);
  assert.match(header, /has_function_privilege/);
});

test('0366: รันซ้ำได้ · ทรานแซกชันเดียว · ไม่ backfill · REVOKE ครบ', () => {
  assert.match(SQL, /^\s*BEGIN;/m);
  assert.match(SQL, /^COMMIT;/m);
  assert.doesNotMatch(SQL, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE');
  // ไฟล์นี้ไม่มี DDL ของตาราง และไม่แก้ข้อมูลนอก body ของฟังก์ชัน
  const outside = SQL.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.doesNotMatch(outside, /\b(ALTER TABLE|INSERT INTO|UPDATE|DELETE FROM) public\./);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.remove_historical_sales_order_line\(text, text, text, text, text\)\s*FROM PUBLIC, anon, authenticated;/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.remove_historical_sales_order_line\(text, text, text, text, text\)\s*TO service_role;/);
  assert.match(FN, /SECURITY DEFINER/);
});

test('0366: ล็อกหัวใบก่อน แล้วค่อยอ่านบรรทัด — สองคนถอดคนละบรรทัดพร้อมกันต้องไม่ทับยอดกัน', () => {
  const lockOrder = FN.indexOf('FROM public.sales_orders WHERE id = p_order_id FOR UPDATE');
  const lockLine = FN.indexOf('FROM public.sales_order_lines WHERE id = p_line_id');
  assert.ok(lockOrder > 0 && lockLine > lockOrder, 'ต้องล็อกหัวใบก่อนบรรทัด');
  assert.match(FN, /WHERE id = p_line_id AND "salesOrderId" = p_order_id FOR UPDATE/);
});

test('0366: ด่านครบแปดชั้น และมาก่อน DELETE เสมอ', () => {
  const del = FN.indexOf('DELETE FROM public.sales_order_lines WHERE id = p_line_id');
  assert.ok(del > 0, 'ต้องมี DELETE');
  const gates = [
    "v_order.origin <> 'historical'",                       // ใบย้อนหลังเท่านั้น
    "v_order.status <> 'approved'",                         // ใบที่ยกเลิกแล้วถอดไม่ได้
    'v_order."discountAmount", 0) > 0',                     // ส่วนลดหัวใบ = ไม่เดา
    'v_line."siteNotFoundAt" IS NULL',                      // ต้องมีธงของ TS ก่อน
    'v_line."siteClosedAt" IS NOT NULL',                    // ตัดสินไปแล้วถอดไม่ได้
    'FROM public.service_zone_terms t WHERE t."salesOrderLineId" = p_line_id',
    'v_left <= 1',                                          // ห้ามถอดบรรทัดสุดท้าย
    'v_paid > v_total + 0.01',                              // งวดห้ามเกินยอดใหม่
  ];
  for (const g of gates) {
    const at = FN.indexOf(g);
    assert.ok(at > 0, `ขาดด่าน ${g}`);
    assert.ok(at < del, `ด่าน ${g} ต้องอยู่ก่อน DELETE`);
  }
  for (const code of [
    'historical_so_line_remove_pipeline', 'historical_so_line_remove_status',
    'historical_so_line_remove_has_discount', 'historical_so_line_remove_not_flagged',
    'historical_so_line_remove_decided', 'historical_so_line_remove_allocated',
    'historical_so_line_remove_last_line', 'historical_so_line_remove_installments_over',
    'historical_so_line_remove_zero_needs_exemption', 'historical_so_line_remove_reason_invalid',
  ]) {
    assert.ok(FN.includes(`RAISE EXCEPTION '${code}'`), `ขาดรหัส error ${code}`);
  }
});

test('0366: ลบบรรทัดแล้วเขียนเงินในฟังก์ชันเดียว — ยอดรวมคิดจาก subtotal + vat ไม่ใช่ลบออกจาก total', () => {
  const del = FN.indexOf('DELETE FROM public.sales_order_lines');
  const upd = FN.indexOf('UPDATE public.sales_orders SET');
  assert.ok(del > 0 && upd > del, 'DELETE ต้องมาก่อน UPDATE ในฟังก์ชันเดียวกัน');
  // 🪤 ห้ามคิดยอดรวมด้วยการลบยอดบรรทัดออกจาก totalAmount — เศษปัด VAT จะสะสมจนใบเสีย invariant ของ 0360
  assert.ok(!FN.includes('v_order."totalAmount" - '), 'ห้ามลบยอดบรรทัดออกจาก totalAmount ตรง ๆ');
  assert.match(FN, /v_total := round\(v_subtotal, 2\) \+ v_vat;/);
  assert.match(FN, /"actualAmount" = GREATEST\(0, v_total - v_vat\)/);
  // VAT คิดจากสัดส่วนเดิม เพราะไม่มีคอลัมน์ vatRate ให้อ่าน
  assert.match(FN, /v_vat := round\(v_subtotal \* COALESCE\(v_order\."vatAmount", 0\) \/ v_order\.subtotal, 2\);/);
  assert.match(FN, /ELSE v_vat := 0;/);
});

test('0366: ไม่แตะงวดชำระ — ตรวจอย่างเดียว', () => {
  assert.ok(!/(UPDATE|DELETE FROM|INSERT INTO)\s+public\.sales_order_installments/.test(FN),
    '🔴 ยอดงวดที่คีย์ไว้ต้องเท่าเดิมทุกบาท (มติข้อ 23.1 ยังใช้อยู่)');
  assert.match(FN, /SELECT COALESCE\(sum\(amount\), 0\) INTO v_paid FROM public\.sales_order_installments/);
});

test('0366: ความยาวเหตุผลตรงกับฝั่ง JS และเท่าเหตุผลยกเว้นด่านเงินของ 0360', () => {
  assert.ok(FN.includes(`length(v_reason) NOT BETWEEN ${REMOVE_REASON_MIN} AND ${REMOVE_REASON_MAX}`));
  const s0360 = read(readdirSync(MIGRATIONS).find((n) => n.startsWith('0360_')));
  assert.ok(s0360.includes(`BETWEEN ${REMOVE_REASON_MIN} AND ${REMOVE_REASON_MAX}`),
    'เหตุผลสองที่ต้องยาวเท่ากัน — คนละเกณฑ์ = ผู้ใช้เดาไม่ถูกว่าต้องพิมพ์เท่าไร');
});
