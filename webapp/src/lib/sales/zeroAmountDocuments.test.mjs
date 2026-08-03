import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// มติผู้ใช้ 2026-08-03: เอกสารยอดก่อน VAT 0 บาท เดินได้ตลอดเส้น — QT ปิด Won ได้ (0196)
// และ SO ยื่น/อนุมัติได้ (0197). ทั้งสองไฟล์เป็นการ CREATE OR REPLACE ทั้งฟังก์ชัน ซึ่งเป็น
// จุดที่ guard หายง่ายที่สุด → เทียบรายการ RAISE EXCEPTION กับนิยามต้นฉบับแบบ deepEqual
// (แพตเทิร์นเดียวกับ 0165 vs 0125 ใน documentWorkflowMigration.test.mjs)

const sql = (file) => readFileSync(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8');

const acceptSource = sql('0102_quotation_won_evidence.sql');
const acceptZero = sql('0196_quotation_accept_zero_total.sql');
const submitSource = sql('0153_submit_sales_order_evidence.sql');
const approveSource = sql('0150_approve_confirm_optional_reason.sql');
const soZero = sql('0197_sales_order_zero_actual.sql');

const guardsIn = (text) => (text.match(/RAISE EXCEPTION '[a-z_]+'/g) || []).sort();
const fnBody = (text, name) => {
  const start = text.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `ไม่พบฟังก์ชัน ${name}`);
  const end = text.indexOf('FUNCTION public.', start + 20);
  return text.slice(start, end === -1 ? undefined : end);
};

test('0196: accept_quotation_atomic ถอดเฉพาะด่านยอด 0 — ด่านอื่นครบทุกตัว', () => {
  const before = guardsIn(fnBody(acceptSource, 'accept_quotation_atomic'));
  const after = guardsIn(fnBody(acceptZero, 'accept_quotation_atomic'));
  const dropped = ["RAISE EXCEPTION 'quotation_total_zero'", "RAISE EXCEPTION 'quotation_won_value_zero'"];
  for (const guard of dropped) assert.ok(before.includes(guard), `0102 ควรมี ${guard}`);
  assert.deepEqual(after, before.filter((g) => !dropped.includes(g)));
  // หลักฐาน Won ยังบังคับ และยอดติดลบยังถูกกันด้วย GREATEST เหมือนเดิม
  assert.match(acceptZero, /quotation_evidence_file_required/);
  assert.match(acceptZero, /GREATEST\(0, v_quote\."totalAmount" - COALESCE\(v_quote\."vatAmount", 0\)\)/);
});

test('0197: SO ยื่น/อนุมัติ ถอดเฉพาะเงื่อนไข actualAmount > 0 — ด่านอื่นครบทุกตัว', () => {
  for (const [name, source] of [
    ['submit_sales_order_with_signature_evidence_atomic', submitSource],
    ['approve_sales_order_with_signature_evidence_atomic', approveSource],
  ]) {
    const before = fnBody(source, name);
    const after = fnBody(soZero, name);
    // ยอดเป็นส่วนหนึ่งของด่าน document_incomplete ไม่ใช่ RAISE ของตัวเอง → ชุดด่านต้องเท่าเดิมเป๊ะ
    assert.deepEqual(guardsIn(after), guardsIn(before), `${name}: ชุดด่านเปลี่ยนไป`);
    assert.match(before, /NOT \(v_order\."actualAmount" > 0\)/, `${name}: ต้นฉบับควรมีด่านยอด`);
    assert.doesNotMatch(after, /actualAmount/, `${name}: ยังเหลือด่านยอดอยู่`);
    // เงื่อนไขความครบที่เหลือต้องอยู่ครบ — ถอดยอดแล้วต้องไม่พาตัวอื่นหลุดไปด้วย
    for (const kept of [/v_order\."orderDate" IS NULL/, /v_order\."projectId" IS NULL/,
      /v_order\."customerName"/, /q\.status = 'accepted'/, /public\.sales_order_lines/]) {
      assert.match(after, kept, `${name}: เงื่อนไขความครบหายไป (${kept})`);
    }
  }
});
