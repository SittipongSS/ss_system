// ── มูลค่าคาดการณ์ของดีลแบบรายหมวด (mig 0264 — มติผู้ใช้ 2026-08-17) ─────────
//
// สิ่งที่ล็อกไว้ที่นี่คือ "ยอดรวมต้องมาจากแถวเท่านั้น" — ช่องยอดรวมบนฟอร์มถูกล็อก
// ตามมติ ⇒ ถ้าสูตรตรงนี้เพี้ยน จะไม่มีใครแก้ยอดกลับได้เลย
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEAL_VALUE_ITEMS_MAX,
  dealValueItemsToForm,
  dealValueLineAmount,
  dealValueTotal,
  normalizeDealValueItems,
  primaryCategoryCode,
} from './dealValueItems.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const row = (over = {}) => ({ categoryCode: '01-002', qty: 2, unit: 'ชิ้น', unitPrice: 150, ...over });

test('ยอดรวมคือผลบวกของ จำนวน × ราคา/หน่วย ของทุกแถว', () => {
  const { items, total, error } = normalizeDealValueItems([
    row(),
    row({ categoryCode: '02-001', qty: 3, unitPrice: 1000 }),
  ]);
  assert.equal(error, null);
  assert.deepEqual(items.map((item) => item.amount), [300, 3000]);
  assert.equal(total, 3300);
});

/* ปัดรายแถวก่อนบวก — ปัดทีหลังตอนรวมจะได้ยอดที่ไม่เท่ากับผลบวกของตัวเลขที่ผู้ใช้
   เห็นในตาราง (คนละบั๊กกับ floating point ธรรมดา และเถียงกับลูกค้าไม่ได้) */
test('ปัดเงินรายแถวก่อนบวก ยอดรวมจึงตรงกับที่ตาเห็น', () => {
  const { items, total } = normalizeDealValueItems([
    row({ qty: 3, unitPrice: 0.335 }),   // 1.005 → 1.01
    row({ qty: 3, unitPrice: 0.335 }),
  ]);
  assert.deepEqual(items.map((item) => item.amount), [1.01, 1.01]);
  assert.equal(total, 2.02);
});

test('แถวเดียวกันคิดผ่าน dealValueLineAmount / dealValueTotal ได้ผลเท่ากัน', () => {
  assert.equal(dealValueLineAmount(2, 150), 300);
  assert.equal(dealValueTotal([row(), row({ qty: 1, unitPrice: 50 })]), 350);
  // ร่างที่ยังกรอกไม่ครบ (ฟอร์มกำลังพิมพ์) นับเป็น 0 ไม่ใช่ NaN — ยอดพรีวิวต้องไม่พัง
  assert.equal(dealValueTotal([{ qty: '', unitPrice: '' }]), 0);
});

test('ราคา 0 ได้ (ของแถม/ยังไม่เคาะราคา) แต่จำนวนต้องมากกว่า 0', () => {
  assert.equal(normalizeDealValueItems([row({ unitPrice: 0 })]).error, null);
  assert.equal(normalizeDealValueItems([row({ unitPrice: '' })]).total, 0);
  assert.match(normalizeDealValueItems([row({ qty: 0 })]).error, /แถวที่ 1.*จำนวน/);
  assert.match(normalizeDealValueItems([row({ unitPrice: -5 })]).error, /แถวที่ 1.*ติดลบ/);
});

test('ข้อความ error บอกเลขแถวเสมอ — ฟอร์มหลายแถวถ้าไม่บอก คนหาไม่เจอ', () => {
  const { error } = normalizeDealValueItems([row(), row({ categoryCode: '' })]);
  assert.match(error, /แถวที่ 2/);
});

test('รหัสหมวดต้องเป็นรูป MM-TTT เท่านั้น', () => {
  assert.match(normalizeDealValueItems([row({ categoryCode: '01' })]).error, /หมวดสินค้า/);
  assert.match(normalizeDealValueItems([row({ categoryCode: 'AB-CDE' })]).error, /หมวดสินค้า/);
});

