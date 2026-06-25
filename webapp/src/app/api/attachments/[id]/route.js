import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canEditRecord } from '@/lib/permissions';
import { resetApprovalOnEdit } from '@/lib/master/approval';
import { getAttachment, deleteAttachmentFile } from '@/lib/master/attachments';

export const dynamic = 'force-dynamic';

const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations' };
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };

// DELETE /api/attachments/[id] — ลบ row + best-effort ลบไฟล์ใน storage.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  // สิทธิ์ลบ = สิทธิ์แก้ entity แม่ (team scope จาก canEditRecord).
  const table = PARENT_TABLE[att.entityType];
  let parent = null;
  if (table) {
    ({ data: parent } = await supabase.from(table).select('*').eq('id', att.entityId).maybeSingle());
    if (parent && !canEditRecord(user, RESOURCE[att.entityType], parent)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    // Registration lock (stricter): can't remove docs from an APPROVED reg unless
    // LG — others must press "ขอแก้ไข" first.
    if (att.entityType === 'registration' && parent?.status === 'approved' && !can(user?.role, 'legal:approve')) {
      return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก กรุณากดขอแก้ไขก่อน' }, { status: 403 });
    }
  }

  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Re-approval rule (ทุกระบบ): removing a document from an APPROVED
  // customer/product drops it back to 'pending' for re-approval.
  if (parent && (att.entityType === 'customer' || att.entityType === 'product')) {
    const reapproval = resetApprovalOnEdit(parent, user);
    if (reapproval) {
      await supabase.from(table).update({ ...reapproval, updatedAt: new Date().toISOString() }).eq('id', att.entityId);
    }
  }

  // ลบไฟล์จริงใน storage/Drive ด้วย (best-effort — ไม่ให้ block การลบ row ถ้าพลาด).
  await deleteAttachmentFile(att);

  return Response.json({ success: true });
}
