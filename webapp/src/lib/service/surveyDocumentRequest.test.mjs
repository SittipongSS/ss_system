// ── เอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU) บนหน้าคำร้อง — PR-3 สเปก §5 · §8 "Source wiring (D)" ──────────
//
// สามเรื่องที่ไฟล์นี้ล็อก:
//   ① บล็อกที่คนดูแต่ละกลุ่มได้ (`surveyJobView(…).document`) — ผู้ขอ · ผู้บริหาร · หัวหน้าฝ่ายบริการ · Planner · ไม่มีคีย์
//      (ตารางทุกสถานะอยู่ที่ surveyDocumentView.test.mjs — ที่นี่ล็อกสิ่งที่ **หน้าคำร้องวาดจริง** รายกลุ่มคนดู)
//   ② กติกาโหลดของเปลือก `app/requests/[id]/page.js` (§5.3) — โหลดเบื้องหลังที่พังต้องไม่แทนหน้าด้วยกล่องแดง ·
//      ตัวจับเวลาตอนเอกสารกำลังออก (และเพดานของมัน) · เธรดเป็นสัญญาณให้อ่านใบใหม่ (หนึ่งปุ่ม/หนึ่งโพสต์ = อ่านใบรอบเดียว) ·
//      บรรทัดเอกสารในโมดัล "ยังไม่จบ" (§5.2)
//   ③ บล็อกบน `SurveyRequestView.js` (§5.1) — วาดจาก `job.document` อย่างเดียว · ล็อกปุ่มที่ไฟล์ยังไม่พร้อม 15 วินาที
//   ④ ของที่ UAT จอจริงจับได้ (08/10): ตัวตรวจซ้ำเลิกแล้วจอต้องบอก · เวลารอไฟล์ตัวเลขเดียว · ใบยกเลิกไม่ใช่ "ปิดแล้ว" ·
//      เหตุของปุ่มที่ติดด่านไม่ใช่ toast แดง · ช่องว่างไม่กินแถวที่จอแคบ · ป้ายหัวใบไม่ขึ้นบรรทัดกลางคำ
//
// ⚠️ โปรเจกต์นี้ไม่มี test runner ฝั่ง React ⇒ ตัวตัดสินของจอ (`load` · ตัวจับเวลา · `onThreadItems` · `open`) ถูกตัดจากซอร์ส
//    มารันกับตัวแทนของ state/ref/นาฬิกา — เทสต์พฤติกรรมจริงของโค้ดที่ขึ้น prod ไม่ใช่แค่ว่ามีคำนั้นอยู่ในไฟล์
//    · `load` กับ `onThreadItems` ใช้ ref ชุดเดียวกัน (`threadSeen`) ⇒ เทสต์ที่ข้ามสองตัวต่อสายจริง ไม่จำลองอีกฝั่ง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyJobView } from './surveyJob.js';
import { surveyReopenDocumentLine } from './surveyDocumentView.js';
import { createLatestRun } from '../ui/latestRun.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');
/* เทียบเฉพาะโค้ด — คอมเมนต์ที่เล่าว่าของเดิมผิดยังไงต้องไม่ทำเทสต์เขียว/แดงแทนโค้ด */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PAGE = read('app/requests/[id]/page.js');
const PAGE_CODE = code(PAGE);
const VIEW = read('components/requests/details/SurveyRequestView.js');
const VIEW_CODE = code(VIEW);
const VIEW_CSS = code(read('components/requests/details/surveyRequest.module.css'));
const GATED_CODE = code(read('components/ui/GatedAction.js'));

/* ตัดช่วงของซอร์สระหว่างสองหมุด (รวมหมุดต้น · ไม่รวมหมุดท้าย) — หาไม่เจอ = เทสต์แดงพร้อมชื่อหมุด */
function between(src, from, to, label) {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `ไม่เจอ ${label || from}`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end > start, `ไม่เจอท้ายของ ${label || from}`);
  return src.slice(start, end);
}

/* ══ ① บล็อกรายกลุ่มคนดู ══════════════════════════════════════════════════════════════ */

const SENT = '2026-09-29T03:00:00.000Z';
const spotFile = (spotId) => ({ docType: 'survey_spot', mimeType: 'image/jpeg', fileName: null, metadata: { spotId } });
const request = (over = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'answered', docNo: 'RQ-AS-26090188', team: 'SV',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-09-23T07:50:00Z',
  acknowledgedAt: '2026-09-23T08:12:00Z', acknowledgedByName: 'Apisith Pattangthani',
  answeredAt: SENT, answeredByName: 'Apisith Pattangthani',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad',
  requestedDueDate: '2026-09-28', requestedResultDate: '2026-09-30',
  committedDueDate: '2026-09-28', committedResultDate: '2026-09-30', dueCommittedAt: '2026-09-23T08:15:00Z',
  surveySite: { id: 's1', code: 'ST-1036-01-BKK-1160', name: 'สำนักงานใหญ่', routeZone: 'BKK' },
  surveyVisit: {
    id: 'v1', code: 'SV-26090014', status: 'done', scheduledDate: '2026-09-28', startTime: '10:00:00',
    assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', actualDate: '2026-09-28', actualStartTime: '10:12:00',
    actualEndTime: '11:48:00',
  },
  surveyZones: [{
    id: 'z1', zoneName: 'Reception ชั้น 1', zoneCode: 'ZN-1160-10254', zoneFloor: '01', status: 'ok',
    parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [{ id: 'a' }],
  }],
  surveyFilesByZone: { z1: [{ docType: 'survey_wide' }, spotFile('a')] },
  ...over,
});

/* ธง `access` ตามที่ server ให้แต่ละกลุ่ม (`surveyDocAccess`) — จอไม่เคยคิดธงพวกนี้เอง */
const ACCESS = {
  sales: { customer: true, internal: false, issue: false, draft: false, history: false },
  exec: { customer: true, internal: true, issue: false, draft: false, history: false },
  head: { customer: true, internal: true, issue: true, draft: true, history: true },
};
const current = (ready = { customer: true, internal: true }) => ({
  docNo: 'SU-26090001-0', rev: 0, issuedAt: '2026-09-29T03:01:00.000Z', issuedByName: 'Apisith Pattangthani',
  approvedByName: 'Apisith Pattangthani', approvedAt: SENT, frozenAt: SENT, ready,
});
const payload = (who, state, over = {}) => ({
  access: ACCESS[who], issueAtSend: false, storeAllowed: true, state,
  current: ['issued', 'frozen', 'ready'].includes(state) ? current() : null, ...over,
});
/* ธงของคนดูที่เปลือกส่ง (`kindViewer`) — ใช้เลือก **ข้อความ** เท่านั้น */
const VIEWER = {
  sales: { isRequesterSide: true, isOpener: true, canDecide: false, canWork: false },
  exec: { isRequesterSide: false, canDecide: false, canWork: false },
  head: { isRequesterSide: false, canDecide: true, canWork: true },
  planner: { isRequesterSide: false, canDecide: false, canWork: true },
};
const blockOf = (surveyDocument, viewer, over = {}) => surveyJobView({
  request: request({ surveyDocument, ...over }), today: '2026-09-30', viewer,
}).document;

const SALES_FOOT = 'ดาวน์โหลดแล้วส่งให้ลูกค้าเอง — ระบบไม่ส่งอีเมลหรือลิงก์ให้ลูกค้า';
const NO_DOC_THREAD = 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร (เขียนในเธรดด้านล่างได้)';
const NO_DOC_DIRECT = 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการโดยตรงให้กดออกเอกสาร';

test('ผู้ขอ (ฝ่ายขาย) · เอกสารพร้อม: เลขที่ · ออกเมื่อ · ออกโดย · ปุ่มเดียวของฉบับลูกค้า — ไม่มีอะไรของฉบับภายใน', () => {
  const doc = blockOf(payload('sales', 'ready'), VIEWER.sales);
  assert.equal(doc.state, 'ready');
  assert.deepEqual(doc.badge, { label: 'ออกแล้ว', tone: 'success' });
  assert.equal(doc.docNo, 'SU-26090001-0');
  assert.equal(doc.issuedText, '29/09/2026 10:01', 'เวลาไทยเสมอ (03:01Z = 10:01)');
  assert.equal(doc.issuedByName, 'Apisith Pattangthani');
  assert.equal(doc.text, null, 'ไฟล์พร้อมแล้ว ไม่มีอะไรต้องเตือน');
  assert.deepEqual(doc.buttons, [{
    id: 'customer', label: 'ดาวน์โหลด PDF', href: '/api/service/surveys/r1/document?version=customer&download=1', ready: true, blocked: null,
  }]);
  assert.equal(doc.foot, SALES_FOOT);
  assert.equal(doc.sheetLink, false);
  assert.doesNotMatch(JSON.stringify(doc), /internal|ภายใน/);
});

test('ผู้ขอ · ออกเลขแล้วแต่ไฟล์ยังไม่ถูกจัดทำ: ปุ่มกดได้ (`ready: false` ไม่มีเหตุติด) — จอเริ่มรอ 15 วินาทีจากธงนี้', () => {
  const doc = blockOf(payload('sales', 'issued', { current: current({ customer: false, internal: false }) }), VIEWER.sales);
  assert.equal(doc.buttons.length, 1);
  assert.equal(doc.buttons[0].ready, false);
  assert.equal(doc.buttons[0].blocked, null);
  assert.equal(doc.buttons[0].href, '/api/service/surveys/r1/document?version=customer&download=1');
  assert.equal(doc.text.tone, 'info');
  // ใบที่ตอบแล้วยังไม่ปิด = เธรดยังรับข้อความของผู้ขอ ⇒ ชี้ไปเธรด
  assert.equal(doc.text.text, 'เปิดครั้งแรกรอประมาณ 10 วินาที (ระบบจัดทำไฟล์) · ถ้าเปิดไม่ได้ แจ้งหัวหน้าฝ่ายบริการในเธรดด้านล่าง');
  // ใบปิดแล้ว เธรดไม่รับข้อความ ⇒ "โดยตรง"
  const closed = blockOf(payload('sales', 'issued', { current: current({ customer: false, internal: false }) }), VIEWER.sales,
    { status: 'closed', closedAt: '2026-09-30T02:00:00.000Z' });
  assert.match(closed.text.text, /แจ้งหัวหน้าฝ่ายบริการโดยตรง$/);
  assert.equal(closed.buttons[0].blocked, null, 'ใบที่ส่งผลแล้วและปิดเรื่อง เอกสารยังใช้อยู่ — ปุ่มยังกดได้');
});

test('⭐ คำตอบเจ้าของข้อ 1 — ใบที่ตอบแล้วแต่ยังไม่มีเอกสาร: ฝ่ายขายเห็นประโยคเสมอ พร้อมช่องทางที่ใช้ได้จริง', () => {
  // ใบยังเดิน: เขียนในเธรดได้
  const open = blockOf(payload('sales', 'missing'), VIEWER.sales);
  assert.deepEqual(open.text, { tone: 'info', text: NO_DOC_THREAD });
  // ใบปิดแล้ว (ใบเก่าส่วนใหญ่): เธรดล็อก ⇒ แจ้งโดยตรง และบอกว่าทำไมเขียนเธรดไม่ได้
  const closed = blockOf(payload('sales', 'missing'), VIEWER.sales, { status: 'closed', closedAt: '2026-09-30T02:00:00.000Z' });
  assert.equal(closed.text.text, `${NO_DOC_DIRECT} (ใบนี้ปิดแล้ว เขียนในเธรดไม่ได้)`);
  // ผู้บริหารไม่ใช่สองฝ่ายของใบ — เธรดไม่รับข้อความของเขาแม้ใบยังเดิน ⇒ ไม่ชี้ไปเธรด และไม่อ้างว่าใบปิด
  const exec = blockOf(payload('exec', 'missing'), VIEWER.exec);
  assert.equal(exec.text.text, NO_DOC_DIRECT);
  assert.equal(new Set([open.text.text, closed.text.text, exec.text.text]).size, 3, 'สามกลุ่มได้สามประโยค');

  // ปุ่มยังวาด (ติดด่าน = โชว์แล้วบอกเหตุ) — เหตุที่ปุ่มบอกตอนกด = ประโยคที่พิมพ์อยู่ในบล็อก · ไม่มีที่อยู่ไฟล์ให้กด
  for (const doc of [open, closed, exec]) {
    assert.ok(doc.buttons.length > 0);
    for (const button of doc.buttons) {
      assert.equal(button.href, null);
      assert.equal(button.blocked, doc.text.text);
    }
    assert.equal(doc.docNo, null);
    assert.equal(doc.issuedText, null);
    assert.equal(doc.foot, null, 'ไม่มีไฟล์ให้ดาวน์โหลด = ไม่มีบรรทัด "ดาวน์โหลดแล้วส่งให้ลูกค้าเอง"');
    assert.equal(doc.sheetLink, false, 'คนที่ออกเอกสารไม่ได้ไม่มีลิงก์ไปใบประเมิน');
  }
});

