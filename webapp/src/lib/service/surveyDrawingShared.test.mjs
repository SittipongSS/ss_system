// ── ประเมินจากแบบ งวด S2b · ชิ้นส่วนกลาง (§2.5) — ของที่จอห้ากลุ่มอ่านจาก view-model ──────────────────────────
//
// ⭐ ไฟล์นี้ล็อกคีย์และค่าคงที่ที่งวด S2b เพิ่มให้ view-model ของงวด S2a:
//   ค่าคงที่ (ชิปคิว · บรรทัดที่มา · ประโยคปุ่มขอยืนยันที่ยังไม่มี · ประโยคเพิ่มพื้นที่) · แผงแบบจากฝ่ายขาย (`editable` · `ref` · ชนิด · รายละเอียด)
//   · มาตรวัดของงานโต๊ะ · หัวงาน (ข้อ "วิธีประเมิน") · แถวรวมรูป · สรุปของจอรายละเอียดรุ่นเก่า · บรรทัดที่มาบนคิว ·
//   ปุ่มวันส่งผลของงานโต๊ะ · บรรทัดรวมท้ายแถบแท็บ · บล็อกเอกสาร (งวด S3: เท่าใบลงหน้างาน) · พื้นที่ที่เปิดเองของผู้วางคิว
// 🔴 ทุกข้อมีคู่ "ใบลงหน้างานล้วน = ค่าว่าง / ผลเดิม" — ใบที่ไม่มีพื้นที่จากแบบต้องได้จอเดิมทุกจุด
//    (ลายนิ้วมือของผลเดิมทั้งก้อนอยู่ที่ `surveyMethodGolden.test.mjs`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_CONFIRM_ACTION_READY, SURVEY_CONFIRM_PENDING_NOTE, SURVEY_DESK_ADD_HEAD_ONLY, SURVEY_METHOD_BACK_ORIGIN,
  SURVEY_QUEUE_DESK_CHIP,
} from './surveyMethodSwitch.js';
import {
  SALES_REUSE_BLOCKED, surveyDefaultZoneId, surveyDrawingZoneView, surveyJobHeaderView, surveySalesDrawingsView, surveySheetTotalsText,
} from './surveyFieldView.js';
import { surveyControlView } from './surveyControl.js';
import { surveyJobView, surveyRequestDrawingSummary } from './surveyJob.js';
import { surveyRequestDocumentView } from './surveyDocumentView.js';
import { surveySendConfirm } from './surveySendClose.js';
import { surveyQueueMethodBack } from './surveyQueueRepo.js';
import { commitDueLabels, deskDueAction } from '../requests/commitDue.js';
import { requestAwaitingDue } from '../requests/statuses.js';

const TODAY = '2026-10-09';
const DRAWING = { method: 'drawing' };
const HEAD = { canDecide: true, canWork: true };
const SALES = { isOpener: true, isRequesterSide: true };

const zones = (over = {}) => ([
  { id: 'z1', zoneName: 'Lobby ชั้น 1', zoneFloor: '01', status: 'ok', parts: [{ id: 'p', widthM: 8, lengthM: 6, heightM: 3 }], spots: [], ...over },
  { id: 'z2', zoneName: 'ห้องประชุม ชั้น 2', zoneFloor: '02', status: 'ok', parts: [{ id: 'p', widthM: 6, lengthM: 5, heightM: 2.8 }], spots: [], ...over },
  { id: 'z3', zoneName: 'ห้อง Spa ชั้น 3', zoneFloor: '03', status: 'ok', parts: [], spots: [], ...over },
]);
const mixedZones = () => zones().map((z, i) => (i === 2 ? { ...z, ...DRAWING } : z));
const file = (id, docType, mimeType = 'image/jpeg', fileName = `${id}.jpg`) => ({ id, docType, mimeType, fileName });
const ask = (over = {}) => ({
  id: 'r1', kind: 'site_survey', dept: 'TS', requesterDept: 'SA', status: 'acknowledged', docNo: 'RQ-AS-26100312',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-08T07:50:00Z',
  acknowledgedAt: '2026-10-08T08:12:00Z', acknowledgedByName: 'Arnon Aunsapwilai',
  assigneeId: 'u-head', assigneeName: 'Arnon Aunsapwilai',
  requestedDueDate: '2026-10-13', requestedResultDate: '2026-10-15', committedDueDate: null, committedResultDate: null,
  surveyVisit: null, surveyZones: zones(DRAWING), surveyFilesByZone: {},
  ...over,
});
const PROMISED = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' };
const SENT = { ...PROMISED, status: 'answered', answeredAt: '2026-10-14T03:00:00Z', answeredByName: 'Arnon Aunsapwilai' };

/* ══ ค่าคงที่ (§2.5 f · k · n) ═══════════════════════════════════════════════════════════════ */

test('ค่าคงที่ของงวด S2b ตรงตัวตามแผน — ชิปคิว · บรรทัดที่มา · ประโยคปุ่มที่ยังไม่มี · ประโยคเพิ่มพื้นที่ของใบงานโต๊ะ', () => {
  assert.equal(SURVEY_QUEUE_DESK_CHIP, 'จากแบบ · ไม่ต้องลงคิว');
  assert.equal(SURVEY_METHOD_BACK_ORIGIN('ลูกค้าขอให้เข้าวัดจริง'), 'หัวหน้าเปลี่ยนเป็นลงหน้างาน: ลูกค้าขอให้เข้าวัดจริง');
  /* งวด S5 (Integrate §4.6 ข้อ 1): สวิตช์เปิดแล้ว — ค่าคงที่ของประโยคยังอยู่ (ย้อนกลับได้คำเดียว · ถอดทิ้งงวดหลัง §1.3) */
  assert.equal(SURVEY_CONFIRM_ACTION_READY, true, 'ปุ่มขอยืนยันหน้างานเปิดใช้ตั้งแต่งวด S5');
  assert.equal(SURVEY_CONFIRM_PENDING_NOTE,
    'ปุ่ม “ขอยืนยันหน้างาน” ของฝ่ายขายจะเปิดใช้ในรอบถัดไป — ระหว่างนี้ฝ่ายขายเปิดคำร้องประเมินพื้นที่แบบลงหน้างานของพื้นที่เดิมได้');
  assert.equal(SURVEY_DESK_ADD_HEAD_ONLY, 'ใบนี้หัวหน้าประเมินจากแบบ — เพิ่มพื้นที่ได้เฉพาะหัวหน้าฝ่ายบริการ');
  assert.equal(SALES_REUSE_BLOCKED, 'ไฟล์นี้ลงเอกสารไม่ได้ — แคปหน้าที่ต้องการเป็น PNG แล้วแนบ');
  // เส้นเพิ่มพื้นที่ใช้ค่าคงที่ตัวเดียวกัน ไม่พิมพ์ประโยคเอง
  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/zones/route.js', import.meta.url), 'utf8');
  assert.match(route, /import \{ SURVEY_DESK_ADD_HEAD_ONLY \} from '@\/lib\/service\/surveyMethodSwitch';/);
  assert.match(route, /const DESK_ADD_HEAD_ONLY = SURVEY_DESK_ADD_HEAD_ONLY;/);
  assert.equal(route.includes("'ใบนี้หัวหน้าประเมินจากแบบ"), false);
});

