import { editScope, inScope } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, notFound } from '@/lib/http';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

// POST /api/pm/projects/[id]/restore  body: { snapshotId }
// ย้อนงาน "ทั้งชุด" กลับไปเท่ากับ snapshot ที่เลือก (เซฟใหญ่หรือ Rev ก็ได้):
//   • งานที่ถูกลบไปหลัง snapshot → สร้างกลับ (id เดิม)
//   • งานที่เพิ่มเข้ามาหลัง snapshot → ลบทิ้ง
//   • งานที่ยังอยู่ → เขียนทับด้วยค่าใน snapshot (วัน/สถานะ/ลำดับ/predecessors/ฯลฯ)
// การเปลี่ยนทั้งหมดทำใน Postgres function pm_restore_snapshot (migration 0044) ซึ่งรันใน
// transaction เดียว → atomic: สำเร็จทั้งหมดหรือไม่เปลี่ยนเลย (กันข้อมูลค้างครึ่ง ๆ ถ้าพังกลางคัน).
// ไม่สร้างจุดบันทึกใหม่ตอนย้อน (กันประวัติรก) — จุดบันทึก/Rev เดิมยังอยู่ครบ ย้อนซ้ำได้.
// หมายเหตุ: v1 ย้อนเฉพาะ "ขั้นตอนงาน" (timeline) — ไม่แตะหัวเอกสาร/ข้อมูลโปรเจกต์/เลข Rev.
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;

  const project = await loadProject(supabase, id);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(editScope(user?.role), user, project)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const snapshotId = body.snapshotId;
  if (!snapshotId) return fail('ต้องระบุ snapshotId', 400);

  // ยืนยันว่า snapshot เป็นของโปรเจกต์นี้จริงก่อน → 404 ที่สื่อความหมาย (RPC จะตรวจซ้ำอีกชั้น)
  const { data: snap, error: snapErr } = await supabase
    .from('project_doc_revisions')
    .select('id, kind, revNo')
    .eq('projectId', project.id)
    .eq('id', snapshotId)
    .maybeSingle();
  if (snapErr) return fail(snapErr.message, 500);
  if (!snap) return notFound('ไม่พบจุดที่จะย้อนกลับ');
  // โมเดลใหม่: ย้อนได้เฉพาะ Rev เท่านั้น (working-save ถูกเลิกใช้)
  if (snap.kind !== 'rev') return fail('ย้อนกลับได้เฉพาะเวอร์ชัน (Rev) เท่านั้น', 400);

  // ย้อนทั้งชุดแบบ atomic ใน DB (migration 0044). ต้องรัน migration ก่อน deploy
  // ไม่งั้น rpc จะ error 'function not found'.
  const { data, error } = await supabase.rpc('pm_restore_snapshot', {
    p_project_id: project.id,
    p_snapshot_id: snapshotId,
  });
  if (error) {
    if (error.code === 'P0002') return notFound('ไม่พบจุดที่จะย้อนกลับ'); // snapshot_not_found จาก RPC
    return fail(error.message, 500);
  }

  // ย้อนแล้ว live = snapshot ของ Rev นี้เป๊ะ → ตั้งตัวชี้ "อยู่ที่ Rev นี้" + เคลียร์ revStale
  // (RPC แก้ task ทำให้ trigger ตั้ง revStale=true — ต้องเขียนทับเป็น false ตรงนี้ หลัง RPC เสร็จ)
  const { error: upErr } = await supabase
    .from('projects').update({ currentRev: snap.revNo, revStale: false }).eq('id', project.id);
  if (upErr) return fail(upErr.message, 500);

  return ok({ ...data, currentRev: snap.revNo });
});
