import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { contractKindLabel, signedApproveError } from '@/lib/sales/contracts';

export const dynamic = 'force-dynamic';

/* POST /api/sales-planning/contracts/[id]/approve-signed
   ── AE Supervisor รับรองการลงนาม (mig 0323 · มติผู้ใช้ 2026-08-31) ────────────
   ───────────────────────────────────────────────────────────────────────────

   *"ต้องมีขั้น Approve จาก AE sup ด้วย ไม่งั้นไปทำงานต่อไม่ได้"*

   ⭐ **นี่คือด่านที่สองที่ไม่เคยมี** — ของเดิม `/sign` ปิดสถานะเป็น `signed` เลย
   ซึ่ง `signed` เป็นตัวปลดล็อกของจริงหลายอย่าง (สถานะใบเสนอราคา · การเปิดบันทึก
   เพิ่มเติมสัญญา · ด่านงานบริการเมื่อ unpark) ⇒ คนที่ออกสัญญาปิดเองได้ทั้งเส้น

   🔴 **ด่านห้ามยืม `canEditSalesPlanning` เด็ดขาด** — `/sign` ที่อยู่ก่อนหน้าใช้ cap นั้น
   ซึ่ง **AE กับ AC ผ่านหมด** ⇒ ถ้าขั้นนี้ใช้ตัวเดียวกัน คนที่กดลงนามก็กดรับรองตัวเองได้
   = ด่านที่สองไม่มีอยู่จริง (บทเรียนเดียวกับ `/approve-external`)

   ⚠️ ชั้นสิทธิ์มีสามชั้นเหมือน `/approve-external`: proxy (`salesplan:edit` ทั้ง namespace)
   → `canViewSalesPlanning` (แค่กันคนที่ไม่เห็นโมดูล) → **`signedApproveError` คือด่านจริง**

   ⚠️ ไม่ต้องออกเลข — ใบมีเลขตั้งแต่ขั้น "ออกสัญญา" แล้ว จึงเป็น UPDATE ธรรมดา
   ไม่ต้องใช้ RPC (ต่างจาก `/approve-external` ที่ออกเลขพร้อมเปลี่ยนสถานะทีเดียว) */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  const gate = signedApproveError(before, user);
  if (gate) return fail(gate, 409);

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('sales_contracts').update({
    status: 'signed',
    approvedById: user.id || null,
    approvedByName: user.name || null,
    approvedAt: now,
    updatedAt: now,
  })
    /* กันสองคนกดชนกัน — สถานะต้องยังเป็นขั้นรับรองอยู่ ณ ตอนเขียนจริง
       (แพตเทิร์นเดียวกับด่านกันกดชนของใบสั่งขาย · ค่าเดิมไม่ใช่ NULL จึงใช้ .eq ได้) */
    .eq('id', id).eq('status', 'awaiting_approval')
    .select().maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('สถานะของใบเปลี่ยนไปแล้ว — เปิดใหม่แล้วลองอีกครั้ง', 409);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: data,
    summary: `รับรองการลงนาม${contractKindLabel(data.kind)} ${data.contractNo} — สัญญาใช้งานได้แล้ว`,
    request: req,
  });

  const { issuedHtml, ...rest } = data;
  return ok(rest);
});
