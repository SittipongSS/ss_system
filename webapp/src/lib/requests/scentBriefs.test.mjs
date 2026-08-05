// ── บรีฟรายกลิ่น (mig 0213) ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCENT_BRIEFS, briefLinkError, normalizeScentBriefs, scentBriefSummary,
} from './scentBriefs.js';
import { SCENTOTYPE_VALUES, SCENT_PERFORMANCE_VALUES } from './kinds/rd/scentBriefTypes.js';

const ok = { label: 'แนวสดชื่น' };

test('ต้องมีอย่างน้อยหนึ่งก้อน และไม่เกินเพดาน', () => {
  assert.match(normalizeScentBriefs([]).error, /อย่างน้อย 1 ก้อน/);
  const many = Array.from({ length: MAX_SCENT_BRIEFS + 1 }, (_, i) => ({ label: `ก้อน ${i}` }));
  assert.match(normalizeScentBriefs(many).error, /มากเกินไป/);
});

test('⭐ จำนวนบรีฟต้องเท่ากับที่ใบสั่งขายระบุ', () => {
  // จำนวนกลิ่นคือสิ่งที่ลูกค้าจ่ายแล้ว ไม่ใช่ของที่คนกรอกตัดสินเอง
  const three = [ok, { label: 'แนวอบอุ่น' }, { label: 'แนวหวาน' }];
  assert.equal(normalizeScentBriefs(three, { expected: 3 }).error, null);
  assert.match(normalizeScentBriefs(three, { expected: 5 }).error, /ระบุ 5 กลิ่น แต่ส่งบรีฟมา 3/);
  assert.match(normalizeScentBriefs([ok], { expected: 3 }).error, /ระบุ 3 กลิ่น/);
  // ไม่ส่ง expected มา = ไม่บังคับ (ใช้ตอนแก้ร่างที่ยังไม่ผูก SO)
  assert.equal(normalizeScentBriefs(three).error, null);
});

test('ชื่อเรียกบังคับ และซ้ำกันไม่ได้', () => {
  assert.match(normalizeScentBriefs([{}]).error, /ต้องตั้งชื่อเรียก/);
  assert.match(normalizeScentBriefs([ok, { label: 'แนวสดชื่น' }]).error, /ซ้ำกับก้อนก่อนหน้า/);
  // เทียบแบบไม่สนตัวพิมพ์ — "Fresh" กับ "fresh" คนอ่านแยกไม่ออกอยู่ดี
  assert.match(normalizeScentBriefs([{ label: 'Fresh' }, { label: 'fresh' }]).error, /ซ้ำ/);
});

test('Scentotype และ Performance เลือกได้หลายอย่าง · ค่าที่ไม่รู้จักถูกตีกลับ', () => {
  const { briefs, error } = normalizeScentBriefs([{
    ...ok,
    scentotypes: [SCENTOTYPE_VALUES[0], SCENTOTYPE_VALUES[2]],
    performance: SCENT_PERFORMANCE_VALUES,
  }]);
  assert.equal(error, null);
  assert.equal(briefs[0].scentotypes.length, 2);
  assert.equal(briefs[0].performance.length, SCENT_PERFORMANCE_VALUES.length);

  assert.match(normalizeScentBriefs([{ ...ok, scentotypes: ['ไม่มีตัวนี้'] }]).error, /ไม่รู้จัก/);
  assert.match(normalizeScentBriefs([{ ...ok, performance: ['หอมมาก'] }]).error, /ไม่รู้จัก/);
  assert.match(normalizeScentBriefs([{ ...ok, scentotypes: 'cheerer' }]).error, /ต้องเป็นรายการ/);
});

test('เลือกซ้ำตัวเดิมไม่ใช่ข้อมูลผิด — เก็บครั้งเดียว', () => {
  const { briefs } = normalizeScentBriefs([{ ...ok, scentotypes: ['cheerer', 'cheerer'] }]);
  assert.deepEqual(briefs[0].scentotypes, ['cheerer']);
});

test('ความยาวช่องต้องไม่หลวมกว่า CHECK ของ 0213', () => {
  // หลวมกว่า = ได้ error ดิบจาก Postgres แทนข้อความไทยที่บอกว่าต้องแก้ตรงไหน
  assert.match(normalizeScentBriefs([{ ...ok, brief: 'ก'.repeat(4001) }]).error, /ยาวเกิน 4000/);
  assert.match(normalizeScentBriefs([{ ...ok, researchTopic: 'ก'.repeat(501) }]).error, /ยาวเกิน 500/);
  assert.match(normalizeScentBriefs([{ ...ok, inspiration: 'ก'.repeat(2001) }]).error, /ยาวเกิน 2000/);
  assert.match(normalizeScentBriefs([{ ...ok, label: 'ก'.repeat(201) }]).error, /ยาวเกิน 200/);
  // ช่องว่างเก็บเป็น null ไม่ใช่ '' — DB ยอมทั้งคู่ แต่ null อ่านง่ายกว่าตอน query
  assert.equal(normalizeScentBriefs([ok]).briefs[0].brief, null);
});

test('direction ต้องชี้บรีฟที่อยู่ในใบเดียวกันเท่านั้น', () => {
  const mine = [{ id: 'B1' }, { id: 'B2' }];
  assert.equal(briefLinkError('B1', mine), null);
  assert.match(briefLinkError('', mine), /ต้องเลือกว่ากลิ่นตัวนี้ตอบบรีฟก้อนไหน/);
  // ⚠️ ยิงตรงด้วย id ของใบอื่นต้องไม่ผ่าน — ไม่งั้นผูก direction ข้ามลูกค้าได้
  assert.match(briefLinkError('B9', mine), /ไม่ได้อยู่ในคำร้องใบนี้/);
});

test('สรุปหัวใบนับก้อนที่ยังไม่ได้ลงมือ ไม่ใช่ก้อนที่ยังไม่จบ', () => {
  const briefs = [{ id: 'B1' }, { id: 'B2' }, { id: 'B3' }];
  const items = [{ briefId: 'B1' }, { briefId: 'B1' }, { briefId: 'B2' }, { briefId: null }];
  assert.deepEqual(scentBriefSummary(briefs, items), { briefs: 3, directions: 3, untouched: 1 });
  assert.deepEqual(scentBriefSummary([], []), { briefs: 0, directions: 0, untouched: 0 });
});
