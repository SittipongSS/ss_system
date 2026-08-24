import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { REQUEST_EDITABLE_FIELDS } from '../../lib/requests/requestEdit.js';

// ── กฎ AGENTS.md ที่ทำให้เป็นเครื่องตรวจได้ ──────────────────────────────
//
// *"ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง — ห้ามเขียนฟอร์มแก้แยกอีกชุด"*
//
// 🐞 โมดัล "แก้ข้อมูลคำร้อง" เคยวางช่องเองครบทุกช่อง ไม่เรียกของกลางเลย แล้วเพี้ยน
// จากฝั่งสร้าง 6 จุดตั้งแต่คอมมิตแรก (รายละเอียดอยู่หัวไฟล์ RequestEditableFields.js)
// กฎที่เป็นแค่ข้อความในเอกสารถูกลืมได้เสมอ — ชุดนี้ทำให้ลืมแล้วแดง
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const SHARED = './RequestEditableFields.js';
const DETAIL_PAGE = '../../app/requests/[id]/page.js';
/* ⚠️ **เหลือผู้เรียกเดียว** (2026-08-24) — หน้ารายละเอียดเลิกประกอบช่องเองแล้ว
   มันเปิด `RequestForm` ตัวเดียวกับหน้าสร้าง ⇒ ช่องกลางมีที่เรียกที่เดียวจริง ๆ
   (ดูเทสต์ "หน้าแก้ = หน้าสร้าง" ข้างล่าง ซึ่งเป็นตัวคุมว่ามันจะไม่งอกกลับมา) */
const CALLERS = [
  ['ฟอร์มคำร้อง (สร้าง + แก้)', './RequestForm.js'],
];

test('⭐ ทั้งฝั่งสร้างและฝั่งแก้ ต้องเรียกช่องจากไฟล์กลางไฟล์เดียวกัน', () => {
  for (const [label, rel] of CALLERS) {
    const src = read(rel);
    assert.match(
      src, /RequestEditableFields/,
      `${label} ไม่ได้ import ช่องกลาง — ถ้าวางช่องเองจะเพี้ยนจากอีกฝั่งภายในไม่กี่เดือน`,
    );
  }
});

test('⭐ ไม่มีใครวางช่องที่แก้ได้เองซ้ำนอกไฟล์กลาง', () => {
  const shared = read(SHARED);
  // ทุกช่องใน REQUEST_EDITABLE_FIELDS ต้องถูกผูกอยู่ในไฟล์กลาง
  for (const field of REQUEST_EDITABLE_FIELDS) {
    assert.match(shared, new RegExp(`\\b${field}\\b`), `ไฟล์กลางไม่มีช่อง "${field}"`);
  }
  // และผู้เรียกต้องไม่ประกาศ setter ของช่องเหล่านั้นเอง
  // (`set({ title: ... })` / `setEditDraft({ ...x, title: ... })` = วางช่องเอง)
  for (const [label, rel] of CALLERS) {
    const src = read(rel);
    for (const field of REQUEST_EDITABLE_FIELDS) {
      const handRolled = new RegExp(`(set|setEditDraft)\\(\\{[^}]*\\b${field}:\\s*e\\.target`, 's');
      assert.doesNotMatch(
        src, handRolled,
        `${label} ผูกช่อง "${field}" เองแทนที่จะใช้ของกลาง (${SHARED})`,
      );
    }
  }
});

test('ช่องที่กางบนจอต้องเท่ากับด่านของ API เป๊ะ', () => {
  // ⚠️ ลิสต์นี้เป็นด่านของ API ด้วย (`requestEditPatch` + handler ของ action 'update')
  // — กางช่องบนจอที่ไม่มีในลิสต์ = ผู้ใช้พิมพ์แล้วหายเงียบตอนบันทึก
  assert.deepEqual(
    [...REQUEST_EDITABLE_FIELDS].sort(),
    ['billAmount', 'billPercent', 'body', 'requestedDueDate', 'title', 'urgent', 'urgentReason'],
  );
});

