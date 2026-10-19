// ── ประเมินจากแบบ — ฝั่งกระดาษ: งวด S1 (แผน survey-desk-assessment §2 แถว 30–32) + งวด S3 (ถอดข้อกันเอกสาร) ─────────────
//
// ⭐ ล็อกเก้าเรื่อง — พิสูจน์ด้วยของปลอมล้วน:
//   ① รูปที่กระดาษพิมพ์ของพื้นที่จากแบบ = ภาพแบบรูปเดียว (JPG/PNG ล่าสุด — ชุดเดียวกับด่านส่งผล · งวด S3 §2.4) —
//      ภาพกว้าง/รูปจุดที่ค้างบนแถวไม่ถูกดึง ไม่ถูกนับ ไม่ขวาง
//   ② ใบที่มีพื้นที่จากแบบ **ออกเอกสารได้** (งวด S3 ถอดข้อกันเอกสารของงวด S1) — ไม่มีเหตุข้อไหนพกคีย์ `hold`
//      · ใบที่ส่งผลแล้วต้องมีคำตอบ "ต้องยืนยันหน้างานไหม" (ไม่ถามในรอบตรวจก่อนส่ง)
//   ③ ใบจากแบบล้วนไม่ถูกถามหานัด · ใบผสมและใบที่ไม่เหลือพื้นที่ยังถูกถามเหมือนเดิม (บรรทัดไม่พบนัดมีหางเมื่อสวิตช์เปิด)
//   ④ ตัวโหลด: ใบจากแบบล้วนไม่มีนัดให้รับรอง — ทั้งนัดในฐานและนัดที่ผู้เรียกส่งมา (นัดพวกนั้นไปอยู่ `otherVisits`)
//   ⑤ รอบตรวจก่อนส่งผล: นัดที่ยังเปิดบนใบจากแบบล้วน = ประโยคของ `surveySendVisitStep`
//   ⑥ ปุ่ม "ออกเอกสาร": ใบจากแบบที่ครบออกได้ · เหตุของระบบ = ชวนกดซ้ำ · เหตุของเนื้อใบ = ชวนดึงผลกลับ (กติกาเดียวกับใบลงหน้างาน)
//   ⑦ `document.issue.blockers` ของจอ: มีแค่ `kind` กับ `text` (ไม่มีคีย์ `hold` อีกแล้ว)
//   ⑧ ฉบับร่างของ route เอกสาร: นัดที่ค้างบนใบจากแบบล้วนไม่ถูกพิมพ์เป็นผู้ประเมิน
//   ⑨ สคริปต์ตรวจของจริง (`check-survey-report-inputs.mjs`) ถามตัวตัดสินนัดด้วย `needsVisit` ตัวเดียวกับ route ส่งผล
//
// 🔴 **ใบลงหน้างานล้วนต้องได้ผลเท่าเดิมทุกตัวอักษร** — แถวเก่าไม่มีคีย์ `method` เลย · ทุกหมวดมีเคสคุมคู่กัน
//
// ⚠️ ไฟล์นี้เรียก handler ตัวจริงของ route เอกสาร ⇒ ต้องถอดตัวอ่านผู้ใช้กับ client จริงออกก่อน (`crew/routeTestKit.mjs`)
//   และ **ทุกโมดูลของแอปโหลดด้วย `await import()` หลัง hook ลงทะเบียนแล้ว** — import แบบ static ถูก resolve ก่อน hook
//   (ท่าเดียวกับ `surveyDocumentRoute.test.mjs`) · ไม่มีอะไรแตะของจริง (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fakeDb } from './crew/routeTestKit.mjs';

const { GET } = await import('../../app/api/service/surveys/[id]/document/route.js');
const { ROLE_LABELS } = await import('../permissions.js');
const { SURVEY_REPORT_STANDARD_KEY, loadSurveyReportInputs, surveyReportPrecheck } = await import('./surveyReportInputs.js');
const { SURVEY_GATES } = await import('./survey.js');
const { issueSurveyReport } = await import('./surveyReportIssue.js');
const { surveyDocumentSummary } = await import('./surveyReportRows.js');
const SNAPSHOT = await import('./surveyReportSnapshot.js');
const {
  SURVEY_REPORT_CONFIRM_MISSING, SURVEY_REPORT_NO_VISIT, SURVEY_REPORT_NO_VISIT_TAIL, buildSurveyReportSnapshot,
  surveyReportFreezeBlockers, surveyReportFreezeIssues, surveyReportImageFiles,
} = SNAPSHOT;
const { TEST_COMPANY, surveyReportInputsFromFixture, syntheticSurveyFixture } = await import('./surveyReportTestKit.mjs');
const { surveySendDocumentRefusal } = await import('./surveySendClose.js');
const { SPOT_TRAY_LABEL } = await import('./surveySpotPhotos.js');
const { checkSurveyReportInputs, readOnlyClient } = await import('../../../scripts/check-survey-report-inputs.mjs');

/* ── ข้อความตรงตัว (ลอกจากแผน/สเปก S3 — เปลี่ยนคำในโค้ดเมื่อไร เทสต์นี้ต้องแดง) ─────────────────────────── */
/* ประโยคของข้อกันเอกสารที่งวด S3 ถอดออก — เก็บไว้ยืนยันว่าไม่มีที่ไหนพูดมันอีก */
const OLD_HOLD = 'เอกสารประเมินของใบที่ประเมินจากแบบยังออกไม่ได้ — ระบบกำลังปรับแบบเอกสาร';
const NO_VISIT = 'ไม่พบนัดประเมินพื้นที่ของใบนี้';
const NO_VISIT_TAIL = ' — พื้นที่ที่ไม่ได้ลงหน้างานให้เปลี่ยนเป็น “ประเมินจากแบบ”';
const CONFIRM_MISSING = 'ยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม';
const NO_DRAWING = (name) => `${name}: ยังไม่มีภาพแบบของพื้นที่ (ต้องเป็นรูป JPG/PNG — ไฟล์ PDF/TIFF ลงเอกสารไม่ได้)`;
const NO_FORM = 'ไม่พบมาตรฐานเอกสารของรายงานการประเมินพื้นที่';
const deskBlock = (code) => `ใบนี้ประเมินจากแบบทั้งใบ แต่นัด ${code} ยังเปิดอยู่ — กด “เปลี่ยนวิธีประเมิน” แล้วยืนยันยกเลิกนัดก่อนส่งผล (ระบบจะไม่ปิดนัดที่ยังไม่มีใครไปเป็น “เข้าแล้ว” ให้)`;

const NOW = '2026-10-01T04:00:00.000Z';
const TODAY = '2026-10-01';
const HEAD = Object.freeze({ id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] });

/* ── ของตั้งต้น: แฝดสังเคราะห์ของ RQ-AS-26090186 (สองพื้นที่ · รูปครบ · นัด `done` หนึ่งใบ) ────────────── */

/**
 * อินพุตของตัวสร้างภาพนิ่ง โดยตั้งวิธีประเมินรายพื้นที่ตามลำดับ
 * @param methods `['drawing', 'onsite']` — ตำแหน่งที่เป็น `undefined` = **ไม่มีคีย์ `method` เลย** (แถวก่อน mig 0408)
 * ⭐ ใบที่มีพื้นที่ `'drawing'` ได้คำตอบ "ไม่ต้องยืนยันหน้างาน" บนคำร้อง (ใบที่ส่งผลผ่านด่าน S2a มาแล้วมีเสมอ — งวด S3 §2.3 ข้อ 2)
 *    ใบลงหน้างานไม่มีคีย์นี้ (เหมือนแถวของวันนี้)
 */
function twin(methods = [], opts) {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture(), opts);
  inputs.zones.forEach((zone, i) => { if (methods[i] !== undefined) zone.method = methods[i]; });
  if (methods.includes('drawing')) inputs.request.surveyConfirm = 'not_needed';
  return inputs;
}
const ALL_DRAWING = ['drawing', 'drawing'];
const MIXED = ['drawing', 'onsite'];

