// ── ปิดลีดอัตโนมัติ (มติผู้ใช้ 2026-09-16 · "นับต่อ ไม่เริ่มใหม่" 2026-10-05) ───────────
//
// สิ่งที่ต้องล็อก เรียงตามความเสียหายถ้าหลุด:
//   1) **"3 ครั้ง" เป็นฉลาก ไม่ใช่เงื่อนไขตัด** — อ่านกลับเมื่อไร กติกากลับหัว: คนที่ไม่กดบันทึก
//      การติดต่อไม่มีวันครบ 3 = ไม่มีวันถูกปิด ส่วนคนที่ตามจริงโดนล้างคิว
//   2) **ห้ามปิดใบที่เคยนัดแล้ว** — ตลอดอายุใบ แม้ตีกลับจะล้าง meetingAt ไปแล้ว
//   3) **นาฬิกาไม่รีเซ็ตเมื่อตีกลับ/เปลี่ยนมือ** — ไม่งั้นวนคิวแล้วพ้นการปิดได้ตลอดกาล
//   4) **ลูกค้ากลับมา (reopen) เริ่มนับใหม่** — ไม่งั้นใบที่เพิ่งดึงกลับถูกปิดซ้ำเช้าวันถัดไป
//   5) จอกับ cron ต้องนับวันเดียวกัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTO_LOST_AFTER_BUSINESS_DAYS, AUTO_LOST_FULL_EFFORT, AUTO_LOST_STATUSES, AUTO_LOST_CONTACT_KINDS,
  AUTO_LOST_CODE_BY_EFFORT, LEAD_OWNED_STATUSES,
  autoLostCountdown, autoLostReason, leadFollowEffort, leadOwnedBusinessDays, planAutoLost,
} from './leadAutoLost.js';
import { AUTO_BOUNCE_STATUSES } from './leadAutoBounce.js';
import { LEAD_FOLLOW_UP_ACTIONS, LEAD_LOST_CODES, LEAD_TRANSITIONS, TRANSITION_TO_STATUS } from './leads.js';

/* วันทำการแบบง่ายสำหรับเทสต์: นับวันปฏิทินระหว่างสองวัน (ไม่นับวันเริ่ม) — กติกาที่ทดสอบ
   คือการต่อช่วง ไม่ใช่ปฏิทินวันหยุด (นั่นเป็นงานของ businessDaysWaiting ที่มีเทสต์ของตัวเอง) */
const DAY = 86400e3;
const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY));
const at = (day) => new Date(Date.UTC(2026, 8, 1) + day * DAY).toISOString(); // วันที่ 0 = 1 ก.ย.
const ev = (day, kind, fromStatus, toStatus) => ({ kind, fromStatus, toStatus, createdAt: at(day) });
const owned = (lead, events, nowDay) => leadOwnedBusinessDays(lead, events, { now: at(nowDay), daysBetween });

/* ── ค่าคงที่ที่สะกดซ้ำข้ามไฟล์ ─────────────────────────────────────────── */

test('เกณฑ์ = พ้น 10 วันทำการ · ฉลากตามครบ = 3 ครั้ง (มติ 16/09)', () => {
  assert.equal(AUTO_LOST_AFTER_BUSINESS_DAYS, 10);
  assert.equal(AUTO_LOST_FULL_EFFORT, 3);
});

/* ⚠️ สะกดซ้ำเพราะ import leads.js กลับไม่ได้ (cycle) — สองลิสต์ต้องเดินด้วยกัน */
test('ชนิดเหตุการณ์ "ติดต่อ" ตรงกับ LEAD_FOLLOW_UP_ACTIONS', () => {
  assert.deepEqual([...AUTO_LOST_CONTACT_KINDS].sort(), [...LEAD_FOLLOW_UP_ACTIONS].sort());
});

test('สถานะที่ปิดได้ = ชุดเดียวกับตีกลับ (assigned/contacted) · ไม่แตะ meeting', () => {
  assert.deepEqual([...AUTO_LOST_STATUSES].sort(), [...AUTO_BOUNCE_STATUSES].sort());
  assert.equal(AUTO_LOST_STATUSES.includes('meeting'), false);
  assert.ok(LEAD_OWNED_STATUSES.includes('meeting'), 'meeting ยังนับเป็นเวลาที่ถือใบ');
});

test('สามรหัสฉลากอยู่ในชุดรหัสเหตุผล (CHECK + รายงาน)', () => {
  for (const code of Object.values(AUTO_LOST_CODE_BY_EFFORT)) assert.ok(LEAD_LOST_CODES.includes(code), code);
});

