// ── ทะเบียนรูปร่างบรรทัด (P7b) ──────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_LINE_SHAPE, LINE_SHAPES, lineShapeLabels, normalizeLinesFor,
} from './lineShapes.js';
import { REQUEST_ITEM_STATUSES, requestItemStatusLabel } from '../statuses.js';
import { REQUEST_KINDS } from './registry.js';

test('ทุกรูปร่างมีป้ายครบทั้งสามสถานะ — ขาดตัวไหนแถวจะขึ้นค่าดิบบนหน้าจอ', () => {
  for (const [key, shape] of Object.entries(LINE_SHAPES)) {
    for (const status of REQUEST_ITEM_STATUSES) {
      assert.ok(shape.labels[status], `${key} ขาดป้ายของ ${status}`);
    }
  }
});

test('ป้ายของบรรทัดวัสดุต้องเหมือนเดิมทุกตัวอักษร (ผู้ใช้เคสขอราคาต้องไม่รู้สึกว่าอะไรเปลี่ยน)', () => {
  assert.deepEqual(lineShapeLabels('material'), {
    pending: 'รอราคา', done: 'ตอบราคาแล้ว', declined: 'ตอบไม่ได้',
  });
  // แถวเก่าบน prod ไม่มี `lineKind` → ต้องถอยมาที่บรรทัดวัสดุ ไม่ใช่ขึ้นค่าดิบ
  assert.equal(DEFAULT_LINE_SHAPE, 'material');
  assert.equal(requestItemStatusLabel('done'), 'ตอบราคาแล้ว');
  assert.equal(requestItemStatusLabel('done', 'ยังไม่มีรูปร่างนี้'), 'ตอบราคาแล้ว');
});

test('ทุกหัวข้อที่มีบรรทัดต้องมีรูปร่างที่ทะเบียนรู้จัก และตรวจบรรทัดได้จริง', () => {
  for (const [kind, meta] of Object.entries(REQUEST_KINDS)) {
    if (!meta.hasItems) continue;
    const shape = LINE_SHAPES[meta.lineShape || DEFAULT_LINE_SHAPE];
    assert.ok(shape, `${kind}: ไม่มีรูปร่าง "${meta.lineShape}" ในทะเบียน`);
    // ⚠️ หัวข้อที่เปิดใบพร้อมบรรทัดได้ **ต้องมีตัวตรวจ** — ไม่มี = client ส่งอะไรมาก็
    // ลงตารางหมด · ต่างจาก `scent_dev` ที่แถวเกิดตอนส่ง ไม่ได้มาจากฟอร์ม
    assert.ok(shape.normalize, `${kind}: รูปร่าง "${shape.key}" ไม่มีตัวตรวจ`);
  }
});

test('รูปร่างที่ไม่มีตัวตรวจต้องตีกลับ ไม่ใช่ถอยไปใช้บรรทัดวัสดุ', () => {
  // `scent_dev` มีป้ายแต่ไม่มีตัวตรวจ (RD สร้างแถวเองตอนส่ง) — ยิงตรงมาต้องไม่ผ่าน
  assert.match(normalizeLinesFor('scent_dev', [{}]).error, /รับรายการรูปแบบ/);
  assert.match(normalizeLinesFor('ไม่มีรูปร่างนี้', [{}]).error, /รับรายการรูปแบบ/);
  // หัวข้อที่ไม่มีบรรทัดเลย → ผ่านแบบไม่มีรายการ ไม่ใช่ error
  assert.deepEqual(normalizeLinesFor(null, undefined), { items: [], error: null });
});