/* แก้ไฟล์ของพื้นที่หนึ่งในอินพุต — `edit(file)` คืนไฟล์ใหม่ */
const editFiles = (inputs, zoneId, edit) => { inputs.filesByZone[zoneId] = inputs.filesByZone[zoneId].map(edit); };
const asHeic = (docType, fileName) => (file) => (file.docType === docType ? { ...file, fileName, mimeType: 'image/heic' } : file);
const texts = (issues) => issues.map((issue) => issue.text);

const visitRow = (id, status, extra = {}) => ({
  id, requestId: 'DR-synthetic-0001', code: `SV-${id}`, status, createdAt: '2026-09-24T02:00:00.000+00:00',
  scheduledDate: '2026-09-25', startTime: '12:00', endTime: null,
  actualDate: status === 'done' ? '2026-09-25' : null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
  assigneeId: 'U-lead', assigneeName: 'Lead Assessor', assistantIds: [], unableReason: null, ...extra,
});

/**
 * ฐานปลอมจากอินพุตชุดเดียวกัน — แถวของแต่ละตารางตามรูปที่ฐานเก็บ (ทรงเดียวกับ `makeWorld` ของเทสต์ route เอกสาร)
 * @param opts.visits   แถวนัดของใบ — ไม่ส่ง = นัด `done` ของแฝดสังเคราะห์ใบเดียว
 * @param opts.request  ทับช่องของแถวคำร้อง · @param opts.hook `(q) => { data, error } | undefined` แทนคำตอบของคำสั่งนั้น
 */
function worldFrom(source, { visits = null, request = {}, hook = null } = {}) {
  const row = {
    ...source.request, dept: 'TS', requestedById: 'U-ae', siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1', ...request,
  };
  const db = fakeDb({
    dept_requests: [row],
    service_survey_reports: [],
    // ฐานไม่มีคอลัมน์ `zoneCode` บนแถวผลวัด — รหัสอ่านสดจากทะเบียน
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...zone }) => ({ ...zone, requestId: row.id })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id }))),
    service_zones: source.zoneRegistry.map((z) => ({ ...z })),
    service_sites: [{ id: 'SITE-1', ...source.site }],
    customers: [{ id: 'CUS-1', name: source.customer.name, nameEn: null, arCode: source.customer.arCode }],
    sales_deals: [{ id: 'DEAL-1', code: source.deal.code }],
    service_visits: visits || [visitRow('done', 'done', { code: source.visit.code })],
    entity_updates: source.history.map((h, i) => ({ id: `EUP-old-${i}`, ...h, entityType: 'dept_request', entityId: row.id })),
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    organization_setting_versions: [{
      organizationId: 'primary', status: 'published', legalNameTh: TEST_COMPANY.name, legalNameEn: 'Scent and Sense',
      taxId: TEST_COMPANY.taxId, branchCode: '00000', registeredAddressTh: TEST_COMPANY.address, registeredAddressEn: null,
      phone: TEST_COMPANY.tel, email: null, lineId: TEST_COMPANY.line, website: TEST_COMPANY.website,
    }],
    document_standard_versions: [
      { documentKey: SURVEY_REPORT_STANDARD_KEY, status: 'published', versionNumber: 1, formCode: 'FM-TS-01', revision: '00', effectiveDate: '2026-09-29', titleEn: 'SITE SURVEY REPORT' },
    ],
  }, {
    users: { 'U-lead': { email: 'lead@example.test', app_metadata: { role: 'ts_senior' }, user_metadata: { name: 'Lead Assessor' } } },
    hook,
  });
  return { db, source, request: db.tables.dept_requests[0] };
}

const UNSENT = Object.freeze({ status: 'in_progress', answeredAt: null, answeredById: null, answeredByName: null, surveyConfirm: null });
/* คำสั่งอ่านเธรดของนัด / บัญชีของคนบนนัด — ใบที่ไม่มีนัดให้รับรองต้องไม่ยิงสักตัว */
const threadReads = (db) => db.calls.filter((q) => q.table === 'entity_updates'
  && q.filters.some(([, col, val]) => col === 'entityType' && val === 'service_visit'));

function deepKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.add(k); deepKeys(v, out); }
  }
  return out;
}

/* log ของเหตุที่ตั้งใจให้เกิด (ขั้นออกเลขลง log ทุกครั้งที่ไม่ออก) ไม่พิมพ์ลงผลเทสต์ */
test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
});

/* ══ 1. รูปที่กระดาษพิมพ์ของพื้นที่จากแบบ ═══════════════════════════════════════════════════ */

test('ค่าคงที่ตรงกับสเปกทุกตัวอักษร · งวด S3 ถอดค่าคงที่ของข้อกันเอกสารออกจากโมดูลแล้ว', () => {
  assert.equal(SURVEY_REPORT_NO_VISIT, NO_VISIT);
  assert.equal(SURVEY_REPORT_NO_VISIT_TAIL, NO_VISIT_TAIL);
  assert.equal(SURVEY_REPORT_CONFIRM_MISSING, CONFIRM_MISSING);
  assert.equal('SURVEY_REPORT_DRAWING_HOLD' in SNAPSHOT, false);
  assert.equal(Object.values(SNAPSHOT).includes(OLD_HOLD), false);
});

test('⭐ รูปที่กระดาษพิมพ์: พื้นที่จากแบบได้ภาพแบบรูปเดียว — ภาพกว้างกับรูปจุดที่ค้างบนแถวไม่ถูกดึง · พื้นที่ลงหน้างานเท่าเดิม', () => {
  const pick = (inputs) => surveyReportImageFiles(inputs).map((f) => `${f.zoneId}:${f.kind}:${f.attId}`);
  const today = [
    'SVZ-syn-1:wide:att-z1-w1', 'SVZ-syn-1:wide:att-z1-w2', 'SVZ-syn-1:plan:att-z1-p1', 'SVZ-syn-1:spot:att-z1-s1',
    'SVZ-syn-2:wide:att-z2-w1', 'SVZ-syn-2:plan:att-z2-p1', 'SVZ-syn-2:spot:att-z2-s1', 'SVZ-syn-2:spot:att-z2-s2',
  ];
  assert.deepEqual(pick(twin()), today, 'แถวที่ไม่มีคีย์ method');
  assert.deepEqual(pick(twin(['onsite', 'onsite'])), today);
  assert.deepEqual(pick(twin([null, null])), today);

  assert.deepEqual(pick(twin(MIXED)), ['SVZ-syn-1:plan:att-z1-p1', ...today.slice(4)]);
  assert.deepEqual(pick(twin(ALL_DRAWING)), ['SVZ-syn-1:plan:att-z1-p1', 'SVZ-syn-2:plan:att-z2-p1']);
});

test('ภาพนิ่งโหมดร่างของพื้นที่จากแบบ: ไม่มีภาพกว้าง · จุดอยู่ครบตามลำดับแต่ไม่พกรูป · ภาพแบบรูปเดียว', () => {
  const { snapshot } = buildSurveyReportSnapshot(twin(MIXED), { mode: 'draft' });
  const [z1, z2] = snapshot.zones;
  assert.deepEqual(z1.wide, []);
  assert.deepEqual(z1.plan.map((img) => img.attId), ['att-z1-p1']);
  assert.deepEqual(z1.spots.map((s) => [s.no, s.label, s.selected, s.photos]), [['1.1', 'ห้องที่ 1', true, []]]);
  // พื้นที่ลงหน้างานในใบเดียวกันไม่ถูกแตะ
  assert.deepEqual(z2.wide.map((img) => img.attId), ['att-z2-w1']);
  assert.deepEqual(z2.spots.map((s) => s.photos.map((img) => img.attId)), [['att-z2-s1'], ['att-z2-s2']]);
  // รูปร่างของภาพนิ่งเท่ากันทุกพื้นที่ — งวด S3 เพิ่มคีย์วิธีประเมินให้ทุกพื้นที่ (ลงหน้างานก็มี)
  assert.deepEqual(Object.keys(z1), Object.keys(z2));
  assert.deepEqual([z1.method, z2.method], ['drawing', 'onsite']);
});

