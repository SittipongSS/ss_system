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

test('หน่วยขายต้องมีและไม่ยาวเกิน 20 (ตรงกับ CHECK ของ mig 0264)', () => {
  assert.match(normalizeDealValueItems([row({ unit: '  ' })]).error, /หน่วยขาย/);
  assert.match(normalizeDealValueItems([row({ unit: 'ก'.repeat(21) })]).error, /หน่วยขาย/);
});

/* ── ปริมาตร = ขนาดของหนึ่งหน่วยขาย (mig 0265) ─────────────────────────────
   ⚠️ คนละช่องกับ `unit` — ห้ามเข้าสูตรคิดเงินเด็ดขาด (4 ชิ้น × 100 ml ไม่ใช่ยอดขาย) */

test('ปริมาตรไม่เข้าสูตรคิดเงิน', () => {
  const { items, total } = normalizeDealValueItems([row({ volume: 100, volumeUnit: 'ml' })]);
  assert.equal(items[0].volume, 100);
  assert.equal(items[0].volumeUnit, 'ml');
  assert.equal(items[0].amount, 300);   // qty 2 × 150 เท่าเดิม
  assert.equal(total, 300);
});

test('ปริมาตรไม่บังคับ — งานบริการไม่มีขนาด', () => {
  const { items, error } = normalizeDealValueItems([row(), row({ volume: '', volumeUnit: '' })]);
  assert.equal(error, null);
  assert.deepEqual(items.map((item) => item.volume), [null, null]);
  assert.deepEqual(items.map((item) => item.volumeUnit), [null, null]);
});

test('กรอกปริมาตรแล้วต้องมีหน่วย และต้องมากกว่า 0', () => {
  assert.match(normalizeDealValueItems([row({ volume: 100 })]).error, /หน่วยของปริมาตร/);
  assert.match(normalizeDealValueItems([row({ volume: 0, volumeUnit: 'ml' })]).error, /ปริมาตร/);
  assert.match(normalizeDealValueItems([row({ volume: -1, volumeUnit: 'ml' })]).error, /ปริมาตร/);
  // หน่วยลอย ๆ ที่ไม่มีตัวเลข = ทิ้งทั้งคู่ (CHECK ของ mig 0265 บังคับให้ไปด้วยกัน)
  const { items } = normalizeDealValueItems([row({ volume: '', volumeUnit: 'ml' })]);
  assert.equal(items[0].volumeUnit, null);
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
    { seq: 2, categoryCode: '02-001', qty: 1, unit: 'ลัง', unitPrice: 20, note: null, volume: null, volumeUnit: null },
    { seq: 1, categoryCode: '01-002', qty: 2, unit: 'ชิ้น', unitPrice: 10, note: 'ด่วน', volume: 100, volumeUnit: 'ml' },
  ]);
  assert.deepEqual(form.map((item) => item.categoryCode), ['01-002', '02-001']);
  assert.equal(form[0].note, 'ด่วน');
  assert.equal(form[0].volume, 100);
  assert.equal(form[0].volumeUnit, 'ml');
  assert.equal(form[1].note, '');
  // แถวที่ไม่มีขนาด ต้องกลายเป็นช่องว่างของฟอร์ม ไม่ใช่ null (React controlled input)
  assert.equal(form[1].volume, '');
  assert.equal(form[1].volumeUnit, '');
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

// ── หน่วยกับกฎหมวด ต้องตรงกับทะเบียนสินค้า (มติผู้ใช้ 2026-08-21 · mig 0281) ──
// ผู้ใช้ทักว่า "หน่วยและเงื่อนไขหน่วยของดีล ยังไม่เหมือนกับฐานข้อมูล" — เดิมที่นี่รับ
// ข้อความอิสระ ≤20 ตัว ดรอปดาวน์บนจอเป็นสิ่งเดียวที่กันไว้
test('หน่วยขายต้องอยู่ในลิสต์กลาง ไม่ใช่ข้อความอิสระ', () => {
  const bad = normalizeDealValueItems([row({ unit: 'โหล' })]);
  assert.match(bad.error, /หน่วยขาย "โหล" ไม่อยู่ในลิสต์/);
  assert.deepEqual(bad.items, []);
  // คำที่เลิกใช้แล้วก็ต้องไม่ผ่าน ไม่งั้นดีลจะพาคำเก่ากลับเข้าระบบ
  assert.match(normalizeDealValueItems([row({ unit: 'Kg' })]).error, /ไม่อยู่ในลิสต์/);
  assert.equal(normalizeDealValueItems([row({ unit: 'กิโลกรัม' })]).error, null);
});

test('หน่วยปริมาตรต้องอยู่ในลิสต์กลางเช่นกัน', () => {
  const bad = normalizeDealValueItems([row({ volume: 50, volumeUnit: 'oz' })]);
  assert.match(bad.error, /หน่วยปริมาตร "oz" ไม่อยู่ในลิสต์/);
  assert.equal(normalizeDealValueItems([row({ volume: 50, volumeUnit: 'ml' })]).error, null);
});

test('กลุ่ม 03/04 ไม่มีปริมาตร — ล้างเงียบ ๆ ไม่ฟ้อง error', () => {
  // ฟ้อง error ไม่ได้: แถวเก่าที่บันทึกไว้ก่อนกฎนี้ต้องยังเปิดดีลมาแก้เรื่องอื่นได้
  for (const categoryCode of ['03-002', '04-005']) {
    const { items, error } = normalizeDealValueItems([
      row({ categoryCode, volume: 1, volumeUnit: 'package' }),
    ]);
    assert.equal(error, null, categoryCode);
    assert.equal(items[0].volume, null, categoryCode);
    assert.equal(items[0].volumeUnit, null, categoryCode);
  }
});

test('กลุ่ม 01/02 ยังเก็บปริมาตรได้ตามเดิม', () => {
  for (const categoryCode of ['01-002', '02-020']) {
    const { items, error } = normalizeDealValueItems([
      row({ categoryCode, volume: 50, volumeUnit: 'ml' }),
    ]);
    assert.equal(error, null, categoryCode);
    assert.equal(items[0].volume, 50, categoryCode);
    assert.equal(items[0].volumeUnit, 'ml', categoryCode);
  }
});

test('ยอดเงินไม่ขยับเพราะการล้างปริมาตร — ปริมาตรไม่เคยเข้าสูตร', () => {
  const withVol = normalizeDealValueItems([row({ categoryCode: '03-002', volume: 1, volumeUnit: 'package' })]);
  const without = normalizeDealValueItems([row({ categoryCode: '03-002' })]);
  assert.equal(withVol.total, without.total);
});
