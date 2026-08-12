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
// ── ของจริงบนใบพิมพ์ (มติผู้ใช้ 2026-08-12) ─────────────────────────────────
// ใบนี้เดิมพิมพ์ "แผน" อย่างเดียว · ของจริงที่สแตมไว้ (mig 0239) ไม่เคยขึ้นกระดาษเลย
// ทั้งที่คำถามแรกของคนอ่านใบย้อนหลังคือ "แล้วทำได้ตามนี้ไหม"
//
// เคสทั้งหมดใช้วันในเดือนกันยายน 2026 โดยตั้งใจ — สิงหาคมมีวันหยุด 12 ส.ค. อยู่ใน
// THAI_HOLIDAYS ซึ่งทำให้ส่วนต่างวันทำการที่คาดไว้เพี้ยนโดยไม่เกี่ยวกับสิ่งที่กำลังทดสอบ

const withActual = (tasks) => buildGanttPrintHTML({ ...PROJECT, tasks }, null, PUBLISHED);
const step = (o) => ({ ...PROJECT.tasks[0], ...o });

test('ใบพิมพ์: วันของจริงขึ้นใต้วันตามแผน พร้อมส่วนต่างเป็นวันทำการ', () => {
  // ศุกร์ 04/09 → พุธ 09/09 = ช้า 3 วันทำการ (ข้ามเสาร์-อาทิตย์)
  const html = withActual([step({
    startDate: '2026-09-01', finishDate: '2026-09-04',
    actualStartDate: '2026-09-01', actualFinishDate: '2026-09-09',
  })]);
  assert.match(html, /class="c-act">01\/09\/26 ✓<\/div>/, 'เริ่มตรงแผนต้องมีเครื่องหมาย ✓ ไม่ใช่วันที่ซ้ำกับบรรทัดบนเปล่า ๆ');
  assert.match(html, /class="c-act">09\/09\/26 \+3<\/div>/, 'ช้ากว่าแผนต้องขึ้น +N');
});

test('ใบพิมพ์: เร็วกว่าแผนใช้ขีดลบ ไม่ใช่สีอย่างเดียว (ใบนี้ถูกถ่ายเอกสารขาวดำ)', () => {
  const html = withActual([step({
    startDate: '2026-09-07', finishDate: '2026-09-11',
    actualStartDate: '2026-09-07', actualFinishDate: '2026-09-10',
  })]);
  assert.match(html, /class="c-act">10\/09\/26 −1<\/div>/);
});

test('ใบพิมพ์: ขั้นที่ยังไม่เริ่ม ไม่มีบรรทัดของจริงและไม่มีแถบ — ไม่เดาอนาคต', () => {
  const html = withActual([step({ status: 'Pending', actualStartDate: null, actualFinishDate: null })]);
  assert.doesNotMatch(html, /class="c-act"/);
  assert.doesNotMatch(html, /class="act"/);
});

test('ใบพิมพ์: กำลังทำ = มีบรรทัดฝั่งเริ่มอย่างเดียว · ของเก่าที่ไม่มีวันเริ่มจริง = มีฝั่งจบอย่างเดียว', () => {
  const running = withActual([step({
    status: 'In Progress', startDate: '2026-09-14', finishDate: '2026-09-16',
    actualStartDate: '2026-09-15', actualFinishDate: null,
  })]);
  assert.equal((running.match(/class="c-act"/g) || []).length, 1);
  assert.match(running, /class="c-act">15\/09\/26 \+1<\/div>/);

  // แถวก่อน mig 0239 มีแต่วันเสร็จจริง — ฝั่งเริ่มต้องเว้นไว้ ไม่เดาจากวันตามแผน
  const legacy = withActual([step({
    startDate: '2026-09-14', finishDate: '2026-09-18',
    actualStartDate: null, actualFinishDate: '2026-09-22',
  })]);
  assert.equal((legacy.match(/class="c-act"/g) || []).length, 1);
  assert.match(legacy, /class="c-act">22\/09\/26 \+2<\/div>/);
});

test('ใบพิมพ์: แถบของจริงวางในช่องสัปดาห์ได้แม้หลุดนอกช่วงแผน', () => {
  // แผนจบ 30/09 แต่ทำจริงไปจบ 02/10 = ข้ามเดือน ⇒ ต้องมีแถบไปโผล่สัปดาห์ของ ต.ค.
  const html = withActual([step({
    startDate: '2026-09-21', finishDate: '2026-09-30',
    actualStartDate: '2026-09-21', actualFinishDate: '2026-10-02',
  })]);
  assert.ok((html.match(/class="act"/g) || []).length >= 2, 'แถบของจริงต้องกินหลายสัปดาห์ตามช่วงจริง');
});

test('ใบพิมพ์: legend อธิบายแถบของจริงและความหมายของเครื่องหมาย', () => {
  const html = withActual([step({ actualStartDate: '2026-09-01', actualFinishDate: '2026-09-04' })]);
  assert.match(html, /ช่วงที่ทำจริง/);
  assert.match(html, /ช้า \(\+\) \/ เร็ว \(−\)/);
});

test('ใบพิมพ์: จุดสำคัญที่ทำไปแล้วก็มีแถบของจริง ไม่ใช่มีแต่ ◆ ของแผน', () => {
  const html = withActual([step({
    isMilestone: true, durationDays: 1,
    startDate: '2026-09-01', finishDate: '2026-09-01',
    actualStartDate: '2026-09-03', actualFinishDate: '2026-09-03',
  })]);
  assert.match(html, /class="c-act">03\/09\/26 \+2<\/div>/, 'จุดสำคัญที่ช้าไป 2 วันทำการต้องบอกด้วย');
  assert.ok((html.match(/class="act"/g) || []).length >= 1, 'ต้องมีแถบของจริงในกริดสัปดาห์ด้วย');
});
