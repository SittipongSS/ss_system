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
//
// ⭐ **งวด S2a ต่อท้ายไฟล์ (สเปก S2a §3 Integrate ข้อ 3) — เพิ่ม ไม่ผ่อน:** ตัวตัดสินฝั่งจอและฝั่งคำร้องที่งวด S2a แตะ
//   (การ์ดควบคุม · รายการพื้นที่ · กล่องส่งงาน · การ์ดงาน · ลงคิว · หัวคำร้อง · ทะเบียนพื้นที่ · ไทล์เลือกพื้นที่) ของใบชุดเดียวกัน
//   สามแบบเดิม ต้องได้ผลเท่า **โค้ดก่อนงวด S2a** (HEAD `d7a3bf31`) หลังหยิบคีย์ใหม่ที่ §1 อนุญาตออก — ผลเต็มของหนึ่งแบบ
//   ยาวราว 375 KB จึงจดเป็น **ลายนิ้วมือรายท่อน** (`GOLDEN_S2A` · sha256 ของ JSON ตามลำดับคีย์จริง) ไม่ใช่ค่าตรงตัว
//   ⇒ ท่อนไหนแดง = ค่าหรือ **ลำดับคีย์** ของใบลงหน้างานเปลี่ยน หรือมีคีย์ใหม่ที่ไม่อยู่ในลิสต์หยิบออก
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  SURVEY_GATES, surveyCrewGaps, surveyFieldMissing, surveyFieldProgress, surveyFieldSubmitError,
  surveyGateChecklist, surveyResultMissing, surveySendBackOnSheet, surveySendError,
} from './survey.js';
import { surveyNeedsVisit } from './surveyMethod.js';
import { surveySpotGates, surveySpotSendError, surveySpotSubmitError } from './surveySpotPhotos.js';
import { surveySendConfirm, surveySendMethodError, surveySendMethodText, surveySendVisitStep } from './surveySendClose.js';
import { surveyQueueStep } from './surveyQueue.js';
import { requestRailSteps } from '../requests/requestRail.js';
import { surveyJobView } from './surveyJob.js';
import { VISIT_STATUSES } from './visitStatus.js';
import { surveyReportFreezeIssues } from './surveyReportSnapshot.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';
import { surveyControlView } from './surveyControl.js';
import { surveySheetTotalsText, surveySubmitView, surveyZoneListView } from './surveyFieldView.js';
import { commitDueDefaults, commitDueGaps, commitDueLabels, commitDueMode, commitDuePayload } from '../requests/commitDue.js';
import { requestHeaderFacts } from '../requests/headerFacts.js';
import { customerZoneRegistry, zoneRegistryRow } from './zoneRegistry.js';
import { sitePickSummary, zonePickState } from './zonePickState.js';

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

/* ═══ งวด S2a: ตัวตัดสินฝั่งจอ · ฝั่งคำร้อง · ทะเบียน ของใบลงหน้างานล้วน ═══════════════════════════════ */

/* อินพุตของตัวตัดสินฝั่งจอ/ฝั่งคำร้องที่งวด S2a แตะ — แถวพื้นที่แบบ `way` */
const HEAD_VIEWER = { canDecide: true, canWrite: true, canOpenRequest: true };
const CREW_VIEWER = { canDecide: false, canWrite: true, onVisit: true };
const NOW = new Date('2026-10-09T03:00:00Z');
const registryFixture = (way) => {
  const zone = { id: 'SZN-1', code: 'ZN-AAAA-01-00001', name: 'Studio 01', floor: '02', siteId: 'SS-1' };
  const idle = { id: 'SZN-9', code: 'ZN-AAAA-01-00009', name: 'ห้องประชุม', floor: '03', siteId: 'SS-1' };
  const sent = request({ status: 'closed', answeredAt: '2026-10-09T02:00:00Z', closedAt: '2026-10-09T02:30:00Z', createdAt: '2026-10-06T07:50:00Z' });
  const open = request({ id: 'DR-2', docNo: 'RQ-AS-26100030', createdAt: '2026-10-09T01:00:00Z' });
  const surveys = [
    way({ ...baseZones()[0], createdAt: '2026-10-06T07:50:01Z' }),
    way({ ...baseZones()[0], id: 'z1b', requestId: 'DR-2', surveyedAt: null, surveyedByName: null, parts: [], spots: [], packageQty: null, packageSize: null, createdAt: '2026-10-09T01:00:01Z' }),
  ];
  return { zone, idle, surveys, requests: [sent, open], sites: [{ id: 'SS-1', code: 'ST-0001', name: 'อาคาร A', customerId: 'CU-1' }] };
};

