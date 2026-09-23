// ── บังคับลบใบเสนอราคา/ดีลที่มีสาย Rev. ของใบสั่งขาย ───────────────────────────────────────────
// 🐞 UAT บน prod 24/09 (ดีลทดสอบ DL-260900581): บังคับลบ QT-26090383-0 ล้มด้วย error ดิบ
//   `update or delete on table "sales_orders" violates foreign key constraint "sales_orders_revisedFromId_fkey"`
//   ⇒ สองใบในสาย Rev. ชี้กันไปมา (ต้นทาง.supersededById → Rev. · Rev..revisedFromId → ต้นทาง) ด้วย FK ON DELETE RESTRICT
//     (0161) ⇒ force_delete_quotation (0168) ลบทีละใบ ลบใบไหนก่อนก็ชน ⇒ ลบ QT/ดีลที่เคยออก Rev. ไม่ได้เลย
//   ⭐ แก้: ตัดตัวชี้สายโซ่ของใบทั้งหมดใต้ QT นี้ก่อนวนลบ (ทั้งสายอยู่ใต้ QT เดียวกัน — ใบ Rev. ก๊อป quotationId มาจากต้นทาง)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIG = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
function fnBody(sql, fn) {
  const m = sql.match(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`));
  const start = m.index;
  return sql.slice(start, sql.indexOf('$$;', start) + 3).replace(/^CREATE (OR REPLACE )?FUNCTION/, 'CREATE FUNCTION');
}
function latest(fn) {
  const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
    .filter((f) => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`).test(readFileSync(join(MIG, f), 'utf8')));
  const file = files.at(-1);
  return { file, sql: readFileSync(join(MIG, file), 'utf8') };
}

test('force_delete_quotation (นิยามล่าสุด) ตัดตัวชี้สาย Rev. ของใบใต้ QT ก่อนวนลบ · ที่เหลือเท่า 0168', () => {
  const { file, sql } = latest('force_delete_quotation');
  assert.notEqual(file, '0168_unwon_deal_when_accepted_quotation_deleted.sql', 'ต้องมี migration ใหม่');
  const body = norm(fnBody(sql, 'force_delete_quotation'));
  const unlink = 'UPDATE public.sales_orders SET "revisedFromId" = NULL, "supersededById" = NULL WHERE "quotationId" = p_id AND ("revisedFromId" IS NOT NULL OR "supersededById" IS NOT NULL);';
  assert.ok(body.includes(unlink), 'ต้องตัดตัวชี้ทั้งสองทิศของใบใต้ QT นี้');
  assert.ok(body.indexOf(unlink) < body.indexOf('FOR v_so IN SELECT id FROM public.sales_orders'), 'ต้องตัดก่อนวนลบ');
  const old = norm(fnBody(readFileSync(join(MIG, '0168_unwon_deal_when_accepted_quotation_deleted.sql'), 'utf8'), 'force_delete_quotation'));
  assert.equal(body.replace(` ${unlink}`, ''), old, 'นอกจากบรรทัดตัดตัวชี้ ต้องเหมือน 0168 ทุกตัวอักษร');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.force_delete_quotation\(text, text, text, text\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.force_delete_quotation\(text, text, text, text\)\s+TO service_role;/);
});
