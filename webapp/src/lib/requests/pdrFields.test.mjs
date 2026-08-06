// ── PDR: สามจอต้องพูดคำเดียวกัน ──────────────────────────────────────────
//
// 🐞 ผู้ใช้ทักมาเอง: "ฟอร์มกรอก · ตอนโชว์รายละเอียด · ตอนแก้ มันไม่เหมือนกันเลย"
// ทั้งสามที่ต่างคนต่างเขียนลิสต์ของตัวเอง แล้วเพี้ยนกันทั้งหัวข้อ ลำดับ และป้ายช่อง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PDR_COLUMNS, PDR_FIELDS, PDR_SECTIONS, pdrFieldText, pdrSectionRows,
} from './pdrFields.js';
import { normalizePdr } from './pdr.js';
import { renderPdrDocument } from './pdrDocument.js';

test('ทะเบียนครอบคลุมคอลัมน์ pdr* ครบทุกตัว — ไม่มีช่องไหนกรอกได้แต่ไม่มีที่แสดง', () => {
  // `normalizePdr` คือฝั่งเขียน · ทะเบียนคือฝั่งอ่าน ⇒ ต้องเป็นชุดเดียวกันเป๊ะ
  const { columns } = normalizePdr({});
  assert.deepEqual([...PDR_COLUMNS].sort(), Object.keys(columns).sort());
  assert.equal(PDR_COLUMNS.length, 21);
});

test('ทุกช่องมีป้ายชื่อ และ key ห้ามซ้ำ', () => {
  const keys = PDR_FIELDS.map((f) => f.key);
  assert.deepEqual(keys, [...new Set(keys)], 'key ซ้ำ = ช่องหลังทับช่องหน้าเงียบ ๆ');
  for (const f of PDR_FIELDS) assert.ok(f.label, `${f.key}: ไม่มีป้ายชื่อ`);
  for (const s of PDR_SECTIONS) assert.ok(s.title && s.fields.length, `${s.key}: หัวข้อไม่ครบ`);
});

// ── ค่าที่พร้อมแสดง ──────────────────────────────────────────────────────
test('🐞 enum ต้องถูกแปลเป็นป้าย — เอกสารเคยพิมพ์ค่าดิบลงกระดาษที่ส่งลูกค้า', () => {
  const req = { pdrRequestType: 'new_product', pdrCustomerKind: 'existing', pdrTexture: 'premium' };
  const text = (key) => pdrFieldText(PDR_FIELDS.find((f) => f.key === key), req);
  assert.equal(text('requestType'), 'New Product');
  assert.equal(text('customerKind'), 'ลูกค้าเก่า');
  assert.equal(text('texture'), 'PREMIUM');

  // ⚠️ ค่าที่ไม่รู้จักต้องคืนค่าดิบ ไม่ใช่ null — ข้อมูลเก่าที่ enum เปลี่ยนไปแล้ว
  // ต้องยังเห็นบนจอ ไม่ใช่หายเงียบจนดูเหมือนไม่เคยกรอก
  assert.equal(pdrFieldText(PDR_FIELDS.find((f) => f.key === 'texture'), { pdrTexture: 'ของเก่า' }), 'ของเก่า');
});

test('ตัวเลขจัดรูปแบบไทย · ช่องว่างคืน null', () => {
  const cost = PDR_FIELDS.find((f) => f.key === 'targetCost');
  assert.equal(pdrFieldText(cost, { pdrTargetCost: 1200 }), '1,200');
  assert.equal(pdrFieldText(cost, { pdrTargetCost: null }), null);
  assert.equal(pdrFieldText(cost, { pdrTargetCost: '   ' }), null);
});

test('ช่องที่ระบบเติมให้อ่านจากแถวคำร้อง ไม่ใช่จากคอลัมน์ pdr*', () => {
  const req = { requestedByName: 'สมชาย', customerName: 'ลูกค้า ก' };
  const ctx = { briefs: [{ id: 'B1' }, { id: 'B2' }] };
  const text = (key) => pdrFieldText(PDR_FIELDS.find((f) => f.key === key), req, ctx);
  assert.equal(text('requester'), 'สมชาย');
  assert.equal(text('customer'), 'ลูกค้า ก');
  assert.equal(text('scentCount'), '2 กลิ่น');
});

test('บนจอซ่อนช่องว่าง · บนเอกสารพิมพ์ครบทุกช่อง', () => {
  const spec = PDR_SECTIONS.find((s) => s.key === 'spec');
  const req = { pdrMoq: '50' };
  assert.deepEqual(pdrSectionRows(spec, req), [['MOQ ที่คาดหวัง', '50']]);
  assert.equal(pdrSectionRows(spec, req, { includeEmpty: true }).length, spec.fields.length);
});

// ── สามจออ่านจากทะเบียนเดียวกันจริงไหม ────────────────────────────────────
//
// ⚠️ ratchet อ่านซอร์ส — ทั้งสามไฟล์เป็น JSX/HTML ที่เรียกในเทสต์ตรง ๆ ไม่ได้
// แต่ "มีลิสต์ของตัวเองหรือเปล่า" ตรวจจากซอร์สได้ และนั่นคือต้นเหตุของบั๊กพอดี
test('⭐ ฟอร์ม · จอแสดง · เอกสาร อ่านป้ายจากทะเบียนเดียวกัน', () => {
  for (const file of [
    'src/components/requests/PdrForm.js',
    'src/components/requests/PdrSummary.js',
    'src/lib/requests/pdrDocument.js',
  ]) {
    assert.match(readFileSync(file, 'utf8'), /from ['"]@\/lib\/requests\/pdrFields['"]/, file);
  }
});

test('⭐ ไม่มีจอไหนเขียนป้ายของตัวเองซ้ำอีก', () => {
  // ป้ายที่เคยเพี้ยนกันจริงในสามจอ — ต้องไม่มีตัวไหนถูกพิมพ์ตายไว้ในไฟล์อื่น
  const DRIFTED = ['Target Cost / Unit', 'ข้อมูลลูกค้าและคำขอ', 'วันที่ต้องการจำหน่ายสินค้า'];
  for (const file of [
    'src/components/requests/PdrForm.js',
    'src/components/requests/PdrSummary.js',
    'src/lib/requests/pdrDocument.js',
  ]) {
    const src = readFileSync(file, 'utf8');
    for (const text of DRIFTED) assert.ok(!src.includes(text), `${file}: ยังมี "${text}"`);
  }
});

test('เอกสารพิมพ์ป้ายไทยของ enum ไม่ใช่รหัสในระบบ', () => {
  const html = renderPdrDocument({
    request: {
      docNo: 'SB-26080001', status: 'acknowledged', customerName: 'ลูกค้า ก',
      pdrRequestType: 'new_product', pdrCustomerKind: 'existing', pdrTexture: 'premium',
    },
    briefs: [],
    company: {},
    form: {},
  });
  for (const raw of ['new_product', 'existing', 'premium']) {
    assert.ok(!html.includes(`>${raw}<`), `เอกสารยังพิมพ์ค่าดิบ "${raw}"`);
  }
  for (const label of ['New Product', 'ลูกค้าเก่า', 'PREMIUM']) {
    assert.ok(html.includes(label), `เอกสารต้องมี "${label}"`);
  }
});
