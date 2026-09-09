// ── ปุ่มที่กดแล้วไม่มีทางสำเร็จ — ปิดห้าจุดรวดเดียว ────────────────────────
//
// ทั้งห้าข้อเป็นสายพันธุ์เดียวกัน: **จอเปิดทางให้กด แต่ปลายทางไม่มีวันรับ**
// ซึ่งแย่กว่าไม่มีปุ่มเลย เพราะผู้ใช้เชื่อว่าทำได้แล้วเสียเวลาไปทั้งรอบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeVisitPayload } from './myVisits.js';
import { normalizeVisitInput } from './rounds.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ══ A · B — "แก้ผลการเข้า" กดแล้ว 409 ทุกครั้ง ═══════════════════════ */

/* 🔴 เซตที่ปุ่มขึ้น = เซตที่ server ปฏิเสธ ทับกันสนิท ⇒ ไม่มีเคสไหนสำเร็จเลย
   (ปุ่มขึ้นเมื่อ isClosedVisit · route ปฏิเสธเมื่อ stamp && isClosedVisit) */
test('🔴 ใบที่ปิดแล้วต้องไม่ส่ง stamp — ไม่งั้น 409 ทุกครั้ง', () => {
  for (const status of ['done', 'partial', 'unable']) {
    const body = closeVisitPayload({ id: 'V1', status }, { summary: 'x' });
    assert.equal(Object.hasOwn(body, 'stamp'), false, status);
    assert.equal(body.summary, 'x');
  }
});

test('ใบที่ยังไม่ปิด ยังประทับเวลาจบให้เหมือนเดิม', () => {
  for (const status of ['scheduled', 'in_progress', 'draft']) {
    assert.equal(closeVisitPayload({ id: 'V1', status }, {}).stamp, 'end', status);
  }
  // ไม่มีนัด = ยังไม่ปิด (fail-open ทางเดิม — ปุ่มนี้ขึ้นเฉพาะเมื่อมีนัดอยู่แล้ว)
  assert.equal(closeVisitPayload(null, {}).stamp, 'end');
});

test('🔴 จอต้องเรียกตัวประกอบ payload ไม่ใช่ยัด stamp เอง', () => {
  const page = code('../../app/service/today/page.js');
  assert.match(page, /closeVisitPayload\(closing, form\)/);
  assert.doesNotMatch(page, /\.\.\.form, stamp: "end"/,
    'ยัด stamp ตรง ๆ = บั๊กเดิมกลับมา');
});

/* ⚠️ ด่านฝั่ง server ต้องอยู่ต่อ — มันกันเวลาจริงไม่ให้ถูกเขียนทับจากผู้เรียกอื่น */
test('ด่าน 409 ของ route ต้องไม่ถูกถอด', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /body\.stamp && isClosedVisit\(before\)/);
});

/* ══ C — ชิป "เข้าไม่ได้" ค้างข้ามใบ ══════════════════════════════════ */

/* 🐞 แผ่นเดียวใช้ซ้ำทุกใบ ⇒ ปิดใบถัดไปเป็น unable ด้วยเหตุผลของใบก่อน เงียบ ๆ
   และใบนั้นถอยกลับขั้นลงคิวไปด้วย (§5E ②) */
test('🔴 เปิดแผ่นปิดงานของใบใหม่ ต้องล้างชิป "เข้าไม่ได้" และเหตุผล', () => {
  const sheet = code('../../components/service/CloseVisitSheet.js');
  const openAt = sheet.indexOf('if (!open || !visit) return;');
  const resetAt = sheet.indexOf('setUnable(false);');
  const formAt = sheet.indexOf('setForm(closeFormDefaults(visit));');
  assert.ok(openAt > 0 && resetAt > openAt, 'ต้องล้างใน effect ที่ทำงานตอนเปิดแผ่น');
  assert.ok(resetAt < formAt, 'ล้างก่อน seed ฟอร์ม — ลำดับเดียวกับของเดิมในบล็อกนั้น');
  assert.match(sheet, /setUnableReason\(""\);/);
});

/* ══ D — โมดัลแก้นัดประเมินบันทึกไม่ได้เลย ════════════════════════════ */

