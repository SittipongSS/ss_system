// ── ด่าน "รับงาน" / ปุ่มจับเวลา (แผน operation-crew C7 · S1) ─────────────────────────────
//
// ⭐ กติกาที่เทสต์ชุดนี้ยึด:
//   · ยังไม่ถึงวันนัด = รับงานไม่ได้ **ทุกตำแหน่ง** · ข้อความชี้ทางออกเดียว (ผู้จัดคิวเลื่อนนัดเป็นวันนี้)
//   · วันนี้ / เลยวันแล้ว = รับได้ · กดซ้ำบนใบที่กำลังทำ = 200 ไม่เขียน
//   · ร่าง / ยกเลิก / เลื่อนแล้ว = 409
//   · `stamp:'end'` บนนัดที่ยัง "นัดไว้" ของวันข้างหน้า = 409 (กัน "ไปแล้วเข้าไม่ได้" ปิดงานล่วงหน้า)
//   · "วันนี้" = นาฬิกาไทย (00:30 ไทยยังเป็นเมื่อวานของ UTC)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CREW_CLOSE_STAMP_ERROR, CREW_STATUS_ERROR, DEAD_CLOSE_ERRORS, DEAD_START_ERRORS, FUTURE_STAMP_ERROR,
  IN_PROGRESS_STAMP_ERROR, stampDecision, targetVisitStatus, visitMoveDecision,
} from './jobStart.js';
import { VISIT_STATUSES, isClosedVisit } from '../visitStatus.js';
import { businessDate } from '../../businessDate.js';

const TODAY = '2026-09-28';
const v = (o = {}) => ({ id: 'V1', kind: 'refill', status: 'scheduled', scheduledDate: TODAY, ...o });

test('🔴 ยังไม่ถึงวันนัด = รับงานไม่ได้ · ข้อความชี้ให้ผู้จัดคิวเลื่อนนัดเป็นวันนี้', () => {
  const out = stampDecision(v({ scheduledDate: '2026-09-29' }), 'start', TODAY);
  assert.deepEqual(out, { error: FUTURE_STAMP_ERROR });
  assert.match(FUTURE_STAMP_ERROR, /ยังไม่ถึงวันนัด/);
  assert.match(FUTURE_STAMP_ERROR, /ให้ผู้จัดคิวเลื่อนนัดเป็นวันนี้ก่อน/, 'ต้องชี้ทางออก (R11)');
});

test('วันนี้ / เลยวันแล้ว = รับงานได้ตามปกติ', () => {
  assert.equal(stampDecision(v(), 'start', TODAY), null, 'วันนี้');
  assert.equal(stampDecision(v({ scheduledDate: '2026-09-20' }), 'start', TODAY), null, 'ค้างจากสัปดาห์ก่อน');
});

test('⭐ กดรับงานซ้ำบนใบที่กำลังทำ = ไม่เขียน (ไม่ประทับเวลาเริ่มทับคนแรก)', () => {
  assert.deepEqual(stampDecision(v({ status: 'in_progress' }), 'start', TODAY), { noop: true });
  // ใบที่เริ่มไปแล้วก่อนมีด่านวันที่ — กดซ้ำก็ยังเป็น no-op ไม่ใช่ 409 ของวันข้างหน้า
  assert.deepEqual(stampDecision(v({ status: 'in_progress', scheduledDate: '2026-10-02' }), 'start', TODAY), { noop: true });
});

test('🔴 ร่าง / ยกเลิก / เลื่อนแล้ว = รับงานไม่ได้ (เดิม route ตั้ง in_progress ให้ทุกใบที่ยังไม่ปิด)', () => {
  for (const status of ['draft', 'cancelled', 'rescheduled']) {
    const out = stampDecision(v({ status }), 'start', TODAY);
    assert.deepEqual(out, { error: DEAD_START_ERRORS[status] }, status);
    assert.match(out.error, /ผู้จัดคิว/, `${status}: ต้องบอกว่าถามใคร`);
  }
  // ข้อความต่อสถานะต้องไม่ซ้ำกัน — ช่างต้องรู้ว่าใบนี้ติดเพราะอะไร
  assert.equal(new Set(Object.values(DEAD_START_ERRORS)).size, 3);
});

