// ── ข้อความในกล่องยืนยัน "รับเรื่อง" (มติเจ้าของ 23/09 — ปุ่มเดียวกันสองหน้า) ───────────────
//
// ⭐ ยกออกจาก `app/requests/[id]/page.js` ให้การ์ดคำร้องบนหน้าจัดคิวใช้ข้อความชุดเดียวกัน
//    ⇒ ล็อกว่าข้อความ **เท่าของเดิมทุกตัวอักษร** ทุกสาขา (ประเมินพื้นที่ · หัวข้ออื่น · PDR สองโหมด · NPD)
//    ค่าที่คาดไว้ลอกมาจากโค้ดเดิมที่ origin/main f2162535
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACKNOWLEDGE_DESK_TOAST, acknowledgeConfirmCopy, acknowledgeDeskNext, acknowledgeDeskToast,
} from './acknowledgeConfirm.js';

const BEFORE_AUTO = new Date('2026-08-15T03:00:00Z'); // ก่อนเดือนที่ระบบออกเลข PDR ให้เอง (2609)
const AUTO = new Date('2026-09-23T03:00:00Z');

test('⭐ ใบประเมินพื้นที่: ขั้นถัดไปคือ "ลงคิวเข้าพื้นที่" (ไม่ใช่ปุ่ม "แจ้งกำหนดส่ง" ที่ไม่มีบนจอ)', () => {
  const copy = acknowledgeConfirmCopy({ kind: 'site_survey', dept: 'TS', docNo: 'AS-26090001' });
  assert.deepEqual(copy, {
    title: 'รับเรื่อง',
    description: 'AS-26090001',
    detail: 'ใบนี้จะเข้าคิวของ TS ทันที และนับเป็นงานที่ TS รับไว้แล้ว'
      + ' · ยังไม่ต้องระบุวันตอนนี้ — ใบจะไปอยู่สถานะ "รอกำหนดส่ง"'
      + ' แล้วกด "ลงคิวเข้าพื้นที่" เมื่อรู้วัน เวลา และเจ้าหน้าที่ที่จะไป',
    confirmLabel: 'รับเรื่อง',
  });
});

test('หัวข้ออื่น: ขั้นถัดไปคือ "แจ้งกำหนดส่ง" · ไม่มีเลขที่ = คำอธิบายว่าง', () => {
  const copy = acknowledgeConfirmCopy({ kind: 'formula_dev', variant: 'standard', dept: 'RD' });
  assert.equal(copy.description, '');
  assert.equal(copy.detail,
    'ใบนี้จะเข้าคิวของ RD ทันที และนับเป็นงานที่ RD รับไว้แล้ว'
    + ' · ยังไม่ต้องระบุวันกำหนดส่งตอนนี้ — ใบจะไปอยู่สถานะ "รอกำหนดส่ง"'
    + ' แล้วกด "แจ้งกำหนดส่ง" เมื่อรู้วันจริง');
  assert.doesNotMatch(copy.detail, /ลงคิวเข้าพื้นที่/);
});

test('ใบ PDR: บอกว่าได้เลขที่เอกสารในจังหวะเดียวกันไหม (สองโหมดตามเดือน)', () => {
  const scent = { kind: 'scent_dev', dept: 'RD', docNo: 'RQ-1' };
  assert.match(acknowledgeConfirmCopy(scent, { now: AUTO }).detail,
    / · ระบบจะออกเลขที่เอกสารของ PDR \(วันที่วันนี้\) ให้ในจังหวะเดียวกัน$/);
  assert.match(acknowledgeConfirmCopy(scent, { now: BEFORE_AUTO }).detail,
    / · เดือนนี้ยังไม่ออกเลขให้เอง — รับเรื่องแล้วกด "กรอกเลขที่เอกสาร" ใส่เลขจากกระดาษ$/);
  // มีเลขแล้ว = ไม่ออกซ้ำ ⇒ บอกทางกรอกเอง (ตรงกับ issuesPdrRefNoOnAcknowledge)
  assert.match(acknowledgeConfirmCopy({ ...scent, pdrRefNo: '230926-001' }, { now: AUTO }).detail, /ยังไม่ออกเลขให้เอง/);
  // ใบประเมินไม่มี PDR — ไม่มีประโยคเรื่องเลข
  assert.doesNotMatch(acknowledgeConfirmCopy({ kind: 'site_survey', dept: 'TS' }, { now: AUTO }).detail, /PDR|เลขที่เอกสาร/);
});

