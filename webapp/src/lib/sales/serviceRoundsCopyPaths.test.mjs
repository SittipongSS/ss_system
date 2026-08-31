// ── ยามกัน "จำนวนรอบบริการ" หายเงียบระหว่างทาง (mig 0326) ────────────────────
//
// บรรทัดหนึ่งบรรทัดถูกก๊อปสี่ทอดกว่าจะไปถึงหน้างานของ TS:
//   QT (save_quotation_content) → QT Rev. (route JS) → SO (create_sales_order_draft)
//   → SO Rev. (revise_approved_sales_order_atomic)
// ทอดไหนลืมใส่คอลัมน์ ตัวเลขหายเงียบเฉพาะทอดนั้น ไม่มี error ให้เห็น — โรคเดียวกับ
// คอลัมน์ที่อยู่ที่หายไปสองรอบใน mig 0124/0244 (ดู saveQuotationContentColumns.test.mjs)
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

for (const fn of [
  'save_quotation_content',            // QT: บันทึกใบเสนอราคา (ต้นทางที่คนพิมพ์)
  'create_sales_order_draft',          // QT → SO
  'revise_approved_sales_order_atomic', // SO → SO Rev.
]) {
  test(`${fn} ก๊อป serviceRounds ไปด้วย`, () => {
    const { file, body } = latestDefinitionOf(fn);
    // ต้องมีทั้งฝั่งชื่อคอลัมน์ (INSERT) และฝั่งค่า (SELECT) — ใส่ข้างเดียว SQL ก็พัง
    // แต่การนับให้ ≥ 2 จับกรณีที่คนเติมแค่ในลิสต์คอลัมน์แล้วลืมค่าไม่ได้ถ้านับรวมทั้งไฟล์
    const hits = body.split('"serviceRounds"').length - 1;
    assert.ok(hits >= 2, `${file}: ${fn} มี "serviceRounds" ${hits} ที่ — ต้องมีทั้งในลิสต์คอลัมน์และในค่าที่ SELECT`);
  });
}

test('QT Rev. ฝั่ง JS ก๊อป serviceRounds ไปที่ใบใหม่', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/quotations/[id]/revise/route.js', import.meta.url), 'utf8',
  );
  assert.match(route, /serviceRounds:/, 'route revise ไม่ได้ก๊อป serviceRounds — ตัวเลขจะหายตอนออก Rev.');
});

test('จำนวนรอบไม่เข้า fingerprint การอนุมัติใบเสนอราคา', () => {
  // ⛔ เหตุผลเดียวกับ docLanguage: fingerprint ของใบที่อนุมัติแล้วถูกตรึงไว้บน production
  // เพิ่มคีย์ใหม่วันนี้ = ใบที่อนุมัติแล้วทุกใบกลายเป็น "แก้หลังอนุมัติ" พร้อมกันทั้งระบบ
  const src = readFileSync(new URL('./quotationApprovalFingerprint.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /serviceRounds/);
});