function outcomeS2a(way, { drawingMethodEnabled, siteVisitReached } = {}) {
  const rows = baseZones().map(way);
  const files = filesByZone();
  const flag = drawingMethodEnabled === undefined ? {} : { drawingMethodEnabled, siteVisitReached };

  const shapes = Object.fromEntries(Object.entries(REQUEST_SHAPES).map(([name, make]) => {
    const { row, visit: v } = make();
    const control = (viewer, extra = {}) => surveyControlView({
      request: row, zones: rows, filesByZone: files, visit: v, viewer, today: TODAY, ...flag, ...extra,
    });
    const job = (viewer) => surveyJobView({
      request: { ...row, surveyVisit: v, surveyVisits: v ? [v] : [], surveyZones: rows, surveyFilesByZone: files },
      today: TODAY, viewer,
    });
    const head = job({ canDecide: true, canWork: true });
    const sales = job({});
    const form = commitDueDefaults(row, { today: TODAY });
    const asked = { ...row, surveyNeedsVisit: true };
    return [name, {
      control: { head: control(HEAD_VIEWER), crew: control(CREW_VIEWER), resultTab: control(HEAD_VIEWER, { tab: 'result' }) },
      job: {
        timeline: head.steps.map((step) => [step.id, step.label, step.state ?? null, step.when ?? null]),
        zones: head.zones, salesZones: sales.zones, facts: head.facts, salesNow: sales.now,
      },
      commitDue: {
        mode: commitDueMode(row),
        labels: commitDueLabels(row),
        requeueLabels: commitDueLabels(row, { requeue: true }),
        form,
        payload: commitDuePayload(row, { ...form, assigneeId: 'u-pa', reason: 'ลูกค้าขอเลื่อน' }, { technicians: [{ id: 'u-pa', name: 'Phuwadol Aoonnankad' }] }),
        gaps: commitDueGaps(row, form),
        sameWithFlag: JSON.stringify(commitDueLabels(asked)) === JSON.stringify(commitDueLabels(row))
          && commitDueMode(asked) === commitDueMode(row),
      },
      headerFacts: requestHeaderFacts(row, { now: NOW }),
      headerFactsWithFlag: requestHeaderFacts(asked, { now: NOW }),
    }];
  }));

  const inProgress = visit('in_progress');
  const list = (extra) => surveyZoneListView({ zones: rows, filesByZone: files, visit: inProgress, ...extra });
  const reg = registryFixture(way);
  const requestsById = new Map(reg.requests.map((r) => [r.id, r]));
  const registryRow = zoneRegistryRow(reg.zone, { surveys: reg.surveys, requestsById, todayIso: TODAY });
  const sentOnly = zoneRegistryRow(reg.zone, { surveys: reg.surveys.slice(0, 1), requestsById, todayIso: TODAY });
  const never = zoneRegistryRow(reg.idle, { surveys: [], requestsById, todayIso: TODAY });
  const registry = customerZoneRegistry({
    sites: reg.sites, zones: [reg.zone, reg.idle], surveys: reg.surveys, requests: reg.requests, todayIso: TODAY,
  });

  return {
    shapes,
    controlSendBack: surveyControlView({
      request: request(), zones: rows, filesByZone: files, visit: inProgress, sendBack: SEND_BACK_PENDING,
      viewer: HEAD_VIEWER, today: TODAY, ...flag,
    }),
    zoneList: {
      crew: list({ canDecide: false }),
      head: list({ canDecide: true, selectedZoneId: 'z2', sendBack: SEND_BACK_PENDING }),
      locked: list({ canDecide: true, locked: true }),
    },
    submit: surveySubmitView({ outcome: 'done', visit: inProgress, zones: rows, filesByZone: files }),
    sheetTotals: surveySheetTotalsText({ zones: rows, filesByZone: files }),
    registry: {
      pending: registryRow, sent: sentOnly, never,
      totals: registry,
      pick: {
        pending: zonePickState(registryRow), sent: zonePickState(sentOnly), never: zonePickState(never),
        picked: zonePickState(sentOnly, new Set(['SZN-1'])),
      },
      site: sitePickSummary({ zones: [sentOnly, never] }),
    },
  };
}