test('🔴 00:30 เวลาไทยบนเครื่องที่นาฬิกาเป็น UTC — วันนัดของ "วันนี้ไทย" ต้องรับได้', () => {
  const now = new Date('2026-09-28T17:30:00Z'); // = 29/09 00:30 ไทย
  assert.equal(businessDate(now), '2026-09-29');
  const visit = v({ scheduledDate: '2026-09-29' });
  assert.equal(stampDecision(visit, 'start', businessDate(now)), null);
  // ⚠️ ถ้าตัดวันจาก toISOString() ได้ 28/09 ⇒ นัดของวันนี้ถูกตีว่าเป็นวันข้างหน้า
  assert.deepEqual(stampDecision(visit, 'start', now.toISOString().slice(0, 10)), { error: FUTURE_STAMP_ERROR });
});

test('🔴 stamp:end บนนัดที่ยัง "นัดไว้" ของวันข้างหน้า = 409 (R7) · วันนี้/เลยวัน = ได้', () => {
  assert.deepEqual(stampDecision(v({ scheduledDate: '2026-10-01' }), 'end', TODAY), { error: FUTURE_STAMP_ERROR });
  assert.match(stampDecision(v({ scheduledDate: '2026-10-01' }), 'end', TODAY).error, /ให้ผู้จัดคิวเลื่อนนัดเป็นวันนี้ก่อน/);
  assert.equal(stampDecision(v(), 'end', TODAY), null, 'วันนี้');
  assert.equal(stampDecision(v({ scheduledDate: '2026-09-21' }), 'end', TODAY), null, 'เลยวันแล้ว');
  // ใบที่กำลังทำอยู่แล้วต้องปิดได้เสมอ ไม่งั้นค้าง "กำลังทำ" ถึงวันนัด
  assert.equal(stampDecision(v({ status: 'in_progress', scheduledDate: '2026-10-01' }), 'end', TODAY), null);
});

test('🔴 stamp:end บนนัดร่าง/ยกเลิก/เลื่อนแล้ว = ส่งงานไม่ได้ ทุกวัน (เดิมกิ่ง end ถามแค่ scheduled)', () => {
  for (const status of ['draft', 'cancelled', 'rescheduled']) {
    for (const scheduledDate of [TODAY, '2026-10-01', '2026-09-20']) {
      assert.deepEqual(stampDecision(v({ status, scheduledDate }), 'end', TODAY), { error: DEAD_CLOSE_ERRORS[status] },
        `${status} ${scheduledDate}`);
    }
    assert.match(DEAD_CLOSE_ERRORS[status], /ส่งงานไม่ได้/);
    assert.match(DEAD_CLOSE_ERRORS[status], /ผู้จัดคิว/);
  }
  assert.equal(new Set(Object.values(DEAD_CLOSE_ERRORS)).size, 3);
});

/* ═══ ด่านของการย้ายสถานะ — ตัดสินจากปลายทาง ไม่ใช่จาก body.stamp (รีวิว S1 28/09) ═══ */
const FUTURE = '2026-10-01';
const crew = { ownWorkOnly: true, today: TODAY };
const planner = { ownWorkOnly: false, today: TODAY };

test('สถานะปลายทาง: stamp:start = กำลังทำ · ส่ง status = ค่านั้น · ไม่ส่ง = เท่าเดิม · null = นัดไว้ (ตาม normalize)', () => {
  assert.equal(targetVisitStatus(v(), { stamp: 'start', status: 'done' }), 'in_progress');
  assert.equal(targetVisitStatus(v(), { status: 'unable' }), 'unable');
  assert.equal(targetVisitStatus(v({ status: 'in_progress' }), { note: 'x' }), 'in_progress');
  assert.equal(targetVisitStatus(v({ status: 'in_progress' }), { status: null }), 'scheduled');
});

