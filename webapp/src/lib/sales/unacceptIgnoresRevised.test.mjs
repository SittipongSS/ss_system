// ── ย้อนการรับใบเสนอราคา: ใบ SO ที่ถูกออก Rev. ทับแล้ว (revised) ไม่นับว่ายังมีชีวิต ────────────────
// 🐞 ทางตันที่เจอตอน UAT บน prod 24/09 (SO-26090237-0 → Rev. -1 → ยกเลิก -1 โดยไม่ถอยดีล):
//   ด่าน "ย้อนการรับ" ทั้งปุ่ม (hasNonCancelledSalesOrder) และ RPC unaccept_quotation_atomic (0170) ถือว่ามีใบที่
//   "ไม่ใช่ cancelled" สักใบ = บล็อก ⇒ ใบต้นทาง 'revised' ค้างตลอดไป ⇒ ดีลติด Won โดยไม่มีปุ่มไหนพาออก
//   ⭐ นิยาม "ใบที่ยังมีชีวิต" ทั้งระบบ = ไม่ cancelled และไม่ถูกแทน (isLiveSalesOrder · ด่านกันสร้างซ้ำ create_sales_order_draft)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, '../../../supabase/migrations');
const SRC = join(HERE, '../..');

function latestDefinition(fn) {
  const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const hits = files.filter((f) => readFileSync(join(MIG, f), 'utf8').includes(`CREATE OR REPLACE FUNCTION public.${fn}(`));
  const file = hits.at(-1);
  const sql = readFileSync(join(MIG, file), 'utf8');
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  return { file, body: sql.slice(start, sql.indexOf('$$;', start) + 3), sql };
}
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

test('RPC ย้อนการรับ (นิยามล่าสุด): ใบที่ถูกแทนด้วย Rev. ไม่บล็อก · ที่เหลือเท่า 0170 ทุกตัวอักษร', () => {
  const { file, body, sql } = latestDefinition('unaccept_quotation_atomic');
  assert.notEqual(file, '0170_deal_stage_order_swap.sql', 'ต้องมี migration ใหม่ที่แก้ด่านนี้');
  assert.match(norm(body), /WHERE "quotationId" = v_quote\.id AND status <> 'cancelled' AND "supersededById" IS NULL \) THEN RAISE EXCEPTION 'sales_order_exists';/);
  const old = latestDefinitionFrom('0170_deal_stage_order_swap.sql', 'unaccept_quotation_atomic');
  assert.equal(norm(body).replace(` AND "supersededById" IS NULL`, ''), norm(old), 'นอกจากเงื่อนไข supersededById ต้องเหมือน 0170 ทุกตัวอักษร');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.unaccept_quotation_atomic\(text, text, text, text, text\) FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.unaccept_quotation_atomic\(text, text, text, text, text\) TO service_role;/);
});

function latestDefinitionFrom(file, fn) {
  const sql = readFileSync(join(MIG, file), 'utf8');
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

test('ปุ่มย้อนการรับใช้นิยามเดียวกับ RPC: ใบที่ยังมีชีวิต (isLiveSalesOrder) ไม่ใช่ "ไม่ใช่ cancelled"', () => {
  const route = readFileSync(join(SRC, 'app/api/sales-planning/quotations/[id]/route.js'), 'utf8');
  const page = readFileSync(join(SRC, 'app/sales-planning/quotations/[id]/page.js'), 'utf8');
  assert.match(route, /data\.hasLiveSalesOrder = rows\.some\(isLiveSalesOrder\);/);
  assert.doesNotMatch(route, /hasNonCancelledSalesOrder/);
  assert.match(page, /canUnaccept = [^;]*!quote\.hasLiveSalesOrder/);
  assert.doesNotMatch(page, /hasNonCancelledSalesOrder/);
});