test('ผู้บริหาร (อ่านอย่างเดียว) · คำตอบเจ้าของข้อ 3: ได้ปุ่มละฉบับบนหน้าคำร้อง พร้อมคำเตือนฉบับภายใน', () => {
  const doc = blockOf(payload('exec', 'ready'), VIEWER.exec);
  assert.deepEqual(doc.buttons.map((b) => [b.id, b.label, b.href]), [
    ['customer', 'ดาวน์โหลด PDF ฉบับลูกค้า', '/api/service/surveys/r1/document?version=customer&download=1'],
    ['internal', 'ดาวน์โหลด PDF ฉบับภายใน', '/api/service/surveys/r1/document?version=internal&download=1'],
  ]);
  assert.equal(doc.foot, `${SALES_FOOT} · ฉบับภายในห้ามส่งลูกค้า`);
  assert.equal(doc.sheetLink, false);
  // ตรึงแล้ว ไฟล์ฉบับลูกค้าพร้อม ฉบับภายในยัง — แต่ละปุ่มถือธงของตัวเอง (จอรอเฉพาะปุ่มที่ยังไม่พร้อม)
  const half = blockOf(payload('exec', 'frozen', { current: current({ customer: true, internal: false }) }), VIEWER.exec);
  assert.deepEqual(half.buttons.map((b) => [b.id, b.ready, b.blocked]), [['customer', true, null], ['internal', false, null]]);
});

test('หัวหน้าฝ่ายบริการ · ยังไม่มีเอกสาร: ชี้ไปกดที่ใบประเมิน + ลิงก์ "เปิดใบประเมิน" เมื่อเปิดใบได้ — หน้านี้ไม่มีปุ่มออกเอกสาร', () => {
  const headDoc = payload('head', 'missing', { history: [], nextDocNo: null, send: null, issue: null, voids: null });
  const doc = blockOf(headDoc, VIEWER.head);
  assert.deepEqual(doc.text, { tone: 'info', text: 'ยังไม่มีเอกสารของใบนี้ — กด “ออกเอกสาร” ที่ใบประเมิน' });
  assert.equal(doc.sheetLink, true);
  assert.equal(blockOf(headDoc, { ...VIEWER.head, canWork: false }).sheetLink, false, 'เปิดใบประเมินไม่ได้ = ไม่มีลิงก์');
  assert.deepEqual(doc.buttons.map((b) => [b.id, b.href, b.blocked]), [
    ['customer', null, doc.text.text], ['internal', null, doc.text.text],
  ]);
  // ปุ่มของบล็อกมีแต่ดาวน์โหลด — ไม่มีปุ่มไหนชื่อ "ออกเอกสาร" (คำนี้บนหน้าคำร้องหมายถึงกระดาษ PDR)
  assert.ok(doc.buttons.every((b) => b.label.startsWith('ดาวน์โหลด PDF')));
});

test('🔴 Planner ไม่มีบล็อกทุกกรณี · ไม่มีคีย์ / ไม่มีสิทธิ์ / ยังไม่ส่งผล = ไม่มีบล็อก', () => {
  const voids = { access: 'none', voids: 'SU-26090001-0' };
  const unknown = { access: 'none', voids: null, unknown: true };
  assert.equal(blockOf(voids, VIEWER.planner), null);
  assert.equal(blockOf(unknown, VIEWER.planner), null, 'อ่านเอกสารไม่สำเร็จก็ไม่ขึ้นบล็อก "ไม่ทราบ" ให้คนที่ไม่มีสิทธิ์เอกสาร');
  // …แต่โมดัล "ยังไม่จบ" ยังบอกผลของการกดให้เขา (กติกา #1223) — เปลือกอ่านคีย์เดียวกันนี้
  assert.match(surveyReopenDocumentLine(voids, request()), /^เอกสาร SU-26090001-0 จะถูกแทนที่ — ใช้ไม่ได้ทันทีที่กด/);
  assert.match(surveyReopenDocumentLine(unknown, request()), /^อ่านสถานะเอกสารประเมินไม่สำเร็จ/);
  assert.equal(surveyReopenDocumentLine(unknown, request({ answeredAt: null })), null, 'ใบที่ยังไม่ตอบ เปิดกลับไม่แทนที่อะไร');

  assert.equal(blockOf(undefined, VIEWER.sales), null, 'หัวข้ออื่น/ใบเก่าที่ GET ไม่ส่งคีย์มา');
  assert.equal(blockOf({ access: 'none' }, VIEWER.sales), null);
  assert.equal(blockOf(payload('sales', 'not_sent'), VIEWER.sales, { status: 'acknowledged', answeredAt: null }), null);
  // อ่านไม่สำเร็จ ≠ ไม่มีเอกสาร — ฝั่งผู้ขอได้บล็อก "ไม่ทราบ" ไม่ใช่ประโยค "ยังไม่มีเอกสาร"
  const lost = blockOf({ access: 'none', unknown: true }, VIEWER.sales);
  assert.equal(lost.state, 'unknown');
  assert.equal(lost.text.tone, 'warning');
  assert.doesNotMatch(lost.text.text, /ยังไม่มีเอกสาร/);
  assert.deepEqual(lost.buttons, []);
});

test('สถานะที่ไม่มีไฟล์ให้เปิด: กำลังออก · ถูกแทนที่ · ใช้ไม่ได้ — ปุ่มวาดแต่ติดเหตุ · บล็อกไม่ผูกกับ "ส่งผลแล้ว"', () => {
  const issuing = blockOf(payload('sales', 'issuing'), VIEWER.sales);
  assert.deepEqual(issuing.text, { tone: 'info', text: 'กำลังออกเอกสารของใบนี้ — หน้านี้ตรวจให้เองทุก 15 วินาที' });
  assert.equal(issuing.buttons[0].href, null);

  // ผลถูกดึงกลับ: ใบกลับไป "ยังไม่ส่งผล" (ไม่มีแถบตัวเลข) แต่บล็อกยังต้องขึ้น — เป็นอย่างแรกของการ์ด
  const recalledJob = surveyJobView({
    request: request({ status: 'acknowledged', answeredAt: null, answeredByName: null, surveyDocument: payload('sales', 'recalled') }),
    today: '2026-09-30', viewer: VIEWER.sales,
  });
  assert.equal(recalledJob.zones.sent, false);
  assert.equal(recalledJob.document.text.tone, 'warning');
  assert.equal(recalledJob.document.text.text,
    'เอกสารฉบับก่อนถูกแทนที่แล้ว — ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ฉบับใหม่ (Rev ถัดไป) ออกหลังฝ่ายบริการส่งผลอีกครั้ง');
  assert.doesNotMatch(recalledJob.document.text.text, /SU-/, 'ฝ่ายขายไม่ได้รายการ Rev ⇒ ไม่มีเลขของฉบับเก่า');
  assert.equal(recalledJob.document.buttons[0].blocked, recalledJob.document.text.text);

  const stale = blockOf(payload('sales', 'stale', { current: current() }), VIEWER.sales);
  assert.equal(stale.text.tone, 'danger');
  assert.equal(stale.buttons[0].href, null);
});

test('🐞 UAT R17 · ผลถูกดึงกลับแล้วใบถูกยกเลิก: ประโยคพูดคำเดียวกับหัวใบ ("ยกเลิก") — "ปิดแล้ว" เฉพาะใบที่ปิด', () => {
  const recalled = payload('sales', 'recalled');
  const base = { answeredAt: null, answeredByName: null };
  const jobOf = (over) => surveyJobView({ request: request({ ...base, surveyDocument: recalled, ...over }), today: '2026-09-30', viewer: VIEWER.sales });
  const cancelled = jobOf({ status: 'cancelled', cancelledAt: '2026-09-30T02:00:00.000Z' });
  // ป้ายบนหัวใบของใบเดียวกัน — บล็อกเอกสารต้องไม่เรียกใบนี้ว่า "ปิดแล้ว"
  assert.equal(cancelled.status.label, 'ยกเลิก');
  assert.equal(cancelled.document.text.text, 'เอกสารฉบับก่อนถูกแทนที่แล้ว — ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ใบนี้ยกเลิกแล้ว ไม่มีฉบับใหม่');
  assert.doesNotMatch(cancelled.document.text.text, /ปิดแล้ว/);
  assert.deepEqual(cancelled.document.buttons, []);
  const closed = jobOf({ status: 'closed', closedAt: '2026-09-30T02:00:00.000Z' });
  assert.equal(closed.document.text.text, 'เอกสารฉบับก่อนถูกแทนที่แล้ว — ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว · ใบนี้ปิดแล้ว ไม่มีฉบับใหม่');
});

