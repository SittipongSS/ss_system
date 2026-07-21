import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { CHAT_SPACES } from '@/lib/chat';
import { maskWebhookUrl } from '@/lib/chatWebhookSettings';
import { createChatWebhookDraft, ChatWebhookSettingsError } from '@/lib/admin/chatWebhookSettings';

const KNOWN_KEYS = new Set(CHAT_SPACES.map((s) => s.key));
const maskRow = (row) => (row ? { ...row, url: maskWebhookUrl(row.url) } : row);

// POST /api/chat-webhooks/draft — start a draft for one space: { key }.
// Space ที่ยังไม่เคยตั้งค่า (ใช้ env) เริ่มจากร่างเปล่าได้
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'master:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    if (!KNOWN_KEYS.has(body.key)) {
      return Response.json({ error: 'space ไม่ถูกต้อง' }, { status: 400 });
    }
    const draft = await createChatWebhookDraft(getSupabaseAdmin(), body.key, user);
    const label = CHAT_SPACES.find((s) => s.key === body.key)?.label || body.key;
    await recordAudit({
      user,
      action: 'create',
      entityType: 'chat_webhook_setting_version',
      entityId: draft.id,
      after: maskRow(draft),
      summary: `สร้างฉบับร่างการตั้งค่า Chat webhook space "${label}" Version ${draft.versionNumber}`,
      request,
    });
    return Response.json(draft, { status: 201 });
  } catch (error) {
    const status = error instanceof ChatWebhookSettingsError ? error.status : 500;
    return Response.json({ error: error.message || 'สร้างฉบับร่างไม่สำเร็จ' }, { status });
  }
}
