import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ── โมดัลนัด × "รายการงาน" บนจอจัดคิว (มติ 2026-09-22) ─────────────────────
   โมดัลเป็นไฟล์ JSX (import ใต้ raw Node ไม่ได้) ⇒ ยามอ่านซอร์ส · ส่วน visitToForm เป็น JS ล้วน
   จึงตัดออกมารันจริงได้ — ตัวนี้คือ body ของ PATCH "ปล่อยขึ้นตาราง" ลัดบนรายการ
   ช่องที่หลุดไปหนึ่งช่อง = ค่านั้นถูกล้างเงียบ ๆ ตอนปล่อย จึงต้องเทสต์ด้วยค่า ไม่ใช่ด้วยตา */
const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const modal = read('./ServiceVisitModal.js');
const picker = read('./CrewLoadPicker.js');
const route = read('../../app/api/service/visits/[id]/route.js');

/* ตัดคอมเมนต์ทิ้ง — คอมเมนต์ที่เล่าประวัติยังใช้คำเก่า ("เข้าคิว") ได้ตามมติ */
const code = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function loadVisitToForm() {
  const empty = modal.match(/const EMPTY = \{[\s\S]*?\n\};/);
  const fn = modal.match(/export function visitToForm\(visit\) \{[\s\S]*?\n\}/);
  assert.ok(empty && fn, 'หา EMPTY / visitToForm ในโมดัลไม่เจอ');
  return new Function(`${empty[0]}\n${fn[0].replace(/^export /, '')}\nreturn { visitToForm, EMPTY };`)();
}

test('visitToForm คืนทุกช่องของฟอร์ม — PATCH ลัดไม่ล้างช่องไหนทิ้ง', () => {
  const { visitToForm, EMPTY } = loadVisitToForm();
  const row = {
    siteId: 'S1', kind: 'inspect', scheduledDate: '2026-09-24', startTime: '09:00:00', endTime: '12:00:00',
    assigneeId: 'U1', assigneeName: 'สมชาย ใจดี', assistantIds: ['U2'], status: 'draft',
    actualDate: null, actualStartTime: null, actualEndTime: null, summary: null, note: 'ฝากกุญแจ รปภ.',
    unableReason: null, code: 'SV-26090014', id: 'V1',
  };
  const form = visitToForm(row);
  assert.deepEqual(Object.keys(form).sort(), Object.keys(EMPTY).sort());
  assert.equal(form.startTime, '09:00');
  assert.equal(form.endTime, '12:00');
  assert.deepEqual(form.assistantIds, ['U2']);
  assert.equal(form.note, 'ฝากกุญแจ รปภ.');
  assert.equal(form.summary, '');
  assert.equal(form.rescheduleReason, '', 'เหตุผลเลื่อนไม่ค้างจากรอบก่อน');
  // ปล่อยลัด = { ...visitToForm(v), status: 'scheduled' } — สถานะทับได้ ช่องอื่นอยู่ครบ
  assert.equal({ ...form, status: 'scheduled' }.status, 'scheduled');
});

test('visitToForm ทนค่าว่าง: ไม่มีใบ = ฟอร์มเปล่า · assistantIds ไม่ใช่อาเรย์ = []', () => {
  const { visitToForm, EMPTY } = loadVisitToForm();
  assert.deepEqual(visitToForm(null), EMPTY);
  assert.deepEqual(visitToForm({ assistantIds: null }).assistantIds, []);
  assert.equal(visitToForm({}).kind, 'refill');
  assert.equal(visitToForm({}).status, 'scheduled');
});

test('โมดัลใช้ visitToForm ตัวเดียวกับที่ export (ไม่มีแมปปิ้งชุดที่สอง)', () => {
  assert.match(modal, /setForm\(visitToForm\(visit\)\)/);
  assert.equal((modal.match(/assistantIds: Array\.isArray\(visit\.assistantIds\)/g) || []).length, 1);
});

