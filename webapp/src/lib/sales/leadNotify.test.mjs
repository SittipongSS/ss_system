// Tests แจ้งเตือนจุดส่งมอบลีดเข้ากล่องรายคน
// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadHandoffNotice, overdueLeadNotices } from './leadNotify.js';

const DIR = new Map([
  ['sup', { id: 'sup', name: 'ปรีชา', role: 'ae_supervisor', team: null }],
  ['root', { id: 'root', name: 'แอดมิน', role: 'admin', team: null }],
  ['sen-ka', { id: 'sen-ka', name: 'วีรยุทธ', role: 'senior_ae', team: 'KA' }],
  ['ac-ka', { id: 'ac-ka', name: 'สุธาสินี', role: 'ac', team: 'KA' }],
  ['sen-sv', { id: 'sen-sv', name: 'กมลรัตน์', role: 'senior_ae', team: 'SV' }],
  ['ae-ka', { id: 'ae-ka', name: 'ปิยะพงษ์', role: 'ae', team: 'KA' }],
  ['mkt', { id: 'mkt', name: 'ณิชา', role: 'marketing', team: null }],
  ['old-sup', { id: 'old-sup', name: 'ลาออกแล้ว', role: 'ae_supervisor', team: null, disabled: true }],
]);
const lead = (over = {}) => ({ id: 'LEAD-1', contactName: 'คุณมนัสวี', company: 'ริเวอร์ เพลส', channel: 'chatcone_line', team: null, assigneeId: null, ...over });
const notice = (args) => leadHandoffNotice({ directory: DIR, ...args });

test('รับลีดใหม่ → เข้ากล่องของผู้คัดกรอง ไม่ใช่ทั้งฝ่าย', () => {
  const n = notice({ action: 'create', lead: lead(), actorId: 'mkt' });
  assert.deepEqual(n.userIds, ['sup'], 'เฉพาะ ae_supervisor · คนที่ปิดบัญชีต้องไม่ติดมา');
  assert.match(n.title, /ลีดใหม่รอคัดกรอง · คุณมนัสวี · ริเวอร์ เพลส/);
  assert.match(n.body, /LINE/);
  assert.match(n.body, /1 วันทำการ/);
});

test('ไม่มี ae_supervisor ในระบบ → ถอยไปหา admin ไม่ใช่เงียบหาย', () => {
  const dir = new Map([...DIR].filter(([id]) => id !== 'sup' && id !== 'old-sup'));
  const n = leadHandoffNotice({ action: 'create', lead: lead(), directory: dir, actorId: 'mkt' });
  assert.deepEqual(n.userIds, ['root'], 'ไม่มีใครรับแจ้งเตือน = ความล้มเหลวเงียบแบบเดิม');
});

test('คัดกรองเข้าทีม → Senior AE + AC ของทีมนั้นเท่านั้น', () => {
  const n = notice({ action: 'screen', lead: lead({ team: 'KA' }), actorId: 'sup' });
  assert.deepEqual(n.userIds.sort(), ['ac-ka', 'sen-ka'], 'AC กระจายลีดได้ จึงต้องรู้ด้วย');
  assert.ok(!n.userIds.includes('sen-sv'), 'หัวหน้าทีมอื่นต้องไม่ถูกกวน');
  assert.ok(!n.userIds.includes('ae-ka'), 'AE ยังไม่ใช่เจ้าของ — รู้ตอนถูกมอบหมาย');
  assert.match(n.title, /ลีดเข้าทีม Key Account รอกระจาย/);
});

test('มอบหมาย → เฉพาะ AE ผู้รับคนเดียว', () => {
  const n = notice({ action: 'assign', lead: lead({ team: 'KA', assigneeId: 'ae-ka' }), actorId: 'sen-ka' });
  assert.deepEqual(n.userIds, ['ae-ka']);
  assert.match(n.title, /คุณได้รับลีดใหม่/);
  assert.match(n.body, /ติดต่อกลับภายใน 1 วันทำการ/);
});

