// ── ป้าย "รายการ n · FG" ของรอบขาย (review 29/09) — ตัวช่วยเดียวของแท็บงานบริการของใบ + แถวคิว TS ─────────────
//
// ⭐ โซนเดียวถือหลายรอบขายได้ (SO-26090247-0: สองบรรทัด FG เดียวกันลงโซน Office) ⇒ ช่องมาตรฐาน มล. สองช่องหน้าตาเหมือนกัน
//   ต้องบอกว่าเป็นของบรรทัดไหน (ลำดับตรงคอลัมน์ # ของตารางรายการของใบ = เรียงตาม sortOrder)
import test from 'node:test';
import assert from 'node:assert/strict';
import { termLineLabels } from './termLabels.js';

const item = (id, zoneId, zoneName, fgCode) => ({ id, zoneId, zoneName, zoneCode: `C-${zoneId}`, fgCode });

test('สองรอบขายโซนเดียว = "รายการ n · FG" ตามลำดับบรรทัดในใบ · โซนเดียวรอบเดียว = ไม่มีบรรทัดรอง', () => {
  const lines = [{ id: 'L-b', sortOrder: 1 }, { id: 'L-a', sortOrder: 0 }, { id: 'L-c', sortOrder: 2 }];
  const terms = [{ id: 'T2', salesOrderLineId: 'L-b' }, { id: 'T1', salesOrderLineId: 'L-a' }, { id: 'T3', salesOrderLineId: 'L-c' }];
  const items = [item('T2', 'Z1', 'Office', 'FG-1'), item('T3', 'Z2', 'Hall', 'FG-2'), item('T1', 'Z1', 'Office', 'FG-1')];
  const { items: sorted, labels } = termLineLabels(items, { terms, lines });
  assert.deepEqual(sorted.map((t) => t.id), ['T3', 'T1', 'T2'], 'ชื่อโซน → ลำดับบรรทัด → id');
  assert.deepEqual(labels, {
    T1: { zone: 'Office', detail: 'รายการ 1 · FG-1' },
    T2: { zone: 'Office', detail: 'รายการ 2 · FG-1' },
    T3: { zone: 'Hall', detail: null },
  });
  assert.deepEqual(items.map((t) => t.id), ['T2', 'T3', 'T1'], 'ไม่แก้อาเรย์ของผู้เรียก');
});

test('หาบรรทัดไม่เจอ = ไม่มีเลขรายการ (FG อย่างเดียว) · ไม่มี FG = เลขรายการอย่างเดียว · ว่าง = ว่าง', () => {
  const items = [item('T1', 'Z1', null, 'FG-1'), item('T2', 'Z1', null, null)];
  const { labels } = termLineLabels(items, { terms: [{ id: 'T2', salesOrderLineId: 'L1' }], lines: [{ id: 'L1', sortOrder: 5 }] });
  assert.deepEqual(labels, {
    T1: { zone: 'C-Z1', detail: 'FG-1' },
    T2: { zone: 'C-Z1', detail: 'รายการ 1' },
  });
  assert.deepEqual(termLineLabels([], {}), { items: [], labels: {} });
  assert.deepEqual(termLineLabels(undefined), { items: [], labels: {} });
});
