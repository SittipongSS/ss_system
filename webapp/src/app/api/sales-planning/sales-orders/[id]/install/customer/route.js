import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { installCustomerPost } from '@/lib/service/installCustomerRoute';
// สวิตช์ขั้นเข้าติดตั้ง (mig 0425) — ตัวอ่านเดียว · ฝั่ง server เท่านั้น
import { installStepEnabled } from '@/lib/service/installStepFlag';

export const dynamic = 'force-dynamic';

/* ── คำตอบของลูกค้าต่อนัดติดตั้ง (ขั้นเข้าติดตั้ง PR-4 · ม็อก A5 · docs/service-install-step.md) ──────────────
   POST `{ siteId, visitId, action: 'confirm'|'reschedule', contactName, … }`
   · confirm = ลูกค้ายืนยันวัน → ขึ้นตารางช่างถ้าด่านผ่าน (ไม่ผ่าน = คงร่าง + เหตุ)
   · reschedule = ลูกค้าขอเปลี่ยนวัน → วันใหม่ + เหตุ กลับไปรอ TS ยืนยันวันใหม่ (+ กระดิ่งถึงหัวหน้า TS/Planner)
   ⭐ ตรรกะทั้งหมดอยู่ที่ `lib/service/installCustomerRoute.js` · ที่นี่ส่งต่อ + อ่านสวิตช์
   ⚠️ proxy: อยู่ใต้ /api/sales-planning ⇒ เขียนได้เฉพาะคนที่ถือ salesplan:edit
   ⚠️ จอห้ามส่ง retry: true — เขียนแบบเทียบสถานะเดิม (ยิงซ้ำ = 409) */
const UNEXPECTED = 'บันทึกคำตอบของลูกค้าไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  try {
    const result = await installCustomerPost({ supabase, user, id, body, enabled: installStepEnabled(), request: req });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error(`[install-customer] POST ${id} unexpected error:`, error);
    return fail(UNEXPECTED, 500);
  }
});
