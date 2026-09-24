// ── "ตอบแล้ว" ทางเดียวของใบประเมินพื้นที่ = "ส่งผล" (มติเจ้าของ 24/09 ข้อ 1) ──────────
//
// 🐞 ปุ่ม "ตอบแล้ว" กลางของหน้าคำร้องไม่รู้จักด่านหกข้อ (ขนาด · รูป · จุด · แพ็คเกจ) และไม่ปิดนัด
//   ⇒ Planner/หัวหน้าขายเคยทำให้ใบที่ยังไม่มีขนาดสักพื้นที่เป็น "ตอบแล้ว" ได้ · ฝ่ายขายได้กระดิ่ง · จอประเมินล็อก
// ⭐ ยามสองชั้น: ตัวตัดสิน (`genericAnswerError`) + ซอร์สของ route/หน้า ที่ต้องถามตัวตัดสินนี้จริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANSWER_VIA, answerViaBlockedReason, genericAnswerError, requestAnswerVia } from './answerVia.js';
import { reopenRequestError } from './closure.js';
import { VALID_ANSWER_VIA } from './kinds/registry.js';
import { surveyFieldDoneHref } from '../service/surveyFieldDoneNotify.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('🔴 ใบประเมินพื้นที่: ปุ่มกลางใช้ไม่ได้ พร้อมเหตุผลที่ชี้ปุ่มส่งผล · หัวข้ออื่นใช้ได้ตามเดิม', () => {
  const err = genericAnswerError({ id: 'DR-1', kind: 'site_survey' });
  assert.match(err, /ตอบได้ทางเดียว/);
  assert.match(err, /“ส่งผลให้ฝ่ายขาย”/);
  for (const kind of ['info', 'document', 'scent_dev', 'formula_dev', 'billing_doc', null, 'ไม่มีหัวข้อนี้']) {
    assert.equal(genericAnswerError({ id: 'DR-1', kind }), null, String(kind));
    assert.equal(requestAnswerVia({ id: 'DR-1', kind }), null, String(kind));
  }
});

test('ทุกค่าที่ทะเบียนรับ มีทางพาไปจริง (ป้าย · ลิงก์ · สิทธิ์ · เหตุผล) และไม่มีทางที่ทะเบียนไม่รู้จัก', () => {
  assert.deepEqual(Object.keys(ANSWER_VIA).sort(), [...VALID_ANSWER_VIA].sort());
  for (const [key, via] of Object.entries(ANSWER_VIA)) {
    assert.ok(via.label && via.hint && via.refusal, key);
    assert.equal(typeof via.href, 'function', key);
    assert.equal(typeof via.canUse, 'function', key);
  }
});

test('⭐ ลิงก์ไปแท็บสรุปส่งผล — ปลายทางเดียวกับกระดิ่ง "ช่างส่งงานแล้ว" · ลิงก์ขึ้นเฉพาะคนที่กดส่งผลได้', () => {
  const via = requestAnswerVia({ id: 'DR-9', kind: 'site_survey' });
  assert.equal(via.href, surveyFieldDoneHref('DR-9'));
  assert.equal(via.label, 'ไปส่งผลที่ใบประเมิน');
  assert.equal(via.canUse({ role: 'ts_manager' }), true);
  assert.equal(via.canUse({ role: 'ts_senior' }), true);
  assert.equal(via.canUse({ role: 'admin' }), true);
  // Planner / ช่าง / หัวหน้าขาย กดส่งผลไม่ได้ ⇒ ไม่มีลิงก์ (ไม่มีสิทธิ์ = ไม่โชว์)
  for (const role of ['ts_planner', 'ts', 'ae_supervisor', 'sales']) {
    assert.equal(via.canUse({ role }), false, role);
  }
});

test('🐞 PATCH action=answer ถามตัวตัดสินเดียวกัน **ก่อนเขียน** และตอบ 409', () => {
  const route = code('../../app/api/sa/requests/[id]/route.js');
  const branch = route.slice(route.indexOf("action === 'answer'"), route.indexOf("action === 'close'"));
  const guard = branch.indexOf('genericAnswerError(before)');
  assert.ok(guard > 0, 'ต้องถาม genericAnswerError ในก้อน answer');
  assert.ok(guard < branch.indexOf('patch.answeredAt = nowIso'), 'ต้องปฏิเสธก่อนประกอบ patch');
  assert.match(branch.slice(guard, guard + 200), /status: 409/);
});

