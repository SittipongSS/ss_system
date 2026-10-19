// ── บรีฟรายกลิ่น (mig 0213) ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCENT_BRIEFS, briefHasContent, briefLinkError, briefsDroppedByMerge, defaultBriefLabel, normalizeScentBriefs, scentBriefNameError, switchBriefMode,
} from './scentBriefs.js';
import { SCENT_PERFORMANCE_VALUES } from './kinds/rd/scentBriefTypes.js';

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

test('ชื่อเรียกว่างได้ (เติม "กลิ่นที่ N" ให้) แต่ซ้ำกันไม่ได้', () => {
  // 🐞 เดิมบังคับตั้งชื่อทุกก้อน ⇒ ใบที่ขาย 25 กลิ่นต้องตั้งชื่อครบ 25 ก่อนถึงจะกด
  // บันทึกร่างได้ ทั้งที่ฟอร์มเขียนไว้ว่า "กรอกทีละก้อนได้ ไม่ต้องครบถึงจะบันทึก"
  const blank = normalizeScentBriefs([{}, {}]);
  assert.equal(blank.error, null);
  assert.deepEqual(blank.briefs.map((b) => b.label), ['กลิ่นที่ 1', 'กลิ่นที่ 2']);
  assert.match(normalizeScentBriefs([ok, { label: 'แนวสดชื่น' }]).error, /ซ้ำกับก้อนก่อนหน้า/);
  // เทียบแบบไม่สนตัวพิมพ์ — "Fresh" กับ "fresh" คนอ่านแยกไม่ออกอยู่ดี
  assert.match(normalizeScentBriefs([{ label: 'Fresh' }, { label: 'fresh' }]).error, /ซ้ำ/);
});

test('Performance เลือกได้หลายอย่าง · ค่าที่ไม่รู้จักถูกตีกลับ', () => {
  const { briefs, error } = normalizeScentBriefs([{ ...ok, performance: SCENT_PERFORMANCE_VALUES }]);
  assert.equal(error, null);
  assert.equal(briefs[0].performance.length, SCENT_PERFORMANCE_VALUES.length);

  assert.match(normalizeScentBriefs([{ ...ok, performance: ['หอมมาก'] }]).error, /ไม่รู้จัก/);
  assert.match(normalizeScentBriefs([{ ...ok, performance: 'lasting' }]).error, /ต้องเป็นรายการ/);
});

test('เลือกซ้ำตัวเดิมไม่ใช่ข้อมูลผิด — เก็บครั้งเดียว', () => {
  const { briefs } = normalizeScentBriefs([{ ...ok, performance: ['lasting', 'lasting'] }]);
  assert.deepEqual(briefs[0].performance, ['lasting']);
});

