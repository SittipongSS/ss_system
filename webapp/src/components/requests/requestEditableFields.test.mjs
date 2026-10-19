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

/* ══ ประเมินจากแบบ งวด 4 (S4 B-4) — ฟอร์มวันเดียว ══════════════════════════════════════════════
   ใบที่เลือก "ประเมินจากแบบ" ไม่มีการนัดเข้าพื้นที่ ⇒ ช่องวันเข้าพื้นที่ + ช่วงเวลา หายทั้งก้อน เหลือวันรับผล
   ⚠️ ไฟล์นี้มี JSX — ราวเทสต์ของรีโปเรนเดอร์ไม่ได้ ⇒ คุมด้วยรูปของซอร์ส (กิ่งที่ห่อแต่ละก้อน) */
const dueFieldsSource = () => {
  const src = read(SHARED);
  const start = src.indexOf('export function RequestDueUrgentFields');
  const end = src.indexOf('\nexport function', start + 1);
  assert.ok(start > -1 && end > start, 'หา RequestDueUrgentFields ไม่เจอ');
  return src.slice(start, end);
};

test('S4: hideDue ซ่อนวันเข้าพื้นที่ + ช่วงเวลาทั้งก้อน · วันรับผลกับความเร่งด่วนยังอยู่ · ค่าตั้งต้น = หน้าตาเดิม', () => {
  const src = dueFieldsSource();
  // ค่าตั้งต้นต้องเป็น "เหมือนวันนี้" — ผู้เรียกที่ไม่รู้จักพร็อพใหม่ได้ markup เดิม
  assert.match(src, /hideDue = false,/);
  assert.match(src, /resultDueHint = null,/);
  const gateAt = src.indexOf('{!hideDue && (');
  assert.ok(gateAt > -1, 'ก้อนวันเข้าพื้นที่ต้องอยู่ใต้กิ่ง !hideDue');
  // ก้อนที่ถูกห่อ = ตั้งแต่กิ่งจนถึงก้อนวันรับผล
  const resultAt = src.indexOf('{resultDueLabel && (');
  assert.ok(resultAt > gateAt, 'วันรับผลต้องอยู่นอก (หลัง) กิ่ง !hideDue');
  const gated = src.slice(gateAt, resultAt);
  assert.match(gated, /\$\{idPrefix\}-due`/, 'ช่องวันเข้าพื้นที่อยู่ในกิ่ง');
  assert.match(gated, /<TimeInput\b/, 'ช่วงเวลาอยู่ในกิ่ง');
  assert.match(gated, /\{dueHint\}/, 'คำอธิบายของวันเข้าพื้นที่อยู่ในกิ่ง');
  const rest = src.slice(resultAt);
  assert.match(rest, /\$\{idPrefix\}-result-due`/, 'วันรับผลไม่ถูกซ่อนด้วย hideDue');
  assert.match(rest, /ความเร่งด่วน/, 'ความเร่งด่วนไม่ถูกซ่อนด้วย hideDue');
  assert.doesNotMatch(rest, /hideDue/, 'hideDue คุมแค่ก้อนแรก');
});

test('S4: resultDueHint แทนประโยคเดิมใต้วันรับผล · ไม่ส่ง = ประโยคเดิมทุกตัวอักษร', () => {
  const src = dueFieldsSource();
  assert.match(
    src,
    /\{resultDueHint \|\| "คนละวันกับวันที่เข้าพื้นที่ — วันนี้คือวันที่ต้องได้ตัวเลขไปเสนอราคา"\}/,
  );
});

test('S4: placeholder ของรายละเอียดเดินตามวิธีที่เลือก — อ่าน requestFormCopy(ทั้งใบ) ไม่ใช่ meta.form ของหัวข้อ', () => {
  const src = read(SHARED);
  const body = src.slice(src.indexOf('export function RequestTitleBodyFields'), src.indexOf('export function RequestDueUrgentFields'));
  assert.match(body, /const copy = requestFormCopy\(value\);/);
  assert.doesNotMatch(body, /requestKindMeta\(kind\)\?\.form/);
});