test('พัฒนาสูตร NPD: บอกล่วงหน้าว่าแตกเป็นรายการส่งสูตรกี่รายการ (คู่หมวด × กลิ่นที่ไม่ซ้ำ)', () => {
  const npd = {
    kind: 'formula_dev', variant: 'npd', dept: 'RD', docNo: 'RQ-2',
    targets: [
      { categoryCode: '01', scentId: 'SC-1', size: '50ml' },
      { categoryCode: '01', scentId: 'SC-1', size: '100ml' }, // สเปรย์กลิ่นเดียวหลายขนาด = สูตรเดียว
      { categoryCode: '02', scentId: 'SC-1' },
    ],
    items: [],
  };
  const { detail } = acknowledgeConfirmCopy(npd, { now: AUTO });
  assert.match(detail, / · ระบบจะแตกสินค้าในแบบฟอร์ม PDR เป็นรายการส่งสูตร 2 รายการ \(หนึ่งรายการต่อคู่หมวด × กลิ่น\)$/);
  // ไม่มีคู่ให้แตก = ไม่พูดถึง
  assert.doesNotMatch(acknowledgeConfirmCopy({ ...npd, targets: [] }, { now: AUTO }).detail, /แตกสินค้า/);
});

/* ── งวด S2b: ใบที่ประเมินจากแบบทั้งใบ (งานโต๊ะ) — ไม่มีปุ่ม "ลงคิวเข้าพื้นที่" ให้ไปกด ───────────────
   S2b แก้หลังตรวจจอ S2b-str-ack (มติเจ้าของ): ท่อนแรกของงานโต๊ะไม่พูด "เข้าคิว" แล้ว (ขัดกับ "ไม่ต้องลงคิว" ในประโยคเดียวกัน)
   · ชื่อปุ่มใช้อัญประกาศโค้ง “…” เหมือนข้อความเด้งของใบลงหน้างาน · ใบอื่นทุกใบได้คำเดิมทุกตัวอักษร */
const DESK_NEXT = 'ใบนี้ประเมินจากแบบ ไม่ต้องลงคิวเข้าพื้นที่ · หัวหน้าฝ่ายบริการกด “รับปากวันส่งผล” เมื่อรู้วันส่งผล';

