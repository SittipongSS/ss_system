import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, canEditRecord, canViewCosting } from '@/lib/permissions';
import { getAttachment, deleteAttachmentFile } from '@/lib/master/attachments';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { canAttachToPersonalTask } from '@/lib/pm/personalTaskAccess';
import {
  COSTING_ATTACHMENT_TABLE, canAttachToCosting, isCostingAttachment,
} from '@/lib/master/costingAttachmentAccess';

export const dynamic = 'force-dynamic';

const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations', personal_task: 'personal_tasks' };
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };
// โมดูล "งานบริหาร": สิทธิ์ลบ = mgmt:edit (admin+เลขา) — ไม่มี parent customer/product.
const isMgmt = (entityType) => entityType === 'mgmt_task' || entityType === 'mgmt_meeting';
// ระบบขอราคา: ไม่มี parent ใน PARENT_TABLE เหมือนกัน → ถ้าไม่ดักตรงนี้ บล็อกสิทธิ์
// ข้างล่างจะถูกข้ามทั้งก้อน (`if (table)`) แปลว่าใครก็ลบไฟล์แนบของใบ/เคสได้

// DELETE /api/attachments/[id] — ลบ row + best-effort ลบไฟล์ใน storage.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  // mgmt: gate ด้วย cap ของโมดูล (ไม่ผ่าน parent customer/product).
  if (isMgmt(att.entityType) && !canUser(user, 'mgmt:edit')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // ระบบขอราคา: สิทธิ์ลบ = สิทธิ์แนบของ entity นั้น (cap ระบบขอราคา + ฝ่าย/ผู้เปิดเคส)
  if (isCostingAttachment(att.entityType)) {
    const { data: parentRow } = await supabase
      .from(COSTING_ATTACHMENT_TABLE[att.entityType]).select('*').eq('id', att.entityId).maybeSingle();
    const allowed = parentRow
      ? await canAttachToCosting(supabase, att.entityType, parentRow, user)
      // ระเบียนแม่ถูกลบไปแล้ว — ไม่มีแถวให้ตรวจสิทธิ์รายใบ เหลือด่านระบบล้วน
      // (เจตนาเดิม: ให้เก็บกวาดไฟล์ที่ค้างอยู่ได้ ไม่ใช่ให้เปิดอ่านของใคร)
      : canViewCosting(user);
    if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // สิทธิ์ลบ = สิทธิ์แก้ entity แม่ (team scope จาก canEditRecord).
  const table = PARENT_TABLE[att.entityType];
  let parent = null;
  if (table) {
    ({ data: parent } = await supabase.from(table).select('*').eq('id', att.entityId).maybeSingle());
    // product: edit scope follows the OWNING CUSTOMER's caretaker team (มติ
    // 2026-07-20/21) — resolve it so the check matches the product detail page.
    const canEditParent = att.entityType === 'personal_task'
      ? await canAttachToPersonalTask(supabase, parent, user)
      : canEditRecord(
          user,
          RESOURCE[att.entityType],
          parent,
          att.entityType === 'product' ? await productCaretakerTeams(parent, supabase) : undefined,
        );
    if (parent && !canEditParent) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    // Registration lock (stricter): can't remove docs from an APPROVED reg unless
    // LG — others must press "ขอแก้ไข" first.
    if (att.entityType === 'registration' && parent?.status === 'approved' && !can(user?.role, 'legal:approve')) {
      return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก — ต้องให้ฝ่ายกฎหมายปลดอนุมัติก่อนจึงจะลบเอกสารได้' }, { status: 403 });
    }
  }

  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // เอกสารแนบ **ไม่** ทำให้ลูกค้า/สินค้าตกกลับรออนุมัติ (มติผู้ใช้ 2026-07-27) — ไฟล์
  // ประกอบไม่ใช่สเปกหรือตัวตนของแถว และการ reset ทำให้แถวนั้นหลุดจากลิสต์เลือกทุกหน้า
  // ทันที (GET คืนเฉพาะ approved) ซึ่งแพงเกินกว่าเหตุ. ทะเบียนสรรพสามิตยังล็อกตามเดิม
  // (ด่านข้างบน) เพราะเป็นกติกาที่เข้มกว่าโดยเจตนา

  // ลบไฟล์จริงใน storage/Drive ด้วย (best-effort — ไม่ให้ block การลบ row ถ้าพลาด).
  await deleteAttachmentFile(att);

  return Response.json({ success: true });
}
