// ── ยามกัน "จำนวนรอบบริการ" หายเงียบตอนออก Rev. (mig 0326) ──────────────────
//
// ⭐ ตัวเลขนี้ถูกกรอกที่ **ใบสั่งขาย** (มติผู้ใช้ 2026-08-31 รอบสอง) ⇒ ทอดที่ต้องพาไปด้วย
// เหลือทอดเดียวคือ SO → SO Rev. ซึ่งก๊อปบรรทัดด้วย RPC · ลืมคอลัมน์ = ตัวเลขหายเงียบ
// เฉพาะตอนออก Rev. ซึ่งเป็นจังหวะที่จับได้ยากที่สุด (ไม่มี error ให้เห็น)
//
// 🪤 โรคเดียวกับคอลัมน์ที่อยู่ที่หายไปสองรอบใน mig 0124/0244 — ดู saveQuotationContentColumns.test.mjs
//
// เทสต์นี้อ่าน **นิยามล่าสุดในโฟลเดอร์ migrations** ไม่ตรึงชื่อไฟล์ ⇒ วันหน้ามีคนคัดลอก
// นิยามไปแก้ที่ไฟล์ใหม่แล้วลืมบรรทัดนี้ เทสต์แดงทันที
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);

function latestDefinitionOf(fnName) {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const marker = `FUNCTION public.${fnName}`;
  const owning = files.filter((name) => readFileSync(new URL(name, MIGRATIONS), 'utf8').includes(marker));
  assert.ok(owning.length, `ต้องมี migration ที่นิยาม ${fnName}`);
  const file = owning[owning.length - 1];
  const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
  const from = sql.lastIndexOf(`CREATE OR REPLACE ${marker}`);
  assert.ok(from >= 0, `อ่านนิยาม ${fnName} จาก ${file} ไม่ได้`);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${fnName} ใน ${file} ไม่เจอ`);
  return { file, body: sql.slice(from, to) };
}

test('revise_approved_sales_order_atomic ก๊อป serviceRounds ไปใบ Rev.', () => {
  const { file, body } = latestDefinitionOf('revise_approved_sales_order_atomic');
  // ต้องมีทั้งฝั่งชื่อคอลัมน์ (INSERT) และฝั่งค่า (SELECT) — ใส่ข้างเดียว SQL ก็พัง
  const hits = body.split('"serviceRounds"').length - 1;
  assert.ok(hits >= 2, `${file}: มี "serviceRounds" ${hits} ที่ — ต้องมีทั้งในลิสต์คอลัมน์และในค่าที่ SELECT`);
});

test('จำนวนรอบไม่เข้า fingerprint การอนุมัติใบเสนอราคา', () => {
  // ⛔ เหตุผลเดียวกับ docLanguage: fingerprint ของใบที่อนุมัติแล้วถูกตรึงไว้บน production
  // เพิ่มคีย์ใหม่วันนี้ = ใบที่อนุมัติแล้วทุกใบกลายเป็น "แก้หลังอนุมัติ" พร้อมกันทั้งระบบ
  const src = readFileSync(new URL('./quotationApprovalFingerprint.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /serviceRounds/);
});

test('สายใบเสนอราคาไม่มีช่องกรอกรอบแล้ว — บ้านเดียวคือใบสั่งขาย', () => {
  /* ⚠️ มติผู้ใช้ย้ายทางเข้ามาที่ใบสั่งขาย ⇒ ถ้าวันหนึ่งมีคนเติมกลับเข้า normalize ของ
     บรรทัดใบเสนอราคา จะกลายเป็นสองที่กรอกค่าเดียวกัน แล้วคนเดาไม่ออกว่าเลขที่เห็น
     มาจากไหน (โรคเดียวกับกระจกชื่อลูกค้า) */
  const quoteLines = readFileSync(new URL('./quoteLines.js', import.meta.url), 'utf8');
  assert.doesNotMatch(quoteLines, /serviceRounds/);
});
