// Auto status propagation for project tasks, driven by the predecessor graph.
//
// โมเดล: ระบบจัดการเฉพาะคู่ Pending ↔ "In Progress" อัตโนมัติ ส่วน "Completed"
// เป็นการกระทำของผู้ใช้ (คงไว้เสมอ ไม่ถูก auto un-complete). กฎเดียว:
//   ready(t) = predecessor ทุกตัว "Completed" (หรือไม่มี / ชี้ไป task ที่ถูกลบ)
//   ถ้า t ไม่ใช่ Completed → ready ? "In Progress" : "Pending"
//
// ครอบคลุมโจทย์ทั้งหมดด้วย single pass (readiness ขึ้นกับสถานะ Completed ซึ่ง pass นี้
// ไม่แตะ จึง deterministic ไม่ต้อง topological sort):
//   - งานแรก (ไม่มี predecessor) → In Progress ; งานขนาน (หลายตัวไม่มี pred) → In Progress ทุกตัว
//   - กดเสร็จขั้นหนึ่ง → ขั้นถัดที่เชื่อมกันพร้อมแล้ว → In Progress อัตโนมัติ
//   - ถอยจากเสร็จ / ลบ-แก้ predecessor → คำนวณใหม่ทั้งกราฟ (ขั้นถัดที่ไม่พร้อมแล้ว → กลับเป็น Pending)

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
    next.set(t.id, ready ? 'In Progress' : 'Pending');
  }
  return next;
}

// คืน array ใหม่ที่ปรับ status แล้ว (ใช้ตอนสร้าง template ก่อน insert — ยังไม่มีใน DB)
export function applyAutoStatuses(tasks) {
  const next = computeAutoStatuses(tasks);
  return (tasks || []).map((t) => ({ ...t, status: next.get(t.id) ?? t.status }));
}

// โหลด task ทั้งโปรเจกต์ คำนวณสถานะใหม่ แล้ว persist เฉพาะแถวที่เปลี่ยนจริง.
// รับ supabase client เข้ามา (lib ไม่ผูกกับ supabaseAdmin โดยตรง).
export async function propagateAndPersist(supabase, projectId) {
  const { data: all } = await supabase
    .from('project_tasks').select('*').eq('projectId', projectId)
    .order('stepOrder', { ascending: true });
  if (!all || !all.length) return;
  const next = computeAutoStatuses(all);
  const changed = all.filter((t) => next.get(t.id) !== t.status);
  if (!changed.length) return;
  await Promise.all(changed.map((t) =>
    supabase.from('project_tasks')
      .update({ status: next.get(t.id), updatedAt: new Date().toISOString() })
      .eq('id', t.id)
  ));
}
