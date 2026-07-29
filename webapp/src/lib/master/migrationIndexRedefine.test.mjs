// ── เปลี่ยนนิยาม index ต้อง DROP ก่อนเสมอ ────────────────────────────────
//
// 🐞 ที่มา (2026-07-29): mig 0181 เขียน
//      CREATE INDEX IF NOT EXISTS material_prices_formula_idx ON ... ("formulaId")
//    แต่ mig 0157 สร้าง index **ชื่อเดียวกัน** บน "formulaCode" ไว้ก่อนแล้ว
//
// ⚠️⚠️ **`IF NOT EXISTS` ของ Postgres เทียบที่ "ชื่อ" ไม่ใช่ "นิยาม"** → คำสั่งถูก
// ข้ามไปเงียบ ๆ ไม่มี error ไม่มี warning · index ยังชี้คอลัมน์เก่า และไม่มีอะไรใน
// ระบบจับได้เลย (migration รันผ่าน, เทสต์ผ่าน, แอปทำงานปกติเพราะเป็น index ตัวช่วย)
// กว่าจะรู้คือตอนไปอ่าน pg_indexes ด้วยตา
//
// กฎ: ถ้าชื่อ index ถูก CREATE ในไฟล์ที่ใหม่กว่าไฟล์ที่เคย CREATE ชื่อเดียวกัน
// ไฟล์ใหม่ต้องมี DROP INDEX ของชื่อนั้น หรือจัดการเองผ่าน DO block ที่อ่าน pg_class
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../../../supabase/migrations/', import.meta.url);

const createRe = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF NOT EXISTS\s+)?([a-zA-Z0-9_]+)/g;

// เคสที่เกิดไปแล้วและถูกแก้ด้วยใบถัดไป — ไม่แก้ไฟล์เก่าเพราะมัน **รันบน prod ไปแล้ว**
// (กฎของโปรเจกต์: migration ที่รันแล้วคือประวัติศาสตร์ ห้ามแก้ย้อนหลัง) · บรรทัดที่
// ผิดใน 0181 เป็น no-op อยู่แล้วบน prod และ 0182 เป็นตัวแก้ของจริง
const KNOWN = new Set([
  '0181_material_identity_by_formula_id.sql: material_prices_formula_idx',
]);

test('migration ที่สร้าง index ชื่อซ้ำกับใบก่อน ต้อง DROP หรือจัดการผ่าน pg_class ก่อน', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const firstSeen = new Map(); // indexName → ไฟล์แรกที่สร้าง
  const offenders = [];

  for (const file of files) {
    const sql = readFileSync(new URL(file, DIR), 'utf8');
    // ตัดคอมเมนต์ทิ้งก่อน — ตัวอย่าง rollback ในคอมเมนต์ไม่ใช่คำสั่งจริง
    const code = sql.replace(/--.*$/gm, '');
    const names = [...code.matchAll(createRe)].map((m) => m[1]);

    for (const name of new Set(names)) {
      const previous = firstSeen.get(name);
      if (previous) {
        const handled = new RegExp(`DROP\\s+INDEX[^;]*\\b${name}\\b`, 'i').test(code)
          // DO block ที่อ่าน pg_class เองแล้ว rename/drop (แพตเทิร์นของ mig 0179)
          || (/pg_class/.test(code) && new RegExp(`\\b${name}\\b`).test(code) && /DO \$\$/.test(code));
        if (!handled && !KNOWN.has(`${file}: ${name}`)) {
          offenders.push(`${file}: สร้าง "${name}" ซ้ำกับ ${previous} โดยไม่ DROP ก่อน — IF NOT EXISTS จะข้ามเงียบ ๆ`);
        }
      } else {
        firstSeen.set(name, file);
      }
    }
  }

  assert.deepEqual(offenders, [], `\n${offenders.join('\n')}\n`);
});
