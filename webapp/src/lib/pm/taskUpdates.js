// สายอัปเดตความคืบหน้าของงาน (personal_task_updates — mig 0113).
// แพตเทิร์นเดียวกับ appendUpdate ของ mgmt (lib/mgmt/repo.js): เขียนหลัง write
// สำเร็จ และ "ไม่ throw" — บันทึกฟีดพลาดต้องไม่ทำให้การบันทึกงานพังตาม
// (ฟีดคือของประกอบ ไม่ใช่ตัวข้อมูลงาน) เช่นกรณียังไม่ได้รัน migration 0113.
import { genId } from '@/lib/id';

export const TASK_UPDATE_KINDS = ['comment', 'status', 'due', 'late'];

// คืน error message (string) ถ้าเขียนไม่สำเร็จ, null ถ้าสำเร็จ — ไม่ throw.
// ⚠ supabase client ไม่ throw ตอน DB error มันคืน { error } ออกมา ต้องเช็คเอง
// (เวอร์ชันแรกใช้ try/catch เฉย ๆ = catch เป็นโค้ดตาย insert พังเงียบสนิท
//  ไม่มีแม้แต่ log แล้ว POST ก็ตอบ 201 ทั้งที่ไม่ได้บันทึก)
//
// คนเรียกเลือกเองว่าจะแคร์มั้ย: auto-log หลังบันทึกงาน = ไม่แคร์ (ฟีดพลาดต้อง
// ไม่ทำให้บันทึกงานพังตาม) แต่ตอนคนกดปุ่มส่ง = ต้องเช็คแล้วตีกลับ
export async function appendTaskUpdate(supabase, { taskId, kind = 'comment', body = null, meta = {}, user = null }) {
  const { error } = await supabase.from('personal_task_updates').insert({
    id: genId('PTU'),
    taskId: String(taskId),
    kind: TASK_UPDATE_KINDS.includes(kind) ? kind : 'comment',
    body: body ? String(body).slice(0, 2000) : null,
    meta,
    authorId: user?.id != null ? String(user.id) : null,
    authorName: user?.name ?? null,
    createdAt: new Date().toISOString(),
  });
  if (error) {
    console.error('[pm] appendTaskUpdate failed', taskId, error.message);
    return error.message;
  }
  return null;
}

// อ่านเธรด — เก่าไปใหม่ (อ่านไล่เป็นเรื่องราว). พลาด = คืน [] ไม่ทำหน้ารายละเอียดพัง
// (เช่นยังไม่ได้รัน migration 0113) แต่ log ไว้ให้เห็นว่าเงียบเพราะอะไร
export async function listTaskUpdates(supabase, taskId) {
  const { data, error } = await supabase
    .from('personal_task_updates').select('*').eq('taskId', taskId)
    .order('createdAt', { ascending: true });
  if (error) {
    console.error('[pm] listTaskUpdates failed', taskId, error.message);
    return [];
  }
  return data || [];
}

// ── ข้อความของอัปเดตที่ระบบเขียนให้เอง (pure — เทสต์ได้) ──
const STATUS_TH = { Pending: 'รอดำเนินการ', 'In Progress': 'กำลังทำ', Completed: 'เสร็จแล้ว' };

// เทียบงานก่อน/หลังแก้ แล้วบอกว่าต้องบันทึกอัปเดตอัตโนมัติอะไรบ้าง
// คืน [{kind, body, meta}] — ว่าง = ไม่มีอะไรที่ทีมต้องรู้ (เช่นแก้แค่ชื่องาน)
export function autoTaskUpdates(before, after, { lateReason = null } = {}) {
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
  return out;
}
