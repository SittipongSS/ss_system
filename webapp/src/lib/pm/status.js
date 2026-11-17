// Auto status propagation for project tasks, driven by the predecessor graph.
//
// โมเดล: ควบคุมสถานะ "Pending" อัตโนมัติเมื่อไม่พร้อม ส่วน "In Progress" และ "Completed"
// เป็นการกระทำของผู้ใช้ (ให้คงไว้ ไม่ถูก auto เปลี่ยน นอกจากกรณีไม่พร้อม) กฎ:
//   ready(t) = predecessor ทุกตัว "Completed" (หรือไม่มี / ชี้ไป task ที่ถูกลบ)
//   ถ้า t ไม่ใช่ Completed → ready ? คงสถานะเดิม : "Pending"
//
// ครอบคลุมโจทย์ทั้งหมดด้วย single pass (readiness ขึ้นกับสถานะ Completed ซึ่ง pass นี้
// ไม่แตะ จึง deterministic ไม่ต้อง topological sort):
//   - ขั้นตอนใหม่ทุกขั้น ค่าเริ่มต้นคือ "Pending" (รอดำเนินการ)
//   - กดเสร็จขั้นหนึ่ง → ขั้นถัดที่เชื่อมกันจะยังคงสถานะเดิม (Pending) จนกว่าผู้ใช้จะเริ่มทำ (In Progress)
//   - ถอยจากเสร็จ / ลบ-แก้ predecessor → คำนวณใหม่ทั้งกราฟ (ขั้นถัดที่ไม่พร้อมแล้ว → กลับเป็น Pending)

import { throwFirstError } from '@/lib/supabaseWriteBatch';

export function computeAutoStatuses(tasks) {
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const next = new Map();
  for (const t of tasks || []) {
    if (t.status === 'Completed') { next.set(t.id, 'Completed'); continue; }
    const preds = Array.isArray(t.predecessors) ? t.predecessors : [];
    const ready = preds.every((pid) => {
      const p = byId.get(pid);
      return !p || p.status === 'Completed'; // pred ที่หาไม่เจอ (ถูกลบ) = ไม่บล็อก
    });
    next.set(t.id, ready ? t.status : 'Pending');
  }
  return next;
}

// คืน array ใหม่ที่ปรับ status แล้ว (ใช้ตอนสร้าง template ก่อน insert — ยังไม่มีใน DB)
export function applyAutoStatuses(tasks) {
  const next = computeAutoStatuses(tasks);
  return (tasks || []).map((t) => ({ ...t, status: next.get(t.id) ?? t.status }));
}

// โหลด task ทั้งชุดของดีล คำนวณสถานะใหม่ แล้ว persist เฉพาะแถวที่เปลี่ยนจริง.
// รับ supabase client เข้ามา (lib ไม่ผูกกับ supabaseAdmin โดยตรง).
/* ⭐ งวด P3b-2 ยุบโครงการ (16/11/2026): ขอบเขตกราฟ = **ดีล** เสมอ (เดิม: ทั้งโครงการ เมื่อขั้นมี projectId)
   ตรวจ prod 16/11: เส้น predecessor ข้ามดีล 0 เส้น · ขั้นที่ไม่มี dealId 0 แถว ⇒ สถานะที่ได้เท่ากับแบบทั้งโครงการทุกขั้น
   `projectId` ที่ค้างบนแถวเก่าไม่มีผลกับการคำนวณแล้ว */
export async function propagateAndPersist(supabase, dealId) {
  if (!dealId) return;
  const q = supabase.from('project_tasks').select('*').eq('dealId', dealId);
  const { data: all, error: readError } = await q.order('stepOrder', { ascending: true });
  if (readError) throw readError;
  if (!all || !all.length) return;
  const next = computeAutoStatuses(all);
  const changed = all.filter((t) => next.get(t.id) !== t.status);
  if (!changed.length) return;
  /* 🔴 ผลของชุด write ต้องถูกอ่าน — ทิ้งทั้งก้อน = อัปเดตพลาดไปกี่แถวก็ไม่รู้
     แล้วสถานะเพี้ยนเป็นบางขั้น ซึ่งอ่านเหมือนข้อมูลจริง */
  throwFirstError(
    await Promise.all(changed.map((t) =>
      supabase.from('project_tasks')
        .update({ status: next.get(t.id), updatedAt: new Date().toISOString() })
        .eq('id', t.id))),
    'ปรับสถานะงานอัตโนมัติ',
  );
}