test('ตัวตรวจของบรรทัดวัสดุยังบังคับว่าชนิดวัสดุต้องตรงกับหัวข้อ', () => {
  // กฎนี้เคยอยู่ใน route — ย้ายมาอยู่กับรูปร่างบรรทัดแล้วต้องยังทำงานเหมือนเดิม
  // ⚠️ ทั้งสองเคสเป็นบรรทัดของฝ่าย RD เหมือนกัน — ไม่งั้นจะไปติดด่าน "รายการต้อง
  // เป็นของฝ่ายเดียวกับหัวคำร้อง" ที่อยู่ก่อนหน้า แล้วเทสต์จะผ่านด้วยเหตุผลผิด
  const rows = [{ materialId: null, label: 'หัวน้ำหอม', kind: 'RM_FB', tiers: [] }];
  const ok = normalizeLinesFor('material', rows, {
    dept: 'RD', hasTiers: false, materialKind: 'RM_FB', kindLabel: 'ขอราคาเนื้อสาร (FB)',
  });
  assert.equal(ok.error, null);

  const off = normalizeLinesFor('material', rows, {
    dept: 'RD', hasTiers: false, materialKind: 'RM_F', kindLabel: 'ขอราคาหัวน้ำหอม (F)',
  });
  assert.match(off.error, /รับได้เฉพาะรายการชนิด RM_F/);
  assert.deepEqual(off.items, []);
});

test('POST /api/sa/requests เลิกตัดสินรูปร่างบรรทัดเอง — ต้องถามทะเบียน', () => {
  // ⚠️ ratchet: ด่านตรวจบรรทัดที่งอกกลับมาใน route คือกฎที่ฝ่ายเจ้าของมองไม่เห็น
  // (เขาแก้โฟลเดอร์ตัวเองแล้วนึกว่าครบ) · ธงสำหรับ **ขั้นเขียนลงตาราง** ยังอยู่ได้
  // เพราะแตะ supabase — ที่ห้ามคือการ **ตรวจ** ซ้ำ
  const src = readFileSync('src/app/api/sa/requests/route.js', 'utf8');
  assert.ok(src.includes('normalizeLinesFor('), 'route ต้องเรียกทะเบียนรูปร่างบรรทัด');
  for (const gone of ['normalizeProductDevItems', 'normalizeDocumentItems', 'normalizeRequestItems']) {
    assert.ok(!src.includes(gone), `route ต้องไม่เรียก ${gone} ตรง ๆ อีก`);
  }
});

test('บรรทัดเอกสารการเงินใช้ตัวตรวจตัวเดียวกับของ RD แต่คนละคำศัพท์', () => {
  // ⚠️ ชุดคำศัพท์ต้อง **ไม่ปนกัน** — RD ขอ "ใบกำกับภาษี" ไม่ได้ และบัญชีขอ IFRA ไม่ได้
  assert.match(normalizeLinesFor('billing_doc', [{ docType: 'ifra' }]).error, /ไม่ถูกต้อง/);
  assert.match(normalizeLinesFor('document', [{ docType: 'tax_invoice' }]).error, /ไม่ถูกต้อง/);

  const ok = normalizeLinesFor('billing_doc', [{ docType: 'tax_invoice' }]);
  assert.equal(ok.error, null);
  assert.equal(ok.items[0].lineKind, 'billing_doc');
  assert.equal(ok.items[0].label, 'ใบกำกับภาษี');

  // กฎที่เหมือนกันทุกข้อต้องยังทำงาน (ตัวตรวจตัวเดียวกันจริง ไม่ใช่ก๊อป)
  assert.match(normalizeLinesFor('billing_doc', [{ docType: 'other' }]).error, /ระบุว่าขอเอกสารอะไร/);
  assert.match(
    normalizeLinesFor('billing_doc', [{ docType: 'invoice' }, { docType: 'invoice' }]).error,
    /ซ้ำกับรายการก่อนหน้า/,
  );
});

test('🔴 CHECK ที่ DB ต้องรู้จักทุกรูปร่างที่ทะเบียนยอมให้บันทึก', () => {
  // ⚠️ **ด่านนี้มีเพราะเกือบพลาดจริง** — แผนบันทึกกำแพงไว้แค่ dept_requests.dept
  // แต่ dept_request_items.lineKind ก็มี CHECK ของตัวเอง (0204) ⇒ ถ้าเพิ่มรูปร่างใน
  // โค้ดแล้วลืม migration จะ **เปิดคำร้องได้แต่บันทึกบรรทัดไม่ได้** ซึ่งพังตอนกดส่ง
  const sql = readFileSync('supabase/migrations/0212_request_dept_fn.sql', 'utf8');
  for (const key of Object.keys(LINE_SHAPES)) {
    assert.ok(sql.includes(`'${key}'`), `0212 ยังไม่รู้จักรูปร่าง "${key}"`);
  }
});
