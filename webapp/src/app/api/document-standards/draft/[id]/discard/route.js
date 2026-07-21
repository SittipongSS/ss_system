import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageDocumentStandards } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { discardDocumentStandardDraft, DocumentStandardError } from '@/lib/admin/documentStandards';

export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageDocumentStandards(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const discarded = await discardDocumentStandardDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    // แถวร่างถูกลบถาวรแล้ว — audit log นี้คือหลักฐานเดียวที่เหลือของการยกเลิก
    await recordAudit({
      user,
      action: 'delete',
      entityType: 'document_standard_version',
      entityId: id,
      before: discarded,
      after: null,
      summary: `ยกเลิกมาตรฐาน ${discarded.formCode} ฉบับร่าง Version ${discarded.versionNumber} (ลบถาวร)`,
      request,
    });
    return Response.json(discarded);
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    const message = error instanceof DocumentStandardError ? error.message : 'ยกเลิกฉบับร่างไม่สำเร็จ';
    return Response.json({ error: message }, { status });
  }
}
