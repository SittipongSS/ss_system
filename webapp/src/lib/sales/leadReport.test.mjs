// ── รายงานลีดสำหรับดาวน์โหลด (มติผู้ใช้ 2026-08-27) ─────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEAD_REPORT_COLUMNS, canExportLeadReport, leadReportRow, leadReportFilename,
} from './leadReport.js';
import { LEAD_CLOSED_STATUSES, leadActiveFollowUpAt, leadFollowUpState } from './leads.js';
import { EMPTY_LEAD_FILTERS, filterLeadRows, leadFacetCounts, leadQueuePick } from './leadListFilter.js';
import { summarizeLeadQueue } from './leadDigest.js';
import { ROLES } from '../permissions.js';

/* 🔴 ไฟล์นี้มีชื่อ/เบอร์/อีเมลลูกค้า — ต่างจากแท็บ KPI ที่เห็นแต่ตัวเลขรวม
   ผู้สังเกตการณ์/ผู้บริหารเห็นแท็บ KPI ได้ แต่ **ต้องไม่ได้ไฟล์นี้**
   ⚠️ `ae_supervisor` เป็น superuser ในด่านอื่น แต่ที่นี่ไม่ได้ — เขียนด่านเป็น
   `isSuperuser(role) || ...` เมื่อไร สิทธิ์จะกว้างกว่าที่ตกลงไว้โดยไม่มีใครสังเกต */
test('ดาวน์โหลดได้เฉพาะ marketing กับ admin + CD/CM (สองตำแหน่งนี้ถือสิทธิ์ของ MKT · มติ 2026-09-24)', () => {
  const allowed = ROLES.filter((r) => canExportLeadReport(r));
  assert.deepEqual(allowed.sort(), ['admin', 'commercial_director', 'commercial_manager', 'marketing']);
  // AE Sup / AC Sup ยังไม่ได้ — ถึงจะเป็นหัวหน้าที่เห็นทุกทีมก็ตาม
  for (const role of ['ae_supervisor', 'ac_supervisor', 'senior_ae', 'senior_ac', 'ae', 'ac', 'viewer', 'executive']) {
    assert.equal(canExportLeadReport(role), false, `${role} ต้องโหลดไฟล์นี้ไม่ได้`);
  }
  assert.equal(canExportLeadReport(undefined), false);
});

/* วันในไฟล์ต้องเป็น **วันไทย** — timestamptz เก็บเป็น UTC ⇒ ลีดที่เข้ามาตอนดึก
   จะตกไปวันก่อนหน้าถ้าตัดสตริงตรง ๆ (โรคเดียวกับที่กวาดทั้งระบบไปแล้ว) */
test('วันที่ทุกช่องเป็นวันไทย', () => {
  const row = leadReportRow({
    status: 'contacted',                      // วันติดตามมีผลเฉพาะใบที่ยังเดิน (ดูเทสต์ใบปิดด้านล่าง)
    createdAt: '2026-07-31T17:30:00.000Z',   // 1 ส.ค. 00:30 เวลาไทย
    screenedAt: '2026-07-31T16:30:00.000Z',  // 31 ก.ค. 23:30 เวลาไทย
    followUpAt: '2026-09-02',                 // วันล้วน ต้องไม่ขยับ
  });
  assert.equal(row.createdAt, '2026-08-01');
  assert.equal(row.screenedAt, '2026-07-31');
  assert.equal(row.followUpAt, '2026-09-02');
});

test('ช่องที่ไม่มีค่าเป็นค่าว่าง ไม่ใช่ขีดหรือ null', () => {
  const row = leadReportRow({});
  for (const key of ['createdAt', 'assigneeName', 'team', 'lostReason']) {
    assert.equal(row[key], '', `${key} ต้องเป็นค่าว่าง`);
  }
  // เงินเป็น null เพื่อให้ช่องว่างจริง ไม่ใช่เลข 0 ซึ่งอ่านว่า "งบศูนย์บาท"
  assert.equal(row.budget, null);
  assert.equal(leadReportRow({ budget: '250000' }).budget, 250000);
});

