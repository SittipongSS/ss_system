// ── changedVisitColumns: เขียนเฉพาะช่องที่เปลี่ยนจริง — ตัดเฉพาะเมื่อ "เท่ากัน" แน่ ๆ ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { changedVisitColumns } from './visitWriteDiff.js';

const before = {
  id: 'V1', status: 'scheduled', scheduledDate: '2026-10-19', startTime: '09:00:00', endTime: null,
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: ['U-MATE'], note: null, attachments: [],
  actualStartTime: null, actualTimeEdited: false,
};

test('ช่องที่ค่าเท่าเดิมถูกตัด · ช่องที่เปลี่ยนอยู่ครบ', () => {
  const patch = { ...before, startTime: '09:00', note: 'โทรก่อนเข้า', status: 'in_progress', actualStartTime: '09:05' };
  assert.deepEqual(changedVisitColumns(patch, before), { note: 'โทรก่อนเข้า', status: 'in_progress', actualStartTime: '09:05' });
});

test('เวลา: ฐาน HH:MM:SS กับฟอร์ม HH:MM = เท่า · นาทีต่าง = ไม่เท่า', () => {
  assert.deepEqual(changedVisitColumns({ startTime: '09:00' }, before), {});
  assert.deepEqual(changedVisitColumns({ startTime: '09:30' }, before), { startTime: '09:30' });
});

test('🔴 สงสัย = เขียน: ว่างข้างเดียว · ข้อความว่างกับ null · ลำดับผู้ช่วยต่าง · ชนิดต่างที่ค่าไม่ตรง', () => {
  assert.deepEqual(changedVisitColumns({ note: '' }, before), { note: '' });
  assert.deepEqual(changedVisitColumns({ endTime: '10:00' }, before), { endTime: '10:00' });
  assert.deepEqual(changedVisitColumns({ assigneeId: null }, before), { assigneeId: null });
  assert.deepEqual(changedVisitColumns({ assistantIds: ['U-MATE', 'U-X'] }, before), { assistantIds: ['U-MATE', 'U-X'] });
  assert.deepEqual(
    changedVisitColumns({ assistantIds: ['B', 'A'] }, { assistantIds: ['A', 'B'] }),
    { assistantIds: ['B', 'A'] },
  );
  assert.deepEqual(changedVisitColumns({ actualTimeEdited: true }, before), { actualTimeEdited: true });
});

test('array/object เท่ากันทั้งก้อน = ตัด · ว่างทั้งคู่ = ตัด', () => {
  assert.deepEqual(changedVisitColumns({ assistantIds: ['U-MATE'], attachments: [], endTime: undefined }, before), {});
});

test('ช่องที่แถวไม่มี (คอลัมน์ใหม่ · ช่องประทับเวลาที่เพิ่งเกิด) = เขียนตามเดิม', () => {
  assert.deepEqual(changedVisitColumns({ actualEndDate: null, gateOverrideAt: 'x' }, before), { actualEndDate: null, gateOverrideAt: 'x' });
});

test('ไม่แก้ก้อนที่ส่งเข้ามา', () => {
  const patch = { note: 'x', status: 'scheduled' };
  changedVisitColumns(patch, before);
  assert.deepEqual(patch, { note: 'x', status: 'scheduled' });
});

/* ═══ รอบรีวิวที่สอง ═══════════════════════════════════════════════════════════════════════════ */

test('🔴 รูปหน้างาน: jsonb คืนคีย์คนละลำดับ ({url, kind, name}) กับที่ normalize ส่ง ({url, name, kind}) = เท่า · ลำดับรูปต่าง = ไม่เท่า', () => {
  const stored = [{ url: 'u1', kind: 'image', name: 'a.jpg' }, { url: 'u2', kind: 'image', name: 'b.jpg' }];
  const sent = [{ url: 'u1', name: 'a.jpg', kind: 'image' }, { url: 'u2', name: 'b.jpg', kind: 'image' }];
  assert.deepEqual(changedVisitColumns({ attachments: sent }, { attachments: stored }), {});
  assert.deepEqual(changedVisitColumns({ attachments: [...sent].reverse() }, { attachments: stored }), { attachments: [...sent].reverse() });
  const added = [...sent, { url: 'u3', name: 'c.jpg', kind: 'image' }];
  assert.deepEqual(changedVisitColumns({ attachments: added }, { attachments: stored }), { attachments: added });
});

test('🔴 เวลาในฐานมีวินาทีอื่นที่ไม่ใช่ :00 = ไม่เท่า (เขียนค่าที่ปัดแล้ว ไม่ให้ CHECK เทียบกับวินาทีเก่า)', () => {
  assert.deepEqual(changedVisitColumns({ actualStartTime: '10:00' }, { actualStartTime: '10:00:00' }), {});
  assert.deepEqual(changedVisitColumns({ actualStartTime: '10:00' }, { actualStartTime: '10:00:30' }), { actualStartTime: '10:00' });
});

test('🔴 ช่องที่ต้องไปด้วยกัน: เปลี่ยนช่องเดียว = เขียนทั้งกลุ่ม (เฉพาะช่องที่อยู่ในก้อน)', () => {
  // เวลาเริ่มเท่าเดิม เวลาจบเปลี่ยน ⇒ เขียนทั้งคู่ (CHECK เวลาเริ่ม ≤ จบ ต้องเห็นค่าของคนเดียวกัน)
  assert.deepEqual(changedVisitColumns({ startTime: '09:00', endTime: '11:00' }, before), { startTime: '09:00', endTime: '11:00' });
  // ชื่อผู้รับผิดชอบเปลี่ยนจากทะเบียน รหัสเท่าเดิม ⇒ เขียนทั้งคู่
  assert.deepEqual(changedVisitColumns({ assigneeId: 'U-TECH', assigneeName: 'ช่างเอ (ใหม่)' }, before),
    { assigneeId: 'U-TECH', assigneeName: 'ช่างเอ (ใหม่)' });
  // ย้ายแผน: ช่องของรอบถูกล้างเป็น null แม้เดิมเป็น null อยู่แล้ว (ไม่ถือช่องของรอบเดิมไปแผนใหม่)
  assert.deepEqual(changedVisitColumns({ planId: 'P2', planSlotDate: null }, { planId: 'P1', planSlotDate: null }), { planId: 'P2', planSlotDate: null });
  // ประทับเวลาเริ่ม ⇒ วันที่เข้าจริง/เวลาจบ/วันที่จบ ไปด้วยกันทั้งชุด
  assert.deepEqual(
    changedVisitColumns({ actualDate: null, actualStartTime: '09:05', actualEndTime: null }, before),
    { actualDate: null, actualStartTime: '09:05', actualEndTime: null },
  );
  // กลุ่มที่ไม่มีใครเปลี่ยน = ตัดทั้งกลุ่ม
  assert.deepEqual(changedVisitColumns({ startTime: '09:00', endTime: null, note: 'x' }, before), { note: 'x' });
});
