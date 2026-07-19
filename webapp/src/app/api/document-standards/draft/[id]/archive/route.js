import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageDocumentStandards } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { archiveDocumentStandardDraft, DocumentStandardError } from '@/lib/admin/documentStandards';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageDocumentStandards(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const archived = await archiveDocumentStandardDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'archive',
      entityType: 'document_standard_version',
      entityId: id,
      before: { ...archived, status: 'draft', archivedAt: null },
      after: archived,
      summary: `เก็บมาตรฐาน ${archived.formCode} Version ${archived.versionNumber} เป็นประวัติ`,
      request,
    });
    return Response.json(archived);
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    const message = error instanceof DocumentStandardError ? error.message : 'เก็บฉบับร่างไม่สำเร็จ';
    return Response.json({ error: message }, { status });
  }
}
