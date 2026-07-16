// สายบันทึกอัปเดตความคืบหน้าของงานของฉัน (personal_task_updates — mig 0112).
// ใช้ทั้งฝั่งโพสต์เอง (kind 'note') และระบบบันทึกอัตโนมัติตอนเปลี่ยนสถานะ/เลื่อน
// กำหนด/ปิดงานช้า (kind 'status'|'due'|'late') จาก PATCH ของงาน.
import { genId } from '@/lib/id';

// เพิ่ม 1 อัปเดตลงสาย — ไม่ throw (auto-log ต้องไม่ทำ action หลักพัง; กลืน error).
export async function appendTaskUpdate(supabase, { taskId, kind = 'note', body = null, fromStatus = null, toStatus = null, user }) {
  try {
    await supabase.from('personal_task_updates').insert({
      id: genId('PTU'),
      taskId,
      kind,
      body: body ? String(body).slice(0, 2000) : null,
      fromStatus,
      toStatus,
      authorId: user?.id ?? null,
      authorName: user?.name ?? null,
    });
  } catch (e) {
    console.error('[taskUpdates] append failed', taskId, kind, e?.message || e);
  }
}

export async function listTaskUpdates(supabase, taskId) {
  const { data, error } = await supabase
    .from('personal_task_updates')
    .select('*')
    .eq('taskId', taskId)
    .order('createdAt', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
