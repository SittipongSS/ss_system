// Tests กติกาลีด (เฟส C): channel group, transition map, SLA วันทำการ.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  LEAD_CHANNELS, channelGroupOf, LEAD_TRANSITIONS, TRANSITION_TO_STATUS,
  slaBusinessDays, slaHit, SERVICE_DETAIL_REQUIRED,
  canEditLead, canDeleteLead, canWorkLead, canCreateLead,
  LEAD_EDIT_LOCKED_STATUSES, LEAD_DELETE_LOCKED_STATUSES,
  meetingTimesSinceBounce, pickNextMeetingAt, inLeadScope, chunkLeadIds,
  sourceLeadIdOf, slaStage, slaPendingTone, channelRollup, withAssigneePending,
} from './leads';
import { bangkokDate } from './handoffQueue';
import { businessDayKey } from '../datePeriods';

test('channelGroupOf: chatcone/typeform→online, phone/walkin→onsite, website→website', () => {
  assert.equal(channelGroupOf('chatcone_line'), 'online');
  assert.equal(channelGroupOf('chatcone_ig'), 'online');
  assert.equal(channelGroupOf('typeform'), 'online');
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

test('slaStage: นับเฉพาะใบที่ผ่านด่านแล้ว — ใบที่ยังไม่ถึงด่านถัดไปไม่ใช่ "พลาด"', () => {
  const noHolidays = new Set();
  const rows = [
    // คัดกรองวันเดียวกัน แล้วกระจายวันทำการถัดไป → ทันทั้งสองด่าน
    { createdAt: '2026-07-10', screenedAt: '2026-07-10', assignedAt: '2026-07-13' },
    // คัดกรองทัน แต่กระจายช้า 2 วันทำการ → ด่านกระจายพลาด
    { createdAt: '2026-07-10', screenedAt: '2026-07-10', assignedAt: '2026-07-14' },
    // คัดกรองแล้วแต่ยังไม่ได้กระจาย = ของค้าง ต้อง**ไม่**เข้า checked ของด่านกระจาย
    { createdAt: '2026-07-10', screenedAt: '2026-07-10', assignedAt: null },
    // ยังไม่ถูกคัดกรองเลย — ไม่เข้า checked ของด่านไหนทั้งนั้น
    { createdAt: '2026-07-10', screenedAt: null, assignedAt: null },
  ];
  assert.deepEqual(slaStage(rows, 'createdAt', 'screenedAt', noHolidays), { checked: 3, hit: 3 });
  assert.deepEqual(slaStage(rows, 'screenedAt', 'assignedAt', noHolidays), { checked: 2, hit: 1 });
});

test('slaStage: เวลาผิดลำดับไม่นับเป็นทัน (กัน KPI พองหลังตีกลับ)', () => {
  const noHolidays = new Set();
  // assignedAt ก่อน screenedAt = ข้อมูลค้างจากรอบก่อน — slaHit คืน null ต้องไม่ถูกนับเป็น hit
  const rows = [{ screenedAt: '2026-07-13', assignedAt: '2026-07-10' }];
  assert.deepEqual(slaStage(rows, 'screenedAt', 'assignedAt', noHolidays), { checked: 1, hit: 0 });
});

/* ── ตีกลับแล้วคัดใหม่: สามด่านต้องวัดของรอบที่ถูกต้อง (mig 0234) ─────────────
   🐞 เดิม `screenedAt` เก็บครั้งแรกอย่างเดียว ส่วน `assignedAt` เขียนทับทุกครั้ง ⇒
   ด่านกระจายวัด "คัดกรองครั้งแรก → มอบครั้งล่าสุด" = กินเวลารอบตีกลับทั้งรอบ
   Senior AE ที่มอบภายในวันเดียวถูกนับเป็นไม่ทันโดยไม่มีทางแก้ตัว */
test('ตีกลับแล้วคัดใหม่: ด่านคัดกรองนับครั้งแรก · ด่านกระจายนับรอบปัจจุบัน', () => {
  const noHolidays = new Set();
  // ใบที่ผ่านรอบตีกลับมา: คัดกรองครั้งแรก 10 ก.ค. (ทัน) → ตีกลับ → คัดใหม่ 20 ก.ค.
  // → มอบวันเดียวกัน (ทัน) · คอลัมน์ของรอบปัจจุบันคือ 20 ก.ค. ทั้งคู่
  const rows = [{
    createdAt: '2026-07-10',
    firstScreenedAt: '2026-07-10',
    screenedAt: '2026-07-20',
    assignedAt: '2026-07-20',
  }];
  assert.deepEqual(slaStage(rows, 'createdAt', 'firstScreenedAt', noHolidays), { checked: 1, hit: 1 },
    'คัดกรองรอบแรกทัน — rework ไม่ลบผลงานรอบนั้น');
  assert.deepEqual(slaStage(rows, 'screenedAt', 'assignedAt', noHolidays), { checked: 1, hit: 1 },
    'มอบวันเดียวกับที่คัดใหม่ = ทัน · วัดจาก screenedAt รอบก่อนเมื่อไรจะกลายเป็นพลาด 6 วันทำการ');
  // 🐞 ท่าเดิม: ด่านกระจายเริ่มจาก firstScreenedAt (= screenedAt เดิมของครั้งแรก)
  assert.deepEqual(slaStage(rows, 'firstScreenedAt', 'assignedAt', noHolidays), { checked: 1, hit: 0 },
    'ยืนยันว่าคู่ timestamp เดิมให้ผลผิดจริง — ไม่ใช่แค่เปลี่ยนชื่อคอลัมน์เฉย ๆ');
});

test('ใบที่ถูกตีกลับกลับไปคิวคัดกรอง: หล่นออกจาก checked ของทุกด่าน ไม่ใช่ "พลาด"', () => {
  const noHolidays = new Set();
  // สถานะ new หลังตีกลับ — ตีกลับล้าง screenedAt/assignedAt/firstContactAt ครบ
  // เหลือแค่ firstScreenedAt ไว้เป็นประวัติของด่านแรก
  const rows = [{
    createdAt: '2026-07-10', firstScreenedAt: '2026-07-10',
    screenedAt: null, assignedAt: null, firstContactAt: null,
  }];
  assert.deepEqual(slaStage(rows, 'createdAt', 'firstScreenedAt', noHolidays), { checked: 1, hit: 1 });
  assert.deepEqual(slaStage(rows, 'screenedAt', 'assignedAt', noHolidays), { checked: 0, hit: 0 });
  assert.deepEqual(slaStage(rows, 'assignedAt', 'firstContactAt', noHolidays), { checked: 0, hit: 0 });
});

test('slaStage: ไม่มีแถวเลย → checked 0 (ไม่ระเบิด, ไม่หารศูนย์ที่ผู้เรียก)', () => {
  assert.deepEqual(slaStage([], 'screenedAt', 'assignedAt', new Set()), { checked: 0, hit: 0 });
  assert.deepEqual(slaStage(undefined, 'screenedAt', 'assignedAt', new Set()), { checked: 0, hit: 0 });
});

test('SLA ใช้วันไทย ไม่ใช่วัน UTC — ลีดดึงดึกต้องไม่โดนหักวันฟรี', () => {
  const noHolidays = new Set();
  // 2026-08-10T18:30Z = 2026-08-11 01:30 ตามเวลาไทย ⇒ "วันที่เข้ามา" คือ 11 ไม่ใช่ 10
  const nightLead = '2026-08-10T18:30:00.000Z';   // อังคาร 01:30 น. เวลาไทย
  const nextDay   = '2026-08-12T03:00:00.000Z';   // พุธ 10:00 น. เวลาไทย
  // วันไทย: 11 → 12 = 1 วันทำการ ⇒ ทัน
  assert.equal(slaBusinessDays(nightLead, nextDay, noHolidays), 1);
  assert.equal(slaHit(nightLead, nextDay, noHolidays), true);
  // 🐞 ถ้าหาวันด้วย slice(0,10) จะได้ 10 → 12 = 2 วันทำการ ⇒ พลาดทั้งที่ทำทัน
  assert.notEqual(slaBusinessDays(nightLead, nextDay, noHolidays), 2);
});

test('นาฬิกาเดียวกันทั้งระบบ: bangkokDate ของคิวรอยต่อ = businessDayKey', () => {
  // ถ้าใครแอบเขียนวิธีหาวันของตัวเองเพิ่ม เทสนี้จะพัง — ตัวเลข SLA กับ "ค้างกี่วัน"
  // ต้องมาจากนาฬิกาเรือนเดียวกันเสมอ ไม่งั้นสองการ์ดบนจอเดียวกันเถียงกันเองได้
  for (const iso of [
    '2026-08-10T18:30:00.000Z', // 01:30 น. วันไทยถัดไป
    '2026-08-10T10:00:00.000Z', // 17:00 น. วันเดียวกัน
    '2026-08-10T16:59:59.000Z', // 23:59 น. วันเดียวกัน (ขอบ)
    '2026-08-10T17:00:00.000Z', // 00:00 น. วันถัดไป (ขอบ)
  ]) {
    assert.equal(bangkokDate(iso), businessDayKey(iso), `วันไม่ตรงกันที่ ${iso}`);
  }
  assert.equal(bangkokDate(null), '');
  assert.equal(bangkokDate('ไม่ใช่วันที่'), '');
});

test('channelRollup: ช่องสถานะไม่ซ้อนกัน รวมกันเท่าจำนวนลีดของช่องทางนั้นเป๊ะ', () => {
  const rows = [
    // เปิดลูกค้าแล้ว — เคยติดต่อและเคยนัดด้วย ⇒ นับใน funnel ทุกขั้น แต่สถานะอยู่ช่อง won ช่องเดียว
    { channel: 'chatcone_line', firstContactAt: 'x', meetingAt: 'x', status: 'qualified' },
    // ไม่ไปต่อ ทั้งที่เคยติดต่อ ⇒ ต้องไปอยู่ lost ไม่ใช่ talking
    { channel: 'chatcone_line', firstContactAt: 'x', status: 'disqualified' },
    { channel: 'chatcone_line', firstContactAt: 'x', status: 'contacted' },
    { channel: 'chatcone_line', status: 'assigned' },
    { channel: 'typeform', status: 'new' },
  ];
  const [line, typeform] = channelRollup(rows);
  assert.equal(line.channel, 'chatcone_line');
  assert.equal(line.group, 'online');
  assert.deepEqual(
    { count: line.count, contacted: line.contacted, meeting: line.meeting, qualified: line.qualified },
    { count: 4, contacted: 3, meeting: 1, qualified: 1 },
  );
  assert.deepEqual(
    { won: line.won, lost: line.lost, talking: line.talking, untouched: line.untouched },
    { won: 1, lost: 1, talking: 1, untouched: 1 },
  );
  // 🐞 หัวใจ: สี่ช่องสถานะรวมกันต้องเท่ากับจำนวนลีด ไม่งั้นแท่งสัดส่วนจะยาวเกินราง
  assert.equal(line.won + line.lost + line.talking + line.untouched, line.count);
  assert.equal(typeform.count, 1);
  assert.equal(typeform.untouched, 1);
});

test('channelRollup: เรียงจากช่องทางที่เข้ามาเยอะสุด · ไม่มีช่องทางคืน unknown ไม่ระเบิด', () => {
  const rows = [
    { channel: 'website' }, { channel: 'website' }, { channel: 'phone' }, {},
  ];
  const out = channelRollup(rows);
  assert.deepEqual(out.map((r) => r.channel), ['website', 'phone', 'unknown']);
  assert.equal(out[0].count, 2);
  assert.deepEqual(channelRollup([]), []);
  assert.deepEqual(channelRollup(undefined), []);
});

test('withAssigneePending: AE ที่เดือนนี้ไม่มีลีดใหม่แต่ยังกองของเก่า ต้องไม่หายจากตาราง', () => {
  const monthly = [
    { assigneeId: 'a', name: 'AE ก', team: 'ODM', assigned: 10, contacted: 9, slaHit: 8, meetings: 1, qualified: 2 },
    { assigneeId: 'b', name: 'AE ข', team: 'SV', assigned: 3, contacted: 3, slaHit: 3, meetings: 0, qualified: 0 },
  ];
  // 'c' ไม่มีลีดของเดือนนี้เลย แต่ถือของค้างข้ามเดือนมา 7 ใบ — เคสที่ตารางต้องจับให้ได้
  const pending = { a: 2, c: 7 };
  const out = withAssigneePending(monthly, pending, { c: { name: 'AE ค', team: 'SV' } });

  assert.deepEqual(out.map((r) => [r.assigneeId, r.pending]), [['c', 7], ['a', 2], ['b', 0]],
    'เรียงตามของค้างมากสุด และต้องมีแถวของ c ที่ไม่ได้อยู่ใน monthly');
  const c = out.find((r) => r.assigneeId === 'c');
  assert.equal(c.name, 'AE ค');
  assert.equal(c.team, 'SV', 'ทีมต้องมาจากใบที่เขาถือค้างอยู่ ไม่ใช่ค้างเป็น null');
  // คอลัมน์ผลงานรายเดือนของคนที่ไม่มีลีดเดือนนี้ต้องเป็น 0 ตามจริง ไม่ใช่ undefined
  assert.deepEqual(
    { assigned: c.assigned, contacted: c.contacted, qualified: c.qualified },
    { assigned: 0, contacted: 0, qualified: 0 },
  );
  // แถวเดิมต้องไม่ถูกแตะนอกจากเติม pending
  assert.equal(out.find((r) => r.assigneeId === 'a').qualified, 2);
});

test('withAssigneePending: ไม่มีของค้างเลย → แถวเดิมครบ pending เป็น 0 · อินพุตว่างไม่ระเบิด', () => {
  const monthly = [{ assigneeId: 'a', name: 'AE ก', assigned: 5 }];
  assert.deepEqual(withAssigneePending(monthly, {}).map((r) => r.pending), [0]);
  assert.deepEqual(withAssigneePending(monthly, null).map((r) => r.pending), [0]);
  assert.deepEqual(withAssigneePending([], {}), []);
  assert.deepEqual(withAssigneePending(undefined, undefined), []);
  // ค่าศูนย์ใน pending ต้องไม่สร้างแถวผีให้คนที่ไม่มีอะไรค้าง
  assert.deepEqual(withAssigneePending([], { ghost: 0 }), []);
});

test('slaPendingTone: null = นับไม่ได้ ต้องไม่ขึ้นเขียว · 0 = ไม่มีของค้างจริง ๆ', () => {
  assert.equal(slaPendingTone(0), 'good');
  assert.equal(slaPendingTone(7), 'warning');
  // 🐞 หัวใจของบั๊ก: `pending ?? 0` เคยกลบ null เป็น 0 แล้วได้ "good"
  assert.equal(slaPendingTone(null), undefined);
  assert.equal(slaPendingTone(undefined), undefined);
});

test('service detail บังคับเฉพาะ product/other', () => {
  assert.ok(SERVICE_DETAIL_REQUIRED.has('product'));
  assert.ok(SERVICE_DETAIL_REQUIRED.has('other'));
  assert.ok(!SERVICE_DETAIL_REQUIRED.has('diffuser'));
  assert.equal(LEAD_CHANNELS.length, 8);
});

/* ⭐ มติผู้ใช้ 2026-08-08 กลับมติ 2026-07-20 — MKT แก้ใบตัวเองได้จนถึงก่อนเปิดดีล
   เหตุผล: ลูกค้าโทรมาแก้เบอร์/เพิ่มงบหลังส่งเข้าทีมแล้ว และคนที่รับสายคือ MKT ไม่ใช่ AE
   ⚠️ "ลบ" ไม่ได้ปลดตาม — ยังได้เฉพาะใบที่ยังไม่ถูกคัดกรอง */
test('MKT แก้ใบตัวเองได้ถึงก่อนเปิดดีล แต่ลบได้เฉพาะก่อนคัดกรอง (มติ 2026-08-08)', () => {
  const mkt = { role: 'marketing', id: 'mk1' };
  const own = (status) => ({ status, createdBy: 'mk1', team: null, assigneeId: null });

  for (const status of ['new', 'screened', 'assigned', 'contacted', 'meeting']) {
    assert.equal(canEditLead(mkt, own(status)), true, `edit ${status} ต้องได้`);
  }
  // เปิดดีล/ปิดลีดแล้ว — ลีดกลายเป็นบันทึกต้นทาง งานย้ายไปที่ดีล
  for (const status of LEAD_EDIT_LOCKED_STATUSES) {
    assert.equal(canEditLead(mkt, own(status)), false, `edit ${status} ต้องล็อก`);
  }
  // ลบ — เฉพาะใบตัวเองที่ยังไม่ถูกคัดกรอง (นโยบายเดิม ไม่ปลดตาม)
  assert.equal(canDeleteLead(mkt, own('new')), true);
  for (const status of ['screened', 'assigned', ...LEAD_DELETE_LOCKED_STATUSES]) {
    assert.equal(canDeleteLead(mkt, own(status)), false, `delete ${status}`);
  }
  // ใบของคนอื่น — แตะไม่ได้แม้ยัง new (ขอบเขตแถวไม่เปลี่ยน)
  assert.equal(canEditLead(mkt, { status: 'new', createdBy: 'mk2' }), false);
  assert.equal(canDeleteLead(mkt, { status: 'new', createdBy: 'mk2' }), false);
});

test('แก้ลีด: ปลดถึงก่อนเปิดดีล · ขอบเขตแถวคงเดิม · ลบยังเข้มเท่าเดิม (มติ 2026-08-08)', () => {
  const lead = (status, extra = {}) => ({ status, createdBy: 'mk1', team: 'KA', assigneeId: null, ...extra });
  // admin — ทุกใบทุกสถานะ รวมที่ล็อกแล้ว
  assert.equal(canEditLead({ role: 'admin', id: 'a1' }, lead('qualified')), true);
  assert.equal(canDeleteLead({ role: 'admin', id: 'a1' }, lead('qualified')), true);

  // supervisor — แก้ได้ทุกใบถึงก่อนเปิดดีล แต่ "ลบ" ยังหยุดที่ก่อนติดต่อเหมือนเดิม
  const sup = { role: 'ae_supervisor', id: 's1' };
  assert.equal(canEditLead(sup, lead('screened')), true);
  assert.equal(canEditLead(sup, lead('contacted')), true, 'ติดต่อแล้วยังแก้ได้ (มติใหม่)');
  assert.equal(canEditLead(sup, lead('meeting')), true);
  assert.equal(canEditLead(sup, lead('qualified')), false, 'เปิดดีลแล้วต้องล็อก');
  assert.equal(canDeleteLead(sup, lead('assigned')), true);
  assert.equal(canDeleteLead(sup, lead('contacted')), false, 'ลบไม่ได้ปลดตามการแก้');

  // senior_ae — เฉพาะทีมตัวเอง (หรือยังไม่มีทีม) และลบไม่ได้
  assert.equal(canEditLead({ role: 'senior_ae', id: 'se1', team: 'KA' }, lead('contacted')), true);
  assert.equal(canEditLead({ role: 'senior_ae', id: 'se1', team: 'ODM' }, lead('contacted')), false);
  assert.equal(canDeleteLead({ role: 'senior_ae', id: 'se1', team: 'KA' }, lead('screened')), false);

  // ae — เฉพาะใบที่ถูกมอบหรือกรอกเอง และลบไม่ได้
  assert.equal(canEditLead({ role: 'ae', id: 'ae1' }, lead('meeting', { assigneeId: 'ae1' })), true);
  assert.equal(canEditLead({ role: 'ae', id: 'ae1' }, lead('meeting', { assigneeId: 'ae2' })), false);
  assert.equal(canDeleteLead({ role: 'ae', id: 'ae1' }, lead('assigned', { assigneeId: 'ae1' })), false);
});

/* ⭐ AC = หลังบ้านของทีม SA — เดินงานให้ทีมได้ แต่ไม่ใช่เจ้าของข้อมูลใบไหน
   (มติ 2026-08-08 · คู่กับการตัด AC ออกจาก LEAD_ASSIGNEE_ROLES) */
test('AC แก้/ลบลีดไม่ได้เลย แม้เป็นลีดของทีมตัวเอง — แต่ยังเดินงานได้', () => {
  const ac = { role: 'ac', id: 'ac1', team: 'KA' };
  for (const status of ['new', 'screened', 'assigned', 'contacted', 'meeting', 'qualified']) {
    const row = { status, team: 'KA', createdBy: 'ac1', assigneeId: 'ac1' };
    assert.equal(canEditLead(ac, row), false, `AC ต้องแก้ ${status} ไม่ได้`);
    assert.equal(canDeleteLead(ac, row), false, `AC ต้องลบ ${status} ไม่ได้`);
  }
  // แต่ยังเป็นกำลังของทีม — ติดต่อ/นัด/ปิด ทำได้ตามเดิม
  assert.equal(canWorkLead(ac, { status: 'assigned', team: 'KA', assigneeId: 'ae9' }), true);
});

test('supervisor จบงานที่คัดกรอง: ขั้นทำงาน (ติดต่อ/นัด/สร้างดีล) เป็นของทีมเจ้าของงาน (มติ 2026-07-21)', () => {
  const lead = { status: 'assigned', team: 'ODM', assigneeId: 'u-ae' };
  // supervisor — เหลือเฉพาะกำกับดูแล (ตีกลับ/ไม่ไปต่อ ซึ่ง gate แยกที่ oversightScope)
  assert.equal(canWorkLead({ role: 'ae_supervisor', id: 'u-sup' }, lead), false);
  // admin — escape hatch ตามธรรมเนียมทั้งระบบ
  assert.equal(canWorkLead({ role: 'admin', id: 'u-admin' }, lead), true);
  // ทีมเจ้าของงาน: senior/ac ทีมเดียวกัน + ae ผู้รับมอบ
  assert.equal(canWorkLead({ role: 'senior_ae', id: 'u-sr', team: 'ODM' }, lead), true);
  assert.equal(canWorkLead({ role: 'senior_ae', id: 'u-sr', team: 'KA' }, lead), false);
  assert.equal(canWorkLead({ role: 'ac', id: 'u-ac', team: 'ODM' }, lead), true);
  assert.equal(canWorkLead({ role: 'ae', id: 'u-ae', team: 'ODM' }, lead), true);
  assert.equal(canWorkLead({ role: 'ae', id: 'u-other', team: 'ODM' }, lead), false);
  assert.equal(canWorkLead({ role: 'marketing', id: 'u-mkt' }, lead), false);
  // ปุ่มกำกับดูแลยังอยู่ใน transition map หลังคัดกรอง
  assert.ok(LEAD_TRANSITIONS.screened.includes('bounce'));
  assert.ok(LEAD_TRANSITIONS.assigned.includes('disqualify'));
});

// มติผู้ใช้ 2026-07-30: หัวหน้าฝ่ายขาย (ae_supervisor) เพิ่มลีดเข้าคิวเองได้ ไม่ต้องฝาก MKT
// กรอกแทน — ฝ่ายขายที่เหลือยังเพิ่มไม่ได้ (ลีดต้องเข้าคิวกลางก่อนถูกคัดกรอง)
test('เพิ่มลีดได้เฉพาะ MKT + admin/หัวหน้าฝ่ายขาย — role ขายอื่นเพิ่มไม่ได้', () => {
  assert.equal(canCreateLead('marketing'), true);
  assert.equal(canCreateLead('admin'), true);
  assert.equal(canCreateLead('ae_supervisor'), true);
  for (const role of ['senior_ae', 'ac', 'ae', 'rd', 'legal', 'executive', 'viewer', 'secretary', 'staff', undefined]) {
    assert.equal(canCreateLead(role), false, `${role} ต้องเพิ่มลีดไม่ได้`);
  }
});

// ปุ่ม "รับลีดใหม่" บนหน้า list กับด่าน POST ต้องอ่านกติกาตัวเดียวกัน — เคยเขียนซ้ำสองที่
// (route.js กับ page.js) ซึ่งเพี้ยนหากันได้เงียบ ๆ เวลาปรับสิทธิ์
test('canCreateLead: หน้า list และ API อ่านจากแหล่งเดียว ไม่เขียนกติกาซ้ำ', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/leads/route.js', import.meta.url),
    'utf8',
  );
  const pageSource = readFileSync(
    new URL('../../app/sales-planning/leads/page.js', import.meta.url),
    'utf8',
  );
  for (const [name, source] of [['route', routeSource], ['page', pageSource]]) {
    assert.match(source, /canCreateLead/, `${name} ต้องเรียก canCreateLead`);
    assert.doesNotMatch(
      source,
      /['"]marketing['"]\s*\|\|\s*(role\s*===\s*['"]admin['"]|isSuperuser\()/,
      `${name} ห้ามเขียนกติกา "ใครเพิ่มลีดได้" ซ้ำ — เรียก canCreateLead จาก lib/sales/leads`,
    );
  }
});

// บั๊กจริง 2026-07-29: ด่านตรวจสิทธิ์ "แตกดีลจากลีด" อ่าน metadata.leadId + metadata.source
// แต่คอลัมน์ sales_deals.leadId (แหล่งจริงที่หน้าลีดใช้หาดีลของตัวเอง) เขียนจาก body.leadId
// คนละช่อง → ส่ง leadId เดี่ยว ๆ ก็ผูกลีดทีมอื่นได้โดยไม่ผ่านด่าน ลีดไม่ถูกปิด qualified
// และไม่มี lead_event = conversion นับตกหล่น
test('sourceLeadIdOf: ด่านกับคอลัมน์ต้องได้ลีดใบเดียวกันเสมอ ไม่ว่า client ส่งช่องไหนมา', () => {
  assert.deepEqual(sourceLeadIdOf({ leadId: 'LEAD-1' }), { leadId: 'LEAD-1', error: null });
  assert.deepEqual(sourceLeadIdOf({ metadata: { leadId: 'LEAD-1' } }), { leadId: 'LEAD-1', error: null });
  // หน้าลีดส่งมาทั้งคู่ (ค่าเดียวกัน) — ต้องผ่านตามปกติ
  assert.deepEqual(
    sourceLeadIdOf({ leadId: 'LEAD-1', metadata: { leadId: 'LEAD-1', source: 'lead' } }),
    { leadId: 'LEAD-1', error: null },
  );
  // metadata.source ไม่ใช่เงื่อนไขอีกต่อไป — มี leadId = ต้องผ่านด่าน
  assert.equal(sourceLeadIdOf({ metadata: { leadId: 'LEAD-9' } }).leadId, 'LEAD-9');
  // ไม่มีลีดต้นทาง = ดีลอิสระ ไม่ต้องแตะลีด
  assert.equal(sourceLeadIdOf({}).leadId, null);
  assert.equal(sourceLeadIdOf({ leadId: '  ' }).leadId, null);
});

test('sourceLeadIdOf: ส่งสองช่องคนละใบ = เจตนากำกวม ต้องเด้ง ไม่ใช่เงียบ ๆ เลือกข้าง', () => {
  const clash = sourceLeadIdOf({ leadId: 'LEAD-1', metadata: { leadId: 'LEAD-2' } });
  assert.equal(clash.leadId, null);
  assert.match(clash.error, /ไม่ตรงกัน/);
});

// ล็อกสัญญาฝั่ง route: ค่าที่ผ่านด่านต้องเป็นค่าเดียวกับที่ลงคอลัมน์ ถ้ามีใครแยกสองช่อง
// กลับมาอีก เทสต์นี้ต้องแดง (ตรรกะจริงอยู่ใน route ที่ยังไม่มี harness เรียกตรง ๆ ได้)
test('POST /deals: ด่านลีดผูกกับ row.leadId ตัวเดียวกับที่เขียนลงคอลัมน์', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/deals/route.js', import.meta.url),
    'utf8',
  );
  assert.match(routeSource, /leadId: sourceLeadId,/, 'คอลัมน์ leadId ต้องมาจากค่าที่ resolve แล้ว');
  assert.match(routeSource, /if \(row\.leadId\) \{/, 'ด่านต้องยิงเมื่อ row.leadId มีค่า');
  assert.doesNotMatch(
    routeSource,
    /metadata\?\.source === 'lead'/,
    'metadata.source ห้ามกลับมาเป็นเงื่อนไขของด่าน — เป็นทางเขียนคอลัมน์ที่ไม่ผ่านด่าน',
  );
  assert.doesNotMatch(
    routeSource,
    /leadId: body\.leadId/,
    'ห้ามอ่าน body.leadId ตรง ๆ ลงคอลัมน์อีก ต้องผ่าน sourceLeadIdOf',
  );
});

