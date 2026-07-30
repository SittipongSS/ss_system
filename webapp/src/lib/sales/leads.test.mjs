// Tests กติกาลีด (เฟส C): channel group, transition map, SLA วันทำการ.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  LEAD_CHANNELS, channelGroupOf, LEAD_TRANSITIONS, TRANSITION_TO_STATUS,
  slaBusinessDays, slaHit, SERVICE_DETAIL_REQUIRED,
  canEditLead, canDeleteLead, canWorkLead, canCreateLead, LEAD_LOCKED_STATUSES,
  sourceLeadIdOf,
} from './leads';

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

test('service detail บังคับเฉพาะ product/other', () => {
  assert.ok(SERVICE_DETAIL_REQUIRED.has('product'));
  assert.ok(SERVICE_DETAIL_REQUIRED.has('other'));
  assert.ok(!SERVICE_DETAIL_REQUIRED.has('diffuser'));
  assert.equal(LEAD_CHANNELS.length, 8);
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
