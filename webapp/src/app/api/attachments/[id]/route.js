import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditRecord } from '@/lib/permissions';
import { getAttachment } from '@/lib/master/attachments';

export const dynamic = 'force-dynamic';

const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations' };
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

// แกะ object path ออกจาก public URL ของ Supabase Storage เพื่อลบไฟล์จริง.
// รูปแบบ: .../storage/v1/object/public/<bucket>/<objectPath>
function objectPathFromUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

// DELETE /api/attachments/[id] — ลบ row + best-effort ลบไฟล์ใน storage.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  // สิทธิ์ลบ = สิทธิ์แก้ entity แม่ (team scope จาก canEditRecord).
  const table = PARENT_TABLE[att.entityType];
  if (table) {
    const { data: parent } = await supabase.from(table).select('*').eq('id', att.entityId).maybeSingle();
    if (parent && !canEditRecord(user, RESOURCE[att.entityType], parent)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ลบไฟล์ใน storage ด้วย (best-effort — ไม่ให้ block การลบ row ถ้าพลาด).
  const path = objectPathFromUrl(att.fileUrl);
  if (path) {
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch {
      /* ไฟล์อาจถูกลบไปแล้ว หรือ path แกะไม่ได้ — ข้ามได้ */
    }
  }

  return Response.json({ success: true });
}
