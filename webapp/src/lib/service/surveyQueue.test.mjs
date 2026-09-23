// ── คำร้องประเมินพื้นที่ที่ "รอลงคิว" — ขั้นของใบ (มติเจ้าของ 23/09) ─────────────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด:
//   · ใบรอรับเรื่องได้การ์ดด้วย แต่ขั้นของมันคือ "รับเรื่อง" — ไม่มีคลิกเดียวที่ข้ามสองก้าว
//   · ใบที่มีนัดที่ยังมีชีวิตอยู่แล้วไม่ใช่การ์ดคำร้อง (การ์ดนัดโผล่แทน) — ไม่งั้นใบเดียวสองการ์ด
//   · ช่างไปถึงไซต์แล้ว (เข้าแล้ว · ทำไม่ครบ) ≠ ต้องลงคิวใหม่ · เข้าไม่ได้/ยกเลิก/เลื่อน = ลงคิวใหม่
//   · ใบที่ไม่ใช่ประเมินพื้นที่ · ไม่ได้เดินอยู่ · ผู้ขอปิดแล้ว = ไม่มีการ์ด
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_REQUEST_KINDS, SURVEY_QUEUE_STEPS, SURVEY_QUEUE_STEP_LABELS,
  liveSurveyVisitsByRequest, pickSurveyVisit, surveyQueueStep, visitReachedSite,
} from './surveyQueue.js';
import {
  REQUEST_SLOT_VISIT_STATES, VISIT_STATUSES, holdsRequestSlot, isDraftVisit, isOpenVisit,
} from './visitStatus.js';
import { apiWriteAllowed } from '../../proxy.js';

const base = {
  id: 'DR-1', docNo: 'AS-26090001', kind: 'site_survey', dept: 'TS', siteId: 'SVS-1',
  status: 'acknowledged', acknowledgedAt: '2026-09-20T02:00:00.000Z',
  committedDueDate: null, closedAt: null, surveyVisit: null,
};
const dated = { ...base, committedDueDate: '2026-09-25', dueCommittedAt: '2026-09-21T02:00:00.000Z' };

test('หัวข้อที่เป็นนัดเข้าไซต์ได้อ่านจากทะเบียน (needs site) — วันนี้มีตัวเดียวคือประเมินพื้นที่', () => {
  assert.deepEqual([...SITE_REQUEST_KINDS], ['site_survey']);
  assert.ok(Object.isFrozen(SITE_REQUEST_KINDS));
  assert.deepEqual([...SURVEY_QUEUE_STEPS], ['requeue', 'acknowledge', 'queue'], 'ลำดับบนจอ: นัดหลุดก่อน');
  assert.deepEqual({ ...SURVEY_QUEUE_STEP_LABELS }, {
    acknowledge: 'รอรับเรื่อง', queue: 'รอลงคิว', requeue: 'ไม่มีนัดบนตาราง',
  });
});

test('⭐ รอรับเรื่อง = การ์ดขั้น "รับเรื่อง" (ไม่ข้ามไปลงคิว)', () => {
  assert.equal(surveyQueueStep({ ...base, status: 'pending', acknowledgedAt: null }), 'acknowledge');
});

test('⭐ รับเรื่องแล้ว ยังไม่มีวัน = ลงคิว', () => {
  assert.equal(surveyQueueStep(base), 'queue');
  assert.equal(surveyQueueStep({ ...base, committedDueDate: '  ' }), 'queue', 'ช่องว่างล้วนคือยังไม่มีวัน');
});

test('🔴 มีนัดที่ยังมีชีวิตอยู่แล้ว (ร่าง · นัดไว้ · กำลังทำ) = ไม่ใช่การ์ดคำร้อง', () => {
  for (const status of REQUEST_SLOT_VISIT_STATES) {
    const visit = { id: 'V1', status };
    assert.equal(surveyQueueStep({ ...dated, surveyVisit: visit }), null, status);
    assert.equal(surveyQueueStep({ ...base, surveyVisit: visit }), null, `${status} (ไม่มีวันบนใบ)`);
  }
});

test('⭐ มีวันแล้ว แต่นัดเดิมจบแบบ "ไม่ได้ไป" / ไม่มีนัดเลย = ลงคิวใหม่', () => {
  for (const status of ['cancelled', 'rescheduled', 'unable']) {
    assert.equal(surveyQueueStep({ ...dated, surveyVisit: { id: 'V1', status } }), 'requeue', status);
  }
  assert.equal(surveyQueueStep(dated), 'requeue', 'นัดสร้างไม่สำเร็จ/ถูกลบ');
});

test('🐞 ช่างไปถึงไซต์แล้ว (เข้าแล้ว · ทำไม่ครบ) ≠ ลงคิวใหม่ — งานเดินหน้าไปรอผล', () => {
  for (const status of ['done', 'partial']) {
    assert.equal(visitReachedSite({ status }), true, status);
    assert.equal(surveyQueueStep({ ...dated, surveyVisit: { id: 'V1', status } }), null, status);
  }
  assert.equal(visitReachedSite({ status: 'unable' }), false, 'เข้าไม่ได้ = ยังไม่ถึง');
  assert.equal(visitReachedSite(null), false);
});

