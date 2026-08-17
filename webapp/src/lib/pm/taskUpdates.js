// สายอัปเดตความคืบหน้าของงาน
//
// mig 0163: ตัวเธรดย้ายไปอยู่ตารางกลาง `entity_updates` แล้ว (entityType =
// 'personal_task') ไฟล์นี้จึงเหลือแค่ **ตรรกะล้วน** ว่าเหตุการณ์ไหนควรถูกบันทึก
// ส่วน I/O ใช้ lib/master/updates.js ร่วมกับโมดูลอื่น
//
// กติกาที่ยกมาจากของเดิมและต้องคงไว้: การเขียนฟีด **ไม่ throw** — auto-log หลัง
// บันทึกงานสำเร็จแล้วพลาด ต้องไม่ทำให้การบันทึกงานพังตาม (ฟีดเป็นของประกอบ)
// แต่ตอนคนกดปุ่มส่งเอง ต้องเช็ค error แล้วตีกลับ ไม่งั้นตอบ 201 ทั้งที่ไม่ได้บันทึก
import { TASK_STATUS_TH as STATUS_TH } from '@/lib/pm/tasks';

export const TASK_UPDATE_KINDS = ['comment', 'status', 'due', 'late', 'blocked'];

// ── ข้อความของอัปเดตที่ระบบเขียนให้เอง (pure — เทสต์ได้) ──

// เทียบงานก่อน/หลังแก้ แล้วบอกว่าต้องบันทึกอัปเดตอัตโนมัติอะไรบ้าง
// คืน [{kind, body, meta}] — ว่าง = ไม่มีอะไรที่ทีมต้องรู้ (เช่นแก้แค่ชื่องาน)
export function autoTaskUpdates(before, after, { lateReason = null, blockedReason = null } = {}) {
  const out = [];
  if (!before || !after) return out;

  if (before.status !== after.status) {
    out.push({
      kind: 'status',
      body: `เปลี่ยนสถานะ ${STATUS_TH[before.status] || before.status} → ${STATUS_TH[after.status] || after.status}`,
      meta: { field: 'status', from: before.status, to: after.status },
    });
  }
  if ((before.dueDate || null) !== (after.dueDate || null)) {
    out.push({
      kind: 'due',
      body: `เลื่อนกำหนดเสร็จ ${before.dueDate || 'ไม่ระบุ'} → ${after.dueDate || 'ไม่ระบุ'}`,
      meta: { field: 'dueDate', from: before.dueDate || null, to: after.dueDate || null },
    });
  }
  // สาเหตุงานเกินกำหนดขึ้นเป็นอัปเดตของตัวเอง — คนอ่านเธรดจะได้เห็นเหตุผลในสายเดียว
  // ไม่ต้องไปเปิดดูฟิลด์ lateReason แยก
  if (lateReason) {
    out.push({ kind: 'late', body: lateReason, meta: { field: 'lateReason' } });
  }
  // "รออะไรอยู่" ก็เป็นเหตุผลที่งานหยุดเดินเหมือนกัน — ต้องอยู่ในเธรดเดียวกับ
  // สาเหตุที่เสร็จช้า ไม่งั้นคนตรวจงานเห็นแค่ว่าสถานะเปลี่ยนแต่ไม่รู้ว่าติดอะไร
  if (blockedReason) {
    out.push({ kind: 'blocked', body: `รอ: ${blockedReason}`, meta: { field: 'blockedReason' } });
  }
  return out;
}
