import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageDocumentStandards } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { DOCUMENT_STANDARD_KEYS, DOCUMENT_STANDARD_LABELS } from '@/lib/documentStandards';
import { createDocumentStandardDraft, DocumentStandardError } from '@/lib/admin/documentStandards';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageDocumentStandards(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { key } = await context.params;
    if (!DOCUMENT_STANDARD_KEYS.includes(key)) return Response.json({ error: 'ไม่พบชนิดเอกสาร' }, { status: 404 });
    const draft = await createDocumentStandardDraft(getSupabaseAdmin(), key, user);
    await recordAudit({
      user,
      action: 'create',
      entityType: 'document_standard_version',
      entityId: draft.id,
      after: draft,
      summary: `สร้างมาตรฐาน ${DOCUMENT_STANDARD_LABELS[key]} Version ${draft.versionNumber} ฉบับร่าง`,
      request,
    });
    return Response.json(draft, { status: 201 });
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    const message = error instanceof DocumentStandardError ? error.message : 'สร้างฉบับร่างไม่สำเร็จ';
    return Response.json({ error: message }, { status });
  }
}