/* ── ฉลากความพยายาม ──────────────────────────────────────────────────── */

test('ฉลาก: ≥3 ตามครบ · 1–2 ตามไม่ครบ · 0 ไม่เคยแตะ — นับ contact + followup เท่านั้น', () => {
  const touches = (n) => Array.from({ length: n }, (_, i) => ({ kind: i ? 'followup' : 'contact' }));
  assert.equal(leadFollowEffort(touches(0)).effort, 'none');
  assert.equal(leadFollowEffort(touches(1)).effort, 'partial');
  assert.equal(leadFollowEffort(touches(2)).effort, 'partial');
  assert.equal(leadFollowEffort(touches(3)).effort, 'full');
  assert.equal(leadFollowEffort(touches(5)).code, AUTO_LOST_CODE_BY_EFFORT.full);
  // ชนิดอื่นไม่นับ (มอบหมาย/ตีกลับ/แก้ไขไม่ใช่การคุยกับลูกค้า)
  assert.equal(leadFollowEffort([{ kind: 'assign' }, { kind: 'bounce' }, { kind: 'update' }]).contacts, 0);
});

/* ── นาฬิกา ─────────────────────────────────────────────────────────── */

test('ใบที่ถือรอบเดียว = นับจากวันมอบ', () => {
  const lead = { status: 'contacted' };
  const events = [ev(0, 'create', null, 'new'), ev(0, 'screen', 'new', 'screened'), ev(1, 'assign', 'screened', 'assigned'),
    ev(2, 'contact', 'assigned', 'contacted')];
  assert.equal(owned(lead, events, 13), 12);
});

/* 🔴 มติ 05/10 "นับต่อ ไม่เริ่มใหม่" — ตีกลับแล้วคัดกลับมา นาฬิกาเดินต่อจากเดิม
   ช่วงที่นอนคิวคัดกรองไม่นับ (ไม่ใช่เวลาของคนถือใบ) */
test('ตีกลับแล้วมอบใหม่ = นับต่อจากรอบก่อน · ช่วงนอนคิวคัดกรองไม่นับ', () => {
  const lead = { status: 'assigned', assignedAt: at(20) };
  const events = [
    ev(0, 'assign', 'screened', 'assigned'),
    ev(6, 'auto_bounce', 'assigned', 'new'), // ถือ 6 วัน
    ev(9, 'screen', 'new', 'screened'), // นอนคิว 4 วัน — ไม่นับ
    ev(10, 'assign', 'screened', 'assigned'),
  ];
  assert.equal(owned(lead, events, 15), 6 + 5);
  // คอลัมน์ assignedAt (รอบใหม่) บอกแค่ 0 — นี่คือรูที่กติกานี้ปิด
  assert.ok(owned(lead, events, 20) > daysBetween(lead.assignedAt, at(20)));
});

test('ตีกลับด้วยมือก็นับต่อเหมือนกัน — วนกี่รอบก็สะสม', () => {
  const lead = { status: 'contacted' };
  const events = [
    ev(0, 'assign', 'screened', 'assigned'), ev(4, 'bounce', 'assigned', 'new'),
    ev(5, 'assign', 'screened', 'assigned'), ev(6, 'contact', 'assigned', 'contacted'), ev(9, 'bounce', 'contacted', 'new'),
    ev(10, 'assign', 'screened', 'assigned'), ev(11, 'contact', 'assigned', 'contacted'),
  ];
  assert.equal(owned(lead, events, 14), 4 + 4 + 4);
});

/* 🪤 สลับใบกันในทีมแล้วพ้นการปิดไม่ได้ — reassign ไม่ใช่การออกจากมือฝ่ายขาย */
test('เปลี่ยนผู้รับผิดชอบไม่รีเซ็ตนาฬิกา', () => {
  const lead = { status: 'contacted' };
  const events = [ev(0, 'assign', 'screened', 'assigned'), ev(1, 'contact', 'assigned', 'contacted'),
    ev(8, 'reassign', 'contacted', 'contacted'), ev(9, 'followup', 'contacted', 'contacted')];
  assert.equal(owned(lead, events, 12), 12);
});

