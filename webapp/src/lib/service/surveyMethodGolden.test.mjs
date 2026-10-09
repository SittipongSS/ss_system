// ── ประเมินจากแบบ งวด S1: ใบที่ทุกพื้นที่ลงหน้างาน ต้องเดินเหมือนเดิมทุกตัวอักษร (mig 0408) ──────────────
//
// ⭐ **ของที่ไฟล์นี้ล็อก** (สเปก S1 §5.2 · แผน survey-desk-assessment §7 แถว S1): งวด S1 ทำให้ด่าน · คิว · ราง · ขั้น ·
//   การส่งผล · กระดาษ อ่านวิธีประเมินรายพื้นที่ — ใบที่ **ไม่มีพื้นที่จากแบบ** (ทุกแถวของระบบวันนี้) ต้องไม่รู้สึกถึงมันเลย
//   ใบชุดเดียวถูกสร้าง **สามแบบ**: แถวไม่มีคีย์ `method` (แถว/fixture ก่อน mig) · `method: 'onsite'` (ค่าตั้งต้นของคอลัมน์)
//   · สี่คอลัมน์ใหม่มีครบแต่เป็น null — ทั้งสามต้องได้ผลเท่า `GOLDEN` ข้างล่าง ซึ่งเป็น **ค่าตรงตัว**
//
// 🔴 **`GOLDEN` ไม่ได้คำนวณจากโค้ดตอนรันเทสต์** — เป็นผลที่จดไว้จากโค้ดก่อนงวด S1 (origin/main `aec7c58c`):
//   ไฟล์นี้ + `surveyMethod.js` ถูกวางลงสำเนาของ main แล้วรันผ่านที่นั่นด้วย (โค้ดเก่าไม่อ่านคีย์ใหม่ที่ส่งเกินมา)
//   ⇒ ข้อไหนแดง = พฤติกรรมของใบลงหน้างานเปลี่ยน · **แก้ที่โค้ด ไม่ใช่แก้ตัวเลขในไฟล์นี้**
//   (เปลี่ยนข้อความของด่านโดยตั้งใจ = แก้ `GOLDEN` พร้อมเหตุผลในคอมมิตเดียวกัน)
// ⚠️ เทียบหลังแปลงผ่าน JSON — คีย์ที่เป็น `undefined` ไม่นับ (รูปเดียวกับที่ route ส่งออกไปจริง)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVEY_GATES, surveyCrewGaps, surveyFieldMissing, surveyFieldProgress, surveyFieldSubmitError,
  surveyGateChecklist, surveyResultMissing, surveySendBackOnSheet, surveySendError,
} from './survey.js';
import { surveyNeedsVisit } from './surveyMethod.js';
import { surveySpotGates, surveySpotSendError, surveySpotSubmitError } from './surveySpotPhotos.js';
import { surveySendConfirm, surveySendVisitStep } from './surveySendClose.js';
import { surveyQueueStep } from './surveyQueue.js';
import { requestRailSteps } from '../requests/requestRail.js';
import { surveyJobView } from './surveyJob.js';
import { VISIT_STATUSES } from './visitStatus.js';
import { surveyReportFreezeIssues } from './surveyReportSnapshot.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';

const TODAY = '2026-10-09';

/* ── สามแบบของแถวพื้นที่ที่ "ลงหน้างาน" ─────────────────────────────────────────────────────── */
const WAYS = {
  'ไม่มีคีย์ method (แถวก่อน mig 0408)': (zone) => zone,
  "method: 'onsite'": (zone) => ({ ...zone, method: 'onsite' }),
  'สี่คอลัมน์ใหม่เป็น null': (zone) => ({
    ...zone, method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null,
  }),
};

/* ── ใบตัวอย่าง: สามพื้นที่ — ครบทุกข้อ · ขาดภาพกว้าง/รูปจุด/ของหัวหน้า · ถูกตัด ─────────────────── */
const part = (w, l, h, label = null) => ({ id: `p-${w}${l}${h}`, widthM: w, lengthM: l, heightM: h, label });
const file = (id, docType, extra = {}) => ({ id, docType, fileName: `${id}.jpg`, mimeType: 'image/jpeg', ...extra });

const baseZones = () => [
  {
    id: 'z1', requestId: 'DR-1', zoneId: 'SZN-1', zoneName: 'Studio 01', floor: '02', status: 'ok',
    parts: [part(4, 5, 3)], spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
    packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '',
    surveyedAt: '2026-10-08T03:10:00.000+00:00', surveyedByName: 'Phuwadol Aoonnankad',
    updatedAt: '2026-10-08T03:10:00.000+00:00',
  },
  {
    id: 'z2', requestId: 'DR-1', zoneId: 'SZN-2', zoneName: 'Studio 02', floor: '02', status: 'ok',
    parts: [part(6, 8, 3, 'โถงหน้า')], spots: [{ id: 's1', label: 'ข้างเคาน์เตอร์', selected: false }, { id: 's2', label: 'หลังเสา', selected: false }],
    packageQty: null, packageSize: null, packageSizeSuggested: 'SM', packageNote: '', note: 'รอเจ้าของห้องยืนยัน',
    surveyedAt: '2026-10-08T03:40:00.000+00:00', surveyedByName: 'Phuwadol Aoonnankad',
    updatedAt: '2026-10-08T03:40:00.000+00:00',
  },
  {
    id: 'z3', requestId: 'DR-1', zoneId: 'SZN-3', zoneName: 'ห้องเก็บของ', floor: '01', status: 'cut',
    cutReason: 'ลูกค้าขอตัดออก', parts: [], spots: [], packageQty: null, packageNote: '', note: '',
    updatedAt: '2026-10-08T02:00:00.000+00:00',
  },
];
const filesByZone = () => ({
  z1: [
    file('f-z1-wide', 'survey_wide'), file('f-z1-plan', 'survey_plan'),
    file('f-z1-spot', 'survey_spot', { metadata: { spotId: 's1' } }),
  ],
  // ผังมาแล้ว · ไม่มีภาพกว้าง · จุด s1 มีรูป จุด s2 ไม่มี · มีรูปจุดหนึ่งรูปที่ยังไม่ได้ผูก
  z2: [
    file('f-z2-plan', 'survey_plan'),
    file('f-z2-spot', 'survey_spot', { metadata: { spotId: 's1' } }),
    file('f-z2-tray', 'survey_spot'),
  ],
  z3: [],
});

