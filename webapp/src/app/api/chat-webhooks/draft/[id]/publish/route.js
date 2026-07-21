import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { invalidateChatWebhookCache } from '@/lib/chat';
import { maskWebhookUrl } from '@/lib/chatWebhookSettings';
import { publishChatWebhookDraft, ChatWebhookSettingsError } from '@/lib/admin/chatWebhookSettings';

const maskRow = (row) => (row ? { ...row, url: maskWebhookUrl(row.url) } : row);

// POST /api/chat-webhooks/draft/[id]/publish — the draft becomes the config
// the notifier uses; the previous published version (if any) is archived.
export async function POST(request, context) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await publishChatWebhookDraft(
      getSupabaseAdmin(), id, body.expectedUpdatedAt, user,
    );
    invalidateChatWebhookCache(); // การ์ดใบถัดไปต้องใช้ค่าที่เพิ่งเผยแพร่
    await recordAudit({
      user,
      action: 'publish',
      entityType: 'chat_webhook_setting_version',
      entityId: id,
      before: maskRow(result.archived),
      after: maskRow(result.published),
      summary: `เผยแพร่การตั้งค่า Chat webhook space "${result.published.settingKey}" Version ${result.published.versionNumber}`,
      request,
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof ChatWebhookSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'เผยแพร่การตั้งค่าไม่สำเร็จ' }, { status });
  }
}