test('สวิตช์เดียวของปุ่มขอยืนยันหน้างาน: แถบแจ้งของฝ่ายขายกับไทล์ของหัวหน้าได้ประโยคเดียวกัน และ action.ready ตามค่าคงที่', () => {
  const banner = surveyJobView({ request: ask({ ...SENT, surveyConfirm: 'needed' }), today: TODAY, viewer: SALES }).zones.drawingBanner;
  // งวด S5 เปิดสวิตช์ ⇒ ประโยค "ปุ่มจะเปิดใช้ในรอบถัดไป" หายจากแถบแจ้ง · `ready` ยังเท่าค่าคงที่
  assert.equal(banner.note, null);
  assert.equal(banner.action.ready, SURVEY_CONFIRM_ACTION_READY);
  // "ไม่ต้องยืนยัน" ไม่เอ่ยถึงปุ่ม — ไม่มีประโยคต่อท้าย
  const plain = surveyJobView({ request: ask({ ...SENT, surveyConfirm: 'not_needed' }), today: TODAY, viewer: SALES }).zones.drawingBanner;
  assert.equal(plain.note ?? null, null);

  const confirm = surveySendConfirm({
    docNo: 'RQ-AS-26100312', closesVisit: null, method: { mix: { onsite: 0, drawing: 3, mode: 'drawing' }, confirm: null, openVisit: null },
  });
  // …และหายจากไทล์ของหัวหน้าพร้อมกัน (สวิตช์ตัวเดียว)
  assert.equal(confirm.choice.pendingNote, null);
  // คำบนไทล์ยังเป็นคำของแผน (มติเจ้าของ O1) — ประโยคใหม่อยู่ที่คีย์ของตัวเอง
  assert.deepEqual(confirm.choice.options.map((o) => o.value), ['needed', 'not_needed']);
  assert.equal(JSON.stringify(confirm.choice.options).includes('รอบถัดไป'), false);
  // ใบลงหน้างานล้วน: ไม่มีตัวเลือก ไม่มีคีย์ใหม่
  const onsite = surveySendConfirm({ docNo: 'RQ-AS-26100312', closesVisit: null, method: null });
  assert.deepEqual(Object.keys(onsite), ['effects', 'confirmLabel']);
  // ทั้งสองไฟล์อ่านสวิตช์ตัวเดียวกัน ไม่เขียน false เอง
  for (const name of ['surveyJob.js', 'surveySendClose.js']) {
    const src = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.match(src, /SURVEY_CONFIRM_ACTION_READY \? null : SURVEY_CONFIRM_PENDING_NOTE/, name);
  }
  assert.match(readFileSync(new URL('./surveyJob.js', import.meta.url), 'utf8'), /ready: SURVEY_CONFIRM_ACTION_READY \}/);
});

/* ══ แผงแบบจากฝ่ายขาย (§2.5 a) ══════════════════════════════════════════════════════════════ */

const requestFile = (id, fileName, mimeType, extra = {}) => ({
  id, docType: 'other', fileName, mimeType, sizeBytes: 1800000, driveFileId: `drv-${id}`, fileUrl: null,
  createdAt: '2026-10-07T01:00:00.000Z', uploadedByName: 'Lalida Chaiwanna', kind: null, ...extra,
});
const threadFile = (updateId, index, fileName, mimeType, extra = {}) => ({
  updateId, index, fileName, mimeType, sizeBytes: 900000, createdAt: '2026-10-07T18:30:00.000Z', authorName: 'Lalida Chaiwanna', ...extra,
});
const drawingZone = (over = {}) => ({ id: 'd1', zoneName: 'โซนขาย', status: 'ok', parts: [], spots: [], ...DRAWING, ...over });

test('แผงแบบจากฝ่ายขาย · editable=false (ผู้วางคิว · ใบล็อก): ทุกไฟล์ไม่มีปุ่ม แต่แกลเลอรีอยู่ครบ — ค่าเดียวกับ editable ของหน้าพื้นที่', () => {
  const input = {
    requestFiles: [requestFile('ATT-1', 'แปลน.jpg', 'image/jpeg'), requestFile('ATT-2', 'แบบ.pdf', 'application/pdf')],
    threadFiles: [threadFile('EU-9', 0, 'แก้ไข.png', 'image/png')],
    zone: drawingZone(),
  };
  const head = surveySalesDrawingsView(input);
  assert.deepEqual(head.files.map((f) => f.reuse?.enabled ?? null), [true, false, true]);
  assert.deepEqual(surveySalesDrawingsView({ ...input, editable: true }), head, 'ไม่ส่ง = true');

  const planner = surveySalesDrawingsView({ ...input, editable: false });
  assert.deepEqual(planner.files.map((f) => f.reuse), [null, null, null]);
  // นอกจากปุ่ม ทุกคีย์เท่ากับของหัวหน้า (ชื่อ · ที่อยู่ · ดูเป็นรูปได้ไหม · ตัวชี้ · รายละเอียด)
  const bare = (view) => ({ ...view, files: view.files.map(({ reuse, ...rest }) => rest) });
  assert.deepEqual(bare(planner), bare(head));

  // ค่าที่ผู้เรียกส่งจริง: `surveyDrawingZoneView(...).editable` ของพื้นที่เดียวกัน
  const asPlanner = surveyDrawingZoneView({ zone: drawingZone(), files: [], canDecide: false });
  const asHead = surveyDrawingZoneView({ zone: drawingZone(), files: [], canDecide: true });
  const lockedHead = surveyDrawingZoneView({ zone: drawingZone(), files: [], canDecide: true, locked: true });
  assert.deepEqual([asPlanner.editable, asHead.editable, lockedHead.editable], [false, true, false]);
  assert.equal(surveySalesDrawingsView({ ...input, editable: asPlanner.editable }).files.every((f) => f.reuse === null), true);
  assert.equal(surveySalesDrawingsView({ ...input, editable: lockedHead.editable }).files.every((f) => f.reuse === null), true);
});

