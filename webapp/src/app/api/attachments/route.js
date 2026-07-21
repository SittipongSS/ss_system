import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, canEditRecord, canViewRecord } from '@/lib/permissions';
import { resetApprovalOnEdit } from '@/lib/master/approval';
import { listAttachments } from '@/lib/master/attachments';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { ATTACHMENT_ENTITY_TYPES, ATTACHMENT_TYPES } from '@/lib/master/attachmentTypes';
import { canAttachToPersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';

export const dynamic = 'force-dynamic';

// Polymorphic attachments (migration 0028). Permission piggybacks on the parent
// entity: viewing/editing an attachment = viewing/editing its customer/product.
const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations', personal_task: 'personal_tasks' };
// resource key passed to the permission helpers (matches lib/permissions).
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };

// โมดูล "งานบริหาร" (mgmt): แนบไฟล์กับ task/meeting — สิทธิ์คุมด้วย mgmt cap
// (admin+เลขา) ไม่ใช่ canViewRecord ของ parent customer/product. parent = แค่เช็ก
// ว่า row มีจริง (ไม่ถูกลบ) เพื่อไม่ให้แนบกับ id ลอย.
const MGMT_TABLE = { mgmt_task: 'mgmt_tasks', mgmt_meeting: 'mgmt_meetings' };
const isMgmt = (entityType) => !!MGMT_TABLE[entityType];
const isPersonalTask = (entityType) => entityType === 'personal_task';

async function loadParent(supabase, entityType, entityId) {
  const table = PARENT_TABLE[entityType] || MGMT_TABLE[entityType];
  if (!table) return null;
  const { data } = await supabase.from(table).select('*').eq('id', entityId).maybeSingle();
  return data || null;
}

// GET /api/attachments?entityType=customer&entityId=CUS-123456
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  if (!ATTACHMENT_ENTITY_TYPES.includes(entityType) || !entityId) {
    return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const parent = await loadParent(supabase, entityType, entityId);
  if (!parent) return Response.json([]); // ไม่มี entity → ไม่มีเอกสาร
  const allowed = isMgmt(entityType)
    ? canUser(user, 'mgmt:view')
    : isPersonalTask(entityType)
      ? await canViewPersonalTask(supabase, parent, user)
      : canViewRecord(user, RESOURCE[entityType], parent);
  if (!allowed) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    // no-store: รายการไฟล์แนบเปลี่ยนได้ตลอด — กันเบราว์เซอร์ cache คำตอบเก่า (เช่น []
    // ก่อนแนบไฟล์) แล้วแสดงผิดหลัง refresh
    return Response.json(await listAttachments(entityType, entityId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/attachments — บันทึก metadata หลังอัปโหลดไฟล์ผ่าน /api/upload แล้ว.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();
  const { entityType, entityId, docType, fileUrl, driveFileId, fileName, mimeType, sizeBytes, metadata } = body;

  if (!ATTACHMENT_ENTITY_TYPES.includes(entityType) || !entityId) {
    return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
  }
  if (!fileUrl) return Response.json({ error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 });

  const parent = await loadParent(supabase, entityType, entityId);
  if (!parent) return Response.json({ error: 'ไม่พบระเบียนที่จะแนบเอกสาร' }, { status: 404 });
  const allowedEdit = isMgmt(entityType)
    ? canUser(user, 'mgmt:edit')
    : isPersonalTask(entityType)
      ? await canAttachToPersonalTask(supabase, parent, user)
      // product: edit scope follows the OWNING CUSTOMER's caretaker team (มติ
      // 2026-07-20/21) — resolve it so this matches the product detail page.
      : canEditRecord(
          user,
          RESOURCE[entityType],
          parent,
          entityType === 'product' ? await productCaretakerTeams(parent, supabase) : undefined,
        );
  if (!allowedEdit) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // Registration lock (ทุกระบบ, stricter): an APPROVED registration is locked —
  // only LG may still attach (e.g. the post-approval หนังสืออนุมัติ). Everyone
  // else must press "ขอแก้ไข" first (reverts it to draft for re-approval).
  if (entityType === 'registration' && parent.status === 'approved' && !can(user?.role, 'legal:approve')) {
    return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก กรุณากดขอแก้ไขก่อน' }, { status: 403 });
  }

  // docType ต้องเป็นชนิดที่รองรับของ entity นั้น — ที่ไม่รู้จักตกเป็น 'other'.
  const allowed = (ATTACHMENT_TYPES[entityType] || []).map((t) => t.key);
  const safeDocType = allowed.includes(docType) ? docType : 'other';

  const row = {
    entityType,
    entityId,
    docType: safeDocType,
    fileUrl,
    // Drive backend: id ไฟล์บน Drive (null = ไฟล์เก่าบน Supabase — hybrid).
    driveFileId: driveFileId || null,
    fileName: fileName || null,
    mimeType: mimeType || null,
    sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : null,
    uploadedBy: user?.id ?? null,
    uploadedByName: user?.name ?? null,
    // รายละเอียด/แท็คเพิ่มเติม (เลขใบเสร็จ/วันที่/ยอด/อ้างอิงออเดอร์ ฯลฯ).
    // รับเฉพาะ plain object — ป้องกัน array/ค่าแปลกปลอม.
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  };

  const { data, error } = await supabase.from('attachments').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Re-approval rule (ทุกระบบ): adding a document to an APPROVED customer/product
  // drops it back to 'pending' for re-approval. (registration is locked above.)
  const reapproval = resetApprovalOnEdit(parent, user);
  if (reapproval && (entityType === 'customer' || entityType === 'product')) {
    await supabase.from(PARENT_TABLE[entityType]).update({ ...reapproval, updatedAt: new Date().toISOString() }).eq('id', entityId);
  }

  return Response.json(data, { status: 201 });
}