const visit = (status, extra = {}) => ({
  id: `v-${status}`, code: 'SV-26100007', status, requestId: 'DR-1',
  scheduledDate: '2026-10-08', startTime: '10:00:00', endTime: null,
  actualDate: ['in_progress', 'done', 'partial'].includes(status) ? '2026-10-08' : null,
  actualStartTime: ['in_progress', 'done', 'partial'].includes(status) ? '10:12:00' : null,
  actualEndTime: null, actualEndDate: null,
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad', assistantIds: [], unableReason: status === 'unable' ? 'อาคารปิด' : null,
  createdByName: 'Apisith Pattangthani', createdAt: '2026-10-06T08:15:00Z', ...extra,
});

const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26100021', title: 'ประเมินพื้นที่ Studio', kind: 'site_survey', dept: 'TS', requesterDept: 'SA',
  team: 'SV', status: 'acknowledged', siteId: 'SS-1', customerId: 'CU-1',
  requestedByName: 'Lalida Chaiwanna', submittedAt: '2026-10-06T07:50:00Z',
  acknowledgedAt: '2026-10-06T08:12:00Z', acknowledgedByName: 'Apisith Pattangthani',
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad',
  requestedDueDate: '2026-10-08', requestedDueTime: '10:00:00', requestedResultDate: '2026-10-12',
  committedDueDate: '2026-10-08', committedResultDate: '2026-10-12', dueCommittedAt: '2026-10-06T08:15:00Z',
  ...extra,
});

/* รูปของใบตามขั้นที่เดินจริง — ชื่อคือสิ่งที่คนบนคิวเห็น */
const REQUEST_SHAPES = {
  'รอรับเรื่อง': () => ({
    row: request({
      status: 'pending', acknowledgedAt: null, acknowledgedByName: null, assigneeId: null, assigneeName: null,
      committedDueDate: null, committedResultDate: null, dueCommittedAt: null,
    }),
    visit: null,
  }),
  'รับเรื่องแล้ว ยังไม่ลงคิว': () => ({
    row: request({ committedDueDate: null, committedResultDate: null, dueCommittedAt: null, assigneeId: null, assigneeName: null }),
    visit: null,
  }),
  'ลงคิวแล้ว นัดไว้': () => ({ row: request(), visit: visit('scheduled') }),
  'ลงคิวแล้ว นัดยังเป็นร่าง': () => ({ row: request(), visit: visit('draft') }),
  'ช่างกำลังวัด': () => ({ row: request(), visit: visit('in_progress') }),
  'ช่างส่งงานแล้ว': () => ({ row: request(), visit: visit('done') }),
  'นัดเข้าไม่ได้': () => ({ row: request(), visit: visit('unable') }),
  'นัดถูกยกเลิก': () => ({ row: request(), visit: visit('cancelled') }),
  'มีวันบนใบแต่ไม่มีนัด': () => ({ row: request(), visit: null }),
  'ส่งผลแล้ว': () => ({
    row: request({ status: 'answered', answeredAt: '2026-10-09T02:00:00Z', answeredByName: 'Arnon Aunsapwilai' }),
    visit: visit('done'),
  }),
  'ปิดครบสองฝั่ง': () => ({
    row: request({
      status: 'closed', answeredAt: '2026-10-09T02:00:00Z', answeredByName: 'Arnon Aunsapwilai',
      closedAt: '2026-10-09T02:30:00Z', closedByName: 'Lalida Chaiwanna',
    }),
    visit: visit('done'),
  }),
};

const SEND_BACK_PENDING = {
  pending: true,
  sentBack: { id: 'EUP-9', at: '2026-10-08T08:00:00Z', byId: 'u-head', byName: 'Arnon Aunsapwilai', note: null, items: ['ถ่ายภาพกว้างใหม่'] },
  done: null,
};

/* อินพุตของกระดาษ — แฝดสังเคราะห์ของ RQ-AS-26090186 (สองพื้นที่ · รูปครบ · นัดปิดแล้วหนึ่งใบ) */
function paperInputs(way, opts, edit = null) {
  const inputs = surveyReportInputsFromFixture(syntheticSurveyFixture(), opts);
  inputs.zones = inputs.zones.map(way);
  if (edit) edit(inputs);
  return inputs;
}