test('แผงแบบจากฝ่ายขาย · ref / typeText / metaText / countText: ตัวชี้ของเส้นคัดลอก · นามสกุลตัวใหญ่ · ชิ้นที่ไม่มีถูกข้าม · วันเป็นวันไทย', () => {
  const view = surveySalesDrawingsView({
    requestFiles: [
      requestFile('ATT-1', 'แปลนชั้น 1.jpg', 'image/jpeg'),
      requestFile('ATT-2', 'scan.JPEG', 'image/jpeg', { sizeBytes: 512, uploadedByName: null }),
      requestFile('ATT-3', 'บรีฟหน้าร้าน', null, { kind: 'gdoc', driveFileId: null, fileUrl: 'https://docs.google.com/document/d/abc', sizeBytes: null, createdAt: null }),
      requestFile(7, 'แบบ.tar.gz', 'application/gzip', { sizeBytes: 0, uploadedByName: '  ', createdAt: 'ไม่ใช่เวลา' }),
    ],
    threadFiles: [threadFile('EU-9', 2, 'แปลนแก้ไข.png', 'image/png'), threadFile('EU-9', 3, null, 'image/png', { sizeBytes: undefined, authorName: null, createdAt: null })],
    zone: drawingZone(),
  });
  assert.equal(view.countText, '6 ไฟล์');
  assert.deepEqual(view.files.map((f) => f.ref), [
    { kind: 'request', attachmentId: 'ATT-1' },
    { kind: 'request', attachmentId: 'ATT-2' },
    { kind: 'request', attachmentId: 'ATT-3' },
    { kind: 'request', attachmentId: '7' },
    { kind: 'thread', updateId: 'EU-9', index: 2 },
    { kind: 'thread', updateId: 'EU-9', index: 3 },
  ]);
  assert.deepEqual(view.files.map((f) => f.typeText), ['JPG', 'JPEG', null, 'GZ', 'PNG', null]);
  assert.deepEqual(view.files.map((f) => f.metaText), [
    '1.7 MB · Lalida Chaiwanna · พ. 7 ต.ค.',
    '512 B · พ. 7 ต.ค.',
    'Lalida Chaiwanna',
    '0 B',
    // 18:30 UTC ของวันที่ 7 = 01:30 ของวันที่ 8 ตามเวลาไทย
    '879 KB · Lalida Chaiwanna · พฤ. 8 ต.ค.',
    null,
  ]);
  // ตัวชี้ของเธรดตรงกับที่อยู่ที่จอเปิด (`?i=` = ลำดับในข้อความนั้น)
  assert.equal(view.files[4].href, '/api/updates/EU-9/file?i=2');
  // อ่านไม่สำเร็จ = ไม่นับ
  assert.equal(surveySalesDrawingsView({ requestFiles: [], threadFiles: [], unknown: { threadFiles: true } }).countText, null);
  assert.equal(surveySalesDrawingsView().countText, '0 ไฟล์');
});

/* ══ มาตรวัดของงานโต๊ะ (§2.5 b) ═════════════════════════════════════════════════════════════ */

const control = (rows, filesByZone = {}, over = {}) => surveyControlView({
  request: ask({ ...PROMISED, ...over }), zones: rows, filesByZone, visit: null, viewer: HEAD, today: TODAY,
});

test('progress.desk: ใบจากแบบทั้งใบ = เลขคู่เดียวกับพาดหัว "กำลังประเมินจากแบบ — x/N พื้นที่" · ใบลงหน้างานและใบผสม = null', () => {
  const rows = zones(DRAWING).map((z) => ({ ...z, parts: [{ id: 'p', widthM: 4, lengthM: 4, heightM: 3 }], packageQty: 1, packageSize: 'ST', spotsSelected: 1, spots: [{ id: 's', label: 'จุด' }] }));
  const files = { z1: [file('f1', 'survey_plan')], z2: [file('f2', 'survey_plan')] };
  const view = control(rows, files);
  assert.equal(view.mix.mode, 'drawing');
  assert.equal(view.progress.desk.total, 3);
  assert.ok(Number.isInteger(view.progress.desk.done) && view.progress.desk.done >= 0 && view.progress.desk.done <= 3);
  if (view.status.key === 'desk-working') {
    assert.equal(view.status.headline, `กำลังประเมินจากแบบ — ${view.progress.desk.done}/${view.progress.desk.total} พื้นที่`);
  }
  // ยังไม่มีอะไรเลย: 0 / N — ไม่ใช่ null (แถบของการ์ดเริ่มจากศูนย์)
  const empty = control(zones(DRAWING).map((z) => ({ ...z, parts: [] })));
  assert.equal(empty.status.key, 'desk-empty');
  assert.deepEqual(empty.progress.desk, { done: 0, total: 3 });
  // พื้นที่ที่ถูกตัดไม่นับในตัวหาร
  const cut = control(zones(DRAWING).map((z, i) => (i === 0 ? { ...z, status: 'cut' } : z)));
  assert.equal(cut.progress.desk.total, 2);

  assert.equal(control(zones()).progress.desk, null, 'ลงหน้างานล้วน');
  assert.equal(control(mixedZones()).progress.desk, null, 'ผสม');
  assert.equal(control([]).progress.desk, null, 'ไม่มีพื้นที่');
  assert.equal(control(zones(DRAWING).map((z) => ({ ...z, status: 'cut' }))).progress.desk, null, 'ถูกตัดหมด');
});

test('progress.desk: พาดหัวของงานโต๊ะที่กำลังประเมินใช้เลขคู่เดียวกันทุกสัดส่วน (0…N พื้นที่ที่พร้อม)', () => {
  const ready = (z) => ({ ...z, parts: [{ id: 'p', widthM: 4, lengthM: 4, heightM: 3 }], packageQty: 1, packageSize: 'ST', spotsSelected: 0 });
  const sized = (z) => ({ ...z, parts: [{ id: 'p', widthM: 4, lengthM: 4, heightM: 3 }] });
  let seenWorking = 0;
  for (let k = 0; k <= 3; k += 1) {
    const rows = zones(DRAWING).map((z, i) => (i < k ? ready(z) : sized(z)));
    const files = Object.fromEntries(rows.slice(0, k).map((z) => [z.id, [file(`p-${z.id}`, 'survey_plan')]]));
    const view = control(rows, files);
    if (view.status.key !== 'desk-working') continue;
    /* 🔄 head-rc-r2-22 ผลรีวิวรอบห้า — ทุกพื้นที่พร้อมแต่ทะเบียนขนาดอ่านไม่ขึ้น (ตัวช่วยนี้ไม่ส่ง `packageSizes`) = งานโต๊ะจบขั้นประเมินแล้ว
       (ด่านทะเบียนเป็นเหตุของขั้นส่งผล) ⇒ พาดหัว "ประเมินจากแบบครบแล้ว — …" ไม่ใช่ "กำลังประเมินจากแบบ — n/n" (เดิมก่อนรอบห้า) */
    if (view.progress.desk.done === view.progress.desk.total) {
      assert.equal(view.status.headline, 'ประเมินจากแบบครบแล้ว — อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ', `k=${k}`);
      continue;
    }
    seenWorking += 1;
    assert.equal(view.status.headline, `กำลังประเมินจากแบบ — ${view.progress.desk.done}/${view.progress.desk.total} พื้นที่`, `k=${k}`);
  }
  assert.ok(seenWorking >= 1, 'ต้องมีอย่างน้อยหนึ่งสัดส่วนที่ตกสถานะกำลังประเมิน');
});

