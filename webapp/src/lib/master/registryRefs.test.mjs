// ── pointer เข้าทะเบียนกลิ่น/สูตรต้องเป็น RESTRICT จริงใน migration (R-5) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FORMULA_REF_TARGETS, SCENT_REF_TARGETS, registryRefTargets,
} from './registryRefs.js';
import { deleteScentError } from './scents.js';
import { deleteFormulaError } from './formulas.js';

const MIGRATION = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/0232_registry_pointer_restrict.sql'),
  'utf8',
);

test('registryRefTargets — เลือกรายการตามชนิดทะเบียน', () => {
  assert.deepEqual(registryRefTargets('scent'), SCENT_REF_TARGETS);
  assert.deepEqual(registryRefTargets('formula'), FORMULA_REF_TARGETS);
  // รายการต้องแช่แข็ง — ใครเผลอ push เข้าไปตอน runtime จะพังทันทีแทนที่จะเพี้ยนเงียบ
  assert.throws(() => SCENT_REF_TARGETS.push(['x', 'y']));
});

test('🔴 ทุกเป้าหมายในทะเบียนต้องมี FK RESTRICT จริงใน mig 0232', () => {
  /* 🐞 นี่คือรูที่ R-5 ปิด — ก่อนหน้านี้ทั้งหมดเป็น ON DELETE SET NULL ⇒ ลบกลิ่น/สูตร
     แล้ว pointer บนคำร้องและทะเบียนราคาถูกล้างเงียบ ๆ ไม่มี error ไม่มี warning
     ⚠️ เทสต์อ่านไฟล์ migration จริง ไม่ใช่ลิสต์ที่พิมพ์ไว้เอง — เพิ่มเป้าหมายใน
     `registryRefs.js` แล้วลืมเขียน SQL จะแดงทันที */
  for (const [table, column] of [...SCENT_REF_TARGETS, ...FORMULA_REF_TARGETS]) {
    const ref = table.includes('request') || table === 'material_prices' ? true : false;
    assert.ok(ref, `${table} ควรเป็นตารางที่อยู่ในขอบเขต R-5`);
    const pattern = new RegExp(
      `FOREIGN KEY \\("${column}"\\)[\\s\\S]{0,80}?ON DELETE RESTRICT`,
    );
    assert.match(MIGRATION, pattern, `${table}.${column} ต้องถูกตั้งเป็น RESTRICT ใน 0232`);
    assert.ok(
      MIGRATION.includes(`public.${table}`),
      `0232 ต้องพูดถึงตาราง ${table}`,
    );
  }
});

test('⚠️ ของที่ตั้งใจคง SET NULL ต้องไม่หลุดเข้ามาในรายการ', () => {
  /* สินค้ามีตัวตนของตัวเอง (รหัส FG · ชื่อ · ลูกค้า) กลิ่น/สูตรเปลี่ยนได้ตามรอบผลิต
     · สายพันธุ์ที่บรรพบุรุษถูกลบ = "ไม่รู้ที่มา" ซึ่งเป็นความจริง ไม่ใช่ข้อมูลหาย */
  const all = [...SCENT_REF_TARGETS, ...FORMULA_REF_TARGETS].map(([t, c]) => `${t}.${c}`);
  for (const forbidden of ['products.scentId', 'products.formulaId', 'formulas.scentId']) {
    assert.ok(!all.includes(forbidden), `${forbidden} ต้องคง SET NULL ตามมติ`);
  }
  assert.ok(MIGRATION.includes('products'), '0232 ต้องเขียนไว้ว่าทำไมถึงไม่แตะ products');
});

test('🔴 ด่านลบต้องบอกเป็นภาษาไทยก่อน ไม่ใช่ปล่อยให้ไปตายที่ 23503', () => {
  const draftScent = { id: 'S1', status: 'draft' };
  assert.equal(deleteScentError(draftScent, { linkedCount: 0 }), null);
  const scentMsg = deleteScentError(draftScent, { linkedCount: 3 });
  assert.match(scentMsg, /3 ที่/);
  assert.ok(!/23503|violates|constraint/i.test(scentMsg), 'ห้ามหลุดข้อความดิบของฐานข้อมูล');

  const draftFormula = { id: 'F1', status: 'draft' };
  assert.equal(deleteFormulaError(draftFormula, {}), null);
  assert.match(deleteFormulaError(draftFormula, { linkedCount: 2 }), /2 ที่/);
  // สินค้ายังเป็นด่านแยก (SET NULL แต่กันไว้ไม่ให้ลบโดยไม่ตั้งใจ)
  assert.match(deleteFormulaError(draftFormula, { productCount: 5 }), /สินค้า 5 รายการ/);
});

test('ทะเบียนที่รับเข้าแล้วยังลบไม่ได้เหมือนเดิม — RESTRICT ไม่ได้มาแทนกฎนั้น', () => {
  assert.match(deleteScentError({ status: 'active' }, { linkedCount: 0 }), /เฉพาะร่าง/);
  assert.match(deleteFormulaError({ status: 'active' }, {}), /เฉพาะร่าง/);
});