/* ⭐ ลูกค้ากลับมา = โอกาสใหม่ · ไม่รีเซ็ตแล้วใบที่ระบบเพิ่งปิดและคนเพิ่งดึงกลับ จะถูกปิดซ้ำเช้าวันถัดไป */
test('ลูกค้ากลับมา (reopen) เริ่มนับใหม่จากวันที่ดึงกลับ', () => {
  const lead = { status: 'contacted' };
  const events = [
    ev(0, 'assign', 'screened', 'assigned'), ev(1, 'contact', 'assigned', 'contacted'),
    ev(15, 'disqualify', 'contacted', 'disqualified'),
    ev(40, 'reopen', 'disqualified', 'contacted'),
  ];
  assert.equal(owned(lead, events, 43), 3);
  // reopen ไปคิวคัดกรอง (ยังไม่มีคนถือ) แล้วมอบทีหลัง = นับจากวันมอบ
  const back = [...events.slice(0, 3), ev(40, 'reopen', 'disqualified', 'new'), ev(42, 'assign', 'screened', 'assigned')];
  assert.equal(owned({ status: 'assigned' }, back, 45), 3);
});

/* ถอดดีลใบสุดท้าย (unlink_deal) พาใบกลับขั้นเดิม — นาฬิกาเดินต่อจากเวลาที่เคยถือ
   ⚠️ เทสต์นี้คือเหตุผลที่อ่านช่วงจาก from/toStatus ไม่ใช่จากชื่อ kind */
test('ทางเข้า/ออกจากมือคนอ่านจาก from/toStatus — ชนิดใหม่ไม่ทำนาฬิกาค้าง', () => {
  const lead = { status: 'contacted' };
  const events = [ev(0, 'assign', 'screened', 'assigned'), ev(1, 'contact', 'assigned', 'contacted'),
    ev(3, 'link_deal', 'contacted', 'qualified'), ev(30, 'unlink_deal', 'qualified', 'contacted')];
  assert.equal(owned(lead, events, 32), 3 + 2);
});

test('เรียงเหตุการณ์เอง — จอส่งมาใหม่→เก่า ได้ผลเท่ากับเก่า→ใหม่', () => {
  const lead = { status: 'assigned' };
  const events = [ev(0, 'assign', 'screened', 'assigned'), ev(5, 'bounce', 'assigned', 'new'), ev(7, 'assign', 'screened', 'assigned')];
  assert.equal(owned(lead, [...events].reverse(), 10), owned(lead, events, 10));
});

/* ใบเก่าก่อนมี lead_events / insert ประวัติล้มตอนมอบ — ต้องยังมีนาฬิกา ไม่ใช่รอดตลอดกาล */
test('ประวัติขาด = ถอยไปใช้คอลัมน์ของรอบปัจจุบัน', () => {
  assert.equal(owned({ status: 'contacted', assignedAt: at(2) }, [], 14), 12);
  assert.equal(owned({ status: 'assigned', firstAssignedAt: at(4) }, [], 14), 10);
  // รอบก่อนปิดช่วงไปแล้ว แต่รอบนี้ไม่มีเหตุการณ์มอบ (insert ล้ม) — สะสมรอบก่อน + คอลัมน์รอบนี้
  const events = [ev(0, 'assign', 'screened', 'assigned'), ev(5, 'bounce', 'assigned', 'new')];
  assert.equal(owned({ status: 'assigned', assignedAt: at(10) }, events, 14), 5 + 4);
});

test('ใบที่ไม่ได้อยู่ในมือใคร = ไม่มีนาฬิกา', () => {
  for (const status of ['new', 'screened', 'qualified', 'disqualified']) {
    assert.equal(owned({ status, assignedAt: at(0) }, [], 30), null, status);
  }
});

/* ── แผนปิด ─────────────────────────────────────────────────────────── */

const leadRow = (id, status = 'contacted') => ({ id, status, contactName: `ลูกค้า ${id}` });
const planWith = (leads, eventsById, nowDay = 30) => planAutoLost(leads, {
  eventsOf: (id) => eventsById[id] || [],
  ageOf: (lead, events) => owned(lead, events, nowDay),
});

/* ⚠️ "พ้น 10" ไม่ใช่ "ครบ 10" — ตรงเกณฑ์พอดียังไม่ปิด (กติกาเดียวกับตีกลับ) */
test('ปิดเมื่อ **เกิน** 10 วันทำการ — ตรงเกณฑ์ยังไม่ปิด', () => {
  const assign = (day) => [ev(day, 'assign', 'screened', 'assigned')];
  const plan = planWith([leadRow('A', 'assigned'), leadRow('B', 'assigned')], { A: assign(20), B: assign(19) });
  assert.deepEqual(plan.map((e) => e.lead.id), ['B']);
  assert.equal(plan[0].days, 11);
});