/* ══ หัวงาน (§2.5 c) ════════════════════════════════════════════════════════════════════════ */

const VISIT = { id: 'v1', code: 'SV-26100011', status: 'scheduled', scheduledDate: '2026-10-13', startTime: '10:00:00', assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad' };
const SITE = { id: 'S1', code: 'ST-0001', name: 'Central', accessStart: null, accessEnd: null, accessNote: 'แลกบัตรที่ รปภ.', contactName: 'คุณแหวน', contactPhone: '081-234-5678' };
const headerInput = (over = {}) => ({
  request: ask({ committedResultDate: '2026-10-15' }), customer: { arCode: 'AR-1', name: 'ลูกค้า' }, site: SITE, visit: VISIT,
  crew: [{ id: 'u-pa', name: 'Phuwadol Aoonnankad', lead: true, you: false }], unknown: {}, ...over,
});
const ALL_DRAWING = { mix: { onsite: 0, drawing: 3, mode: 'drawing' }, needsVisit: false };
const MIXED = { mix: { onsite: 2, drawing: 1, mode: 'mixed' }, needsVisit: true };

test('หัวงาน · ไม่ส่ง method / ใบไม่มีพื้นที่จากแบบ = ผลเดิมทุกคีย์ (ไม่มีข้อ "วิธีประเมิน")', () => {
  const today = surveyJobHeaderView(headerInput());
  assert.deepEqual(today.facts.map((f) => f.key), ['visit', 'crew', 'access', 'note']);
  for (const method of [null, undefined, {}, { mix: null }, { mix: { onsite: 2, drawing: 0, mode: 'onsite' }, needsVisit: true }, { mix: { onsite: 0, drawing: 0, mode: 'empty' } }]) {
    assert.deepEqual(surveyJobHeaderView(headerInput({ method })), today, JSON.stringify(method));
  }
});

test('หัวงาน · ใบผสม: ข้อแรก "ลงหน้างาน a · จากแบบ k" ไม่มีบรรทัดรอง · ข้อของนัดอยู่ครบ', () => {
  const today = surveyJobHeaderView(headerInput());
  const view = surveyJobHeaderView(headerInput({ method: MIXED }));
  assert.deepEqual(view.facts[0], { key: 'method', label: 'วิธีประเมิน', value: 'ลงหน้างาน 2 · จากแบบ 1' });
  assert.deepEqual(view.facts.slice(1), today.facts);
  assert.deepEqual({ ...view, facts: null }, { ...today, facts: null }, 'คีย์อื่นของหัวงานไม่ขยับ');
});

test('หัวงาน · จากแบบทั้งใบ ไม่มีนัดที่ยังเปิด: "ประเมินจากแบบ" + ทั้งใบ n พื้นที่ · ไม่ลงคิว… · ข้อของนัดถูกแทนด้วยผู้ขอ ผู้รับผิดชอบ และสองวัน', () => {
  for (const visit of [null, { ...VISIT, status: 'done' }, { ...VISIT, status: 'partial' }, { ...VISIT, status: 'unable' }, { ...VISIT, status: 'cancelled' }, { ...VISIT, status: 'completed' }, { ...VISIT, status: 'rescheduled' }]) {
    const view = surveyJobHeaderView(headerInput({ visit, method: ALL_DRAWING }));
    /* มติเจ้าของ head-r3-33 (ทำตามม็อก): ใบงานโต๊ะไม่มีใครไปหน้างาน ⇒ ไม่มี ให้เข้า · ฝากมา · ติดต่อ · โทร · นำทาง — ใส่ "ผู้ขอ" แทน
       (S2b แก้หลังตรวจจอ) */
    assert.deepEqual(view.facts, [
      { key: 'method', label: 'วิธีประเมิน', value: 'ประเมินจากแบบ', sub: 'ทั้งใบ 3 พื้นที่ · ไม่ลงคิว ไม่มีนัดบนตารางเจ้าหน้าที่' },
      { key: 'requester', label: 'ผู้ขอ', value: 'Lalida Chaiwanna' },
      { key: 'assignee', label: 'ผู้รับผิดชอบ', value: 'Arnon Aunsapwilai' },
      { key: 'wantedResult', label: 'ผู้ขอต้องการผล', value: 'พฤ. 15 ต.ค.' },
      { key: 'resultDate', label: 'วันที่จะส่งผลประเมิน', value: 'พฤ. 15 ต.ค.' },
    ], String(visit?.status));
    assert.equal(view.deskOnly, true, String(visit?.status));
    assert.equal(view.call, null, String(visit?.status));
    assert.equal(view.nav, null, String(visit?.status));
  }
  // ค่าว่าง = ขีด ไม่ใช่ค่าดิบ
  const blank = surveyJobHeaderView(headerInput({
    visit: null, method: ALL_DRAWING, request: ask({ assigneeName: ' ', requestedResultDate: null, committedResultDate: 'ไม่ใช่วัน', requestedByName: ' ' }),
  }));
  assert.deepEqual(blank.facts.slice(1, 5).map((f) => f.value), ['—', '—', '—', '—']);
  // ยังไม่มอบหมาย = คนที่กดรับเรื่อง (requestAssignee ตัวเดียวกับหน้าคำร้อง) — หัวงานเคยขึ้นขีดขณะหน้าคำร้องขึ้นชื่อ (UAT S4 T14 head)
  const unassigned = surveyJobHeaderView(headerInput({
    visit: null, method: ALL_DRAWING, request: ask({ assigneeId: null, assigneeName: null, acknowledgedByName: 'Somchai Ackby' }),
  }));
  assert.deepEqual(unassigned.facts[2], { key: 'assignee', label: 'ผู้รับผิดชอบ', value: 'Somchai Ackby' });
  const nobody = surveyJobHeaderView(headerInput({
    visit: null, method: ALL_DRAWING, request: ask({ assigneeId: null, assigneeName: null, acknowledgedById: null, acknowledgedByName: null }),
  }));
  assert.equal(nobody.facts[2].value, '—');
});

test('หัวงาน · จากแบบทั้งใบ แต่ยังมีนัดเปิดอยู่ (ร่าง · นัดไว้ · กำลังทำ): ไม่พูดว่าไม่มีนัด และข้อของนัดอยู่ครบ', () => {
  for (const status of ['draft', 'scheduled', 'in_progress']) {
    const visit = { ...VISIT, status };
    const today = surveyJobHeaderView(headerInput({ visit }));
    const view = surveyJobHeaderView(headerInput({ visit, method: ALL_DRAWING }));
    assert.deepEqual(view.facts[0], { key: 'method', label: 'วิธีประเมิน', value: 'ประเมินจากแบบ', sub: 'ทั้งใบ 3 พื้นที่' }, status);
    assert.deepEqual(view.facts.slice(1), today.facts, status);
    assert.equal(JSON.stringify(view.facts).includes('ไม่มีนัด'), false, status);
    assert.ok(view.facts.some((f) => f.key === 'visit' && f.value.includes('SV-26100011')), status);
  }
  // ตัวตัดสิน "นัดยังเปิดไหม" ดูจากนัด ไม่ใช่จาก needsVisit ของแถวพื้นที่
  const src = readFileSync(new URL('./surveyFieldView.js', import.meta.url), 'utf8');
  assert.match(src, /const HEADER_OPEN_VISIT = \['draft', 'scheduled', 'in_progress'\];/);
});

/* ══ แถวรวมรูป + สรุปของจอรุ่นเก่า (§2.5 d) ═════════════════════════════════════════════════ */

test('zones.photosTotalText: ไม่มีพื้นที่จากแบบ = null · จากแบบทั้งใบ = "แบบ k" · ผสม = ภาพกว้าง/ผังของพื้นที่ลงหน้างาน + แบบของพื้นที่จากแบบ', () => {
  const job = (request) => surveyJobView({ request, today: TODAY, viewer: SALES }).zones;
  assert.equal(job(ask({ surveyZones: zones() })).photosTotalText, null);

  const allFiles = { z1: [file('a', 'survey_plan'), file('b', 'survey_plan', 'application/pdf', 'b.pdf')], z2: [file('c', 'survey_plan')], z3: [file('w', 'survey_wide')] };
  const all = job(ask({ surveyFilesByZone: allFiles }));
  assert.equal(all.photosTotalText, 'แบบ 3');
  // เลขเดียวกับที่แต่ละแถวพิมพ์ ("แบบ n" ของแถว)
  assert.deepEqual(all.rows.map((r) => r.photosText), ['แบบ 2', 'แบบ 1', 'แบบ 0']);

  const mixedFiles = {
    z1: [file('w1', 'survey_wide'), file('w2', 'survey_wide'), file('p1', 'survey_plan')],
    z2: [file('w3', 'survey_wide')],
    z3: [file('old', 'survey_wide'), file('d1', 'survey_plan'), file('d2', 'survey_plan')],
  };
  const mixed = job(ask({ surveyZones: mixedZones(), surveyFilesByZone: mixedFiles }));
  assert.equal(mixed.photosTotalText, 'ภาพกว้าง 3 · ผัง 1 · แบบ 2', 'ภาพกว้างที่ค้างบนพื้นที่จากแบบไม่ถูกนับ');
  // พื้นที่ที่ถูกตัดไม่นับ
  const cutZones = mixedZones().map((z, i) => (i === 0 ? { ...z, status: 'cut' } : z));
  assert.equal(job(ask({ surveyZones: cutZones, surveyFilesByZone: mixedFiles })).photosTotalText, 'ภาพกว้าง 1 · ผัง 0 · แบบ 2');
  // อ่านรูปไม่สำเร็จ = ไม่เดา
  assert.equal(job(ask({ surveyZones: mixedZones(), surveyFilesByZone: mixedFiles, surveyUnknown: { files: true } })).photosTotalText, null);
});

test('surveyRequestDrawingSummary: rows มีเฉพาะพื้นที่จากแบบ · แถบแจ้งกติกาเดียวกับ surveyJobView · ใบลงหน้างานล้วน = { banner: null, rows: {} }', () => {
  assert.deepEqual(surveyRequestDrawingSummary(ask({ ...SENT, surveyConfirm: 'needed', surveyZones: zones() })), { banner: null, rows: {} });
  assert.deepEqual(surveyRequestDrawingSummary(null), { banner: null, rows: {} });
  assert.deepEqual(surveyRequestDrawingSummary({ id: 'x' }), { banner: null, rows: {} });

  const added = mixedZones().map((z, i) => (i === 2 ? { ...z, status: 'added' } : z));
  const request = ask({ ...SENT, surveyConfirm: 'needed', surveyZones: added });
  const summary = surveyRequestDrawingSummary(request);
  assert.deepEqual(Object.keys(summary.rows), ['z3']);
  assert.equal(summary.rows.z3.addedLabel, 'เพิ่มโดย TS');
  const { chip: methodLabel } = summary.rows.z3;
  assert.equal(methodLabel, 'จากแบบ');
  // แถบแจ้งตัวเดียวกับของ view-model หลัก ทุกสภาพของใบ
  const shapes = [
    request,
    ask({ ...SENT, surveyConfirm: 'not_needed', surveyZones: added }),
    ask({ ...SENT, surveyConfirm: null, surveyZones: added }),
    ask({ ...PROMISED, surveyConfirm: 'needed', surveyZones: added }),
    ask({ ...SENT, status: 'cancelled', cancelledAt: '2026-10-15T03:00:00Z', surveyConfirm: 'needed', surveyZones: added }),
    ask({ ...SENT, status: 'closed', closedAt: '2026-10-15T03:00:00Z', surveyConfirm: 'needed', surveyZones: added }),
    ask({ ...SENT, surveyConfirm: 'needed', surveyZones: zones(DRAWING).map((z) => ({ ...z, status: 'cut' })) }),
  ];
  for (const shape of shapes) {
    const expected = surveyJobView({ request: shape, today: TODAY, viewer: SALES }).zones.drawingBanner;
    assert.deepEqual(surveyRequestDrawingSummary(shape).banner, expected, `${shape.status}/${shape.surveyConfirm}`);
  }
  assert.equal(surveyRequestDrawingSummary(request).banner.text.startsWith('มี 1 พื้นที่ที่ประเมินจากแบบ'), true);
  // แถวที่ถูกตัดยังอยู่ใน rows (แถวยังเป็นจากแบบ — จอเป็นคนเลือกว่าจะวาดป้ายบนแถวที่ตัดไหม) แต่ไม่ถูกนับในแถบแจ้ง
  const cutSummary = surveyRequestDrawingSummary(shapes[6]);
  assert.deepEqual([Object.keys(cutSummary.rows).length, cutSummary.banner], [3, null]);
});

/* ══ บรรทัดที่มาบนคิว (§2.5 e) ══════════════════════════════════════════════════════════════ */

test('surveyQueueMethodBack: เหตุผลของพื้นที่ลงหน้างานที่ถูกสลับล่าสุด · ไม่เคยสลับ / งานโต๊ะ / ไม่มีเหตุผล = null', () => {
  const z = (id, o = {}) => ({ id, requestId: 'R1', status: 'ok', method: 'onsite', methodReason: null, methodChangedAt: null, ...o });
  // ใบของวันนี้ทุกใบ: ไม่มีแถวไหนเคยสลับ
  assert.equal(surveyQueueMethodBack([z('a'), z('b')]), null);
  assert.equal(surveyQueueMethodBack([{ id: 'a', requestId: 'R1', status: 'ok' }]), null, 'แถวก่อน mig 0408');
  assert.equal(surveyQueueMethodBack([]), null);
  assert.equal(surveyQueueMethodBack(null), null);

  const back = [
    z('a', { methodReason: 'ลูกค้าขอให้เข้าวัดจริง', methodChangedAt: '2026-10-08T03:00:00+00:00' }),
    z('b', { methodReason: 'แบบไม่ตรงหน้างาน ต้องวัดใหม่', methodChangedAt: '2026-10-08T09:00:00.000Z' }),
    z('c'),
  ];
  assert.deepEqual(surveyQueueMethodBack(back), { reason: 'แบบไม่ตรงหน้างาน ต้องวัดใหม่' });
  // เทียบเวลาเป็นจุดเวลา ไม่ใช่สตริง: +07:00 ที่ "ดูมากกว่า" แต่เกิดก่อน ต้องไม่ชนะ
  assert.deepEqual(surveyQueueMethodBack([
    z('a', { methodReason: 'เกิดก่อน', methodChangedAt: '2026-10-08T15:00:00+07:00' }),
    z('b', { methodReason: 'เกิดทีหลัง', methodChangedAt: '2026-10-08T09:00:00Z' }),
  ]), { reason: 'เกิดทีหลัง' });
  // พื้นที่ที่ถูกตัด · พื้นที่จากแบบ · เหตุผลว่าง · เวลาอ่านไม่ออก ไม่ถูกเลือก
  assert.deepEqual(surveyQueueMethodBack([
    z('a', { methodReason: 'ของพื้นที่ที่ตัดไปแล้ว', methodChangedAt: '2026-10-09T00:00:00Z', status: 'cut' }),
    z('b', { methodReason: 'ของพื้นที่จากแบบ', methodChangedAt: '2026-10-09T00:00:00Z', method: 'drawing' }),
    z('c', { methodReason: '   ', methodChangedAt: '2026-10-09T00:00:00Z' }),
    z('d', { methodReason: 'เวลาอ่านไม่ออก', methodChangedAt: 'เมื่อวาน' }),
    z('e', { methodReason: 'ใช้ตัวนี้', methodChangedAt: '2026-10-07T00:00:00Z' }),
  ]), { reason: 'ใช้ตัวนี้' });
  // งานโต๊ะ (ไม่ต้องมีนัด) = ไม่มีการ์ดลงคิวให้บอกที่มา
  assert.equal(surveyQueueMethodBack([z('a', { method: 'drawing', methodReason: 'ฝ่ายขายมีแบบครบ', methodChangedAt: '2026-10-08T00:00:00Z' })]), null);
  assert.equal(surveyQueueMethodBack([
    z('a', { status: 'cut', methodReason: 'เคยสลับกลับ', methodChangedAt: '2026-10-08T00:00:00Z' }),
    z('b', { method: 'drawing' }),
  ]), null);
});

/* ══ ปุ่มวันส่งผลของงานโต๊ะ (§2.5 g) ════════════════════════════════════════════════════════ */

const deskRequest = (over = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26100312', kind: 'site_survey', dept: 'TS', siteId: 'SVS-1', status: 'acknowledged',
  acknowledgedAt: '2026-10-08T02:00:00.000Z', requestedResultDate: '2026-10-15',
  committedDueDate: null, committedResultDate: null, answeredAt: null, cancelledAt: null, closedAt: null,
  surveyNeedsVisit: false, ...over,
});

