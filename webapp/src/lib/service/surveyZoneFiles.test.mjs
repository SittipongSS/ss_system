// ── ไฟล์แนบของผลวัดพื้นที่ = ของโมดูลบริการ ไม่ใช่ของระบบคำร้อง ────────────
//
// 🐞 **บั๊กที่เทสต์ชุดนี้เกิดมาเพื่อกัน**: เจ้าหน้าที่หน้างาน (role `ts`) แนบและเปิดดูรูป
//   ไม่ได้เลยสักไฟล์ (403) เพราะด่านไฟล์แนบยืมบันไดของคำร้องมาใช้ ⇒ ด่าน "ภาพกว้าง"
//   ซึ่งเป็นด่านของช่างเอง ไม่มีวันติ๊ก ⇒ หัวหน้ากดส่งผลไม่ได้ตลอดกาล
//
// ⚠️ เทสต์เดิมของด่านไฟล์แนบ (costingAttachmentAccess.test.mjs) เขียวครบ 6/6 มาตลอด
//   เพราะ **ไม่มีผู้ใช้ฝ่าย TS สักคน และไม่มี entityType นี้สักเคส** — ทะเบียนที่คุม
//   coverage ก็พิสูจน์แค่ว่า "มีสาขารู้จัก" ไม่ได้พิสูจน์ว่ากฎถูก
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAttachToCosting, canViewCostingAttachment } from '@/lib/master/costingAttachmentAccess';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CREW = { id: 'U-TS1', role: 'ts', department: 'TS' };
const OTHER_CREW = { id: 'U-TS2', role: 'ts', department: 'TS' };
const PLANNER = { id: 'U-TSP', role: 'ts_planner', department: 'TS' };
const HEAD = { id: 'U-TSM', role: 'ts_manager', department: 'TS' };
const SA = { id: 'U-AE', role: 'ae', department: 'SA' };
const RD = { id: 'U-RD', role: 'rd', department: 'RD' };
const ADMIN = { id: 'U-AD', role: 'admin', department: 'IT' };

const REQ = {
  id: 'DR-S1', status: 'acknowledged', kind: 'site_survey', dept: 'TS',
  requestedById: 'U-AE', answeredAt: null, cancelledAt: null,
};
const VISIT = { id: 'SV-1', kind: 'survey', requestId: 'DR-S1', status: 'done', assigneeId: 'U-TS1', assistantIds: [] };
const ROW = { id: 'SVZ-1', requestId: 'DR-S1', zoneName: 'ล็อบบี้' };

/* stub ฐาน — คืนใบตามที่ทดสอบ และคืนนัดให้ findSurveyVisit
   ⚠️ findSurveyVisit เรียงด้วย order() ⇒ ต้องมี chain ครบ ไม่งั้นด่านตอบ false โดยที่
      ไม่ใช่เพราะกฎ (เทสต์ที่ผ่านด้วยเหตุผลผิดคือเทสต์ที่ไม่มีค่า) */
const dbWith = (req = REQ, visits = [VISIT]) => ({
  from: (table) => {
    if (table === 'dept_requests') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: req, error: null }) }) }) };
    }
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: async () => ({ data: visits, error: null }),
      then: (res) => Promise.resolve({ data: visits, error: null }).then(res),
    };
    return chain;
  },
});

/* ══ อ่าน — เปิดทั้งฝ่าย ══════════════════════════════════════════════ */

test('🔑 ช่างหน้างานเปิดดูรูปของใบที่ส่งถึงฝ่ายตัวเองได้', async () => {
  const db = dbWith();
  for (const u of [CREW, OTHER_CREW, PLANNER, HEAD]) {
    assert.equal(await canViewCostingAttachment(db, 'service_survey_zone', ROW, u), true, u.role);
  }
});

/* ⚠️ ด่านอ่านเปิดให้ทั้งฝ่ายโดยตั้งใจ — ช่างต้องเปิดใบของกันและกันได้ตอนสลับคิว
   ของที่ต้องกันคือ *การแก้* ซึ่งกันที่นัดอีกชั้น (ดูกลุ่มถัดไป) */
test('ช่างที่ไม่ได้ถูกมอบหมาย ยังเปิดดูได้ — แต่แนบไม่ได้', async () => {
  const db = dbWith();
  assert.equal(await canViewCostingAttachment(db, 'service_survey_zone', ROW, OTHER_CREW), true);
  assert.equal(await canAttachToCosting(db, 'service_survey_zone', ROW, OTHER_CREW), false);
});

/* 🔴 กับดักที่ใหญ่ที่สุดของการแก้นี้ — บันไดชั้นนอกใช้ร่วมกันทั้งสามชนิดคำร้อง
   ลืมตรวจ `request.dept` เมื่อไร ช่างจะอ่านไฟล์แนบของคำร้อง RD/PC/FN ได้ */
test('🔴 ใบของฝ่ายอื่น ช่างต้องเปิดไม่ได้', async () => {
  const db = dbWith({ ...REQ, dept: 'RD', kind: 'scent_dev' });
  assert.equal(await canViewCostingAttachment(db, 'service_survey_zone', ROW, CREW), false);
  assert.equal(await canAttachToCosting(db, 'service_survey_zone', ROW, CREW), false);
});

test('คนนอกโมดูลบริการที่ไม่เกี่ยวกับใบ เปิดไม่ได้', async () => {
  const db = dbWith();
  assert.equal(await canViewCostingAttachment(db, 'service_survey_zone', ROW, RD), false);
});

test('ฝ่ายขายเจ้าของใบยังเปิดดูได้เหมือนเดิม', async () => {
  const db = dbWith();
  assert.equal(await canViewCostingAttachment(db, 'service_survey_zone', ROW, SA), true);
});

