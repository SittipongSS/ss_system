import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditCustomerBillingRule } from '@/lib/permissions';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { NA } from '@/lib/format';
import { describeBillingRule, normalizeRule, ruleOf, sameRule } from '@/lib/sales/billingRule';
import { billingV4SchemaError } from '@/lib/sales/billingPolicySchema';
import { loadCustomerOrdersBundle } from '@/lib/sales/installmentScheduleServer';
import { customerRuleChange } from '@/lib/sales/customerRuleChange';
import { recordAudit } from '@/lib/audit';
import { holidaySet } from '@/lib/master/holidays';
import { calendarChangeLines, calendarFileIdsToCheck, checkCalendarFiles, logBillingRuleActivity } from '@/lib/master/customerBillingRuleUpdate';

export const dynamic = 'force-dynamic';

/* ระยะของตัวตรวจรูป (system-design §7.1 · §8): ระยะ 1 รับรูปเดิม (แท็บก่อน deploy) · ระยะ 2a ขึ้นพร้อมโมดัลรุ่นสี่ = **ไม่รับแล้ว**
   ⇒ `{ credit:false }` · รุ่นหนึ่ง/สอง · ธง `legacyNoCredit` (ผลการอ่าน — CHECK ของ 0393 ไม่รับคีย์นี้) ได้ 400 "เลือกว่าลูกค้าต้องวางบิลไหม"
   ⚠️ แท็บเก่าจริง ๆ ตกที่ด่าน `baseUpdatedAt` ก่อนถึงตรงนี้ (โมดัลรุ่นเดิมไม่ส่งคีย์นี้) — ได้ "โหลดหน้าใหม่" */
const RULE_ALLOW_LEGACY = false;

const RELOAD_MESSAGE = 'หน้านี้เปิดค้างจากรุ่นก่อน — โหลดหน้าใหม่แล้วตั้งกำหนดวางบิลอีกครั้ง';
/* ตัวล็อกรุ่นของกติกา (`billingRuleUpdatedAt` ที่ GET ส่งไปให้จอ) — สตริงดิบของ timestamptz หรือ null (ยังไม่เคยตั้ง)
   ⚠️ ตรวจแค่ "หน้าตาเป็นเวลา" เพื่อไม่ให้ฐานตอบ 22007 เป็น 500 — **ห้ามแปลงผ่าน Date** (ทิ้งไมโครวินาที ⇒ ไม่ตรงแถวสด = 409 ปลอมทุกครั้ง) */
const TIMESTAMP_SHAPE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;
function baseUpdatedAtOf(body) {
  if (!Object.hasOwn(body, 'baseUpdatedAt')) return { error: RELOAD_MESSAGE };
  const raw = body.baseUpdatedAt;
  if (raw === null) return { value: null };
  if (typeof raw !== 'string' || !TIMESTAMP_SHAPE.test(raw.trim())) return { error: RELOAD_MESSAGE };
  return { value: raw.trim() };
}

