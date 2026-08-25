// ── ตีกลับอัตโนมัติ (mig 0291 · มติผู้ใช้ 2026-08-25) ───────────────────────
//
// สิ่งที่ต้องล็อก เรียงตามความเสียหายถ้าหลุด:
//   1) **ห้ามแตะใบที่ถึงขั้นนัดแล้ว** — ตีกลับล้าง meetingAt ⇒ ตัวเลขที่ระบบเพิ่ง
//      บันทึกว่า "ทำได้" จะถูกกลไกของระบบเองลบ
//   2) **ต้องมีเพดานรอบ** — ไม่มีตัวนับ = วนไม่รู้จบ (ตีกลับ → คัดเข้าทีมเดิม →
//      มอบคนเดิม → 5 วัน → ตีกลับอีก) และทุกรอบล้าง timestamp ทิ้ง
//   3) **ใบที่ไม่มีจุดเริ่มนาฬิกาต้องไม่ถูกแตะ** — ใบเก่าก่อน mig 0288 ไม่มีใครเคย
//      รับปากวันไหนไว้กับลูกค้า
//   4) กติกาการล้างคอลัมน์ต้องเป็นชุดเดียวกับที่คนกดตีกลับ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTO_BOUNCE_AFTER_BUSINESS_DAYS, AUTO_BOUNCE_MAX_ROUNDS, AUTO_BOUNCE_STATUSES,
  autoBounceReason, escalationNotice, planAutoBounce,
} from './leadAutoBounce.js';
import { leadBouncePatch, LEAD_BOUNCE_KINDS, meetingTimesSinceBounce } from './leads.js';

const ages = new Map();
const AGE = (lead) => ages.get(lead.id) ?? 0;
const lead = (id, over = {}) => {
  const row = { id, contactName: `ลูกค้า ${id}`, status: 'assigned', assignedAt: '2026-08-01T03:00:00Z', ...over };
  ages.set(id, over.age ?? 0);
  return row;
};
const plan = (leads, roundOf) => planAutoBounce(leads, { ageOf: AGE, roundOf });

/* ── เกณฑ์ ───────────────────────────────────────────────────────────────── */

/* ⚠️ "เกิน 5" ไม่ใช่ "ตั้งแต่ 5" — และต้องห่างจากเกณฑ์ทวง (1–2 วัน) พอให้ AE
   ได้รับคำเตือนอย่างน้อยสามเช้าก่อนถูกดึงลีดออกจากมือ */
test('ตีกลับเมื่อ **เกิน** 5 วันทำการ — ตรงเกณฑ์ยังไม่ตี', () => {
  assert.equal(AUTO_BOUNCE_AFTER_BUSINESS_DAYS, 5);
  assert.equal(plan([lead('A', { age: 5 })]).bounce.length, 0);
  assert.equal(plan([lead('B', { age: 6 })]).bounce.length, 1);
});

/* 🔴 ใบที่ถึงขั้นนัดแล้วนับเป็นสำเร็จในอัตราแปลงไปแล้ว — ตีกลับล้าง meetingAt ทิ้ง
   ⇒ ระบบลบตัวเลขที่ตัวเองเพิ่งบันทึกว่าทำได้ */
test('ไม่แตะใบที่ถึงขั้นนัดประชุมแล้ว', () => {
  assert.equal(AUTO_BOUNCE_STATUSES.includes('meeting'), false);
  const met = lead('M', { status: 'meeting', meetingAt: 'x', age: 30 });
  assert.equal(plan([met]).bounce.length, 0);
  assert.equal(plan([met]).escalate.length, 0);
});

/* คิวคัดกรองไม่มีใครให้ดึงลีดออกจากมือ (ยังไม่ได้มอบหมาย) และตีกลับใบที่อยู่ที่นั่น
   อยู่แล้วคือ no-op */
test('ไม่แตะใบที่ยังอยู่คิวคัดกรอง/รอกระจาย', () => {
  assert.deepEqual([...AUTO_BOUNCE_STATUSES].sort(), ['assigned', 'contacted']);
  for (const status of ['new', 'screened', 'qualified', 'disqualified']) {
    assert.equal(plan([lead('X', { status, age: 30 })]).bounce.length, 0, status);
  }
});

