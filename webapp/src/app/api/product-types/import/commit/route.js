import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageProductCategories } from '@/lib/permissions';
import { invalidateCache } from '@/lib/serverCache';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const includesCode = (message, code) => String(message || '').includes(code);

export async function POST(request) {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 });
  }
  const runId = String(body?.runId || '').trim();
  const fileHash = String(body?.fileHash || '').trim();
  if (!runId || !/^[a-f0-9]{64}$/i.test(fileHash)) {
    return Response.json({ error: 'ข้อมูลยืนยัน Preview ไม่ครบ' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('apply_product_category_import_atomic', {
    p_run_id: runId,
    p_file_hash: fileHash,
    p_actor_id: String(user.id),
  });
  if (error) {
    const message = error.message || '';
    if (includesCode(message, 'product_category_import_expired')) {
      await supabase.from('product_category_import_runs')
        .update({ status: 'expired', error: 'Preview หมดอายุ' })
        .eq('id', runId).eq('status', 'previewed');
      return Response.json({ error: 'Preview หมดอายุ กรุณาอัปโหลดไฟล์ใหม่' }, { status: 410 });
    }
    if (includesCode(message, 'product_category_import_actor_mismatch')) {
      return Response.json({ error: 'Preview นี้สร้างโดยผู้ใช้อื่น' }, { status: 403 });
    }
    if (includesCode(message, 'product_category_import_not_found')) {
      return Response.json({ error: 'ไม่พบ Preview นี้' }, { status: 404 });
    }
    if (['not_previewed', 'hash_mismatch', 'stale', 'code_exists', 'target_missing', 'main_rename_incomplete']
      .some((code) => includesCode(message, `product_category_import_${code}`))) {
      return Response.json({ error: 'ข้อมูลเปลี่ยนไปจาก Preview กรุณาตรวจไฟล์ใหม่อีกครั้ง' }, { status: 409 });
    }
    if (['not_committable', 'rows_required', 'payload_invalid', 'code_invalid', 'main_name_invalid', 'name_invalid', 'status_invalid', 'row_key_mismatch', 'activate_payload_invalid', 'deactivate_payload_invalid', 'main_name_conflict']
      .some((code) => includesCode(message, `product_category_import_${code}`))) {
      return Response.json({ error: 'Preview ยังมีข้อมูลที่ไม่สามารถนำเข้าได้' }, { status: 422 });
    }
    await supabase.from('product_category_import_runs')
      .update({ status: 'failed', error: 'Commit ไม่สำเร็จ' })
      .eq('id', runId).eq('status', 'previewed');
    console.error('[product-category-import-commit]', error);
    return Response.json({ error: 'นำเข้าหมวดสินค้าไม่สำเร็จ' }, { status: 500 });
  }

  invalidateCache('product-types');
  await recordAudit({
    user,
    action: 'update',
    entityType: 'product_category_import',
    entityId: runId,
    after: data,
    summary: `นำเข้าหมวดสินค้า ${data?.summary?.applied || 0} รายการ`,
    request,
  });
  return Response.json(data);
}