test('🔴 รูปจุดที่ยังไม่ผูก + ภาพกว้าง HEIC: พื้นที่ลงหน้างานได้สองข้อของวันนี้ · พื้นที่จากแบบไม่ได้สักข้อ', () => {
  const build = (methods) => {
    const inputs = twin(methods, { spotLinks: null });
    editFiles(inputs, 'SVZ-syn-1', asHeic('survey_wide', 'IMG_0001.HEIC'));
    return inputs;
  };
  const unlinked = (n) => `รูปจุดติดตั้ง ${n} รูปยังไม่ได้ผูกจุด — ผูกในถาด "${SPOT_TRAY_LABEL}" ก่อน`;
  const heic = 'รูป 2 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (IMG_0001.HEIC · IMG_0001.HEIC)';

  const onsite = [{ kind: 'content', text: unlinked(3) }, { kind: 'content', text: heic }];
  assert.deepEqual(surveyReportFreezeIssues(build()), onsite);
  assert.deepEqual(surveyReportFreezeIssues(build(['onsite', 'onsite'])), onsite);

  // พื้นที่ 1 จากแบบ: รูปจุด 1 รูปกับภาพกว้าง HEIC 2 รูปของมันไม่ถูกนับ — เหลือรูปจุด 2 รูปของพื้นที่ 2
  assert.deepEqual(surveyReportFreezeIssues(build(MIXED)), [{ kind: 'content', text: unlinked(2) }]);
  assert.deepEqual(surveyReportFreezeIssues(build(ALL_DRAWING)), []);
});

/* ── ไฟล์ภาพแบบของพื้นที่จากแบบ (งวด S3 §2.4 — ด่านส่งผลกับกระดาษใช้ไฟล์ชุดเดียวกัน) ──────────────────────
   แต่ละแถว = ไฟล์หมวดผังของพื้นที่ 2 ("ห้องที่2") · `drawing` / `onsite` = ผลเมื่อพื้นที่นั้นเป็นจากแบบ / ลงหน้างาน
   🔴 คอลัมน์ `onsite` คือของวันนี้ทุกตัวอักษร (กิ่งลงหน้างานของ `zoneFiles` และข้อภาพผังไม่ถูกแตะในงวด S3) — เคสคุม */
const PLAN_OLD = '2026-09-26T01:00:00+00:00';
const PLAN_NEW = '2026-09-26T05:00:00+00:00';
const planFile = (id, mimeType, createdAt, fileName = `${id}.jpg`) => ({ id, docType: 'survey_plan', fileName, mimeType, createdAt, metadata: {} });
const ROOM2 = 'ห้องที่2';
const HEIC_LINE = 'รูป 1 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (plan.heic)';
const PLAN_CASES = [
  {
    name: 'JPG เก่า + TIFF ใหม่',
    files: [planFile('P-jpg', 'image/jpeg', PLAN_OLD), planFile('P-tif', 'image/tiff', PLAN_NEW, 'scan.tif')],
    drawing: { plan: 'P-jpg', issues: [], warns: [`${ROOM2}: ไฟล์ scan.tif ไม่ใช่ JPG/PNG — ไม่ลงเอกสาร`] },
    onsite: { plan: 'P-tif', issues: [], warns: [`${ROOM2}: มีภาพผัง 2 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว`] },
  },
  {
    name: 'TIFF อย่างเดียว',
    files: [planFile('P-tif', 'image/tiff', PLAN_NEW, 'scan.tif')],
    drawing: { plan: null, issues: [NO_DRAWING(ROOM2)], warns: [NO_DRAWING(ROOM2), `${ROOM2}: ไฟล์ scan.tif ไม่ใช่ JPG/PNG — ไม่ลงเอกสาร`] },
    onsite: { plan: 'P-tif', issues: [], warns: [] },
  },
  {
    name: 'HEIC อย่างเดียว',
    files: [planFile('P-heic', 'image/heic', PLAN_NEW, 'plan.heic')],
    drawing: { plan: null, issues: [NO_DRAWING(ROOM2)], warns: [NO_DRAWING(ROOM2), `${ROOM2}: ไฟล์ plan.heic ไม่ใช่ JPG/PNG — ไม่ลงเอกสาร`] },
    onsite: { plan: null, issues: [HEIC_LINE], warns: [HEIC_LINE] },
  },
  {
    name: 'PDF อย่างเดียว',
    files: [planFile('P-pdf', 'application/pdf', PLAN_NEW, 'plan.pdf')],
    drawing: { plan: null, issues: [NO_DRAWING(ROOM2)], warns: [NO_DRAWING(ROOM2), `${ROOM2}: ไฟล์ plan.pdf ไม่ใช่ JPG/PNG — ไม่ลงเอกสาร`] },
    onsite: {
      plan: null,
      issues: [`${ROOM2}: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)`],
      warns: [`${ROOM2}: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)`, `${ROOM2}: ไฟล์ plan.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`],
    },
  },
  {
    name: 'JPG สองรูป',
    files: [planFile('P-a', 'image/jpeg', PLAN_OLD), planFile('P-b', 'image/jpeg', PLAN_NEW)],
    drawing: { plan: 'P-b', issues: [], warns: [`${ROOM2}: มีภาพแบบ 2 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว`] },
    onsite: { plan: 'P-b', issues: [], warns: [`${ROOM2}: มีภาพผัง 2 รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว`] },
  },
];

test('⭐ งวด S3 §2.4 ไฟล์ภาพแบบ: JPG/PNG ล่าสุดเท่านั้น · ไม่มี = บรรทัด "ยังไม่มีภาพแบบ" (ไม่มีบรรทัด HEIC) · ลงหน้างานเท่าวันนี้', () => {
  const planGate = SURVEY_GATES.find((gate) => gate.key === 'plan');
  for (const row of PLAN_CASES) {
    for (const method of ['drawing', 'onsite']) {
      const want = row[method];
      const label = `${row.name} · ${method}`;
      const inputs = twin([undefined, method]);
      const zone = inputs.zones[1];
      inputs.filesByZone[zone.id] = [...inputs.filesByZone[zone.id].filter((f) => f.docType !== 'survey_plan'), ...row.files];

      const issues = surveyReportFreezeIssues(inputs);
      assert.deepEqual(issues, want.issues.map((text) => ({ kind: 'content', text })), label);
      assert.deepEqual(
        surveyReportImageFiles(inputs).filter((f) => f.zoneId === zone.id && f.kind === 'plan').map((f) => f.attId),
        want.plan ? [want.plan] : [], `${label}: รูปที่กระดาษพิมพ์`,
      );
      assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'draft' }).warnings, want.warns, `${label}: คำเตือน`);
      if (method === 'drawing') {
        // 🔑 ด่านส่งผลกับกระดาษตอบตรงกัน — ด่านผ่าน ⇔ เหตุที่ตรึงไม่ได้ไม่มีบรรทัดภาพแบบ
        const gateOk = planGate.missing(zone, inputs.filesByZone[zone.id]) === null;
        assert.equal(gateOk, !issues.some((issue) => issue.text === NO_DRAWING(ROOM2)), `${label}: ด่าน ⇔ กระดาษ`);
        assert.equal(issues.some((issue) => issue.text.includes('HEIC')), false, `${label}: พื้นที่จากแบบไม่มีบรรทัด HEIC`);
      }
    }
  }
});

test('คำเตือน "ไม่ใช่รูป — ไม่ลงเอกสาร" ของพื้นที่จากแบบ: เฉพาะไฟล์หมวดภาพแบบ — PDF ในหมวดภาพกว้าง/รูปจุดไม่ถูกเอ่ย', () => {
  const build = (methods) => {
    const inputs = twin(methods);
    inputs.filesByZone['SVZ-syn-1'].push(
      { id: 'att-x-w', docType: 'survey_wide', fileName: 'wide.pdf', mimeType: 'application/pdf', createdAt: '2026-09-26T03:00:00+00:00', metadata: {} },
      { id: 'att-x-s', docType: 'survey_spot', fileName: 'spot.pdf', mimeType: 'application/pdf', createdAt: '2026-09-26T03:00:01+00:00', metadata: {} },
      { id: 'att-x-p', docType: 'survey_plan', fileName: 'old-plan.pdf', mimeType: 'application/pdf', createdAt: '2026-09-26T01:00:00+00:00', metadata: {} },
    );
    return buildSurveyReportSnapshot(inputs, { mode: 'draft' }).warnings.filter((line) => line.endsWith('— ไม่ลงเอกสาร'));
  };
  const name = 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส';
  assert.deepEqual(build(), [
    `${name}: ไฟล์ wide.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`,
    `${name}: ไฟล์ spot.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`,
    `${name}: ไฟล์ old-plan.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`,
  ], 'พื้นที่ลงหน้างาน: เท่าวันนี้');
  // พื้นที่จากแบบ: ประโยคของงวด S3 §2.4 ("ไม่ใช่ JPG/PNG") เฉพาะไฟล์หมวดภาพแบบ
  assert.deepEqual(build(MIXED), [`${name}: ไฟล์ old-plan.pdf ไม่ใช่ JPG/PNG — ไม่ลงเอกสาร`]);
});