/* ── นัดหลายครั้งต่อลีด (มติ 2026-08-08) ────────────────────────────────────
   เดิมนัดได้ครั้งเดียว: ถึงสถานะ `meeting` แล้วเหลือแค่เปิดดีล/ปิดลีด ⇒ เลื่อนนัดไม่ได้
   ตอนนี้วนกลับตัวเองได้ และตีกลับได้ถึงขั้นนัดแล้ว (ทีมไม่ตรงบางทีเพิ่งโผล่ตอนคุยกันจริง) */
test('สถานะ meeting: นัดเพิ่ม/เลื่อนนัดได้ · ตีกลับได้ · แต่ห้ามถอยกลับไป contacted', () => {
  assert.ok(LEAD_TRANSITIONS.meeting.includes('meeting'), 'ต้องนัดเพิ่ม/เลื่อนนัดได้');
  assert.ok(LEAD_TRANSITIONS.meeting.includes('bounce'), 'ตีกลับได้ถึงขั้นนัดแล้ว');
  assert.ok(LEAD_TRANSITIONS.meeting.includes('create_deal'));
  assert.ok(LEAD_TRANSITIONS.meeting.includes('disqualify'));
  // `contact` พาสถานะกลับไป contacted = ลีดถอยหลังจากที่นัดแล้ว — คุยเพิ่มใช้เธรดกลาง
  assert.ok(!LEAD_TRANSITIONS.meeting.includes('contact'),
    'contact จาก meeting จะดึงสถานะถอย (TRANSITION_TO_STATUS.contact === "contacted")');
  // วนกลับตัวเองต้องไม่ขยับสถานะ
  assert.equal(TRANSITION_TO_STATUS.meeting, 'meeting');
});

