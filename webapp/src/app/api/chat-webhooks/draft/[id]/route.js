import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { maskWebhookUrl, normalizeChatWebhookInput } from '@/lib/chatWebhookSettings';
import { updateChatWebhookDraft, ChatWebhookSettingsError } from '@/lib/admin/chatWebhookSettings';

const maskRow = (row) => (row ? { ...row, url: maskWebhookUrl(row.url) } : row);

// PATCH /api/chat-webhooks/draft/[id] — save a draft: { url, enabled, changeNote }.
export async function PATCH(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { value, errors } = normalizeChatWebhookInput(body);
    if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });

    const result = await updateChatWebhookDraft(
      getSupabaseAdmin(), id, value, body.expectedUpdatedAt, user,
    );
    await recordAudit({
      user,
      action: 'update',
      entityType: 'chat_webhook_setting_version',
      entityId: id,
      before: maskRow(result.before),
      after: maskRow(result.after),
      summary: `บันทึกฉบับร่างการตั้งค่า Chat webhook space "${result.after.settingKey}" Version ${result.after.versionNumber}`,
      request,
    });
    return Response.json(result.after);
  } catch (error) {
    const status = error instanceof ChatWebhookSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'บันทึกฉบับร่างไม่สำเร็จ' }, { status });
  }
}
