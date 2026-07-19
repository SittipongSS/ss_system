import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { canManageDocumentStandards } from '@/lib/permissions';
import { loadDocumentStandardsAdmin, DocumentStandardError } from '@/lib/admin/documentStandards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageDocumentStandards(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    return Response.json({ standards: await loadDocumentStandardsAdmin(getSupabaseAdmin()) });
  } catch (error) {
    const status = error instanceof DocumentStandardError ? error.status : 500;
    const message = error instanceof DocumentStandardError
      ? error.message
      : 'โหลดมาตรฐานเอกสารไม่สำเร็จ';
    return Response.json({ error: message }, { status });
  }
}