test('🔴 "กำลังทำ" ตั้งได้จากปุ่มรับงานเท่านั้น — ไม่ส่ง stamp = 409 ทุกตำแหน่ง ทุกวัน ทุกสถานะต้นทาง', () => {
  for (const opts of [crew, planner]) {
    for (const status of ['scheduled', 'draft', 'cancelled', 'rescheduled', 'done', 'unable']) {
      for (const scheduledDate of [TODAY, FUTURE]) {
        assert.deepEqual(visitMoveDecision(v({ status, scheduledDate }), { status: 'in_progress' }, opts),
          { error: IN_PROGRESS_STAMP_ERROR }, `${opts.ownWorkOnly ? 'crew' : 'planner'} ${status} ${scheduledDate}`);
      }
    }
  }
  // ใบที่กำลังทำอยู่แล้วส่งสถานะเดิมมา (ฟอร์มแก้นัดล็อกสถานะไว้) = ไม่ใช่การย้าย
  assert.equal(visitMoveDecision(v({ status: 'in_progress' }), { status: 'in_progress', note: 'x' }, planner), null);
});

test('ด่านรับงานเดิมยังอยู่ในตัวครอบ — วันข้างหน้า/ร่าง/ยกเลิก = 409 · กดซ้ำ = no-op · วันนี้ = ผ่าน', () => {
  assert.deepEqual(visitMoveDecision(v({ scheduledDate: FUTURE }), { stamp: 'start' }, planner), { error: FUTURE_STAMP_ERROR });
  assert.deepEqual(visitMoveDecision(v({ status: 'cancelled' }), { stamp: 'start' }, crew), { error: DEAD_START_ERRORS.cancelled });
  assert.deepEqual(visitMoveDecision(v({ status: 'in_progress' }), { stamp: 'start' }, crew), { noop: true });
  assert.equal(visitMoveDecision(v(), { stamp: 'start', status: 'in_progress' }, crew), null);
});

test('🔴 ช่างปิดงานโดยไม่ส่ง stamp: วันข้างหน้า/ร่าง/ยกเลิก/เลื่อน = ข้อความเดียวกับปุ่มส่งงาน · วันนี้ = ต้องมาทางปุ่ม', () => {
  for (const status of ['done', 'partial', 'unable']) {
    assert.deepEqual(visitMoveDecision(v({ scheduledDate: FUTURE }), { status }, crew), { error: FUTURE_STAMP_ERROR }, status);
    for (const from of ['draft', 'cancelled', 'rescheduled']) {
      assert.deepEqual(visitMoveDecision(v({ status: from, scheduledDate: FUTURE }), { status }, crew),
        { error: DEAD_CLOSE_ERRORS[from] }, `${from} → ${status}`);
    }
    assert.deepEqual(visitMoveDecision(v(), { status }, crew), { error: CREW_CLOSE_STAMP_ERROR }, `วันนี้ ${status}`);
  }
  // ผ่านปุ่มส่งงาน (stamp:end) วันนี้/เลยวัน/ใบที่กำลังทำของวันข้างหน้า = ได้
  assert.equal(visitMoveDecision(v(), { stamp: 'end', status: 'unable' }, crew), null);
  assert.equal(visitMoveDecision(v({ scheduledDate: '2026-09-20' }), { stamp: 'end', status: 'done' }, crew), null);
  assert.equal(visitMoveDecision(v({ status: 'in_progress', scheduledDate: FUTURE }), { stamp: 'end', status: 'done' }, crew), null);
  // stamp:end บนใบที่เลื่อนแล้วของวันข้างหน้า (เคสจากรีวิว) = 409
  assert.deepEqual(visitMoveDecision(v({ status: 'rescheduled', scheduledDate: FUTURE }), { stamp: 'end', status: 'unable' }, crew),
    { error: DEAD_CLOSE_ERRORS.rescheduled });
});

test('🔴 ช่างยกเลิก/เลื่อน/ตั้งกลับนัดไว้/ร่าง เองไม่ได้ (403 เรื่องสิทธิ์) — ส่ง stamp มาด้วยก็ไม่ได้', () => {
  for (const status of ['cancelled', 'rescheduled', 'scheduled', 'draft']) {
    for (const from of ['scheduled', 'in_progress']) {
      if (status === from) continue;
      for (const body of [{ status }, { status, stamp: 'end' }]) {
        assert.deepEqual(visitMoveDecision(v({ status: from }), body, crew), { error: CREW_STATUS_ERROR, forbidden: true },
          `${from} → ${status} ${body.stamp || ''}`);
      }
    }
  }
  assert.match(CREW_STATUS_ERROR, /ผู้จัดคิว/);
});