test('นัดของรอบปัจจุบัน: ตัดที่ bounce ตัวแรก — นัดของเจ้าของคนเก่าต้องไม่ฟื้น', () => {
  // เรียงใหม่ → เก่า เหมือนที่ route query มา
  const events = [
    { kind: 'meeting', eventAt: '2026-08-20T03:00:00+00:00' },
    { kind: 'meeting', eventAt: '2026-08-18T03:00:00+00:00' },
    { kind: 'bounce', eventAt: null },
    { kind: 'meeting', eventAt: '2026-07-01T03:00:00+00:00' }, // รอบก่อน — ต้องไม่ติดมา
  ];
  assert.deepEqual(meetingTimesSinceBounce(events), [
    '2026-08-20T03:00:00+00:00',
    '2026-08-18T03:00:00+00:00',
  ]);
  assert.deepEqual(meetingTimesSinceBounce([{ kind: 'bounce' }, { kind: 'meeting', eventAt: 'x' }]), []);
  assert.deepEqual(meetingTimesSinceBounce([]), []);
});

test('meetingAt = นัดถัดไปที่ยังไม่ถึง · ไม่เหลือในอนาคตจึงใช้นัดล่าสุดที่ผ่านมา', () => {
  const now = '2026-08-10T00:00:00.000Z';
  const past = '2026-08-05T07:00:00+00:00';
  const soon = '2026-08-12T03:00:00.000Z';
  const later = '2026-08-20T03:00:00+00:00';

  // ⚠️ เคสที่ทำให้ต้องมีฟังก์ชันนี้: บันทึกนัดที่ผ่านมาแล้วย้อนหลัง ห้ามทับนัดจริงในอนาคต
  assert.equal(pickNextMeetingAt([soon, past], now), soon);
  assert.equal(pickNextMeetingAt([later, soon], now), soon, 'ต้องได้นัดที่ใกล้ที่สุด');
  // ประชุมครบแล้ว — เหลือนัดล่าสุดที่ผ่านมา (funnel ยังนับว่า "มีนัด" ถูก)
  assert.equal(pickNextMeetingAt([past, '2026-08-01T03:00:00.000Z'], now), past);
  // ตรงเวลาพอดี = ยังนับว่ายังไม่ถึง
  assert.equal(pickNextMeetingAt([past, now], now), now);
  assert.equal(pickNextMeetingAt([], now), null);
  assert.equal(pickNextMeetingAt(['ไม่ใช่วันที่'], now), null);
  // 🐞 เรียงสตริงข้ามสองรูปแบบ (…Z กับ …+00:00) ให้ผลผิด — ต้องเทียบด้วยเวลาจริง
  assert.equal(pickNextMeetingAt(['2026-08-12T03:00:00+00:00', '2026-08-11T03:00:00.000Z'], now),
    '2026-08-11T03:00:00.000Z');
});

