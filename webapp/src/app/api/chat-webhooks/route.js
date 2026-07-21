import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { recordAudit } from '@/lib/audit';
import { CHAT_SPACES, chatCard, invalidateChatWebhookCache, sendChatNow } from '@/lib/chat';

export const dynamic = 'force-dynamic';

const KNOWN_KEYS = new Set(CHAT_SPACES.map((s) => s.key));

// ปิดท้าย token ใน URL ก่อนเก็บลง audit — audit เปิดให้ supervisor อ่านย้อนหลังได้
// ไม่ควรทิ้ง webhook URL เต็ม ๆ (ใครมี URL ก็โพสต์เข้า space ได้)
const maskUrl = (url) => (url ? String(url).replace(/token=[^&]+/, 'token=***') : url);
const maskRow = (row) => (row ? { ...row, url: maskUrl(row.url) } : row);

// GET /api/chat-webhooks — supervisor เท่านั้น: รายการ space มาตรฐานทั้ง 3
// ผสาน row จากตาราง + บอกว่ามี env fallback ไหม (ไม่เผยค่า env)
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let rows = [];
  try {
    const { data, error } = await getSupabaseAdmin().from('chat_webhooks').select('*');
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    // ตารางยังไม่ถูก migrate — หน้า UI จะโชว์คำเตือนให้รัน 0099 ก่อน
    return Response.json({ error: `อ่านตาราง chat_webhooks ไม่ได้ (รัน migration 0099 หรือยัง?): ${e.message}` }, { status: 500 });
  }

  const envNames = { approvals: 'CHAT_WEBHOOK_APPROVALS', sales: 'CHAT_WEBHOOK_SALES', pm: 'CHAT_WEBHOOK_PM' };
  const merged = CHAT_SPACES.map((s) => {
    const row = rows.find((r) => r.key === s.key) || null;
    return {
      key: s.key,
      label: s.label,
      hint: s.hint,
      url: row?.url || '',
      enabled: row ? !!row.enabled : true,
      saved: !!row,
      envFallback: !!process.env[envNames[s.key]],
      updatedByName: row?.updatedByName || null,
      updatedAt: row?.updatedAt || null,
    };
  });
  return Response.json(merged);
}

// PUT /api/chat-webhooks — upsert ทีละ space: { key, url, enabled }
export async function PUT(request) {
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const key = body.key;
  if (!KNOWN_KEYS.has(key)) {
    return Response.json({ error: 'space ไม่ถูกต้อง' }, { status: 400 });
  }
  const url = (body.url || '').trim();
  // กันพลาดส่งข้อมูลออกนอก Google Chat: บังคับโดเมน webhook ของ Chat เท่านั้น
  if (url && !url.startsWith('https://chat.googleapis.com/v1/spaces/')) {
    return Response.json({ error: 'URL ต้องขึ้นต้นด้วย https://chat.googleapis.com/v1/spaces/' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: before } = await supabase.from('chat_webhooks').select('*').eq('key', key).maybeSingle();

  const row = {
    key,
    url: url || null,
    label: CHAT_SPACES.find((s) => s.key === key)?.label || key,
    enabled: body.enabled !== false,
    updatedBy: user?.id ?? null,
    updatedByName: user?.name ?? null,
    updatedAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('chat_webhooks').upsert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  invalidateChatWebhookCache();
  await recordAudit({
    user,
    action: before ? 'update' : 'create',
    entityType: 'chat_webhook',
    entityId: key,
    before: maskRow(before) || undefined,
    after: maskRow(data),
    summary: `ตั้งค่า Chat webhook space "${row.label}" (${row.enabled ? 'เปิด' : 'ปิด'}${url ? '' : ', ไม่มี URL'})`,
    request,
  });

  return Response.json({ ...data, url: data.url || '' });
}

// POST /api/chat-webhooks — ส่งการ์ดทดสอบเข้า space: { key }
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

  invalidateChatWebhookCache(); // ทดสอบต้องเห็นค่าที่เพิ่งบันทึกเสมอ ไม่ใช่ cache เก่า
  const space = CHAT_SPACES.find((s) => s.key === key);
  const result = await sendChatNow(key, chatCard({
    title: '🔔 ทดสอบการแจ้งเตือน',
    subtitle: `space ${space.label}`,
    rows: [
      { label: 'ผู้ทดสอบ', value: user?.name },
      { label: 'ผลลัพธ์', value: 'ถ้าเห็นการ์ดนี้ แปลว่าตั้งค่าถูกต้อง ✅' },
    ],
    linkPath: '/settings/chat-webhooks',
    linkLabel: 'เปิดหน้าตั้งค่า',
  }));

  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ ok: true });
}