/* ป้ายต้องมาจากทะเบียนกลาง ไม่ใช่สะกดเองในไฟล์รายงาน — ไม่งั้นไฟล์กับหน้าจอ
   จะใช้คำคนละชุด แล้วคนอ่านสองที่จะเถียงกันว่าอันไหนถูก */

/* ⚠️ ค่าในแมป **ต่างจากค่าคงที่โดยตั้งใจ** — ถ้า assert ค่าที่ค่าคงที่ให้พอดี เทสต์จะเขียว
   แม้แมปจะถูกประกาศแล้วไม่ถูกใช้/ไม่ถูกส่งต่อ ซึ่งคือชนิดของเทสต์ที่หลอกตัวเอง */
const TEAM_NAMES = new Map([['KA', 'คีย์แอคเคาต์ (ทะเบียน)'], ['SA-NORTH', 'ทีมภาคเหนือ']]);

test('ป้ายสถานะ/ช่องทาง/ทีม ใช้คำเดียวกับหน้าจอ', () => {
  const row = leadReportRow(
    { status: 'contacted', channel: 'phone', team: 'KA', serviceInterest: 'other' },
    { teamNames: TEAM_NAMES },
  );
  assert.equal(row.status, 'ติดต่อแล้ว');
  assert.equal(row.channel, 'โทรเข้า');
  assert.equal(row.team, 'คีย์แอคเคาต์ (ทะเบียน)', 'ต้องมาจากทะเบียน ไม่ใช่ค่าคงที่');
  assert.equal(row.serviceInterest, 'อื่นๆ (ระบุ)');
});

/* ⭐ เคสที่ค่าคงที่ตอบไม่ได้เลย — ทีมที่สร้างหลังปลดล็อก (2026-09-07) */
test('ทีมที่สร้างใหม่ต้องขึ้นชื่อจริงในไฟล์', () => {
  assert.equal(leadReportRow({ team: 'SA-NORTH' }, { teamNames: TEAM_NAMES }).team, 'ทีมภาคเหนือ');
});

/* 🔴 ไม่มีในทะเบียน = **รหัสดิบ ไม่ใช่ชื่อจากค่าคงที่** — แมปมาจากฐานสด ถ้าไม่มีรหัสนั้น
   แปลว่าอ่านไม่ได้หรือทีมถูกลบ · โชว์ชื่อเก่าจากโค้ดคือคำโกหกที่ดูเหมือนปกติ */
test('ไม่มีในทะเบียน = รหัสดิบ ไม่ถอยไปค่าคงที่', () => {
  assert.equal(leadReportRow({ team: 'KA' }).team, 'KA');
  assert.equal(leadReportRow({ team: 'KA' }, { teamNames: new Map() }).team, 'KA');
});

test('เหตุผลไม่ไปต่อขึ้นเฉพาะใบที่ปิดแล้ว', () => {
  const closed = leadReportRow({ status: 'disqualified', disqualifiedCode: 'budget' });
  assert.ok(closed.lostReason, 'ใบที่ปิดต้องมีเหตุผล');
  assert.equal(leadReportRow({ status: 'contacted', disqualifiedCode: 'budget' }).lostReason, '',
    'ใบที่ยังไม่ปิดต้องไม่โชว์เหตุผลค้าง');
});

/* ── วันติดตามต่อในไฟล์ = วันที่ตารางโชว์ (มติเจ้าของ 19/10) ─────────────────
   🐞 ใบที่ปิดแล้ว (qualified/disqualified) ยังค้าง `followUpAt` ของรอบก่อน (~126 ใบบน prod) —
   ตารางซ่อนไปแล้วด้วย `leadActiveFollowUpAt` (#1914) แต่ไฟล์ยังอ่านคอลัมน์ดิบ ⇒ กรองในไฟล์
   "วันติดตามต่อ < วันนี้" ได้ใบที่จบไปแล้วปนมา มากกว่า "เลยวันติดตาม" บนการ์ด
   ⭐ มติ: ช่องว่างสำหรับใบปิด ผ่านตัวตัดสินตัวเดียวกับตาราง · ไม่ล้างฐาน ไม่ backfill */