/* ── คีย์ใหม่ของงวด S2a (สเปก S2a §1 ข้อยกเว้น 2–3) — หยิบออกทีละตัวพร้อมยืนยันว่าเป็น "ค่าว่างของใบลงหน้างาน" ──
   ⚠️ หยิบด้วยชื่อคีย์ตรงตัว ณ ตำแหน่งที่ระบุเท่านั้น — คีย์ใหม่ที่ไม่อยู่ในลิสต์นี้ = ลายนิ้วมือไม่ตรง = เทสต์แดง */
function take(holder, key, expected, at) {
  assert.ok(holder && Object.hasOwn(holder, key), `ไม่มีคีย์ใหม่ ${key} · ${at}`);
  if (typeof expected === 'function') expected(holder[key], at);
  else assert.deepEqual(holder[key], expected, `${key} · ${at}`);
  delete holder[key];
}
const METHOD_OFF = { show: false, allowed: false, reason: null };
function stripControl(view, at, { flagOn = false } = {}) {
  if (!view) return view;
  take(view, 'method', flagOn
    ? (value) => assert.deepEqual(Object.keys(value), ['show', 'allowed', 'reason'], at)
    : METHOD_OFF, at);
  take(view, 'mix', { onsite: 2, drawing: 0, mode: 'onsite' }, at);
  take(view, 'needsVisit', true, at);
  take(view, 'fieldTabLabel', 'หน้างาน', at);
  take(view, 'gatesHidden', false, at);
  take(view.progress, 'drawing', 0, at);
  take(view.progress, 'text', `วัดแล้ว ${view.progress.done} / ${view.progress.total} พื้นที่`, at);
  take(view.send, 'confirm', { required: false, mix: { onsite: 2, drawing: 0 }, mode: 'onsite' }, at);
  return view;
}
function stripJobZones(zones, at) {
  if (!zones) return zones;
  for (const row of zones.rows) {
    take(row, 'method', 'onsite', at);
    take(row, 'chip', null, at);
    take(row, 'photosText', null, at);
    take(row, 'addedLabel', null, at);
  }
  take(zones.crewGate, 'hidden', false, at);
  take(zones, 'drawingBanner', null, at);
  return zones;
}
function stripLabels(labels, at) {
  take(labels, 'wish', null, at);
  take(labels, 'plannerNote', null, at);
  return labels;
}
function stripZoneList(view, at) {
  for (const row of view.rows) {
    take(row, 'method', 'onsite', at);
    take(row, 'chip', null, at);
    // ป้ายที่มาของพื้นที่ที่ถูกเพิ่ม — ใบลงหน้างาน: แถวที่ช่างเพิ่ม = คำเดิมของจอ · นอกนั้น null
    take(row, 'addedLabel', row.tags.added ? 'เพิ่มหน้างาน' : null, at);
  }
  take(view, 'drawingCount', 0, at);
  take(view, 'drawingNote', null, at);
  take(view, 'emptyReason', null, at);
  return view;
}
function stripRegistryRow(row, at, { assessed = true, rounds } = {}) {
  take(row, 'assessMethod', assessed ? 'onsite' : null, at);
  take(row, 'confirm', 'none', at);
  take(row, 'confirmTag', null, at);
  take(row, 'onsiteSurveyCount', rounds === undefined ? row.surveyCount : rounds, at);
  if (row.pendingRequest) take(row.pendingRequest, 'assessMethod', 'onsite', at);
  return row;
}
function stripPick(state, at, { assessed = true } = {}) {
  take(state, 'assessMethod', assessed ? 'onsite' : null, at);
  take(state, 'confirm', 'none', at);
  take(state, 'tag', null, at);
  take(state, 'onsiteSurveyCount', (value) => assert.equal(typeof value, 'number', at), at);
  return state;
}

