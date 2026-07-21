import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { CHAT_SPACES, SPACE_ENV, chatCard, invalidateChatWebhookCache, sendChatNow, sendChatToUrl } from '@/lib/chat';
import { loadChatWebhookSettingsAdmin, ChatWebhookSettingsError } from '@/lib/admin/chatWebhookSettings';

export const dynamic = 'force-dynamic';

const KNOWN_KEYS = new Set(CHAT_SPACES.map((s) => s.key));

// GET /api/chat-webhooks — supervisor เท่านั้น: lifecycle view ต่อ space
// (published/draft/ประวัติเวอร์ชัน) + บอกว่ามี env fallback ไหม (ไม่เผยค่า env)
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const byKey = await loadChatWebhookSettingsAdmin(getSupabaseAdmin());
    const spaces = CHAT_SPACES.map((s) => {
      const entry = byKey.get(s.key) || { published: null, draft: null, versions: [] };
      return {
        key: s.key,
        label: s.label,
        hint: s.hint,
        envFallback: !!process.env[SPACE_ENV[s.key]],
        published: entry.published,
        draft: entry.draft,
        versions: entry.versions,
      };
    });
    return Response.json(spaces);
  } catch (e) {
    const message = e instanceof ChatWebhookSettingsError ? e.message : String(e?.message || e);
    // ตารางยังไม่ถูก migrate — หน้า UI จะโชว์คำเตือนให้รัน 0133 ก่อน
    return Response.json({ error: `อ่านการตั้งค่า webhook ไม่ได้ (รัน migration 0133 หรือยัง?): ${message}` }, { status: 500 });
  }
}

// POST /api/chat-webhooks — ส่งการ์ดทดสอบ: { key } ทดสอบค่าที่ใช้งานจริง
// (published/env) หรือ { key, versionId } ทดสอบ URL ของฉบับร่างก่อนเผยแพร่
export async function POST(request) {
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const key = body.key;
  if (!KNOWN_KEYS.has(key)) {
    return Response.json({ error: 'space ไม่ถูกต้อง' }, { status: 400 });
  }

  const space = CHAT_SPACES.find((s) => s.key === key);
  const card = chatCard({
    title: '🔔 ทดสอบการแจ้งเตือน',
    subtitle: `space ${space.label}${body.versionId ? ' (ฉบับร่าง)' : ''}`,
    rows: [
      { label: 'ผู้ทดสอบ', value: user?.name },
      { label: 'ผลลัพธ์', value: 'ถ้าเห็นการ์ดนี้ แปลว่าตั้งค่าถูกต้อง ✅' },
    ],
    linkPath: '/settings/chat-webhooks',
    linkLabel: 'เปิดหน้าตั้งค่า',
  });

  let result;
  if (body.versionId) {
    // ทดสอบฉบับร่าง: ยิงตรงไปที่ URL ของ draft version นั้น (ยังไม่กระทบระบบ)
    const { data: version, error } = await getSupabaseAdmin()
      .from('chat_webhook_setting_versions')
      .select('id, settingKey, status, url')
      .eq('id', String(body.versionId))
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!version || version.settingKey !== key) {
      return Response.json({ error: 'ไม่พบเวอร์ชันการตั้งค่า webhook' }, { status: 404 });
    }
    if (version.status !== 'draft') {
      return Response.json({ error: 'ทดสอบแบบระบุเวอร์ชันได้เฉพาะฉบับร่าง' }, { status: 409 });
    }
    result = await sendChatToUrl(version.url, card);
  } else {
    invalidateChatWebhookCache(); // ทดสอบต้องเห็นค่าที่เพิ่งเผยแพร่เสมอ ไม่ใช่ cache เก่า
    result = await sendChatNow(key, card);
  }

  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ ok: true });
}
