// ── ตัวห่อ route ของ `/api/ext/v1/**` — ยืนยันคีย์ · จดประวัติ · ตอบ JSON (แผน docs/so-external-api-plan.md) ──────────
//
// ⚠️ เส้นนี้ **ข้ามด่าน session ของ proxy** (`bypassesSessionGate`) ⇒ ทุก route ใต้ `/api/ext/v1/` ต้องผ่านตัวห่อนี้
//    (ยามในเทสต์: ทุกไฟล์ route ใต้ app/api/ext ต้อง export GET ที่มาจาก `extApiGet` และไม่มีเมธอดเขียน)
// ⚠️ ไม่เปิด CORS — ไม่ตอบ `Access-Control-Allow-Origin` (เรียกจากเบราว์เซอร์ตรง ๆ ไม่ได้ · กันคีย์หลุดหน้าเว็บ)
// ⚠️ ห้ามจด header `Authorization` ลงประวัติ — `callLog` เก็บแค่ path + query
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authenticateApiClient } from '@/lib/extApi/auth';
import { recordApiCall } from '@/lib/extApi/callLog';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const extJson = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

/**
 * @param run async ({ supabase, client, request, params }) → { status?, body, rowCount? }
 * @param deps ตัวจำลองในเทสต์ (ห้ามต่อฐานจริง)
 */
export function extApiGet(run, { getSupabase = getSupabaseAdmin, authenticate = authenticateApiClient, record = recordApiCall, clock = () => Date.now() } = {}) {
  return async function GET(request, ctx) {
    const startedAt = clock();
    const supabase = getSupabase();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    const finish = async (status, body, { clientId = null, rowCount = null } = {}) => {
      await record(supabase, { clientId, method: 'GET', url: request.url, status, rowCount, startedAt, now: clock(), ip });
      return extJson(body, status);
    };
    const auth = await authenticate(supabase, request.headers.get('authorization'));
    if (!auth.client) return finish(auth.status, { error: auth.error, message: auth.message });
    try {
      const params = ctx?.params ? await ctx.params : {};
      const result = await run({ supabase, client: auth.client, request, params });
      return finish(result.status || 200, result.body, { clientId: auth.client.id, rowCount: result.rowCount ?? null });
    } catch (error) {
      console.error('[ext-api]', request.url, error?.message || error);
      return finish(500, { error: 'server_error', message: 'อ่านข้อมูลไม่สำเร็จ ลองใหม่ภายหลัง' }, { clientId: auth.client.id });
    }
  };
}