/** ตัดผลของ `outcomeS2a` เป็นท่อนเล็ก (ท่อนละลายนิ้วมือ) หลังหยิบคีย์ใหม่ออก — ท่อนไหนแดงบอกชื่อท่อนนั้น */
function sectionsS2a(raw, at, opts) {
  const got = plain(raw);
  const out = {};
  for (const [name, shape] of Object.entries(got.shapes)) {
    for (const who of ['head', 'crew', 'resultTab']) {
      out[`${name} · การ์ดควบคุม · ${who}`] = stripControl(shape.control[who], `${at} · ${name} · ${who}`, opts);
    }
    stripJobZones(shape.job.zones, `${at} · ${name} · แถวของหัวหน้า`);
    stripJobZones(shape.job.salesZones, `${at} · ${name} · แถวของฝ่ายขาย`);
    out[`${name} · การ์ดงาน`] = shape.job;
    stripLabels(shape.commitDue.labels, `${at} · ${name}`);
    stripLabels(shape.commitDue.requeueLabels, `${at} · ${name} · ลงคิวใหม่`);
    out[`${name} · ลงคิว`] = shape.commitDue;
    out[`${name} · หัวคำร้อง`] = [shape.headerFacts, shape.headerFactsWithFlag];
  }
  out['การ์ดควบคุม · ส่งกลับค้าง'] = stripControl(got.controlSendBack, `${at} · ส่งกลับค้าง`, opts);
  for (const who of Object.keys(got.zoneList)) stripZoneList(got.zoneList[who], `${at} · รายการพื้นที่ · ${who}`);
  out['รายการพื้นที่'] = got.zoneList;
  out['กล่องส่งงาน'] = { submit: got.submit, sheetTotals: got.sheetTotals };
  const reg = got.registry;
  stripRegistryRow(reg.pending, `${at} · ทะเบียน · มีใบค้าง`);
  stripRegistryRow(reg.sent, `${at} · ทะเบียน · ส่งแล้ว`);
  stripRegistryRow(reg.never, `${at} · ทะเบียน · ไม่เคยประเมิน`, { assessed: false });
  take(reg.totals, 'awaitingConfirm', 0, at);
  for (const site of reg.totals.sites) {
    take(site, 'awaitingConfirm', 0, at);
    for (const zone of site.zones) stripRegistryRow(zone, `${at} · ทะเบียนลูกค้า · ${zone.name}`, { assessed: !!zone.surveyedAt || zone.surveyCount > 0 });
  }
  stripPick(reg.pick.pending, `${at} · ไทล์ · มีใบค้าง`);
  stripPick(reg.pick.sent, `${at} · ไทล์ · ส่งแล้ว`);
  stripPick(reg.pick.picked, `${at} · ไทล์ · ติ๊กแล้ว`);
  stripPick(reg.pick.never, `${at} · ไทล์ · ไม่เคยประเมิน`, { assessed: false });
  take(reg.site, 'drawing', 0, at);
  out['ทะเบียนพื้นที่'] = reg;
  return out;
}
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/* 🔴 จดจากโค้ดก่อนงวด S2a (HEAD `d7a3bf31`): `outcomeS2a` + `sectionsS2a` ชุดนี้ถูกรันบนสำเนา `git archive` ของ HEAD
   (ที่นั่นไม่มีคีย์ใหม่ให้หยิบ) แล้วจดลายนิ้วมือรายท่อนมา · สามแบบของแถวได้ค่าเดียวกัน · TZ=UTC กับ Asia/Bangkok ได้ค่าเดียวกัน
   ⇒ แดง = แก้ที่โค้ด · เปลี่ยนพฤติกรรมของใบลงหน้างานโดยตั้งใจ = จดใหม่ด้วยวิธีเดียวกันพร้อมเหตุผลในคอมมิต */