test('⭐ งานโต๊ะ: กล่องยืนยันขึ้นต้น "นับเป็นงานที่ … รับไว้ทันที" แล้วบอกก้าวจริง ("รับปากวันส่งผล" โดยหัวหน้า) · ใบที่ยังต้องมีนัดได้ประโยคเดิมทุกตัวอักษร', () => {
  const base = { kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100345' };
  const desk = { ...base, surveyNeedsVisit: false };
  assert.equal(acknowledgeDeskNext(desk), DESK_NEXT);
  assert.deepEqual(acknowledgeConfirmCopy(desk), {
    title: 'รับเรื่อง',
    description: 'RQ-AS-26100345',
    detail: 'นับเป็นงานที่ TS รับไว้ทันที · ยังไม่ต้องระบุวันตอนนี้ — ใบนี้ประเมินจากแบบ ไม่ต้องลงคิวเข้าพื้นที่'
      + ' · หัวหน้าฝ่ายบริการกด “รับปากวันส่งผล” เมื่อรู้วันส่งผล',
    confirmLabel: 'รับเรื่อง',
  });
  // ประโยคเดียวไม่บอกทั้ง "เข้าคิว" และ "ไม่ต้องลงคิว" · ไม่มีอัญประกาศตรงรอบชื่อปุ่ม
  assert.doesNotMatch(acknowledgeConfirmCopy(desk).detail, /เข้าคิวของ|ลงคิวเข้าพื้นที่"|เจ้าหน้าที่ที่จะไป|"/);
  // false ตรงตัวเท่านั้น — ไม่มีธง / true / null = ใบที่ยังต้องมีนัด (ประโยคเดิมของใบประเมินทุกตัวอักษร)
  const siteGolden = 'ใบนี้จะเข้าคิวของ TS ทันที และนับเป็นงานที่ TS รับไว้แล้ว'
    + ' · ยังไม่ต้องระบุวันตอนนี้ — ใบจะไปอยู่สถานะ "รอกำหนดส่ง"'
    + ' แล้วกด "ลงคิวเข้าพื้นที่" เมื่อรู้วัน เวลา และเจ้าหน้าที่ที่จะไป';
  for (const flag of [undefined, null, true]) {
    const req = { ...base, surveyNeedsVisit: flag };
    assert.equal(acknowledgeDeskNext(req), null);
    assert.equal(acknowledgeConfirmCopy(req).detail, siteGolden);
  }
  // หัวข้อที่ไม่มีสถานที่ไม่เป็นงานโต๊ะ แม้มีธงค้างมา — คำเดิมของหัวข้ออื่นทุกตัวอักษร
  const rd = { kind: 'formula_dev', variant: 'standard', dept: 'RD', surveyNeedsVisit: false };
  assert.equal(acknowledgeDeskNext(rd), null);
  assert.equal(acknowledgeConfirmCopy(rd).detail,
    'ใบนี้จะเข้าคิวของ RD ทันที และนับเป็นงานที่ RD รับไว้แล้ว'
    + ' · ยังไม่ต้องระบุวันกำหนดส่งตอนนี้ — ใบจะไปอยู่สถานะ "รอกำหนดส่ง"'
    + ' แล้วกด "แจ้งกำหนดส่ง" เมื่อรู้วันจริง');
});

/* ── ข้อความเด้งหลังรับเรื่องงานโต๊ะบนหน้าจัดคิว (S2b แก้หลังตรวจจอ S2b-str-ack · planner-q8) ───────────
   การ์ดหายจากรายการทันทีหลังกด ⇒ ข้อความเด้งเป็นร่องรอยเดียว · ยาวราว 120 ตัวอักษร ค่าตั้งต้น 3.6 วินาทีอ่านไม่จบ */
test('⭐ งานโต๊ะ: ข้อความเด้งใช้ประโยคก้าวถัดไปตัวเดียวกับกล่องยืนยัน และค้าง 8 วินาที · ใบอื่นไม่มีข้อความเด้งชุดนี้', () => {
  const desk = { kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100345', surveyNeedsVisit: false };
  assert.equal(ACKNOWLEDGE_DESK_TOAST.duration, 8000);
  assert.deepEqual(acknowledgeDeskToast(desk, 'RQ-AS-26100345'), {
    kind: 'success',
    msg: `รับเรื่อง RQ-AS-26100345 แล้ว — ${DESK_NEXT}`,
    duration: 8000,
  });
  for (const req of [
    { ...desk, surveyNeedsVisit: true },
    { ...desk, surveyNeedsVisit: undefined },
    { kind: 'formula_dev', variant: 'standard', dept: 'RD', surveyNeedsVisit: false },
    null,
  ]) assert.equal(acknowledgeDeskToast(req, 'RQ-1'), null);
});

test('⭐ หน้าจัดคิว: กิ่งงานโต๊ะของข้อความเด้งหลังรับเรื่องมาจาก acknowledgeDeskToast (ค้างนาน) · ข้อความเด้งอื่นไม่เปลี่ยน', () => {
  const page = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');
  const ack = page.match(/const confirmAcknowledge = async \(\) => \{[\s\S]*?\n {2}\};/);
  assert.ok(ack, 'หา confirmAcknowledge ไม่เจอ');
  assert.match(ack[0], /const deskToast = acknowledgeDeskToast\(row\.request, row\.code\);/);
  // คำเตือนจาก server มาก่อนเสมอ · ไม่ใช่งานโต๊ะ = ข้อความ "การ์ดเปลี่ยนเป็น …" เดิม (ไม่มีเวลาของตัวเอง)
  assert.match(ack[0], /setToast\(warning\s*\? \{ kind: "warning", msg: warning, duration: RESPONSE_WARNING_TOAST\.duration \}\s*: deskToast\s*\?\? \{ kind: "success", msg: `รับเรื่อง \$\{row\.code\} แล้ว — การ์ดเปลี่ยนเป็น “\$\{commitDueLabels\(row\.request\)\.action\}”` \}\);/);
  // หน้าไม่ประกอบประโยคงานโต๊ะเอง (ถ้าประกอบเองจะหลุดเวลาค้าง) และไม่ยืดเวลาข้อความเด้งอื่น
  assert.doesNotMatch(page, /acknowledgeDeskNext/);
  assert.doesNotMatch(page, /ACKNOWLEDGE_DESK_TOAST|duration: 8000/);
});
