// ── ทะเบียนหัวข้อที่ประกอบจากบ้านของแต่ละฝ่าย (P7a) ─────────────────────
//
// ⭐ เทสต์ชุดนี้มีหน้าที่เดียว: **กันไม่ให้การแยกโฟลเดอร์กลายเป็นการแยกกฎ**
// หัวข้อย้ายบ้านได้ แต่ชุดหัวข้อ ฝ่ายเจ้าของ และธงของแต่ละตัวต้องเท่าเดิมเป๊ะ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KINDS_BY_OWNER, REQUEST_KINDS, assertKind } from './registry.js';
import {
  REQUEST_DEPTS, REQUEST_KIND_LIST, kindsForDept, requestKindFamily,
} from '../../master/requestTypes.js';

// ชุดหัวข้อ ณ วันที่แยกโฟลเดอร์ — เพิ่ม/ลบหัวข้อต้องมาแก้ลิสต์นี้ด้วยความตั้งใจ
// ไม่ใช่หลุดไปเพราะ import พลาดแล้วไม่มีใครรู้ว่าหัวข้อหายไปหนึ่งตัว
const EXPECTED = [
  'info', 'document',                                  // ไม่เป็นของฝ่ายไหน
  'scent_dev', 'formula_dev',                          // RD
  'material_eta',                                      // PC
  'billing_doc',                                       // FN
  'site_survey',                                       // TS
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

test('หัวข้อของกลางอยู่ในลิสต์ของทุกฝ่ายที่เปิดใช้ · หัวข้อที่ล็อกฝ่ายอยู่ฝ่ายเดียว', () => {
  for (const dept of REQUEST_DEPTS) {
    const list = kindsForDept(dept);
    for (const kind of KINDS_BY_OWNER.shared) assert.ok(list.includes(kind), `${dept} ต้องมี ${kind}`);
  }
  assert.ok(kindsForDept('RD').includes('scent_dev'));
  // ⚠️ **ขอเอกสารล็อกที่ RD แล้ว** (มติผู้ใช้ 2026-08-08) — เดิมเป็นของกลาง
  assert.ok(kindsForDept('RD').includes('document'));
  assert.ok(!kindsForDept('RD').includes('material_eta'));
  // ⭐ **FN เปิดแล้ว** (มติผู้ใช้ 2026-08-15 · ม-ก) — ต้องมีหัวข้อของตัวเองอย่างน้อยหนึ่ง
  // ไม่งั้นเลือกฝ่ายแล้วเจอลิสต์ว่าง ซึ่งเป็นทางตันที่ไม่มีข้อความอธิบาย
  assert.ok(kindsForDept('FN').includes('billing_doc'));
  assert.ok(!kindsForDept('FN').includes('document'), 'ขอเอกสารของ RD ต้องไม่ปนมาที่บัญชี');
  // ฝ่ายที่ปิดเก็บไว้ก่อนต้องไม่มีหัวข้อให้เปิดใบใหม่เลย — ไม่ใช่มีแต่กดแล้วตกที่ server
  for (const parked of ['PC']) {
    assert.deepEqual(kindsForDept(parked), [], `${parked} ปิดอยู่ ต้องไม่มีหัวข้อ`);
  }
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

test('หัวข้อที่ถูกถอดต้องหายจากทะเบียนทั้งตัว', () => {
  // ⭐ `scent_brief` · `mockup` เคยติดธง `legacy` (อ่านได้ เปิดใบใหม่ไม่ได้) เพราะ
  // ใบเก่าต้องมีป้ายชื่อ · เหตุผลนั้นหมดอายุเมื่อทั้งคู่เหลือ 0 แถวบน prod ⇒ ลบใน 0220
  for (const kind of ['scent_brief', 'mockup']) {
    assert.equal(REQUEST_KINDS[kind], undefined, `${kind} ต้องไม่อยู่ในทะเบียนแล้ว`);
  }
  // ⚠️ ขอราคา F/FB/PM **ถูกถอดทั้งหัวข้อ** ใน mig 0219 (ม-28) — ไม่ใช่ติดธง legacy
  // แต่หายจากทะเบียนไปเลย เพราะราคากลายเป็นขั้นสุดท้ายของสองหัวข้อพัฒนา
  for (const kind of ['price_f', 'price_fb', 'price_pm']) {
    assert.equal(REQUEST_KINDS[kind], undefined, `${kind} ต้องไม่อยู่ในทะเบียนแล้ว`);
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

// ── ข้อความบนฟอร์มเป็นของหัวข้อ ไม่ใช่ของตัวฟอร์ม ────────────────────────
test('ทุกหัวข้อมีข้อความครบทุกช่อง — ไม่มีตัวไหนตกไปใช้ค่ากลางโดยไม่ตั้งใจ', () => {
  const KEYS = ['titleLabel', 'titlePlaceholder', 'bodyLabel', 'bodyPlaceholder'];
  for (const [kind, meta] of Object.entries(REQUEST_KINDS)) {
    for (const key of KEYS) assert.ok(meta.form?.[key], `${kind}: ขาด form.${key}`);
  }
  // หัวข้อที่ยังเปิดใบใหม่ได้ต้องมี placeholder **ของตัวเอง** ไม่ใช่ค่ากลาง
  // (บั๊กเดิม: ข้อความผูกกับ scent_brief/mockup ซึ่งเปิดใบใหม่ไม่ได้แล้ว ⇒ หัวข้อที่
  //  ใช้จริงทุกตัวขึ้น "อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ" เหมือนกันหมด)
  // ข้อความกลางจริง ๆ ใน FORM_DEFAULTS — ไม่ใช่ของหัวข้อไหน
  const GENERIC_BODY = 'อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ';
  for (const dept of REQUEST_DEPTS) {
    for (const kind of kindsForDept(dept)) {
      assert.notEqual(
        REQUEST_KINDS[kind].form.titlePlaceholder, 'สรุปสั้น ๆ ว่าขออะไร',
        `${kind}: ยังใช้ placeholder กลางของชื่อเรื่อง`,
      );
      assert.notEqual(
        REQUEST_KINDS[kind].form.bodyPlaceholder, GENERIC_BODY,
        `${kind}: ยังใช้ placeholder กลางของรายละเอียด`,
      );
    }
  }
});

test('ฟอร์มไม่ตัดสินอะไรจากชื่อหัวข้อเองอีกแล้ว', () => {
  // ⚠️ ratchet: `kind === '...'` ในฟอร์มคือทางที่บั๊กเดิมเข้ามา — หัวข้อใหม่ที่ไม่มีชื่อ
  // อยู่ในเงื่อนไขจะตกไปใช้ค่ากลางโดยไม่มีอะไรเตือน · ทุกอย่างต้องอ่านจากทะเบียน
  const src = readFileSync('src/components/requests/RequestForm.js', 'utf8');
  const hits = src.split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .filter((line) => /\bkind === ["']/.test(line) && !/item\.kind/.test(line));
  assert.deepEqual(hits, []);
});
