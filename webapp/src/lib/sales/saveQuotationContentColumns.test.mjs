// ── ยามกันคีย์หายเงียบใน save_quotation_content ────────────────────────────
//
// 🐞 บั๊กที่ทำให้ต้องมีเทสต์นี้ (2026-08-12): UPDATE ของ RPC ตัวนั้น **whitelist คอลัมน์**
// คีย์ที่ไม่มีชื่ออยู่ในลิสต์ถูกทิ้งเงียบ ไม่ error · เกิดมาแล้วสองรอบ:
//   · mig 0124 — `metadata` (ผู้รับผิดชอบเอกสาร) หายทั้งก้อน
//   · mig 0244 — ที่อยู่บนใบ (0202/0203) หายทั้งข้อความและ id ตั้งแต่วันที่เพิ่มคอลัมน์
// ทั้งสองรอบไม่มีอะไรฟ้อง ผู้ใช้เห็นแค่ "บันทึกแล้ว" แล้วค่าไม่เปลี่ยน
//
// เทสต์นี้อ่าน **นิยามล่าสุดที่อยู่ในโฟลเดอร์ migrations** แล้วเช็กว่าคอลัมน์ที่ route
// ยิงเข้า `p_content` มีครบในลิสต์ · ชุดคีย์ที่อยู่ดึงจาก `pickDocumentAddresses` เอง
// ไม่ได้พิมพ์ค้างไว้ ⇒ เพิ่มช่องที่อยู่ใหม่วันหน้าแล้วลืมขยาย RPC เทสต์นี้แดงทันที
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pickDocumentAddresses } from '@/lib/master/addresses';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FN = 'FUNCTION public.save_quotation_content';

// นิยามที่ "มีผลจริง" คือไฟล์เลขสูงสุดที่ CREATE OR REPLACE ตัวนี้ — ไม่ตรึงชื่อไฟล์ไว้
// เพราะทุกครั้งที่มีคนแก้ RPC มันจะย้ายไปอยู่ไฟล์ใหม่ แล้วเทสต์ที่ตรึงชื่อจะตรวจของเก่าต่อไป
function latestDefinition() {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const owning = files.filter((name) => readFileSync(new URL(name, MIGRATIONS), 'utf8').includes(FN));
  assert.ok(owning.length, 'ต้องมี migration ที่นิยาม save_quotation_content');
  const file = owning[owning.length - 1];
  const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
  const from = sql.lastIndexOf('UPDATE public.quotations q SET');
  const to = sql.indexOf('WHERE q.id = p_quote_id', from);
  assert.ok(from >= 0 && to > from, `อ่านลิสต์คอลัมน์จาก ${file} ไม่ได้`);
  return { file, setList: sql.slice(from, to) };
}

// คอลัมน์ที่ถูกเขียนในลิสต์ = `"ชื่อ" =` หรือ `ชื่อ =` (คอลัมน์ตัวเล็กล้วนไม่ต้องมีอัญประกาศ)
function columnsOf(setList) {
  return new Set([...setList.matchAll(/^\s*"?([A-Za-z][A-Za-z0-9]*)"?\s*=\s*CASE/gm)].map((m) => m[1]));
}

test('save_quotation_content บันทึกช่องที่อยู่บนใบครบทุกช่องที่ pickDocumentAddresses ผลิต', () => {
  const { file, setList } = latestDefinition();
  const columns = columnsOf(setList);
  // เรียกด้วยค่าว่าง — ต้องการแค่ "รายชื่อคีย์" ที่ snapshot ผลิต ไม่ใช่ค่าจริง
  const addressKeys = Object.keys(pickDocumentAddresses(null, {}).snapshot);
  assert.ok(addressKeys.length >= 5, 'snapshot ที่อยู่ต้องมีอย่างน้อย 5 ช่อง');
  for (const key of addressKeys) {
    assert.ok(columns.has(key), `${file} ไม่มีคอลัมน์ "${key}" ⇒ PATCH ที่อยู่จะถูกทิ้งเงียบ`);
  }
});

test('save_quotation_content ไม่ทำคอลัมน์เดิมหายตอนมีคนคัดลอกนิยามไปแก้', () => {
  const { file, setList } = latestDefinition();
  const columns = columnsOf(setList);
  // ทุกตัวเคยมีบั๊ก/มติผูกอยู่ — หายไปเมื่อไรคือถอยหลัง ไม่ใช่การทำความสะอาด
  for (const key of [
    'quoteDate', 'validUntil', 'paymentTerms', 'notes', 'status',
    'subtotal', 'vatAmount', 'totalAmount', 'discountType', 'discountValue', 'discountAmount',
    'vatRate', 'paymentPlan', 'metadata', 'docLanguage',
    'approvalStatus', 'approvalReason', 'approvalRequestedAt', 'approvalRequestedBy',
    'approvalRequestedByName', 'approvalFingerprint', 'approvedAt', 'approvedBy', 'approvedByName',
  ]) {
    assert.ok(columns.has(key), `${file} ทำคอลัมน์ "${key}" หายจากลิสต์`);
  }
});