const GOLDEN_S2A = {
  'รอรับเรื่อง · การ์ดควบคุม · head': '467de8bac8544dce',
  'รอรับเรื่อง · การ์ดควบคุม · crew': '760b6798a1e9ae39',
  'รอรับเรื่อง · การ์ดควบคุม · resultTab': '467de8bac8544dce',
  'รอรับเรื่อง · การ์ดงาน': '4aa037647cd6cb24',
  'รอรับเรื่อง · ลงคิว': '1460a3b2f83aeb3d',
  'รอรับเรื่อง · หัวคำร้อง': '905e8e6afae9b562',
  'รับเรื่องแล้ว ยังไม่ลงคิว · การ์ดควบคุม · head': '99fa6ee064e3544c',
  'รับเรื่องแล้ว ยังไม่ลงคิว · การ์ดควบคุม · crew': '04d7c0529c34d620',
  'รับเรื่องแล้ว ยังไม่ลงคิว · การ์ดควบคุม · resultTab': '99fa6ee064e3544c',
  'รับเรื่องแล้ว ยังไม่ลงคิว · การ์ดงาน': 'fa06291fec748ba3',
  'รับเรื่องแล้ว ยังไม่ลงคิว · ลงคิว': '1460a3b2f83aeb3d',
  'รับเรื่องแล้ว ยังไม่ลงคิว · หัวคำร้อง': '905e8e6afae9b562',
  'ลงคิวแล้ว นัดไว้ · การ์ดควบคุม · head': '39f4a799e198ae74',
  'ลงคิวแล้ว นัดไว้ · การ์ดควบคุม · crew': 'a6ff0ca27482afef',
  'ลงคิวแล้ว นัดไว้ · การ์ดควบคุม · resultTab': '39f4a799e198ae74',
  'ลงคิวแล้ว นัดไว้ · การ์ดงาน': '741db45fa56109ef',
  'ลงคิวแล้ว นัดไว้ · ลงคิว': '4d9e60489f9987e9',
  'ลงคิวแล้ว นัดไว้ · หัวคำร้อง': 'd57d3761796999eb',
  'ลงคิวแล้ว นัดยังเป็นร่าง · การ์ดควบคุม · head': '785da48ad18c0e64',
  'ลงคิวแล้ว นัดยังเป็นร่าง · การ์ดควบคุม · crew': 'e605ccd3f3d115c9',
  'ลงคิวแล้ว นัดยังเป็นร่าง · การ์ดควบคุม · resultTab': '785da48ad18c0e64',
  'ลงคิวแล้ว นัดยังเป็นร่าง · การ์ดงาน': 'd2afe803d35a096e',
  'ลงคิวแล้ว นัดยังเป็นร่าง · ลงคิว': '4d9e60489f9987e9',
  'ลงคิวแล้ว นัดยังเป็นร่าง · หัวคำร้อง': 'd57d3761796999eb',
  'ช่างกำลังวัด · การ์ดควบคุม · head': 'e3f42e43223c0e0d',
  'ช่างกำลังวัด · การ์ดควบคุม · crew': '72dadcea90947816',
  'ช่างกำลังวัด · การ์ดควบคุม · resultTab': 'e3f42e43223c0e0d',
  'ช่างกำลังวัด · การ์ดงาน': '3c4b310a6231b074',
  'ช่างกำลังวัด · ลงคิว': '4d9e60489f9987e9',
  'ช่างกำลังวัด · หัวคำร้อง': 'd57d3761796999eb',
  'ช่างส่งงานแล้ว · การ์ดควบคุม · head': '88c645bd7f0f0f3b',
  'ช่างส่งงานแล้ว · การ์ดควบคุม · crew': '41636683f4f48c3b',
  'ช่างส่งงานแล้ว · การ์ดควบคุม · resultTab': '88c645bd7f0f0f3b',
  'ช่างส่งงานแล้ว · การ์ดงาน': 'f63260c7f35e18db',
  'ช่างส่งงานแล้ว · ลงคิว': '4d9e60489f9987e9',
  'ช่างส่งงานแล้ว · หัวคำร้อง': 'd57d3761796999eb',
  'นัดเข้าไม่ได้ · การ์ดควบคุม · head': 'd57de6efed29c039',
  'นัดเข้าไม่ได้ · การ์ดควบคุม · crew': '87309e9c281b8c3d',
  'นัดเข้าไม่ได้ · การ์ดควบคุม · resultTab': 'd57de6efed29c039',
  'นัดเข้าไม่ได้ · การ์ดงาน': '934856d30288497d',
  'นัดเข้าไม่ได้ · ลงคิว': '4d9e60489f9987e9',
  'นัดเข้าไม่ได้ · หัวคำร้อง': 'd57d3761796999eb',
  'นัดถูกยกเลิก · การ์ดควบคุม · head': '11ce69df58aaeb0e',
  'นัดถูกยกเลิก · การ์ดควบคุม · crew': 'a7e4f3f7d31c4944',
  'นัดถูกยกเลิก · การ์ดควบคุม · resultTab': '11ce69df58aaeb0e',
  'นัดถูกยกเลิก · การ์ดงาน': 'd17003b3285442e0',
  'นัดถูกยกเลิก · ลงคิว': '4d9e60489f9987e9',
  'นัดถูกยกเลิก · หัวคำร้อง': 'd57d3761796999eb',
  'มีวันบนใบแต่ไม่มีนัด · การ์ดควบคุม · head': '4675d6d6688276e1',
  'มีวันบนใบแต่ไม่มีนัด · การ์ดควบคุม · crew': 'df8492b26a2c2088',
  'มีวันบนใบแต่ไม่มีนัด · การ์ดควบคุม · resultTab': '4675d6d6688276e1',
  'มีวันบนใบแต่ไม่มีนัด · การ์ดงาน': '43207b670d5d5d2b',
  'มีวันบนใบแต่ไม่มีนัด · ลงคิว': '4d9e60489f9987e9',
  'มีวันบนใบแต่ไม่มีนัด · หัวคำร้อง': 'd57d3761796999eb',
  'ส่งผลแล้ว · การ์ดควบคุม · head': 'c16c284cfd08d18e',
  'ส่งผลแล้ว · การ์ดควบคุม · crew': 'e5d3c4fe35b42579',
  'ส่งผลแล้ว · การ์ดควบคุม · resultTab': 'c16c284cfd08d18e',
  'ส่งผลแล้ว · การ์ดงาน': '082e132dfe0ace2a',
  'ส่งผลแล้ว · ลงคิว': '4d9e60489f9987e9',
  'ส่งผลแล้ว · หัวคำร้อง': '2e9281c4e65832d8',
  'ปิดครบสองฝั่ง · การ์ดควบคุม · head': 'd5a07b87ddf3e5f5',
  'ปิดครบสองฝั่ง · การ์ดควบคุม · crew': '8900926adbe107b3',
  'ปิดครบสองฝั่ง · การ์ดควบคุม · resultTab': 'd5a07b87ddf3e5f5',
  'ปิดครบสองฝั่ง · การ์ดงาน': '7bf877276af30cbf',
  'ปิดครบสองฝั่ง · ลงคิว': '4d9e60489f9987e9',
  'ปิดครบสองฝั่ง · หัวคำร้อง': '2e9281c4e65832d8',
  'การ์ดควบคุม · ส่งกลับค้าง': '4d11a7278b8fde11',
  'รายการพื้นที่': '8d05c6fd164560ad',
  'กล่องส่งงาน': '240d894f02651b0b',
  'ทะเบียนพื้นที่': '029e1d6eae119c9d',
};

