import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGanttPrintHTML } from './ganttPrint.js';

// เอกสารไทม์ไลน์โครงการ (FM-PD-05) เป็นเอกสารควบคุมตั้งแต่ mig 0198 — หัวใบต้องอ่าน
// จากมาตรฐานที่เผยแพร่/ตรึงไว้ ไม่ใช่ค่าคงที่ใน documentBrand.js เหมือนเดิม

const PROJECT = {
  id: 'preview',
  code: 'PJ-26080012',
  rev: 2,
  timelineDocBase: 'PT-26080007',
  timelineDocNumber: 'PT-26080007-0',
  name: 'โครงการตัวอย่าง',
  customerName: 'บริษัท ตัวอย่าง จำกัด',
  startDate: '2026-08-03',
  dueDate: '2026-09-30',
  tasks: [
    { id: 't1', phase: 'เตรียมงาน', name: 'ยืนยันบรีฟ', role: 'AC', status: 'Completed', startDate: '2026-08-03', finishDate: '2026-08-14' },
  ],
};

const PUBLISHED = {
  titleTh: 'เอกสารไทม์ไลน์โครงการ',
  titleEn: 'PROJECT TIMELINE',
  formCode: 'FM-PD-05',
  revision: '00',
  effectiveDate: '2025-05-08',
  accentKey: 'navy',
  numberingPattern: 'PT-{YY}{MM}{RUNNING:4}-{REVISION}',
};

test('หัวใบพิมพ์บรรทัดควบคุมเต็มจากมาตรฐานที่เผยแพร่', () => {
  const html = buildGanttPrintHTML(PROJECT, null, PUBLISHED);
  assert.match(html, /FM-PD-05: Rev\. No\.00\. 08\/05\/2568/);
  assert.match(html, /PROJECT TIMELINE/);
  assert.match(html, /--doc-accent:#1f3551;/);
});

test('มาตรฐานที่ตรึงไว้บนโครงการชนะมาตรฐานที่เผยแพร่อยู่ตอนนี้ (พิมพ์ซ้ำใบเก่า)', () => {
  const html = buildGanttPrintHTML(
    { ...PROJECT, timelineStandardSnapshot: { ...PUBLISHED, revision: '01', effectiveDate: '2026-01-15', accentKey: 'steel' } },
    null,
    { ...PUBLISHED, revision: '09' },
  );
  assert.match(html, /FM-PD-05: Rev\. No\.01\. 15\/01\/2569/);
  assert.doesNotMatch(html, /Rev\. No\.09/);
  assert.match(html, /--doc-accent:#1e6091;/);
});

test('โหลดมาตรฐานไม่ได้ต้องยังพิมพ์ได้ด้วยค่าสำรองของเอกสารชนิดนี้', () => {
  const html = buildGanttPrintHTML(PROJECT, null, null);
  assert.match(html, /FM-PD-05: Rev\. No\.00\. 08\/05\/2568/);
  assert.match(html, /--doc-accent:#1f3551;/);
});

test('เลขที่เอกสารเดินตาม Rev ปัจจุบัน และรหัสโครงการยังอยู่บนหัวใบแยกบรรทัด', () => {
  const html = buildGanttPrintHTML(PROJECT, null, PUBLISHED);
  assert.match(html, /PT-26080007-2/);            // ออกไว้ -0 · โครงการอยู่ Rev 2
  assert.match(html, /<dt>รหัสโครงการ<\/dt><dd>PJ-26080012-2<\/dd>/);
});

// ใบสั่งขายใช้คำว่า "ผู้จัดทำ" กับ AE เจ้าของดีล — ไทม์ไลน์จึงเลิกใช้คำเดียวกันกับ AC
// ที่เป็นคนละบทบาท (มติผู้ใช้ 2026-08-05)
test('ช่องเซ็นไทม์ไลน์เรียก AC ว่า "ผู้ประสานงาน" ไม่ใช่ "ผู้จัดทำ"', () => {
  const html = buildGanttPrintHTML(
    { ...PROJECT, aeOwner: 'เอผู้ดูแล', preparedBy: 'เอซีผู้ประสานงาน', aeSupervisor: 'หัวหน้า' },
    [], {},
  );
  const signs = html.slice(html.indexOf('sign-sec'));
  assert.match(signs, /ผู้ประสานงาน[\s\S]*?ACCOUNT COORDINATOR/);
  assert.ok(!signs.includes('ผู้จัดทำ'));
  // อีกสองช่องไม่กระทบ
  assert.match(signs, /ผู้ดูแล[\s\S]*?ACCOUNT EXECUTIVE/);
  assert.match(signs, /ผู้ตรวจสอบ[\s\S]*?AE SUPERVISOR/);
});

test('ไทม์ไลน์ของดีลที่ยังไม่มีโครงการจริง — ไม่มีเลขที่เอกสาร โชว์รหัสต้นทางเหมือนเดิม', () => {
  const html = buildGanttPrintHTML(
    { ...PROJECT, code: 'DL-26080003', rev: null, timelineDocBase: null, timelineDocNumber: null },
    null,
    PUBLISHED,
  );
  assert.doesNotMatch(html, /PT-/);
  assert.doesNotMatch(html, /รหัสโครงการ/);
  assert.match(html, /DL-26080003-0/);
});
