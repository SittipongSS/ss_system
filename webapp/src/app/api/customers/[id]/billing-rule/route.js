import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCustomerBillingRule } from '@/lib/permissions';
import { billingRuleOf, describeBillingRule, normalizeBillingRule } from '@/lib/sales/billingRule';
import { recordAudit } from '@/lib/audit';
import { logBillingRuleActivity } from '@/lib/master/customerBillingRuleUpdate';

export const dynamic = 'force-dynamic';

// ── PATCH /api/customers/[id]/billing-rule — ตั้ง/แก้/ล้าง "รอบวางบิล" ของลูกค้า (mig 0389) ──
//
// body: `{ billingRule: object | null }` — null = ล้างรอบ (กลับเป็น "ยังไม่ตั้ง")
// คืน: `{ id, billingRule, billingRuleUpdatedAt, billingRuleUpdatedById, billingRuleUpdatedByName, unchanged, activityLogged }`
//   `activityLogged` = ลงแถว "ความเคลื่อนไหว" ของลูกค้าสำเร็จไหม (โมดัลเตือนเมื่อไม่สำเร็จ — ดูข้างล่าง)
//
// ⭐ **เส้นแยกจาก PATCH ของลูกค้าโดยเจตนา** (มติเจ้าของ 25/09 ข้อ 4)
//   · ฝ่ายบัญชีแก้ได้ ทั้งที่แก้ทะเบียนลูกค้าส่วนอื่นไม่ได้ — ด่านคือ `canEditCustomerBillingRule`
//     (ฝ่ายขายทีมที่ดูแล หรือ FN) + ช่องแคบของ proxy (`apiWriteAllowed` · เส้นนี้เส้นเดียว)
//   · **ไม่ต้องอนุมัติใหม่** — ⛔ ห้ามแตะ approvalStatus / resetApprovalOnEdit ในไฟล์นี้
//     ถ้าเขียนผ่าน PATCH ของลูกค้า ช่องใหม่ไม่อยู่ใน exemptFields ⇒ ลูกค้าที่อนุมัติแล้วตกกลับ
//     "รออนุมัติ" และหลุดจาก picker ทุกหน้าทันทีที่ตั้งรอบ (กับดักใหญ่ของทะเบียนลูกค้า)
//   · ลงประวัติเต็มแถว before/after ใน audit_logs แบบเดียวกับ PATCH ของลูกค้า
//     + ผู้แก้ล่าสุด 3 ช่อง (การ์ดบนหน้าลูกค้าโชว์ "แก้ล่าสุดโดย")
//     + แถว "ความเคลื่อนไหว" ของลูกค้า เดิม → ใหม่ (มติเจ้าของ 26/09 ข้อ 7 · ชนิด quiet ไม่เด้งกระดิ่ง)
// ⚠️ ตรวจรูปด้วย `normalizeBillingRule` ตัวเดียวกับโมดัลบนจอ (ปุ่มกับด่านพูดเรื่องเดียวกัน)
//    ฐานมี CHECK `customers_billing_rule_shape` กันรูปอีกชั้น
// ⚠️ ไม่ย้อนไปแก้วันของงวดที่มีอยู่แล้ว — รอบใช้ตอนเลือกรอบให้งวดใหม่เท่านั้น (ใบเก่าไม่เติมย้อนหลัง)
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error: findError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findError) return Response.json({ error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${findError.message}` }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  if (!canEditCustomerBillingRule(user, customer)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้รอบวางบิลของลูกค้ารายนี้ — แก้ได้เฉพาะฝ่ายขายทีมที่ดูแลลูกค้าและฝ่ายบัญชี' }, { status: 403 });
  }

  /* ก่อนรัน mig 0389 แถวลูกค้าไม่มีคอลัมน์นี้ (`select('*')` ไม่คืนคีย์) — บอกตรง ๆ แทนที่จะปล่อยให้
     update ตอบ PGRST204 ภาษาอังกฤษ ซึ่งผู้ใช้อ่านแล้วนึกว่าตัวเองกรอกผิด */
  if (!Object.prototype.hasOwnProperty.call(customer, 'billingRule')) {
    return Response.json({ error: 'ฐานข้อมูลยังไม่รองรับรอบวางบิล (รอรัน migration 0389) — แจ้งผู้ดูแลระบบ' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('billingRule' in body)) {
    return Response.json({ error: 'ต้องส่ง billingRule (null = ล้างรอบวางบิล)' }, { status: 400 });
  }
  const { rule, error: ruleError } = normalizeBillingRule(body.billingRule);
  if (ruleError) return Response.json({ error: ruleError }, { status: 400 });

  const savedFields = (row) => ({
    id: row.id,
    billingRule: row.billingRule ?? null,
    billingRuleUpdatedAt: row.billingRuleUpdatedAt ?? null,
    billingRuleUpdatedById: row.billingRuleUpdatedById ?? null,
    billingRuleUpdatedByName: row.billingRuleUpdatedByName ?? null,
  });

  /* ไม่มีอะไรเปลี่ยน = ไม่เขียน ไม่ลงประวัติ — กดบันทึกซ้ำต้องไม่ทำให้ "แก้ล่าสุดโดย" กลายเป็นคนที่แค่เปิดดู
     เทียบรูปมาตรฐานทั้งสองฝั่ง (ตัวทำรูปตัวเดียวกัน ⇒ ลำดับคีย์ตรงกันเสมอ) */
  const before = billingRuleOf(customer.billingRule);
  if (JSON.stringify(before) === JSON.stringify(rule)) {
    return Response.json({ ...savedFields(customer), unchanged: true });
  }

  const now = new Date().toISOString();
  /* ⚠️ เขียนเป็น object literal ตรงใน `.update({...})` โดยเจตนา — check:columns อ่านคีย์ของรูปนี้ได้
     (ตัวแปรที่ประกาศเป็นก้อนเดียวมันมองไม่เห็น) ⇒ พิมพ์ชื่อคอลัมน์ผิดแล้ว CI จับได้ */
  const { data: updated, error: updateError } = await supabase
    .from('customers')
    .update({
      billingRule: rule,
      billingRuleUpdatedAt: now,
      billingRuleUpdatedById: user?.id != null ? String(user.id) : null,
      billingRuleUpdatedByName: user?.name ?? null,
      updatedAt: now,
    })
    .eq('id', id)
    .select()
    .single();
  if (updateError) {
    if (updateError.code === '23514') {
      return Response.json({ error: 'รูปแบบรอบวางบิลไม่ผ่านการตรวจของฐานข้อมูล' }, { status: 400 });
    }
    if (updateError.code === 'PGRST204' || updateError.code === '42703') {
      return Response.json({ error: 'ฐานข้อมูลยังไม่รองรับรอบวางบิล (รอรัน migration 0389) — แจ้งผู้ดูแลระบบ' }, { status: 503 });
    }
    return Response.json({ error: `บันทึกรอบวางบิลไม่สำเร็จ: ${updateError.message}` }, { status: 500 });
  }

  const verb = !rule ? 'ล้าง' : before ? 'แก้' : 'ตั้ง';
  const subject = [customer.arCode, customer.name].filter(Boolean).join(' ') || id;
  await recordAudit({
    user, action: 'update', entityType: 'customer', entityId: id,
    before: customer, after: updated,
    summary: `${verb}รอบวางบิลของลูกค้า ${subject}${rule ? `: ${describeBillingRule(rule)}` : ''}`,
    request,
  });

  /* ⭐ แถว "ความเคลื่อนไหว" ของลูกค้า (มติเจ้าของ 26/09 ข้อ 7) — audit_logs เปิดได้เฉพาะแอดมิน ⇒ ฝ่ายขาย/บัญชี
     ที่แก้รอบกันเองย้อนดู "รอบเดิมเป็นอะไร ใครเปลี่ยน" ได้จากเธรดของลูกค้าที่เดียว (ชนิด quiet ไม่เด้งกระดิ่ง)
     ⚠️ **ลงเธรดไม่สำเร็จ ≠ บันทึกไม่สำเร็จ** — รอบถูกเขียนแล้วและ audit_logs ลงแล้วข้างบน ⇒ ตัวช่วยกลืน error
        ทุกทาง (คืน/throw) แล้วคืน false · บอกผ่าน `activityLogged` ให้โมดัลเตือนแทนการสัญญาว่า
        "รอบเดิมอยู่ในความเคลื่อนไหว" ทั้งที่ไม่มีแถวนั้น · สัญญานี้เทสต์ด้วยพฤติกรรมที่ customerBillingRuleUpdate.test */
  const activityLogged = await logBillingRuleActivity(supabase, { customerId: id, before, after: rule, user });

  return Response.json({ ...savedFields(updated), unchanged: false, activityLogged });
}