/* ⚠️ ใบ `contacted` ที่ยังไม่มี followUpAt = ใบเก่าก่อน mig 0288 · ไม่มีใครเคย
   รับปากวันไหนไว้กับลูกค้า จะตีกลับด้วยกำหนดที่เดาเอาเองไม่ได้ */
test('ใบเก่าที่ไม่มีวันติดตาม ไม่ถูกแตะ แม้จะค้างนานแค่ไหน', () => {
  const stale = lead('OLD', { status: 'contacted', age: 40 });
  assert.equal(plan([stale]).bounce.length, 0);
  const withDate = lead('NEW', { status: 'contacted', followUpAt: '2026-08-01T03:00:00Z', age: 40 });
  assert.equal(plan([withDate]).bounce.length, 1);
});

/* ── เพดานรอบ ────────────────────────────────────────────────────────────── */

/* 🪤 ไม่มีตัวนับ = วนไม่รู้จบ · ครบโควตาแล้วต้อง **หยุดตีกลับ** แล้วส่งให้คนตัดสิน */
test('ครบ 2 รอบแล้วไม่ตีกลับซ้ำ — ย้ายไปกองที่ต้องให้คนตัดสิน', () => {
  assert.equal(AUTO_BOUNCE_MAX_ROUNDS, 2);
  const row = lead('L', { age: 9 });
  assert.equal(plan([row], () => 1).bounce.length, 1, 'รอบที่ 2 ยังตีกลับได้');
  const capped = plan([row], () => 2);
  assert.equal(capped.bounce.length, 0);
  assert.equal(capped.escalate.length, 1);
  assert.equal(capped.escalate[0].rounds, 2);
});

test('ใบที่ยังไม่ถึงเกณฑ์ ไม่เข้ากองไหนเลย แม้จะเคยถูกตีกลับมาแล้ว', () => {
  assert.deepEqual(plan([lead('Y', { age: 2 })], () => 5), { bounce: [], escalate: [] });
});

/* ── ลำดับ ───────────────────────────────────────────────────────────────── */

/* รอบหนึ่งมีเพดานจำนวนใบ — ชนเพดานเมื่อไร ใบที่แย่ที่สุดต้องได้ถูกจัดการก่อน
   ไม่ใช่ใบที่บังเอิญมาก่อนใน query */
test('เรียงค้างนานสุดขึ้นก่อน', () => {
  const rows = [lead('mid', { age: 8 }), lead('worst', { age: 20 }), lead('new', { age: 6 })];
  assert.deepEqual(plan(rows).bounce.map((e) => e.lead.id), ['worst', 'mid', 'new']);
});

/* ── ข้อความ ─────────────────────────────────────────────────────────────── */

test('เหตุผลบอกว่าเงียบตรงไหน — สองสถานะคนละเรื่อง', () => {
  assert.match(autoBounceReason({ status: 'assigned' }, 7), /ไม่มีการติดต่อลูกค้าเลย 7 วันทำการ/);
  assert.match(autoBounceReason({ status: 'contacted' }, 7), /เลยวันติดตามที่นัดไว้ 7 วันทำการ/);
});

test('แจ้งเตือนใบที่วนอยู่ต้องบอกว่าให้ทำอะไรต่อ ไม่ใช่แค่รายงาน', () => {
  assert.equal(escalationNotice([]), null);
  const notice = escalationNotice([{ lead: { contactName: 'ก' } }, { lead: { contactName: 'ข' } }]);
  assert.match(notice.title, /ต้องตัดสินใจ/);
  assert.match(notice.body, /ย้ายทีม|มอบคนใหม่|ปิดลีด/);
  assert.match(notice.body, /ไม่ส่งกลับซ้ำ/);
});

/* ── กติกาการล้างคอลัมน์ต้องเป็นชุดเดียวกับที่คนกด ────────────────────────── */

/* 🪤 ก่อน mig 0291 กติกานี้อยู่ในไฟล์ route ก้อนเดียว · cron เขียนแถวเองไม่ผ่าน route
   (ไม่มี session user) ⇒ ถ้าไม่ยกออกมา จะมีสองที่ที่ต้องล้างเจ็ดคอลัมน์ให้ตรงกันเอง
   ลืมคอลัมน์เดียวคือ SLA เพี้ยนเงียบ ๆ (มีประวัติแล้ว: mig 0234 และ 0273 ต้องมาไล่เก็บ) */