test('ความยาวช่องต้องไม่หลวมกว่า CHECK ของ 0213', () => {
  // หลวมกว่า = ได้ error ดิบจาก Postgres แทนข้อความไทยที่บอกว่าต้องแก้ตรงไหน
  assert.match(normalizeScentBriefs([{ ...ok, brief: 'ก'.repeat(4001) }]).error, /ยาวเกิน 4000/);
  // ⭐ ช่องบรรทัดเดียวแคบกว่า CHECK ได้ (500 → 200 · มติผู้ใช้ 2026-09-11) — ห้ามแค่หลวมกว่า
  assert.match(normalizeScentBriefs([{ ...ok, researchTopic: 'ก'.repeat(201) }]).error, /ยาวเกิน 200/);
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

// ── 2.1.5 Scentotype ถอดแล้ว (มติผู้ใช้ 2026-10-19) ─────────────────────────
// ⚠️ ฟอร์มที่ยังถือบรีฟเก่าไว้ส่ง scentotypes กลับมาได้ — ต้องไม่ตีกลับ (บันทึกใบเก่าไม่ได้)
//    และต้องไม่ส่งต่อ ⇒ API ไม่มีอะไรไปเขียนทับค่าเก่าในฐาน
test('⛔ Scentotype ที่ส่งมาถูกทิ้งเงียบ — ไม่ตีกลับ ไม่ส่งต่อ', () => {
  const { briefs, error } = normalizeScentBriefs([{
    label: 'กลิ่นที่ 1',
    scentotypes: ['cheerer', 'ไม่มีตัวนี้'],
    scentotypeNotes: { cheerer: 'ก'.repeat(500) },
  }], { expected: 1 });
  assert.equal(error, null);
  assert.equal('scentotypes' in briefs[0], false);
  assert.equal('scentotypeNotes' in briefs[0], false);
});

// ── สลับโหมดบรีฟ: รวม ↔ รายกลิ่น (มติผู้ใช้ 2026-08-08) ──────────────────
//
// 🐞 ปุ่มสลับของเดิมเรียก `Array.from({length:n}, () => ({label:''}))` ⇒ **ล้างทุกก้อน
// ทุกครั้ง** แม้แต่ตอนแยก 1 → 3 ซึ่งไม่มีเหตุผลให้ทิ้งอะไรเลย
test('⭐ แยกบรีฟรายกลิ่นต้องคงก้อนแรกไว้ แล้วเติมก้อนว่างให้ครบ', () => {
  const typed = { label: 'แนวสดชื่น', brief: 'ซิตรัส-กรีน', performance: ['lasting'] };
  const next = switchBriefMode([typed], { merge: false, scentCount: 3 });
  assert.equal(next.length, 3);
  assert.deepEqual(next[0], typed, 'ก้อนแรกต้องไม่ถูกแตะ');
  assert.equal(briefHasContent(next[1]), false);
  assert.equal(briefHasContent(next[2]), false);
});

test('รวบเป็นก้อนเดียวเหลือก้อนแรก · ไม่มีใบสั่งขายก็ไม่พัง', () => {
  const list = [{ label: 'ก' }, { label: 'ข' }, { label: 'ค' }];
  assert.deepEqual(switchBriefMode(list, { merge: true }), [{ label: 'ก' }]);
  // ก้อนว่างล้วน → แยกแล้วยังได้ครบจำนวน
  assert.equal(switchBriefMode([], { merge: false, scentCount: 2 }).length, 2);
  // scentCount ที่อ่านไม่ได้ = อย่างน้อยหนึ่งก้อนเสมอ ไม่ใช่ศูนย์ก้อน
  assert.equal(switchBriefMode([], { merge: false, scentCount: null }).length, 1);
});

test('⭐ นับเฉพาะก้อนที่กรอกไว้จริงว่าจะหาย — ก้อนว่างรวบได้เลย ไม่ต้องถาม', () => {
  assert.equal(briefsDroppedByMerge([{ label: 'ก' }, { label: '' }, {}]), 0);
  assert.equal(briefsDroppedByMerge([{ label: 'ก' }, { label: 'ข' }]), 1);
  // ก้อนแรกไม่นับ — มันคือก้อนที่จะเหลืออยู่
  assert.equal(briefsDroppedByMerge([{ brief: 'มีเนื้อ' }]), 0);
});

test('briefHasContent ครอบทุกช่องที่กรอกได้ — ตกช่องไหนช่องนั้นถูกทิ้งเงียบ', () => {
  assert.equal(briefHasContent({}), false);
  assert.equal(briefHasContent({ label: '  ' }), false);
  assert.equal(briefHasContent({ label: 'แนวสดชื่น' }), true);
  assert.equal(briefHasContent({ researchTopic: 'ความคงตัว' }), true);
  assert.equal(briefHasContent({ dislikedNotes: 'มัสก์หนัก' }), true);
  assert.equal(briefHasContent({ performance: ['lasting'] }), true);
  assert.equal(briefHasContent({ performance: [] }), false);
  // ⛔ Scentotype ถอดแล้ว — ค่าเก่าที่ติดมากับบรีฟไม่นับเป็นเนื้อ (ไม่มีจอไหนโชว์)
  assert.equal(briefHasContent({ scentotypes: ['cheerer'], scentotypeNotes: { cheerer: 'สว่าง' } }), false);
});

// ── บังคับตั้งชื่อบรีฟก่อนกดส่ง (มติผู้ใช้ 2026-08-10) ────────────────────
//
// ⚠️ ด่านนี้ต้อง **ไม่** ทำงานตอนร่าง — ฟอร์มปั๊มบล็อกบรีฟตามจำนวนกลิ่นที่ขาย
// แล้วเขียนไว้เองว่า "กรอกทีละก้อนได้ ไม่ต้องครบถึงจะบันทึก" · บังคับตอนร่างคือ
// สิ่งที่ผู้ใช้ทักมาเองเมื่อ 2026-08-09 (ใบขาย 25 กลิ่นต้องตั้งชื่อครบ 25 ก่อนบันทึก)
test('ชื่อบรีฟ: ร่างปล่อยว่างได้ · กดส่งต้องครบ', () => {
  const briefs = [{ label: 'แนวสดชื่น' }, { label: 'กลิ่นที่ 2' }, { label: '' }];
  assert.equal(scentBriefNameError(briefs, { stage: 'draft' }), null);
  assert.equal(scentBriefNameError(briefs), null, 'ไม่ระบุ stage = ถือว่าร่าง');
  const err = scentBriefNameError(briefs, { stage: 'submit' });
  assert.match(err, /ก้อนที่ 2/);
  assert.match(err, /ก้อนที่ 3/);
  assert.doesNotMatch(err, /ก้อนที่ 1/, 'ก้อนที่ตั้งชื่อแล้วต้องไม่ถูกทัก');
});

test('ชื่อบรีฟ: ตั้งครบแล้วผ่าน · ชื่อที่ระบบเติมให้ไม่นับว่าตั้งแล้ว', () => {
  assert.equal(scentBriefNameError([{ label: 'ก' }, { label: 'ข' }], { stage: 'submit' }), null);
  // `กลิ่นที่ N` คือค่าที่ normalizeScentBriefs เติมให้ — ต้องถูกจับได้
  assert.ok(scentBriefNameError([{ label: 'กลิ่นที่ 7' }], { stage: 'submit' }));
  assert.equal(scentBriefNameError([], { stage: 'submit' }), null, 'ไม่มีบรีฟ = ไม่มีอะไรต้องตั้งชื่อ');
});

test('ชื่อบรีฟ: ขึ้นแค่ 3 ก้อนแรกแล้วบอกว่าเหลืออีกกี่ก้อน', () => {
  const many = Array.from({ length: 6 }, () => ({ label: '' }));
  const err = scentBriefNameError(many, { stage: 'submit' });
  assert.match(err, /และอีก 3 ก้อน/);
});

test('รูปแบบชื่อที่เติมให้ ต้องมาจากที่เดียวกับด่านตรวจ', () => {
  // เขียนรูปแบบซ้ำอีกที่เมื่อไร ด่านจะเพี้ยนจากค่าที่เติมจริงโดยไม่มีอะไรฟ้อง
  const { briefs } = normalizeScentBriefs([{ brief: 'x' }, { brief: 'y' }], {});
  assert.equal(briefs[0].label, defaultBriefLabel(0));
  assert.ok(scentBriefNameError(briefs, { stage: 'submit' }), 'ชื่อที่เติมให้ต้องยังนับว่าไม่ได้ตั้ง');
});
