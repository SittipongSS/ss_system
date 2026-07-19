import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageDocumentStandards } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { publishDocumentStandardDraft, DocumentStandardError } from '@/lib/admin/documentStandards';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageDocumentStandards(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await publishDocumentStandardDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'publish',
      entityType: 'document_standard_version',
      entityId: id,
      before: result.archived,
      after: result.published,
      summary: `เผยแพร่มาตรฐาน ${result.published.formCode} Version ${result.published.versionNumber}`,
      request,
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    const message = error instanceof DocumentStandardError
      ? error.message
      : 'เผยแพร่มาตรฐานเอกสารไม่สำเร็จ';
    return Response.json({ error: message }, { status });
  }
}