test('ผู้จัดคิวยังทำงานเดิมได้: ยกเลิก/เลื่อน/ปล่อยร่าง/ปิด "ทำไม่ได้" ด้วยมือ (ฟอร์มแก้นัด) · ฟอร์มที่ไม่แตะสถานะ = ผ่าน', () => {
  assert.equal(visitMoveDecision(v({ scheduledDate: FUTURE }), { status: 'unable', unableReason: 'ลูกค้าปิดร้านถาวรแล้วครับ' }, planner), null);
  assert.equal(visitMoveDecision(v(), { status: 'cancelled' }, planner), null);
  assert.equal(visitMoveDecision(v({ status: 'draft' }), { status: 'scheduled' }, planner), null);
  assert.equal(visitMoveDecision(v({ status: 'unable' }), { status: 'scheduled' }, planner), null, 'เปิดใบที่ทำไม่ได้กลับ');
  assert.equal(visitMoveDecision(v({ scheduledDate: FUTURE }), { note: 'x' }, crew), null, 'ช่างเขียนหมายเหตุ');
});

test('ตัวครอบถามชุด "ปิดแล้ว" ชุดเดียวกับ isClosedVisit — สถานะปิดใหม่วันหน้าต้องผ่านด่านเดียวกัน', () => {
  for (const status of VISIT_STATUSES) {
    if (status === 'in_progress' || status === 'scheduled') continue;
    const out = visitMoveDecision(v(), { status }, crew);
    if (isClosedVisit({ status })) assert.deepEqual(out, { error: CREW_CLOSE_STAMP_ERROR }, status);
    else assert.equal(out?.forbidden, true, status);
  }
});

test('ไม่ใช่ปุ่มจับเวลา (ฟอร์มแก้นัด) = ไม่ใช่เรื่องของด่านนี้', () => {
  for (const stamp of [undefined, null, false, 'other']) {
    assert.equal(stampDecision(v({ scheduledDate: '2026-10-01' }), stamp, TODAY), null, String(stamp));
  }
  // ไม่มีวันนัด / ไม่รู้วันนี้ = ตัดสินไม่ได้ ⇒ ไม่บล็อก (ด่านอื่นของ route ตอบเอง)
  assert.equal(stampDecision(v({ scheduledDate: null }), 'start', TODAY), null);
  assert.equal(stampDecision(v({ scheduledDate: '2026-10-01' }), 'start', ''), null);
});

/* ═══ route ต่อสายจริง (ยามอ่านซอร์ส — พฤติกรรมผ่าน handler อยู่ที่ visitPatchEvidence.test.mjs) ═══ */
const route = readFileSync(new URL('../../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');
const patch = route.slice(route.indexOf('export const PATCH'), route.indexOf('export const DELETE'));

test('🔴 PATCH ถาม visitMoveDecision ด้วยวันไทย หลังสรุป closeFromAssets + ด่านใบที่ปิดแล้ว และก่อนตั้ง in_progress', () => {
  const call = patch.search(/visitMoveDecision\(before, body, \{ ownWorkOnly: access\.ownWorkOnly, today: businessDate\(\) \}\)/);
  assert.ok(call > 0, 'ต้องส่ง body ทั้งก้อน + ธงช่าง + businessDate() — ห้ามวันจาก toISOString');
  assert.equal(/stampDecision\(/.test(patch), false, 'ห้ามถามด่านจาก body.stamp อย่างเดียวอีก');
  const derived = patch.indexOf('body.status = deriveVisitStatus');
  assert.ok(derived > 0 && derived < call, 'ต้องตัดสินหลัง closeFromAssets สรุปสถานะลง body แล้ว');
  const closed = patch.search(/if \(body\.stamp && isClosedVisit\(before\)\)/);
  assert.ok(closed > 0 && closed < call, 'ด่านใบที่ปิดแล้วเดิม (ปักไว้) ต้องมาก่อน');
  assert.ok(call < patch.indexOf("body.status = 'in_progress'"), 'ต้องตัดสินก่อน route ตั้งสถานะให้');
  assert.ok(call < patch.indexOf('.update({ ...patch'), 'ต้องตัดสินก่อนเขียนแถว');
  assert.match(patch, /if \(startGate\?\.error\) return startGate\.forbidden \? forbidden\(startGate\.error\) : conflict\(startGate\.error\);/);
});
