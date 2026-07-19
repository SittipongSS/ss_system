import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageDocumentStandards } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { normalizeDocumentStandardInput } from '@/lib/documentStandards';
import { updateDocumentStandardDraft, DocumentStandardError } from '@/lib/admin/documentStandards';

export async function PATCH(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageDocumentStandards(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const normalized = normalizeDocumentStandardInput(body);
    if (normalized.errors.length) {
      return Response.json({ error: normalized.errors[0], errors: normalized.errors }, { status: 400 });
    }
    const result = await updateDocumentStandardDraft(
      getSupabaseAdmin(), id, normalized.value, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'update',
      entityType: 'document_standard_version',
      entityId: id,
      before: result.before,
      after: result.after,
      summary: `บันทึกมาตรฐาน ${result.after.formCode} Version ${result.after.versionNumber}`,
      request,
    });
    return Response.json(result.after);
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    const message = error instanceof DocumentStandardError ? error.message : 'บันทึกฉบับร่างไม่สำเร็จ';
    return Response.json({ error: message }, { status });
  }
}