/** ผลของทุกตัวตัดสินที่งวด S1 แตะ สำหรับแถวพื้นที่แบบ `way` */
function outcome(way) {
  const rows = baseZones().map(way);
  const files = filesByZone();
  const needsVisit = surveyNeedsVisit(rows);
  const byZone = (fn) => Object.fromEntries(rows.map((row) => [row.id, fn(row, files[row.id] || [])]));

  const shapes = Object.fromEntries(Object.entries(REQUEST_SHAPES).map(([name, make]) => {
    const { row, visit: v } = make();
    const view = surveyJobView({
      request: { ...row, surveyVisit: v, surveyVisits: v ? [v] : [], surveyZones: rows, surveyFilesByZone: files },
      today: TODAY,
      viewer: { canDecide: true },
    });
    const rail = requestRailSteps(row, { visit: v, needsVisit });
    return [name, {
      queueStep: surveyQueueStep({ ...row, surveyVisit: v, surveyNeedsVisit: needsVisit }),
      queueStepNoFlag: surveyQueueStep({ ...row, surveyVisit: v }),
      railIndex: rail.index,
      railSteps: rail.steps.map((step) => [step.id, step.label, step.state ?? null]),
      stage: view.stage,
      status: view.status,
      jobIndex: view.index,
      now: view.now,
      jobSteps: view.steps.map((step) => [step.id, step.label, step.state ?? null]),
    }];
  }));

  return {
    needsVisit,
    gateTexts: byZone((row, f) => Object.fromEntries(SURVEY_GATES.map((gate) => [gate.key, gate.missing(row, f)]))),
    gateOwners: SURVEY_GATES.map((gate) => [gate.key, gate.owner, gate.short, gate.label]),
    fieldMissing: byZone(surveyFieldMissing),
    resultMissing: byZone(surveyResultMissing),
    checklist: surveyGateChecklist(rows, files),
    crewGaps: surveyCrewGaps(rows, files),
    fieldProgress: surveyFieldProgress(rows, files),
    sendError: {
      head: surveySendError(rows, files, { canSend: true }),
      crew: surveySendError(rows, files, { canSend: false }),
      onlyReadyZone: surveySendError(rows.slice(0, 1), files, { canSend: true }),
      allCut: surveySendError(rows.slice(2), files, { canSend: true }),
    },
    fieldSubmitError: {
      sheet: surveyFieldSubmitError(rows, files),
      onlyReadyZone: surveyFieldSubmitError(rows.slice(0, 1), files),
      noRows: surveyFieldSubmitError([], files),
    },
    spotGates: {
      send: surveySpotGates(rows, files, { mode: 'send' }),
      sendClosingVisit: surveySpotGates(rows, files, { mode: 'send', closesVisit: true }),
      submit: surveySpotGates(rows, files, { mode: 'submit' }),
      sendError: surveySpotSendError(rows, files, { closesVisit: true }),
      submitError: surveySpotSubmitError(rows, files),
    },
    visitStep: Object.fromEntries([null, ...VISIT_STATUSES].map((status) => {
      const step = surveySendVisitStep(status ? visit(status) : null, { today: TODAY, needsVisit });
      return [status ?? 'ไม่มีนัด', { action: step.action, error: step.error ?? null, patch: step.patch ?? null }];
    })),
    sendConfirm: {
      noVisit: surveySendConfirm({ docNo: 'RQ-AS-26100021', closesVisit: null }),
      closesScheduled: surveySendConfirm({ docNo: 'RQ-AS-26100021', closesVisit: visit('scheduled') }),
      closesInProgress: surveySendConfirm({
        docNo: 'RQ-AS-26100021', closesVisit: visit('in_progress', { startTime: '10:12:00' }),
        sendBackPending: { itemCount: 1 }, issuesDocument: true,
      }),
    },
    sendBack: {
      pending: surveySendBackOnSheet(SEND_BACK_PENDING, request(), { needsVisit }),
      pendingNoOption: surveySendBackOnSheet(SEND_BACK_PENDING, request()),
      lockedSheet: surveySendBackOnSheet(SEND_BACK_PENDING, request({ status: 'answered', answeredAt: '2026-10-09T02:00:00Z' }), { needsVisit }),
      nothing: surveySendBackOnSheet(null, request(), { needsVisit }),
    },
    shapes,
    freezeIssues: {
      ready: surveyReportFreezeIssues(paperInputs(way)),
      spotsUnlinked: surveyReportFreezeIssues(paperInputs(way, { spotLinks: null })),
      noVisit: surveyReportFreezeIssues(paperInputs(way, undefined, (inputs) => { inputs.visit = null; })),
      notSent: surveyReportFreezeIssues(paperInputs(way, undefined, (inputs) => {
        inputs.request = { ...inputs.request, answeredAt: null, answeredByName: null };
      })),
    },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

/* GOLDEN:BEGIN */
const GOLDEN = {
  needsVisit: true,
  gateTexts: {
    z1: { size: null, wide: null, spots: null, plan: null, picked: null, package: null },
    z2: {
      size: null,
      wide: 'ยังไม่มีภาพกว้าง',
      spots: null,
      plan: null,
      picked: 'ยังไม่ได้เลือกจุดที่จะติดตั้ง',
      package: 'ยังไม่ได้เคาะแพ็คเกจ'
    },
    z3: {
      size: 'ยังไม่ได้วัดขนาด — เพิ่มอย่างน้อยหนึ่งส่วน',
      wide: 'ยังไม่มีภาพกว้าง',
      spots: 'ยังไม่ได้ระบุจุดที่ติดตั้งได้',
      plan: 'ยังไม่มีภาพผังที่มาร์กจุดแล้ว',
      picked: 'ยังไม่ได้เลือกจุดที่จะติดตั้ง',
      package: 'ยังไม่ได้เคาะแพ็คเกจ'
    }
  },
  gateOwners: [
    [ 'size', 'crew', 'ขนาด', 'ขนาด ก × ย × ส ครบทุกพื้นที่' ],
    [ 'wide', 'crew', 'ภาพกว้าง', 'ภาพกว้างครบทุกพื้นที่' ],
    [ 'spots', 'crew', 'จุดติดตั้ง', 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่' ],
    [ 'plan', 'head', 'ภาพผัง', 'ภาพผังที่มาร์กจุดแล้ว' ],
    [ 'picked', 'head', 'เลือกจุด', 'เลือกจุดที่จะติดตั้งแล้ว' ],
    [ 'package', 'head', 'แพ็คเกจ', 'เคาะขนาดและจำนวนแพ็คเกจแล้ว' ]
  ],
  fieldMissing: { z1: [], z2: [ 'ยังไม่มีภาพกว้าง' ], z3: [] },
  resultMissing: {
    z1: { field: [], result: [] },
    z2: { field: [ 'ยังไม่มีภาพกว้าง' ], result: [ 'ยังไม่ได้เลือกจุดที่จะติดตั้ง', 'ยังไม่ได้เคาะแพ็คเกจ' ] },
    z3: { field: [], result: [] }
  },
  checklist: [
    { key: 'size', owner: 'crew', label: 'ขนาด ก × ย × ส ครบทุกพื้นที่', short: 'ขนาด', ok: true, done: 2, total: 2, zones: [] },
    { key: 'wide', owner: 'crew', label: 'ภาพกว้างครบทุกพื้นที่', short: 'ภาพกว้าง', ok: false, done: 1, total: 2, zones: [ 'Studio 02' ] },
    {
      key: 'spots',
      owner: 'crew',
      label: 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่',
      short: 'จุดติดตั้ง',
      ok: true,
      done: 2,
      total: 2,
      zones: []
    },
    { key: 'plan', owner: 'head', label: 'ภาพผังที่มาร์กจุดแล้ว', short: 'ภาพผัง', ok: true, done: 2, total: 2, zones: [] },
    {
      key: 'picked',
      owner: 'head',
      label: 'เลือกจุดที่จะติดตั้งแล้ว',
      short: 'เลือกจุด',
      ok: false,
      done: 1,
      total: 2,
      zones: [ 'Studio 02' ]
    },
    {
      key: 'package',
      owner: 'head',
      label: 'เคาะขนาดและจำนวนแพ็คเกจแล้ว',
      short: 'แพ็คเกจ',
      ok: false,
      done: 1,
      total: 2,
      zones: [ 'Studio 02' ]
    }
  ],
  crewGaps: [ { key: 'wide', owner: 'crew', label: 'ภาพกว้างครบทุกพื้นที่', short: 'ภาพกว้าง', ok: false, done: 1, total: 2, zones: [ 'Studio 02' ] } ],
  fieldProgress: { total: 2, done: 1, complete: false },
  sendError: {
    head: 'ยังส่งผลไม่ได้ — Studio 02: ยังไม่มีภาพกว้าง · ยังไม่ได้เลือกจุดที่จะติดตั้ง · ยังไม่ได้เคาะแพ็คเกจ',
    crew: 'ส่งผลประเมินได้เฉพาะหัวหน้าฝ่ายบริการ',
    onlyReadyZone: null,
    allCut: 'ใบนี้ไม่มีพื้นที่ที่ต้องประเมินเหลืออยู่เลย'
  },
  fieldSubmitError: {
    sheet: 'ยังส่งงานไม่ได้ — ขาด ภาพกว้าง (Studio 02) · กรอกให้ครบ หรือกด “ตัดพื้นที่นี้ออก” พร้อมเหตุผล',
    onlyReadyZone: null,
    noRows: 'ใบนี้ยังไม่มีพื้นที่ให้วัด — กด “เพิ่มพื้นที่ที่เจอหน้างาน” ก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”'
  },
  spotGates: {
    send: [
      {
        key: 'spotLinked',
        owner: 'head',
        short: 'ผูกรูปจุด',
        label: 'รูปจุดผูกกับจุดครบ ไม่เหลือใน “ยังไม่ได้ผูกจุด”',
        ok: false,
        done: 1,
        total: 2,
        zones: [ 'Studio 02' ],
        zoneIds: [ 'z2' ],
        count: 1,
        reason: 'มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Studio 02)'
      }
    ],
    sendClosingVisit: [
      {
        key: 'spotPhotos',
        owner: 'crew',
        short: 'รูปจุด',
        label: 'ทุกจุดมีรูปอย่างน้อย 1 รูป',
        ok: false,
        done: 1,
        total: 2,
        zones: [ 'Studio 02' ],
        zoneIds: [ 'z2' ],
        count: 1,
        reason: 'Studio 02 · จุด 2.2 ยังไม่มีรูป — ช่างยังไม่ส่งงาน ส่งผลจะปิดนัดให้ ทุกจุดต้องมีรูปก่อน'
      },
      {
        key: 'spotLinked',
        owner: 'head',
        short: 'ผูกรูปจุด',
        label: 'รูปจุดผูกกับจุดครบ ไม่เหลือใน “ยังไม่ได้ผูกจุด”',
        ok: false,
        done: 1,
        total: 2,
        zones: [ 'Studio 02' ],
        zoneIds: [ 'z2' ],
        count: 1,
        reason: 'มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Studio 02)'
      }
    ],
    submit: [
      {
        key: 'spotPhotos',
        owner: 'crew',
        short: 'รูปจุด',
        label: 'ทุกจุดมีรูปอย่างน้อย 1 รูป',
        ok: false,
        done: 1,
        total: 2,
        zones: [ 'Studio 02' ],
        zoneIds: [ 'z2' ],
        count: 1,
        reason: 'Studio 02 · จุด 2.2 ยังไม่มีรูป'
      },
      {
        key: 'spotLinked',
        owner: 'crew',
        short: 'ผูกรูปจุด',
        label: 'รูปจุดผูกกับจุดครบ ไม่เหลือใน “ยังไม่ได้ผูกจุด”',
        ok: false,
        done: 1,
        total: 2,
        zones: [ 'Studio 02' ],
        zoneIds: [ 'z2' ],
        count: 1,
        reason: 'มีรูปที่ยังไม่ได้ผูกจุด 1 รูป (Studio 02)'
      }
    ],
    sendError: 'Studio 02 · จุด 2.2 ยังไม่มีรูป — ช่างยังไม่ส่งงาน ส่งผลจะปิดนัดให้ ทุกจุดต้องมีรูปก่อน | มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Studio 02)',
    submitError: 'ยังส่งงานไม่ได้ — Studio 02 · จุด 2.2 ยังไม่มีรูป | มีรูปที่ยังไม่ได้ผูกจุด 1 รูป (Studio 02)'
  },
  visitStep: {
    'ไม่มีนัด': { action: 'none', error: null, patch: null },
    draft: {
      action: 'block',
      error: 'นัด SV-26100007 ยังเป็นร่าง (ยังไม่ขึ้นตารางช่าง) — ปล่อยขึ้นตารางหรือยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยส่งผล',
      patch: null
    },
    scheduled: { action: 'close', error: null, patch: { status: 'done', actualDate: '2026-10-08' } },
    in_progress: { action: 'close', error: null, patch: { status: 'done', actualDate: '2026-10-08' } },
    done: { action: 'none', error: null, patch: null },
    partial: { action: 'none', error: null, patch: null },
    unable: { action: 'none', error: null, patch: null },
    rescheduled: { action: 'none', error: null, patch: null },
    cancelled: { action: 'none', error: null, patch: null }
  },
  sendConfirm: {
    noVisit: {
      effects: [
        'ใบ RQ-AS-26100021 เป็น “ตอบแล้ว” — ฝ่ายขายได้แจ้งเตือนและเอาตัวเลขไปตั้งราคาได้ทันที',
        'ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”',
        'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”'
      ],
      confirmLabel: 'ส่งผล'
    },
    closesScheduled: {
      effects: [
        'ใบ RQ-AS-26100021 เป็น “ตอบแล้ว” — ฝ่ายขายได้แจ้งเตือนและเอาตัวเลขไปตั้งราคาได้ทันที',
        'ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”',
        'ปิดนัด SV-26100007 เป็น “เข้าแล้ว” ไปพร้อมกัน — ช่างยังไม่เคยกดเริ่มงาน · บันทึกวันเข้าเป็น วันนัด ไม่มีเวลาเข้าจริง',
        'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”'
      ],
      confirmLabel: 'ส่งผลและปิดนัด'
    },
    closesInProgress: {
      effects: [
        'ใบ RQ-AS-26100021 เป็น “ตอบแล้ว” — ฝ่ายขายได้แจ้งเตือนและเอาตัวเลขไปตั้งราคาได้ทันที',
        'ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”',
        'เรื่องที่ส่งกลับให้ช่างแก้ 1 ข้อ ยังรอช่างแจ้งว่าแก้แล้ว — ส่งผลแล้วช่างแก้ต่อไม่ได้ (ดึงผลกลับมาแก้ = เรื่องนี้กลับมารอช่างอีกครั้ง)',
        'ปิดนัด SV-26100007 เป็น “เข้าแล้ว” ไปพร้อมกัน — ช่างยังไม่ได้กดส่งงาน · เก็บเวลาเริ่ม 10:12 น. ที่ช่างกดไว้ ไม่ใส่เวลาจบให้',
        'ออกเอกสารประเมิน (เลข SU) ไปพร้อมกัน — ฝ่ายขายดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง · เอกสารที่ออกแล้วแก้ไม่ได้ (แก้ = ดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไป)',
        'ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”'
      ],
      confirmLabel: 'ส่งผลและปิดนัด'
    }
  },
  sendBack: {
    pending: {
      pending: true,
      sentBack: { id: 'EUP-9', at: '2026-10-08T08:00:00Z', byId: 'u-head', byName: 'Arnon Aunsapwilai', note: null, items: [ 'ถ่ายภาพกว้างใหม่' ] },
      done: null
    },
    pendingNoOption: {
      pending: true,
      sentBack: { id: 'EUP-9', at: '2026-10-08T08:00:00Z', byId: 'u-head', byName: 'Arnon Aunsapwilai', note: null, items: [ 'ถ่ายภาพกว้างใหม่' ] },
      done: null
    },
    lockedSheet: {
      pending: false,
      sentBack: { id: 'EUP-9', at: '2026-10-08T08:00:00Z', byId: 'u-head', byName: 'Arnon Aunsapwilai', note: null, items: [ 'ถ่ายภาพกว้างใหม่' ] },
      done: null,
      closedBySend: true
    },
    nothing: null
  },
  shapes: {
    'รอรับเรื่อง': {
      queueStep: 'acknowledge',
      queueStepNoFlag: 'acknowledge',
      railIndex: 1,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', 'pending' ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'pending',
      status: { label: 'รอรับเรื่อง', tone: 'warning' },
      jobIndex: 1,
      now: {
        step: 'ตอนนี้ · รับเรื่อง',
        visitCode: null,
        headline: 'รอ TS รับเรื่อง',
        sub: 'ส่งเมื่อ อ. 6 ต.ค. 14:50',
        tone: 'warning',
        progress: null,
        next: 'TS รับเรื่อง แล้วลงคิววัน เวลา และเจ้าหน้าที่ที่จะไป',
        turn: { side: 'TS', who: 'ผู้วางคิว TS' },
        due: { label: 'ผู้ขอต้องการผล', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'TS ยังไม่ได้แจ้งวันส่งผล' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'current' ],
        [ 'commitDue', 'ลงคิว / นัด', 'pending' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'pending' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'รับเรื่องแล้ว ยังไม่ลงคิว': {
      queueStep: 'queue',
      queueStepNoFlag: 'queue',
      railIndex: 2,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'queue',
      status: { label: 'รอลงคิว', tone: 'warning' },
      jobIndex: 2,
      now: {
        step: 'ตอนนี้ · ลงคิว / นัด',
        visitCode: null,
        headline: 'รอลงคิวเข้าพื้นที่',
        sub: 'รับเรื่องแล้วโดย Apisith Pattangthani · ผู้ขออยากให้เข้า พฤ. 8 ต.ค. 10:00',
        tone: 'warning',
        progress: null,
        next: 'TS เลือกวัน เวลา และเจ้าหน้าที่ แล้วกด “ลงคิวเข้าพื้นที่”',
        turn: { side: 'TS', who: 'Apisith Pattangthani' },
        due: { label: 'ผู้ขอต้องการผล', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'TS ยังไม่ได้แจ้งวันส่งผล' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'current' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'pending' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'ลงคิวแล้ว นัดไว้': {
      queueStep: null,
      queueStepNoFlag: null,
      railIndex: 3,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'overdue',
      status: { label: 'เลยวันนัด', tone: 'danger' },
      jobIndex: 3,
      now: {
        step: 'ตอนนี้ · เข้าพื้นที่',
        visitCode: 'SV-26100007',
        headline: 'เลยวันนัดมา 1 วัน — ยังไม่เริ่มงาน',
        sub: 'นัด SV-26100007 พฤ. 8 ต.ค. 10:00 · สถานะยังเป็น “นัดไว้”',
        tone: 'danger',
        progress: null,
        next: 'TS ยืนยันว่าเข้าพื้นที่แล้ว (กด “เริ่มงาน”) หรือเลื่อนนัด',
        turn: { side: 'TS', who: 'เจ้าหน้าที่ Phuwadol Aoonnankad', note: '' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'done' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'current' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'ลงคิวแล้ว นัดยังเป็นร่าง': {
      queueStep: null,
      queueStepNoFlag: null,
      railIndex: 3,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'visit-draft',
      status: { label: 'นัดยังไม่ขึ้นตาราง', tone: 'warning' },
      jobIndex: 3,
      now: {
        step: 'ตอนนี้ · เข้าพื้นที่',
        visitCode: 'SV-26100007',
        headline: 'นัดยังไม่ขึ้นตาราง',
        sub: 'SV-26100007 · พฤ. 8 ต.ค. 10:00 · รอผู้วางคิวปล่อยขึ้นตาราง',
        tone: 'warning',
        progress: null,
        next: 'ผู้วางคิว TS ปล่อยนัดขึ้นตารางที่หน้าจัดคิว',
        turn: { side: 'TS', who: 'ผู้วางคิว TS' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'done' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'current' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'ช่างกำลังวัด': {
      queueStep: null,
      queueStepNoFlag: null,
      railIndex: 3,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'measuring',
      status: { label: 'กำลังวัดหน้างาน', tone: 'info' },
      jobIndex: 3,
      now: {
        step: 'ตอนนี้ · เข้าพื้นที่',
        visitCode: 'SV-26100007',
        headline: 'กำลังวัดหน้างาน — วัดแล้ว 1 / 2 พื้นที่',
        sub: 'เหลือ Studio 02 · ขาด: ภาพกว้าง · รูปจุด',
        tone: 'info',
        progress: { done: 1, total: 2, complete: false },
        next: 'ช่างวัดพื้นที่ที่เหลือแล้วกด “ส่งงาน” → หัวหน้า TS เคาะภาพผัง จุดติดตั้ง แพ็คเกจ แล้วกด “ส่งผลให้ฝ่ายขาย”',
        turn: { side: 'TS', who: 'เจ้าหน้าที่ Phuwadol Aoonnankad', note: 'เริ่มงาน 10:12' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'done' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'current' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'ช่างส่งงานแล้ว': {
      queueStep: null,
      queueStepNoFlag: null,
      railIndex: 4,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'crew-gaps',
      status: { label: 'ของหน้างานยังขาด', tone: 'warning' },
      jobIndex: 4,
      now: {
        step: 'ตอนนี้ · ส่งผล',
        visitCode: 'SV-26100007',
        headline: 'ช่างส่งงานแล้ว แต่ของหน้างานยังขาด',
        sub: 'วัดแล้ว 1 / 2 พื้นที่ · ขาดที่ Studio 02 · ขาด: ภาพกว้าง',
        tone: 'warning',
        progress: { done: 1, total: 2, complete: false },
        next: 'หัวหน้า TS กด “ส่งกลับให้ช่างแก้” ที่ใบประเมิน หรือตัดพื้นที่ที่วัดไม่ได้พร้อมเหตุผล',
        turn: { side: 'TS', who: 'หัวหน้า TS' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'done' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'done' ],
        [ 'answered', 'ส่งผล', 'current' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'นัดเข้าไม่ได้': {
      queueStep: 'requeue',
      queueStepNoFlag: 'requeue',
      railIndex: 2,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'requeue',
      status: { label: 'ต้องลงคิวใหม่', tone: 'warning' },
      jobIndex: 2,
      now: {
        step: 'ตอนนี้ · ลงคิว / นัด',
        visitCode: null,
        headline: 'ต้องลงคิวใหม่',
        sub: 'SV-26100007 ทำไม่ได้ · อาคารปิด',
        tone: 'warning',
        progress: null,
        next: 'TS ลงคิวใหม่ — เลือกวันและเจ้าหน้าที่อีกครั้ง',
        turn: { side: 'TS', who: 'Phuwadol Aoonnankad' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'current' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'pending' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'นัดถูกยกเลิก': {
      queueStep: 'requeue',
      queueStepNoFlag: 'requeue',
      railIndex: 2,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'requeue',
      status: { label: 'ต้องลงคิวใหม่', tone: 'warning' },
      jobIndex: 2,
      now: {
        step: 'ตอนนี้ · ลงคิว / นัด',
        visitCode: null,
        headline: 'ต้องลงคิวใหม่',
        sub: 'SV-26100007 ยกเลิก',
        tone: 'warning',
        progress: null,
        next: 'TS ลงคิวใหม่ — เลือกวันและเจ้าหน้าที่อีกครั้ง',
        turn: { side: 'TS', who: 'Phuwadol Aoonnankad' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'current' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'pending' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'มีวันบนใบแต่ไม่มีนัด': {
      queueStep: 'requeue',
      queueStepNoFlag: 'requeue',
      railIndex: 2,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'queue',
      status: { label: 'รอลงคิว', tone: 'warning' },
      jobIndex: 2,
      now: {
        step: 'ตอนนี้ · ลงคิว / นัด',
        visitCode: null,
        headline: 'รอลงคิวเข้าพื้นที่',
        sub: 'รับเรื่องแล้วโดย Apisith Pattangthani · ผู้ขออยากให้เข้า พฤ. 8 ต.ค. 10:00',
        tone: 'warning',
        progress: null,
        next: 'TS เลือกวัน เวลา และเจ้าหน้าที่ แล้วกด “ลงคิวเข้าพื้นที่”',
        turn: { side: 'TS', who: 'Phuwadol Aoonnankad' },
        due: { label: 'ส่งผลภายใน', value: 'จ. 12 ต.ค. 2026', badge: { text: 'อีก 3 วัน', tone: 'info' }, note: 'ตรงกับที่ผู้ขอต้องการ' },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'current' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'pending' ],
        [ 'answered', 'ส่งผล', 'pending' ],
        [ 'closed', 'ปิดเรื่อง', 'pending' ]
      ]
    },
    'ส่งผลแล้ว': {
      queueStep: null,
      queueStepNoFlag: null,
      railIndex: 5,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'sent',
      status: { label: 'ส่งผลให้ฝ่ายขายแล้ว', tone: 'success' },
      jobIndex: 5,
      now: {
        step: 'ตอนนี้ · ปิดเรื่อง',
        visitCode: 'SV-26100007',
        headline: 'ส่งผลให้ฝ่ายขายแล้ว — 2 พื้นที่ · 68 ตร.ม. · 1 แพ็คเกจ (SM 1)',
        sub: 'ส่งโดย Arnon Aunsapwilai · ศ. 9 ต.ค. 09:00 · ปิดแล้ว 1/2 · รอ SA ปิดเรื่อง',
        tone: 'success',
        progress: { done: 2, total: 2, complete: true },
        next: 'รอฝ่ายขายอ่านผลแล้วปิดเรื่อง',
        turn: { side: 'SA', who: 'Lalida Chaiwanna', note: 'ได้รับผลเมื่อ ศ. 9 ต.ค. 09:00' },
        due: {
          label: 'ส่งผลภายใน',
          value: 'จ. 12 ต.ค. 2026',
          badge: { text: 'ส่งแล้ว ก่อนกำหนด 3 วัน', tone: 'success' },
          note: 'ส่งจริง ศ. 9 ต.ค. 09:00'
        },
        finished: false
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'done' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'done' ],
        [ 'answered', 'ส่งผล', 'done' ],
        [ 'closed', 'ปิดเรื่อง', 'current' ]
      ]
    },
    'ปิดครบสองฝั่ง': {
      queueStep: null,
      queueStepNoFlag: null,
      railIndex: 5,
      railSteps: [
        [ 'draft', 'ส่งคำร้อง', null ],
        [ 'pending', 'รับเรื่อง', null ],
        [ 'commitDue', 'ลงคิว / นัด', null ],
        [ 'acknowledged', 'เข้าพื้นที่', null ],
        [ 'answered', 'ส่งผล', null ],
        [ 'closed', 'ปิดเรื่อง', null ]
      ],
      stage: 'closed',
      status: { label: 'ปิดเรื่องแล้ว', tone: 'success' },
      jobIndex: 6,
      now: {
        step: 'ตอนนี้',
        visitCode: null,
        headline: 'ปิดเรื่องแล้ว',
        sub: '2 พื้นที่ · 68 ตร.ม. · 1 แพ็คเกจ (SM 1) · ปิด ศ. 9 ต.ค. 09:30',
        tone: 'success',
        progress: { done: 2, total: 2, complete: true },
        next: null,
        turn: null,
        due: {
          label: 'ส่งผลภายใน',
          value: 'จ. 12 ต.ค. 2026',
          badge: { text: 'ส่งแล้ว ก่อนกำหนด 3 วัน', tone: 'success' },
          note: 'ส่งจริง ศ. 9 ต.ค. 09:00'
        },
        finished: true
      },
      jobSteps: [
        [ 'draft', 'ส่งคำร้อง', 'done' ],
        [ 'pending', 'รับเรื่อง', 'done' ],
        [ 'commitDue', 'ลงคิว / นัด', 'done' ],
        [ 'acknowledged', 'เข้าพื้นที่', 'done' ],
        [ 'answered', 'ส่งผล', 'done' ],
        [ 'closed', 'ปิดเรื่อง', 'done' ]
      ]
    }
  },
  freezeIssues: {
    ready: [],
    spotsUnlinked: [ { kind: 'content', text: 'รูปจุดติดตั้ง 3 รูปยังไม่ได้ผูกจุด — ผูกในถาด "ยังไม่ได้ผูกจุด" ก่อน' } ],
    noVisit: [ { kind: 'content', text: 'ไม่พบนัดประเมินพื้นที่ของใบนี้' } ],
    notSent: [ { kind: 'system', text: 'ยังไม่ได้ส่งผลให้ฝ่ายขาย — ยังออกเอกสารไม่ได้' } ]
  }
};
/* GOLDEN:END */

for (const [name, way] of Object.entries(WAYS)) {
  test(`🔴 ใบลงหน้างานล้วน เดินเหมือนก่อนงวด S1 ทุกตัวอักษร — ${name}`, () => {
    const got = plain(outcome(way));
    for (const key of Object.keys(GOLDEN)) assert.deepEqual(got[key], GOLDEN[key], key);
    assert.deepEqual(got, GOLDEN);
  });
}

test('สามแบบของแถวได้ผลเท่ากันทั้งก้อน (ไม่ใช่แค่เท่าค่าที่จดไว้) — รวมการ์ดของหน้าคำร้องทั้งใบ', () => {
  const [first, ...rest] = Object.entries(WAYS).map(([name, way]) => [name, outcome(way)]);
  for (const [name, got] of rest) assert.deepEqual(plain(got), plain(first[1]), `${name} ≠ ${first[0]}`);

  /* การ์ดทั้งใบของหน้าคำร้อง (ขั้น · ราง · การ์ดควบคุม · แถวพื้นที่) — คีย์ใหม่บนแถวต้องไม่รั่วไปถึงผลลัพธ์ */
  const views = Object.entries(WAYS).map(([name, way]) => [name, Object.entries(REQUEST_SHAPES).map(([, make]) => {
    const { row, visit: v } = make();
    return plain(surveyJobView({
      request: { ...row, surveyVisit: v, surveyVisits: v ? [v] : [], surveyZones: baseZones().map(way), surveyFilesByZone: filesByZone() },
      today: TODAY,
      viewer: { canDecide: true, canWork: true },
    }));
  })]);
  for (const [name, view] of views.slice(1)) assert.deepEqual(view, views[0][1], `${name} ≠ ${views[0][0]}`);
});

test('ตัวตัดสินทุกตัวของใบนี้ถูกถามด้วย "ต้องมีนัด" จริง — ใบตัวอย่างไม่ใช่งานโต๊ะในแบบใดเลย', () => {
  for (const [name, way] of Object.entries(WAYS)) {
    const rows = baseZones().map(way);
    assert.equal(surveyNeedsVisit(rows), true, `ทั้งใบ · ${name}`);
    assert.equal(surveyNeedsVisit(rows.slice(0, 1)), true, `พื้นที่เดียว · ${name}`);
    // ถูกตัดหมดทั้งใบ (RQ-AS-26090233) ยังเป็นใบที่ต้องมีนัด — ไม่กลายเป็นงานโต๊ะเอง
    assert.equal(surveyNeedsVisit(rows.slice(2)), true, `เหลือแต่พื้นที่ที่ถูกตัด · ${name}`);
    assert.equal(surveyNeedsVisit(paperInputs(way).zones), true, `ใบของกระดาษ · ${name}`);
  }
  assert.equal(GOLDEN.needsVisit, true);
  assert.deepEqual(Object.keys(GOLDEN.fieldProgress), ['total', 'done', 'complete'], 'ไม่มีคีย์ drawing บนใบลงหน้างาน');
  assert.equal(GOLDEN.checklist.length, 6);
  assert.equal(GOLDEN.visitStep.draft.action, 'block');
  assert.match(GOLDEN.visitStep.draft.error, /ยังเป็นร่าง/);
});