/* ══ 2. เหตุที่ตรึงไม่ได้: การกันเอกสาร + ข้อของนัด ═══════════════════════════════════════════ */

/* ใบลงหน้างานที่ติดหลายข้อ — ลิสต์ที่ตรึงไว้คือของวันนี้ (ก่อนมีวิธีประเมิน) */
function brokenOnsite(methods) {
  const inputs = twin(methods, { spotLinks: null });
  inputs.takenAt = null;
  inputs.visit = null;
  inputs.form = null;
  return inputs;
}
const BROKEN_TODAY = [
  { kind: 'system', text: 'ไม่มีจุดเวลาของภาพนิ่ง' },
  { kind: 'content', text: NO_VISIT },
  { kind: 'system', text: NO_FORM },
  { kind: 'content', text: `รูปจุดติดตั้ง 3 รูปยังไม่ได้ผูกจุด — ผูกในถาด "${SPOT_TRAY_LABEL}" ก่อน` },
];

test('🔴 ใบลงหน้างานล้วน: เหตุที่ตรึงไม่ได้เท่าเดิมทุกข้อทุกลำดับ — ไม่มีคีย์ method · `onsite` · null · ค่าแปลก ได้ลิสต์เดียวกัน', () => {
  for (const methods of [[], ['onsite', 'onsite'], [null, null], ['Drawing', '']]) {
    assert.deepEqual(surveyReportFreezeIssues(brokenOnsite(methods)), BROKEN_TODAY, JSON.stringify(methods));
  }
  for (const methods of [[], ['onsite', 'onsite'], [null, null]]) {
    assert.deepEqual(surveyReportFreezeIssues(twin(methods)), [], JSON.stringify(methods));
    assert.equal(buildSurveyReportSnapshot(twin(methods), { mode: 'freeze' }).errors, undefined);
  }
  // ไม่มีข้อไหนของใบลงหน้างานพกคีย์ `hold`
  assert.equal(deepKeys(surveyReportFreezeIssues(brokenOnsite())).has('hold'), false);
});

test('⭐ งวด S3: มีพื้นที่จากแบบแม้พื้นที่เดียว ไม่มีข้อกันเอกสารอีกแล้ว — ลิสต์ของใบผสมคือลิสต์ของวันนี้ ลบเฉพาะของที่พื้นที่จากแบบไม่มี', () => {
  const mixed = surveyReportFreezeIssues(brokenOnsite(MIXED));
  assert.deepEqual(mixed, [
    BROKEN_TODAY[0],
    BROKEN_TODAY[1],
    BROKEN_TODAY[2],
    { kind: 'content', text: `รูปจุดติดตั้ง 2 รูปยังไม่ได้ผูกจุด — ผูกในถาด "${SPOT_TRAY_LABEL}" ก่อน` },
  ]);
  assert.equal(deepKeys(mixed).has('hold'), false);
  assert.equal(mixed.some((issue) => issue.text === OLD_HOLD), false);

  const wrongKind = brokenOnsite(MIXED);
  wrongKind.request.kind = 'costing';
  assert.deepEqual(surveyReportFreezeIssues(wrongKind).slice(0, 2), [
    { kind: 'system', text: 'ใบนี้ไม่ใช่คำร้องประเมินพื้นที่' }, BROKEN_TODAY[0],
  ]);
});

test('พื้นที่จากแบบที่ถูกตัดไม่นับ — ใบที่เหลือแต่พื้นที่ลงหน้างานเดินเหมือนใบลงหน้างาน', () => {
  const inputs = twin(MIXED);
  inputs.zones[0].status = 'cut';
  assert.deepEqual(surveyReportFreezeIssues(inputs), []);
});

test('⭐ ใบจากแบบล้วน: ไม่ถูกถามหานัด ไม่ถูกถามวันประเมิน/ผู้ประเมินของนัด — ตรึงได้ (ไม่เหลือข้อไหน)', () => {
  const noVisit = twin(ALL_DRAWING);
  noVisit.visit = null;
  assert.deepEqual(surveyReportFreezeIssues(noVisit), []);
  // สวิตช์เปิดก็ไม่มีบรรทัดไม่พบนัด (ใบนี้ไม่ต้องมีนัด)
  assert.deepEqual(surveyReportFreezeIssues({ ...noVisit, drawingMethodEnabled: true }), []);

  // นัดที่หลุดเข้ามา (ตัวโหลดไม่ส่ง แต่ผู้เรียกอื่นส่งได้) ก็ไม่ถูกตรวจ
  const stray = twin(ALL_DRAWING);
  stray.visit = { code: 'SV-X', status: 'scheduled', scheduledDate: null, actualDate: null, assigneeName: null };
  assert.deepEqual(surveyReportFreezeIssues(stray), []);

  // ใบลงหน้างานที่นัดเดียวกันนี้ได้สองข้อของวันนี้
  const onsite = twin();
  onsite.visit = { ...stray.visit };
  assert.deepEqual(surveyReportFreezeIssues(onsite), [
    { kind: 'content', text: 'นัดประเมินไม่มีวันที่ประเมิน' },
    { kind: 'content', text: 'นัดประเมินไม่มีชื่อผู้ประเมิน' },
  ]);
});

test('🔴 ใบผสมที่ไม่มีนัด: ยังได้ "ไม่พบนัดประเมิน" (content) — หางเฉพาะสวิตช์เปิด · ใบที่ไม่เหลือพื้นที่ยังถูกถามหานัดเหมือนเดิม', () => {
  const mixed = twin(MIXED);
  mixed.visit = null;
  assert.deepEqual(surveyReportFreezeIssues(mixed), [{ kind: 'content', text: NO_VISIT }]);
  assert.deepEqual(surveyReportFreezeIssues({ ...mixed, drawingMethodEnabled: true }), [{ kind: 'content', text: NO_VISIT + NO_VISIT_TAIL }]);

  // ตัดหมดทั้งใบ — ไม่ว่าแถวที่ตัดเป็นวิธีไหน โหมดคือ "ไม่เหลือพื้นที่" ไม่ใช่งานโต๊ะ
  for (const methods of [[], ALL_DRAWING]) {
    const empty = twin(methods);
    empty.zones.forEach((zone) => { zone.status = 'cut'; });
    empty.visit = null;
    assert.deepEqual(surveyReportFreezeIssues(empty), [
      { kind: 'content', text: NO_VISIT }, { kind: 'content', text: 'ไม่มีพื้นที่ที่ประเมิน' },
    ], JSON.stringify(methods));
  }
});

test('อ่านนัดไม่สำเร็จบนใบจากแบบล้วน: ยังบอกว่า "อ่านนัดประเมินไม่สำเร็จ" (system) — ไม่กลืนชิ้นที่อ่านพลาด', () => {
  const inputs = twin(ALL_DRAWING);
  inputs.visit = null;
  inputs.unknown = ['visits'];
  assert.deepEqual(surveyReportFreezeIssues(inputs), [{ kind: 'system', text: 'อ่านนัดประเมินไม่สำเร็จ' }]);
});

test('⭐ งวด S3 ตัวสร้างภาพนิ่ง: ใบที่มีพื้นที่จากแบบตรึงได้ทั้งโหมดตรึงและโหมดตรวจ · ไม่มีประโยคของข้อกันในคำเตือน', () => {
  for (const methods of [MIXED, ALL_DRAWING]) {
    const inputs = twin(methods);
    assert.deepEqual(surveyReportFreezeBlockers(inputs), [], JSON.stringify(methods));
    for (const mode of ['freeze', 'check', 'draft']) {
      const built = buildSurveyReportSnapshot(inputs, { mode });
      assert.equal(built.errors, undefined, `${mode}: ${(built.errors || []).join(' | ')}`);
      assert.equal(built.snapshot.zones.length, 2);
      assert.equal(built.warnings.includes(OLD_HOLD), false);
    }
  }
});