/* ── หน้าแก้ = หน้าสร้าง ไม่ใช่แค่ "ใช้ช่องร่วมกัน" (มติผู้ใช้ 2026-08-24) ──────
   ผู้ใช้ทัก: *"หน้าแก้ ไม่เหมือนหน้าสร้างหรอ … ในทุกๆหัวข้อ ตามกฎ สร้างเหมือนกับแก้"*

   🐞 รอบก่อนหน้าแก้ครึ่งเดียว: ยกแค่ *ช่อง* เป็นของกลางแล้วให้หน้ารายละเอียด
   **ประกอบผังของตัวเอง** ⇒ ยังได้ฟอร์มที่ไม่มีแท็บ ไม่มีเกจ "ยังขาดอะไร" และลำดับ
   ช่องคนละแบบกับที่คนเพิ่งกรอกมาตอนเปิดใบ · แบบฟอร์ม PDR ก็ถูกวาดแยกอีกที่หนึ่ง
   ⇒ กฎ AGENTS.md อ่านตรง ๆ คือ **ฟอร์มเดียวกัน ต่างกันแค่ props** ไม่ใช่ชิ้นส่วนเดียวกัน
   ⇒ เทสต์จึงเลื่อนขึ้นมาคุมที่ "ใครเป็นคนวาดฟอร์ม" แทนที่จะคุมรายช่อง */
test('⭐ หน้ารายละเอียดต้องเปิด `RequestForm` ตัวเดียวกับหน้าสร้าง ไม่ใช่ประกอบผังเอง', () => {
  const page = read(DETAIL_PAGE);
  assert.match(page, /<RequestForm\b/, 'หน้ารายละเอียดไม่ได้เปิดฟอร์มตัวเดียวกับตอนสร้าง');
  assert.match(page, /mode="edit"/, 'ต้องเปิดเป็นโหมดแก้ (props ต่าง ไม่ใช่คนละฟอร์ม)');
});

test('⭐ หน้ารายละเอียดต้องไม่ประกอบช่อง/ตารางของฟอร์มเอง', () => {
  /* ⚠️ ทุกตัวในลิสต์นี้เคยถูกวางตรง ๆ บนหน้ารายละเอียดมาแล้ว — วางกลับมาเมื่อไร
     ก็แปลว่ามีผังที่สองงอกขึ้น ซึ่งเป็นอาการที่มติข้อนี้สั่งให้เลิก */
  const page = read(DETAIL_PAGE);
  for (const part of [
    'RequestTitleBodyFields', 'RequestDueUrgentFields', 'RequestLineFields',
    'RequestBillAmountFields', 'DocumentLines', 'ProductDevLines', 'PdrForm',
  ]) {
    assert.doesNotMatch(
      page, new RegExp(`<${part}\\b`),
      `หน้ารายละเอียดวาง <${part}> เอง — ต้องให้ RequestForm เป็นคนวาด`,
    );
  }
});

test('⭐ ฟอร์มกลางต้องวางช่องของกลางครบทุกก้อน — ฝั่งแก้ได้ของครบเพราะใช้ฟอร์มเดียวกัน', () => {
  const form = read('./RequestForm.js');
  for (const part of [
    'RequestTitleBodyFields', 'RequestDueUrgentFields',
    'RequestLineFields', 'RequestBillAmountFields',
  ]) {
    assert.match(form, new RegExp(`<${part}\\b`), `RequestForm ขาด <${part}>`);
  }
});

test('ปุ่มแก้เหลือปุ่มเดียว — ไม่มี "แก้แบบฟอร์ม PDR" แยกอีกปุ่ม', () => {
  // มติผู้ใช้ 2026-08-10: คนกดคิดแค่ว่า "จะแก้ใบนี้" ไม่ได้คิดว่าจะแก้ส่วนไหน
  const page = read(DETAIL_PAGE);
  assert.doesNotMatch(page, /label: "แก้แบบฟอร์ม PDR"/);
  assert.doesNotMatch(page, /label: "แก้ข้อมูลคำร้อง"/);
  assert.match(page, /label: "แก้ไข"/);
});