test('deskDueAction: งานโต๊ะที่รับเรื่องแล้ว — ยังไม่รับปาก = รับปากวันส่งผล · รับปากแล้ว = เลื่อนวันส่งผล (ฐานเดียวกับ route)', () => {
  const fresh = deskRequest();
  assert.equal(requestAwaitingDue(fresh), true);
  assert.deepEqual(deskDueAction(fresh, { canCommit: true }), { kind: 'commit', label: 'รับปากวันส่งผล' });
  const held = deskRequest({ committedDueDate: '2026-10-15', committedResultDate: '2026-10-15', dueCommittedAt: '2026-10-08T09:00:00Z' });
  assert.equal(requestAwaitingDue(held), false);
  assert.deepEqual(deskDueAction(held, { canCommit: true }), { kind: 'reschedule', label: 'เลื่อนวันส่งผล' });
  // ป้ายของปุ่มรับปากคือคำเดียวกับปุ่มของโมดัล
  assert.equal(deskDueAction(fresh, { canCommit: true }).label, commitDueLabels(fresh).action);
});

test('deskDueAction: ไม่มีสิทธิ์ · ไม่ใช่งานโต๊ะ · ยังไม่รับเรื่อง · ส่งผล/ยกเลิก/ปิดแล้ว = null (ไม่มีปุ่ม ไม่ใช่ปุ่มจาง)', () => {
  const held = { committedDueDate: '2026-10-15', committedResultDate: '2026-10-15' };
  for (const options of [undefined, {}, { canCommit: false }, { canCommit: 'yes' }, { canCommit: 1 }]) {
    assert.equal(deskDueAction(deskRequest(), options), null, JSON.stringify(options));
  }
  const none = [
    null, undefined,
    deskRequest({ surveyNeedsVisit: true }), deskRequest({ surveyNeedsVisit: undefined }), deskRequest({ surveyNeedsVisit: null }),
    deskRequest({ surveyNeedsVisit: 'false' }),
    deskRequest({ kind: 'info' }), deskRequest({ kind: 'material' }),
    deskRequest({ status: 'pending', acknowledgedAt: null }),
    deskRequest({ status: 'answered', answeredAt: '2026-10-14T03:00:00Z', ...held }),
    deskRequest({ answeredAt: '2026-10-14T03:00:00Z', ...held }),
    deskRequest({ status: 'cancelled', cancelledAt: '2026-10-09T00:00:00Z' }),
    deskRequest({ cancelledAt: '2026-10-09T00:00:00Z' }),
    deskRequest({ status: 'closed', closedAt: '2026-10-09T00:00:00Z', ...held }),
    deskRequest({ closedAt: '2026-10-09T00:00:00Z', ...held }),
    deskRequest({ status: 'draft' }),
  ];
  for (const request of none) assert.equal(deskDueAction(request, { canCommit: true }), null, JSON.stringify(request)?.slice(0, 120));
});