test('route ของ transition ต้องคำนวณ meetingAt ผ่านกติกากลาง ไม่ทับด้วยค่าที่กดล่าสุด', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/leads/[id]/transition/route.js', import.meta.url),
    'utf8',
  );
  assert.match(routeSource, /patch\.meetingAt = await nextMeetingAt\(/);
  assert.match(routeSource, /pickNextMeetingAt\(/);
  assert.doesNotMatch(routeSource, /patch\.meetingAt = body\.eventAt \|\| now/,
    'ทับตรง ๆ = นัดที่บันทึกย้อนหลังจะกลบนัดจริงในอนาคต');
});

/* ── ตีกลับต้องล้าง "ทั้งรอบ" ไม่ใช่ครึ่งรอบ (mig 0234) ──────────────────────
   กติกาอยู่ในไฟล์ route ที่ import มารันไม่ได้ (ต้องมี supabase/req) จึงอ่านซอร์ส
   มาเทียบแบบเดียวกับเทสต์ meetingAt ข้างบนและ leadAssignee.test.mjs */
test('route ตีกลับ: ล้างคอลัมน์ของรอบก่อนครบทั้งสี่ + เก็บ firstScreenedAt ไว้', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/leads/[id]/transition/route.js', import.meta.url),
    'utf8',
  );
  const bounceBlock = routeSource.split("action === 'bounce'")[1] || '';
  for (const field of ['screenedAt', 'assignedAt', 'firstContactAt', 'meetingAt']) {
    assert.match(bounceBlock, new RegExp(`patch\\.${field} = null`),
      `ตีกลับไม่ล้าง ${field} ⇒ ซากรอบก่อนทำให้ผัง Funnel และ SLA ของรอบใหม่เพี้ยน`);
  }
  assert.doesNotMatch(bounceBlock, /patch\.firstScreenedAt = null/,
    'firstScreenedAt = ประวัติครั้งแรกตลอดกาล ล้างแล้ว SLA คัดกรองของใบนั้นหายไปทั้งใบ');
  // คัดกรอง: เขียนสองคอลัมน์คนละกติกา — ครั้งแรกเก็บครั้งเดียว รอบปัจจุบันทับทุกครั้ง
  assert.match(routeSource, /patch\.firstScreenedAt = lead\.firstScreenedAt \|\| lead\.screenedAt \|\| now/);
  assert.match(routeSource, /patch\.screenedAt = now/);
  assert.doesNotMatch(routeSource, /patch\.screenedAt = lead\.screenedAt \|\| now/,
    'เก็บครั้งแรกไว้ในคอลัมน์เดียวกัน = ด่านกระจายกลับไปกินเวลารอบตีกลับอีก');
});

