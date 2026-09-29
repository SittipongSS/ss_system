import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditCustomerBillingRule } from '@/lib/permissions';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { recordAudit } from '@/lib/audit';
import { naText } from '@/lib/format';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { installmentScheduleAllowed } from '@/lib/sales/salesOrderPayments';
import { describeBillingRule } from '@/lib/sales/billingRule';
import { billingV4SchemaError } from '@/lib/sales/billingPolicySchema';
import { installmentBillingSchemaError, updateInstallment } from '@/lib/sales/salesOrderInstallmentsStore';
import {
  SCHEDULE_MANY_ROW_STALE, installmentsAfterWrite, scheduleManyStoppedMessage, writeScheduleMany,
} from '@/lib/sales/installmentScheduleMany';
import { billingSkipReady, loadRedateBundle, loadScheduleRule } from '@/lib/sales/installmentScheduleServer';
import { customerRedateCheck, installmentsForScreen } from '@/lib/sales/customerRuleChange';

export const dynamic = 'force-dynamic';

// ── POST /api/customers/[id]/billing-rule/redate — จอ "งวดที่วันจะเปลี่ยน" กด "ใช้วันใหม่ N งวด" (รุ่นสี่ · system-design §7.2) ──
//
// body: `{ rows: [{ id, billingDate: iso|null, dueDate: iso|null, updatedAt }] }` — แถวจาก `ruleChange.rows` ของ PATCH กติกา
//   ที่คนเลือก (ไม่มีค่าตั้งต้น · งวดที่ไม่เลือกคงวันเดิม) · ≤ 60 งวดต่อคำขอ (เพดานเดียวกับ schedule-many)
// คืน 200 `{ saved, orders: [{ salesOrderId, installments }] }` · 409 `{ error, conflicts: [{ id, seq, salesOrderId, salesOrderCode, reason }] }`
//
// ⭐ **ตัวตรวจ + ตัวเขียนชุดเดียวกับ `schedule-many`** (installmentScheduleMany.js) แยกตามใบ — ล็อกโหมดตั้งวัน · `updatedAt` ทีละงวด ·
//   ด่าน `schedule` ทีละงวด (`installmentActionError`) · `validateInstallmentDates` กับกติกา **ใหม่** ของลูกค้า (อ่านสดหลังบันทึก)
//   ⇒ ทุกงวดทุกใบตรวจครบก่อนเขียนงวดแรก (ทั้งหมดหรือไม่มีเลยในขั้นตรวจ) · server **ไม่คิดวันเอง** (วันมาจากที่จอเสนอ/คนเห็น)
// ⭐ สิทธิ์สองชั้น: คนแก้กติกาลูกค้าได้ (`canEditCustomerBillingRule` — ฝ่ายขายทีมที่ดูแล + FN) **และ** ตั้งวันงวดได้
//   (`installmentScheduleAllowed` — ด่าน schedule) · ใบที่คนนี้มองไม่เห็น (inSalesViewScope) = 403 ไม่อ่านงวด
// ⭐ proxy เปิดเส้นนี้ให้ FN ในช่องแคบเดียวกับ PATCH `/billing-rule` (FN ไม่มี customers:edit · `apiWriteAllowed`)
// ⚠️ ไม่มี RPC ⇒ ไม่มีทรานแซกชัน — อีกหน้าต่างเขียนแทรกกลางทาง = หยุดที่งวดนั้น · งวดที่ลงแล้วคงอยู่และลง audit ก่อนตอบ 409
//   (กติกาเดียวกับ schedule-many) · กดซ้ำปลอดภัย: งวดที่ค่าตรงแล้วถูกข้าม
// ⚠️ audit ต่อใบ ("ลงประวัติของแต่ละใบ" — ม็อก rd-apply) · entity เดียวกับทางเขียนงวดอื่น (`sales_order_installments` · id ของใบ)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  /* สิทธิ์ตั้งวันงวดก่อนโหลด (ท่าเดียวกับ schedule-many) — คนที่ผ่าน proxy แต่ตั้งวันไม่ได้ต้องได้ 403 ของจริง */
  if (!canViewSalesPlanning(user) || !installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const sent = body?.rows;

  try {
    const { data: customer, error: findError } = await supabase
      .from('customers').select('*').eq('id', id).maybeSingle();
    if (findError) return fail(`อ่านข้อมูลลูกค้าไม่สำเร็จ: ${findError.message}`, 500);
    if (!customer) return notFound('ไม่พบข้อมูลลูกค้ารายนี้');
    if (!canEditCustomerBillingRule(user, customer)) {
      return forbidden('ไม่มีสิทธิ์จัดวันงวดตามกำหนดวางบิลของลูกค้ารายนี้ — ทำได้เฉพาะฝ่ายขายทีมที่ดูแลลูกค้าและฝ่ายบัญชี');
    }

    /* กติกา **ใหม่** อ่านสด (หลัง PATCH บันทึกแล้ว) — ไม่เชื่อกติกาที่จอถือ · อ่านพลาด = ปิดแค่งวดที่เปลี่ยนวันวางบิล */
    const { rule, ruleUnavailable } = await loadScheduleRule(supabase, customer.id);
    const ids = Array.isArray(sent) ? sent.map((row) => String(row?.id || '').trim()).filter(Boolean) : [];
    /* ⚠️ อ่านสดแบบโยน error — กลืนเป็น [] แล้วทุกงวดกลายเป็น "ไม่อยู่แล้ว" · คำร้องอ่านพลาด ≠ ยังไม่ขอ */
    const bundle = await loadRedateBundle(supabase, user, ids);
    const skipReady = await billingSkipReady(supabase, bundle.installments);
    const built = customerRedateCheck({ customerId: customer.id, bundle, sent, user, rule, ruleUnavailable, skipReady });
    if (built.status === 409) return ok({ error: built.error, conflicts: built.conflicts }, 409);
    if (built.error) return fail(built.error, built.status);
    if (!built.plans.length) return ok({ saved: 0, orders: [] });

    /* เขียนทีละใบ ทีละงวด (ตัวเขียนของ schedule-many) — พังงวดแรกของใบแรก = ยังไม่มีอะไรลง ⇒ แปลแบบงวดเดียว (0393 ก่อน 0389) */
    const failMessage = (writeError) => billingV4SchemaError(writeError) || installmentBillingSchemaError(writeError)
      || documentWorkflowError(writeError, { context: `customer redate ${customer.id}` }).message;
    const done = [];
    let saved = 0;
    for (const plan of built.plans) {
      let written;
      try {
        written = await writeScheduleMany(plan.rows, (rowId, patch, expectedUpdatedAt) => updateInstallment(
          supabase, rowId, patch, { expectedUpdatedAt },
        ));
      } catch (writeError) {
        if (!saved) {
          const schema = billingV4SchemaError(writeError) || installmentBillingSchemaError(writeError);
          if (schema) return fail(schema, 503);
          const mapped = documentWorkflowError(writeError, { context: `customer redate ${customer.id}` });
          return fail(mapped.message, mapped.status);
        }
        /* ใบก่อนหน้าลงแล้ว — หยุดที่งวดแรกของใบนี้ (ไม่มีอะไรของใบนี้ลง) */
        written = { before: [], after: [], stopped: { id: plan.rows[0].id, seq: plan.rows[0].seq, error: writeError } };
      }
      const { before, after } = written;
      if (after.length) {
        await recordAudit({
          user,
          action: 'update',
          entityType: 'sales_order_installments',
          entityId: plan.order.id,
          before: { installments: before },
          after: { installments: after, redate: 'customer-rule', customerId: customer.id, billingRule: rule },
          summary: `จัดวันใหม่ตามกำหนดวางบิลของลูกค้า ${customer.arCode || customer.id} (${naText(describeBillingRule(rule))})`
            + ` ${after.length} งวด ของ ${plan.order.orderNumber}${written.stopped ? ` (หยุดที่งวด ${written.stopped.seq})` : ''}`,
          request: req,
        });
        saved += after.length;
        done.push({ salesOrderId: plan.order.id, installments: installmentsForScreen(plan.order, installmentsAfterWrite(plan.live, after)) });
      }
      if (written.stopped) {
        const reason = written.stopped.error ? failMessage(written.stopped.error) : SCHEDULE_MANY_ROW_STALE;
        return ok({
          error: `${plan.order.orderNumber} ${scheduleManyStoppedMessage(saved, { seq: written.stopped.seq, message: reason })}`,
          saved,
          conflicts: [{
            id: written.stopped.id, seq: written.stopped.seq, salesOrderId: plan.order.id,
            salesOrderCode: plan.order.orderNumber, reason,
          }],
          orders: done,
        }, 409);
      }
    }
    return ok({ saved, orders: done });
  } catch (redateError) {
    return fail(redateError.message, 500);
  }
});