test('focusField พาโฟกัสไปช่องที่ขอ — ผ่าน ref ของกล่อง ไม่ใช่ตัวฟังทั้งหน้า', () => {
  assert.match(modal, /<label className=\{styles\.field\} ref=\{dateRef\}>\s*<span>วันที่นัด \*<\/span>/);
  // ช่องผู้รับผิดชอบมีสองทรง (CrewLoadPicker / ดรอปดาวน์) — ref ต้องอยู่ทั้งสองทาง
  assert.equal((modal.match(/ref=\{assigneeRef\}/g) || []).length, 2);
  assert.match(modal, /focusPending === "assignee" \? assigneeRef\.current/);
  assert.match(modal, /focusPending === "scheduledDate" \? dateRef\.current/);
  assert.match(modal, /target\.focus\(/);
  assert.match(modal, /scrollIntoView\(/);
  assert.doesNotMatch(code(modal), /(?:document|window)\.addEventListener/);
  // ⚠️ ไม่ผูกกับ visit — โหลดใหม่ระหว่างเปิดโมดัลต้องไม่ดึงโฟกัสกลับกลางคัน
  assert.match(modal, /setFocusPending\(open && focusField \? focusField : null\);\s*\}, \[open, focusField\]\);/);
});

test('staffLoadFor: มีภาระ = CrewLoadPicker · ไม่มี = ดรอปดาวน์เดิมไม่เปลี่ยน', () => {
  assert.match(modal, /staffLoadFor && form\.scheduledDate \? staffLoadFor\(form\.scheduledDate\) : null/);
  assert.match(modal, /\{dayLoad \? \(\s*<div className=\{`\$\{styles\.field\} \$\{styles\.wide\}`\} ref=\{assigneeRef\}>/);
  assert.match(modal, /<SearchableSelect\s+value=\{form\.assigneeId\}\s+onChange=\{pickTechnician\}[\s\S]*?placeholder="ยังไม่มอบหมาย"\s+ariaLabel="เจ้าหน้าที่ผู้รับผิดชอบ"/);
});

test('CrewLoadPicker: radio จริง · ไม่นับร่าง · โหลดไม่ได้ = ขีด ไม่ใช่ 0', () => {
  const src = code(picker);
  assert.match(src, /type="radio"/);
  assert.match(src, /role="radiogroup"/);
  assert.match(src, /ภาระวันที่ \{dayLabel\(dateIso\)\} — ไม่นับร่าง/);
  assert.match(src, /ยังโหลดภาระไม่ได้ — ตัวเลขว่างไม่ได้แปลว่าว่าง/);
  assert.match(src, /\{known \? row\[col\.key\] : NA\}/);
  assert.match(src, /ยังไม่มอบหมาย/);
  // ⚠️ ห้ามแตะตัวกลางของกล่องลีด
  assert.doesNotMatch(src, /PersonLoadSelect/);
});

test('คำบนจอ: ปล่อย "ขึ้นตาราง" ไม่ใช่ "เข้าคิว" (มติ 2026-09-22 ข้อ 3)', () => {
  const live = code(modal);
  assert.doesNotMatch(live, /เข้าคิว/);
  for (const text of ['ปล่อยขึ้นตาราง', ' — ปล่อยขึ้นตารางได้', ' — ยังขึ้นตารางไม่ได้', 'ข้ามด่านขึ้นตาราง', 'ข้ามด่านและขึ้นตาราง']) {
    assert.ok(live.includes(text), `ขาด "${text}"`);
  }
  assert.match(live, /aria-label="ข้ามด่านขึ้นตาราง"/);
});

test('ข้อความในเธรดของนัด: ปล่อยขึ้นตาราง', () => {
  const live = code(route);
  assert.match(live, /`ข้ามด่านแล้วปล่อยขึ้นตาราง \(ข้าม: \$\{gateTrail\.skipped\.join\(' · '\)\}\) — \$\{gateTrail\.gateOverrideReason\}`/);
  assert.match(live, /'ปล่อยขึ้นตาราง — ด่านครบ'/);
  assert.doesNotMatch(live, /ปล่อยเข้าคิว/);
});
