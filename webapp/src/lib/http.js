import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';

// ───────────────────────────────────────────────────────────────
// Response helpers — รูปแบบเดียวกันทั้งเว็บ
//   สำเร็จ: ส่ง payload ดิบ (array / object / row) ตาม contract เดิมที่ frontend ใช้
//   ผิดพลาด: { error: <string> } + status
// ───────────────────────────────────────────────────────────────
export function ok(data, status = 200) {
  return Response.json(data, { status });
}
export function fail(error, status = 400) {
  return Response.json({ error }, { status });
}
export const badRequest = (msg = 'bad request') => fail(msg, 400);
export const unauthorized = (msg = 'unauthorized') => fail(msg, 401);
export const forbidden = (msg = 'forbidden') => fail(msg, 403);
export const notFound = (msg = 'not found') => fail(msg, 404);
export const conflict = (msg = 'conflict') => fail(msg, 409);
export const serverError = (msg = 'server error') => fail(msg, 500);

// ห่อ route handler: resolve identity + service-role client ครั้งเดียว แล้วฉีดให้ handler
// (ตัด preamble `getSupabaseAdmin()` + `getCurrentUser()` ที่ซ้ำทุก route)
// handler รับ object เดียว: { user, supabase, req, ctx }
//   - ctx = arg ที่ 2 ของ route (มี ctx.params เป็น Promise สำหรับ dynamic route)
// ไม่บังคับ auth ที่นี่ — แต่ละ handler ตัดสินใจเอง (บาง route เปิด public / เช็ค cap เอง)
// `before` / `after` (ไม่บังคับ) = งานก่อน/หลัง handler · `after` รับ `{ user, supabase, req, ctx, res, prepared }`
//   (`prepared` = ค่าที่ before คืน — เช่นอ่านของที่ handler กำลังจะลบไว้ก่อน) · คืนคำตอบเดิมเสมอ
//   — สองตัวนี้ต้องกลืน error เอง (เช่น `EXCISE_TASK_SYNC` ของ lib/pm/exciseBillingTaskSync.js)
export function withUser(handler, { before = null, after = null } = {}) {
  return async (req, ctx) => {
    const user = await getCurrentUser();
    const supabase = getSupabaseAdmin();
    const prepared = before ? await before({ user, supabase, req, ctx }) : undefined;
    const res = await handler({ user, supabase, req, ctx });
    if (after) await after({ user, supabase, req, ctx, res, prepared });
    return res;
  };
}
