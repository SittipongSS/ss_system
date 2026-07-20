// Tests กติกาลีด (เฟส C): channel group, transition map, SLA วันทำการ.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  LEAD_CHANNELS, channelGroupOf, LEAD_TRANSITIONS, TRANSITION_TO_STATUS,
  slaBusinessDays, slaHit, SERVICE_DETAIL_REQUIRED,
  canEditLead, canDeleteLead, LEAD_LOCKED_STATUSES,
} from './leads';

test('channelGroupOf: chatcone→online, phone/walkin→onsite, website→website', () => {
  assert.equal(channelGroupOf('chatcone_line'), 'online');
  assert.equal(channelGroupOf('chatcone_ig'), 'online');
  assert.equal(channelGroupOf('phone'), 'onsite');
  assert.equal(channelGroupOf('walkin'), 'onsite');
  assert.equal(channelGroupOf('website'), 'website');
});

test('transition map: ทุก action ชี้สถานะปลายทางที่รู้จัก + สถานะปิดไม่มีทางไปต่อ', () => {
  for (const actions of Object.values(LEAD_TRANSITIONS)) {
    for (const a of actions) assert.ok(TRANSITION_TO_STATUS[a], `action ${a} ไม่มีปลายทาง`);
  }
  // qualified ไม่ปิดตาย: สร้างดีลซ้ำได้ (1 ลีด → หลายดีล, mig 0093 floating deals)
  assert.deepEqual(LEAD_TRANSITIONS.qualified, ['create_deal']);
  assert.deepEqual(LEAD_TRANSITIONS.disqualified, []);
  assert.equal(TRANSITION_TO_STATUS.bounce, 'new'); // ตีกลับ → คิวคัดกรอง
});

test('SLA วันทำการ: วันเดียวกัน=0 (ทัน), วันทำการถัดไป=1 (ทัน), ข้าม 2 วันทำการ=พลาด', () => {
  const noHolidays = new Set();
  // ศุกร์ 2026-07-10 → ศุกร์เดียวกัน = 0
  assert.equal(slaBusinessDays('2026-07-10T09:00:00Z', '2026-07-10T15:00:00Z', noHolidays), 0);
  assert.equal(slaHit('2026-07-10T09:00:00Z', '2026-07-10T15:00:00Z', noHolidays), true);
  // ศุกร์ → จันทร์ (ข้ามเสาร์-อาทิตย์) = 1 วันทำการ → ยังทัน SLA
  assert.equal(slaBusinessDays('2026-07-10', '2026-07-13', noHolidays), 1);
  assert.equal(slaHit('2026-07-10', '2026-07-13', noHolidays), true);
  // ศุกร์ → อังคาร = 2 วันทำการ → พลาด
  assert.equal(slaBusinessDays('2026-07-10', '2026-07-14', noHolidays), 2);
  assert.equal(slaHit('2026-07-10', '2026-07-14', noHolidays), false);
  // วันหยุดนักขัตฤกษ์คั่น: ศุกร์ → อังคาร แต่จันทร์เป็นวันหยุด = 1 → ทัน
  assert.equal(slaHit('2026-07-10', '2026-07-14', new Set(['2026-07-13'])), true);
  // ไม่มีปลายทาง (ยังไม่เกิดเหตุการณ์) → null
  assert.equal(slaHit('2026-07-10', null, noHolidays), null);
  // ปลายทางก่อนต้นทาง (เวลาผิดลำดับ เช่น firstContactAt ค้างจากรอบก่อน bounce) →
  // ไม่นับเป็น "ทัน" (กัน KPI พอง) — คืน null ไม่ใช่ true
  assert.equal(slaHit('2026-07-13', '2026-07-10', noHolidays), null);
});

test('service detail บังคับเฉพาะ product/other', () => {
  assert.ok(SERVICE_DETAIL_REQUIRED.has('product'));
  assert.ok(SERVICE_DETAIL_REQUIRED.has('other'));
  assert.ok(!SERVICE_DETAIL_REQUIRED.has('diffuser'));
  assert.equal(LEAD_CHANNELS.length, 7);
});

test('MKT แก้/ลบได้เฉพาะใบตัวเอง "ก่อนคัดกรอง" — คัดกรองแล้วส่งมอบฝ่ายขาย (มติ 2026-07-20)', () => {
  const mkt = { role: 'marketing', id: 'mk1' };
  const own = (status) => ({ status, createdBy: 'mk1', team: null, assigneeId: null });
  // ก่อนคัดกรอง (new) — แก้/ลบของตัวเองได้
  assert.equal(canEditLead(mkt, own('new')), true);
  assert.equal(canDeleteLead(mkt, own('new')), true);
  // คัดกรองแล้ว/มอบหมายแล้ว — ห้ามทั้งแก้และลบ แม้เป็นใบที่ตัวเองกรอก
  for (const status of ['screened', 'assigned', ...LEAD_LOCKED_STATUSES]) {
    assert.equal(canEditLead(mkt, own(status)), false, `edit ${status}`);
    assert.equal(canDeleteLead(mkt, own(status)), false, `delete ${status}`);
  }
  // ใบของคนอื่น — แตะไม่ได้แม้ยัง new
  assert.equal(canEditLead(mkt, { status: 'new', createdBy: 'mk2' }), false);
  assert.equal(canDeleteLead(mkt, { status: 'new', createdBy: 'mk2' }), false);
});

test('นโยบายแก้/ลบของ role อื่นคงเดิม: admin ทุกสถานะ, supervisor ก่อนติดต่อ, ทีมขายตาม scope', () => {
  const lead = (status, extra = {}) => ({ status, createdBy: 'mk1', team: 'KA', assigneeId: null, ...extra });
  // admin — ทุกใบทุกสถานะ
  assert.equal(canEditLead({ role: 'admin', id: 'a1' }, lead('qualified')), true);
  assert.equal(canDeleteLead({ role: 'admin', id: 'a1' }, lead('qualified')), true);
  // supervisor — ก่อนเริ่มติดต่อ
  const sup = { role: 'ae_supervisor', id: 's1' };
  assert.equal(canEditLead(sup, lead('screened')), true);
  assert.equal(canDeleteLead(sup, lead('assigned')), true);
  assert.equal(canEditLead(sup, lead('contacted')), false);
  // senior_ae — เฉพาะทีมตัวเอง (หรือยังไม่มีทีม) และลบไม่ได้
  assert.equal(canEditLead({ role: 'senior_ae', id: 'se1', team: 'KA' }, lead('screened')), true);
  assert.equal(canEditLead({ role: 'senior_ae', id: 'se1', team: 'ODM' }, lead('screened')), false);
  assert.equal(canDeleteLead({ role: 'senior_ae', id: 'se1', team: 'KA' }, lead('screened')), false);
  // ae — เฉพาะใบที่ถูกมอบหรือกรอกเอง และลบไม่ได้
  assert.equal(canEditLead({ role: 'ae', id: 'ae1' }, lead('assigned', { assigneeId: 'ae1' })), true);
  assert.equal(canEditLead({ role: 'ae', id: 'ae1' }, lead('assigned', { assigneeId: 'ae2' })), false);
  assert.equal(canDeleteLead({ role: 'ae', id: 'ae1' }, lead('assigned', { assigneeId: 'ae1' })), false);
});
