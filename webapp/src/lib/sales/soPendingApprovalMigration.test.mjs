import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// มติผู้ใช้ 2026-09-11 (mig 0353): ยอด SO "รออนุมัติ" ต้องโชว์ แต่แยกจาก Actual ให้ชัด
// ⇒ DB เก็บเป็นสองคีย์ใน sales_deals.metadata (soPendingAmount / soPendingCount)
// คู่กับ cache Actual เดิม · wonValue ยังนับเฉพาะ SO ที่อนุมัติแล้วเหมือนเดิมทุกตัวอักษร
//
// เทสต์นี้อ่าน **นิยามล่าสุดในโฟลเดอร์ migrations** ไม่ตรึงชื่อไฟล์ — วันหน้าใครคัดนิยาม
// ไปแก้ในไฟล์ใหม่ (หรือคัดจาก 0107/0108/0110 ที่ยังใช้ orderDate) เทสต์แดงทันที
// (wonMonthApprovalMigration.test.mjs อ่านแค่ 0279 จึงเฝ้านิยามที่ถูกแทนไปแล้ว)

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const sqlFiles = () => readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();

function latestDefinitionOf(fnName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const owning = sqlFiles().filter((name) => readFileSync(new URL(name, MIGRATIONS), 'utf8').includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
  const from = sql.lastIndexOf(marker);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: sql.slice(from, to) };
}

for (const name of ['sync_sales_order_actual', 'enforce_sales_order_actual_on_deal']) {
  test(`${name}: นิยามล่าสุดยังนับ Actual เฉพาะ SO อนุมัติ เดือนจาก approvedAt เวลาไทย`, () => {
    const { file, body } = latestDefinitionOf(name);
    assert.match(body, /max\(COALESCE\("?(so\.")?approvedAt" AT TIME ZONE 'Asia\/Bangkok'/, file);
    assert.doesNotMatch(body, /max\(\s*"?(so\.")?orderDate"/, file);
    assert.match(body, /status = 'approved'/, file);
  });

  test(`${name}: นิยามล่าสุดเก็บยอดรออนุมัติแยก — ไม่บวกเข้า wonValue`, () => {
    const { file, body } = latestDefinitionOf(name);
    // นับเฉพาะสถานะรออนุมัติ — ห้ามอิง submittedAt (ตีกลับไม่ล้างค่านี้)
    assert.match(body, /status = 'pending_approval'/, file);
    assert.doesNotMatch(body, /submittedAt/, file);
    // เจ้าของคีย์: ถอดทิ้งก่อนแล้วใส่ใหม่เมื่อมีใบรออนุมัติจริง — ค่าเก่าจาก PATCH ดีลค้างไม่ได้
    assert.match(body, /- 'soPendingAmount' - 'soPendingCount'/, file);
    assert.match(body, /'soPendingAmount', v_pending/, file);
    assert.match(body, /'soPendingCount', v_pending_count/, file);
    // Actual = ผลรวมของใบอนุมัติเท่านั้น
    assert.match(body, /"wonValue"\s*(=|:=)\s*v_actual;?/, file);
    assert.match(body, /'wonValueExVat', v_actual/, file);
    assert.doesNotMatch(body, /v_actual\s*\+\s*v_pending|v_pending\s*\+\s*v_actual/, file);
  });
}

test('ทั้งสองฟังก์ชันนิยามล่าสุดอยู่ในไฟล์เดียวกัน — แก้ข้างเดียวไม่ได้', () => {
  // enforce เป็น BEFORE UPDATE OF stage/wonValue/metadata ไม่มีเงื่อนไข = คนเขียนคนสุดท้าย
  // แก้แค่ sync ⇒ enforce ทิ้งคีย์ใหม่หรือปล่อยค่าเก่าจากหน้าจอค้าง · แก้แค่ enforce ⇒ ยอดหาย
  assert.equal(
    latestDefinitionOf('sync_sales_order_actual').file,
    latestDefinitionOf('enforce_sales_order_actual_on_deal').file,
  );
});

test('0353: backfill วนเฉพาะดีลที่มี SO รออนุมัติ — ห้ามวนทุกดีล', () => {
  const sql = readFileSync(new URL('0353_so_pending_approval_amount.sql', MIGRATIONS), 'utf8');
  assert.match(sql, /SELECT DISTINCT "dealId"\s+FROM public\.sales_orders\s+WHERE status = 'pending_approval'/);
  assert.doesNotMatch(sql, /FOR v_deal_id IN SELECT id FROM public\.sales_deals/);
  // เดือนของยอดรออนุมัติ = เดือนปัจจุบันตอนอ่าน ⇒ ไม่มีเดือนเก็บใน DB
  assert.doesNotMatch(sql, /'soPendingMonth'/);
});