test('🐞 UAT · กำลังออก แต่เปลือกเลิกตรวจซ้ำแล้ว (`refreshStalled`): บล็อกเลิกสัญญา "ตรวจให้เองทุก 15 วินาที" — ไม่ทราบ + ลองโหลดหน้าใหม่', () => {
  const jobOf = (refreshStalled) => surveyJobView({
    request: request({ surveyDocument: payload('sales', 'issuing') }), today: '2026-09-30', viewer: VIEWER.sales, refreshStalled,
  });
  const checking = jobOf(false).document;
  assert.deepEqual(checking.badge, { label: 'กำลังออก', tone: 'info' });
  assert.match(checking.text.text, /หน้านี้ตรวจให้เองทุก 15 วินาที$/);
  const stopped = jobOf(true).document;
  assert.deepEqual(stopped.badge, { label: 'ไม่ทราบ', tone: 'neutral' });
  assert.deepEqual(stopped.text, { tone: 'warning', text: 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ยังไม่ทราบว่ามีเอกสารหรือไม่ · ลองโหลดหน้าใหม่' });
  assert.doesNotMatch(JSON.stringify(stopped), /กำลังออก|ตรวจให้เอง/);
  assert.deepEqual(stopped.buttons, [], 'แถว "ไม่ทราบ" ของตาราง §5.1 ไม่มีปุ่ม');
  // ไม่ส่งธง (หน้าอื่นเอา view-model ไปใช้) = ยังตรวจอยู่ตามเดิม · สถานะอื่นไม่เปลี่ยนตามธง
  assert.deepEqual(surveyJobView({ request: request({ surveyDocument: payload('sales', 'issuing') }), today: '2026-09-30', viewer: VIEWER.sales }).document, checking);
  const ready = (refreshStalled) => surveyJobView({
    request: request({ surveyDocument: payload('sales', 'ready') }), today: '2026-09-30', viewer: VIEWER.sales, refreshStalled,
  }).document;
  assert.deepEqual(ready(true), ready(false));
});

/* ══ ② เปลือก — กติกาโหลด (§5.3) ═══════════════════════════════════════════════════════ */

/* ค่าคงที่ตัวเลขของเปลือก อ่านจากซอร์ส (`const NAME = 15_000;`) */
const pageNumber = (name) => Number(new RegExp(`const ${name} = ([\\d_]+);`).exec(PAGE_CODE)?.[1].replaceAll('_', ''));

/* `load` ของเปลือก ตัดจากซอร์สมารันกับตัวแทนของ state/ref — คืนตัวรันพร้อมสมุดจด
   · `state.stalled` = ค่าล่าสุดของ `refreshStalled` · `state.stalledSets` = ทุกค่าที่ถูกตั้ง ตามลำดับ */
function makeLoad() {
  const body = between(PAGE_CODE, 'const load = useCallback(async (opts) => {', '}, [id, startRun]);', '`load` ของเปลือก')
    .replace('const load = useCallback(', '');
  const calls = [];
  const state = { req: null, loading: true, loadError: '', settled: 0, errors: [], stalled: false, stalledSets: [] };
  const latestBusy = { current: false };
  const failedRuns = { current: 0 };
  const threadSeen = { current: null };
  const apiFetch = (url, init) => new Promise((resolve, reject) => { calls.push({ url, init, resolve, reject }); });
  const load = new Function(
    'startRun', 'latestBusy', 'failedRuns', 'threadSeen', 'setLoading', 'setLoadError', 'setReq', 'setLoadSettled', 'apiFetch', 'id',
    'setRefreshStalled', 'SURVEY_DOCUMENT_POLL_MAX_FAILS',
    `return (${body}});`,
  )(
    createLatestRun(), latestBusy, failedRuns, threadSeen,
    (v) => { state.loading = v; },
    (v) => { state.loadError = v; state.errors.push(v); },
    (v) => { state.req = v; },
    (fn) => { state.settled = fn(state.settled); },
    apiFetch, 'r1',
    (v) => { state.stalled = v; state.stalledSets.push(v); },
    pageNumber('SURVEY_DOCUMENT_POLL_MAX_FAILS'),
  );
  return { load, state, calls, latestBusy, failedRuns, threadSeen };
}
/* `onThreadItems` ของเปลือก ตัดจากซอร์ส — หนึ่งตัวต่อหนึ่ง "เธรดที่ต่ออยู่" (ตัวจำ `threadSeen` เป็น ref ของเปลือก อยู่ข้ามการต่อใหม่)
   ตัวจับเวลาเป็นคิวที่เทสต์สั่งเดินเอง: `flush()` รันทุกตัวที่ค้าง แล้วคืนค่าที่แต่ละตัวคืน (promise ของ `load`) */
function makeThread(req, { threadSeen = { current: null }, load = null } = {}) {
  const body = between(PAGE_CODE, 'const onThreadItems = (items) => {', 'const threadBlock = (', '`onThreadItems`');
  const loads = [];
  const timers = [];
  const fn = new Function('threadSeen', 'req', 'load', 'setTimeout', `${body}\nreturn onThreadItems;`)(
    threadSeen, req, load || ((opts) => { loads.push(opts); }),
    (cb, delay) => { timers.push({ cb, delay }); return timers.length; },
  );
  const flush = () => timers.splice(0).map((timer) => timer.cb());
  return { fn, loads, timers, flush, threadSeen };
}
const rows = (...ids) => ids.map((id) => ({ id }));
/* effect ของตัวจับเวลา "กำลังออกเอกสาร" ตัดจากซอร์ส — `run()` = effect หนึ่งรอบกับใบที่อยู่บนจอของ `a`
   คืน `{ cb, delay }` ของตัวจับเวลาที่ถูกตั้ง หรือ `null` เมื่อรอบนั้นไม่ตั้ง */
const POLL_DEPS = '}, [surveyDocumentState, loadSettled, load]);';
function makePoll(a) {
  const body = between(PAGE_CODE, 'if (surveyDocumentState !== "issuing") return undefined;', POLL_DEPS, 'ตัวจับเวลากำลังออกเอกสาร');
  const MS = pageNumber('SURVEY_DOCUMENT_POLL_MS');
  const MAX = pageNumber('SURVEY_DOCUMENT_POLL_MAX_FAILS');
  const effect = new Function(
    'surveyDocumentState', 'failedRuns', 'load', 'setTimeout', 'clearTimeout', 'SURVEY_DOCUMENT_POLL_MS', 'SURVEY_DOCUMENT_POLL_MAX_FAILS', body,
  );
  const run = () => {
    let armed = null;
    effect(a.state.req?.surveyDocument?.state, a.failedRuns, a.load, (cb, delay) => { armed = { cb, delay }; return 1; }, () => {}, MS, MAX);
    return armed;
  };
  return { run, MS, MAX };
}
/* คำขอตัวแทนไม่ตอบเองจนกว่าเทสต์จะสั่ง ⇒ โค้ดที่ถดถอยอาจรอคำตอบที่ไม่มีวันมา · เพดานเวลาเปลี่ยน "ค้าง" เป็น "แดง" */
const HANG_GUARD = { timeout: 5000 };
const ok = (body) => ({ ok: true, json: async () => body });
const refused = (error) => ({ ok: false, json: async () => ({ error }) });

test('load · รอบปกติ: โหลดได้ = ตั้งใบ ล้าง error · โหลดพัง = กล่อง error ตามเดิม (ผู้เรียกเดิมไม่เปลี่ยนพฤติกรรม)', HANG_GUARD, async () => {
  const a = makeLoad();
  const run = a.load();
  assert.equal(a.calls.length, 1);
  assert.equal(a.calls[0].url, '/api/sa/requests/r1');
  assert.deepEqual(a.calls[0].init, { cache: 'no-store' });
  assert.equal(a.state.loading, true);
  a.calls[0].resolve(ok({ id: 'r1', status: 'answered' }));
  await run;
  assert.deepEqual(a.state.req, { id: 'r1', status: 'answered' });
  assert.equal(a.state.loading, false);
  assert.equal(a.state.loadError, '');
  assert.equal(a.state.settled, 1);
  assert.equal(a.latestBusy.current, false);
  assert.equal(a.failedRuns.current, 0);

  // เรียกแบบ callback ของลูก (`onPosted={load}` ส่ง event/ข้อมูลมาเป็น arg) = โหมดปกติ ไม่ใช่เบื้องหลัง
  const viaChild = a.load({ type: 'click' });
  assert.equal(a.state.loading, true);
  a.calls[1].resolve(refused('ไม่มีสิทธิ์ดูคำร้องนี้'));
  await viaChild;
  assert.equal(a.state.loadError, 'ไม่มีสิทธิ์ดูคำร้องนี้');
  assert.equal(a.state.loading, false);
  assert.equal(a.latestBusy.current, false, 'รอบที่พังก็ปลดธง — ไม่งั้นรอบเบื้องหลังถูกกันตลอดไป');

  // ต่อไม่ติด (apiFetch โยน) และคำตอบที่ไม่มีข้อความ
  const b = makeLoad();
  const lost = b.load();
  b.calls[0].reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง'));
  await lost;
  assert.equal(b.state.loadError, 'เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง');
  const c = makeLoad();
  const bare = c.load();
  c.calls[0].resolve({ ok: false, json: async () => { throw new Error('not json'); } });
  await bare;
  assert.equal(c.state.loadError, 'โหลดคำร้องไม่สำเร็จ');
});

test('🔴 load · รอบเบื้องหลังที่พัง: หน้าอยู่ตามเดิม ไม่มีกล่องแดง — และนับว่าจบรอบ ให้ตัวจับเวลาตั้งรอบใหม่ได้', HANG_GUARD, async () => {
  const a = makeLoad();
  const first = a.load();
  a.calls[0].resolve(ok({ id: 'r1', surveyDocument: { state: 'issuing' } }));
  await first;
  const before = a.state.req;
  a.state.errors.length = 0;

  for (const fail of [
    (call) => call.reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง')),
    (call) => call.resolve(refused('ระบบขัดข้องชั่วคราว')),
  ]) {
    const settledBefore = a.state.settled;
    const run = a.load({ background: true });
    assert.equal(a.state.loading, false, 'เบื้องหลัง = ไม่พาหน้าไปสถานะกำลังโหลด (เธรดไม่ถูกถอด)');
    fail(a.calls.at(-1));
    await run;
    assert.equal(a.state.req, before, 'ใบบนจอเป็นตัวเดิม');
    assert.equal(a.state.loadError, '');
    assert.deepEqual(a.state.errors, [], 'ไม่แตะ `loadError` เลย — เปลือกวาดกล่องแดงจากค่านี้');
    assert.equal(a.state.loading, false);
    assert.equal(a.state.settled, settledBefore + 1);
    assert.equal(a.latestBusy.current, false);
  }
  assert.equal(a.failedRuns.current, 2, 'นับรอบที่พังติดกัน — เพดานของตัวจับเวลาอ่านจากตัวนี้');
  assert.equal(a.state.stalled, false, 'ยังไม่ชนเพดาน — จอยังไม่ถูกบอกว่าเลิกตรวจ');

  // รอบเบื้องหลังที่ได้ใบ = ตั้งใบใหม่ · และพาหน้ากลับมาเองถ้ารอบปกติก่อนหน้าพังไว้
  const failing = a.load();
  a.calls.at(-1).reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง'));
  await failing;
  assert.equal(a.state.loadError, 'เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง');
  const quiet = a.load({ background: true });
  a.calls.at(-1).resolve(ok({ id: 'r1', surveyDocument: { state: 'ready' } }));
  await quiet;
  assert.deepEqual(a.state.req, { id: 'r1', surveyDocument: { state: 'ready' } });
  assert.equal(a.state.loadError, '');
  assert.equal(a.failedRuns.current, 0, 'รอบที่ได้ใบล้างตัวนับ (ก่อนหน้านี้พังสามรอบติด)');
});

test('load · รอบเบื้องหลังไม่แซงรอบล่าสุดที่บินอยู่ · คำตอบมาผิดลำดับถูกทิ้ง (รอบล่าสุดชนะ)', HANG_GUARD, async () => {
  // ① รอบล่าสุดยังบินอยู่ (ปกติหรือเบื้องหลังก็ตาม) ⇒ รอบเบื้องหลังใหม่ไม่ยิง
  //   ⚠️ ไม่ await รอบที่คาดว่าถูกข้าม — ถ้ากติกาหาย มันจะกลายเป็นคำขอที่ไม่มีใครตอบ แล้วเทสต์ค้างแทนที่จะแดง
  //      (การข้ามตัดสินก่อน await ตัวแรก ⇒ นับคำขอได้ทันทีหลังเรียก)
  const a = makeLoad();
  const fg = a.load();
  a.load({ background: true });
  assert.equal(a.calls.length, 1, 'มีรอบปกติบินอยู่ — ไม่มีคำขอที่สอง');
  assert.equal(a.latestBusy.current, true);
  a.calls[0].resolve(ok({ id: 'r1', n: 1 }));
  await fg;
  const bg = a.load({ background: true });
  a.load({ background: true });
  assert.equal(a.calls.length, 2, 'มีรอบเบื้องหลังบินอยู่ — รอบเบื้องหลังใหม่ไม่ยิงซ้อน');
  assert.equal(a.latestBusy.current, true);
  a.calls[1].resolve(ok({ id: 'r1', n: 2 }));
  await bg;
  assert.equal(a.state.req.n, 2);
  assert.equal(a.latestBusy.current, false);

  // ② รอบปกติเริ่มทับรอบเบื้องหลัง: ของรอบเบื้องหลังที่มาทีหลังถูกทิ้ง ไม่เขียนทับของสด
  const b = makeLoad();
  const first = b.load();
  b.calls[0].resolve(ok({ id: 'r1', n: 0 }));
  await first;
  const slowBg = b.load({ background: true });
  const fresh = b.load();
  assert.equal(b.calls.length, 3);
  b.calls[2].resolve(ok({ id: 'r1', n: 'fresh' }));
  await fresh;
  assert.equal(b.state.settled, 2);
  b.calls[1].resolve(ok({ id: 'r1', n: 'stale' }));
  await slowBg;
  assert.equal(b.state.req.n, 'fresh');
  assert.equal(b.state.settled, 2, 'รอบที่ถูกทับไม่นับว่าจบ — ตัวนับเดินตามรอบล่าสุดเท่านั้น');
  assert.equal(b.state.loading, false);
  assert.equal(b.latestBusy.current, false);

  // ③ รอบปกติสองรอบซ้อน: รอบแรกพังทีหลัง ต้องไม่ตั้ง error ทับใบของรอบหลัง
  const c = makeLoad();
  const one = c.load();
  const two = c.load();
  c.calls[1].resolve(ok({ id: 'r1', n: 'two' }));
  await two;
  c.calls[0].reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง'));
  await one;
  assert.equal(c.state.req.n, 'two');
  assert.equal(c.state.loadError, '');
  assert.equal(c.state.loading, false);
  assert.equal(c.failedRuns.current, 0, 'รอบที่ถูกทับแล้วพัง ไม่นับเป็นรอบที่พัง');
});

test('🐞 load · รอบที่ถูกทับแต่ยังไม่ตอบ ไม่กันรอบเบื้องหลังใหม่ — ตัวจับเวลา "กำลังออกเอกสาร" ยังได้เดิน', HANG_GUARD, async () => {
  const issuing = { id: 'r1', surveyDocument: { state: 'issuing' } };
  const a = makeLoad();
  const poll = makePoll(a);
  const open = a.load();
  a.calls[0].resolve(ok(issuing));
  await open;

  // เธรดขยับ → รอบเบื้องหลัง B1 · ตามด้วยรอบปกติ F1 ที่ทับ B1 · F1 ตอบ B1 ค้าง (คำขอติดอยู่เกิน 15 วินาที)
  const b1 = a.load({ background: true });
  const f1 = a.load();
  assert.equal(a.calls.length, 3);
  a.calls[2].resolve(ok(issuing));
  await f1;
  assert.equal(a.state.settled, 2);
  assert.equal(a.latestBusy.current, false, 'รอบล่าสุดจบแล้ว — รอบที่ถูกทับไม่นับว่า "ยังบินอยู่"');

  // ครบ 15 วินาที: ตัวจับเวลาต้องยิงรอบใหม่ได้ทั้งที่ B1 ยังไม่ตอบ
  //   ⚠️ ไม่ await ก่อนนับ — ถ้ากติกาเดิมกลับมา รอบนี้ถูกข้ามตั้งแต่บรรทัดแรก และเทสต์ต้องแดงตรงนี้ ไม่ใช่ค้าง
  const tick = poll.run();
  assert.ok(tick, 'ยังอยู่สถานะกำลังออก — ตั้งตัวจับเวลา');
  const b2 = tick.cb();
  assert.equal(a.calls.length, 4, 'รอบที่ถูกทับต้องไม่กันรอบเบื้องหลังใหม่');

  // B1 ตอบระหว่าง B2 บิน: ถูกทิ้ง · ไม่ปลดธงของ B2 (ยังไม่ให้รอบเบื้องหลังอื่นแซง) · ไม่ขยับตัวนับ
  a.calls[1].resolve(ok({ id: 'r1', surveyDocument: { state: 'issuing' }, from: 'B1' }));
  await b1;
  assert.equal(a.state.req.from, undefined);
  assert.equal(a.state.settled, 2);
  assert.equal(a.latestBusy.current, true);
  a.load({ background: true });
  assert.equal(a.calls.length, 4, 'B2 (รอบล่าสุด) ยังบิน — ไม่ยิงซ้อน');

  a.calls[3].resolve(ok({ id: 'r1', surveyDocument: { state: 'ready' } }));
  await b2;
  assert.equal(a.state.settled, 3, 'รอบล่าสุดจบ = นับ ⇒ effect ของตัวจับเวลาได้รันอีกรอบ');
  assert.equal(a.state.req.surveyDocument.state, 'ready');
  assert.equal(a.latestBusy.current, false);
  assert.equal(poll.run(), null, 'ออกจากสถานะกำลังออกแล้ว — ไม่ตั้งตัวจับเวลา');

  // B1 ตอบหลังทุกอย่างจบ (อีกลำดับหนึ่ง): ไม่เขียนทับ ไม่ขยับตัวนับ ไม่ยกธงค้างไว้ · พังก็ไม่นับเป็นรอบที่พัง
  const c = makeLoad();
  const first = c.load();
  c.calls[0].resolve(ok(issuing));
  await first;
  const late = c.load({ background: true });
  const fresh = c.load();
  c.calls[2].resolve(ok(issuing));
  await fresh;
  c.calls[1].reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง'));
  await late;
  assert.equal(c.state.settled, 2);
  assert.equal(c.latestBusy.current, false);
  assert.equal(c.failedRuns.current, 0);
  assert.deepEqual(c.state.errors.filter(Boolean), []);
});

test('load · ซอร์ส: ใช้ useLatestRun · catch ตั้ง error เฉพาะรอบปกติที่ยังเป็นรอบล่าสุด · ตัวนับ loadSettled', () => {
  assert.match(PAGE, /import useLatestRun from "@\/lib\/ui\/useLatestRun";/);
  assert.match(PAGE_CODE, /const startRun = useLatestRun\(\);/);
  assert.match(PAGE_CODE, /const \[loadSettled, setLoadSettled\] = useState\(0\);/);
  const load = between(PAGE_CODE, 'const load = useCallback(async (opts) => {', '}, [id, startRun]);');
  assert.match(load, /const background = opts\?\.background === true;/);
  // 🔴 กันเฉพาะรอบ **ล่าสุด** ที่ยังบิน — ตัวนับ "ทุกรอบที่บิน" (`inFlight`) ทำให้รอบที่ถูกทับแล้วค้างกันทุกรอบเบื้องหลัง
  assert.match(load, /if \(background && latestBusy\.current\) return;/);
  assert.match(load, /const isLatest = startRun\(\);\s*latestBusy\.current = true;/);
  assert.doesNotMatch(PAGE_CODE, /inFlight/);
  // รอบปกติเริ่ม = ลืมแถวล่าสุดของเธรด (เธรดถูกถอดไปกับโครงรอ) · รอบเบื้องหลังไม่แตะ
  // (บรรทัด loading คงรูป `!opts?.background` ที่ lib/ui/staleScreenRefresh.test.mjs ล็อกไว้ก่อน PR-3 — สองบรรทัดต้องอยู่ติดกัน)
  assert.match(load, /if \(!opts\?\.background\) setLoading\(true\);\s*if \(!background\) \{ threadSeen\.current = null; setLoadError\(""\); \}/);
  assert.equal((load.match(/setLoading\(true\)/g) || []).length, 1, 'ที่เปิด loading มีที่เดียว และอยู่ใต้เงื่อนไขรอบปกติ');
  assert.equal((load.match(/threadSeen/g) || []).length, 1);
  assert.match(load, /catch \(e\) \{\s*if \(isLatest\(\)\) \{\s*failedRuns\.current \+= 1;\s*if \(failedRuns\.current >= SURVEY_DOCUMENT_POLL_MAX_FAILS\) setRefreshStalled\(true\);\s*if \(!background\) setLoadError\(e\.message\);\s*\}\s*\}/);
  // ธงของจอเดินคู่กับตัวนับ: รอบที่ได้ใบล้างทั้งคู่ (ติดกัน หลังเช็กรอบล่าสุด) · ตั้งธงที่อื่นไม่ได้
  assert.match(load, /if \(!isLatest\(\)\) return;\s*failedRuns\.current = 0;\s*setRefreshStalled\(false\);\s*setReq\(d\);/);
  assert.equal((PAGE_CODE.match(/setRefreshStalled\(/g) || []).length, 2, 'ธงถูกตั้งใน `load` สองจุดเท่านั้น (ชนเพดาน · ได้ใบ)');
  assert.match(PAGE_CODE, /const \[refreshStalled, setRefreshStalled\] = useState\(false\);/);
  assert.match(load, /finally \{\s*if \(isLatest\(\)\) \{\s*latestBusy\.current = false;\s*setLoading\(false\);\s*setLoadSettled\(\(n\) => n \+ 1\);\s*\}\s*\}/);
  assert.ok(load.indexOf('if (!isLatest()) return;') < load.indexOf('failedRuns.current = 0;'), 'รอบที่ถูกทับไม่ล้างตัวนับ');
  assert.ok(load.indexOf('if (!isLatest()) return;') < load.indexOf('setReq(d);'), 'เช็กรอบล่าสุดก่อนตั้งใบ');
  // ทั้งเปลือกมีที่ตั้ง error จากข้อความที่จับได้ที่เดียว — ทางอื่นทุกทางคือทางที่พาหน้าไปกล่องแดงโดยไม่ผ่านกติกา
  assert.equal((PAGE_CODE.match(/setLoadError\((?!"")/g) || []).length, 1);
  // จอยังเรียก API ผ่านตัวห่อ (check:apifetch) — ไม่มี fetch ดิบโผล่มากับการแก้รอบนี้
  assert.match(load, /await apiFetch\(`\/api\/sa\/requests\/\$\{id\}`, \{ cache: "no-store" \}\)/);
});

test('ตัวจับเวลา "กำลังออกเอกสาร": 15 วินาทีตรงกับประโยคในบล็อก · ตั้งรอบใหม่จาก loadSettled · ประกาศก่อนทางออกก่อนเวลา', () => {
  const ms = pageNumber('SURVEY_DOCUMENT_POLL_MS');
  assert.equal(ms, 15000);
  // ประโยคของ lib สัญญาจังหวะเดียวกัน — แก้ตัวใดตัวหนึ่งแล้วอีกตัวไม่ตาม = จอพูดไม่ตรงกับที่ทำ
  assert.ok(blockOf(payload('sales', 'issuing'), VIEWER.sales).text.text.includes(`ทุก ${ms / 1000} วินาที`));

  assert.match(PAGE_CODE, /const surveyDocumentState = req\?\.surveyDocument\?\.state;/);
  // 🔴 ต้องขึ้นกับตัวนับรอบที่จบ ไม่ใช่ `req` — รอบที่พังไม่เปลี่ยน `req` แล้วตัวจับเวลาจะหยุดเดิน (หมุดท้าย = deps ทั้งชุด)
  const effect = between(PAGE_CODE, 'if (surveyDocumentState !== "issuing") return undefined;', POLL_DEPS, 'ตัวจับเวลากำลังออกเอกสาร');
  assert.match(effect, /const timer = setTimeout\(\(\) => load\(\{ background: true \}\), SURVEY_DOCUMENT_POLL_MS\);/);
  assert.match(effect, /return \(\) => clearTimeout\(timer\);/);
  assert.doesNotMatch(effect, /\breq\b/);
  // เพดานอยู่ก่อนการตั้งตัวจับเวลา และอ่านตัวนับของ `load` (ไม่ใช่นาฬิกา — เครื่องที่พับจอแล้วเปิดใหม่ต้องยังได้ลอง)
  const cap = effect.indexOf('if (failedRuns.current >= SURVEY_DOCUMENT_POLL_MAX_FAILS) return undefined;');
  assert.ok(cap >= 0 && cap < effect.indexOf('setTimeout('), 'เช็กเพดานก่อนตั้งตัวจับเวลา');
  assert.doesNotMatch(effect, /Date\.now|performance\.now/);
  assert.doesNotMatch(PAGE_CODE, /setInterval\(/);

  // hook ทุกตัวของรอบนี้อยู่ก่อน `if (loading) return …` (กฎของ hook)
  const exit = PAGE_CODE.indexOf('if (loading) return');
  assert.ok(exit > 0);
  for (const hook of ['const startRun = useLatestRun();', 'const latestBusy = useRef(false);', 'const failedRuns = useRef(0);',
    'const threadSeen = useRef(null);', 'const refreshQuietly = useCallback(', 'if (surveyDocumentState !== "issuing")']) {
    const at = PAGE_CODE.indexOf(hook);
    assert.ok(at > 0 && at < exit, `${hook} ต้องอยู่ก่อนทางออกก่อนเวลา`);
  }
  // `load` ล้างตัวจำของเธรด ⇒ ref ต้องประกาศก่อน `load`
  assert.ok(PAGE_CODE.indexOf('const threadSeen = useRef(null);') < PAGE_CODE.indexOf('const load = useCallback('));
});

test('🐞 ตัวจับเวลา "กำลังออกเอกสาร" · GET พังติดกันครบเพดาน = เลิกตั้งรอบใหม่ · รอบที่ได้ใบพาเดินต่อเอง', HANG_GUARD, async () => {
  const issuing = { id: 'r1', surveyDocument: { state: 'issuing' } };
  const a = makeLoad();
  const poll = makePoll(a);
  assert.equal(poll.MAX, 8, '8 รอบ × 15 วินาที ≈ 2 นาที');
  const open = a.load();
  a.calls[0].resolve(ok(issuing));
  await open;

  const FAILS = [
    (call) => call.reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง')),   // เน็ตหลุด
    (call) => call.resolve(refused('กรุณาเข้าสู่ระบบ')),                       // 401 เซสชันหมด
    (call) => call.resolve(refused('ไม่พบคำร้อง')),                           // 404 ใบถูกลบ
    (call) => call.resolve({ ok: false, json: async () => { throw new Error('not json'); } }),   // 500 ไม่มีเนื้อ
  ];
  /* หนึ่งรอบของตัวจับเวลา: effect ตั้ง → ครบ 15 วินาที → อ่านใบเบื้องหลัง → เทสต์ตอบแทน server */
  const round = async (answer) => {
    const timer = poll.run();
    assert.ok(timer, 'ยังไม่ครบเพดาน — ต้องตั้งตัวจับเวลา');
    assert.equal(timer.delay, 15000);
    const run = timer.cb();
    answer(a.calls.at(-1));
    await run;
  };

  // พังเกือบครบเพดาน แล้วได้ใบหนึ่งรอบ (ยังกำลังออก) = ตัวนับกลับเป็นศูนย์ · เน็ตสะดุดเป็นช่วง ๆ ไม่ทำให้เลิกตรวจ
  for (let i = 0; i < poll.MAX - 1; i += 1) await round(FAILS[i % FAILS.length]);
  assert.equal(a.failedRuns.current, poll.MAX - 1);
  assert.equal(a.state.stalled, false, 'ยังตรวจอยู่ — จอยังสัญญา "ตรวจให้เองทุก 15 วินาที" ได้');
  await round((call) => call.resolve(ok(issuing)));
  assert.equal(a.failedRuns.current, 0);
  assert.equal(a.state.stalled, false);

  // พังทุกรอบ: ตั้งได้ครบเพดานแล้วหยุด — ไม่มีคำขอเพิ่มอีกแม้แท็บเปิดทิ้งไว้ทั้งวัน
  const before = a.calls.length;
  for (let i = 0; i < poll.MAX; i += 1) await round(FAILS[i % FAILS.length]);
  assert.equal(a.calls.length, before + poll.MAX);
  assert.equal(poll.run(), null, 'ครบเพดาน — ไม่ตั้งตัวจับเวลาอีก');
  assert.equal(poll.run(), null);
  assert.equal(a.calls.length, before + poll.MAX);
  // 🐞 UAT: เลิกตรวจแล้ว **จอต้องรู้** — ธงขึ้นในรอบเดียวกับที่ตัวจับเวลาหยุด (ไม่ก่อน ไม่หลัง) ⇒ บล็อกเอกสารถอนคำสัญญา 15 วินาที
  assert.equal(a.state.stalled, true);
  assert.equal(a.state.stalledSets.lastIndexOf(false), a.state.stalledSets.indexOf(true) - 1, 'ธงขึ้นครั้งแรกตอนชนเพดานพอดี');
  assert.equal(a.state.stalledSets.filter((v) => v === true).length, 1);
  assert.equal(surveyJobView({ request: request({ surveyDocument: payload('sales', 'issuing') }), today: '2026-09-30', viewer: VIEWER.sales, refreshStalled: a.state.stalled })
    .document.badge.label, 'ไม่ทราบ');
  // หน้าอยู่ตามเดิม: ใบเดิม ไม่มีกล่องแดง ไม่อยู่สถานะกำลังโหลด
  assert.equal(a.state.req, issuing);
  assert.deepEqual(a.state.errors.filter(Boolean), []);
  assert.equal(a.state.loading, false);

  // รอบไหนได้ใบ (เธรดขยับ · ครบเวลารอไฟล์ · คนกดอะไรบนหน้า) = เดินต่อเอง
  const signal = a.load({ background: true });
  a.calls.at(-1).resolve(ok(issuing));
  await signal;
  assert.ok(poll.run(), 'อ่านใบได้แล้วยังกำลังออก — ตัวจับเวลากลับมา');
  assert.equal(a.state.stalled, false, 'ธงลงพร้อมตัวนับ — บล็อกกลับไปบอกว่ากำลังออกและตรวจให้เอง');
  // ออกจากสถานะกำลังออก = ไม่มีตัวจับเวลา
  await round((call) => call.resolve(ok({ id: 'r1', surveyDocument: { state: 'ready' } })));
  assert.equal(poll.run(), null);
});

test('🐞 เลิกตรวจซ้ำแล้วไม่ใช่ทางตัน: เน็ตกลับมา (`online`) = อ่านใบเบื้องหลังหนึ่งรอบ — เฉพาะตอนเลิกตรวจและยังกำลังออก', HANG_GUARD, async () => {
  const ONLINE_DEPS = '}, [refreshStalled, surveyDocumentState, load]);';
  const body = between(PAGE_CODE, 'if (!refreshStalled || surveyDocumentState !== "issuing") return undefined;', ONLINE_DEPS, 'ตัวฟัง online');
  const effect = new Function('refreshStalled', 'surveyDocumentState', 'load', 'window', body);
  /* หน้าต่างตัวแทน: จดตัวฟังที่ผูก/ถอด · `fire()` = ยิง event ให้ตัวฟังที่ยังผูกอยู่ */
  const makeWindow = () => {
    const listeners = [];
    const log = { added: [], removed: [] };
    return {
      log,
      fire: (type) => listeners.filter((l) => l.type === type).map((l) => l.fn()),
      addEventListener: (type, fn) => { listeners.push({ type, fn }); log.added.push(type); },
      removeEventListener: (type, fn) => {
        const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (at >= 0) listeners.splice(at, 1);
        log.removed.push(type);
      },
    };
  };

  // ยังตรวจอยู่ · หรือไม่ได้อยู่สถานะกำลังออก = ไม่ผูกอะไร (หัวข้ออื่นของคำร้องไม่มีคีย์นี้เลย)
  for (const [stalled, docState] of [[false, 'issuing'], [true, 'ready'], [true, undefined], [false, undefined]]) {
    const win = makeWindow();
    assert.equal(effect(stalled, docState, () => { throw new Error('ต้องไม่ถูกเรียก'); }, win), undefined);
    assert.deepEqual(win.log.added, []);
  }

  // เลิกตรวจแล้ว: ผูกตัวฟัง `online` ตัวเดียว · หนึ่ง event = อ่านใบเบื้องหลังหนึ่งรอบ · ถอดตัวฟังเมื่อ effect ถูกล้าง
  const a = makeLoad();
  const poll = makePoll(a);
  const issuing = { id: 'r1', surveyDocument: { state: 'issuing' } };
  const open = a.load();
  a.calls[0].resolve(ok(issuing));
  await open;
  for (let i = 0; i < poll.MAX; i += 1) {
    const run = poll.run().cb();
    a.calls.at(-1).reject(new Error('เชื่อมต่อไม่ได้ — ลองใหม่อีกครั้ง'));
    await run;
  }
  assert.equal(a.state.stalled, true);
  assert.equal(poll.run(), null);

  const win = makeWindow();
  const cleanup = effect(a.state.stalled, a.state.req.surveyDocument.state, a.load, win);
  assert.deepEqual(win.log.added, ['online']);
  const before = a.calls.length;
  // เน็ตกลับมาแต่ server ยังตอบไม่ได้: หนึ่งคำขอ ไม่มีการตั้งเวลาวน · จอยังบอกว่าไม่ทราบ
  const [failed] = win.fire('online');
  assert.equal(a.calls.length, before + 1);
  assert.deepEqual(a.calls.at(-1).init, { cache: 'no-store' });
  assert.equal(a.state.loading, false, 'อ่านเบื้องหลัง — หน้าไม่ขึ้นโครงรอ');
  a.calls.at(-1).resolve(refused('ระบบขัดข้องชั่วคราว'));
  await failed;
  assert.equal(a.state.stalled, true);
  assert.equal(poll.run(), null, 'ยังพัง = ยังไม่กลับไปวนยิง');
  assert.deepEqual(a.state.errors.filter(Boolean), [], 'ไม่มีกล่องแดง');
  // เน็ตกลับมาและอ่านใบได้: ธงลง ตัวจับเวลาเดินต่อเอง
  const [recovered] = win.fire('online');
  assert.equal(a.calls.length, before + 2);
  a.calls.at(-1).resolve(ok(issuing));
  await recovered;
  assert.equal(a.state.stalled, false);
  assert.ok(poll.run(), 'อ่านใบได้แล้วยังกำลังออก — ตัวจับเวลากลับมา');
  // effect ถูกล้าง (ธงลง / ออกจากหน้า) = ถอดตัวฟังตัวเดิม — event หลังจากนั้นไม่ยิงอะไร
  cleanup();
  assert.deepEqual(win.log.removed, ['online']);
  assert.deepEqual(win.fire('online'), []);
  assert.equal(a.calls.length, before + 2);

  // ซอร์ส: ไม่มีตัวจับเวลาในตัวฟัง (หนึ่ง event = หนึ่งคำขอ) · ประกาศก่อนทางออกก่อนเวลา (กฎของ hook)
  assert.doesNotMatch(body, /setTimeout|setInterval/);
  assert.match(body, /const retry = \(\) => load\(\{ background: true \}\);/);
  const at = PAGE_CODE.indexOf('if (!refreshStalled || surveyDocumentState !== "issuing") return undefined;');
  assert.ok(at > 0 && at < PAGE_CODE.indexOf('if (loading) return'));
});

test('เธรดเป็นสัญญาณ: แถวล่าสุดเปลี่ยนหลังรอบแรก = อ่านใบใหม่เบื้องหลัง — เฉพาะใบที่มีคีย์ surveyDocument', () => {
  const tag = between(PAGE_CODE, '<UpdateThread', '/>');
  assert.match(tag, /onItemsChange=\{onThreadItems\}/);
  assert.match(tag, /onPosted=\{load\}/, 'โพสต์ของคนดูเองยังโหลดปกติตามเดิม');

  const survey = makeThread({ id: 'r1', surveyDocument: { access: 'none', voids: null } });
  survey.fn(rows('u1', 'u2'));
  assert.deepEqual(survey.timers, [], 'รอบแรกแค่จำ — ใบเพิ่งโหลดมาพร้อมกัน');
  survey.fn(rows('u1', 'u2'));
  assert.deepEqual(survey.timers, [], 'เธรดไม่ขยับ = ไม่อ่านใบซ้ำ');
  survey.fn(rows('u1', 'u2', 'u3'));
  // เลื่อนไปหนึ่งจังหวะ — ไม่ยิงในจังหวะเดียวกับที่เธรดรายงาน (ดูเทสต์ "โพสต์ของคนดูเอง")
  assert.deepEqual(survey.loads, []);
  assert.deepEqual(survey.timers.map((timer) => timer.delay), [0]);
  survey.flush();
  assert.deepEqual(survey.loads, [{ background: true }]);
  survey.fn(rows('u1', 'u2', 'u3'));
  survey.flush();
  assert.equal(survey.loads.length, 1);
  // เธรดว่าง → มีแถวแรก ก็นับเป็นแถวใหม่ · ค่าที่ไม่ใช่ array ไม่พัง
  const empty = makeThread({ id: 'r1', surveyDocument: { access: 'none' } });
  empty.fn([]);
  empty.fn(undefined);
  assert.deepEqual(empty.timers, []);
  empty.fn(rows('u1'));
  empty.flush();
  assert.deepEqual(empty.loads, [{ background: true }]);

  // หัวข้ออื่น (ไม่มีคีย์) ไม่จ่ายค่าอ่านใบซ้ำ
  const other = makeThread({ id: 'r2' });
  other.fn(rows('a'));
  other.fn(rows('a', 'b'));
  assert.deepEqual(other.timers, []);

  // ตัวจำอยู่ที่เปลือก: เธรดถูกถอดแล้วต่อใหม่ **โดยไม่มีรอบปกติ** (สลับโหมดแก้ ↔ หน้าของหัวข้อ) ⇒ ตัวจำยังอยู่
  //   · แถวล่าสุดเดิม = ไม่อ่านซ้ำ · แถวที่มาระหว่างนั้น = ยังเป็นสัญญาณ · เปลี่ยนใบ = เริ่มจำใหม่
  const seen = { current: { entityId: 'r1', newest: 'u3' } };
  const same = makeThread({ id: 'r1', surveyDocument: {} }, { threadSeen: seen });
  same.fn(rows('u1', 'u2', 'u3'));
  assert.deepEqual(same.timers, []);
  const moved = makeThread({ id: 'r1', surveyDocument: {} }, { threadSeen: seen });
  moved.fn(rows('u1', 'u2', 'u3', 'u4'));
  moved.flush();
  assert.deepEqual(moved.loads, [{ background: true }]);
  const elsewhere = makeThread({ id: 'r9', surveyDocument: {} }, { threadSeen: seen });
  elsewhere.fn(rows('x1'));
  assert.deepEqual(elsewhere.timers, [], 'แถวล่าสุดของใบอื่นไม่ใช่ "แถวใหม่" ของใบนี้');
  assert.deepEqual(seen.current, { entityId: 'r9', newest: 'x1' });
});

test('🐞 เธรด · ปุ่มที่ผ่าน `call` (โหลดทั้งหน้า) อ่านใบรอบเดียว — เหตุการณ์ที่ปุ่มเขียนเองไม่ใช่ "แถวใหม่"', HANG_GUARD, async () => {
  const doc = { access: 'none', voids: null };
  const a = makeLoad();
  const open = a.load();
  a.calls[0].resolve(ok({ id: 'r1', status: 'submitted', surveyDocument: doc }));
  await open;
  // เธรดต่ออยู่ อ่านรอบแรก = จำ
  const mounted = makeThread(a.state.req, { threadSeen: a.threadSeen, load: a.load });
  mounted.fn(rows('u1', 'u2'));
  assert.deepEqual(mounted.timers, []);
  assert.deepEqual(a.threadSeen.current, { entityId: 'r1', newest: 'u2' });

  // กด "รับเรื่อง": `call` รอ `load()` รอบปกติ — หน้าขึ้นโครงรอ เธรดถูกถอด
  const reload = a.load();
  assert.equal(a.calls.length, 2);
  assert.equal(a.threadSeen.current, null, 'รอบปกติเริ่ม = ลืมแถวล่าสุดของเธรด');
  a.calls[1].resolve(ok({ id: 'r1', status: 'acknowledged', surveyDocument: doc }));
  await reload;
  // เธรดต่อกลับมา อ่านได้แถวล่าสุด = เหตุการณ์ "รับเรื่อง" ที่ปุ่มเพิ่งเขียนเอง
  const remounted = makeThread(a.state.req, { threadSeen: a.threadSeen, load: a.load });
  remounted.fn(rows('u1', 'u2', 'ev-ack'));
  assert.deepEqual(remounted.timers, [], 'รอบแรกหลังโหลดทั้งหน้า = จำอย่างเดียว');
  remounted.flush();
  assert.equal(a.calls.length, 2, 'หนึ่งปุ่ม = อ่านใบหนึ่งรอบ');
  assert.deepEqual(a.threadSeen.current, { entityId: 'r1', newest: 'ev-ack' });

  // แถวของคนอื่นที่เธรดดึงมาเองทีหลัง ยังเป็นสัญญาณตามเดิม — และรอบเบื้องหลังไม่ล้างตัวจำ
  remounted.fn(rows('u1', 'u2', 'ev-ack', 'u3'));
  const runs = remounted.flush();
  assert.equal(a.calls.length, 3);
  assert.deepEqual(a.threadSeen.current, { entityId: 'r1', newest: 'u3' });
  a.calls[2].resolve(ok({ id: 'r1', status: 'acknowledged', surveyDocument: doc }));
  await Promise.all(runs);
  remounted.fn(rows('u1', 'u2', 'ev-ack', 'u3'));
  assert.deepEqual(remounted.timers, [], 'เธรดไม่ขยับหลังรอบเบื้องหลัง = ไม่อ่านซ้ำ');

  // ปุ่มที่ถูกตีกลับ (`call` อ่านใบเบื้องหลังเอง ไม่ถอดเธรด) ไม่ล้างตัวจำเช่นกัน
  const quiet = a.load({ background: true });
  assert.deepEqual(a.threadSeen.current, { entityId: 'r1', newest: 'u3' });
  a.calls.at(-1).resolve(ok({ id: 'r1', status: 'acknowledged', surveyDocument: doc }));
  await quiet;
});

test('เธรด · โพสต์ของคนดูเอง = อ่านใบรอบเดียว — รอบเบื้องหลังที่เลื่อนไว้ถูกรอบปกติของ onPosted ตัดทิ้ง', HANG_GUARD, async () => {
  /* สมมุติฐานของการเลื่อน: เธรดรายงานแถว (`onItemsChange` · ใน `load` ของเธรด) **ก่อน** แล้วเรียก `onPosted` ต่อทันที
     โดยไม่มีจังหวะคั่น ⇒ ตัวจับเวลา 0 มิลลิวินาทีมาถึงหลังรอบปกติเริ่มเสมอ · ลำดับนี้เปลี่ยน = เทสต์นี้ต้องแดง */
  const THREAD = code(read('components/updates/UpdateThread.js'));
  const posted = (THREAD.match(/onPosted\?\.\(\);/g) || []).length;
  assert.ok(posted > 0);
  assert.equal((THREAD.match(/await load\(\);\s*onPosted\?\.\(\);/g) || []).length, posted, 'ทุกทางที่เรียก onPosted ดึงเธรดก่อน');

  const doc = { access: 'none', voids: null };
  const a = makeLoad();
  const open = a.load();
  a.calls[0].resolve(ok({ id: 'r1', surveyDocument: doc }));
  await open;
  const thread = makeThread(a.state.req, { threadSeen: a.threadSeen, load: a.load });
  thread.fn(rows('u1'));

  // โพสต์: เธรดดึงของใหม่ (แถวล่าสุด = ข้อความของคนดูเอง) → ตั้งคิวอ่านใบ → `onPosted={load}` เริ่มรอบปกติในจังหวะเดียวกัน
  thread.fn(rows('u1', 'mine'));
  assert.equal(a.calls.length, 1, 'ยังไม่ยิงในจังหวะที่เธรดรายงาน');
  const reload = a.load();
  assert.equal(a.calls.length, 2);
  thread.flush();
  assert.equal(a.calls.length, 2, 'รอบเบื้องหลังที่เลื่อนไว้ไม่ยิงซ้อนกับรอบปกติ');
  a.calls[1].resolve(ok({ id: 'r1', surveyDocument: doc, n: 2 }));
  await reload;
  assert.equal(a.state.req.n, 2);
  assert.equal(a.state.settled, 2);
  // เธรดต่อกลับมาหลังรอบปกติ = จำอย่างเดียว
  const remounted = makeThread(a.state.req, { threadSeen: a.threadSeen, load: a.load });
  remounted.fn(rows('u1', 'mine'));
  remounted.flush();
  assert.equal(a.calls.length, 2);
});

test('เปลือกส่ง onRefresh ให้หน้าของหัวข้อ · โมดัล "ยังไม่จบ" บอกผลต่อเอกสาร · ไม่เทียบชื่อหัวข้อ · ไม่ประกอบที่อยู่เอกสารเอง', () => {
  assert.match(PAGE_CODE, /const refreshQuietly = useCallback\(\(\) => load\(\{ background: true \}\), \[load\]\);/);
  const kindView = between(PAGE_CODE, '<KindView', '/>');
  assert.match(kindView, /onRefresh=\{refreshQuietly\}/);
  assert.match(kindView, /viewer=\{kindViewer\}/);
  // ธง "เลิกตรวจซ้ำแล้ว" ไปถึงหน้าของหัวข้อ → `surveyJobView` → บล็อกเอกสาร (จอไม่ตัดสินเอง)
  assert.match(kindView, /refreshStalled=\{refreshStalled\}/);
  assert.match(VIEW_CODE, /surveyJobView\(\{ request, today, viewer, people, peopleLoading, refreshStalled \}\)/);
  assert.match(VIEW_CODE, /\[request, today, viewer, people, peopleLoading, refreshStalled\],/, 'ธงเปลี่ยน = คิดบล็อกใหม่');
  // ธงสามตัวที่ `surveyJobView` ส่งต่อให้บล็อกเอกสาร ต้องยังอยู่บน `kindViewer`
  const viewer = between(PAGE_CODE, 'const kindViewer = {', '};');
  for (const key of ['canDecide:', 'canWork:', 'isRequesterSide: !!req._mine']) assert.ok(viewer.includes(key), key);

  assert.match(PAGE, /import \{ surveyReopenDocumentLine \} from "@\/lib\/service\/surveyDocumentView";/);
  assert.ok(PAGE_CODE.includes('surveyReopenDocumentLine(req?.surveyDocument, req)'));
  const modal = between(PAGE_CODE, 'title="ยังไม่จบ — เปิดเรื่องกลับมา"', '</Modal>', 'โมดัลยังไม่จบ');
  const line = modal.indexOf('{reopenDocumentLine ? <StatusNotice tone="warning">{reopenDocumentLine}</StatusNotice> : null}');
  assert.ok(line > 0, 'บรรทัดเอกสารต้องอยู่ในโมดัล โทนเตือน');
  assert.ok(line > modal.indexOf('ตราปิดที่กดไปแล้วจะถูกถอน'), 'อยู่หลังคำอธิบาย');
  assert.ok(line < modal.indexOf('action-bar'), 'อยู่เหนือแถวปุ่ม — อ่านก่อนกด');

  assert.ok(!/req\.kind === ["']/.test(PAGE), 'เปลือกอ่านคีย์ surveyDocument อย่างเดียว ไม่เทียบชื่อหัวข้อ (ม-34)');
  for (const [name, src] of [['page.js', PAGE_CODE], ['SurveyRequestView.js', VIEW_CODE]]) {
    assert.doesNotMatch(src, /\/document\?/, `${name}: ที่อยู่ของเอกสารประกอบที่ lib ที่เดียว`);
    assert.doesNotMatch(src, /version=(customer|internal)/, name);
    // จอห้ามลากไฟล์ฝั่ง server ของเอกสารเข้า bundle (ตัวแรกลาก node:crypto)
    assert.doesNotMatch(src, /surveyReport(State|Rows|Inputs|Issue|Paper)/, name);
  }
});

/* ══ ③ บล็อกบนหน้าของหัวข้อ (§5.1) ═════════════════════════════════════════════════════ */

test('view: แถบตัวเลขเหลือห้าช่อง · บล็อกอยู่ถัดจากแถบ ไม่อยู่ในเงื่อนไข "ส่งผลแล้ว" · รับ onRefresh', () => {
  assert.ok(!VIEW.includes('value="ยังไม่ออก"'));
  const strip = between(VIEW_CODE, '<MetricStrip', '</MetricStrip>');
  assert.equal((strip.match(/<Metric /g) || []).length, 5);
  const use = '{job.document ? <DocumentBlock doc={job.document} sheetHref={surveyHref} onRefresh={onRefresh} /> : null}';
  const at = VIEW_CODE.indexOf(use);
  assert.ok(at > 0, 'บล็อกวาดจาก job.document');
  const stripExpr = VIEW_CODE.search(/\{zones\.sent \? \(\s*<MetricStrip/);
  const stripEnd = VIEW_CODE.indexOf(') : null}', VIEW_CODE.indexOf('</MetricStrip>'));
  assert.ok(stripExpr > 0 && stripEnd > stripExpr);
  assert.ok(at > stripEnd, 'อยู่นอกนิพจน์ zones.sent — ใบที่ถูกดึงผลกลับยังได้บล็อก');
  assert.ok(at < VIEW_CODE.indexOf('{site ? ('), 'อยู่เหนือแถบไซต์ — ถัดจากแถบตัวเลขทันที');
  // (`{}` = คอมเมนต์ JSX ที่ถูกตัดเนื้อออกแล้ว)
  assert.equal(VIEW_CODE.slice(stripEnd + ') : null}'.length, at).replace(/\{\}/g, '').trim(), '',
    'ไม่มีอะไรคั่นระหว่างแถบตัวเลขกับบล็อก');
  assert.match(VIEW_CODE, /attachments = null, onRefresh, refreshStalled = false,\s*\}\) \{/);
  // ลิงก์ของหัวหน้าใช้ที่อยู่เดียวกับปุ่ม "เปิดใบประเมิน" ของแถบตอนนี้
  assert.match(VIEW_CODE, /const surveyHref = viewer\.canWork \? `\/service\/surveys\/\$\{request\.id\}` : null;/);
});

const BLOCK = between(VIEW_CODE, 'function DocumentBlock({ doc, sheetHref, onRefresh }) {', '\nexport default function SurveyRequestView', 'DocumentBlock');

test('view: บล็อกวาดอย่างเดียว — ปุ่มเป็น ActionControl ชนิดดาวน์โหลด ไม่มี href · ไม่ตัดสินสถานะ/สิทธิ์เอง · ไม่ยิง API', () => {
  // โครงเดียวกับแถบไซต์ + คอลัมน์ปุ่ม (ปุ่มเต็มกว้าง 44px ที่จอแคบมาจากกฎของ `.manageActions > .bandAction`)
  assert.match(BLOCK, /<section className=\{styles\.siteStrip\} aria-label="เอกสารประเมินพื้นที่">/);
  assert.match(BLOCK, /<div className=\{styles\.manageActions\}>/);
  const control = between(BLOCK, '<ActionControl', '/>');
  assert.match(control, /key=\{button\.id\}/);
  assert.match(control, /action=\{\{ id: button\.id, kind: "download", label: button\.label, onClick: \(\) => open\(button\) \}\}/);
  assert.match(control, /blocker=\{button\.blocked \|\| waitTextOf\(button\) \|\| ""\}/);
  assert.match(control, /blockerKind=\{blockerKindOf\(button\)\}/);
  assert.match(control, /className=\{styles\.bandAction\}/);
  assert.doesNotMatch(control, /href/, 'ไม่ส่ง href — ปุ่มเป็น <button> เสมอ และบอกเหตุเมื่อกดตอนติดด่าน');
  // ป้ายที่อยู่กับจอ (lib ส่งค่าล้วน)
  for (const label of ['ออกเมื่อ', 'ออกโดย', 'เปิดใบประเมิน']) assert.ok(BLOCK.includes(label), label);
  assert.match(BLOCK, /\{doc\.docNo \? <b className="mono">\{doc\.docNo\}<\/b> : null\}/);
  assert.match(BLOCK, /<StatusBadge size="sm" tone=\{doc\.badge\.tone\} label=\{doc\.badge\.label\} \/>/);
  assert.match(BLOCK, /\{doc\.text \? <StatusNotice tone=\{doc\.text\.tone\}>\{doc\.text\.text\}<\/StatusNotice> : null\}/);
  assert.match(BLOCK, /\{doc\.foot \? <small className=\{styles\.factNote\}>\{doc\.foot\}<\/small> : null\}/);
  assert.match(BLOCK, /const sheetLink = doc\.sheetLink && sheetHref;/);
  // 🔴 บล็อกไม่มีกติกาของตัวเอง: ไม่อ่านธงสิทธิ์ ไม่เทียบสถานะ ไม่รู้จักคนดู ไม่มีที่อยู่ API ไม่มีคำว่า "ออกเอกสาร"
  assert.doesNotMatch(BLOCK, /\.access\b|doc\.state|viewer\b|canDecide|isRequesterSide|\/api\//);
  assert.doesNotMatch(VIEW_CODE, /ออกเอกสาร/, 'คำนี้บนหน้าคำร้องหมายถึงกระดาษ PDR — บล็อกเอกสารประเมินมีแต่ดาวน์โหลด');
  assert.doesNotMatch(VIEW_CODE, /\bfetch\(|apiFetch|apiJson/);
  // ไม่มี style ฝังในบรรทัด (audit:ui) — ใช้คลาสที่มีอยู่ของ surveyRequest.module.css
  assert.doesNotMatch(BLOCK, /style=\{/);
});

test('view: ลิงก์ "เปิดใบประเมิน" วาดจากธง `sheetLink` ของ lib อย่างเดียว — ทุกสถานะ ไม่ผูกกับ "ยังไม่มีเอกสาร"', () => {
  /* หัวหน้าที่เอกสารออกเลขแล้วแต่ไฟล์ยังไม่ถูกจัดทำ ต้องไปดูเหตุ/กดซ้ำที่ใบประเมิน ⇒ lib ยกธงนี้ได้ในสถานะไหนก็ได้
     บล็อกต้องไม่มีเงื่อนไขของตัวเองมากั้น (ไม่ดูสถานะ ไม่ดูว่ามีปุ่ม/ประโยค/วันที่ออกหรือไม่) */
  assert.match(BLOCK, /const sheetLink = doc\.sheetLink && sheetHref;/);
  // ธงเดียวก็พอให้คอลัมน์ปุ่มถูกวาด (บล็อกที่ไม่มีปุ่มดาวน์โหลดเลยก็ยังได้ลิงก์)
  assert.match(BLOCK, /const hasActions = doc\.buttons\.length > 0 \|\| !!sheetLink \|\| !!doc\.foot;/);
  const column = between(BLOCK, '<div className={styles.manageActions}>', '{doc.foot ?', 'คอลัมน์ปุ่มของบล็อก');
  // เงื่อนไขในคอลัมน์มีสองตัว: บรรทัดรอ กับลิงก์ — ลิงก์เป็นพี่น้องของปุ่ม ไม่ซ้อนในเงื่อนไขอื่น
  assert.deepEqual(column.match(/\{[\w.]+ \? /g), ['{waitShown ? ', '{sheetLink ? ']);
  const link = between(column, '{sheetLink ? (', ') : null}', 'ลิงก์ไปใบประเมิน');
  assert.match(link, /<Button as=\{Link\} href=\{sheetHref\} variant="outline"/);
  assert.ok(link.includes('เปิดใบประเมิน'));
  assert.doesNotMatch(BLOCK, /doc\.state|doc\.text\.tone ===|doc\.badge\.label ===/);
});

/* ตัวกดของปุ่มดาวน์โหลด ตัดจากซอร์สมารันกับตัวแทนของ window/state/ref/นาฬิกา */
function makeOpen() {
  const body = between(BLOCK, 'const open = (button) => {', '\n  };\n', 'ตัวกดของปุ่มดาวน์โหลด');
  const ms = Number(/const DOC_WAIT_MS = ([\d_]+);/.exec(VIEW_CODE)?.[1].replaceAll('_', ''));
  const log = { opened: [], waiting: [], timers: [], cleared: [], refreshed: 0 };
  const timer = { current: null };
  const refresh = { current: () => { log.refreshed += 1; } };
  let nextId = 1;
  const open = new Function(
    'window', 'setWaiting', 'timer', 'refresh', 'setTimeout', 'clearTimeout', 'DOC_WAIT_MS',
    `${body}\n  };\nreturn open;`,
  )(
    { open: (...args) => { log.opened.push(args); return null; } },
    (v) => log.waiting.push(v),
    timer, refresh,
    (fn, delay) => { const id = nextId; nextId += 1; log.timers.push({ id, fn, delay }); return id; },
    (id) => { if (id != null) log.cleared.push(id); },
    ms,
  );
  return { open, log, timer, refresh, ms };
}

test('⭐ view: กดปุ่มที่ไฟล์ยังไม่ถูกจัดทำ = เปิดแท็บใหม่ แล้วรอ 15 วินาที → ขอให้เปลือกอ่านใบใหม่เบื้องหลัง', () => {
  const HREF = '/api/service/surveys/r1/document?version=customer&download=1';
  const a = makeOpen();
  assert.equal(a.ms, 15000);

  // ไฟล์พร้อม: เปิดแท็บใหม่อย่างเดียว ไม่มีการรอ
  a.open({ id: 'customer', href: HREF, ready: true, blocked: null });
  assert.deepEqual(a.log.opened, [[HREF, '_blank', 'noopener,noreferrer']]);
  assert.deepEqual(a.log.waiting, []);
  assert.deepEqual(a.log.timers, []);

  // ไฟล์ยังไม่พร้อม: เปิดแท็บ (การเปิดครั้งนี้คือคนจัดทำไฟล์) + เริ่มรอ
  a.open({ id: 'customer', href: HREF, ready: false, blocked: null });
  assert.equal(a.log.opened.length, 2);
  assert.deepEqual(a.log.waiting, [true]);
  assert.equal(a.log.timers.length, 1);
  assert.equal(a.log.timers[0].delay, 15000);
  assert.equal(a.timer.current, a.log.timers[0].id);
  assert.equal(a.log.refreshed, 0, 'ยังไม่ครบเวลา ยังไม่ขออ่านใบ');

  // ครบเวลา: เลิกรอ แล้วขออ่านใบใหม่หนึ่งครั้ง (ผ่าน `onRefresh` ตัวล่าสุด)
  let latest = 0;
  a.refresh.current = () => { latest += 1; };
  a.log.timers[0].fn();
  assert.deepEqual(a.log.waiting, [true, false]);
  assert.equal(latest, 1);
  assert.equal(a.timer.current, null);

  // ปุ่มที่ติดเหตุ (ไม่มีที่อยู่ไฟล์) ไม่เปิดอะไร ไม่เริ่มรอ
  const b = makeOpen();
  b.open({ id: 'customer', href: null, ready: false, blocked: 'ยังไม่มีเอกสารของใบนี้' });
  assert.deepEqual(b.log.opened, []);
  assert.deepEqual(b.log.waiting, []);
  // เปลือกไม่ได้ส่ง `onRefresh` มา (หน้าอื่นเอา view ไปใช้) = ครบเวลาแล้วไม่พัง
  const c = makeOpen();
  c.refresh.current = undefined;
  c.open({ id: 'customer', href: HREF, ready: false, blocked: null });
  assert.doesNotThrow(() => c.log.timers[0].fn());
});

test('view: ระหว่างล็อก ปุ่มของไฟล์ที่ยังไม่พร้อมทุกปุ่มติดเหตุของการรอ (ประโยคจาก lib) · เหตุของปุ่มเองมาก่อน · ออกจากหน้า = เลิกรอ', () => {
  // 🐞 UAT R02: ประโยคของบรรทัดรอย้ายไปอยู่ที่ lib (`doc.waitText`) คู่กับกล่องแจ้ง "เปิดครั้งแรกรอ…" — จอไม่มีประโยคของตัวเอง
  //    ⇒ ไม่มีทางที่สองประโยคในบล็อกเดียวจะบอกเวลารอคนละตัวเลขอีก (ล็อกตัวเลขที่ surveyDocumentView.test.mjs)
  assert.doesNotMatch(VIEW_CODE, /DOC_WAIT_TEXT|กำลังจัดทำไฟล์|วินาที/, 'จอไม่ถือประโยคเรื่องเวลารอ');
  // เหตุของการรอขึ้นเฉพาะปุ่มที่ไฟล์ยังไม่พร้อม — ไฟล์ที่จัดทำแล้วยังกดได้ระหว่างรอ
  const waitTextOf = new Function('waiting', 'doc',
    `${between(BLOCK, 'const waitTextOf = ', ';')};\nreturn waitTextOf;`);
  const TEXT = blockOf(payload('sales', 'issued', { current: current({ customer: false, internal: false }) }), VIEWER.sales).waitText;
  assert.equal(TEXT, 'ไฟล์กำลังเปิดในแท็บใหม่ — รอประมาณ 10 วินาที · กดอีกครั้งเฉพาะเมื่อไฟล์ไม่ขึ้น');
  assert.equal(waitTextOf(true, { waitText: TEXT })({ ready: false }), TEXT);
  assert.equal(waitTextOf(true, { waitText: TEXT })({ ready: true }), '');
  assert.equal(waitTextOf(false, { waitText: TEXT })({ ready: false }), '');
  // ใบที่อ่านใหม่กลางการรอแล้วไม่มีอะไรให้รอ (`waitText: null`) = ไม่มีเหตุค้าง ไม่พิมพ์ "null"
  assert.equal(waitTextOf(true, { waitText: null })({ ready: false }), '');
  // บรรทัดรอพิมพ์ให้อ่านด้วย (ไม่ใช่แค่บอกตอนกด) และประกาศกับโปรแกรมอ่านจอ
  assert.match(BLOCK, /\{waitShown \? <p className=\{styles\.wait\} role="status">\{doc\.waitText\}<\/p> : null\}/);
  assert.match(BLOCK, /const waitShown = doc\.buttons\.some\(\(button\) => !button\.blocked && waitTextOf\(button\)\);/);
  // การรอเป็น state ของ component + ตัวจับเวลาหนึ่งตัว · ถอด component = ล้างตัวจับเวลา
  assert.match(BLOCK, /const \[waiting, setWaiting\] = useState\(false\);/);
  assert.match(BLOCK, /useEffect\(\(\) => \(\) => \{ clearTimeout\(timer\.current\); timer\.current = null; \}, \[\]\);/);
  assert.match(BLOCK, /useEffect\(\(\) => \{ refresh\.current = onRefresh; \}, \[onRefresh\]\);/);
});

test('🐞 UAT R03 · เหตุของปุ่มที่ติดด่านบอกด้วยโทนของกล่องแจ้งในบล็อก — ไม่ใช่ toast แดง "ผิดพลาด" ทุกกรณี', () => {
  /* กดปุ่มดาวน์โหลดที่ติดด่านแล้วได้ toast แดงพร้อมไอคอนผิดพลาด ของประโยคเดียวกับที่พิมพ์เป็นกล่องฟ้าอยู่ในบล็อก ("ยังไม่มีเอกสาร…" ·
     "กำลังออกเอกสาร…" · บรรทัดรอไฟล์) — ไม่มีอะไรพัง ⇒ toast ใช้โทนเดียวกับกล่องที่พิมพ์เหตุนั้น */
  const kinds = new Function(`${between(VIEW_CODE, 'const NOTICE_TOAST_KIND = ', ';')};\nreturn NOTICE_TOAST_KIND;`)();
  assert.deepEqual(kinds, { info: 'info', warning: 'warning', danger: 'error' });
  const blockerKindOf = (doc) => new Function('doc', 'NOTICE_TOAST_KIND',
    `${between(BLOCK, 'const blockerKindOf = ', ';')};\nreturn blockerKindOf;`)(doc, kinds);
  /* บล็อกจริงของแต่ละสถานะ → ชนิด toast ของปุ่มแรก */
  const kindIn = (doc) => blockerKindOf(doc)(doc.buttons[0]);
  const missing = blockOf(payload('sales', 'missing'), VIEWER.sales);
  const issuing = blockOf(payload('sales', 'issuing'), VIEWER.sales);
  const recalled = surveyJobView({
    request: request({ status: 'acknowledged', answeredAt: null, answeredByName: null, surveyDocument: payload('sales', 'recalled') }),
    today: '2026-09-30', viewer: VIEWER.sales,
  }).document;
  const stale = blockOf(payload('sales', 'stale', { current: current() }), VIEWER.sales);
  const off = blockOf(payload('sales', 'issued', { storeAllowed: false, current: current({ customer: false, internal: false }) }), VIEWER.sales);
  assert.deepEqual([missing, issuing, recalled, stale, off].map(kindIn), ['info', 'info', 'warning', 'error', 'warning']);
  // ทุกสถานะที่ปุ่มติดเหตุ: เหตุของปุ่ม = ประโยคของกล่องแจ้ง (สัญญาของ lib ที่ทำให้ "โทนของกล่อง" เป็นโทนของเหตุได้)
  for (const doc of [missing, issuing, recalled, stale, off]) {
    assert.ok(doc.buttons.length > 0);
    for (const button of doc.buttons) assert.equal(button.blocked, doc.text.text);
  }
  // ระหว่างรอไฟล์ (ปุ่มไม่มีเหตุของตัวเอง): เหตุคือบรรทัดรอ = ข้อมูล
  const waitingDoc = blockOf(payload('sales', 'issued', { current: current({ customer: false, internal: false }) }), VIEWER.sales);
  assert.equal(waitingDoc.buttons[0].blocked, null);
  assert.equal(kindIn(waitingDoc), 'info');
  // โทนที่ไม่รู้จัก / ไม่มีกล่องแจ้ง = ไม่ส่งชนิด ⇒ ปุ่มกลางใช้ค่าตั้งต้นของมัน
  assert.equal(blockerKindOf({ text: null })({ blocked: 'เหตุ' }), undefined);
  assert.equal(blockerKindOf({ text: { tone: 'neutral' } })({ blocked: 'เหตุ' }), undefined);

  // สายส่ง: บล็อก → ActionControl → GatedAction · ปุ่มอื่นของหน้า (แถบตอนนี้ · หัวใบ) ไม่ส่งชนิด = ของเดิม
  assert.match(VIEW_CODE, /function ActionControl\(\{ action, busy, tone, variant = "outline", className = "", blocker = "", blockerKind \}\) \{/);
  assert.match(between(VIEW_CODE, '<GatedAction', '>'), /blockerKind=\{blockerKind\}/);
  assert.equal((VIEW_CODE.match(/blockerKind=\{/g) || []).length, 2, 'ส่งชนิดสองจุดเท่านั้น: ActionControl → GatedAction และบล็อกเอกสาร → ActionControl');

  // ปุ่มกลาง (`GatedAction`): ค่าตั้งต้นยังเป็น error ทุกผู้เรียกเดิม · ชนิดที่ไม่รู้จักตกไป error (ไม่เงียบ)
  assert.match(GATED_CODE, /blockerKind = "error",/);
  const act = between(GATED_CODE, 'if (blocker) {', 'return;', 'ทางติดด่านของ GatedAction');
  assert.match(act, /\(notifyToast\[blockerKind\] \|\| notifyToast\.error\)\(blocker\);/);
  assert.equal((GATED_CODE.match(/notifyToast/g) || []).length, 3, 'import + ตัวเลือก + ทางสำรอง — ไม่มี toast ทางอื่น');
  const fired = [];
  const toast = Object.assign(() => {}, {
    error: (m) => fired.push(['error', m]), warning: (m) => fired.push(['warning', m]), info: (m) => fired.push(['info', m]),
  });
  const fire = (blockerKind) => new Function('notifyToast', 'blockerKind', 'blocker', 'event',
    `${act.replace('if (blocker) {', '')}`)(toast, blockerKind, 'เหตุ', null);
  for (const kind of ['error', 'info', 'warning', 'ไม่รู้จัก', undefined]) fire(kind);
  assert.deepEqual(fired.map(([kind]) => kind), ['error', 'info', 'warning', 'error', 'error']);
});

test('🐞 UAT R03 (จอแคบ) · ช่องกลางที่ว่างของบล็อกไม่กินแถวเมื่อเหลือคอลัมน์เดียว — จอกว้างยังวาดไว้ให้ปุ่มอยู่คอลัมน์ขวา', () => {
  // จอกว้าง: ช่องกลางถูกวาดแม้ว่าง (ปุ่มไม่ขยับคอลัมน์ตอนเอกสารออก) — เงื่อนไขเดิม ไม่ถูกถอด
  assert.match(BLOCK, /\{issued \|\| hasActions \? \(\s*<div>\s*\{issued \? \(/);
  // ช่องนั้นว่างจริงเมื่อไม่มีฉบับที่ใช้อยู่: ลูกตัวเดียวคือ `{issued ? … : null}` (ไม่มีข้อความ/ช่องว่างค้าง ⇒ `:empty` จับได้)
  const middle = between(BLOCK, '{issued || hasActions ? (', ') : null}\n      {}', 'ช่องกลางของบล็อก');
  assert.match(middle.replace(/\s+/g, ' '), /^\{issued \|\| hasActions \? \( <div> \{issued \? \( <> .* <\/> \) : null\} <\/div> $/);
  // กฎอยู่ในช่วงจอ ≤900px ที่แถบเหลือคอลัมน์เดียว — ไม่อยู่นอก media (จอกว้างต้องยังมีช่องค้ำ)
  const narrow = between(VIEW_CSS, '@media (max-width: 900px) {', '@media (max-width: 680px)', 'ช่วงจอ ≤900px');
  assert.match(narrow, /\.gates,\s*\.siteStrip \{\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/);
  assert.match(narrow, /\.siteStrip > :empty \{\s*display: none;\s*\}/);
  assert.equal((VIEW_CSS.match(/\.siteStrip[^{}]*:empty/g) || []).length, 1, 'กฎซ่อนช่องว่างของแถบมีที่เดียว และอยู่ในช่วงจอแคบ');
});

test('🐞 UAT 360px · ป้ายของแถวอ้างอิงบนหัวใบ ("ลูกค้า" · "ดีล" · "โครงการ") ไม่หด ไม่ขึ้นบรรทัดกลางคำ', () => {
  const rule = between(VIEW_CSS, '.refLabel {', '}', 'กฎของป้ายแถวอ้างอิง');
  assert.match(rule, /flex: none;/);
  assert.match(rule, /white-space: nowrap;/);
  // ป้ายเป็น <span> ของตัวเองในแถว flex — ของที่ขึ้นบรรทัดใหม่คือลิงก์/ค่าข้าง ๆ
  assert.match(VIEW_CODE, /<span className=\{styles\.refLabel\}>\{ref\.label\}<\/span>/);
  const row = between(VIEW_CSS, '.ref {', '}', 'กฎของแถวอ้างอิง');
  assert.match(row, /min-width: 0;/);
  assert.match(row, /overflow-wrap: anywhere;/);
});