/* ══ บรรทัดรวมท้ายแถบแท็บ (§2.5 i) ══════════════════════════════════════════════════════════ */

test('surveySheetTotalsText: ไม่มีพื้นที่จากแบบ = บรรทัดเดิมทุกตัวอักษร · จากแบบทั้งใบ = "ภาพแบบ k" · ผสม = ภาพกว้าง/จุดของพื้นที่ลงหน้างาน + ภาพแบบ', () => {
  const spots = [{ id: 's1', label: 'จุด 1' }, { id: 's2', label: 'จุด 2' }];
  const rows = zones().map((z, i) => (i === 0 ? { ...z, spots } : z));
  const files = { z1: [file('w1', 'survey_wide'), file('w2', 'survey_wide')], z2: [file('w3', 'survey_wide')] };
  // 8×6 + 6×5 = 78 ตร.ม. · 8×6×3 + 6×5×2.8 = 228 ลบ.ม.
  assert.equal(surveySheetTotalsText({ zones: rows, filesByZone: files }), 'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 2');
  for (const hideDrawing of [true, false, undefined]) {
    assert.equal(surveySheetTotalsText({ zones: rows, filesByZone: files, hideDrawing }), 'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 2');
  }

  const sized = { parts: [{ id: 'p', widthM: 5, lengthM: 4, heightM: 3 }], spots };
  const mixed = rows.map((z, i) => (i === 2 ? { ...z, ...DRAWING, ...sized } : z));
  const mixedFiles = {
    ...files,
    z3: [file('old', 'survey_wide'), file('d1', 'survey_plan'), file('d2', 'survey_plan', 'image/png', 'd2.png'), file('d3', 'survey_plan', 'application/pdf', 'd3.pdf'), file('d4', 'survey_plan', 'image/tiff', 'd4.tiff')],
  };
  // ตัวเลขพื้นที่เป็นของทั้งใบ (78 + 20 · 228 + 60) · ภาพกว้าง/จุดนับเฉพาะลงหน้างาน · ภาพแบบ = เฉพาะที่ลงเอกสารได้ (JPG/PNG)
  assert.equal(surveySheetTotalsText({ zones: mixed, filesByZone: mixedFiles }), 'รวม 98 ตร.ม. · 288 ลบ.ม. · ภาพกว้าง 3 · จุด 2 · ภาพแบบ 2');
  // จอของช่าง (ซ่อนพื้นที่จากแบบ) = บรรทัดเดิมของพื้นที่ลงหน้างาน ไม่มีท่อนภาพแบบ
  assert.equal(surveySheetTotalsText({ zones: mixed, filesByZone: mixedFiles, hideDrawing: true }), 'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 2');

  const all = mixed.map((z) => ({ ...z, ...DRAWING }));
  assert.equal(surveySheetTotalsText({ zones: all, filesByZone: mixedFiles }), 'รวม 98 ตร.ม. · 288 ลบ.ม. · ภาพแบบ 2');
  assert.equal(surveySheetTotalsText({ zones: all, filesByZone: mixedFiles, hideDrawing: true }), null);
  // พื้นที่จากแบบที่ถูกตัดไม่ทำให้ใบกลายเป็น "มีพื้นที่จากแบบ"
  const cutDrawing = mixed.map((z, i) => (i === 2 ? { ...z, status: 'cut' } : z));
  assert.equal(surveySheetTotalsText({ zones: cutDrawing, filesByZone: mixedFiles }), 'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 2');
});

