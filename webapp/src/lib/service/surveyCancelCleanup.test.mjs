import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cancelCleanupSummary, zoneCleanupDecision } from './surveyCancelCleanup.js';
import { cancelRequestError, closeUnassessedError } from '@/lib/requests/stages';

const request = (over = {}) => ({
  id: 'REQ1', kind: 'site_survey', dept: 'TS', status: 'pending',
  acknowledgedAt: null, createdAt: '2026-09-01T00:00:00Z', ...over,
});
const zone = (over = {}) => ({ id: 'ZN1', code: 'ZN-A-01', createdAt: '2026-09-02T00:00:00Z', ...over });

/* ══ ยกเลิกได้ก่อน TS รับเรื่องเท่านั้น (มติข้อ 24) ══════════════════════ */

test('🔑 ใบประเมิน: รับเรื่องแล้วยกเลิกไม่ได้ และต้องบอกทางออก', () => {
  const err = cancelRequestError(request({ status: 'acknowledged', acknowledgedAt: '2026-09-05' }));
  assert.match(err, /ยกเลิกไม่ได้/);
  assert.match(err, /ปิดใบโดยไม่ได้ประเมิน/, 'ห้ามห้ามเฉย ๆ — ต้องบอกว่าไปต่อทางไหน');
});

test('ใบประเมินที่ยังไม่ถูกรับเรื่อง ยกเลิกได้ตามปกติ', () => {
  assert.equal(cancelRequestError(request()), null);
});

/* 🔴 **ห้ามรัดด่านกลางให้แคบทั้งระบบ** — หัวข้ออื่นใช้ "ยกเลิก" เป็นทางออกมาตรฐาน
   หลังรับเรื่อง (`closeRequestError` โยนคนมาหาคำนี้ถึงสามจุด) ⇒ รัดแล้วใบ RD/PC
   ที่รับเรื่องแล้วแต่ล้ม จะค้างถาวรไม่มีประตูออก */
test('🔴 หัวข้ออื่นต้องไม่โดนกระทบ — ยกเลิกหลังรับเรื่องได้เหมือนเดิม', () => {
  for (const kind of ['scent_dev', 'formula_dev', 'doc_request', 'material_price']) {
    assert.equal(
      cancelRequestError(request({ kind, status: 'acknowledged', acknowledgedAt: '2026-09-05' })),
      null,
      kind,
    );
  }
});

/* ══ ทางออกหลังรับเรื่อง: ฝ่ายปิดใบโดยไม่ได้ผล ═══════════════════════════ */

test('🔑 ปิดใบโดยไม่ได้ประเมิน — มีเฉพาะหัวข้อที่ปิดประตูยกเลิกไว้', () => {
  const ack = request({ status: 'acknowledged', acknowledgedAt: '2026-09-05' });
  assert.equal(closeUnassessedError(ack, { reason: 'ลูกค้ายกเลิกโครงการทั้งหมด' }), null);

  // เหตุผลบังคับ — ผู้ขอรอผลอยู่ แล้วจู่ ๆ ใบจบโดยไม่มีผล
  assert.match(closeUnassessedError(ack, { reason: 'สั้น' }), /10 ตัวอักษร/);

  /* 🔴 ประตูนี้ต้องไม่กลายเป็นทางที่สองให้ฝ่ายลากปิดใบเองในหัวข้อที่ตั้งใจให้
     ผู้ขอเป็นคนปิด (กติกา "ปิดสองฝั่ง") */
  assert.match(
    closeUnassessedError(request({ kind: 'scent_dev', status: 'acknowledged', acknowledgedAt: 'x' }), { reason: 'ลูกค้ายกเลิกแล้ว' }),
    /ไม่มีขั้น/,
  );

  // ส่งผลไปแล้ว = ของอยู่ในมือผู้ขอ การปิดเป็นเรื่องของเขา
  assert.match(closeUnassessedError({ ...ack, answeredAt: 'x' }, { reason: 'ลูกค้ายกเลิกแล้ว' }), /ให้ผู้ขอกดปิด/);
  // ยังไม่รับเรื่อง = ยกเลิกได้เองอยู่แล้ว ไม่ต้องใช้ประตูนี้
  assert.match(closeUnassessedError(request(), { reason: 'ลูกค้ายกเลิกแล้ว' }), /ยกเลิกใบได้เอง/);
});

