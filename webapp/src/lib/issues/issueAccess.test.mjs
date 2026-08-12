// ด่านสิทธิ์ของเรื่องแจ้งปัญหา — เรื่องของใครก็ของคนนั้น + แอดมินเห็นหมด
//
// ⭐ เทสต์สำคัญที่สุดในไฟล์นี้คือข้อสุดท้าย: **ด่านเธรดต้องเป็นฟังก์ชันเดียวกับ
// ด่านหน้าจอ** ไม่ใช่เงื่อนไขที่เขียนซ้ำให้เหมือนกัน — บั๊กเดิมของระบบ (เธรดเคส
// ขอราคาที่ตั้งด่านแคบ/กว้างไม่ตรงกับ GET ของใบ) เกิดจากการเขียนซ้ำสองที่แล้วแก้
// ที่เดียว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  canPostIssueUpdate, canReadIssueRow, canReportIssue, isIssueReporter, isSystemAdmin,
} from './access.js';

const here = dirname(fileURLToPath(import.meta.url));

const reporter = { id: 'u-1', role: 'ae', name: 'สมชาย' };
const other = { id: 'u-2', role: 'senior_ae' };
const admin = { id: 'u-9', role: 'admin' };
const salesHead = { id: 'u-8', role: 'ae_supervisor' };
const viewer = { id: 'u-7', role: 'viewer' };
const row = { id: 'ISS-1', reportedById: 'u-1', status: 'pending' };

test('เจ้าของเรื่องอ่านได้ คนอื่นอ่านไม่ได้', () => {
  assert.equal(canReadIssueRow(reporter, row), true);
  assert.equal(canReadIssueRow(other, row), false);
  assert.equal(canReadIssueRow(null, row), false);
  assert.equal(canReadIssueRow(reporter, null), false);
});

test('แอดมินอ่านได้ทุกเรื่อง', () => {
  assert.equal(canReadIssueRow(admin, row), true);
  assert.equal(isSystemAdmin(admin), true);
});

// 🐞 กับดักที่ตั้งใจเลี่ยง: `isSuperuser()` ของระบบนับ ae_supervisor เข้ามาด้วย
// ถ้าเผลอใช้ตัวนั้น หัวหน้าฝ่ายขายจะเห็นเรื่องที่คนทั้งบริษัทแจ้ง รวมเรื่องที่
// แนบภาพหน้าจอของฝ่ายอื่นมาด้วย
test('หัวหน้าฝ่ายขาย (ae_supervisor) ไม่ใช่ผู้ดูแลระบบ', () => {
  assert.equal(isSystemAdmin(salesHead), false);
  assert.equal(canReadIssueRow(salesHead, row), false);
});

test('viewer เปิดเรื่องได้ — คนสิทธิ์น้อยคือคนที่เจอบั๊กบ่อยที่สุด', () => {
  assert.equal(canReportIssue(viewer), true);
  assert.equal(canReportIssue(null), false);
  assert.equal(canReportIssue({}), false);
});

test('id ต่างชนิดกันต้องเทียบติด (uuid ในคอลัมน์ text)', () => {
  assert.equal(isIssueReporter({ id: 42 }, { reportedById: '42' }), true);
  assert.equal(isIssueReporter({ id: '42' }, { reportedById: 42 }), true);
  assert.equal(isIssueReporter({ id: '' }, { reportedById: '' }), false);
});

test('ปิด/ปฏิเสธแล้วโพสต์ในเธรดไม่ได้ แต่ยังอ่านได้', () => {
  for (const status of ['closed', 'rejected']) {
    const closed = { ...row, status };
    assert.equal(canReadIssueRow(reporter, closed), true, `${status} ต้องยังอ่านได้`);
    assert.equal(canPostIssueUpdate(reporter, closed), false, `${status} ต้องโพสต์ไม่ได้`);
    assert.equal(canPostIssueUpdate(admin, closed), false, `${status} แอดมินก็โพสต์ไม่ได้`);
  }
  for (const status of ['pending', 'acknowledged', 'resolved']) {
    assert.equal(canPostIssueUpdate(reporter, { ...row, status }), true, `${status} ต้องโพสต์ได้`);
  }
});