test('leadBouncePatch ล้างครบทั้งต้นรอบและปลายรอบ', () => {
  const patch = leadBouncePatch('2026-08-25T03:00:00Z');
  assert.equal(patch.status, 'new');
  for (const col of [
    'team', 'assigneeId', 'assigneeName',
    'firstContactAt', 'meetingAt', 'followUpAt',
    'screenedAt', 'assignedAt', 'firstAssignedAt',
  ]) {
    assert.equal(patch[col], null, `${col} ต้องถูกล้าง`);
  }
  // ⚠️ ครั้งแรกตลอดกาลไม่ใช่ของรอบ — rework ไม่ลบผลงานคัดกรองรอบแรก (mig 0234)
  assert.equal('firstScreenedAt' in patch, false);
  assert.equal(patch.updatedAt, '2026-08-25T03:00:00Z');
});

test('route ที่คนกดตีกลับ ใช้ leadBouncePatch ตัวเดียวกัน ไม่เขียนเอง', () => {
  const src = readFileSync(
    new URL('../../app/api/sales-planning/leads/[id]/transition/route.js', import.meta.url), 'utf8',
  );
  assert.match(src, /Object\.assign\(patch, leadBouncePatch\(now\)\)/);
  // ไม่มีการล้างคอลัมน์เองหลงเหลืออยู่ในสาขา bounce
  const branch = src.slice(src.indexOf("action === 'bounce'"), src.indexOf('patch.status ='));
  assert.doesNotMatch(branch, /patch\.(team|assigneeId|screenedAt|firstAssignedAt) = null/);
});

/* 🔴 กับดักที่แตกเงียบที่สุดของงานนี้: `auto_bounce` เป็น kind ใหม่ ทุกที่ที่เคยเขียน
   `'bounce'` ตรง ๆ ต้องรับมันด้วย ไม่งั้นใบที่ถูกตีกลับอัตโนมัติจะ "ไม่นับว่าเคยตีกลับ"
   ที่นั่น ⇒ นัดของเจ้าของคนเก่าฟื้นขึ้นมาบนลีดของเจ้าของคนใหม่ */
test('auto_bounce นับเป็นขอบรอบเหมือน bounce ที่คนกด', () => {
  assert.deepEqual(LEAD_BOUNCE_KINDS, ['bounce', 'auto_bounce']);
  const history = [
    { kind: 'auto_bounce', eventAt: null },
    { kind: 'meeting', eventAt: '2026-08-01T03:00:00Z' },
  ];
  assert.deepEqual(meetingTimesSinceBounce(history), [], 'นัดก่อน auto_bounce ต้องไม่ฟื้น');
});

test('query ของ nextMeetingAt รวม auto_bounce ด้วย', () => {
  const src = readFileSync(
    new URL('../../app/api/sales-planning/leads/[id]/transition/route.js', import.meta.url), 'utf8',
  );
  assert.match(src, /\.in\('kind', \['meeting', \.\.\.LEAD_BOUNCE_KINDS\]\)/);
});

/* ── cron: ค่าตั้งต้นต้องไม่เขียน ─────────────────────────────────────────── */

/* ⚠️ ตรวจข้อมูลจริง 2026-08-08 พบลีด 14 ใบค้างข้ามเดือน ⇒ รอบแรกจะกวาดของค้าง
   ทั้งกองในนาทีเดียว · เปิดผิดหน้าแล้วลีดทั้งกองเปลี่ยนมือไม่ได้ */
test('cron ไม่เขียนอะไรถ้าไม่ได้ขอ apply=1 อย่างชัดเจน', () => {
  const src = readFileSync(new URL('../../app/api/cron/auto-bounce-leads/route.js', import.meta.url), 'utf8');
  assert.match(src, /const apply = url\.searchParams\.get\('apply'\) === '1'/);
  assert.match(src, /if \(!apply\) \{/);
  // กันแข่งกับ AE ที่เพิ่งกดบันทึกการติดต่อพอดี
  assert.match(src, /\.eq\('status', lead\.status\)/);
  // อ่านจำนวนรอบไม่ได้ = หยุดทั้งรอบ ไม่ใช่เดาว่าศูนย์
  assert.match(src, /ไม่ตีกลับรอบนี้/);
});
