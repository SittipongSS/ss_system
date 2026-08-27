// ── รายงานลีดสำหรับดาวน์โหลด (มติผู้ใช้ 2026-08-27) ─────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEAD_REPORT_COLUMNS, canExportLeadReport, leadReportRow, leadReportFilename,
} from './leadReport.js';
import { ROLES } from '../permissions.js';

/* 🔴 ไฟล์นี้มีชื่อ/เบอร์/อีเมลลูกค้า — ต่างจากแท็บ KPI ที่เห็นแต่ตัวเลขรวม
   ผู้สังเกตการณ์/ผู้บริหารเห็นแท็บ KPI ได้ แต่ **ต้องไม่ได้ไฟล์นี้**
   ⚠️ `ae_supervisor` เป็น superuser ในด่านอื่น แต่ที่นี่ไม่ได้ — เขียนด่านเป็น
   `isSuperuser(role) || ...` เมื่อไร สิทธิ์จะกว้างกว่าที่ตกลงไว้โดยไม่มีใครสังเกต */
test('ดาวน์โหลดได้เฉพาะ marketing กับ admin', () => {
  const allowed = ROLES.filter((r) => canExportLeadReport(r));
  assert.deepEqual(allowed.sort(), ['admin', 'marketing']);
  for (const role of ['ae_supervisor', 'senior_ae', 'ae', 'ac', 'viewer', 'executive']) {
    assert.equal(canExportLeadReport(role), false, `${role} ต้องโหลดไฟล์นี้ไม่ได้`);
  }
  assert.equal(canExportLeadReport(undefined), false);
});

/* วันในไฟล์ต้องเป็น **วันไทย** — timestamptz เก็บเป็น UTC ⇒ ลีดที่เข้ามาตอนดึก
   จะตกไปวันก่อนหน้าถ้าตัดสตริงตรง ๆ (โรคเดียวกับที่กวาดทั้งระบบไปแล้ว) */
test('วันที่ทุกช่องเป็นวันไทย', () => {
  const row = leadReportRow({
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
test('ป้ายสถานะ/ช่องทาง/ทีม ใช้คำเดียวกับหน้าจอ', () => {
  const row = leadReportRow({ status: 'contacted', channel: 'phone', team: 'KA', serviceInterest: 'other' });
  assert.equal(row.status, 'ติดต่อแล้ว');
  assert.equal(row.channel, 'โทรเข้า');
  assert.equal(row.team, 'Key Account');
  assert.equal(row.serviceInterest, 'อื่นๆ (ระบุ)');
});

test('เหตุผลไม่ไปต่อขึ้นเฉพาะใบที่ปิดแล้ว', () => {
  const closed = leadReportRow({ status: 'disqualified', disqualifiedCode: 'budget' });
  assert.ok(closed.lostReason, 'ใบที่ปิดต้องมีเหตุผล');
  assert.equal(leadReportRow({ status: 'contacted', disqualifiedCode: 'budget' }).lostReason, '',
    'ใบที่ยังไม่ปิดต้องไม่โชว์เหตุผลค้าง');
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
