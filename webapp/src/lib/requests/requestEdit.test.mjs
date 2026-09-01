import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUEST_EDITABLE_FIELDS, REQUEST_EDIT_PATCH_FIELDS, requestEditError, requestEditPatch,
} from './requestEdit.js';

const owner = { id: 'U1', role: 'ae' };
const other = { id: 'U2', role: 'ae' };
const draft = { id: 'DR-1', status: 'draft', requestedById: 'U1' };

test('เจ้าของแก้ได้ตั้งแต่ร่างจนถึงขั้นดำเนินการ', () => {
  assert.equal(requestEditError(draft, owner), null);
  assert.equal(requestEditError({ ...draft, status: 'pending' }, owner), null);
  /* ⭐ มติผู้ใช้ 2026-09-01: "อีกฝ่าย แก้ไขได้ / กำหนดการ ได้พร้อมกันในสเตจนี้" —
     ขั้นดำเนินการเปิดให้แก้ ไม่ใช่ช่วงที่ใบถูกแช่แข็ง */
  assert.equal(requestEditError({ ...draft, status: 'acknowledged' }, owner), null);
});

/* ⭐ **ฝ่ายที่รับเรื่องไปทำก็แก้ได้** (มติเดียวกัน) — ทั้งสองฝั่งอยู่ในสเตจเดียวกัน
   ใครแก้อะไรลงเธรด/audit อยู่แล้ว (เหตุผลเดียวกับที่เพื่อนร่วมทีมทำแทนกันได้) */
test('ฝ่ายผู้รับเรื่องแก้ได้ทุกขั้นที่เปิดให้แก้ — ไม่ใช่แค่ผู้ขอ', () => {
  const rd = { id: 'U7', role: 'rd', department: 'RD' };
  const toRd = { ...draft, dept: 'RD' };
  assert.equal(requestEditError({ ...toRd, status: 'acknowledged' }, rd), null);
  assert.equal(requestEditError({ ...toRd, status: 'pending' }, rd), null);
  // ฝ่ายอื่นที่ไม่ได้ถือใบนี้ยังแก้ไม่ได้ — สิทธิ์ผูกกับฝ่ายบนใบ ไม่ใช่ "เป็นฝ่ายอะไรก็ได้"
  const pc = { id: 'U8', role: 'rd', department: 'PC' };
  assert.match(requestEditError({ ...toRd, status: 'acknowledged' }, pc), /เฉพาะผู้เปิดคำร้อง/);
});

test('จบแล้วแก้ไม่ได้ — และบอกเหตุผลคนละแบบ', () => {
  // ⚠️ ตอบแล้วยังไม่ถาวร — ต้องชี้ทางออกที่มีจริง (ปุ่ม "ยังไม่จบ")
  assert.match(requestEditError({ ...draft, status: 'answered' }, owner), /ยังไม่จบ/);
  assert.match(requestEditError({ ...draft, status: 'closed' }, owner), /ปิดแล้ว/);
  assert.match(requestEditError({ ...draft, status: 'cancelled' }, owner), /ยกเลิก/);
});

test('คนอื่นแก้ไม่ได้ · superuser แก้ได้ (ท่าเดียวกับ canManageRequest)', () => {
  assert.match(requestEditError(draft, other), /เฉพาะผู้เปิดคำร้อง/);
  assert.equal(requestEditError(draft, { id: 'U9', role: 'admin' }), null);
});

test('รับเฉพาะช่องที่แก้ได้ — ของอื่นที่ยิงมาต้องไม่หลุดเข้า patch', () => {
  const patch = requestEditPatch({
    title: '  ขอ COA ล็อต B  ', body: 'รายละเอียด', requestedDueDate: '2026-09-01',
    urgent: true, urgentReason: 'ลูกค้าออกบูธ',
    // ของที่ห้ามแก้ทางนี้ — เปลี่ยนแล้วกระทบว่าใบผูกกับอะไร
    kind: 'formula_dev', dealId: 'DEAL-9', salesOrderId: 'SO-9', status: 'closed',
    // ⚠️ บรรทัดแก้ได้แล้ว (2026-08-24) แต่ **ไม่ผ่านทางนี้** — มันอยู่คนละตาราง
    // (`dept_request_items`) และเขียนด้วยแผน update/insert/remove ⇒ ต้องไม่หลุดเข้า
    // patch ของหัวใบ ไม่งั้น PostgREST ปฏิเสธทั้งก้อน (คอลัมน์ `items` ไม่มีจริง)
    items: [{}],
  });
  assert.deepEqual(Object.keys(patch).sort(), [...REQUEST_EDIT_PATCH_FIELDS].sort());
  assert.equal(patch.title, 'ขอ COA ล็อต B');
});

test('ยอดที่ขอวางบิลอยู่ในลิสต์ "แก้ได้" แต่ไม่ได้เขียนโดยฟังก์ชันบริสุทธิ์ตัวนี้', () => {
  // ⚠️ ค่าที่ client ส่งมาเชื่อไม่ได้ — handler คิดใหม่จากยอดจริงของใบเสนอราคา
  // (`resolveBillAmount`) · ปล่อยให้ผ่านทางนี้เมื่อไร = วางบิลเกินยอดใบได้
  const extra = REQUEST_EDITABLE_FIELDS.filter((f) => !REQUEST_EDIT_PATCH_FIELDS.includes(f));
  assert.deepEqual([...extra].sort(), ['billAmount', 'billPercent']);
  const patch = requestEditPatch({ title: 'x', billPercent: 50, billAmount: 999999 });
  assert.equal('billAmount' in patch, false);
  assert.equal('billPercent' in patch, false);
});

test('ถอดธงด่วนแล้วเหตุผลต้องถูกล้าง ไม่ใช่ค้างไว้', () => {
  const patch = requestEditPatch({ title: 'x', urgent: false, urgentReason: 'เหตุผลเก่า' });
  assert.equal(patch.urgentReason, null);
});

test('ตัดความยาวด้วยเลขชุดเดียวกับตอนเปิดใบ', () => {
  const patch = requestEditPatch({ title: 'ก'.repeat(300), body: 'ข'.repeat(5000), urgent: true, urgentReason: 'ค'.repeat(900) });
  assert.equal(patch.title.length, 200);
  assert.equal(patch.body.length, 4000);
  assert.equal(patch.urgentReason.length, 500);
});