test('route KPI: ด่านคัดกรองวัดถึง firstScreenedAt · อีกสองด่านใช้คอลัมน์ของรอบปัจจุบัน', () => {
  const kpiSource = readFileSync(
    new URL('../../app/api/sales-planning/leads/kpi/route.js', import.meta.url),
    'utf8',
  );
  assert.match(kpiSource, /slaStage\(rows, 'createdAt', 'firstScreenedAt', holidays\)/);
  assert.match(kpiSource, /slaStage\(rows, 'screenedAt', 'assignedAt', holidays\)/);
  assert.match(kpiSource, /slaStage\(rows, 'assignedAt', 'firstContactAt', holidays\)/);
});

/* ── ด่านมองเห็นต้องเท่ากันทั้งสามเส้นเขียน (ปิดรู 2026-08-08) ────────────────
   🐞 GET มี `inLeadScope` แต่ PATCH ไม่มี ⇒ senior_ae ยิง URL ตรงเข้าไปแก้ลีดใน
   คิวกลาง (`new` · team ว่าง) ได้ ทั้งที่หาใบนั้นไม่เจอในลิสต์ตัวเอง */
test('inLeadScope: senior_ae/ac เห็นเฉพาะลีดที่คัดกรองเข้าทีมตัวเองแล้ว ไม่ใช่คิวกลาง', () => {
  const senior = { role: 'senior_ae', id: 'se1', team: 'KA' };
  assert.equal(inLeadScope(senior, { status: 'screened', team: 'KA' }), true);
  assert.equal(inLeadScope(senior, { status: 'screened', team: 'ODM' }), false);
  assert.equal(inLeadScope(senior, { status: 'new', team: null }), false, 'คิวกลางไม่ใช่ของหัวหน้าทีม');
  // ตรงกันข้ามกับ canEditLead ที่ยังยอม `!lead.team` — ด่านมองเห็นคือตัวที่กันจริง
  assert.equal(canEditLead(senior, { status: 'new', team: null }), true,
    'นโยบายแก้ยังยอม — แต่ route ต้องไม่ปล่อยให้ไปถึง');
});