/* ══ บล็อกเอกสารบนหน้าคำร้อง (§2.5 j · งวด S3 ถอดข้อพักเอกสาร) ═══════════════════════════════════════
   ⭐ ใบที่มีพื้นที่จากแบบได้บล็อกเดียวกับใบลงหน้างานทุกสถานะ ทุกคนดู — ใบที่ส่งผลไประหว่างที่เอกสารถูกพักเป็น `missing`
      เหมือนใบอื่น: หัวหน้าถูกชี้ไปกด "ออกเอกสาร" ที่ใบประเมิน (ปุ่มนั้นออกให้แล้ว) · ฝ่ายขายได้ประโยคทวงหัวหน้าตามช่องทางจริง */

const DOC_ACCESS = {
  head: { customer: true, internal: true, issue: true, draft: true, history: true },
  sales: { customer: true, internal: false, issue: false, draft: false, history: false },
};
const docOf = (who, state) => ({
  access: DOC_ACCESS[who], state, storeAllowed: true,
  current: ['issued', 'frozen', 'ready', 'stale'].includes(state)
    ? { docNo: 'SU-26100001-0', issuedAt: '2026-10-14T03:00:05Z', issuedByName: 'Arnon', ready: { customer: true, internal: false } }
    : null,
  history: who === 'head' && state === 'recalled' ? [{ docNo: 'SU-26100001-0' }] : [],
});
const requestBlock = (surveyZones, surveyDocument, viewer, refreshStalled = false, over = {}) => surveyJobView({
  request: ask({ ...SENT, surveyDocument, surveyZones, ...over }), today: TODAY, viewer, refreshStalled,
}).document;