/* สวิตช์ของงวด S2a: ไม่ส่งเลย (ผู้เรียกเดิม) · ปิด · เปิดแล้วรู้ว่าเคยเข้าพื้นที่ / ยังไม่เคย / ไม่ทราบ
   ใบลงหน้างานล้วนต้องได้คีย์เดิมเท่ากันทุกแบบ — เปิดสวิตช์ต่างแค่คีย์ `method` (ปุ่มเปลี่ยนวิธี) ที่ถูกหยิบออกไปแล้ว */
const FLAGS = {
  'ไม่ส่งสวิตช์': [undefined, false],
  'สวิตช์ปิด': [{ drawingMethodEnabled: false, siteVisitReached: null }, false],
  'สวิตช์เปิด · เคยเข้าพื้นที่': [{ drawingMethodEnabled: true, siteVisitReached: true }, true],
  'สวิตช์เปิด · ยังไม่เคยเข้า': [{ drawingMethodEnabled: true, siteVisitReached: false }, true],
  'สวิตช์เปิด · ไม่ทราบ': [{ drawingMethodEnabled: true, siteVisitReached: null }, true],
};

for (const [name, way] of Object.entries(WAYS)) {
  for (const [flagName, [flags, flagOn]] of Object.entries(FLAGS)) {
    test(`🔴 งวด S2a · ใบลงหน้างานล้วน · ${name} · ${flagName} — คีย์เดิมของทุกตัวตัดสินฝั่งจอเท่าโค้ดก่อนงวด`, () => {
      const sections = sectionsS2a(outcomeS2a(way, flags), `${name} · ${flagName}`, { flagOn });
      assert.deepEqual(Object.keys(sections), Object.keys(GOLDEN_S2A));
      const moved = Object.entries(sections).filter(([key, value]) => fingerprint(value) !== GOLDEN_S2A[key]).map(([key]) => key);
      assert.deepEqual(moved, [], 'ท่อนที่ค่าหรือลำดับคีย์เปลี่ยน');
    });
  }
}