test('ไฟล์นี้ต้องอยู่ฝั่งจอได้ — ห้ามลาก notifications/next/server เข้ามา (หน้าคำร้องเป็น client)', () => {
  const src = readFileSync(new URL('./answerVia.js', import.meta.url), 'utf8');
  const imports = src.match(/^import .* from '([^']+)';$/gm) || [];
  assert.deepEqual(imports.map((l) => l.match(/from '([^']+)'/)[1]).sort(), [
    '@/lib/master/requestTypes', '@/lib/permissions', '@/lib/requests/closure', '@/lib/requests/replyTurn',
  ]);
});

// ── หน้าคำร้อง: ปุ่ม "ตอบแล้ว" กลางหายสำหรับหัวข้อนี้ · แทนด้วยลิงก์ไปการ์ดส่งผล (มติเจ้าของ 24/09 ข้อ 1) ────
/* 🐞 ก่อนแก้ หัวหน้าขาย/Planner เห็นปุ่ม "ตอบแล้ว" บนใบประเมินแล้วกดได้ — ตอนนี้ server ตีกลับ 409 แล้ว
   ⇒ ปุ่มที่ยังโชว์คือปุ่มที่กดแล้วเจอ error · ต้องหายทั้งปุ่มหลักและเมนูรอง (ทั้งสองถาม `canMarkAnswered`) */
test('🔴 หน้าคำร้อง: `canMarkAnswered` ถาม `genericAnswerError` — ปุ่มหลักและเมนู "ตอบแล้ว" หายไปพร้อมกัน', () => {
  const page = code('../../app/requests/[id]/page.js');
  const gate = page.slice(page.indexOf('const canMarkAnswered ='), page.indexOf('const npdAnswerBlocker'));
  assert.match(gate, /&& !genericAnswerError\(req\);/);
  // ทั้งสองที่ที่วาด "ตอบแล้ว" ต้องผ่าน `canMarkAnswered` ตัวเดียวนี้ (ไม่มีทางอ้อม)
  const answerMenu = page.slice(page.indexOf('id: "answer",\n        label: closure.requesterDone'));
  assert.match(answerMenu.slice(0, 900), /visible: \(canMarkAnswered \|\| !!npdAnswerBlocker\)/);
});

test('⭐ ลิงก์ "ไปส่งผลที่ใบประเมิน" แทนที่ "ตอบแล้ว" — เฉพาะคนที่กดส่งผลได้ · ตำแหน่งเดียวกับปุ่มที่มันแทน', () => {
  const page = code('../../app/requests/[id]/page.js');
  const def = page.slice(page.indexOf('const answerViaAction ='), page.indexOf('const npdAnswerBlocker'));
  assert.match(def, /answerVia\?\.href && answerVia\.canUse\(me\)/, 'ไม่มีสิทธิ์ส่งผล = ไม่โชว์ลิงก์');
  assert.match(def, /owner && !answerRequestError\(req\) && !closure\.deptDone/, 'ด่านชุดเดียวกับปุ่ม "ตอบแล้ว" เดิม');
  assert.match(def, /id: "answer-via"/);
  assert.match(def, /kind: "open"/);
  assert.match(def, /href: answerVia\.href/);
  // ปุ่มหลัก: หลัง "ลงคิว/แจ้งกำหนดส่ง" · ก่อน "ตอบแล้ว"
  const chain = page.slice(page.indexOf('const primaryAction = editing'));
  const commitDue = chain.indexOf('id: "commit-due"');
  const via = chain.indexOf(': answerViaAction\n        ? answerViaAction');
  const answer = chain.indexOf(': canMarkAnswered\n        ? {');
  assert.ok(commitDue > 0 && via > commitDue && answer > via, 'ลำดับ: ลงคิว → ไปส่งผล → ตอบแล้ว');
  // เมนูรอง: คู่ของเมนู "ตอบแล้ว" ตอนปุ่มหลักเป็นลงคิว/แจ้งกำหนดส่ง
  assert.match(page, /\.\.\.\(answerViaAction \|\| \{ id: "answer-via" \}\),\s*visible: !!answerViaAction && primaryAction\?\.id === "commit-due"/);
});

