// ── ประเมินจากแบบ — งวด S1 ฝั่งกระดาษ (แผน survey-desk-assessment §2 แถว 30–32 · §7 แถว S1) ─────────────────
//
// ⭐ ล็อกเก้าเรื่อง — ทุกข้อเป็นกิ่งที่ **ข้อมูลจริงยังเดินไม่ถึง** (งวดนี้ไม่มีเส้นไหนทำให้แถวเป็นจากแบบได้) จึงพิสูจน์ด้วยของปลอมล้วน:
//   ① รูปที่กระดาษพิมพ์ของพื้นที่จากแบบ = ภาพแบบรูปเดียว — ภาพกว้าง/รูปจุดที่ค้างบนแถวไม่ถูกดึง ไม่ถูกนับ ไม่ขวาง
//   ② ใบที่มีพื้นที่จากแบบ **ออกเอกสารไม่ได้** จนกว่าแบบเอกสารจะปรับ (งวด S3) — เหตุชนิด `system` ที่พก `hold: true`
//   ③ ใบจากแบบล้วนไม่ถูกถามหานัด · ใบผสมและใบที่ไม่เหลือพื้นที่ยังถูกถามเหมือนเดิม
//   ④ ตัวโหลด: ใบจากแบบล้วนไม่มีนัดให้รับรอง — ทั้งนัดในฐานและนัดที่ผู้เรียกส่งมา
//   ⑤ รอบตรวจก่อนส่งผล: นัดที่ยังเปิดบนใบจากแบบล้วน = ประโยคของ `surveySendVisitStep` · การกันเอกสารไม่ตีกลับการส่งผล
//   ⑥ ปุ่ม "ออกเอกสาร": ติดแค่การกัน = ไม่ชวนให้กดซ้ำ (กดกี่ครั้งก็ไม่ออก — ต้องรอรุ่นใหม่ของระบบ)
//   ⑦ `document.issue.blockers` ของจอ: คีย์ `hold` มีเฉพาะข้อที่กัน
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
const { issueSurveyReport } = await import('./surveyReportIssue.js');
const { surveyDocumentSummary } = await import('./surveyReportRows.js');
const {
  SURVEY_REPORT_DRAWING_HOLD, SURVEY_REPORT_NO_VISIT, buildSurveyReportSnapshot, surveyReportFreezeBlockers,
  surveyReportFreezeIssues, surveyReportImageFiles,
} = await import('./surveyReportSnapshot.js');
const { TEST_COMPANY, surveyReportInputsFromFixture, syntheticSurveyFixture } = await import('./surveyReportTestKit.mjs');
const { surveySendDocumentRefusal } = await import('./surveySendClose.js');
const { SPOT_TRAY_LABEL } = await import('./surveySpotPhotos.js');
const { checkSurveyReportInputs, readOnlyClient } = await import('../../../scripts/check-survey-report-inputs.mjs');

/* ── ข้อความตรงตัว (ลอกจากแผน — เปลี่ยนคำในโค้ดเมื่อไร เทสต์นี้ต้องแดง) ─────────────────────────── */
const HOLD = 'เอกสารประเมินของใบที่ประเมินจากแบบยังออกไม่ได้ — ระบบกำลังปรับแบบเอกสาร';
const HOLD_ISSUE = { kind: 'system', hold: true, text: HOLD };
const NO_VISIT = 'ไม่พบนัดประเมินพื้นที่ของใบนี้';
const NO_FORM = 'ไม่พบมาตรฐานเอกสารของรายงานการประเมินพื้นที่';
const deskBlock = (code) => `ใบนี้ประเมินจากแบบทั้งใบ แต่นัด ${code} ยังเปิดอยู่ — กด “เปลี่ยนวิธีประเมิน” แล้วยืนยันยกเลิกนัดก่อนส่งผล (ระบบจะไม่ปิดนัดที่ยังไม่มีใครไปเป็น “เข้าแล้ว” ให้)`;

const NOW = '2026-10-01T04:00:00.000Z';
const TODAY = '2026-10-01';
const HEAD = Object.freeze({ id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] });

