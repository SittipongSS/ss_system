import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { maskWebhookUrl } from '@/lib/chatWebhookSettings';
import { archiveChatWebhookDraft, ChatWebhookSettingsError } from '@/lib/admin/chatWebhookSettings';

const maskRow = (row) => (row ? { ...row, url: maskWebhookUrl(row.url) } : row);

// POST /api/chat-webhooks/draft/[id]/archive — discard a draft into history.
// The published config (and env fallback behavior) is untouched.
export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const archived = await archiveChatWebhookDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'archive',
      entityType: 'chat_webhook_setting_version',
      entityId: id,
      after: maskRow(archived),
      summary: `เก็บฉบับร่างการตั้งค่า Chat webhook space "${archived.settingKey}" Version ${archived.versionNumber} เป็นประวัติ`,
      request,
    });
    return Response.json(archived);
  } catch (error) {
    const status = error instanceof ChatWebhookSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'เก็บฉบับร่างไม่สำเร็จ' }, { status });
  }
}
