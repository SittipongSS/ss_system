import { loadScoped } from '@/lib/scopedRow';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { can } from '@/lib/permissions';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { linkDealToProject } from '@/lib/sales/dealProjectLink';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/deals/[id]/link-project { projectId, startDate?, move? }
// เฟส B: ผูกดีลเข้า "โครงการเดิม" (หลายดีลต่อโครงการ) — คู่กับ create-project (สร้างใหม่).
// ต่อ task ชุดตาม template ของประเภทดีลเป็น segment ใหม่ท้ายไทม์ไลน์ (anchor = วันเริ่ม
// ของ segment, pin ด้วย startLocked). กติกา: ลูกค้าต้องตรงกัน (มติ #5 — ห้ามข้ามลูกค้า).
//
// `move: true` = **ย้ายดีลข้ามโครงการ** (มติผู้ใช้ 2026-08-06) — ดีลที่ผูกโครงการแล้ว
// เดิมตีกลับ 409 ทุกกรณี ผูกผิดใบแล้วแก้ไม่ได้เลยนอกจากลบดีลทิ้ง. เส้นทางย้าย
// **ไม่ gen ไทม์ไลน์ใหม่และไม่เลื่อนวัน** — segment เดิมย้ายทั้งชุดพร้อมสถานะ/วันจริง
// และของที่ mirror โครงการจากดีล (งาน/คำร้อง/ใบสั่งขาย) ย้ายตาม (ดู lib/sales/dealProjectMove).
// ธง move ต้องส่งมาโดยตั้งใจเท่านั้น: ผู้เรียกเก่า/การกดซ้ำยังได้ 409 เหมือนเดิม
//
// ⚠️ เนื้อในย้ายไปอยู่ที่ `lib/sales/dealProjectLink.js` แล้ว — โมดัลปิด Won เรียก
// ฟังก์ชันเดียวกันเพื่อผูกโครงการให้ในคำขอเดียวกับที่ปิดการขาย (ดีลลอยปิด Won ไม่ได้)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user) || !can(user.role, 'pm:edit')) return forbidden();

  const { id } = await ctx.params;
  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', id, user, 'edit');
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const result = await linkDealToProject(supabase, {
    deal,
    projectId: body.projectId,
    move: !!body.move,
    startDate: body.startDate || null,
    user,
    req,
  });
  if (result.error) return fail(result.error, result.status);
  return ok(result.data, result.status);
});