/* ── ของตั้งต้น: แฝดสังเคราะห์ของ RQ-AS-26090186 (สองพื้นที่ · รูปครบ · นัด `done` หนึ่งใบ) ────────────── */

/**
 * อินพุตของตัวสร้างภาพนิ่ง โดยตั้งวิธีประเมินรายพื้นที่ตามลำดับ
 * @param methods `['drawing', 'onsite']` — ตำแหน่งที่เป็น `undefined` = **ไม่มีคีย์ `method` เลย** (แถวก่อน mig 0408)
 */
function twin(methods = [], opts) {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture(), opts);
  inputs.zones.forEach((zone, i) => { if (methods[i] !== undefined) zone.method = methods[i]; });
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

const UNSENT = Object.freeze({ status: 'in_progress', answeredAt: null, answeredById: null, answeredByName: null });
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

test('ค่าคงที่ของการกันเอกสารตรงกับแผนทุกตัวอักษร', () => {
  assert.equal(SURVEY_REPORT_DRAWING_HOLD, HOLD);
  assert.equal(SURVEY_REPORT_NO_VISIT, NO_VISIT);
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
  // รูปร่างของภาพนิ่งไม่เพิ่มคีย์ (งวด S3 เป็นคนเพิ่ม)
  assert.deepEqual(Object.keys(z1), Object.keys(z2));
  assert.equal('method' in z1, false);
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
  assert.deepEqual(surveyReportFreezeIssues(build(MIXED)), [HOLD_ISSUE, { kind: 'content', text: unlinked(2) }]);
  assert.deepEqual(surveyReportFreezeIssues(build(ALL_DRAWING)), [HOLD_ISSUE]);
});

test('ภาพแบบรูปล่าสุดของพื้นที่จากแบบเป็น HEIC = ยังขวาง (ภาพแบบคือรูปเดียวที่กระดาษพิมพ์) · ไม่ซ้ำด้วยข้อ "ยังไม่มีภาพผัง"', () => {
  const inputs = twin(ALL_DRAWING);
  editFiles(inputs, 'SVZ-syn-1', asHeic('survey_plan', 'plan.heic'));
  assert.deepEqual(surveyReportFreezeIssues(inputs), [
    HOLD_ISSUE,
    { kind: 'content', text: 'รูป 1 รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (plan.heic)' },
  ]);

  // ไม่มีภาพแบบที่พิมพ์ได้เลย (PDF) = ข้อเดิมของภาพผัง — ด่านนี้ไม่เปลี่ยนตามวิธีประเมิน
  const pdf = twin(ALL_DRAWING);
  editFiles(pdf, 'SVZ-syn-2', (f) => (f.docType === 'survey_plan' ? { ...f, fileName: 'plan.pdf', mimeType: 'application/pdf' } : f));
  assert.deepEqual(surveyReportFreezeIssues(pdf), [
    HOLD_ISSUE,
    { kind: 'content', text: 'ห้องที่2: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)' },
  ]);
});