/* ══ เขียน — แคบลงที่นัด ═══════════════════════════════════════════════ */

test('🔑 ช่างที่ถูกมอบหมายนัดของใบนี้ แนบรูปได้', async () => {
  assert.equal(await canAttachToCosting(dbWith(), 'service_survey_zone', ROW, CREW), true);
});

test('คนคุมคิว/หัวหน้าแนบได้เสมอ ไม่ต้องถูกมอบหมาย', async () => {
  const db = dbWith();
  for (const u of [PLANNER, HEAD, ADMIN]) {
    assert.equal(await canAttachToCosting(db, 'service_survey_zone', ROW, u), true, u.role);
  }
});

/* 🔴 ล็อกเวลาต้องเป็นตัวเดียวกับผลวัด ไม่ใช่ `status closed/cancelled` ของคำร้อง
   ⇒ ไม่งั้นใบที่ส่งผลไปแล้ว "แก้ตัวเลขไม่ได้ แต่สลับรูปได้" — SA เห็นภาพคนละใบกับ
     ตอนที่เขารับผล โดยไม่มีร่องรอย */
test('🔴 ส่งผลให้ฝ่ายขายไปแล้ว แนบเพิ่มไม่ได้ (ยกเว้นแอดมิน)', async () => {
  const sent = dbWith({ ...REQ, answeredAt: '2026-09-10T00:00:00Z' });
  for (const u of [CREW, PLANNER, HEAD]) {
    assert.equal(await canAttachToCosting(sent, 'service_survey_zone', ROW, u), false, u.role);
  }
  // แอดมินเก็บกวาดไฟล์ที่แนบผิดใบได้ — กติกาเดิมของไฟล์ด่าน
  assert.equal(await canAttachToCosting(sent, 'service_survey_zone', ROW, ADMIN), true);
  // แต่ยังเปิดดูได้ทุกคน — ด่านอ่านไม่ผูกกับเวลา
  assert.equal(await canViewCostingAttachment(sent, 'service_survey_zone', ROW, CREW), true);
});

test('ใบที่ถูกยกเลิก แนบไม่ได้', async () => {
  const cancelled = dbWith({ ...REQ, cancelledAt: 'x', status: 'cancelled' });
  assert.equal(await canAttachToCosting(cancelled, 'service_survey_zone', ROW, CREW), false);
});

test('แถวที่ไม่มีใบแม่ = ปฏิเสธ (fail-closed)', async () => {
  const db = dbWith(null);
  assert.equal(await canViewCostingAttachment(db, 'service_survey_zone', { id: 'x' }, CREW), false);
  assert.equal(await canAttachToCosting(db, 'service_survey_zone', { id: 'x' }, CREW), false);
});

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────── */

/* 🔴 ทางลัดที่ห้ามใช้: เติม cap ให้ role ts — `costing:view` เปิดทะเบียนราคาทั้งระบบ
   แล้วยังแก้บั๊กไม่ได้ (ตกด่านรายแถวอยู่ดี) · `requests:answer` เปิดปุ่มรับเรื่อง/
   มอบหมาย/ปิดใบของคำร้องฝ่าย TS ทั้งชุด ซึ่งขัดมติ 2026-08-30 */
test('🔴 role ts ต้องไม่ถูกเติม cap ของระบบคำร้อง/ราคา', async () => {
  const { capsFor } = await import('@/lib/permissions');
  const caps = capsFor('ts');
  assert.equal(caps.includes('costing:view'), false);
  assert.equal(caps.includes('requests:answer'), false);
  assert.ok(caps.includes('service:work'), 'ช่างถือสิทธิ์งานหน้างานเหมือนเดิม');
});

test('🔴 สาขาของผลวัดต้องแยกก่อนถึงบันไดคำร้อง และถามด่านของโมดูลบริการ', () => {
  const gate = code('../master/costingAttachmentAccess.js');
  const viewAt = gate.indexOf("if (entityType === 'service_survey_zone') return canViewSurveyZoneFiles");
  const ladderAt = gate.indexOf('if (!canViewRequests(user)) return false;');
  assert.ok(viewAt > 0 && ladderAt > viewAt, 'ต้องแยกก่อนถึง canViewRequests');
  assert.match(gate, /surveyReadError\(user, req\) === null/);
  assert.match(gate, /visitWriteAccess\(\{ user, visit, canEditAll \}\)/);
  assert.match(gate, /surveyEditLockError\(req\)/);
});

/* 🐞 พาเนลสามอันชี้ entity เดียวกัน — ไม่กรองตามหัวข้อ = อัปภาพกว้างแล้วไปโผล่
   ครบทั้งสามหัวข้อ และเลข "N ไฟล์" เท่ากันหมด ⇒ ช่างอ่านว่าภาพผังมีแล้ว */
test('🔴 พาเนลที่ประกาศหัวข้อของตัวเอง ต้องโชว์เฉพาะไฟล์ของหัวข้อนั้น', () => {
  const panel = code('../../components/AttachmentsPanel.js');
  assert.match(panel, /const scoped = Array\.isArray\(docTypes\) && docTypes\.length === 1;/);
  assert.match(panel, /const shown = scoped \? items\.filter\(\(it\) => it\.docType === inlineType\) : items;/);
  assert.match(panel, /\{shown\.length\} ไฟล์/,
    'ตัวนับต้องนับของที่โชว์จริง ไม่ใช่ของทั้ง entity');

  // ผู้เรียกที่ไม่ประกาศ docTypes ต้องไม่โดนกรอง (อีก 11 จุดใช้ทะเบียนของ entity ทั้งชุด)
  assert.doesNotMatch(panel, /const shown = items\.filter/);
});