// ⭐ ด่านเธรด = ด่านหน้าจอ — พิสูจน์ที่ระดับซอร์ส ไม่ใช่เขียนความคาดหวังซ้ำ
// (import updateAccess.js ตรง ๆ ไม่ได้ เพราะมันลากชั้นสิทธิ์ทั้งก้อนมาด้วย —
//  เหตุผลเดียวกับที่ driveEntityMap.test.mjs อ่านซอร์ส)
test('ทะเบียนเธรดเรียกฟังก์ชันเดียวกับ API ไม่ได้เขียนเงื่อนไขซ้ำ', () => {
  const src = readFileSync(join(here, '../master/updateAccess.js'), 'utf8');
  const start = src.indexOf('  system_issue: {');
  assert.ok(start > 0, 'ยังไม่ได้ลงทะเบียน system_issue ใน UPDATE_ENTITIES');
  const block = src.slice(start, src.indexOf('\n  },', start));

  assert.match(block, /canReadIssueRow\(user, parent\)/, 'canView ต้องเรียก canReadIssueRow');
  assert.match(block, /canPostIssueUpdate\(user, parent\)/, 'canPost ต้องเรียก canPostIssueUpdate');
  assert.match(block, /table: 'system_issues'/);
  assert.match(block, /attachments: true/);

  // ห้ามมีเงื่อนไขที่ตัดสินเองในบล็อกนี้ — เจอเมื่อไรแปลว่ากฎเริ่มแตกเป็นสองชุด
  assert.ok(!/role\s*===/.test(block), 'ห้ามเทียบ role เองในทะเบียนเธรด');
  assert.ok(!/status\s*===/.test(block), 'ห้ามเทียบ status เองในทะเบียนเธรด');
  assert.ok(!/isSuperuser/.test(block), 'ห้ามใช้ isSuperuser กับโมดูลนี้');
});

test('ผู้รับแจ้งเตือนของเธรดมีแค่ผู้แจ้งกับผู้รับผิดชอบ', () => {
  const src = readFileSync(join(here, '../master/updateAccess.js'), 'utf8');
  const start = src.indexOf('  system_issue: {');
  const block = src.slice(start, src.indexOf('\n  },', start));
  assert.match(block, /recipients: \(parent\) => \[parent\?\.reportedById, parent\?\.assigneeId\]/);
});

// ── ป้ายตัวเลขบนเมนู (ม-118) ─────────────────────────────────────────────
test('⭐ สองเลนของเรื่องแจ้งปัญหา: แอดมินรอรับเรื่อง · คนแจ้งรอยืนยัน', async () => {
  const { isIssueWaitingOnAdmin, isIssueWaitingOnReporter } = await import('./access.js');
  const me = { id: 'USR-ME', role: 'ae' };
  const mine = (status) => ({ status, reportedById: 'USR-ME' });

  // เลนแอดมิน — เรื่องที่ยังไม่มีใครรับ
  assert.equal(isIssueWaitingOnAdmin({ status: 'pending' }), true);
  assert.equal(isIssueWaitingOnAdmin({ status: 'acknowledged' }), false, 'มีคนถืออยู่แล้ว');
  assert.equal(isIssueWaitingOnAdmin({ status: 'closed' }), false);

  // เลนคนแจ้ง — เรื่องของตัวเองที่แก้แล้วรอยืนยัน
  assert.equal(isIssueWaitingOnReporter(me, mine('resolved')), true);
  assert.equal(isIssueWaitingOnReporter(me, mine('pending')), false, 'ยังรอฝ่าย ไม่ใช่รอเรา');
  assert.equal(isIssueWaitingOnReporter(me, { status: 'resolved', reportedById: 'USR-OTHER' }), false);
  assert.equal(isIssueWaitingOnReporter(me, null), false);
});
