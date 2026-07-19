import { createHash } from 'node:crypto';
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageProductCategories } from '@/lib/permissions';
import { genId } from '@/lib/id';
import { loadProductCategoryRows } from '@/lib/master/productCategoryAdmin';
import {
  planProductCategoryImport,
  PRODUCT_CATEGORY_IMPORT_MAX_BYTES,
} from '@/lib/master/productCategoryImport';
import { parseProductCategoryWorkbook } from '@/lib/master/productCategoryWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cleanFileName = (value) => String(value || 'product-category-import.xlsx')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .slice(0, 255) || 'product-category-import.xlsx';

const isoOrNull = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

export async function POST(request) {
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let form;
  try { form = await request.formData(); } catch {
    return Response.json({ error: 'รูปแบบข้อมูลอัปโหลดไม่ถูกต้อง' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'ไม่พบไฟล์สำหรับนำเข้า' }, { status: 400 });
  }
  if (typeof file.size === 'number' && file.size > PRODUCT_CATEGORY_IMPORT_MAX_BYTES) {
    return Response.json({ error: 'ไฟล์ใหญ่เกินกำหนด (สูงสุด 5 MB)' }, { status: 413 });
  }
  if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
    return Response.json({ error: 'รับเฉพาะไฟล์ .xlsx' }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  let parsed;
  try {
    parsed = await parseProductCategoryWorkbook(buffer);
  } catch (error) {
    return Response.json({ error: error.message || 'อ่านไฟล์ Excel ไม่สำเร็จ' }, { status: 422 });
  }

  const supabase = getSupabaseAdmin();
  let currentRows;
  try {
    currentRows = await loadProductCategoryRows(supabase);
  } catch (error) {
    console.error('[product-category-import-preview] load current', error);
    return Response.json({ error: 'โหลดข้อมูลหมวดสินค้าปัจจุบันไม่สำเร็จ' }, { status: 500 });
  }
  const plan = planProductCategoryImport(parsed.rows, currentRows);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const runId = genId('PCI');
  const summary = { ...plan.summary, hasChanges: plan.hasChanges, committable: plan.committable };
  const run = {
    id: runId,
    fileName: cleanFileName(file.name),
    fileHash,
    templateVersion: parsed.templateVersion,
    sourceExportedAt: isoOrNull(parsed.exportedAt),
    status: 'previewed',
    summary,
    actorId: String(user.id),
    actorName: user.name || null,
    actorRole: user.role || null,
    actorTeam: user.team || null,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const evidenceRows = plan.rows.map((row) => ({
    runId,
    rowNumber: row.rowNumber,
    mainCategoryCode: /^\d{2}$/.test(row.mainCategoryCode || '') ? row.mainCategoryCode : null,
    typeCode: /^\d{3}$/.test(row.typeCode || '') ? row.typeCode : null,
    action: row.action,
    before: row.before,
    after: row.after,
    errors: row.errors,
    expectedUpdatedAt: isoOrNull(row.expectedUpdatedAt),
  }));

  const { error: runError } = await supabase.from('product_category_import_runs').insert(run);
  if (runError) {
    console.error('[product-category-import-preview] insert run', runError);
    return Response.json({ error: 'บันทึก Preview ไม่สำเร็จ' }, { status: 500 });
  }
  const { error: rowsError } = await supabase.from('product_category_import_rows').insert(evidenceRows);
  if (rowsError) {
    await supabase.from('product_category_import_runs').delete().eq('id', runId);
    console.error('[product-category-import-preview] insert rows', rowsError);
    return Response.json({ error: 'บันทึกรายละเอียด Preview ไม่สำเร็จ' }, { status: 500 });
  }

  return Response.json({
    runId,
    fileHash,
    fileName: run.fileName,
    templateVersion: run.templateVersion,
    createdAt: run.createdAt,
    expiresAt: run.expiresAt,
    ...plan,
  });
}