test('ตีกลับ → ผู้คัดกรอง + คนที่เพิ่งถูกดึงลีดออกจากมือ', () => {
  /* handler ล้าง assigneeId ไปแล้วตอนตีกลับ ⇒ ต้องรับผู้รับเดิมมาจากภายนอก
     ไม่งั้นคนที่ถือลีดอยู่จะไม่มีทางรู้ว่างานหายไปจากมือ */
  const n = notice({
    action: 'bounce',
    lead: lead({ team: null, assigneeId: null }),
    previousAssigneeId: 'ae-ka',
    actorId: 'sen-ka',
    reason: 'ทีมไม่ตรงกับบริการที่ลูกค้าสนใจ',
  });
  assert.deepEqual(n.userIds.sort(), ['ae-ka', 'sup']);
  assert.match(n.title, /ตีกลับคิวคัดกรอง/);
  assert.match(n.body, /ทีมไม่ตรง/);
});

test('ไม่แจ้งตัวเอง · ไม่มีผู้รับก็ไม่สร้างแจ้งเตือนเปล่า', () => {
  // supervisor คัดกรองเอง → ไม่ต้องเด้งกลับหาตัวเอง (คนเดียวในทีมผู้คัดกรอง)
  assert.equal(notice({ action: 'create', lead: lead(), actorId: 'sup' }), null);
  // AE มอบให้ตัวเอง (senior มอบให้ตัวเอง) → ไม่ต้องเด้ง
  assert.equal(notice({ action: 'assign', lead: lead({ assigneeId: 'sen-ka' }), actorId: 'sen-ka' }), null);
  // คัดกรองแล้วแต่ไม่มีทีม = ผิดปกติ ไม่รู้จะบอกใคร
  assert.equal(notice({ action: 'screen', lead: lead({ team: null }), actorId: 'sup' }), null);
  // ทีมที่ไม่มีหัวหน้าเลย
  assert.equal(notice({ action: 'screen', lead: lead({ team: 'ODM' }), actorId: 'sup' }), null);
  // มอบหมายแต่ไม่มีผู้รับ / action ที่ไม่ใช่จุดส่งมอบ
  assert.equal(notice({ action: 'assign', lead: lead(), actorId: 'x' }), null);
  assert.equal(notice({ action: 'contact', lead: lead(), actorId: 'x' }), null);
  assert.equal(notice({ action: 'create', lead: null, actorId: 'x' }), null);
});