/* ── ตารางของงวด S3: โหมด × นัด × คำตอบ "ต้องยืนยันหน้างานไหม" (§2.3 ข้อ 2–3) ───────────────────────────
   แต่ละแถว = `{ name, inputs, want }` · `want` = ลิสต์เหตุที่ตรึงไม่ได้ทั้งลิสต์ (ไม่ใช่แค่ว่ามีบรรทัดหนึ่ง) */
const VISIT_DONE = Object.freeze({
  code: 'SV-26090013', status: 'done', scheduledDate: '2026-09-25', actualDate: '2026-09-25', assigneeName: 'Lead Assessor',
});
function confirmCase(methods, { visit = 'done', choice = 'not_needed', pending = false, flag = false } = {}) {
  const inputs = twin(methods);
  inputs.visit = visit === 'done' ? { ...inputs.visit, ...VISIT_DONE } : null;
  inputs.request.surveyConfirm = choice;
  if (pending) inputs.answerPending = true;
  if (flag) inputs.drawingMethodEnabled = true;
  return inputs;
}
const CONFIRM_LINE = { kind: 'content', text: CONFIRM_MISSING };
const S3_FREEZE_TABLE = [
  { name: 'จากแบบล้วน · ส่งแล้ว · เลือกแล้ว · ภาพแบบ JPG', inputs: () => confirmCase(ALL_DRAWING, { visit: 'none' }), want: [] },
  { name: 'จากแบบล้วน · ไม่มีนัด · สวิตช์เปิด', inputs: () => confirmCase(ALL_DRAWING, { visit: 'none', flag: true }), want: [] },
  { name: 'ผสม · ไม่มีนัด · สวิตช์ปิด', inputs: () => confirmCase(MIXED, { visit: 'none' }), want: [{ kind: 'content', text: NO_VISIT }] },
  { name: 'ผสม · ไม่มีนัด · สวิตช์เปิด', inputs: () => confirmCase(MIXED, { visit: 'none', flag: true }), want: [{ kind: 'content', text: NO_VISIT + NO_VISIT_TAIL }] },
  { name: 'ผสม · นัด done', inputs: () => confirmCase(MIXED), want: [] },
  { name: 'ลงหน้างานล้วน · ไม่มีนัด (ใบลงหน้างานที่ไม่มีนัดยังตีกลับ)', inputs: () => confirmCase([], { visit: 'none', choice: null }), want: [{ kind: 'content', text: NO_VISIT }] },
  { name: 'ลงหน้างานล้วน · ไม่มีนัด · สวิตช์เปิด', inputs: () => confirmCase([], { visit: 'none', choice: null, flag: true }), want: [{ kind: 'content', text: NO_VISIT + NO_VISIT_TAIL }] },
  { name: 'จากแบบล้วน · ส่งแล้ว · ไม่มีคำตอบ', inputs: () => confirmCase(ALL_DRAWING, { visit: 'none', choice: null }), want: [CONFIRM_LINE] },
  { name: 'ผสม · ส่งแล้ว · คำตอบแปลก', inputs: () => confirmCase(MIXED, { choice: 'yes' }), want: [CONFIRM_LINE] },
  { name: 'จากแบบล้วน · รอบตรวจก่อนส่ง (answerPending) · ไม่มีคำตอบ', inputs: () => confirmCase(ALL_DRAWING, { visit: 'none', choice: null, pending: true }), want: [] },
  { name: 'ผสม · รอบตรวจก่อนส่ง · ไม่มีคำตอบ', inputs: () => confirmCase(MIXED, { choice: null, pending: true }), want: [] },
  { name: 'ลงหน้างานล้วน · ส่งแล้ว · ไม่มีคำตอบ', inputs: () => confirmCase([], { choice: null }), want: [] },
  { name: 'ลงหน้างานล้วน · ส่งแล้ว · คำตอบแปลก', inputs: () => confirmCase(['onsite', 'onsite'], { choice: 'yes' }), want: [] },
  {
    name: 'จากแบบล้วน · ยังไม่ส่ง (ไม่มีผู้ส่ง) · ไม่มีคำตอบ = ไม่ถามคำตอบ',
    inputs: () => {
      const inputs = confirmCase(ALL_DRAWING, { visit: 'none', choice: null });
      Object.assign(inputs.request, { answeredAt: null, answeredById: null, answeredByName: null });
      return inputs;
    },
    want: [{ kind: 'system', text: 'ยังไม่ได้ส่งผลให้ฝ่ายขาย — ยังออกเอกสารไม่ได้' }],
  },
];

test('⭐ งวด S3 ตาราง โหมด × นัด × คำตอบ: เหตุที่ตรึงไม่ได้ทั้งลิสต์ · ไม่มีข้อไหนพกคีย์ `hold` (ไล่ทุกแถว)', () => {
  for (const row of S3_FREEZE_TABLE) {
    const issues = surveyReportFreezeIssues(row.inputs());
    assert.deepEqual(issues, row.want, row.name);
    assert.equal(deepKeys(issues).has('hold'), false, row.name);
    // โหมดตรวจของตัวสร้างพูดคำเดียวกัน (ภาพนิ่งไม่ออกเมื่อมีเหตุ)
    const checked = buildSurveyReportSnapshot(row.inputs(), { mode: 'check' });
    assert.deepEqual(checked.errors, row.want.length ? row.want.map((i) => i.text) : undefined, row.name);
  }
});

/* ══ 3. ตัวโหลด: นัดที่เอกสารรับรอง ═══════════════════════════════════════════════════════ */

const load = (world, extra = {}) => loadSurveyReportInputs(world.db, { request: world.request, takenAt: NOW, ...extra });

test('⭐ ตัวโหลด: ใบจากแบบล้วนไม่มีนัดให้รับรองแม้ฐานมีนัด `done` — ไม่อ่านเธรดของนัด ไม่ถามบัญชีของคนบนนัด', async () => {
  const visits = [
    visitRow('done', 'done', { assistantIds: ['U-h1'] }),
    visitRow('unable', 'unable', { actualDate: '2026-09-20', unableReason: 'ไซต์ปิดปรับปรุง' }),
  ];
  const world = worldFrom(twin(ALL_DRAWING), { visits });
  const { inputs, unknown } = await load(world);
  assert.deepEqual(unknown, []);
  assert.equal(inputs.visit, null);
  assert.equal(inputs.visitClosedBySend, false);
  assert.deepEqual(inputs.helpers, []);
  assert.equal(inputs.assigneeRoleLabel, null);
  // นัดที่ทำไม่ได้ยังถูกเก็บ (ภาคผนวกของฉบับภายใน) — คิดจากแถวนัดเหมือนเดิม โดยไม่มีนัดที่รับรองให้ตัดออก
  assert.deepEqual(inputs.priorUnable, [{ date: '2026-09-20', reason: 'ไซต์ปิดปรับปรุง' }]);
  assert.equal(threadReads(world.db).length, 0);
  assert.equal(world.db.calls.filter((q) => q.table === 'service_visits').length, 1, 'นัดยังอ่านครั้งเดียว');
  // งวด S3: นัดที่ไม่ได้รับรองไปอยู่ภาคผนวก (ยกเว้น `unable` ที่มีแถวของตัวเอง) · ไม่มีเหตุของนัด
  assert.deepEqual(inputs.otherVisits, [{ code: 'SV-done', status: 'done', date: '2026-09-25', planned: false }]);
  assert.deepEqual(surveyReportFreezeIssues(inputs), []);
});

