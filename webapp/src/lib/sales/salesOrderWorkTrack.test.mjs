import test from 'node:test';
import assert from 'node:assert/strict';

import { salesOrderWorkTrack } from './salesOrderWorkTrack.js';

const scentWithRequest = (status) => ({
  hasDesignLines: true, count: 2, blocked: null,
  existing: { id: 'RQ1', docNo: 'SB-26080002', status },
});
const readinessReady = { state: 'ready', label: 'ของครบแล้ว', total: 7, arrived: 7 };
const readinessLate = { state: 'blocked', label: 'เลยกำหนดแล้ว 2 รายการ', total: 7, arrived: 4 };
const planRunning = { state: 'running', label: 'กำลังผลิต', jobs: [{}, {}] };

const keys = (track) => track.segments.map((s) => s.key);

/* 🔴 กฎที่ต้องอยู่ตลอด — ใบขายสินค้าธรรมดาไม่ควรเห็นช่วงที่ไม่เกี่ยวกับมัน
   (กฎเดียวกับที่การ์ดบรีฟกลิ่นเดิมซ่อนทั้งใบเมื่อไม่มีบรรทัดออกแบบกลิ่น) */
test('ใบที่ไม่ใช่งานออกแบบกลิ่น — ช่วงบรีฟกลิ่นหายไปทั้งช่วง เหลือสองช่วง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, approved: true,
  });
  assert.deepEqual(keys(track), ['delivery', 'production']);
});

test('ใบงานออกแบบกลิ่นได้ครบสามช่วง', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('pending'), readiness: readinessReady, plan: planRunning, approved: true,
  });
  assert.deepEqual(keys(track), ['scent', 'delivery', 'production']);
});

/* 🔴 "ยังไม่เชื่อม" ต้องขึ้นคำชวนกด ไม่ใช่จุดเปล่า — จุดเปล่าไม่บอกว่าต้องทำอะไรต่อ */
test('ช่วงที่ยังไม่เชื่อมขึ้นคำชวน ไม่มีจุดสเตจ', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: true, count: 2, existing: null, blocked: null },
    readiness: { state: 'unknown' },
    plan: { state: 'none' },
    projectId: 'PJ1',
    approved: true,
  });
  for (const seg of track.segments) {
    assert.equal(seg.steps, undefined, `${seg.key} ไม่ควรมีจุด`);
    assert.ok(seg.connect?.message, `${seg.key} ต้องมีข้อความชวน`);
  }
  assert.equal(track.segments[1].connect.href, '/sa/projects/PJ1?tab=timeline');
});

test('เปิดคำร้องไม่ได้ → ขึ้นเหตุผล ไม่ขึ้นปุ่ม', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: true, count: 0, existing: null, blocked: 'ใบนี้ยังไม่อนุมัติ' },
    readiness: readinessReady, plan: planRunning,
  });
  assert.equal(track.segments[0].connect.message, 'ใบนี้ยังไม่อนุมัติ');
  assert.equal(track.segments[0].connect.actionLabel, null);
});

/* ⚠️ ใบที่ยังไม่อนุมัติ "ยังไม่มีงานผลิต" เป็นเรื่องปกติ ไม่ใช่สิ่งที่ต้องชวนให้กด */
test('ใบที่ยังไม่อนุมัติไม่ชวนให้ไปเปิดคิวงานผลิต', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: { state: 'none' }, approved: false,
  });
  const production = track.segments.at(-1);
  assert.equal(production.connect.actionLabel, null);
  assert.match(production.connect.message, /หลังใบนี้อนุมัติ/);
});

/* 🔴 "เลยกำหนด" เป็นสุขภาพของขั้นเดียวกัน ไม่ใช่ขั้นที่สี่ — จุดต้องคงเหลือ 3 */
test('ของเข้าเลยกำหนด: จุดยังมีสามจุด แต่จุดกลางเป็นแดง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessLate, plan: planRunning, approved: true,
  });
  const delivery = track.segments[0];
  assert.equal(delivery.steps.length, 3);
  assert.equal(delivery.state, 'late');
  assert.deepEqual(delivery.steps.map((s) => s.state), ['done', 'late', 'todo']);
});

test('ของครบแล้ว = ช่วงนั้น done ทุกจุด', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, approved: true,
  });
  const delivery = track.segments[0];
  assert.equal(delivery.state, 'done');
  assert.deepEqual(delivery.steps.map((s) => s.state), ['done', 'done', 'live']);
});

test('คำร้องปิดเรื่องแล้ว = ช่วงบรีฟกลิ่น done', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'), readiness: readinessReady, plan: planRunning, approved: true,
  });
  assert.equal(track.segments[0].state, 'done');
  assert.equal(track.segments[0].steps.at(-1).state, 'live');
});

/* current = "ตอนนี้ติดอยู่ตรงไหน" ซึ่งเป็นคำถามที่เส้นนี้มีไว้ตอบ */
test('current คือช่วงแรกที่ยังไม่จบ', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'), readiness: readinessLate, plan: planRunning, approved: true,
  });
  assert.equal(track.current.key, 'delivery');
});

test('ทุกช่วงจบแล้ว current ตกที่ช่วงสุดท้าย ไม่ใช่ null', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'),
    readiness: readinessReady,
    plan: { state: 'done', label: 'ผลิตเสร็จแล้ว', jobs: [{}] },
    approved: true,
  });
  assert.equal(track.current.key, 'production');
});

test('ไม่มีข้อมูลเลยยังได้สองช่วง (ของเข้า/ผลิต) ไม่ใช่ null', () => {
  const track = salesOrderWorkTrack({});
  assert.deepEqual(keys(track), ['delivery', 'production']);
});