test('ทุกสถานะนัด × ใบที่มีวันแล้ว — ตารางคำตอบครบ', () => {
  const expected = {
    draft: null, scheduled: null, in_progress: null, done: null, partial: null,
    unable: 'requeue', rescheduled: 'requeue', cancelled: 'requeue',
  };
  assert.deepEqual(Object.keys(expected).sort(), [...VISIT_STATUSES].sort());
  for (const status of VISIT_STATUSES) {
    assert.equal(surveyQueueStep({ ...dated, surveyVisit: { id: 'V', status } }), expected[status], status);
  }
});

test('ผู้ขอปิดฝั่งตัวเองแล้ว · ใบไม่ได้เดินอยู่ · ไม่ใช่ใบประเมิน = ไม่มีการ์ด', () => {
  assert.equal(surveyQueueStep({ ...base, closedAt: '2026-09-22T03:00:00.000Z' }), null);
  assert.equal(surveyQueueStep({ ...dated, closedAt: '2026-09-22T03:00:00.000Z' }), null);
  for (const status of ['draft', 'answered', 'closed', 'cancelled']) {
    assert.equal(surveyQueueStep({ ...base, status }), null, status);
  }
  assert.equal(surveyQueueStep({ ...base, kind: 'info' }), null, 'สอบถามข้อมูลไม่มีทางเป็นนัด');
  assert.equal(surveyQueueStep({ ...base, kind: 'info', status: 'pending' }), null);
  assert.equal(surveyQueueStep(null), null);
  assert.equal(surveyQueueStep({}), null);
});

test('pickSurveyVisit — นัดที่ยังมีชีวิตล่าสุดก่อน (แม้เก่ากว่าแถวที่ปิด) · ไม่มีค่อยเอาแถวล่าสุด', () => {
  const closedNew = { id: 'V2', status: 'cancelled', createdAt: '2026-09-21T00:00:00Z' };
  const liveOld = { id: 'V1', status: 'scheduled', createdAt: '2026-09-10T00:00:00Z' };
  assert.equal(pickSurveyVisit([closedNew, liveOld]), liveOld);
  const older = { id: 'V0', status: 'unable', createdAt: '2026-09-01T00:00:00Z' };
  assert.equal(pickSurveyVisit([older, closedNew]), closedNew);
  const liveNewer = { id: 'V3', status: 'draft', createdAt: '2026-09-22T00:00:00Z' };
  assert.equal(pickSurveyVisit([liveOld, liveNewer, closedNew]), liveNewer);
  assert.equal(pickSurveyVisit([]), null);
  assert.equal(pickSurveyVisit(undefined), null);
  assert.equal(pickSurveyVisit([null, older]), older);
});

test('liveSurveyVisitsByRequest — จับเฉพาะนัดที่ยังกินสิทธิ์ของใบ', () => {
  const map = liveSurveyVisitsByRequest([
    { id: 'V1', requestId: 'R1', status: 'scheduled', createdAt: '2026-09-01' },
    { id: 'V2', requestId: 'R2', status: 'done', createdAt: '2026-09-01' },
    { id: 'V3', requestId: null, status: 'draft' },
    { id: 'V4', requestId: 'R3', status: 'draft', createdAt: '2026-09-01' },
    { id: 'V5', requestId: 'R3', status: 'scheduled', createdAt: '2026-09-05' },
  ]);
  assert.deepEqual([...map.keys()].sort(), ['R1', 'R3']);
  assert.equal(map.get('R3').id, 'V5');
  assert.equal(liveSurveyVisitsByRequest(undefined).size, 0);
});

test('🔴 ชุด "นัดยังมีชีวิตของใบ" ⊆ ชุดสถานะที่รายการงานโหลด — ตัวโหลดคำร้องไม่ต้องยิงถามว่า "ลงคิวแล้วหรือยัง"', () => {
  const queueOpen = VISIT_STATUSES.filter((s) => isDraftVisit({ status: s }) || isOpenVisit({ status: s }));
  for (const status of REQUEST_SLOT_VISIT_STATES) {
    assert.ok(queueOpen.includes(status), status);
    assert.equal(holdsRequestSlot({ status }), true);
  }
});

test('proxy ปล่อย PATCH คำร้องของ TS (รับเรื่อง/ลงคิวจากหน้าจัดคิว) ไปถึง handler', () => {
  for (const role of ['ts_planner', 'ts_manager']) {
    assert.equal(apiWriteAllowed('PATCH', '/api/sa/requests/DR-1', role, []), true, role);
  }
  // เจ้าหน้าที่ Operation ไม่ใช่คนตอบคำร้อง — API จึงไม่ส่งการ์ดคำร้องให้เลย (surveyRequests: null)
  assert.equal(apiWriteAllowed('PATCH', '/api/sa/requests/DR-1', 'ts', []), false);
});