test('คำเตือน "ไม่ใช่รูป — ไม่ลงเอกสาร" ของพื้นที่จากแบบ: เฉพาะไฟล์หมวดภาพแบบ — PDF ในหมวดภาพกว้าง/รูปจุดไม่ถูกเอ่ย', () => {
  const build = (methods) => {
    const inputs = twin(methods);
    inputs.filesByZone['SVZ-syn-1'].push(
      { id: 'att-x-w', docType: 'survey_wide', fileName: 'wide.pdf', mimeType: 'application/pdf', createdAt: '2026-09-26T03:00:00+00:00', metadata: {} },
      { id: 'att-x-s', docType: 'survey_spot', fileName: 'spot.pdf', mimeType: 'application/pdf', createdAt: '2026-09-26T03:00:01+00:00', metadata: {} },
      { id: 'att-x-p', docType: 'survey_plan', fileName: 'old-plan.pdf', mimeType: 'application/pdf', createdAt: '2026-09-26T01:00:00+00:00', metadata: {} },
    );
    return buildSurveyReportSnapshot(inputs, { mode: 'draft' }).warnings.filter((line) => line.includes('ไม่ใช่รูป'));
  };
  const name = 'พื้นที่โซนต้อนรับลูกค้าและสนามเทนนิส';
  assert.deepEqual(build(), [
    `${name}: ไฟล์ wide.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`,
    `${name}: ไฟล์ spot.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`,
    `${name}: ไฟล์ old-plan.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`,
  ], 'พื้นที่ลงหน้างาน: เท่าวันนี้');
  assert.deepEqual(build(MIXED), [`${name}: ไฟล์ old-plan.pdf ไม่ใช่รูป — ไม่ลงเอกสาร`]);
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

test('⭐ มีพื้นที่จากแบบแม้พื้นที่เดียว = ข้อกันเอกสาร ชนิด system พก `hold: true` — อยู่ก่อนข้อจุดเวลา ต่อจากข้อหัวข้อผิด', () => {
  const mixed = surveyReportFreezeIssues(brokenOnsite(MIXED));
  assert.deepEqual(mixed, [
    HOLD_ISSUE,
    BROKEN_TODAY[0],
    BROKEN_TODAY[1],
    BROKEN_TODAY[2],
    { kind: 'content', text: `รูปจุดติดตั้ง 2 รูปยังไม่ได้ผูกจุด — ผูกในถาด "${SPOT_TRAY_LABEL}" ก่อน` },
  ]);
  assert.equal(mixed.filter((issue) => 'hold' in issue).length, 1, 'คีย์ `hold` มีเฉพาะข้อที่กัน');

  const wrongKind = brokenOnsite(MIXED);
  wrongKind.request.kind = 'costing';
  assert.deepEqual(surveyReportFreezeIssues(wrongKind).slice(0, 3), [
    { kind: 'system', text: 'ใบนี้ไม่ใช่คำร้องประเมินพื้นที่' }, HOLD_ISSUE, BROKEN_TODAY[0],
  ]);
});

test('พื้นที่จากแบบที่ถูกตัดไม่นับ — ใบที่เหลือแต่พื้นที่ลงหน้างานไม่ถูกกัน', () => {
  const inputs = twin(MIXED);
  inputs.zones[0].status = 'cut';
  assert.deepEqual(surveyReportFreezeIssues(inputs), []);
});

test('⭐ ใบจากแบบล้วน: ไม่ถูกถามหานัด ไม่ถูกถามวันประเมิน/ผู้ประเมินของนัด — เหลือแค่ข้อที่กัน', () => {
  const noVisit = twin(ALL_DRAWING);
  noVisit.visit = null;
  assert.deepEqual(surveyReportFreezeIssues(noVisit), [HOLD_ISSUE]);

  // นัดที่หลุดเข้ามา (ตัวโหลดไม่ส่ง แต่ผู้เรียกอื่นส่งได้) ก็ไม่ถูกตรวจ
  const stray = twin(ALL_DRAWING);
  stray.visit = { code: 'SV-X', status: 'scheduled', scheduledDate: null, actualDate: null, assigneeName: null };
  assert.deepEqual(surveyReportFreezeIssues(stray), [HOLD_ISSUE]);

  // ใบลงหน้างานที่นัดเดียวกันนี้ได้สองข้อของวันนี้
  const onsite = twin();
  onsite.visit = { ...stray.visit };
  assert.deepEqual(surveyReportFreezeIssues(onsite), [
    { kind: 'content', text: 'นัดประเมินไม่มีวันที่ประเมิน' },
    { kind: 'content', text: 'นัดประเมินไม่มีชื่อผู้ประเมิน' },
  ]);
});

test('🔴 ใบผสมที่ไม่มีนัด: ยังได้ "ไม่พบนัดประเมิน" (content) **และ** ข้อที่กัน · ใบที่ไม่เหลือพื้นที่ยังถูกถามหานัดเหมือนเดิม', () => {
  const mixed = twin(MIXED);
  mixed.visit = null;
  assert.deepEqual(surveyReportFreezeIssues(mixed), [HOLD_ISSUE, { kind: 'content', text: NO_VISIT }]);

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
  assert.deepEqual(surveyReportFreezeIssues(inputs), [HOLD_ISSUE, { kind: 'system', text: 'อ่านนัดประเมินไม่สำเร็จ' }]);
});

test('ตัวสร้างภาพนิ่ง: โหมดตรึง/ตรวจปฏิเสธใบที่มีพื้นที่จากแบบด้วยข้อที่กัน · โหมดร่างยังสร้างได้ (ตัวอย่างบนจอ)', () => {
  for (const methods of [MIXED, ALL_DRAWING]) {
    const inputs = twin(methods);
    assert.deepEqual(surveyReportFreezeBlockers(inputs), [HOLD]);
    assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'freeze' }), { errors: [HOLD] });
    assert.deepEqual(buildSurveyReportSnapshot(inputs, { mode: 'check' }), { errors: [HOLD] });
    const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
    assert.equal(draft.snapshot.zones.length, 2);
    assert.ok(draft.warnings.includes(HOLD));
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
  assert.deepEqual(surveyReportFreezeIssues(inputs), [HOLD_ISSUE]);
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

test('⭐ รอบตรวจ: ใบจากแบบล้วนที่ไม่มีนัดค้าง — เหลือแค่ข้อที่กัน (system) ⇒ **ไม่ตีกลับการส่งผล**', async () => {
  const source = twin(ALL_DRAWING);
  const world = worldFrom(source, { visits: [], request: UNSENT });
  const result = await precheck(world, { open: null, zones: source.zones });
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.blockers, [HOLD_ISSUE]);
  assert.equal(surveySendDocumentRefusal(result.blockers), null);
  assert.ok(Array.isArray(result.warnings));
});

test('⭐ รอบตรวจ: ใบจากแบบล้วน + นัด `scheduled` ที่ยังเปิด — ข้อแรกคือประโยคของ `surveySendVisitStep` (content) · นัดไม่ถูกรับรอง', async () => {
  const source = twin(ALL_DRAWING);
  const open = visitRow('open', 'scheduled', { code: 'SV-26100009' });
  const world = worldFrom(source, { visits: [open], request: UNSENT });
  const result = await precheck(world, { open, zones: source.zones });
  assert.deepEqual(result.blockers, [{ kind: 'content', text: deskBlock('SV-26100009') }, HOLD_ISSUE]);
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
  assert.deepEqual(scheduled.blockers, [HOLD_ISSUE]);
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

const issue = (world) => issueSurveyReport(world.db, {
  requestId: world.request.id, user: HEAD, via: 'issue_only', storeAllowed: true, now: () => new Date(NOW),
  audit: async () => {}, prepareImages: async () => { throw new Error('ต้องไม่เดินถึงขั้นรูป'); },
});
const RESULT_KEYS = ['state', 'code', 'docNo', 'rev', 'reused', 'reasons', 'reason', 'retry', 'warnings'];

test('⭐ ออกเอกสาร: ติดแค่ข้อที่กัน = `blocked` ไม่ชวนกดซ้ำ ไม่ชวนดึงผลกลับ · `retry: false` · พก `hold: true` · ไม่ออกเลข', async () => {
  const world = worldFrom(twin(ALL_DRAWING));
  const result = await issue(world);
  assert.equal(result.state, 'failed');
  assert.equal(result.code, 'blocked');
  assert.deepEqual(result.reasons, [HOLD]);
  assert.equal(result.reason, `ออกเอกสารไม่ได้ — ${HOLD}`);
  assert.equal(result.reason.includes('กดออกเอกสารอีกครั้ง'), false);
  assert.equal(result.reason.includes('ดึงผลกลับ'), false);
  assert.equal(result.retry, false);
  assert.equal(result.hold, true);
  assert.deepEqual(Object.keys(result), [...RESULT_KEYS, 'hold']);
  assert.equal(world.db.tables.service_survey_reports.length, 0);
});

test('ออกเอกสาร: ข้อที่กัน + เหตุของระบบข้ออื่น = คำชวนกดซ้ำของวันนี้ · ข้อที่กัน + เหตุของเนื้อใบ = คำชวนดึงผลกลับของวันนี้', async () => {
  const system = worldFrom(twin(ALL_DRAWING));
  system.db.tables.document_standard_versions.length = 0;
  const a = await issue(system);
  assert.deepEqual(a.reasons, [HOLD, NO_FORM]);
  assert.equal(a.reason, `ออกเอกสารไม่ได้ — ${HOLD} | ${NO_FORM} · แก้แล้วกดออกเอกสารอีกครั้ง`);
  assert.equal(a.retry, true);
  assert.deepEqual(Object.keys(a), RESULT_KEYS);

  // ใบผสมที่ไม่มีนัด `done` — พื้นที่ลงหน้างานยังต้องมีนัดให้รับรอง
  const content = worldFrom(twin(MIXED), { visits: [] });
  const b = await issue(content);
  assert.deepEqual(b.reasons, [HOLD, NO_VISIT]);
  assert.equal(b.reason, `ออกเอกสารไม่ได้ — ${HOLD} | ${NO_VISIT} · ถ้าต้องแก้ ให้ดึงผลกลับมาแก้แล้วส่งใหม่`);
  assert.equal(b.retry, false);
  assert.deepEqual(Object.keys(b), RESULT_KEYS);
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

test('⭐ `document.issue.blockers`: คีย์ `hold` ติดไปเฉพาะข้อที่กัน — ข้ออื่นมีแค่ `kind` กับ `text` · ค่าที่ไม่ใช่ `true` ตรงตัวไม่นับ', async () => {
  const world = worldFrom(twin());
  const fake = async () => ({
    blockers: [
      { kind: 'system', hold: true, text: HOLD, inputs: { secret: 1 } },
      { kind: 'system', hold: 'yes', text: 'เหตุของระบบข้ออื่น' },
      { kind: 'content', hold: false, text: 'เหตุของเนื้อใบ' },
    ],
    warnings: [], unknown: [],
  });
  const doc = await summary(world, { precheck: fake });
  assert.equal(doc.state, 'missing');
  assert.deepEqual(doc.issue.blockers, [
    { kind: 'system', text: HOLD, hold: true },
    { kind: 'system', text: 'เหตุของระบบข้ออื่น' },
    { kind: 'content', text: 'เหตุของเนื้อใบ' },
  ]);
  assert.deepEqual(doc.issue.blockers.map((b) => Object.keys(b).join()), ['kind,text,hold', 'kind,text', 'kind,text']);
});

test('ต่อสายกับตัวตรวจจริง: ใบจากแบบล้วนได้ข้อที่กันพร้อม `hold` · 🔴 ใบลงหน้างานไล่ทุกคีย์ของ payload แล้วไม่มี `hold`', async () => {
  const drawing = await summary(worldFrom(twin(ALL_DRAWING)));
  assert.equal(drawing.state, 'missing');
  assert.deepEqual(drawing.issue.blockers, [{ kind: 'system', text: HOLD, hold: true }]);

  for (const methods of [[], ['onsite', 'onsite']]) {
    const world = worldFrom(twin(methods));
    world.db.tables.document_standard_versions.length = 0;
    const onsite = await summary(world);
    assert.deepEqual(onsite.issue.blockers, [{ kind: 'system', text: NO_FORM }], JSON.stringify(methods));
    assert.equal(deepKeys(onsite).has('hold'), false, JSON.stringify(methods));
  }
});

test('`document.send` (สวิตช์ออกเอกสารตอนส่งผลเปิด): ข้อที่กันไม่ขึ้นเป็นเหตุขวางการส่งผล — ลิสต์เป็นข้อความของเนื้อใบล้วนเหมือนเดิม', async (t) => {
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
    assert.equal(res.text.includes('SV-26100012'), false);
  }
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
  assert.deepEqual(desk.issues, { content: [deskBlock('SV-26100013')], system: [HOLD] });
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