const STALE = '2026-08-01T00:00:00Z';
const TODAY = '2026-10-19';

test('วันติดตามต่อ: ใบปิดแล้ว = ช่องว่าง · ใบที่ยังเดินคงวันเดิม', () => {
  assert.deepEqual(LEAD_CLOSED_STATUSES, ['qualified', 'disqualified']);
  for (const status of LEAD_CLOSED_STATUSES) {
    assert.equal(leadReportRow({ status, followUpAt: STALE }).followUpAt, '', `${status} ต้องไม่มีวันติดตามในไฟล์`);
  }
  assert.equal(leadReportRow({ status: 'contacted', followUpAt: STALE }).followUpAt, '2026-08-01');
  // ใบนัดแล้วที่บันทึกการติดตามหลังประชุม = วันที่มีผล (ตารางโชว์ ไฟล์ต้องโชว์)
  assert.equal(leadReportRow({ status: 'meeting', followUpAt: STALE }).followUpAt, '2026-08-01');
  assert.equal(leadReportRow({ status: 'contacted', followUpAt: null }).followUpAt, '');
});

/* ⭐ ตัวนับต้องเท่ากับชุดที่เปิดได้ — คนที่กรองไฟล์ด้วย "วันติดตามต่อ < วันนี้" ต้องได้จำนวนเท่าเลข
   "เลยวันติดตาม" บนการ์ดค้างคิว/ตัวเลือกในแผงกรอง และเป็นแถวชุดเดียวกับที่ตารางทาสีแดง
   ⚠️ ชุดข้อมูลตั้งใจมีใบปิดที่วันเก่าค้าง + ใบขั้นก่อนติดต่อที่มีค่าหลง — ถ้าไฟล์กลับไปอ่าน
   คอลัมน์ดิบ เลขในไฟล์จะเกินการ์ด 3 ใบและเทสต์นี้แดง */
test('วันติดตามต่อ: แถวที่ไฟล์มีวัน = แถวที่ตารางโชว์วัน · "เลย" ในไฟล์ = เลขบนการ์ด/แผงกรอง', () => {
  const base = { assigneeId: 'u1', team: 'ODM', createdAt: '2026-07-01T03:00:00Z', assignedAt: '2026-07-01T03:00:00Z' };
  const rows = [
    { ...base, id: 'won', status: 'qualified', followUpAt: STALE },
    { ...base, id: 'lost', status: 'disqualified', followUpAt: STALE },
    { ...base, id: 'stray-new', status: 'new', followUpAt: STALE },
    { ...base, id: 'open-late', status: 'contacted', followUpAt: STALE },
    { ...base, id: 'met-late', status: 'meeting', followUpAt: '2026-10-18T00:00:00Z' },
    { ...base, id: 'open-today', status: 'contacted', followUpAt: `${TODAY}T00:00:00Z` },
    { ...base, id: 'open-ahead', status: 'contacted', followUpAt: '2026-10-25T00:00:00Z' },
    { ...base, id: 'open-none', status: 'contacted', followUpAt: null },
  ];
  const file = rows.map((lead) => ({ id: lead.id, ...leadReportRow(lead) }));

  // แถวที่มีวันในไฟล์ = แถวที่ตัวตัดสินกลางให้วัน (ตัวเดียวกับช่องในตาราง)
  const withDate = file.filter((r) => r.followUpAt).map((r) => r.id).sort();
  assert.deepEqual(withDate, rows.filter((l) => leadActiveFollowUpAt(l)).map((l) => l.id).sort());
  assert.deepEqual(withDate, ['met-late', 'open-ahead', 'open-late', 'open-today']);

  // "เลย" ในไฟล์ = สตริงวันไทยน้อยกว่าวันนี้ (กรองใน Excel แบบข้อความได้ตรง ๆ)
  const lateInFile = file.filter((r) => r.followUpAt && r.followUpAt < TODAY).map((r) => r.id).sort();
  // แถวที่ตารางทาสีแดง
  const red = rows.filter((l) => leadActiveFollowUpAt(l) && leadFollowUpState(leadActiveFollowUpAt(l), TODAY) === 'late')
    .map((l) => l.id).sort();
  assert.deepEqual(lateInFile, red);
  assert.deepEqual(lateInFile, ['met-late', 'open-late']);
  // ตัวกรอง "เลยวันติดตาม" ของตาราง · ตัวเลขท้ายตัวเลือกในแผงกรอง · การ์ดค้างคิว
  assert.deepEqual(filterLeadRows(rows, leadQueuePick({ follow: 'late' }), TODAY).map((l) => l.id).sort(), lateInFile);
  assert.equal(leadFacetCounts(rows, EMPTY_LEAD_FILTERS, TODAY).follow.late, lateInFile.length);
  const s = summarizeLeadQueue(rows, { asOf: `${TODAY}T05:00:00Z`, holidays: new Set() });
  assert.equal(s.followUp.late.count, lateInFile.length);
  // ครบวันนี้ก็ตรงกัน
  const todayInFile = file.filter((r) => r.followUpAt === TODAY).length;
  assert.equal(todayInFile, s.followUp.dueToday);
});