test('งวด S2a · สวิตช์เปิดบนใบลงหน้างานล้วน: ไม่มีบรรทัดด่านของงานจากแบบ (แถว 17 / 17a) ในทุกขั้นของใบ', () => {
  const rows = baseZones();
  for (const [name, make] of Object.entries(REQUEST_SHAPES)) {
    const { row, visit: v } = make();
    for (const siteVisitReached of [true, false, null]) {
      const on = plain(surveyControlView({
        request: row, zones: rows, filesByZone: filesByZone(), visit: v, viewer: HEAD_VIEWER, today: TODAY,
        drawingMethodEnabled: true, siteVisitReached,
      }));
      const off = plain(surveyControlView({
        request: row, zones: rows, filesByZone: filesByZone(), visit: v, viewer: HEAD_VIEWER, today: TODAY,
      }));
      const { method: methodOn, ...restOn } = on;
      const { method: methodOff, ...restOff } = off;
      assert.deepEqual(restOn, restOff, `${name} · ${siteVisitReached}`);
      assert.deepEqual(methodOff, METHOD_OFF, name);
      assert.equal(typeof methodOn.show, 'boolean', name);
    }
  }
});

test('งวด S2a · ส่งผลของใบลงหน้างานล้วน: โมดัลยืนยันเท่าเดิมทุกข้อ · ไม่มีท่อนต่อท้าย · ไม่ต้องส่งสัดส่วนวิธีหรือคำตอบยืนยัน', () => {
  for (const [name, way] of Object.entries(WAYS)) {
    const rows = baseZones().map(way);
    const cases = {
      noVisit: { docNo: 'RQ-AS-26100021', closesVisit: null },
      closesScheduled: { docNo: 'RQ-AS-26100021', closesVisit: visit('scheduled') },
      closesInProgress: {
        docNo: 'RQ-AS-26100021', closesVisit: visit('in_progress', { startTime: '10:12:00' }),
        sendBackPending: { itemCount: 1 }, issuesDocument: true,
      },
    };
    for (const [key, input] of Object.entries(cases)) {
      // ค่าที่จดไว้ของงวด S1 (โค้ดก่อนมีคีย์ method) — ส่ง null · ส่งสัดส่วนของใบลงหน้างาน (รูปที่การ์ดส่งจริง) ต้องเท่ากัน
      const methods = [
        null,
        { mix: { onsite: 2, drawing: 0, mode: 'onsite' }, confirm: null, openVisit: null },
        { mix: { onsite: 2, drawing: 0, mode: 'onsite' }, confirm: 'needed', openVisit: visit('scheduled') },
      ];
      for (const method of methods) {
        assert.deepEqual(plain(surveySendConfirm({ ...input, method })), GOLDEN.sendConfirm[key], `${name} · ${key}`);
      }
    }
    assert.equal(surveySendMethodText(rows, null), '', name);
    assert.equal(surveySendMethodText(rows, 'needed'), '', `${name} · มีคำตอบค้างมาก็ไม่พิมพ์`);
    assert.equal(surveySendMethodError(rows), null, name);
    assert.equal(surveySendMethodError(rows, {}), null, name);
    assert.equal(surveySendMethodError(rows, { methodMix: null, surveyConfirm: null }), null, name);
    assert.equal(surveySendMethodError(rows, { methodMix: { onsite: 2, drawing: 0 } }), null, name);
  }
  /* คำสั่งตอบใบของ route ส่งผล: คีย์ surveyConfirm ถูกใส่เฉพาะใบที่มีพื้นที่จากแบบ — พฤติกรรมจริง (แถวคำร้องที่ถูกเขียน ·
     บรรทัดเธรด · audit ของใบลงหน้างานล้วน) ถูกยืนยันกับ handler ตัวจริงที่ `surveyMethodSendChoice.test.mjs`
     ข้อ "route · ใบลงหน้างานล้วน" · ที่นี่ล็อกว่าเงื่อนไขนั้นยังเป็นทางเดียวที่คีย์เข้า patch */
  const route = fs.readFileSync(new URL('../../app/api/service/surveys/[id]/send/route.js', import.meta.url), 'utf8');
  const writes = route.match(/patch\.surveyConfirm\s*=/g) || [];
  assert.equal(writes.length, 1);
  assert.ok(route.includes('if (methodMix.drawing > 0) patch.surveyConfirm = body?.surveyConfirm;'));
  const choice = fs.readFileSync(new URL('./surveyMethodSendChoice.test.mjs', import.meta.url), 'utf8');
  assert.ok(choice.includes("assert.equal('surveyConfirm' in world.request(), false, at);"));
});
