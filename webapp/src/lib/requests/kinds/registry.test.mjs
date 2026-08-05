// ── ทะเบียนหัวข้อที่ประกอบจากบ้านของแต่ละฝ่าย (P7a) ─────────────────────
//
// ⭐ เทสต์ชุดนี้มีหน้าที่เดียว: **กันไม่ให้การแยกโฟลเดอร์กลายเป็นการแยกกฎ**
// หัวข้อย้ายบ้านได้ แต่ชุดหัวข้อ ฝ่ายเจ้าของ และธงของแต่ละตัวต้องเท่าเดิมเป๊ะ
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS_BY_OWNER, REQUEST_KINDS, assertKind } from './registry.js';
import {
  REQUEST_DEPTS, REQUEST_KIND_LIST, kindsForDept, requestKindFamily,
} from '../../master/requestTypes.js';

// ชุดหัวข้อ ณ วันที่แยกโฟลเดอร์ — เพิ่ม/ลบหัวข้อต้องมาแก้ลิสต์นี้ด้วยความตั้งใจ
// ไม่ใช่หลุดไปเพราะ import พลาดแล้วไม่มีใครรู้ว่าหัวข้อหายไปหนึ่งตัว
const EXPECTED = [
  'info', 'document',                                  // ไม่เป็นของฝ่ายไหน
  'scent_dev', 'product_dev', 'price_f', 'price_fb',   // RD ที่ยังเปิดใบใหม่ได้
  'scent_brief', 'mockup',                             // RD เลิกใช้แล้ว
  'price_pm', 'material_eta',                          // PC
  'billing_doc',                                       // FN
];

test('ทะเบียนได้หัวข้อครบเท่าเดิม — แยกโฟลเดอร์แล้วต้องไม่มีตัวไหนหล่นหาย', () => {
  assert.deepEqual([...REQUEST_KIND_LIST].sort(), [...EXPECTED].sort());
});

test('ธง dept ต้องตรงกับโฟลเดอร์ที่หัวข้อนั้นอยู่', () => {
  // ⚠️ ผิดข้อนี้ = หัวข้อไปโผล่ในลิสต์ของฝ่ายที่ไม่ได้เป็นเจ้าของมัน ซึ่งคนที่แก้
  // โฟลเดอร์ตัวเองจะมองไม่เห็นเลยว่าทำอะไรพัง
  for (const dept of REQUEST_DEPTS) {
    for (const kind of KINDS_BY_OWNER[dept]) {
      assert.equal(REQUEST_KINDS[kind].dept, dept, `${kind} อยู่โฟลเดอร์ ${dept}`);
    }
  }
  // ของกลางต้องไม่ล็อกฝ่าย — ล็อกเมื่อไรก็หายจากลิสต์ของอีกฝ่ายทันที
  for (const kind of KINDS_BY_OWNER.shared) {
    assert.equal(REQUEST_KINDS[kind].dept, null, `${kind} เป็นของกลาง ห้ามล็อกฝ่าย`);
  }
  // ทุกหัวข้อต้องมีบ้าน — ไม่มีตัวไหนลอยอยู่นอกทั้งสามกอง
  const owned = Object.values(KINDS_BY_OWNER).flat();
  assert.deepEqual([...owned].sort(), [...REQUEST_KIND_LIST].sort());
});

test('ทะเบียนแช่แข็ง — เขียนทับตอนรันไทม์ไม่ได้', () => {
  assert.ok(Object.isFrozen(REQUEST_KINDS));
});

test('หัวข้อของกลางอยู่ในลิสต์ของทุกฝ่าย · หัวข้อที่ล็อกฝ่ายอยู่ฝ่ายเดียว', () => {
  for (const dept of REQUEST_DEPTS) {
    const list = kindsForDept(dept);
    for (const kind of KINDS_BY_OWNER.shared) assert.ok(list.includes(kind), `${dept} ต้องมี ${kind}`);
  }
  assert.ok(kindsForDept('RD').includes('scent_dev'));
  assert.ok(!kindsForDept('PC').includes('scent_dev'));
  assert.ok(kindsForDept('PC').includes('price_pm'));
  assert.ok(!kindsForDept('RD').includes('price_pm'));
});

