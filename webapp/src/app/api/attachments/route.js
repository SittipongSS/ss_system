import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditRecord, canViewRecord } from '@/lib/permissions';
import { listAttachments } from '@/lib/master/attachments';
import { ATTACHMENT_ENTITY_TYPES, ATTACHMENT_TYPES } from '@/lib/master/attachmentTypes';

export const dynamic = 'force-dynamic';

// Polymorphic attachments (migration 0028). Permission piggybacks on the parent
// entity: viewing/editing an attachment = viewing/editing its customer/product.
const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders' };
// resource key passed to the permission helpers (matches lib/permissions).
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders' };

async function loadParent(supabase, entityType, entityId) {
  const table = PARENT_TABLE[entityType];
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
  if (!canViewRecord(user, RESOURCE[entityType], parent)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    return Response.json(await listAttachments(entityType, entityId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/attachments — บันทึก metadata หลังอัปโหลดไฟล์ผ่าน /api/upload แล้ว.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();
  const { entityType, entityId, docType, fileUrl, fileName, mimeType, sizeBytes, metadata } = body;

  if (!ATTACHMENT_ENTITY_TYPES.includes(entityType) || !entityId) {
    return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
  }
  if (!fileUrl) return Response.json({ error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 });

  const parent = await loadParent(supabase, entityType, entityId);
  if (!parent) return Response.json({ error: 'ไม่พบระเบียนที่จะแนบเอกสาร' }, { status: 404 });
  if (!canEditRecord(user, RESOURCE[entityType], parent)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // docType ต้องเป็นชนิดที่รองรับของ entity นั้น — ที่ไม่รู้จักตกเป็น 'other'.
  const allowed = (ATTACHMENT_TYPES[entityType] || []).map((t) => t.key);
  const safeDocType = allowed.includes(docType) ? docType : 'other';

  const row = {
    entityType,
    entityId,
    docType: safeDocType,
    fileUrl,
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
  return Response.json(data, { status: 201 });
}