test('⭐ บล็อกเอกสาร · ใบจากแบบทั้งใบ / ใบผสม = บล็อกของใบลงหน้างาน — ทุกสถานะ × หัวหน้า/ฝ่ายขาย × เปลือกยังตรวจ/เลิกตรวจ × ใบเปิด/ปิด', () => {
  const states = ['missing', 'issuing', 'issued', 'frozen', 'ready', 'recalled', 'stale', 'not_sent'];
  for (const state of states) {
    for (const [who, viewer] of [['head', HEAD], ['sales', SALES]]) {
      for (const stalled of [false, true]) {
        for (const over of [{}, { status: 'closed', closedAt: '2026-10-15T00:00:00Z' }]) {
          const at = `${state} · ${who} · ${stalled} · ${over.status || 'answered'}`;
          const onsite = requestBlock(zones(), docOf(who, state), viewer, stalled, over);
          for (const surveyZones of [zones(DRAWING), mixedZones()]) {
            assert.deepEqual(requestBlock(surveyZones, docOf(who, state), viewer, stalled, over), onsite, at);
          }
        }
      }
    }
  }
  // ตัวอย่างตรงตัว — กันทั้งตารางบนเขียวเพราะสองฝั่งเพี้ยนไปพร้อมกัน
  const head = requestBlock(zones(DRAWING), docOf('head', 'missing'), HEAD);
  assert.deepEqual(head.text, { tone: 'info', text: 'ยังไม่มีเอกสารของใบนี้ — กด “ออกเอกสาร” ที่ใบประเมิน' });
  assert.equal(head.sheetLink, true, 'หัวหน้าได้ลิงก์ไปใบประเมิน ที่ที่ปุ่มออกเอกสารอยู่');
  assert.deepEqual(head.badge, { label: 'ยังไม่ออก', tone: 'warning' });
  const sales = requestBlock(mixedZones(), docOf('sales', 'missing'), SALES);
  assert.deepEqual(sales.text, { tone: 'info', text: 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร (เขียนในเธรดด้านล่างได้)' });
  assert.equal(sales.buttons.length, 1);
  assert.equal(sales.buttons[0].blocked, sales.text.text);
  // "กำลังออก" กลับมาเป็นสถานะของตัวเอง (เดิมถูกกลืนเป็น "ยังไม่ออก" ตอนเอกสารถูกพัก)
  assert.deepEqual(requestBlock(zones(DRAWING), docOf('sales', 'issuing'), SALES).badge, { label: 'กำลังออก', tone: 'info' });
  const ready = requestBlock(zones(DRAWING), docOf('sales', 'ready'), SALES);
  assert.equal(ready.docNo, 'SU-26100001-0');
  assert.equal(ready.buttons[0].href, '/api/service/surveys/r1/document?version=customer&download=1');
  assert.doesNotMatch(JSON.stringify([head, sales, ready]), /ยังออกไม่ได้ — ระบบ|ผลถึงฝ่ายขายตามปกติ/);
});

test('🔴 surveyJobView ไม่ส่งอะไรเรื่องวิธีประเมินให้บล็อกเอกสาร · ไม่ import โมดูลส่งผล', () => {
  const src = readFileSync(new URL('./surveyJob.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /from '\.\/surveySendClose'/);
  const from = src.indexOf('document: surveyRequestDocumentView({');
  assert.ok(from > 0, 'หาการเรียกบล็อกเอกสารไม่เจอ');
  const call = src.slice(from, src.indexOf('}),', from));
  /* `canIssue` = ธงของคนดูชุดที่สี่ (ผู้วางคิวออกเอกสารได้ · มติเจ้าของ 19/10/2026) — ไม่ใช่เรื่องวิธีประเมิน */
  assert.deepEqual([...call.matchAll(/^\s*(\w+)(?::|,$)/gm)].map((m) => m[1]), ['document', 'surveyDocument', 'request', 'viewer', 'canOpenSheet', 'isRequesterSide', 'canDecide', 'canIssue', 'pollStopped']);
  // ตัวตัดสินเองก็ไม่มีพารามิเตอร์ของวิธีประเมิน — คีย์ที่ไม่รู้จักไม่เปลี่ยนผล
  const input = { surveyDocument: docOf('head', 'missing'), request: { id: 'r1', status: 'answered', answeredAt: SENT.answeredAt }, viewer: { canOpenSheet: true, canDecide: true } };
  assert.deepEqual(surveyRequestDocumentView({ ...input, hasDrawing: true }), surveyRequestDocumentView(input));
});

/* ══ พื้นที่ที่เปิดเอง (§2.5 m) ═════════════════════════════════════════════════════════════ */

test('surveyDefaultZoneId · drawingEditable=false (ผู้วางคิว): พื้นที่จากแบบไม่ถูกเลือกเป็นงานถัดไป แต่ยังเป็นทางถอยได้', () => {
  const done = { parts: [{ id: 'p', widthM: 4, lengthM: 4, heightM: 3 }], spots: [{ id: 's', label: 'จุด' }] };
  const fullFiles = (id) => [file(`${id}-w`, 'survey_wide'), file(`${id}-p`, 'survey_plan'), { ...file(`${id}-s`, 'survey_spot'), metadata: { spotId: 's' } }];
  // ใบผสม: พื้นที่ 1 จากแบบ (ยังขาด) · พื้นที่ 2 ลงหน้างาน (ยังขาด) · พื้นที่ 3 ลงหน้างาน (ครบ)
  const rows = [
    { id: 'a', zoneName: 'A', status: 'ok', parts: [], spots: [], ...DRAWING },
    { id: 'b', zoneName: 'B', status: 'ok', parts: [], spots: [] },
    { id: 'c', zoneName: 'C', status: 'ok', ...done },
  ];
  const files = { c: fullFiles('c') };
  assert.equal(surveyDefaultZoneId(rows, files, { editable: true }), 'a', 'หัวหน้า: พื้นที่จากแบบที่ยังขาดคืองานของเขา (ผลเดิม)');
  assert.equal(surveyDefaultZoneId(rows, files, { editable: true, drawingEditable: true }), 'a');
  assert.equal(surveyDefaultZoneId(rows, files, { editable: true, drawingEditable: false }), 'b', 'ผู้วางคิว: ข้ามพื้นที่จากแบบไปพื้นที่ลงหน้างานที่ยังขาด');

  // พื้นที่ลงหน้างานครบหมด ⇒ ทางถอย = พื้นที่แรกที่ยังอยู่ในใบ (เป็นพื้นที่จากแบบได้ — เปิดอ่านได้)
  const allDone = [rows[0], { ...rows[1], ...done }, rows[2]];
  const doneFiles = { b: fullFiles('b'), c: fullFiles('c') };
  assert.equal(surveyDefaultZoneId(allDone, doneFiles, { editable: true, drawingEditable: false }), 'a');
  // จากแบบทั้งใบ ⇒ พื้นที่แรก
  const allDrawing = rows.map((z) => ({ ...z, ...DRAWING }));
  assert.equal(surveyDefaultZoneId(allDrawing, files, { editable: true, drawingEditable: false }), 'a');
  // พื้นที่แรกถูกตัด ⇒ ทางถอยข้ามมัน
  const firstCut = allDrawing.map((z, i) => (i === 0 ? { ...z, status: 'cut' } : z));
  assert.equal(surveyDefaultZoneId(firstCut, files, { editable: true, drawingEditable: false }), 'b');
});

test('surveyDefaultZoneId · ใบที่ไม่มีพื้นที่จากแบบ: drawingEditable ไม่มีผล (ทุกค่าได้ id เดิม) · จอช่างยังซ่อนพื้นที่จากแบบตามเดิม', () => {
  const rows = [
    { id: 'a', zoneName: 'A', status: 'cut', parts: [], spots: [] },
    { id: 'b', zoneName: 'B', status: 'ok', parts: [{ id: 'p', widthM: 4, lengthM: 4, heightM: 3 }], spots: [] },
    { id: 'c', zoneName: 'C', status: 'ok', parts: [], spots: [] },
  ];
  for (const editable of [true, false]) {
    const today = surveyDefaultZoneId(rows, {}, { editable });
    for (const drawingEditable of [true, false, undefined]) {
      assert.equal(surveyDefaultZoneId(rows, {}, { editable, drawingEditable }), today, `${editable}/${drawingEditable}`);
    }
  }
  assert.equal(surveyDefaultZoneId([], {}, { editable: true, drawingEditable: false }), null);
  const mixed = [{ id: 'a', zoneName: 'A', status: 'ok', parts: [], spots: [], ...DRAWING }, rows[2]];
  assert.equal(surveyDefaultZoneId(mixed, {}, { editable: true, hideDrawing: true }), 'c');
  assert.equal(surveyDefaultZoneId(mixed, {}, { editable: true, hideDrawing: true, drawingEditable: false }), 'c');
  // ไม่ได้แก้ (คนดูอย่างเดียว) = พื้นที่แรกที่ยังอยู่ในใบ ไม่ว่าเป็นวิธีไหน
  assert.equal(surveyDefaultZoneId(mixed, {}, { editable: false, drawingEditable: false }), 'a');
});
