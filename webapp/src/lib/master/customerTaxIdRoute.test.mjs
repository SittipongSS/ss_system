// สัญญาของ route ทะเบียนลูกค้าเรื่อง "เลขผู้เสียภาษีห้ามซ้ำ" — handler เรียกตรง ๆ
// ไม่ได้ จึงล็อกด้วยการอ่าน source (แพตเทิร์นเดียวกับ productTaxabilityRoute.test.mjs)
//
// 🐞 บั๊กจริง (วัดจากฐาน 2026-08-30): ด่านกันซ้ำเทียบ `.eq('taxId', digits)` กับ
// **สตริงดิบในคอลัมน์** ส่วนคอลัมน์เก็บตามที่กรอก/นำเข้ามา ⇒ '0-1055-65024-54-3'
// กับ '0105565024543' เป็นคนละค่าสำหรับทั้งด่านนี้และ unique index ของ DB
// ผลคือบริษัทเดียวถูกเปิดสองใบจริง (AR-903 / AR-002 อาเตโพเล่ · AR-863 / AR-906
// แอนตี้ฮีโร่ ที่ศูนย์นำหน้าหายตอนผ่าน Excel) โดยไม่มีอะไรฟ้องสักด่าน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// assertion แบบ "ต้องไม่มี" ต้องดูเฉพาะโค้ดจริง — คอมเมนต์ที่เล่าบั๊กเดิมต้องพูดถึง
// วิธีเก่าได้โดยไม่ทำให้เทสต์แดงเอง
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const createRoute = codeOnly(read('../../app/api/customers/route.js'));
const patchRoute = codeOnly(read('../../app/api/customers/[id]/route.js'));
const lookupRoute = codeOnly(read('../../app/api/customers/by-tax-id/route.js'));
const form = codeOnly(read('../../components/database/CustomerForm.js'));

test('ทุกด่านดึงแถวด้วย taxIdMatchFilter แล้วกรองซ้ำด้วยคีย์', () => {
  for (const [label, src] of [['POST', createRoute], ['PATCH', patchRoute], ['by-tax-id', lookupRoute]]) {
    assert.match(src, /taxIdMatchFilter\(/, `${label} ต้องดึงแถวแบบคลุมรูปที่เก็บต่างกัน`);
    assert.match(src, /splitTaxIdMatches\(|taxIdMatches\(/, `${label} ต้องกรองด้วยคีย์ ไม่ใช่เชื่อผลดิบ`);
  }
});

test('ห้ามกลับไปเทียบ .eq สตริงดิบของคอลัมน์ taxId — รูเดิมที่ปล่อยบริษัทซ้ำเข้ามา', () => {
  for (const [label, src] of [['POST', createRoute], ['PATCH', patchRoute], ['by-tax-id', lookupRoute]]) {
    assert.doesNotMatch(src, /\.eq\(\s*['"]taxId['"]/, `${label} ห้ามเทียบ taxId แบบสตริงตรง ๆ`);
  }
});

test('คีย์ซ้ำ = เลข + สาขา — ทั้งสองครึ่งต้องเทียบแบบ normalize แล้ว', () => {
  for (const [label, src] of [['POST', createRoute], ['PATCH', patchRoute], ['ฟอร์ม', form]]) {
    assert.match(src, /splitTaxIdMatches\(/, `${label} ต้องแยกซ้ำจริง/คนละสาขา`);
  }
  // สาขาเทียบด้วย branchKeyOf ('00000' กับ 'สำนักงานใหญ่' ต้องเป็นสาขาเดียวกัน)
  assert.match(patchRoute, /branchKeyOf\(nextBranch\)\s*!==\s*branchKeyOf\(customer\.branchCode\)/);
});

test('PATCH เช็คซ้ำเมื่อ "คีย์" ขยับ ไม่ใช่สตริงขยับ — ไม่งั้นแถวยุคเก่าแก้ไม่ได้อีกเลย', () => {
  // ฟอร์มส่งค่าที่ normalize แล้วกลับมาเสมอ ⇒ เทียบสตริงดิบจะนับว่า "เปลี่ยนเลข" ทุกครั้ง
  // แล้วใบนั้นไปติดด่านซ้ำ/ด่านรูปแบบของตัวเอง จนบันทึกอะไรไม่ได้เลย
  assert.match(patchRoute, /taxKeyChanged\s*=\s*taxIdKey\(nextTaxId\)\s*!==\s*taxIdKey\(customer\.taxId\)/);
  assert.match(patchRoute, /if\s*\(nextTaxId\s*&&\s*\(taxKeyChanged\s*\|\|\s*reactivating\)\)/);
});

test('ฟอร์มเตือนตอนเลขตรงแต่คนละสาขา — ไม่บล็อก', () => {
  assert.match(form, /taxIdOtherBranchWarning\(otherBranch\)/);
});

test('ใบที่พักใช้ไม่บล็อก แต่การเปิดใช้กลับต้องเช็คซ้ำ', () => {
  // unique ของ mig 0318 เป็น partial เฉพาะใบที่ยังใช้งาน ⇒ ใบที่พักไว้ต้องไม่บล็อก
  // แต่ถ้าไม่เช็คตอนเปิดกลับ ใบที่ถูกพักเพราะยุบซ้ำจะเด้งกลับมาชนใบหลักด้วยสวิตช์เดียว
  assert.match(patchRoute, /reactivating\s*=\s*updates\.isActive === true && customer\.isActive === false/);
  assert.match(patchRoute, /taxKeyChanged \|\| reactivating/);
  // ต้องดึง isActive มาด้วย ไม่งั้นแยกใบที่พักใช้ออกจากใบที่ยังใช้งานไม่ได้
  for (const [label, src] of [['POST', createRoute], ['PATCH', patchRoute]]) {
    assert.match(src, /select\('id, arCode, name, taxId, branchCode, isActive'\)/, `${label} ต้องดึง isActive`);
  }
});

test('เขียนลงฐานผ่าน taxIdStore เสมอ — ห้ามถอดตัวอักษรของเลขต่างชาติทิ้ง', () => {
  assert.match(createRoute, /const taxId = taxIdStore\(body\.taxId\)/);
  assert.match(patchRoute, /updates\.taxId = taxIdStore\(updates\.taxId\)/);
});

test('ด่านรูปแบบ 13 หลักอยู่ทั้งตอนสร้างและตอนแก้ และดูจากที่อยู่ว่าเป็นลูกค้าไทยไหม', () => {
  for (const [label, src] of [['POST', createRoute], ['PATCH', patchRoute]]) {
    assert.match(src, /taxIdFormatError\(/, `${label} ต้องมีด่านรูปแบบ`);
    assert.match(src, /isThaiTaxEntity\(/, `${label} ต้องแยกลูกค้าไทย/ต่างชาติจากที่อยู่`);
  }
});