test('🔴 ตัวโหลด: นัดที่ผู้เรียกส่งมา (`closedVisit`) ถูกทิ้งด้วยเมื่อใบเป็นจากแบบล้วน — ไม่มีผู้เรียกไหนยัดนัดเข้าใบงานโต๊ะได้', async () => {
  const closedVisit = visitRow('closing', 'done', { actualDate: '2026-10-01', assistantIds: ['U-h1'] });
  const world = worldFrom(twin(ALL_DRAWING), { visits: [visitRow('open', 'scheduled')] });
  const { inputs, unknown } = await load(world, { closedVisit });
  assert.deepEqual(unknown, []);
  assert.equal(inputs.visit, null);
  assert.equal(inputs.visitClosedBySend, false);
  assert.deepEqual(inputs.helpers, []);
  assert.equal(inputs.assigneeRoleLabel, null);

  // งวด S3: นัดที่การส่งผลนี้ปิด (ทิ้งจากการรับรอง) ยังไปอยู่ `otherVisits` เป็นนัดที่เข้าแล้ว — คู่กับนัดที่ยังนัดไว้
  assert.deepEqual(inputs.otherVisits, [
    { code: 'SV-open', status: 'scheduled', date: '2026-09-25', planned: true },
    { code: 'SV-closing', status: 'done', date: '2026-10-01', planned: false },
  ]);
  assert.deepEqual(surveyReportFreezeIssues(inputs), []);

  // ฐานมีนัด `done` + ผู้เรียกส่งนัดที่การส่งผลนี้ปิด = ทั้งสองอยู่ในภาคผนวก (เก่าก่อน) · ไม่มีนัดรับรอง ไม่มีเหตุของนัด
  const both = worldFrom(twin(ALL_DRAWING), { visits: [visitRow('done', 'done')] });
  const twoVisits = await load(both, { closedVisit });
  assert.equal(twoVisits.inputs.visit, null);
  assert.deepEqual(twoVisits.inputs.otherVisits.map((v) => [v.code, v.planned]), [['SV-done', false], ['SV-closing', false]]);
  assert.deepEqual(surveyReportFreezeIssues(twoVisits.inputs), []);

  // แถวผลวัดที่ผู้เรียกอ่านไว้แล้ว (ไม่อ่านซ้ำ) ก็ตัดสินจากชุดนั้น
  const given = worldFrom(twin(), { visits: [visitRow('open', 'scheduled')] });
  const zones = twin(ALL_DRAWING).zones;
  const viaCaller = await load(given, { closedVisit, zones });
  assert.equal(viaCaller.inputs.visit, null);
  assert.equal(given.db.calls.filter((q) => q.table === 'service_survey_zones').length, 0);
});

test('🔴 ตัวโหลด: ใบผสม · ใบลงหน้างาน · ใบที่ตัดหมด (วิธีใดก็ได้) · อ่านผลวัดไม่สำเร็จ = เลือกนัดแบบเดิม', async () => {
  const closedVisit = visitRow('closing', 'done', { actualDate: '2026-10-01' });
  const cutAll = (methods) => {
    const source = twin(methods);
    source.zones.forEach((zone) => { zone.status = 'cut'; });
    return source;
  };
  const cases = [
    ['ลงหน้างาน (ไม่มีคีย์ method)', twin()],
    ['ลงหน้างาน (onsite)', twin(['onsite', 'onsite'])],
    ['ผสม', twin(MIXED)],
    ['ตัดหมด ลงหน้างาน', cutAll()],
    ['ตัดหมด จากแบบ', cutAll(ALL_DRAWING)],
  ];
  for (const [label, source] of cases) {
    const fromDb = await load(worldFrom(source));
    assert.equal(fromDb.inputs.visit?.id, 'done', `${label}: นัด done ล่าสุด`);
    assert.equal(fromDb.inputs.assigneeRoleLabel, ROLE_LABELS.ts_senior, label);

    const world = worldFrom(source);
    const closing = await load(world, { closedVisit });
    assert.equal(closing.inputs.visit, closedVisit, `${label}: นัดที่การส่งผลนี้ปิดมาก่อน`);
    assert.equal(closing.inputs.visitClosedBySend, true, label);
    assert.equal(threadReads(world.db).length, 0, label);
  }

  // อ่านผลวัดไม่สำเร็จ = ไม่รู้ว่าเป็นงานโต๊ะไหม ⇒ ไม่ทิ้งนัด (กติกา "อ่านไม่สำเร็จ ≠ ไม่มี")
  const down = worldFrom(twin(ALL_DRAWING), {
    hook: (q) => (q.table === 'service_survey_zones' ? { data: null, error: { message: 'ฐานล่ม' } } : undefined),
  });
  const unread = await load(down);
  assert.deepEqual(unread.unknown, ['zones']);
  assert.equal(unread.inputs.visit?.id, 'done');
});

/* ══ 4. รอบตรวจก่อนส่งผล ════════════════════════════════════════════════════════════════ */

const precheck = (world, extra = {}) => surveyReportPrecheck(world.db, {
  request: world.request, user: HEAD, today: TODAY, nowIso: NOW, ...extra,
});

test('⭐ รอบตรวจ: ใบจากแบบล้วนที่ไม่มีนัดค้าง — ไม่มีเหตุ ⇒ พร้อมส่ง (ยังไม่ถามคำตอบ "ต้องยืนยันหน้างานไหม" ก่อนหัวหน้าเลือก)', async () => {
  const source = twin(ALL_DRAWING);
  const world = worldFrom(source, { visits: [], request: UNSENT });
  for (const extra of [{}, { surveyConfirm: 'needed' }, { surveyConfirm: 'not_needed' }, { drawingMethodEnabled: true }]) {
    const result = await precheck(world, { open: null, zones: source.zones, ...extra });
    assert.deepEqual(result.unknown, [], JSON.stringify(extra));
    assert.deepEqual(result.blockers, [], JSON.stringify(extra));
    assert.equal(surveySendDocumentRefusal(result.blockers), null);
    assert.ok(Array.isArray(result.warnings));
  }
});

test('⭐ รอบตรวจ: ใบจากแบบล้วน + นัด `scheduled` ที่ยังเปิด — ข้อแรกคือประโยคของ `surveySendVisitStep` (content) · นัดไม่ถูกรับรอง', async () => {
  const source = twin(ALL_DRAWING);
  const open = visitRow('open', 'scheduled', { code: 'SV-26100009' });
  const world = worldFrom(source, { visits: [open], request: UNSENT });
  const result = await precheck(world, { open, zones: source.zones });
  assert.deepEqual(result.blockers, [{ kind: 'content', text: deskBlock('SV-26100009') }]);
  assert.equal(surveySendDocumentRefusal(result.blockers), `ออกเอกสารไม่ได้ — ${deskBlock('SV-26100009')} · ยังไม่ได้ส่งผล`);
});

test('รอบตรวจ: ไม่ได้ส่งแถวผลวัดมา = เดินแบบ "ต้องมีนัด" (นัดร่างได้ประโยคเดิม · นัดที่เปิดอยู่ไม่ถูกบล็อกด้วยประโยคงานโต๊ะ)', async () => {
  const draft = visitRow('open', 'draft', { code: 'SV-26100010' });
  const drafted = await precheck(worldFrom(twin(ALL_DRAWING), { visits: [draft], request: UNSENT }), { open: draft });
  assert.equal(
    drafted.blockers[0].text,
    'นัด SV-26100010 ยังเป็นร่าง (ยังไม่ขึ้นตารางช่าง) — ปล่อยขึ้นตารางหรือยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยส่งผล',
  );

  // ตัวโหลดอ่านแถวเองแล้วยังทิ้งนัด — ผู้เรียกที่ลืมส่งแถวมาไม่ทำให้นัดถูกพิมพ์ลงใบงานโต๊ะ
  const open = visitRow('open', 'scheduled', { code: 'SV-26100011' });
  const scheduled = await precheck(worldFrom(twin(ALL_DRAWING), { visits: [open], request: UNSENT }), { open });
  assert.deepEqual(scheduled.blockers, []);
});

test('🔴 รอบตรวจ: ใบลงหน้างาน + นัด `scheduled` ที่ยังเปิด = พร้อมส่งเหมือนเดิม — มีหรือไม่มีคีย์ method ได้ผลเดียวกัน', async () => {
  const run = async (methods) => {
    const source = twin(methods);
    const open = visitRow('open', 'scheduled');
    const world = worldFrom(source, { visits: [open], request: UNSENT });
    return precheck(world, { open, zones: source.zones });
  };
  const bare = await run();
  assert.deepEqual(bare.blockers, []);
  assert.deepEqual(await run(['onsite', 'onsite']), bare);
  assert.equal(deepKeys(bare).has('hold'), false);
});