test('GET/PATCH/DELETE ของลีด ต้องผ่าน inLeadScope ทั้งสามเส้น', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/leads/[id]/route.js', import.meta.url),
    'utf8',
  );
  const guards = routeSource.match(/if \(!inLeadScope\(user, (?:lead|before)\)\) return forbidden\(\);/g) || [];
  assert.equal(guards.length, 3,
    'เส้นเขียนที่ไม่มีด่านมองเห็น = ยิง URL ตรงข้ามขอบเขตได้ (ต้นเหตุของรูที่ PATCH)');
});

/* 🐞 ตรวจตัวเลข 2026-08-08: KPI ยัด id ลีดทั้งเดือนลง `.in()` ครั้งเดียวและไม่อ่าน error
   ⇒ พอ query string ยาวเกินลิมิต query ล้ม แล้ว `count || 0` กลบเป็น 0 เงียบ ๆ
   ตัวเลข "ตีกลับ" จึงโชว์ 0 ทั้งที่มีจริง — ยิ่งลีดเยอะยิ่งพังแน่ขึ้น */
test('chunkLeadIds: ซอยเป็นก้อนละ 200 · ทิ้งค่าว่าง · ไม่มี id = ไม่ต้องยิง query', () => {
  const ids = Array.from({ length: 450 }, (_, i) => `LEAD-${i}`);
  const chunks = chunkLeadIds(ids);
  assert.deepEqual(chunks.map((c) => c.length), [200, 200, 50]);
  assert.equal(chunks.flat().length, 450, 'ห้ามมี id ตกหล่น');
  assert.deepEqual(chunks.flat(), ids, 'ลำดับต้องคงเดิม');

  assert.deepEqual(chunkLeadIds([]), [], 'ไม่มี id → ไม่มีก้อน (ผู้เรียกข้าม query ได้เลย)');
  assert.deepEqual(chunkLeadIds(), []);
  assert.deepEqual(chunkLeadIds([null, 'LEAD-1', undefined, '']), [['LEAD-1']]);
  assert.deepEqual(chunkLeadIds(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
  // ขนาดพังต้องถอยไปค่าตั้งต้น ไม่ใช่วนไม่รู้จบ
  assert.deepEqual(chunkLeadIds(['a', 'b'], 0), [['a', 'b']]);
});

/* ตัวเลขที่ไม่มีใครแสดง = ไม่ต้องยิง query · "ตีกลับ" ออกจากแท็บตั้งแต่มติ 2026-08-11
   แต่ route ยังนับต่ออีกเป็นปี ⇒ จ่ายค่า query ทุกครั้งที่เปิดแท็บให้ค่าที่ทิ้งทันที
   เอากลับมาเมื่อไรต้องมีที่แสดงด้วย และต้องซอย `.in()` ด้วย chunkLeadIds เหมือนเดิม */
test('route KPI: ไม่ยิง query นับ "ตีกลับ" ที่ไม่มีหน้าจอไหนอ่าน', () => {
  const routeSource = readFileSync(
    new URL('../../app/api/sales-planning/leads/kpi/route.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(routeSource, /kind', 'bounce'|kind: 'bounce'/,
    'นับตีกลับกลับมาแล้วต้องมีที่แสดงบนแท็บด้วย ไม่งั้นจ่ายค่า query ฟรี');
  assert.doesNotMatch(routeSource, /bounced:/, 'ก้อน funnel ไม่ควรมีคีย์ที่ไม่มีใครอ่าน');
  const tabSource = readFileSync(
    new URL('../../components/salesPlanning/dashboard/KpiLeadsTab.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(tabSource, /f\.bounced/, 'ถ้าจะแสดงตีกลับ ต้องเปิด query ฝั่ง route คู่กัน');
});

test('KPI tab: funnel โชว์ "-" เมื่อค่าเป็น null และยังโชว์ 0 จริงตามปกติ', () => {
  const tabSource = readFileSync(
    new URL('../../components/salesPlanning/dashboard/KpiLeadsTab.js', import.meta.url),
    'utf8',
  );
  /* ⚠️ เดิมข้อนี้ยิงที่กริด funnel (`value={v ?? "-"}`) ซึ่งมี "ตีกลับ" เป็นค่าที่ null ได้
     ตอนนี้กริดถูกแทนด้วยกราฟแท่ง และ "ตีกลับ" ออกจากแท็บไปแล้ว (มติผู้ใช้ 2026-08-11)
     ⇒ ค่าที่ null ได้และยังโชว์อยู่จริงคือ "ค้างตอนนี้" ของ SLA — ย้ายด่านมาคุมตรงนั้นแทน
     กฎเดิมไม่เปลี่ยน: null = นับไม่ได้ ต้องขึ้น "-" ห้ามกลบเป็น 0 */
  // ป้ายของด่านคัดกรองต่างจากอีกสองด่าน (ของค้างเป็นคิวกลางทั้งบริษัท) จึงเล็งที่
  // ตัวกันค่า null ไม่ใช่คำนำหน้า — กฎที่คุมคือ "นับไม่ได้ต้องขึ้น - ไม่ใช่ 0"
  assert.match(tabSource, /\$\{pendingLabel\} \$\{s\.pending \?\? "-"\}/);
  assert.match(tabSource, /pendingLabel: "ค้างทั้งบริษัท"/,
    'ค้างของด่านคัดกรองไม่ตามตัวกรองทีม (คิวกลางไม่มีทีม) — ต้องบอกบนจอว่าคนละขอบเขต');
  // เล็งเฉพาะ `sla.pending` ซึ่งเป็นตัวเดียวที่ null ได้จริง (countLeadsByStatus ล้ม)
  // ส่วน pending ของตาราง AE การันตีเป็นตัวเลขจาก withAssigneePending — ไม่เข้าข่าย
  assert.doesNotMatch(tabSource, /s\.pending \?\? 0/, 'ห้ามกลบ SLA pending ที่นับไม่ได้ให้เป็น 0');
  // ชื่อคนต้องอ่านจาก id ไม่ใช่สำเนาชื่อในแถว (prod มีชื่อย่อ/ชื่อเก่าค้างอยู่)
  assert.match(tabSource, /livePersonName\(directory, a\.assigneeId, a\.name\)/);
  assert.match(tabSource, /livePersonName\(directory, c\.createdBy, c\.name\)/);
  assert.match(tabSource, /TEAM_LABELS\[a\.team\]/, 'คอลัมน์ทีมต้องเป็นป้ายเต็ม ไม่ใช่รหัสดิบ');
  /* % ที่ไม่มีตัวหารกำกับ = คนที่ติดต่อไป 2 ใบจาก 11 ใบขึ้น 100.00% ได้หน้าตาเฉย
     (การ์ด SLA ข้างบนโชว์ "ทัน x/y" อยู่แล้ว — สองที่บนจอเดียวกันต้องเชื่อถือได้เท่ากัน) */
  assert.match(tabSource, /\{a\.slaHit\}\/\{a\.contacted\}/,
    'คอลัมน์ SLA ของ AE ต้องโชว์ตัวหารคู่กับเปอร์เซ็นต์เสมอ');
});
