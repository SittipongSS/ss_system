// ── วันไทยของ "เลยกำหนด / ค้าง n วัน" (ตรวจทั้งระบบ 23/11/2026 · docs/due-overdue-system.md) ──────────
// 🐞 สี่จุดตัดสตริงวัน UTC จาก timestamp หรือใช้นาฬิกาเครื่อง ⇒ ช่วง 00:00–07:00 ไทย (หรือเครื่องที่ตั้งโซนอื่น) ผิดหนึ่งวัน
//    ด่าน `check:thaitime` ไม่จับรูป `String(x.fooAt).slice(0, 10)` จึงต้องมีเทสต์พฤติกรรมของแต่ละตัว
import test from 'node:test';
import assert from 'node:assert/strict';
import { ageInDays } from '../tax/registrationQueue.js';
import { revisionValidUntil } from '../materialPrices.js';
import { daysWaiting } from './taskChain.js';
import { daysToDue, taskUrgency } from './derived.js';
import { bouncedDaysText } from '../requests/queueBoard.js';

// 06:30 เวลาไทยของ 16/11 = 23:30Z ของ 15/11
const DAWN_16 = '2026-11-15T23:30:00Z';

test('/tax ค้างมา: ส่งตอนเช้ามืด 16/11 → ถึง 23/11 = 7 วัน (เดิม 8 — เข้าแถบ "เกิน 8 วัน" เร็วหนึ่งวัน)', () => {
  assert.equal(ageInDays(DAWN_16, '2026-11-23'), 7);
  assert.equal(ageInDays('2026-11-16', '2026-11-23'), 7, 'วันล้วนได้ค่าเดิม');
  assert.equal(ageInDays('2026-11-22T23:30:00Z', '2026-11-23'), 0, 'ส่งเช้ามืดวันนี้ = วันนี้');
});

test('ราคาวัสดุหมดอายุ: เสนอตอนเช้ามืด 16/11 + 30 วัน = 16/12 (เดิม 15/12 — หมดเร็วหนึ่งวัน)', () => {
  assert.equal(revisionValidUntil({ quotedAt: DAWN_16 }, 30), '2026-12-16');
  assert.equal(revisionValidUntil({ validUntil: '2026-12-31' }, 30), '2026-12-31');
});

test('รอคนอื่นมาแล้วกี่วัน: เริ่มรอ 10:00 เมื่อวาน → วันนี้ = 1 วัน (เดิม 0)', () => {
  assert.equal(daysWaiting({ blockedSince: '2026-11-22T03:00:00Z' }, '2026-11-23'), 1);
  assert.equal(daysWaiting({ blockedSince: DAWN_16 }, '2026-11-23'), 7);
  assert.equal(daysWaiting({ blockedSince: null }, '2026-11-23'), null);
});

test('งาน PM: นับจากวันไทยที่ส่งมา ไม่ใช่นาฬิกาเครื่อง · ป้ายเลยกำหนดตรงกับด่าน server', () => {
  assert.equal(daysToDue({ dueDate: '2026-11-22' }, '2026-11-23'), -1);
  assert.equal(daysToDue({ finishDate: '2026-11-25', dueDate: '2026-11-22' }, '2026-11-23'), 2, 'finishDate มาก่อน');
  assert.equal(daysToDue({}, '2026-11-23'), null);
  assert.equal(taskUrgency({ status: 'Pending', dueDate: '2026-11-22' }).overdue,
    daysToDue({ dueDate: '2026-11-22' }) < 0, 'ค่าตั้งต้นใช้วันไทย');
});

test('ใบตีกลับ "ค้าง n วัน": ตีกลับเช้ามืด 16/11 → 23/11 = 7 วัน', () => {
  const r = bouncedDaysText({ bouncedAt: DAWN_16, status: 'draft' }, { todayIso: '2026-11-23' });
  assert.equal(r.date, '2026-11-16');
  assert.equal(r.days, 7);
});

test('ภาระงานรายคน "รอนานสุด": ส่งเช้ามืด 16/11 → 23/11 = 7 วัน (เดิม 8) · ใบตีกลับตราเสียรูป = ไม่นับ', async () => {
  const { ownerWorkload } = await import('../requests/deptOverview.js');
  const rows = ownerWorkload([{ id: 'r', status: 'pending', submittedAt: DAWN_16, items: [] }], { todayIso: '2026-11-23' });
  assert.equal(rows[0].waitingDays, 7);
  assert.equal(bouncedDaysText({ bouncedAt: 'ไม่ใช่วัน', status: 'draft' }, { todayIso: '2026-11-23' }), null);
});
