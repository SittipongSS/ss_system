// สถานะ/ประเภท/ผลกระทบของเรื่องแจ้งปัญหา — ป้ายกับโทนต้องครบทุกค่า
// (แพตเทิร์นเดียวกับที่คำร้องใช้: ค่าที่ประกาศแล้วไม่มีป้าย = จอขึ้นคีย์ดิบให้ผู้ใช้อ่าน)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISSUE_IMPACTS, ISSUE_IMPACT_LABELS, ISSUE_IMPACT_ORDER, ISSUE_IMPACT_TONES,
  ISSUE_KINDS, ISSUE_KIND_LABELS,
  ISSUE_OPEN_STATUSES, ISSUE_STATUSES, ISSUE_STATUS_LABELS, ISSUE_STATUS_TONES,
  normalizeIssueImpact, normalizeIssueKind, normalizeIssueStatus,
} from './statuses.js';

const TONES = ['neutral', 'info', 'success', 'warning', 'danger'];

test('ทุกสถานะมีป้ายและโทน และโทนเป็นชื่อโทนของ StatusBadge ไม่ใช่ค่าสี', () => {
  for (const status of ISSUE_STATUSES) {
    assert.ok(ISSUE_STATUS_LABELS[status], `${status} ไม่มีป้าย`);
    assert.ok(TONES.includes(ISSUE_STATUS_TONES[status]), `${status} โทนไม่ถูกต้อง`);
  }
  assert.equal(Object.keys(ISSUE_STATUS_LABELS).length, ISSUE_STATUSES.length);
  assert.equal(Object.keys(ISSUE_STATUS_TONES).length, ISSUE_STATUSES.length);
});

test('ทุกประเภทและทุกผลกระทบมีป้ายครบ', () => {
  for (const kind of ISSUE_KINDS) assert.ok(ISSUE_KIND_LABELS[kind], `${kind} ไม่มีป้าย`);
  for (const impact of ISSUE_IMPACTS) {
    assert.ok(ISSUE_IMPACT_LABELS[impact], `${impact} ไม่มีป้าย`);
    assert.ok(TONES.includes(ISSUE_IMPACT_TONES[impact]), `${impact} โทนไม่ถูกต้อง`);
    assert.equal(typeof ISSUE_IMPACT_ORDER[impact], 'number', `${impact} ไม่มีลำดับคิว`);
  }
});

test('สถานะที่ยังเดินอยู่ต้องไม่รวมสถานะปลายทาง', () => {
  assert.deepEqual(ISSUE_OPEN_STATUSES, ['pending', 'acknowledged', 'resolved']);
  assert.ok(!ISSUE_OPEN_STATUSES.includes('closed'));
  assert.ok(!ISSUE_OPEN_STATUSES.includes('rejected'));
});

// ⚠️ ป้าย "แก้แล้ว" ต้องไม่ใช่คำว่า "ตอบแล้ว" ที่ยืมมาจากคำร้อง — ตอบแล้ว ≠ แก้แล้ว
// และผู้ใช้ที่เห็นคำว่า "ตอบแล้ว" จะไม่รู้ว่าต้องกลับมายืนยันอะไร
test('resolved พูดว่า "แก้แล้ว" และบอกว่ารออะไรอยู่', () => {
  assert.match(ISSUE_STATUS_LABELS.resolved, /แก้แล้ว/);
  assert.match(ISSUE_STATUS_LABELS.resolved, /ยืนยัน/);
});

test('normalize ถอยไปค่าตั้งต้นเมื่อได้ค่าที่ไม่รู้จัก', () => {
  assert.equal(normalizeIssueStatus('มั่ว'), 'pending');
  assert.equal(normalizeIssueStatus(null), 'pending');
  assert.equal(normalizeIssueStatus('closed'), 'closed');
  assert.equal(normalizeIssueKind('มั่ว'), 'bug');
  assert.equal(normalizeIssueKind('question'), 'question');
  assert.equal(normalizeIssueImpact('urgent'), 'workaround');
  assert.equal(normalizeIssueImpact('blocked'), 'blocked');
});

// ค่าที่ประกาศต้องตรงกับ CHECK ของ migration 0219 เป๊ะ — หลุดกันเมื่อไร insert จะ
// ล้มที่ DB โดยที่เทสต์ฝั่งโค้ดผ่านหมด
test('ชุดค่าตรงกับ CHECK ของ mig 0219', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, '../../../supabase/migrations/0219_system_issues.sql'), 'utf8');

  for (const status of ISSUE_STATUSES) assert.ok(sql.includes(`'${status}'`), `SQL ไม่มีสถานะ ${status}`);
  for (const kind of ISSUE_KINDS) assert.ok(sql.includes(`'${kind}'`), `SQL ไม่มีประเภท ${kind}`);
  for (const impact of ISSUE_IMPACTS) assert.ok(sql.includes(`'${impact}'`), `SQL ไม่มีผลกระทบ ${impact}`);
});
