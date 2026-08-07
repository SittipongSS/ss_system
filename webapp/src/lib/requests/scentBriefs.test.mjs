// ── บรีฟรายกลิ่น (mig 0213) ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCENT_BRIEFS, briefLinkError, normalizeScentBriefs,
} from './scentBriefs.js';
import { SCENTOTYPE_VALUES, SCENT_PERFORMANCE_VALUES } from './kinds/rd/scentBriefTypes.js';

const ok = { label: 'แนวสดชื่น' };

test('ต้องมีอย่างน้อยหนึ่งก้อน และไม่เกินเพดาน', () => {
  assert.match(normalizeScentBriefs([]).error, /อย่างน้อย 1 ก้อน/);
  const many = Array.from({ length: MAX_SCENT_BRIEFS + 1 }, (_, i) => ({ label: `ก้อน ${i}` }));
  assert.match(normalizeScentBriefs(many).error, /มากเกินไป/);
});

test('⭐ จำนวนกลิ่นที่ขายเป็น **เพดาน** ไม่ใช่จำนวนที่ต้องเท่ากัน', () => {
  const three = [ok, { label: 'แนวอบอุ่น' }, { label: 'แนวหวาน' }];
  assert.equal(normalizeScentBriefs(three, { scentCount: 3 }).error, null);
  // ⭐ ซื้อ 3 กลิ่นแต่บอกมาแนวเดียว = บรีฟก้อนเดียว แล้ว RD ส่ง 3 direction จากก้อนนั้น
  // (มติผู้ใช้ — เคสนี้พบบ่อย และระบบรองรับ 1 บรีฟ : หลาย direction อยู่แล้ว)
  assert.equal(normalizeScentBriefs([ok], { scentCount: 3 }).error, null);
  assert.equal(normalizeScentBriefs(three, { scentCount: 5 }).error, null);
  // แต่เกินไม่ได้ — บรีฟที่เกินจำนวนที่ขายคือทางที่ไม่มีใครทำ
  assert.match(normalizeScentBriefs(three, { scentCount: 2 }).error, /ไม่เกิน 2 ก้อน/);
  // ไม่ส่ง scentCount มา = ไม่บังคับ (ใช้ตอนแก้ร่างที่ยังไม่ผูก SO)
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

// ── 2.1.4 Scentotype มีเส้นให้เขียนต่อหลังทุกตัว (mig 0222) ───────────────
test('เก็บข้อความต่อท้าย Scentotype เฉพาะตัวที่ติ๊กไว้', () => {
  const { briefs, error } = normalizeScentBriefs([{
    label: 'กลิ่นที่ 1',
    scentotypes: ['cheerer', 'admirer'],
    // ⚠️ ตัวที่ไม่ได้ติ๊กต้องถูกทิ้ง — ไม่งั้นเหลือข้อมูลผีที่ไม่มีใครเห็นบนจอ
    scentotypeNotes: { cheerer: 'สดใส วัยรุ่น', discoverer: 'ไม่ได้ติ๊ก' },
  }], { expected: 1 });
  assert.equal(error, null);
  assert.deepEqual(briefs[0].scentotypeNotes, { cheerer: 'สดใส วัยรุ่น' });
});

test('ติ๊กแล้วไม่เขียนต่อได้ — กระดาษก็เว้นเส้นไว้ได้', () => {
  const { briefs, error } = normalizeScentBriefs([{
    label: 'กลิ่นที่ 1', scentotypes: ['cheerer'], scentotypeNotes: { cheerer: '  ' },
  }], { expected: 1 });
  assert.equal(error, null);
  assert.deepEqual(briefs[0].scentotypeNotes, {});
});
