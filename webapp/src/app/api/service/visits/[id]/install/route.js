import { withUser, fail } from '@/lib/http';
import { requireVisit } from '@/lib/service/visitsRepo';
import { installJobGet, installSendPost, installSpotPut } from '@/lib/service/installJobRoute';

export const dynamic = 'force-dynamic';

/* ── หน้างานติดตั้งของช่าง (ขั้นเข้าติดตั้ง PR-5a · ม็อก C1/C2/C3 · docs/service-install-step.md) ──────────────
   GET  ภาพงาน (โซน › จุด) — คนที่อ่านนัดได้ (ช่างของงาน · ฝ่ายบริการ)
   PUT  บันทึกจุดหนึ่งจุด / หมายเหตุโซน — ช่างต้องกดเริ่มงานก่อน (`running`) · ส่งงานแล้วช่างแก้ไม่ได้ (ด่าน requireVisit)
   POST ส่งงาน — ผลโซนที่ค้าง › ย้ายเครื่องขึ้นโซน › ปิดนัด › กระดิ่งถึงฝ่ายขาย
   ⭐ ตรรกะทั้งหมดอยู่ที่ `lib/service/installJobRoute.js` · ที่นี่ตรวจสิทธิ์ + ส่งต่อ
   ⚠️ จอห้ามส่ง retry: true กับ POST — ส่งซ้ำปลอดภัย (เครื่องที่ย้ายแล้วข้าม) แต่ต้องให้คนเห็นผลรอบแรกก่อน */
const UNEXPECTED = 'บันทึกงานติดตั้งไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ';

async function forward(label, run) {
  try {
    const result = await run();
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`[install-job] ${label} unexpected error:`, error);
    return fail(UNEXPECTED, 500);
  }
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireVisit({ user, supabase, id });
  if (access.response) return access.response;
  return forward(`GET ${id}`, () => installJobGet({ supabase, visit: access.visit }));
});

export const PUT = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireVisit({ user, supabase, id, edit: true, running: true });
  if (access.response) return access.response;
  const body = await req.json().catch(() => null);
  return forward(`PUT ${id}`, () => installSpotPut({ supabase, user, visit: access.visit, body }));
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireVisit({ user, supabase, id, edit: true, running: true });
  if (access.response) return access.response;
  const body = await req.json().catch(() => null);
  return forward(`POST ${id}`, () => installSendPost({ supabase, user, visit: access.visit, body, request: req }));
});
