// ⭐ คำร้องทุกช่องที่เลือก FG โชว์สองชั้นแบบดรอปดาวน์ FG ของใบเสนอราคา (มติผู้ใช้ 2026-11-26)
// ชั้นบน: รหัส · แบรนด์ · ชื่อหมวด · ชั้นล่าง: ชื่อสินค้า · ปริมาตร — และป้ายที่ server เก็บลงใบ
// (`productRefs[].label`) ต้องเป็นประโยคเดียวกับที่จอโชว์ตอนเลือก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productOptionParts } from '@/lib/master/productIdentity';
import { productOptionDisplay } from '@/components/master/productOption';
import { fgRefLabel } from '@/lib/requests/optionalRefs';

// แถวจริงจาก prod 26/11 (ย่อ) — ชื่อสินค้าซ้ำกับชื่อหมวด แบรนด์จึงเป็นตัวแยก
const diffuser = {
  id: 'P1', fgCode: 'FG-1068-02-001-10224', categoryCode: '02-001',
  brandName: 'ภูมิทินกร', productDescription: 'ระบบกระจายกลิ่น',
  volume: 1, volumeUnit: 'package', categoryName: 'ระบบกระจายกลิ่น',
};
// FG ครึ่งหนึ่งไม่มีชื่อสินค้าและแบรนด์ — เหลือรหัส · หมวด / ปริมาตร
const bare = {
  id: 'P2', fgCode: 'FG-0792-01-004-10282', categoryCode: '01-004',
  brandName: '', productDescription: '', volume: 40, volumeUnit: 'g', categoryName: 'ถุงหอม',
};

test('สองชั้น: บน = รหัส · แบรนด์ · ชื่อหมวด · ล่าง = ชื่อสินค้า · ปริมาตร', () => {
  const parts = productOptionParts(diffuser, { withCategory: true });
  assert.equal(parts.meta, 'FG-1068-02-001-10224 · ภูมิทินกร · ระบบกระจายกลิ่น');
  assert.equal(parts.detail, 'ระบบกระจายกลิ่น · 1 package');
  assert.equal(parts.text, 'FG-1068-02-001-10224 · ภูมิทินกร · ระบบกระจายกลิ่น · ระบบกระจายกลิ่น · 1 package');
  assert.match(parts.search, /ภูมิทินกร/);
});

test('FG ไม่มีชื่อ/แบรนด์ — ไม่มีจุดคั่นลอย ๆ และชื่อหมวดยังบอกว่าเป็นของอะไร', () => {
  const parts = productOptionParts(bare, { withCategory: true });
  assert.equal(parts.meta, 'FG-0792-01-004-10282 · ถุงหอม');
  assert.equal(parts.detail, '40 g');
});

test('ไม่มีชื่อหมวดแปะมา (ทะเบียนหมวดอ่านไม่ได้) = ไม่ขึ้นหมวด ไม่ใช่โชว์รหัสหมวดซ้ำกับรหัส FG', () => {
  const { categoryName, ...noName } = diffuser;
  assert.equal(categoryName, 'ระบบกระจายกลิ่น');
  assert.equal(productOptionParts(noName, { withCategory: true }).meta, 'FG-1068-02-001-10224 · ภูมิทินกร');
});

test('ป้ายที่ server เก็บลงใบ = ประโยคเดียวกับดรอปดาวน์บนจอ', () => {
  assert.equal(fgRefLabel(diffuser), productOptionDisplay(diffuser, { withCategory: true }).text);
  assert.equal(fgRefLabel(null), '');
});

test('ช่องเลือก FG ในคำร้องใช้ตัวเลือกสินค้ามาตรฐานแบบมีชื่อหมวด — ไม่ประกอบป้ายเอง', () => {
  for (const file of ['src/components/requests/DocumentLines.js', 'src/components/requests/RequestForm.js']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /productSelectOptions\([\s\S]{0,400}?\{ withCategory: true \}/, file);
    assert.doesNotMatch(src, /\[fg\.fgCode, fg\.productDescription\]/, `${file} ยังประกอบ "รหัส · ชื่อ" เอง`);
  }
  const refs = readFileSync('src/lib/requests/optionalRefs.js', 'utf8');
  assert.doesNotMatch(refs, /\[fg\.fgCode, fg\.productDescription\]/);
});
