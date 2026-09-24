// ── ออก Rev. ใบสั่งขาย: AE เจ้าของดีลกดได้ (mig 0385 · มติ 24/09) ─────────────────────────────
//
// ⭐ 0385 ปะ revise_approved_sales_order_atomic จากนิยามที่รันอยู่จริง (pg_get_functiondef) ⇒ ไม่มี
//    CREATE FUNCTION ในไฟล์ให้เทสต์ที่ไล่หา "นิยามล่าสุด" เห็น — เทสต์นี้ล็อกตัวหนังสือของการปะแทน
// ⚠️ อ่าน **ตัวหนังสือ SQL** · พฤติกรรมจริงลองบนฮาร์เนส PGlite แล้ว (เจ้าของดีลผ่าน · AE/AC/AC Sup คนอื่นตก ·
//    AE Sup/CM ผ่านเหมือนเดิม · ย้ายดีลแล้วเจ้าของใหม่ผ่าน ผู้สร้างใบเดิมตก · ย้อนอนุมัติของเจ้าของดีลยังตก ·
//    รันซ้ำได้ · ไม่มี 0382 = ถอยทั้งไฟล์ ฟังก์ชันไม่ถูกแตะ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const CODE = stripComments(read('0385_so_revise_by_deal_owner.sql'));
const PREV = stripComments(read('0382_sales_role_hierarchy.sql'));

const dollar = (tag) => {
  const m = CODE.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  assert.ok(m, `ต้องมีสตริง $${tag}$`);
  return m[1];
};

test('0385 แทนที่เงื่อนไขตำแหน่งที่ 0382 เขียนไว้ในฟังก์ชันออก Rev. ตัวอักษรต่อตัวอักษร', () => {
  const oldExpr = dollar('o');
  // ต้องตรงกับ new_expr ของแถว revise_approved_sales_order_atomic ใน 0382 — ไม่ตรง = ปะไม่เจอแล้วระเบิดตอนรัน
  const row = PREV.match(/\('revise_approved_sales_order_atomic',\s*\$o\$[\s\S]*?\$o\$,\s*\$n\$([\s\S]*?)\$n\$\)/);
  assert.ok(row, '0382 ต้องมีแถวของ revise_approved_sales_order_atomic');
  assert.equal(oldExpr, row[1]);
  assert.match(CODE, /p\.proname = 'revise_approved_sales_order_atomic'/);
  assert.match(CODE, /EXECUTE replace\(pg_get_functiondef\(v_proc\.oid\), v_old, v_new\)/);
});

test('0385 ผ่านเมื่อเป็นผู้มีอำนาจตัดสิน หรือเจ้าของดีล *ปัจจุบัน* ของใบ — ฐานอ่านเจ้าของเอง', () => {
  const newExpr = dollar('n');
  assert.match(newExpr, /^NOT \(public\.is_sales_manager_role\(p_actor_role\) OR EXISTS \(/);
  assert.match(newExpr, /JOIN public\.sales_deals d ON d\.id = so_owner\."dealId"/);
  assert.match(newExpr, /so_owner\.id = p_order_id/);
  assert.match(newExpr, /d\."ownerId" = p_actor_id/);
  // ไม่อ่านผู้สร้างใบ — ย้ายดีลแล้วสิทธิ์ต้องย้ายตาม (กติกาเดียวกับ canSubmitSalesOrder / 0165)
  assert.doesNotMatch(newExpr, /createdBy/);
});

test('0385 ไม่แตะการย้อนการอนุมัติ — ยังเป็นของผู้มีอำนาจตัดสินคนเดียว', () => {
  assert.doesNotMatch(CODE, /revoke_sales_order_approval_atomic/);
  assert.match(CODE, /^BEGIN;/m);
  assert.match(CODE, /^COMMIT;/m);
  // รันซ้ำได้: ปะแล้วต้องถูกข้าม ไม่ใช่ระเบิดเพราะหาเงื่อนไขเดิมไม่เจอ
  assert.match(CODE, /strpos\(v_proc\.prosrc, v_new\) > 0 THEN\s+v_already := v_already \+ 1;\s+CONTINUE;/);
});
