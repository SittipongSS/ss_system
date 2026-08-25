// ── บริบทของใบที่ถูกส่งกลับ (ข้อ 1 ของแผนปิดช่องว่าง UI) ────────────────────
//
// 🔴 ปัญหาที่แก้: `bounce`/`auto_bounce` ล้าง team + assigneeId บนแถวทิ้ง ⇒ ใบที่ถูก
// ส่งกลับโผล่ในคิวคัดกรอง **เหมือนลีดใหม่ทุกประการ** · ผู้ดูแลคัดเข้าทีมเดิม มอบคนเดิม
// แล้ววนรอบใหม่ — เพดาน AUTO_BOUNCE_MAX_ROUNDS กันได้แค่ "ไม่ตีกลับรอบที่ 3"
// แต่กันรอบที่ 2 ไม่ได้เพราะคนตัดสินใจไม่มีข้อมูล
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadBounceHistory, LEAD_BOUNCE_KINDS } from './leads.js';
import { AUTO_BOUNCE_MAX_ROUNDS } from './leadAutoBounce.js';

const ev = (kind, over = {}) => ({
  kind, team: 'ODM', assigneeId: 'ae-1', assigneeName: 'ธนกฤต ส.',
  reason: 'เงียบ', createdAt: '2026-08-20T03:00:00Z', ...over,
});

test('ไม่เคยถูกตีกลับ = ไม่มีรอบ ไม่มีบริบท', () => {
  const h = leadBounceHistory([]);
  assert.equal(h.autoRounds, 0);
  assert.equal(h.previousAssigneeName, null);
  assert.equal(h.teamLocked, null);
  assert.equal(leadBounceHistory().autoRounds, 0);
});

/* ⚠️ ตีกลับด้วยมือ = คนตัดสินใจแล้วว่าทีมไม่ตรง คนละเรื่องกับ "ไม่มีใครทำ"
   รวมกันเมื่อไร ใบที่ถูกส่งต่อตามเนื้องานจริงจะโดนล็อกทีมทั้งที่ไม่เคยถูกดองเลย */
test('นับเฉพาะ auto_bounce เป็น "รอบ" — ตีกลับด้วยมือไม่นับ', () => {
  assert.equal(leadBounceHistory([ev('bounce'), ev('bounce')]).autoRounds, 0);
  assert.equal(leadBounceHistory([ev('auto_bounce'), ev('bounce')]).autoRounds, 1);
  assert.equal(leadBounceHistory([ev('auto_bounce'), ev('auto_bounce')]).autoRounds, 2);
});

/* ⚠️ events เรียงใหม่→เก่า — บริบทต้องเป็นรอบ **ล่าสุด** ไม่ใช่รอบแรกสุด */
test('เคยอยู่กับใคร = รอบล่าสุด ไม่ใช่รอบแรก', () => {
  const h = leadBounceHistory([
    ev('auto_bounce', { assigneeName: 'ล่าสุด', team: 'KA', createdAt: '2026-08-24T03:00:00Z' }),
    ev('auto_bounce', { assigneeName: 'รอบแรก', team: 'ODM', createdAt: '2026-08-10T03:00:00Z' }),
  ]);
  assert.equal(h.previousAssigneeName, 'ล่าสุด');
  assert.equal(h.previousTeam, 'KA');
  assert.equal(h.bouncedAt, '2026-08-24T03:00:00Z');
});

/* 🪤 ล็อกทีมเมื่อครบโควตา — ใช้ค่าเดียวกับ cron ไม่สะกดเลขซ้ำ */
test('ครบโควตารอบแล้วล็อกทีมเดิม · ยังไม่ครบไม่ล็อก', () => {
  const rounds = (n) => leadBounceHistory(Array.from({ length: n }, () => ev('auto_bounce')));
  assert.equal(rounds(AUTO_BOUNCE_MAX_ROUNDS - 1).teamLocked, null);
  assert.equal(rounds(AUTO_BOUNCE_MAX_ROUNDS).teamLocked, 'ODM');
});

/* ── ต้นทางต้องเขียนข้อมูลลงประวัติจริง ─────────────────────────────────── */

/* 🐞 ถ้าไม่เขียน team/assignee ลง event ตอนตีกลับ **ไม่มีทางรู้อีกเลย** ว่าใบนี้เคยอยู่
   กับใคร เพราะ leadBouncePatch ล้างแถวทิ้งไปแล้ว ⇒ ป้ายในคิวจะว่างตลอดกาล */
const wrote = (rel) => {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("'auto_bounce'") >= 0 ? 0 : 0);
  return block;
};

test('cron ตีกลับอัตโนมัติเขียนทีม/ผู้รับเดิมลงประวัติ', () => {
  const src = wrote('../../app/api/cron/auto-bounce-leads/route.js');
  for (const field of ['team: lead.team', 'assigneeId: lead.assigneeId', 'assigneeName: lead.assigneeName']) {
    assert.ok(src.includes(field), `cron ไม่ได้เขียน ${field} ลง lead_events`);
  }
});

test('ตีกลับด้วยมือก็เขียนเหมือนกัน — และเขียนก่อนล้างแถว', () => {
  const src = wrote('../../app/api/sales-planning/leads/[id]/transition/route.js');
  const branch = src.slice(src.indexOf("action === 'bounce'"), src.indexOf('patch.status ='));
  assert.match(branch, /event\.assigneeId = lead\.assigneeId/);
  assert.ok(
    branch.indexOf('event.assigneeId') < branch.indexOf('leadBouncePatch(now)'),
    'ต้องอ่านจากแถวก่อน Object.assign ล้างค่า',
  );
});

/* API ต้องถามเฉพาะใบที่ยังอยู่คิวคัดกรอง — ใบที่มอบต่อไปแล้วรอบใหม่เริ่มแล้ว
   และการซอย .in() ต้องยังอยู่ (เพดาน query string ของ PostgREST) */
test('API คิวลีดถามประวัติเฉพาะใบสถานะ new และซอยคิวรี', () => {
  const src = readFileSync(new URL('../../app/api/sales-planning/leads/route.js', import.meta.url), 'utf8');
  assert.match(src, /status === 'new'/);
  assert.match(src, /chunkLeadIds\(ids\)/);
  assert.match(src, /\.in\('kind', LEAD_BOUNCE_KINDS\)/);
  // อ่านไม่สำเร็จต้องไม่ล้มทั้งหน้า — คิวลีดเป็นหน้าทำงานหลัก
  assert.match(src, /คิวจะไม่มีป้ายบริบท/);
});

test('LEAD_BOUNCE_KINDS ครอบทั้งสองชนิด', () => {
  assert.deepEqual(LEAD_BOUNCE_KINDS, ['bounce', 'auto_bounce']);
});