/* 🔴 ข้อที่สำคัญที่สุดของมติ — 3 ครั้งเป็นฉลาก ไม่ใช่ด่าน: ใบที่ไม่เคยแตะต้องโดนด้วย */
test('ไม่เคยติดต่อเลยก็ถูกปิด (ฉลาก "ไม่เคยแตะ") — 3 ครั้งไม่ใช่เงื่อนไข', () => {
  const plan = planWith([leadRow('IDLE', 'assigned')], { IDLE: [ev(0, 'assign', 'screened', 'assigned')] });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].effort, 'none');
  assert.equal(plan[0].code, AUTO_LOST_CODE_BY_EFFORT.none);
});

test('ตามครบแล้วยังไม่ได้นัดก็ถูกปิด — ได้ฉลาก "ตามครบ"', () => {
  const events = [ev(0, 'assign', 'screened', 'assigned'), ev(1, 'contact', 'assigned', 'contacted'),
    ev(5, 'followup', 'contacted', 'contacted'), ev(9, 'followup', 'contacted', 'contacted')];
  const [entry] = planWith([leadRow('BUSY')], { BUSY: events });
  assert.equal(entry.effort, 'full');
  assert.equal(entry.contacts, 3);
});

/* 🔴 ตีกลับล้าง meetingAt ทิ้ง แต่ประวัติยังอยู่ — นัดในรอบก่อนก็นับ */
test('เคยนัดแล้วครั้งเดียว (แม้ในรอบก่อนตีกลับ) = ไม่ปิด', () => {
  const events = [ev(0, 'assign', 'screened', 'assigned'), ev(1, 'meeting', 'assigned', 'meeting'),
    ev(3, 'bounce', 'meeting', 'new'), ev(4, 'assign', 'screened', 'assigned')];
  assert.equal(planWith([leadRow('MET', 'assigned')], { MET: events }).length, 0);
});

test('ไม่แตะสถานะนอกเกณฑ์ ไม่ว่าจะถือมานานแค่ไหน', () => {
  for (const status of ['new', 'screened', 'meeting', 'qualified', 'disqualified']) {
    const plan = planWith([leadRow('X', status)], { X: [ev(0, 'assign', 'screened', 'assigned')] }, 60);
    assert.equal(plan.length, 0, status);
  }
});

test('เรียงถือนานสุดก่อน — ชนเพดานต่อรอบแล้วใบที่แย่ที่สุดได้จัดการก่อน', () => {
  const assign = (day) => [ev(day, 'assign', 'screened', 'assigned')];
  const plan = planWith([leadRow('NEW', 'assigned'), leadRow('OLD', 'assigned'), leadRow('MID', 'assigned')],
    { NEW: assign(15), OLD: assign(0), MID: assign(8) });
  assert.deepEqual(plan.map((e) => e.lead.id), ['OLD', 'MID', 'NEW']);
});

test('เหตุผลที่บันทึกบอกจำนวนวัน เกณฑ์ และสิ่งที่คนถือใบทำไปแล้ว', () => {
  assert.match(autoLostReason({ days: 12, contacts: 4 }), /12 วันทำการ.*เกณฑ์ 10.*ติดต่อไปแล้ว 4 ครั้ง/);
  assert.match(autoLostReason({ days: 11, contacts: 0 }), /ไม่มีบันทึกการติดต่อเลย/);
});

/* ── จอนับถอยหลังวันเดียวกับ cron ───────────────────────────────────── */

test('นับถอยหลัง = กลับสมการของ planAutoLost เป๊ะ', () => {
  assert.equal(autoLostCountdown(null), null);
  assert.equal(autoLostCountdown(0), 11);
  assert.equal(autoLostCountdown(10), 1, 'ครบ 10 ยังไม่ปิด — เหลืออีก 1');
  assert.equal(autoLostCountdown(11), 0, 'เกิน 10 = เข้าเกณฑ์');
  assert.equal(autoLostCountdown(40), 0);
  for (let days = 0; days <= 20; days += 1) {
    const due = planAutoLost([leadRow('Z')], { eventsOf: () => [], ageOf: () => days }).length > 0;
    assert.equal(autoLostCountdown(days) === 0, due, `days=${days}`);
  }
});

/* ── ลำดับใน cron + สัญญากับระบบเดิม ─────────────────────────────────── */

