// ข้อมูลสูตรบนสินค้า = snapshot จากทะเบียน (PR-5)
//
// ก่อนหน้านี้ formulaName/Code/Date เป็นสามช่องข้อความที่พิมพ์เอง ผลคือบน prod มี
// 10 แถวที่เอา *ชื่อกลิ่น* ไปกรอกช่องชื่อสูตร แล้วไม่มีใครกลับมาตรวจ (mig 0171
// จึงตั้งใจไม่ backfill กลุ่มนั้น) · เทสต์นี้ล็อกกติกาใหม่ไว้ 3 ข้อ:
//   1) ค่าทั้งสามมาจากทะเบียนเท่านั้น
//   2) id ที่ไม่มีจริงต้องโยน ไม่ใช่บันทึกผ่านแล้วไม่ผูกอะไรเลยเงียบ ๆ
//   3) จัดระเบียบว่าเป็น "กลิ่น" ต้องล้างสามช่องนั้นทิ้ง — ค่านั้นไม่เคยเป็นข้อมูลสูตร
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkProductToRegistry, productFormulaSnapshot } from './scentFormulaAdmin.js';

const FORMULAS = [
  { id: 'FML-1', code: 'F-2569-014', name: 'มิดไนท์บลูม v2', formulaDate: '2026-03-01', scentId: 'SCT-1' },
  { id: 'FML-2', code: null, name: 'ร่างยังไม่มีรหัส', formulaDate: null, scentId: null },
];

// `holders` = แถวสินค้าที่ถือสูตรอยู่ (ด่าน 1 สูตร : 1 FG อ่านจาก products)
function fakeSupabase({ onUpdate, holders = [] } = {}) {
  return {
    from(table) {
      return {
        select() {
          const chain = {
            _id: null,
            eq(_col, val) { chain._id = val; return chain; },
            maybeSingle() {
              const rows = table === 'formulas' ? FORMULAS : [];
              return Promise.resolve({ data: rows.find((r) => r.id === chain._id) || null, error: null });
            },
            single() { return Promise.resolve({ data: { id: chain._id }, error: null }); },
            // ด่าน 1:1 await ทั้ง chain ตรง ๆ — ต้อง thenable
            then(resolve) {
              return resolve({ data: table === 'products' ? holders : [], error: null });
            },
          };
          return chain;
        },
        update(patch) {
          onUpdate?.(patch);
          return {
            eq() { return { select: () => ({ single: () => Promise.resolve({ data: { id: 'PRD-1' }, error: null }) }) }; },
          };
        },
      };
    },
  };
}

test('ชื่อ/รหัส/วันที่/กลิ่น ดึงจากทะเบียน ไม่ใช่จากที่ผู้ใช้พิมพ์', async () => {
  const snap = await productFormulaSnapshot(fakeSupabase(), 'FML-1');
  assert.deepEqual(snap, {
    formulaId: 'FML-1',
    formulaCode: 'F-2569-014',
    formulaName: 'มิดไนท์บลูม v2',
    formulaDate: '2026-03-01',
    // กลิ่นของสินค้า = กลิ่นของสูตรเสมอ (FG → สูตร → กลิ่น)
    scentId: 'SCT-1',
  });
});

test('1 สูตร : 1 FG — สูตรที่ FG อื่นถือแล้วเลือกซ้ำไม่ได้ แต่เจ้าของเดิมบันทึกซ้ำได้', async () => {
  const holders = [{ id: 'PRD-1', fgCode: 'FG-100-01-001-0001' }];
  // FG อื่นมาขอใช้ → โดนตีกลับพร้อมบอกว่าใครถืออยู่
  await assert.rejects(
    () => productFormulaSnapshot(fakeSupabase({ holders }), 'FML-1', { forProductId: 'PRD-2' }),
    /FG-100-01-001-0001/,
  );
  // เจ้าของเดิมกดบันทึกฟอร์มแก้ → ผ่าน (ไม่งั้นแก้ชื่อสินค้าเฉย ๆ ก็บันทึกไม่ได้)
  const snap = await productFormulaSnapshot(fakeSupabase({ holders }), 'FML-1', { forProductId: 'PRD-1' });
  assert.equal(snap.formulaId, 'FML-1');
});

test('สูตรร่างที่ยังไม่มีรหัสก็ผูกได้ — ช่องที่ว่างเป็น null ไม่ใช่ ""', async () => {
  const snap = await productFormulaSnapshot(fakeSupabase(), 'FML-2');
  assert.equal(snap.formulaName, 'ร่างยังไม่มีรหัส');
  assert.equal(snap.formulaCode, null);
  assert.equal(snap.formulaDate, null);
});

test('ไม่เลือกสูตร = ล้างทั้งชุด (FG กล่อง/บรรจุภัณฑ์ไม่มีสูตร)', async () => {
  for (const empty of [null, undefined, '']) {
    const snap = await productFormulaSnapshot(fakeSupabase(), empty);
    assert.deepEqual(snap, {
      formulaId: null, formulaCode: null, formulaName: null, formulaDate: null,
    });
  }
});

test('formulaId ที่ไม่มีในทะเบียนต้องโยน ไม่ใช่บันทึกผ่านแบบไม่ผูกอะไร', async () => {
  await assert.rejects(
    () => productFormulaSnapshot(fakeSupabase(), 'FML-ไม่มีจริง'),
    /ไม่พบสูตร/,
  );
});

test('จัดระเบียบเป็นสูตร → เขียนทับข้อความเดิมด้วยค่าจากทะเบียน', async () => {
  let patch = null;
  await linkProductToRegistry(fakeSupabase({ onUpdate: (p) => { patch = p; } }), 'PRD-1', { formulaId: 'FML-1' });
  assert.equal(patch.formulaId, 'FML-1');
  assert.equal(patch.formulaName, 'มิดไนท์บลูม v2');
  assert.equal(patch.formulaCode, 'F-2569-014');
});

test('จัดระเบียบเป็นกลิ่น → ล้างสามช่องสูตรทิ้ง (ค่านั้นไม่ใช่ข้อมูลสูตร)', async () => {
  let patch = null;
  await linkProductToRegistry(fakeSupabase({ onUpdate: (p) => { patch = p; } }), 'PRD-1', { scentId: 'SCT-1' });
  assert.equal(patch.scentId, 'SCT-1');
  assert.equal(patch.formulaName, null);
  assert.equal(patch.formulaCode, null);
  assert.equal(patch.formulaDate, null);
  // ไม่แตะ formulaId — สินค้าที่เป็นกลิ่นไม่มีสูตรอยู่แล้ว
  assert.equal('formulaId' in patch, false);
});