/* ══ เก็บกวาดพื้นที่ที่ใบสร้างไว้ ═══════════════════════════════════════ */

test('🔑 ลบเฉพาะพื้นที่ที่ใบนี้สร้าง และยังไม่มีใครใช้', () => {
  const ok = zoneCleanupDecision({ zone: zone(), request: request(), refs: {} });
  assert.equal(ok.action, 'delete');
});

/* ⚠️ พื้นที่ที่มีอยู่ก่อนใบ = ทะเบียนของลูกค้า ไม่ใช่ขยะของใบนี้
   (SA ติ๊กมาจากทะเบียน — โซนพวกนี้เกิดก่อนใบเสมอ) */
test('🔴 พื้นที่ที่มีอยู่ก่อนใบ ห้ามลบ', () => {
  const d = zoneCleanupDecision({
    zone: zone({ createdAt: '2026-08-01T00:00:00Z' }), request: request(), refs: {},
  });
  assert.equal(d.action, 'keep');
  assert.match(d.reason, /ก่อนใบนี้/);
});

test('🔴 ขายไปแล้ว / มีเครื่อง / มีใบอื่นอ้างถึง — เก็บไว้ทั้งหมด', () => {
  const cases = [
    [{ terms: 1 }, /ขายไปแล้ว|มีเครื่อง/],
    [{ assets: 2 }, /ขายไปแล้ว|มีเครื่อง/],
    [{ otherSurveyRows: 1 }, /ใบอื่น/],
  ];
  for (const [refs, re] of cases) {
    const d = zoneCleanupDecision({ zone: zone(), request: request(), refs });
    assert.equal(d.action, 'keep');
    assert.match(d.reason, re);
  }
});

/* fail-closed: ไม่รู้เวลา = ไม่ลบ · ของในทะเบียนลูกค้าห้ามหายเพราะเดา */
test('⚠️ ไม่รู้เวลาสร้าง = ไม่ลบ', () => {
  assert.equal(zoneCleanupDecision({ zone: zone({ createdAt: null }), request: request(), refs: {} }).action, 'keep');
  assert.equal(zoneCleanupDecision({ zone: zone(), request: request({ createdAt: null }), refs: {} }).action, 'keep');
  assert.equal(zoneCleanupDecision({}).action, 'keep');
});

test('สรุปที่เขียนลง audit บอกทั้งที่ลบและที่เก็บไว้', () => {
  assert.equal(cancelCleanupSummary({}), '');
  const text = cancelCleanupSummary({ deleted: ['ZN-A-01'], kept: ['ZN-A-02 (ขายไปแล้ว)'] });
  assert.match(text, /ZN-A-01/);
  assert.match(text, /เก็บไว้ 1/);
});

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────── */
test('🔴 route ยกเลิกต้องเรียกตัวเก็บกวาด และเรียกหลังใบถูกยกเลิกสำเร็จ', () => {
  const route = readFileSync(
    new URL('../../app/api/sa/requests/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /cleanupCancelledSurveyZones\(/);
  assert.match(route, /action === 'close-unassessed'/, 'ต้องมีทางออกหลังรับเรื่อง');

  /* ⚠️ เก็บกวาดต้องอยู่ **หลัง** จุดที่อ่านแถวหลังอัปเดต — เก็บกวาดก่อนแล้วใบยกเลิก
     ไม่สำเร็จ = ลบพื้นที่ของใบที่ยังมีชีวิตอยู่ */
  const afterAt = route.indexOf('const after = await findRequest');
  const cleanupAt = route.indexOf('cleanupCancelledSurveyZones(supabase');
  assert.ok(afterAt > 0 && cleanupAt > afterAt, 'ต้องเก็บกวาดหลังใบถูกยกเลิกสำเร็จแล้ว');
});

/* 🪤 ธงรายหัวข้อพิมพ์ผิดแล้วเงียบ — ทะเบียนไม่เคยมี whitelist ของคีย์ระดับบนสุด */
test('🪤 ธงบูลีนของหัวข้อต้องถูกตรวจชนิด', async () => {
  const { assertKind } = await import('@/lib/requests/kinds/registry');
  assert.throws(
    () => assertKind({ key: 'x', label: 'x', scope: 'XX', cancelBeforeAckOnly: 'yes' }),
    /ต้องเป็น true\/false/,
  );
});