test('route ต่อสายครบทั้งรับลีดและ 3 จังหวะของ transition', () => {
  const create = readFileSync(new URL('../../app/api/sales-planning/leads/route.js', import.meta.url), 'utf8');
  assert.match(create, /notifyLeadHandoff\(supabase, \{\s*action: 'create'/);

  const transition = readFileSync(
    new URL("../../app/api/sales-planning/leads/[id]/transition/route.js", import.meta.url), 'utf8',
  );
  assert.match(transition, /\['screen', 'assign', 'bounce'\]\.includes\(action\)/);
  assert.match(transition, /previousAssigneeId: lead\.assigneeId/,
    'ตีกลับล้าง assigneeId ไปแล้ว ต้องอ่านจากแถวก่อนแก้');
  // ต้องอยู่คู่กับ webhook ไม่ใช่แทนที่ (คนละหน้าที่ตาม mig 0185)
  assert.match(transition, /sendChat\('leads'/);
});

/* ── ทวงประจำวัน: ลีดที่เลย SLA แล้ว ─────────────────────────────────────
   แจ้งเตือนตอนส่งมอบเด้งครั้งเดียวตอนกดปุ่ม — ของที่ถูกดองต่อหลังจากนั้นเงียบสนิท
   ซึ่งคือเคสที่เจอจริง (14 ใบค้างข้ามเดือน นานสุด 10 วันทำการ) · ตัวนี้ทวงซ้ำทุกเช้า */
const ageMap = new Map();
const AGE = (lead) => ageMap.get(lead.id) ?? 0;
const overdue = (leads, dayKey = '2026-08-10') =>
  overdueLeadNotices(leads, { directory: DIR, ageOf: AGE, dayKey });
const pending = (id, over) => {
  const row = { id, contactName: `ลูกค้า ${id}`, status: 'assigned', team: 'KA', assigneeId: 'ae-ka', ...over };
  ageMap.set(id, over?.age ?? 0);
  return row;
};

test('ทวงเฉพาะที่ **เกิน** 1 วันทำการ — ตรงเกณฑ์ยังไม่ถือว่าสาย', () => {
  assert.equal(overdue([pending('L1', { age: 1 })]).length, 0, 'SLA คือ "ภายใน 1 วันทำการ"');
  assert.equal(overdue([pending('L2', { age: 2 })]).length, 1);
  assert.deepEqual(overdue([]), []);
});

test('หนึ่งคน = หนึ่งเด้งต่อวัน ไม่ใช่หนึ่งใบต่อหนึ่งเด้ง', () => {
  const n = overdue([
    pending('A', { age: 10 }), pending('B', { age: 7 }), pending('C', { age: 3 }),
  ]);
  assert.equal(n.length, 1, 'ดอง 3 ใบต้องได้เด้งเดียว ไม่งั้นเลิกอ่านกล่องในสัปดาห์เดียว');
  assert.deepEqual(n[0].userIds, ['ae-ka']);
  assert.match(n[0].title, /รอติดต่อกลับเกิน SLA 3 ใบ · ค้างนานสุด 10 วันทำการ/);
  assert.equal(n[0].entityId, 'A', 'ผูกกับใบที่ค้างนานสุด — ลบใบนั้นแล้วแจ้งเตือนถูกกวาดตาม');
});

test('แยกกลุ่มตาม "ใครต้องลงมือ": คิวกลาง / ทีม / ผู้รับมอบ', () => {
  const n = overdue([
    pending('N1', { status: 'new', team: null, assigneeId: null, age: 11 }),
    pending('S1', { status: 'screened', team: 'KA', assigneeId: null, age: 4 }),
    pending('A1', { age: 6 }),
  ]);
  const byTitle = Object.fromEntries(n.map((x) => [x.title.split('เกิน')[0], x.userIds.sort()]));
  assert.deepEqual(byTitle['รอคัดกรอง'], ['sup'], 'คิวกลางเป็นของหัวหน้าฝ่ายขาย');
  assert.deepEqual(byTitle['รอกระจาย'], ['ac-ka', 'sen-ka'], 'ทีมที่ยังไม่มอบ = Senior + AC ของทีมนั้น');
  assert.deepEqual(byTitle['รอติดต่อกลับ'], ['ae-ka']);
});

test('กุญแจกันซ้ำผูกกับวัน + กลุ่ม — ยิงซ้ำวันเดียวกันไม่เด้งซ้ำ แต่วันใหม่เด้งใหม่', () => {
  const today = overdue([pending('A', { age: 5 })])[0];
  const tomorrow = overdue([pending('A', { age: 6 })], '2026-08-11')[0];
  assert.equal(today.dedupeKey, 'DIGEST-lead-overdue-2026-08-10-ae:ae-ka');
  assert.notEqual(today.dedupeKey, tomorrow.dedupeKey, 'วันใหม่ต้องทวงใหม่');
  assert.match(today.dedupeKey, /^DIGEST-/, 'ต้องไม่ชนกับ id จริงของ entity_updates');
});

test('เนื้อความบอกชื่อลูกค้าให้พอเห็นภาพ แล้วยุบส่วนเกิน', () => {
  const n = overdue([
    pending('A', { age: 9 }), pending('B', { age: 8 }), pending('C', { age: 7 }),
    pending('D', { age: 6 }), pending('E', { age: 5 }),
  ]);
  assert.match(n[0].body, /^ลูกค้า A · ลูกค้า B · ลูกค้า C และอีก 2$/);
});

test('cron ต้องยิงการทวงแยกจากการ์ด Chat — การ์ดพังต้องไม่ทำให้การทวงหาย', () => {
  const src = readFileSync(new URL('../../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  assert.match(src, /results\.leadOverdue = await notifyOverdueLeads\(supabase\)/);
  assert.match(src, /overdueLeadNotices\(data, \{/);
  assert.match(src, /dedupeKey: notice\.dedupeKey/);
  assert.match(src, /href: '\/sa\/leads'/, 'สรุปหลายใบต้องพาไปที่คิว ไม่ใช่ใบใดใบหนึ่ง');
});