/* ยาม: ไฟล์อ่านคอลัมน์ดิบไม่ได้ — ต้องผ่าน `leadActiveFollowUpAt` ตัวเดียวกับหน้าลีด */
test('leadReport.js ไม่อ่าน lead.followUpAt ตรง', () => {
  const src = readFileSync(new URL('./leadReport.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\blead\.followUpAt\b/, 'อ่าน lead.followUpAt ตรง — ต้องผ่าน leadActiveFollowUpAt');
  assert.match(src, /leadActiveFollowUpAt\(lead\)/);
});

test('ทุกคอลัมน์มีที่มาในแถว — ไม่มีหัวคอลัมน์ที่ไม่มีข้อมูล', () => {
  const row = leadReportRow({ id: 'LEAD-x' });
  for (const col of LEAD_REPORT_COLUMNS) {
    assert.ok(col.key in row, `คอลัมน์ ${col.label} ไม่มีคีย์ ${col.key} ในแถว`);
    assert.ok(col.label && col.width, `คอลัมน์ ${col.key} ต้องมีป้ายและความกว้าง`);
  }
});

test('ชื่อไฟล์บอกช่วงที่ขอ', () => {
  assert.equal(leadReportFilename({ from: '2026-08-01', to: '2026-08-27' }), 'leads_2026-08-01_2026-08-27.xlsx');
  assert.match(leadReportFilename({}), /^leads_.*\.xlsx$/);
  // ชื่อตามงวดบนจอ (2026-09-22) — เดือนเดียว/ทั้งปีไม่ต้องยาวเป็นช่วงวัน
  assert.equal(leadReportFilename({ from: '2026-09-01', to: '2026-09-30', period: { mode: 'month', month: '2026-09' } }), 'leads_2026-09.xlsx');
  assert.equal(leadReportFilename({ from: '2026-01-01', to: '2026-12-31', period: { mode: 'year', year: '2026' } }), 'leads_2026.xlsx');
});

/* 🪤 เพดาน 1,000 แถวตัดเงียบ ๆ — รายงานที่ขาดแถวไปโดยไม่มี error คือรายงานที่หลอกคนอ่าน
   และด่านขอบเขตต้องอยู่ ไม่ใช่ละไว้เพราะ "วันนี้ทั้งสอง role เห็นทุกใบอยู่แล้ว" */
test('route อ่านครบทุกแถว และยังผ่านด่านขอบเขต', () => {
  const src = readFileSync(new URL('../../app/api/sales-planning/leads/report/route.js', import.meta.url), 'utf8');
  assert.match(src, /fetchAllResult/);
  assert.match(src, /applyLeadScope\(query, user\)/);
  assert.match(src, /canExportLeadReport\(user\.role\)/);
  // ช่วงวันต้องใช้ตัวเดียวกับแท็บ KPI ไม่ใช่เทียบสตริงวันดิบ
  assert.match(src, /dateRangeOfBusinessDays/);
});