test('🐞 หัวกลุ่มห้ามโผล่ซ้ำ — ตระกูลต้องติดกันในลิสต์ที่คืนให้ดรอปดาวน์', () => {
  // ของจริงบนจอตอน PR #1003: ฝ่าย RD ได้ "ทั่วไป → งานพัฒนา → ขอราคา → ทั่วไป"
  // เพราะ `สอบถามข้อมูล` อยู่ต้นทะเบียนแต่ `ขอเอกสาร` อยู่ท้าย
  for (const dept of REQUEST_DEPTS) {
    const families = kindsForDept(dept).map(requestKindFamily);
    const seen = new Set();
    let previous = null;
    for (const family of families) {
      if (family === previous) continue;
      assert.ok(!seen.has(family), `${dept}: หัวกลุ่ม "${family}" โผล่ซ้ำ`);
      seen.add(family);
      previous = family;
    }
  }
});

test('หัวข้อที่เลิกใช้ยังอ่านได้ แต่เปิดใบใหม่ไม่ได้', () => {
  for (const kind of ['scent_brief', 'mockup']) {
    assert.ok(REQUEST_KINDS[kind]?.label, `${kind} ต้องยังมีป้ายชื่อให้ใบเก่า`);
    for (const dept of REQUEST_DEPTS) assert.ok(!kindsForDept(dept).includes(kind));
  }
  // ⚠️ ขอราคา F/FB **ยังไม่ใช่ legacy** — แผนสั่งตัด แต่ยังไม่ถอดจนกว่าทางใหม่จะ
  // เดินจริงครบวง · ติดธงเมื่อไรต้องมาแก้เทสต์นี้ด้วยความตั้งใจ
  for (const kind of ['price_f', 'price_fb']) {
    assert.ok(!REQUEST_KINDS[kind].legacy, `${kind} ยังเปิดใบใหม่ได้`);
    assert.ok(kindsForDept('RD').includes(kind));
  }
});

// ── ด่านตอนโหลดต้องยิงจริง ─────────────────────────────────────────────
// ⚠️ หัวข้อที่ประกาศผิดต้องทำให้ **build พัง** ไม่ใช่รอให้มีคนเปิดคำร้องหัวข้อนั้น
// จริงบน prod แล้วค่อยเจอ — บั๊ก #973 (เปิดคำร้องไม่ได้เลยทุกหัวข้อ) เป็นแบบนั้นเป๊ะ
const OK = { key: 'x', label: 'ทดสอบ', scope: 'RQ', dept: null };

test('ด่านทะเบียนรับหัวข้อที่ถูกต้อง', () => {
  assert.doesNotThrow(() => assertKind(OK));
});

test('ด่านทะเบียนตีกลับหัวข้อที่ประกาศผิดทุกแบบ', () => {
  const bad = [
    ['ไม่มี key', { ...OK, key: undefined }],
    ['ไม่มี label', { ...OK, label: undefined }],
    ['ไม่มี scope', { ...OK, scope: undefined }],
    ['ฝ่ายที่ CHECK ไม่รับ', { ...OK, dept: 'PD' }],
    ['needs ที่ไม่มีจริง', { ...OK, needs: ['ลูกค้า'] }],
    ['lineShape ที่ไม่รู้จัก', { ...OK, hasItems: true, lineShape: 'อะไรสักอย่าง' }],
    ['hasTiers โดยไม่มีบรรทัด', { ...OK, hasTiers: true }],
    ['lineShape โดยไม่มีบรรทัด', { ...OK, lineShape: 'document' }],
  ];
  for (const [why, kind] of bad) assert.throws(() => assertKind(kind), undefined, why);
});

test('ด่านทะเบียนจับ key ซ้ำ — สองฝ่ายตั้งชื่อชนกันได้จริงเมื่อแยกโฟลเดอร์แล้ว', () => {
  assert.throws(() => assertKind(OK, new Set(['x'])));
});
