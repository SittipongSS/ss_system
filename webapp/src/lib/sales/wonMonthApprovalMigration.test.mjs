import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// มติผู้ใช้ 2026-08-21 (mig 0279): เดือนที่นับ Actual = เดือนที่ **อนุมัติ SO**
// (approvedAt เวลาไทย) ไม่ใช่ orderDate บนหัวใบ. ทั้งสองฟังก์ชันเป็น CREATE OR
// REPLACE ทั้งก้อน — ใครก๊อปนิยามเก่า (0107/0108/0110) มาแก้ต่อจะพา orderDate
// กลับมาเงียบ ๆ และยอดจะไหลไปลงเดือนที่ยังไม่ได้อนุมัติ จึงล็อกไว้ด้วยเทสต์

const sql = readFileSync(new URL('../../../supabase/migrations/0279_won_month_from_so_approval.sql', import.meta.url), 'utf8');

const fnBody = (text, name) => {
  const start = text.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `ไม่พบฟังก์ชัน ${name}`);
  const end = text.indexOf('FUNCTION public.', start + 20);
  return text.slice(start, end === -1 ? undefined : end);
};

for (const name of ['sync_sales_order_actual', 'enforce_sales_order_actual_on_deal']) {
  test(`0279: ${name} คิดเดือนจาก approvedAt เวลาไทย`, () => {
    const body = fnBody(sql, name);
    // เดือนต้องมาจาก approvedAt เป็นหลัก และแปลงเป็นเวลาไทยก่อน to_char เสมอ —
    // ไม่งั้นใบที่อนุมัติหลังเที่ยงคืนต้นเดือน (ไทย) จะตกไปเดือนก่อนหน้า (UTC)
    assert.match(body, /max\(COALESCE\("?(so\.")?approvedAt" AT TIME ZONE 'Asia\/Bangkok'/);
    // orderDate เหลือเป็นทางถอยของแถวเก่าที่ไม่มี approvedAt เท่านั้น
    assert.doesNotMatch(body, /max\(\s*"?(so\.")?orderDate"/);
    // ยอดยังนับเฉพาะใบที่อนุมัติแล้ว
    assert.match(body, /status = 'approved'/);
  });
}

test('0279: trigger ปลุกเมื่อ approvedAt เปลี่ยน — ไม่งั้น cache ค้างเดือนเก่า', () => {
  assert.match(sql, /UPDATE OF status, "actualAmount", "orderDate", "approvedAt", "dealId" OR DELETE/);
});

test('0279: backfill วนเฉพาะดีลที่มี SO อนุมัติแล้ว — ห้ามวนทุกดีล', () => {
  // วนทุกดีลแบบ 0110 จะทับ actualSource='legacy' (มติ 2026-08-08) เป็น 'sale_order'
  // แล้วดีลที่ย้ายมาจากระบบเดิมจะถูกล้างยอดเป็น 0
  assert.match(sql, /SELECT DISTINCT "dealId"\s+FROM public\.sales_orders\s+WHERE status = 'approved'/);
  assert.doesNotMatch(sql, /FOR v_deal_id IN SELECT id FROM public\.sales_deals/);
});