/* 🔴 ตัวตรวจปฏิเสธ kind='survey' เพราะนัดประเมินสร้างมือไม่ได้ · route ส่ง
   existingKind ให้อยู่แล้ว แต่จอไม่ส่ง ⇒ ตายที่ด่านฝั่ง client ก่อนยิง API ด้วยซ้ำ */
test('🔴 แก้นัดประเมินต้องผ่านตัวตรวจ เมื่อส่ง existingKind แบบเดียวกับ route', () => {
  const payload = {
    siteId: 'S1', kind: 'survey', scheduledDate: '2026-09-20', status: 'scheduled',
  };
  assert.match(normalizeVisitInput(payload).error || '', /ประเมินพื้นที่|survey|คำร้อง/,
    'สร้างมือไม่ได้ — ด่านนี้ถูกแล้ว');
  assert.equal(normalizeVisitInput(payload, { existingKind: 'survey' }).error, null);
});

test('🔴 โมดัลต้องส่ง existingKind ตอนแก้ และห้ามส่งตอนสร้าง', () => {
  const modal = code('../../components/service/ServiceVisitModal.js');
  assert.match(modal, /editing && visit\?\.kind \? \{ existingKind: visit\.kind \} : \{\}/);
});

/* ══ E — "ทำไม่ได้" เลือกได้แต่ไม่มีช่องเหตุผล ═══════════════════════ */

test('🔑 ตัวตรวจกลางบังคับเหตุผล ≥10 — จอจึงต้องมีช่องให้กรอก', () => {
  const base = { siteId: 'S1', kind: 'refill', scheduledDate: '2026-09-20', actualDate: '2026-09-20' };
  assert.match(
    normalizeVisitInput({ ...base, status: 'unable' }).error || '',
    /10 ตัวอักษร/,
  );
  assert.equal(
    normalizeVisitInput({ ...base, status: 'unable', unableReason: 'อาคารไม่อนุญาตให้เข้าวันหยุด' }).error,
    null,
  );
});

test('🔴 โมดัลต้องมีช่อง unableReason และขึ้นเฉพาะตอนเลือก "ทำไม่ได้"', () => {
  const modal = code('../../components/service/ServiceVisitModal.js');
  assert.match(modal, /form\.status === "unable" && \(/);
  assert.match(modal, /change\("unableReason"\)/);
  assert.match(modal, /unableReason: visit\.unableReason \|\| ""/,
    'โหมดแก้ต้อง seed ค่าเดิม ไม่ใช่ให้พิมพ์ใหม่ทุกครั้ง');
  // ⚠️ ห้ามเขียนกฎ ≥10 ซ้ำที่จอ — ตัวตรวจกลางบอกอยู่แล้ว สองข้อความของกฎเดียว = ดริฟต์
  assert.doesNotMatch(modal, /unableReason\.trim\(\)\.length < 10/);
});

/* ══ K — ช่างกลายเป็น past author แล้วได้กระดิ่งที่กดไม่ได้ ══════════ */

/* 🔴 notifyThreadUpdate แจกกระดิ่งให้ "คนที่เคยโพสต์" ⇒ ช่างที่ปิดนัดเป็น unable
   ติดกระดิ่งของใบนั้นถาวร และลิงก์พาไป /requests/[id] ที่ role ts เปิดไม่ได้ (403) */
test('🔴 บรรทัด "เข้าไม่ได้" ต้องไม่ผูก authorId ของช่าง', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  const at = route.indexOf("kind: 'unable'");
  assert.ok(at > 0);
  const block = route.slice(at, at + 400);
  assert.match(block, /user: \{ name: user\?\.name \|\| null/);
  assert.doesNotMatch(block, /^\s+user,$/m, 'ส่ง user ทั้งก้อน = authorId ติดกลับมา');
});

/* ⭐ ชื่อยังต้องอยู่ — SA ต้องอ่านออกว่าใครเป็นคนแจ้ง */
test('ชื่อผู้แจ้งยังถูกเก็บไว้ในบรรทัด', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /name: user\?\.name \|\| null, department: user\?\.department \|\| null/);
});