/* 🔴 ปิดก่อนตีกลับเสมอ — ตีกลับก่อนแล้วใบหลุดไป `new` ซึ่งตัวปิดไม่สแกน */
test('cron ปิดก่อนแล้วค่อยตีกลับ · ใบที่ปิดไม่ถูกตีกลับซ้ำ · กันแข่งด้วยสถานะ', () => {
  const src = readFileSync(new URL('../../app/api/cron/auto-bounce-leads/route.js', import.meta.url), 'utf8');
  assert.ok(src.indexOf('planAutoLost(') < src.indexOf('planAutoBounce('), 'ต้องวางแผนปิดก่อนตีกลับ');
  assert.match(src, /planAutoBounce\(leads\.filter\(\(lead\) => !lostIds\.has\(lead\.id\)\)/);
  assert.ok(src.indexOf("kind: 'lead_auto_lost'") < src.indexOf("kind: 'lead_auto_bounce'"), 'ต้องเขียนปิดก่อนตีกลับ');
  // ใบที่เพิ่งถูกกดนัดพอดีต้องไม่ถูกทับ
  assert.equal((src.match(/\.eq\('status', lead\.status\)/g) || []).length, 2);
  // ไม่มีถังขยะ — audit คือร่องรอยเดียวว่าระบบปิดอะไรไปบ้าง
  assert.match(src, /recordAudit\(/);
});

/* ปิดอัตโนมัติต้องย้อนได้ด้วยปุ่มลูกค้ากลับมา — ไม่ล้างทีม/ผู้รับ (leadReopenStatus อ่านจากแถว) */
test('ใบที่ระบบปิดดึงกลับได้ และไม่ล้างคอลัมน์ที่ reopen ต้องใช้', () => {
  assert.deepEqual(LEAD_TRANSITIONS.disqualified, ['reopen']);
  assert.equal(TRANSITION_TO_STATUS.disqualify, 'disqualified');
  const src = readFileSync(new URL('../../app/api/cron/auto-bounce-leads/route.js', import.meta.url), 'utf8');
  const lostBlock = src.slice(src.indexOf('/* ── ① ปิดอัตโนมัติ'), src.indexOf('/* ── ② ตีกลับอัตโนมัติ'));
  assert.ok(lostBlock.length > 0, 'หาบล็อกปิดอัตโนมัติไม่เจอ');
  for (const column of ['assigneeId:', 'team:', 'firstContactAt:', 'meetingAt:']) {
    const update = lostBlock.slice(lostBlock.indexOf('.update({'), lostBlock.indexOf('})', lostBlock.indexOf('.update({')));
    assert.equal(update.includes(column), false, `ปิดอัตโนมัติไม่ควรแตะ ${column}`);
  }
});

/* audit สร้างแถว "ก่อน" จาก `{ ...หลัง, ...ก่อน }` — ช่องที่การปิดเขียนแต่ไม่ได้ select มา
   จะโผล่ในแถว "ก่อน" เป็นค่าใหม่ ⇒ audit บอกว่าไม่มีอะไรเปลี่ยนตรงช่องนั้น กู้ย้อนไม่ได้ */
test('ทุกช่องที่การปิดเขียน ต้องอยู่ในคอลัมน์ที่ cron select มา', () => {
  const src = readFileSync(new URL('../../app/api/cron/auto-bounce-leads/route.js', import.meta.url), 'utf8');
  const columnsSrc = src.slice(src.indexOf('const COLUMNS ='), src.indexOf(';', src.indexOf('const COLUMNS =')));
  const selected = new Set([...columnsSrc.matchAll(/'([^']+)'/g)].flatMap(([, part]) => part.split(',')).map((c) => c.trim()).filter(Boolean));
  const lostBlock = src.slice(src.indexOf('/* ── ① ปิดอัตโนมัติ'), src.indexOf('/* ── ② ตีกลับอัตโนมัติ'));
  const update = lostBlock.slice(lostBlock.indexOf('.update({'), lostBlock.indexOf('})', lostBlock.indexOf('.update({')));
  const written = [...update.matchAll(/^\s*(\w+):/gm)].map(([, key]) => key);
  assert.ok(written.length >= 5, 'อ่านช่องที่เขียนไม่ได้ — เทสต์จะกลายเป็นเทสต์เปล่า');
  for (const key of written) assert.ok(selected.has(key), `${key} ไม่อยู่ใน COLUMNS`);
});