/* ══ 5. ปุ่ม "ออกเอกสาร": ประโยคของขั้นออกเลข ════════════════════════════════════════════════ */

/* ขั้นออกเลขบนฐานปลอมของไฟล์นี้ (ไม่มี RPC จริง) — ตัวเตรียมรูปโยนเสมอ: ใบที่ผ่านด่าน I3 ทุกข้อจะหยุดที่ขั้นรูป (`images_failed`)
   ⇒ "ไปถึงขั้นรูป" = ไม่มีเหตุที่ตรึงไม่ได้ · ผลเต็มเส้น (ออกเลขจริง) อยู่ใน `surveyReportIssue.test.mjs` */
const issue = (world, extra = {}) => {
  const reached = [];
  const run = issueSurveyReport(world.db, {
    requestId: world.request.id, user: HEAD, via: 'issue_only', storeAllowed: true, now: () => new Date(NOW),
    audit: async () => {},
    prepareImages: async (supabase, files) => { reached.push(...files.map((f) => f.attId)); throw new Error('หยุดที่ขั้นรูป'); },
    ...extra,
  });
  // ไฟล์ที่ไปถึงขั้นรูปติดไปกับผลแบบไม่ถูกไล่ — คีย์ของผลยังเป็นชุดของขั้นออกเลขล้วน
  return run.then((result) => Object.defineProperty(result, 'reachedImages', { value: reached, enumerable: false }));
};
const RESULT_KEYS = ['state', 'code', 'docNo', 'rev', 'reused', 'reasons', 'reason', 'retry', 'warnings'];

test('⭐ งวด S3 ออกเอกสาร: ใบจากแบบล้วนที่ส่งแล้ว เลือกแล้ว ภาพแบบเป็น JPG — ผ่านทุกด่าน (ไปถึงขั้นรูป) · ดึงแค่ภาพแบบ', async () => {
  for (const visits of [[], undefined]) {
    const world = worldFrom(twin(ALL_DRAWING), { visits });
    const result = await issue(world);
    assert.equal(result.code, 'images_failed', result.reason);
    assert.deepEqual(result.reachedImages, ['att-z1-p1', 'att-z2-p1'], 'ภาพกว้างกับรูปจุดไม่ถูกดึง');
    assert.equal('hold' in result, false);
    assert.equal(world.db.tables.service_survey_reports.length, 0);
  }
  // สวิตช์เปิดก็เหมือนกัน (ใบจากแบบล้วนไม่มีบรรทัดไม่พบนัด)
  const flagged = await issue(worldFrom(twin(ALL_DRAWING), { visits: [] }), { drawingMethodEnabled: true });
  assert.equal(flagged.code, 'images_failed', flagged.reason);

  // ใบผสมที่มีนัด `done` ก็ผ่าน
  const mixed = await issue(worldFrom(twin(MIXED)));
  assert.equal(mixed.code, 'images_failed', mixed.reason);
});

test('ออกเอกสาร: ใบที่มีพื้นที่จากแบบเดินกติกาเดียวกับใบลงหน้างาน — เหตุของระบบ = ชวนกดซ้ำ · เหตุของเนื้อใบ = ชวนดึงผลกลับ · ไม่มีคีย์ `hold`', async () => {
  const system = worldFrom(twin(ALL_DRAWING));
  system.db.tables.document_standard_versions.length = 0;
  const a = await issue(system);
  assert.deepEqual(a.reasons, [NO_FORM]);
  assert.equal(a.reason, `ออกเอกสารไม่ได้ — ${NO_FORM} · แก้แล้วกดออกเอกสารอีกครั้ง`);
  assert.equal(a.retry, true);
  assert.deepEqual(Object.keys(a), RESULT_KEYS);

  // ใบผสมที่ไม่มีนัด `done` — พื้นที่ลงหน้างานยังต้องมีนัดให้รับรอง · หางของบรรทัดตามตัวเลือกที่ route ส่งมา
  for (const [flag, line] of [[undefined, NO_VISIT], [true, NO_VISIT + NO_VISIT_TAIL]]) {
    const b = await issue(worldFrom(twin(MIXED), { visits: [] }), { drawingMethodEnabled: flag });
    assert.deepEqual(b.reasons, [line]);
    assert.equal(b.reason, `ออกเอกสารไม่ได้ — ${line} · ถ้าต้องแก้ ให้ดึงผลกลับมาแก้แล้วส่งใหม่`);
    assert.equal(b.retry, false);
    assert.deepEqual(Object.keys(b), RESULT_KEYS);
  }

  // ใบที่ส่งแล้วแต่ไม่มีคำตอบ (แถวที่ถูกแก้มือ) — เนื้อใบ: ต้องดึงผลกลับ
  const unanswered = await issue(worldFrom(twin(ALL_DRAWING), { visits: [], request: { surveyConfirm: null } }));
  assert.deepEqual(unanswered.reasons, [CONFIRM_MISSING]);
  assert.equal(unanswered.retry, false);
});

test('🔴 ออกเอกสาร: ใบลงหน้างานที่ติดเหตุของระบบ ได้ประโยคเดิมทุกตัวอักษร — ผลไม่มีคีย์ `hold`', async () => {
  for (const methods of [[], ['onsite', 'onsite']]) {
    const world = worldFrom(twin(methods));
    world.db.tables.document_standard_versions.length = 0;
    const result = await issue(world);
    assert.deepEqual({ ...result }, {
      state: 'failed', code: 'blocked', docNo: null, rev: null, reused: false,
      reasons: [NO_FORM], reason: `ออกเอกสารไม่ได้ — ${NO_FORM} · แก้แล้วกดออกเอกสารอีกครั้ง`, retry: true, warnings: [],
    }, JSON.stringify(methods));
  }
});

/* ══ 6. สรุปเอกสารของจอ (`document.issue` / `document.send`) ══════════════════════════════════ */

/* ใบที่ตอบไปนานแล้วและยังไม่มีเอกสาร = สถานะ `missing` ⇒ จอคิด `issue` */
const summary = (world, extra = {}) => surveyDocumentSummary(world.db, world.request, HEAD, {
  withChecks: true, now: new Date('2026-10-01T09:00:00.000Z'), ...extra,
});

test('⭐ งวด S3 `document.issue.blockers`: มีแค่ `kind` กับ `text` เสมอ — ธง `hold` ที่ตัวตรวจ (รุ่นใดก็ตาม) แนบมาไม่ไหลออก payload', async () => {
  const world = worldFrom(twin());
  const fake = async () => ({
    blockers: [
      { kind: 'system', hold: true, text: OLD_HOLD, inputs: { secret: 1 } },
      { kind: 'system', hold: 'yes', text: 'เหตุของระบบข้ออื่น' },
      { kind: 'content', hold: false, text: 'เหตุของเนื้อใบ' },
    ],
    warnings: [], unknown: [],
  });
  const doc = await summary(world, { precheck: fake });
  assert.equal(doc.state, 'missing');
  assert.deepEqual(doc.issue.blockers, [
    { kind: 'system', text: OLD_HOLD },
    { kind: 'system', text: 'เหตุของระบบข้ออื่น' },
    { kind: 'content', text: 'เหตุของเนื้อใบ' },
  ]);
  assert.deepEqual(doc.issue.blockers.map((b) => Object.keys(b).join()), ['kind,text', 'kind,text', 'kind,text']);
});