test('ลิงก์ส่งผลมีเฉพาะหัวข้อที่ประกาศทางตอบ — หัวข้ออื่นไม่มีลิงก์และปุ่ม "ตอบแล้ว" ไม่ถูกแตะ', () => {
  for (const kind of ['info', 'document', 'scent_dev', 'formula_dev', 'billing_doc']) {
    assert.equal(requestAnswerVia({ id: 'DR-1', kind }), null, kind);
  }
  // ใบประเมินที่ยังไม่มี id (ฟอร์มสร้าง) ไม่มีลิงก์ให้ประกอบ — ลิงก์ว่างต้องไม่ถูกวาด
  assert.equal(requestAnswerVia({ kind: 'site_survey' }).href, null);
});

/* 🐞 รีวิว 24/09 — ใบประเมินที่ฝ่ายขายกด "ปิดเรื่อง" ไปก่อนมติข้อ 3 (closedAt มี · answeredAt ว่าง · ใบยัง acknowledged)
   หน้าคำร้องขึ้นลิงก์ "ไปส่งผลที่ใบประเมิน" เป็นปุ่มหลักสด ๆ แต่ปลายทางล็อก ไม่มีปุ่มส่งผล และบอกให้ "เปิดใบใหม่"
   ⇒ ลิงก์ต้องจางพร้อมเหตุที่ชี้ปุ่ม "ยังไม่จบ" ซึ่งเปิดใบกลับได้จริง */
const earlyClosed = (over = {}) => ({
  id: 'DR-7', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged',
  acknowledgedAt: '2026-09-18T02:00:00Z', answeredAt: null, closedAt: '2026-09-19T02:00:00Z', ...over,
});

test('🔴 ผู้ขอปิดไปก่อนได้ผล = ทางตอบติดด่าน พร้อมเหตุที่ชี้ "ยังไม่จบ" (ปุ่มที่เปิดใบกลับได้จริง)', () => {
  const reason = answerViaBlockedReason(earlyClosed());
  assert.equal(reason, 'SA ปิดเรื่องไปก่อนได้ผล — ใบประเมินล็อกอยู่ · กด “ยังไม่จบ” เพื่อเปิดใบกลับ แล้วค่อยส่งผลที่ใบประเมิน');
  assert.doesNotMatch(reason, /เปิดใบใหม่/);
  assert.equal(reopenRequestError(earlyClosed(), { reason: 'x' }), null, 'ทางออกที่ประโยคชี้ต้องเปิดอยู่จริง');
});

test('ทางตอบไม่ติดด่านนี้: ยังไม่มีใครปิด · ส่งผลแล้ว · ใบจบถาวร/ยกเลิก · หัวข้อที่ไม่มีทางตอบเฉพาะ', () => {
  assert.equal(answerViaBlockedReason(earlyClosed({ closedAt: null })), null);
  assert.equal(answerViaBlockedReason(earlyClosed({ answeredAt: '2026-09-20T02:00:00Z', status: 'closed' })), null);
  assert.equal(answerViaBlockedReason(earlyClosed({ status: 'closed' })), null, 'ปิดใบโดยไม่ได้ประเมิน — เปิดกลับไม่ได้');
  assert.equal(answerViaBlockedReason(earlyClosed({ status: 'cancelled', cancelledAt: 'x' })), null);
  assert.equal(answerViaBlockedReason(earlyClosed({ kind: 'info' })), null);
  assert.equal(answerViaBlockedReason(null), null);
});

test('⭐ หน้าคำร้อง: ลิงก์ส่งผลจางพร้อมเหตุเมื่อติดด่านนี้ — ไม่ใช่ลิงก์สดที่พาไปทางตัน', () => {
  const page = code('../../app/requests/[id]/page.js');
  assert.match(page, /const answerViaBlocker = answerViaBlockedReason\(req\);/);
  const def = page.slice(page.indexOf('const answerViaAction ='), page.indexOf('const npdAnswerBlocker'));
  assert.match(def,
    /answerViaBlocker\s*\?\s*\{ disabled: true, disabledReason: answerViaBlocker, onClick: \(\) => \{\} \}\s*:\s*\{ href: answerVia\.href \}/);
});
