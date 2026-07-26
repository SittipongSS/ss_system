import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../../../supabase/migrations/0168_unwon_deal_when_accepted_quotation_deleted.sql");
const unacceptSql = read("../../../supabase/migrations/0138_quotation_unaccept.sql");
const route = read("../../app/api/sales-planning/quotations/[id]/route.js");
const forceDelete = read("../forceDelete.js");

// บั๊กจริง 2026-07-26: ลบใบเสนอราคาที่ Won ถาวร → ดีลค้าง stage='won' ชี้ไปใบที่ไม่มี
// อยู่แล้ว → ออกใบใหม่ไม่ได้ (ดีล Won ถูกตัดจากตัวเลือก) และกด "ย้อนการรับ" ไม่ได้
// เพราะปุ่มอยู่บนหน้าใบที่ถูกลบ = ทางตัน
test("ลบใบที่ accepted แล้วต้องถอยดีลออกจาก Won ในทรานแซกชันเดียวกับการลบ", () => {
  assert.match(sql, /CREATE FUNCTION public\.force_delete_quotation/);
  assert.match(sql, /v_quote\.status = 'accepted'[\s\S]*revert_deal_out_of_won/);
  assert.match(sql, /'dealReverted', v_deal IS NOT NULL/);
});

test("ฟังก์ชันถอย Won ทำงานครบชุดเดียวกับ unaccept_quotation_atomic (0138)", () => {
  const revert = sql.slice(sql.indexOf("revert_deal_out_of_won"), sql.indexOf("DROP FUNCTION"));
  // สถานะปลายทางจากประวัติ + probability ตามขั้น
  assert.match(revert, /sales_deal_stage_history[\s\S]*"toStage" = 'won'/);
  assert.match(revert, /WHEN 'quotation' THEN 55/);
  assert.match(revert, /"confirmedAt" = NULL/);
  // ล้าง metadata การ Won ครบทุกคีย์ที่ 0138 ล้าง
  for (const key of [
    "acceptedQuotationId", "acceptedQuoteNumber", "acceptedQuoteAt",
    "wonSource", "wonAt", "wonMonth", "wonValueExVat", "wonDocType", "wonDocDate",
  ]) {
    assert.match(revert, new RegExp(`- '${key}'`), `ต้องล้าง metadata.${key}`);
    assert.match(unacceptSql, new RegExp(`- '${key}'`), `0138 ต้องล้าง metadata.${key} (ชุดอ้างอิง)`);
  }
  // ลงประวัติ + forecast เหมือน 0138 ไม่ใช่แก้ stage เงียบ ๆ
  assert.match(revert, /INSERT INTO public\.sales_deal_stage_history/);
  assert.match(revert, /INSERT INTO public\.sales_deal_forecasts[\s\S]*'reversal'/);
  // เรียกซ้ำปลอดภัย
  assert.match(revert, /IF v_deal\.stage <> 'won' THEN RETURN NULL/);
});

test("ซ่อมดีลที่ค้างอยู่แล้ว โดยไม่แตะ Won ที่บันทึกมือหรือ Won ที่ยังมี SO", () => {
  const repair = sql.slice(sql.indexOf("DO $$"));
  assert.match(repair, /d\.stage = 'won'/);
  assert.match(repair, /metadata->>'wonSource' = 'quotation'/);
  assert.match(repair, /NOT EXISTS \([\s\S]*q\.status = 'accepted'/);
  assert.match(repair, /NOT EXISTS \([\s\S]*so\.status <> 'cancelled'/);
});

test("route บังคับลบทุกกรณีผ่าน RPC + ส่งผู้ทำ + ลง audit ของดีลแยก", () => {
  assert.match(route, /hasEvidence \|\| force\s*\?\s*await supabase\.rpc\('force_delete_quotation'/);
  assert.match(route, /p_actor_id: user\.id \|\| null/);
  assert.match(route, /forceResult\?\.dealReverted[\s\S]*entityType: 'sales_deal'/);
});

test("พรีวิวก่อนบังคับลบบอกว่าดีลจะถอยออกจาก Won", () => {
  assert.match(forceDelete, /ถอยดีลออกจาก Won/);
});