test('ต่อสายกับตัวตรวจจริง: ใบจากแบบล้วน/ผสมที่ครบ = ไม่มีเหตุ · ค่าสวิตช์ส่งผ่านถึงตัวตรวจ · 🔴 ไม่มีคีย์ `hold` ทุกชั้นของ payload', async () => {
  for (const methods of [ALL_DRAWING, MIXED]) {
    const drawing = await summary(worldFrom(twin(methods)));
    assert.equal(drawing.state, 'missing');
    assert.deepEqual(drawing.issue.blockers, [], JSON.stringify(methods));
    assert.equal(drawing.issue.unknown, false);
    assert.equal(deepKeys(drawing).has('hold'), false);
  }
  // ใบผสมที่ไม่มีนัด: หางของบรรทัดไม่พบนัดตามตัวเลือก (GET ใบประเมินส่งค่าสวิตช์มา)
  for (const [flag, line] of [[undefined, NO_VISIT], [false, NO_VISIT], [true, NO_VISIT + NO_VISIT_TAIL]]) {
    const doc = await summary(worldFrom(twin(MIXED), { visits: [] }), { drawingMethodEnabled: flag });
    assert.deepEqual(doc.issue.blockers, [{ kind: 'content', text: line }], String(flag));
  }
  // ตัวตรวจที่เสียบได้รับค่าสวิตช์ตรงตัว
  const seen = [];
  await summary(worldFrom(twin()), { drawingMethodEnabled: true, precheck: async (db, opts) => { seen.push(opts.drawingMethodEnabled); return { blockers: [], warnings: [], unknown: [] }; } });
  await summary(worldFrom(twin()), { precheck: async (db, opts) => { seen.push(opts.drawingMethodEnabled); return { blockers: [], warnings: [], unknown: [] }; } });
  assert.deepEqual(seen, [true, false]);

  for (const methods of [[], ['onsite', 'onsite']]) {
    const world = worldFrom(twin(methods));
    world.db.tables.document_standard_versions.length = 0;
    const onsite = await summary(world);
    assert.deepEqual(onsite.issue.blockers, [{ kind: 'system', text: NO_FORM }], JSON.stringify(methods));
    assert.equal(deepKeys(onsite).has('hold'), false, JSON.stringify(methods));
  }
});

test('`document.send` (สวิตช์ออกเอกสารตอนส่งผลเปิด): ใบจากแบบล้วนที่ยังไม่ส่งไม่มีเหตุขวางการส่งผล (ยังไม่ถามคำตอบก่อนหัวหน้าเลือก)', async (t) => {
  const before = { VERCEL_ENV: process.env.VERCEL_ENV, SURVEY_REPORT_ISSUE_AT_SEND: process.env.SURVEY_REPORT_ISSUE_AT_SEND };
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.VERCEL_ENV = 'production';
  process.env.SURVEY_REPORT_ISSUE_AT_SEND = 'on';

  const source = twin(ALL_DRAWING);
  const world = worldFrom(source, { visits: [], request: UNSENT });
  const doc = await summary(world, { zones: source.zones, open: null });
  assert.deepEqual(doc.send.blockers, []);
  assert.equal(doc.send.unknown, false);
  assert.equal(doc.issue, null);
});

/* ══ 7. ฉบับร่างของ route เอกสาร ═══════════════════════════════════════════════════════════ */

async function draft(world, query = '') {
  globalThis.__crewRouteTest = { user: HEAD, supabase: world.db };
  const id = world.request.id;
  const res = await GET(
    new Request(`http://localhost/api/service/surveys/${id}/document?draft=1&format=html${query}`),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, text: await res.text() };
}

test('⭐ ฉบับร่าง: ใบจากแบบล้วนที่มีนัด `scheduled` ค้างอยู่ — นัดนั้นไม่ถูกพิมพ์เป็นผู้ประเมิน และไม่มีอะไรถูกเขียน', async () => {
  const stray = () => [visitRow('open', 'scheduled', { code: 'SV-26100012' })];

  const desk = worldFrom(twin(ALL_DRAWING), { visits: stray(), request: UNSENT });
  for (const query of ['', '&version=internal']) {
    const res = await draft(desk, query);
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.ok(res.text.includes('ฉบับร่าง'));
    assert.ok(res.text.includes('Head Presser'), 'ผู้ตรวจสอบและอนุมัติ = หัวหน้าที่กำลังดู');
    assert.equal(res.text.includes('Lead Assessor'), false, `คนบนนัดที่ค้างต้องไม่ขึ้นกระดาษ (${query || 'ฉบับลูกค้า'})`);
    assert.equal(res.text.includes(OLD_HOLD), false);
  }
  // ฉบับลูกค้าไม่เอ่ยนัด · ฉบับภายในเอ่ยรหัสนัดได้เฉพาะในภาคผนวก "นัดของใบนี้" (งวด S3 §2.2 `otherVisits`) — ไม่ใช่ในฐานะผู้ประเมิน
  assert.equal((await draft(desk)).text.includes('SV-26100012'), false);
  assert.equal(desk.db.calls.filter((q) => q.write).length, 0);
  assert.equal(desk.db.tables.service_visits[0].status, 'scheduled', 'ดูร่างไม่ปิดและไม่ยกเลิกนัด');
  assert.equal(threadReads(desk.db).length, 0);

  // เคสคุม: ใบลงหน้างานที่นัดเดียวกันค้างอยู่ — ร่างพิมพ์คนบนนัดที่การส่งผลจะปิด (เหมือนเดิม) · รหัสนัดอยู่บนฉบับภายใน
  const onsite = worldFrom(twin(), { visits: stray(), request: UNSENT });
  const control = await draft(onsite);
  assert.equal(control.status, 200, control.text.slice(0, 200));
  assert.ok(control.text.includes('Lead Assessor'));
  assert.ok((await draft(onsite, '&version=internal')).text.includes('SV-26100012'));
  assert.equal(onsite.db.calls.filter((q) => q.write).length, 0);
});

/* ══ 8. สคริปต์ตรวจของจริง (อ่านอย่างเดียว) + ผู้เรียกตัวตัดสินนัด ═══════════════════════════════ */

test('สคริปต์ตรวจอินพุต: ใบจากแบบล้วนที่นัด `scheduled` ยังเปิด = ถูกบล็อกด้วยประโยคงานโต๊ะ (ไม่นับว่าจะปิดนัด) · ใบลงหน้างานยังปิดนัดเหมือนเดิม', async () => {
  const check = (world) => checkSurveyReportInputs(readOnlyClient(world.db), { request: world.request, now: new Date(NOW) });
  const stray = () => [visitRow('open', 'scheduled', { code: 'SV-26100013' })];

  const desk = await check(worldFrom(twin(ALL_DRAWING), { visits: stray(), request: UNSENT }));
  assert.equal(desk.error, null);
  assert.deepEqual(desk.visit, { action: 'block', code: 'SV-26100013', error: deskBlock('SV-26100013') });
  assert.deepEqual(desk.issues, { content: [deskBlock('SV-26100013')], system: [] }, 'งวด S3: ไม่มีข้อกันเอกสาร');
  assert.equal(desk.verdict.refusedByDocument, deskBlock('SV-26100013'));
  assert.equal(desk.verdict.newlyRefused, false);

  for (const methods of [[], ['onsite', 'onsite']]) {
    const onsite = await check(worldFrom(twin(methods), { visits: stray(), request: UNSENT }));
    assert.equal(onsite.error, null, JSON.stringify(methods));
    assert.deepEqual(onsite.visit, { action: 'close', code: 'SV-26100013', error: null });
    assert.deepEqual(onsite.issues, { content: [], system: [] });
    assert.deepEqual(onsite.verdict, { refusedByGates: false, refusedByDocument: null, newlyRefused: false, skipped: false });
  }
});

/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อฟังก์ชันไว้สอนคน */
const code = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('ซอร์ส: ผู้เรียก `surveySendVisitStep` สามจุดของฝั่งกระดาษส่ง `needsVisit` ที่คิดจากแถวพื้นที่ — ไม่มีจุดไหนใส่ค่าตายตัว', () => {
  const calls = (p) => [...code(p).matchAll(/surveySendVisitStep\(([^;]*)\);/g)].map((m) => m[1]);
  assert.deepEqual(calls('src/app/api/service/surveys/[id]/document/route.js'), [
    'open, { today: businessDate(nowIso), needsVisit: surveyNeedsVisit(zones) }',
  ]);
  assert.deepEqual(calls('scripts/check-survey-report-inputs.mjs'), ['open, { today, needsVisit: surveyNeedsVisit(zones) }']);
  const inputs = 'src/lib/service/surveyReportInputs.js';
  assert.deepEqual(calls(inputs), ['open, { today, needsVisit }']);
  // รอบตรวจ: ผู้เรียกไม่ได้ส่งแถวผลวัดมา = ต้องมีนัด (พฤติกรรมเดิม) — ไม่ใช่ "ไม่มีแถว = งานโต๊ะ"
  assert.match(code(inputs), /const needsVisit = Array\.isArray\(zones\) \? surveyNeedsVisit\(zones\) : true;/);
});
