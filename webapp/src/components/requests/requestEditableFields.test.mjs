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
const CALLERS = [
  ['ฟอร์มเปิดคำร้อง', './RequestForm.js'],
  ['หน้ารายละเอียดคำร้อง', '../../app/requests/[id]/page.js'],
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

/* ── บรรทัดก็ต้องแก้ได้ด้วยตารางเดียวกับตอนสร้าง (มติผู้ใช้ 2026-08-24) ──────
   🐞 ที่มา: ใบ "ขอเอกสาร" กด "แก้ไข" แล้วแก้ได้แต่ชื่อเรื่อง/รายละเอียด/วันที่/ด่วน —
   ชนิดเอกสารกับรายละเอียดรายบรรทัด **ไม่มีทางแก้เลยทั้งบนจอและใน API** ทางเดียวคือ
   ลบทั้งใบเปิดใหม่ (ทำได้เฉพาะร่าง) · อาการเดียวกันกับ "ขอใบวางบิล" และ "พัฒนาสูตร"
   ⇒ ตารางบรรทัดถูกยกเป็นของกลาง (`RequestLineFields`) แล้วสองฝั่งเรียกตัวเดียวกัน
   ตามกฎ AGENTS.md เดียวกับช่องหัวใบ */
test('⭐ ตารางบรรทัดต้องเป็นตัวเดียวกันทั้งฝั่งสร้างและฝั่งแก้', () => {
  for (const [label, rel] of CALLERS) {
    assert.match(
      read(rel), /RequestLineFields/,
      `${label} ไม่ได้ใช้ตารางบรรทัดของกลาง — ฝั่งที่ขาดจะกลายเป็นฝั่งที่แก้บรรทัดไม่ได้`,
    );
  }
});

test('⭐ ไม่มีใครวางตารางบรรทัดเองนอกไฟล์กลาง', () => {
  // เรียก `DocumentLines` / `ProductDevLines` ตรง ๆ = เริ่มมีตารางชุดที่สอง
  for (const [label, rel] of CALLERS) {
    const src = read(rel);
    for (const table of ['DocumentLines', 'ProductDevLines']) {
      assert.doesNotMatch(
        src, new RegExp(`<${table}\\b`),
        `${label} วาง <${table}> เอง แทนที่จะใช้ ${SHARED}`,
      );
    }
  }
});

test('⭐ ช่อง "ยอดที่ขอวางบิล" ก็เป็นของกลางตัวเดียวกัน', () => {
  // ช่องบังคับของแท็บ "งาน" ที่เคยแก้ไม่ได้หลังบันทึก — ยกเป็นของกลางพร้อมบรรทัด
  for (const [label, rel] of CALLERS) {
    assert.match(
      read(rel), /RequestBillAmountFields/,
      `${label} ไม่ได้ใช้ช่องยอดที่ขอของกลาง (${SHARED})`,
    );
  }
});

test('ปุ่มแก้เหลือปุ่มเดียว — ไม่มี "แก้แบบฟอร์ม PDR" แยกอีกปุ่ม', () => {
  // มติผู้ใช้ 2026-08-10: คนกดคิดแค่ว่า "จะแก้ใบนี้" ไม่ได้คิดว่าจะแก้ส่วนไหน
  const page = read('../../app/requests/[id]/page.js');
  assert.doesNotMatch(page, /label: "แก้แบบฟอร์ม PDR"/);
  assert.doesNotMatch(page, /label: "แก้ข้อมูลคำร้อง"/);
  assert.match(page, /label: "แก้ไข"/);
});