test('หน่วยต้องมีและไม่ยาวเกิน 20 (ตรงกับ CHECK ของ mig 0264)', () => {
  assert.match(normalizeDealValueItems([row({ unit: '  ' })]).error, /หน่วย/);
  assert.match(normalizeDealValueItems([row({ unit: 'ก'.repeat(21) })]).error, /หน่วย/);
});

test('จำกัดจำนวนแถว และรับเฉพาะลิสต์', () => {
  const many = Array.from({ length: DEAL_VALUE_ITEMS_MAX + 1 }, () => row());
  assert.match(normalizeDealValueItems(many).error, new RegExp(String(DEAL_VALUE_ITEMS_MAX)));
  assert.match(normalizeDealValueItems({ categoryCode: '01-002' }).error, /ลิสต์/);
  // ไม่ส่งมาเลย = ไม่ใช่ความผิด (ผู้เรียกเก่าที่ยังไม่แตกหมวด)
  assert.deepEqual(normalizeDealValueItems(null), { items: [], total: 0, error: null });
});

test('ลำดับแถวถูกเก็บเป็น seq และแถวแรกคือหมวดของดีล', () => {
  const { items } = normalizeDealValueItems([row({ categoryCode: '03-004' }), row()]);
  assert.deepEqual(items.map((item) => item.seq), [1, 2]);
  assert.equal(primaryCategoryCode(items), '03-004');
  assert.equal(primaryCategoryCode([]), null);
});

test('แถวจากฐานแปลงกลับเป็นร่างของฟอร์มตามลำดับ seq', () => {
  const form = dealValueItemsToForm([
    { seq: 2, categoryCode: '02-001', qty: 1, unit: 'ลัง', unitPrice: 20, note: null },
    { seq: 1, categoryCode: '01-002', qty: 2, unit: 'ชิ้น', unitPrice: 10, note: 'ด่วน' },
  ]);
  assert.deepEqual(form.map((item) => item.categoryCode), ['01-002', '02-001']);
  assert.equal(form[0].note, 'ด่วน');
  assert.equal(form[1].note, '');
});

/* ── ด่านโครงสร้าง: ยอดรวมต้องไม่มีทางถูกพิมพ์ทับ ────────────────────────── */

test('ฟอร์มดีลใช้ตารางรายหมวด ไม่มีช่องเงิน projectValue ให้พิมพ์แล้ว', () => {
  const form = read('src/components/salesPlanning/DealFormFields.js');
  assert.match(form, /import DealValueLines from "@\/components\/salesPlanning\/DealValueLines"/);
  assert.doesNotMatch(form, /set\("projectValue"\)/,
    'ยอดรวมล็อก (มติผู้ใช้ 2026-08-17) — ห้ามมีช่องกรอกยอดกลับมา');
  assert.doesNotMatch(form, /onPatch\(\{ categoryCode/,
    'หมวดของดีลมาจากแถวแรก ไม่ใช่ช่องเดี่ยวบนฟอร์ม');
});

test('ตารางรายหมวดไม่มีช่องกรอกยอดรวม — คิดจากแถวอย่างเดียว', () => {
  const lines = read('src/components/salesPlanning/DealValueLines.js');
  assert.match(lines, /dealValueTotal\(rows\)/);
  const totalBlock = lines.slice(lines.indexOf('styles.totalRow'));
  assert.doesNotMatch(totalBlock, /MoneyInput/, 'ยอดรวมต้องเป็นตัวเลขอ่านอย่างเดียว');
});

test('API คิดยอดจากแถว ไม่เชื่อ projectValue ที่ client ส่งมาเมื่อมีแถว', () => {
  const post = read('src/app/api/sales-planning/deals/route.js');
  assert.match(post, /prepareDealValueItems/);
  assert.match(post, /hasValueItems \? prepared\.projectValue : toMoney\(body\.projectValue\)/);
  assert.match(post, /hasValueItems \? prepared\.categoryCode/,
    'หมวดของดีลต้องมาจากแถวแรกเมื่อมีแถว');

  const patch = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(patch, /wantsValueItems/);
  assert.match(patch, /'categoryCode' in body && !wantsValueItems/,
    'ช่อง categoryCode ดิบต้องไม่ทับหมวดที่มาจากแถว');
});