// ── PATCH /api/customers/[id]/billing-rule — ตั้ง/แก้/ล้าง "กำหนดวางบิล" ของลูกค้า (mig 0389 · 0390 · รุ่นสี่ 0393) ──
//
// body: `{ billingRule: object | null, baseUpdatedAt: string | null }`
//   · `billingRule` รุ่นสี่ (`normalizeRule` ตัวเดียวกับโมดัล · contracts §1–2):
//       `{ v:4, need:'none', note? }` = ไม่ต้องวางบิล · `{ v:4, need:'required', billing:null }` = ต้องวางบิล ยังไม่ตั้งรอบ ·
//       `{ v:4, need:'required', billing, creditDays, runs }` = มีรอบ · `null` = ล้าง (กลับเป็น "ยังไม่ระบุ")
//     แถบถาม "ลูกค้าต้องวางบิลไหม?" บนแผงงวด/หน้าสร้าง SO ใช้เส้นนี้ด้วย (สองค่าแรก)
//   · `baseUpdatedAt` = `billingRuleUpdatedAt` ดิบที่จอเห็นตอนเปิด (ตัวล็อก · null = ยังไม่เคยตั้ง) — ไม่ส่งคีย์ = 400 โหลดหน้าใหม่
// คืน: `{ id, billingRule, billingRuleUpdatedAt, billingRuleUpdatedById, billingRuleUpdatedByName, unchanged, activityLogged,
//        ruleChange: { rows, kept, same, hiddenOrders } | null, ruleChangeError? }`
//   `ruleChange` = งวดเปิดของทุกใบที่ยังมีชีวิตของลูกค้า (ที่คนนี้เห็น) ที่วันจะเปลี่ยนตามกติกาใหม่ — **ระบบไม่ย้ายวันเอง**
//     จอ "งวดที่วันจะเปลี่ยน" ให้คนเลือกแล้วยิง POST `…/billing-rule/redate` (แถวใน `rows` พก `updatedAt` ไว้ให้แล้ว)
//   `activityLogged` = ลงแถว "ความเคลื่อนไหว" ของลูกค้าสำเร็จไหม (โมดัลเตือนเมื่อไม่สำเร็จ)
//   409 (มีคนแก้หลังเปิด) = `{ error, current: { billingRule, billingRuleUpdatedAt, billingRuleUpdatedByName } }` — จอคงค่าที่กรอกไว้
//
// ⭐ **ตัวล็อก** (system-design §7.1 · รุ่นสาม §3.5): เขียนเฉพาะเมื่อ `billingRuleUpdatedAt` ยังเป็นรุ่นที่จอเห็น
//   (null ⇒ `.is(null)` · มีค่า ⇒ `.eq(สตริงดิบ)`) · SA กับ FN แก้พร้อมกัน = คนที่สองได้ 409 ไม่ใช่ทับเงียบ
// ⭐ **เส้นแยกจาก PATCH ของลูกค้าโดยเจตนา** (มติเจ้าของ 25/09 ข้อ 4)
//   · ฝ่ายบัญชีแก้ได้ ทั้งที่แก้ทะเบียนลูกค้าส่วนอื่นไม่ได้ — ด่านคือ `canEditCustomerBillingRule`
//     (ฝ่ายขายทีมที่ดูแล หรือ FN) + ช่องแคบของ proxy (`apiWriteAllowed` · เส้นนี้กับ /redate เท่านั้น)
//   · **ไม่ต้องอนุมัติใหม่** — ⛔ ห้ามแตะด่านอนุมัติของทะเบียนลูกค้าในไฟล์นี้ (ยามใน customerBillingRuleRoute.test)
//     ถ้าเขียนผ่าน PATCH ของลูกค้า ช่องใหม่ไม่อยู่ใน exemptFields ⇒ ลูกค้าที่อนุมัติแล้วตกกลับ
//     "รออนุมัติ" และหลุดจาก picker ทุกหน้าทันทีที่ตั้งรอบ (กับดักใหญ่ของทะเบียนลูกค้า)
//   · ลงประวัติเต็มแถว before/after ใน audit_logs แบบเดียวกับ PATCH ของลูกค้า
//     + ผู้แก้ล่าสุด 3 ช่อง (การ์ดบนหน้าลูกค้าโชว์ "แก้ล่าสุดโดย")
//     + แถว "ความเคลื่อนไหว" ของลูกค้า เดิม → ใหม่ (มติเจ้าของ 26/09 ข้อ 7 · ชนิด quiet ไม่เด้งกระดิ่ง)
// ⚠️ ฐานมี CHECK `customers_billing_rule_shape` กันรูปอีกชั้น — ก่อนรัน 0393 รุ่นสี่ตกทุกตัว (23514) ⇒ 503 "รอรัน migration 0393"
// ⭐ ปฏิทินรายปี (รุ่นห้า · มติ 29/09): รูปมาตรฐาน + ด่าน "ไม่มีสูตรประมาณการ" อยู่ใน normalizeRule แล้ว · ที่นี่เพิ่มแค่
//   (1) fileId ของรูปปฏิทินที่เพิ่งผูกต้องเป็นไฟล์แนบของลูกค้ารายนี้ (2) audit + เธรดต่อท้ายสรุปการแก้ปฏิทิน (calendarChangeLines)
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
    return Response.json({ error: 'ไม่มีสิทธิ์แก้กำหนดวางบิลของลูกค้ารายนี้ — แก้ได้เฉพาะฝ่ายขายทีมที่ดูแลลูกค้าและฝ่ายบัญชี' }, { status: 403 });
  }

  /* ก่อนรัน mig 0389 แถวลูกค้าไม่มีคอลัมน์นี้ (`select('*')` ไม่คืนคีย์) — บอกตรง ๆ แทนที่จะปล่อยให้
     update ตอบ PGRST204 ภาษาอังกฤษ ซึ่งผู้ใช้อ่านแล้วนึกว่าตัวเองกรอกผิด */
  if (!Object.prototype.hasOwnProperty.call(customer, 'billingRule')) {
    return Response.json({ error: 'ฐานข้อมูลยังไม่รองรับรอบวางบิล (รอรัน migration 0389) — แจ้งผู้ดูแลระบบ' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('billingRule' in body)) {
    return Response.json({ error: 'ต้องส่ง billingRule (null = ล้างกำหนดวางบิล)' }, { status: 400 });
  }
  const base = baseUpdatedAtOf(body);
  if (base.error) return Response.json({ error: base.error }, { status: 400 });
  const { rule, error: ruleError } = normalizeRule(body.billingRule, { allowLegacy: RULE_ALLOW_LEGACY });
  if (ruleError) return Response.json({ error: ruleError }, { status: 400 });

  const savedFields = (row) => ({
    id: row.id,
    billingRule: row.billingRule ?? null,
    billingRuleUpdatedAt: row.billingRuleUpdatedAt ?? null,
    billingRuleUpdatedById: row.billingRuleUpdatedById ?? null,
    billingRuleUpdatedByName: row.billingRuleUpdatedByName ?? null,
  });

  /* ไม่มีอะไรเปลี่ยน = ไม่เขียน ไม่ลงประวัติ — กดบันทึกซ้ำต้องไม่ทำให้ "แก้ล่าสุดโดย" กลายเป็นคนที่แค่เปิดดู
     เทียบผลการอ่านรุ่นสี่ทั้งสองฝั่ง (`sameRule`) ⇒ รุ่นสองในฐานกับรุ่นสี่ที่ความหมายเท่ากัน = ไม่เปลี่ยน (ฐานคงรูปเดิม ไม่แปลงเงียบ)
     ⚠️ `{ credit:false }` ในฐานไม่มีวันเท่ากับค่ารุ่นสี่ (ผลการอ่านมีธง legacyNoCredit) ⇒ ตอบคำถาม "ต้องวางบิลไหม" = เขียนเสมอ */
  const before = customer.billingRule ?? null;
  if (sameRule(before, rule)) {
    return Response.json({ ...savedFields(customer), unchanged: true, ruleChange: { rows: [], kept: [], same: [], hiddenOrders: 0 } });
  }

  /* ⭐ รูปปฏิทินที่เพิ่งผูก (รุ่นห้า · years[YYYY].fileId) ต้องเป็นไฟล์แนบของลูกค้ารายนี้ — ตรวจเฉพาะ id ใหม่
     (ไฟล์ที่ผูกไว้เดิมแล้วถูกลบทีหลัง ต้องไม่ทำให้แก้กติกาไม่ได้) · อ่านพลาด = 503 ไม่ผ่านเงียบ */
  const fileProblem = await checkCalendarFiles(supabase, id, calendarFileIdsToCheck(before, rule));
  if (fileProblem) return Response.json({ error: fileProblem.error }, { status: fileProblem.status });

  const now = new Date().toISOString();
  /* ⚠️ เขียนเป็น object literal ตรงใน `.update({...})` โดยเจตนา — check:columns อ่านคีย์ของรูปนี้ได้
     (ตัวแปรที่ประกาศเป็นก้อนเดียวมันมองไม่เห็น) ⇒ พิมพ์ชื่อคอลัมน์ผิดแล้ว CI จับได้ */
  let write = supabase
    .from('customers')
    .update({
      billingRule: rule,
      billingRuleUpdatedAt: now,
      billingRuleUpdatedById: user?.id != null ? String(user.id) : null,
      billingRuleUpdatedByName: user?.name ?? null,
      updatedAt: now,
    })
    .eq('id', id);
  /* ⭐ ตัวล็อก — สตริงดิบที่จอส่งมา ไม่แปลงรูป · ยังไม่เคยตั้ง (null) ต้องเป็น `.is(null)` (`.eq(null)` = ไม่ตรงแถวไหนเลย) */
  write = base.value === null ? write.is('billingRuleUpdatedAt', null) : write.eq('billingRuleUpdatedAt', base.value);
  const { data: writtenRows, error: updateError } = await write.select();
  if (updateError) {
    /* 23514 ที่ `customers_billing_rule_shape` หลังผ่าน normalizeRule แล้ว = ตัวตรวจของฐานยังเป็นรุ่นสอง (ยังไม่รัน 0393)
       ⇒ บอกทางแก้ ไม่ใช่ "กรอกผิด" (billingV4SchemaError ตัดสินจากชื่อ constraint — 23514 ตัวอื่นไม่ส่งคนไปรอ migration) */
    const v4Schema = billingV4SchemaError(updateError);
    if (v4Schema) return Response.json({ error: v4Schema }, { status: 503 });
    if (updateError.code === '23514') {
      return Response.json({ error: `ฐานข้อมูลไม่รับค่าที่บันทึก: ${updateError.message} — แจ้งผู้ดูแลระบบ` }, { status: 500 });
    }
    if (updateError.code === 'PGRST204' || updateError.code === '42703') {
      return Response.json({ error: 'ฐานข้อมูลยังไม่รองรับรอบวางบิล (รอรัน migration 0389) — แจ้งผู้ดูแลระบบ' }, { status: 503 });
    }
    return Response.json({ error: `บันทึกกำหนดวางบิลไม่สำเร็จ: ${updateError.message}` }, { status: 500 });
  }
  const updated = Array.isArray(writtenRows) ? writtenRows[0] : writtenRows;
  if (!updated) {
    /* 0 แถว = มีคนแก้หลังจอเปิด (หรือแถวถูกลบ) — ไม่เขียนทับ · ส่งค่าล่าสุดกลับให้จอเทียบ (จอคงค่าที่กรอกไว้ ไม่ล้างฟอร์ม)
       อ่านซ้ำพลาด = ยัง 409 (ห้ามกลายเป็น 500 — ไม่มีอะไรถูกเขียน) · current เป็น null ให้จอบอกให้โหลดใหม่ */
    const { data: latest } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    const by = String(latest?.billingRuleUpdatedByName || '').trim();
    return Response.json({
      error: `มีคนแก้กำหนดวางบิลของลูกค้ารายนี้หลังคุณเปิด${by ? ` (${by})` : ''} — ค่าที่คุณกรอกยังอยู่ ตรวจค่าล่าสุดแล้วกดบันทึกอีกครั้ง`,
      current: latest ? {
        billingRule: latest.billingRule ?? null,
        billingRuleUpdatedAt: latest.billingRuleUpdatedAt ?? null,
        billingRuleUpdatedByName: latest.billingRuleUpdatedByName ?? null,
      } : null,
    }, { status: 409 });
  }

  const verb = !rule ? 'ล้าง' : ruleOf(before) ? 'แก้' : 'ตั้ง';
  const subject = [customer.arCode, customer.name].filter(Boolean).join(' ') || id;
  /* ประโยคเดียวกับการ์ด/เธรด — เดิม → ใหม่ (`describeBillingRule`: รูปเดิมพูดแบบเดิม · รุ่นสี่ = describeRule)
     + สรุปการแก้ปฏิทิน (รุ่นห้า) ชุดเดียวกับแถวเธรด — แก้วันเดียวแล้วประโยคกติกาเท่าเดิม ต้องเห็นว่าแก้อะไร */
  const calendarLines = calendarChangeLines(before, rule);
  await recordAudit({
    user, action: 'update', entityType: 'customer', entityId: id,
    before: customer, after: updated,
    summary: `${verb}กำหนดวางบิลของลูกค้า ${subject}: ${describeBillingRule(before) || NA} → ${describeBillingRule(rule) || NA}${calendarLines.length ? ` · ${calendarLines.join(' · ')}` : ''}`,
    request,
  });

  /* ⭐ แถว "ความเคลื่อนไหว" ของลูกค้า (มติเจ้าของ 26/09 ข้อ 7) — audit_logs เปิดได้เฉพาะแอดมิน ⇒ ฝ่ายขาย/บัญชี
     ที่แก้รอบกันเองย้อนดู "รอบเดิมเป็นอะไร ใครเปลี่ยน" ได้จากเธรดของลูกค้าที่เดียว (ชนิด quiet ไม่เด้งกระดิ่ง)
     ⚠️ **ลงเธรดไม่สำเร็จ ≠ บันทึกไม่สำเร็จ** — รอบถูกเขียนแล้วและ audit_logs ลงแล้วข้างบน ⇒ ตัวช่วยกลืน error
        ทุกทาง (คืน/throw) แล้วคืน false · บอกผ่าน `activityLogged` ให้โมดัลเตือนแทนการสัญญาว่า
        "รอบเดิมอยู่ในความเคลื่อนไหว" ทั้งที่ไม่มีแถวนั้น · สัญญานี้เทสต์ด้วยพฤติกรรมที่ customerBillingRuleUpdate.test */
  const activityLogged = await logBillingRuleActivity(supabase, { customerId: id, before, after: rule, user });

  /* ⭐ งวดที่วันจะเปลี่ยน (planRuleChange ของทุกใบที่ยังมีชีวิต) — **ระบบเสนอ ไม่ย้ายวันเอง** · กติกาถูกเขียนแล้ว
     ⇒ อ่านงวดพลาดตรงนี้ห้ามกลายเป็น error ของการบันทึก: ส่ง `ruleChange: null` + เหตุ ให้จอบอกว่าต้องไล่ดูใบเอง */
  const { ruleChange, ruleChangeError } = await ruleChangeOf(supabase, user, id, before, rule);
  return Response.json({
    ...savedFields(updated), unchanged: false, activityLogged, ruleChange, ...(ruleChangeError ? { ruleChangeError } : {}),
  });
}

async function ruleChangeOf(supabase, user, customerId, before, after) {
  if (!canViewSalesPlanning(user)) {
    return { ruleChange: null, ruleChangeError: 'ไม่มีสิทธิ์ดูใบสั่งขาย — ตรวจงวดที่เปิดอยู่ของลูกค้ารายนี้ไม่ได้' };
  }
  try {
    /* วันหยุดในระบบ — ข้อเสนอวันวางบิลของเครดิต N ถอยข้ามวันหยุดชุดเดียวกับชิปบนใบ (holidaySet ไม่ throw · อ่านพลาด = รายการฝังในโค้ด) */
    const [bundle, holidays] = await Promise.all([loadCustomerOrdersBundle(supabase, user, customerId), holidaySet(supabase)]);
    return { ruleChange: customerRuleChange(before, after, bundle, user, { holidays }), ruleChangeError: null };
  } catch (err) {
    console.error('[billing-rule] อ่านงวดที่เปิดอยู่ของลูกค้าไม่สำเร็จ', customerId, err?.message || err);
    return {
      ruleChange: null,
      ruleChangeError: 'บันทึกกำหนดวางบิลแล้ว แต่อ่านงวดที่เปิดอยู่ไม่สำเร็จ — เปิดใบสั่งขายของลูกค้าเพื่อตรวจวันงวดเอง',
    };
  }
}
