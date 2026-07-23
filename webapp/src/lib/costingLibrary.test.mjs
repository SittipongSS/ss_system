// เชื่อมใบขอราคาผลิต ↔ คลังราคาวัสดุ (PR-B) — logic ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  componentFillFromRevision,
  componentLibraryStatus,
  libraryPricingBlocker,
} from './costingLibrary.js';

const materials = [
  {
    id: 'm1', kind: 'PM', label: 'ขวดแก้ว 50ml', customerId: null, isHidden: false,
    revisions: [{ id: 'r1', revisionNo: 1, unitBasis: 'per_piece', pricePerUnit: 10, quotedAt: '2026-05-01T00:00:00Z' }],
  },
];
const today = '2026-07-15'; // ก่อน m1 หมดอายุ (2026-07-30)

test('สถานะบรรทัด: internal / ready / expired / missing / confirmed', () => {
  // ค่าดำเนินการ (ไม่มี sourceDept)
  assert.equal(componentLibraryStatus({ kind: 'labor', sourceDept: null }, materials, {}).status, 'internal');
  // มีในคลัง ยังไม่เกินอายุ
  assert.equal(
    componentLibraryStatus({ kind: 'PM', sourceDept: 'PC', label: 'ขวดแก้ว 50ml' }, materials, { todayIso: today }).status,
    'ready',
  );
  // เกินอายุ
  assert.equal(
    componentLibraryStatus({ kind: 'PM', sourceDept: 'PC', label: 'ขวดแก้ว 50ml' }, materials, { todayIso: '2026-08-01' }).status,
    'expired',
  );
  // คลังไม่มี
  assert.equal(
    componentLibraryStatus({ kind: 'PM', sourceDept: 'PC', label: 'ไม่มีของนี้' }, materials, { todayIso: today }).status,
    'missing',
  );
  // ยืนยันแล้ว = ไม่ต้องเช็คคลัง
  assert.equal(
    componentLibraryStatus({ kind: 'PM', sourceDept: 'PC', label: 'ขวดแก้ว 50ml', confirmStatus: 'confirmed' }, materials, {}).status,
    'confirmed',
  );
});

test('ค่าที่เขียนลงบรรทัดเมื่อดึงราคา: snapshot + ตัวชี้คลัง', () => {
  const rev = { id: 'r1', materialId: 'm1', unitBasis: 'per_piece', pricePerUnit: 10 };
  assert.deepEqual(componentFillFromRevision(rev), {
    pricePerUnit: 10, pricePerKg: null,
    materialId: 'm1', materialRevisionId: 'r1',
    priceStatus: 'quoted', priceSource: 'library', confirmStatus: null,
  });
  // ยืนยันแล้ว → priceSource confirmed
  assert.equal(componentFillFromRevision(rev, { confirmed: true }).priceSource, 'confirmed');
  assert.equal(componentFillFromRevision(rev, { confirmed: true }).confirmStatus, 'confirmed');
  // per_kg ลงช่อง pricePerKg
  const revKg = { id: 'r2', materialId: 'm2', unitBasis: 'per_kg', pricePerKg: 1200 };
  assert.equal(componentFillFromRevision(revKg).pricePerKg, 1200);
  assert.equal(componentFillFromRevision(revKg).pricePerUnit, null);
  // ไม่มีราคา → null (ไม่เขียนอะไร)
  assert.equal(componentFillFromRevision({ unitBasis: 'per_kg', pricePerKg: null }), null);
});

test('ด่านส่งผู้บริหาร: บรรทัดยังไม่ดึงราคา / คลังไม่มี / รอยืนยัน', () => {
  const opts = { customerId: null, todayIso: today };
  // ยังไม่ดึงราคา แต่คลังมี
  assert.match(
    libraryPricingBlocker([{
      productLabel: 'A',
      components: [{ kind: 'PM', sourceDept: 'PC', label: 'ขวดแก้ว 50ml', required: true, priceStatus: 'pending' }],
    }], materials, opts),
    /ยังไม่ได้ดึงราคา/,
  );
  // คลังไม่มีเลย
  assert.match(
    libraryPricingBlocker([{
      productLabel: 'A',
      components: [{ kind: 'PM', sourceDept: 'PC', label: 'ของแปลก', required: true, priceStatus: 'pending' }],
    }], materials, opts),
    /ยังไม่มีราคาวัสดุ/,
  );
  // ดึงแล้วแต่รอยืนยัน (เกินอายุ)
  assert.match(
    libraryPricingBlocker([{
      productLabel: 'A',
      components: [{
        kind: 'PM', sourceDept: 'PC', label: 'ขวดแก้ว 50ml', required: true,
        priceStatus: 'quoted', pricePerUnit: 10, confirmStatus: 'pending',
      }],
    }], materials, opts),
    /รอ RD\/PC ยืนยัน/,
  );
});

test('ด่านส่งผู้บริหาร: ผ่านเมื่อทุกบรรทัดมีราคาพร้อม', () => {
  const opts = { customerId: null, todayIso: today };
  assert.equal(
    libraryPricingBlocker([{
      productLabel: 'A',
      components: [
        { kind: 'PM', sourceDept: 'PC', label: 'ขวดแก้ว 50ml', required: true, priceStatus: 'quoted', pricePerUnit: 10 },
        { kind: 'labor', sourceDept: null, label: 'ค่าบรรจุ', required: true }, // ภายใน ข้าม
        { kind: 'PM', sourceDept: 'PC', label: 'ไม่บังคับ', required: false, priceStatus: 'pending' }, // ไม่บังคับ ข้าม
      ],
    }], materials, opts),
    null,
  );
});
