import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import {
  canApproveExternalContract, canCancelContract, contractCancelDate, contractKindLabel, signedCancelError,
} from '@/lib/sales/contracts';
import { historicalContractLockGate, loadLinkedHistoricalOrder } from '@/lib/sales/historicalContractLock';
import { loadLinkedServiceOrders } from '@/lib/sales/contractSignedCancel';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

// เหตุผลอย่างน้อย 10 ตัวอักษร — กติกาเดียวกับการตีกลับใบสั่งขาย/ถอนคำรับรองงวด
// ("ยกเลิก" ลอย ๆ ตอบคำถามคนที่มาอ่านทีหลังไม่ได้สักข้อ)
const MIN_REASON = 10;

const readReason = async (req) => {
  const body = await req.json().catch(() => ({}));
  return String(body?.reason || '').trim();
};

// POST /api/sales-planning/contracts/[id]/cancel
// สองทางในปุ่มเดียว:
//   · ร่าง · รอลงนาม · รอหัวหน้ารับรอง — ทุกคนที่แก้สัญญาได้ (ทางเดิม ไม่ขยับ)
//   · ⭐ ลงนามแล้ว — เฉพาะผู้อนุมัติ (มติเจ้าของ 24/09/2026 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ") ·
//     ของเดิมตอบว่าการเลิกสัญญาที่มีผลแล้วเป็นเรื่องของบันทึกเพิ่มเติมเท่านั้น ⇒ สัญญาที่ลูกค้าเลิกจ้างจริงค้าง "มีผล"
//     ในระบบต่อไปจนหมดอายุ (ด่านเข้าไซต์ปล่อยนัด · ทะเบียนต่อสัญญานับถอยหลังจากวันหมดอายุเดิม)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  /* ⭐ เอกสารแทนสัญญาของใบสั่งขายย้อนหลังที่ยังไม่อนุมัติ ยกเลิกที่ใบสั่งขาย ไม่ใช่ที่นี่ (0374) — ยกเลิกตรงนี้
     = ใบสั่งขายค้างอนุมัติไม่ได้ (RPC หาร่างที่ชี้กลับไม่เจอ) · ยกเลิกใบสั่งขาย = trigger ยกเลิกใบนี้ตามเอง
     ⚠️ อยู่ก่อนทั้งสองทาง — ใบที่ลงนามแล้วไม่ติดล็อกนี้ (ล็อกเฉพาะร่าง) แต่ลำดับต้องไม่ขึ้นกับข้อนั้น */
  const lock = await historicalContractLockGate(supabase, before);
  if (lock) return fail(lock.message, lock.status);

  if (before.status === 'signed') return cancelSigned({ user, supabase, req, before });

  if (!canCancelContract(before)) {
    return fail('ยกเลิกได้เฉพาะสัญญาที่ยังเป็นร่างหรือรอลงนาม', 409);
  }

  const reason = await readReason(req);
  if (reason.length < MIN_REASON) return badRequest(`ระบุเหตุผลที่ยกเลิกอย่างน้อย ${MIN_REASON} ตัวอักษร`);

  const { data, error } = await supabase.from('sales_contracts').update({
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancelReason: reason,
    updatedAt: new Date().toISOString(),
  })
    /* กันกดชน (24/09/2026) — สถานะต้องยังเป็นค่าที่ด่านเพิ่งตรวจ · ของเดิมเขียนทับไม่ดูสถานะ ⇒ ใบที่เพิ่งถูกรับรองเป็น
       signed ระหว่างนั้นถูกยกเลิกผ่านทางของคนทั่วไปได้ (ข้ามด่านผู้อนุมัติของทางลงนามแล้ว) */
    .eq('id', id).eq('status', before.status).select().maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('สถานะสัญญาเปลี่ยนไปแล้ว — เปิดใหม่แล้วลองอีกครั้ง', 409);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: data,
    summary: `ยกเลิก${contractKindLabel(data.kind)} ${data.contractNo || data.id} — ${reason}`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});

/* ── ยกเลิกสัญญาที่ลงนามแล้ว (มติเจ้าของ 24/09/2026) ────────────────────────────────────────────
   ลำดับ: ด่านผู้อนุมัติ → เหตุผล → **อ่านใบสั่งขายที่ผูกก่อนเขียน** (อ่านพัง = สัญญายังไม่ถูกแตะ) → เขียนสัญญาพร้อมกันกดชน
   → ยกเลิกบันทึกเพิ่มเติมตาม → audit สัญญา/บันทึก/ใบสั่งขาย
   ⚠️ ไม่แตะใบสั่งขายและตารางบริการ (กติกาเจ้าของโมดูล) — ด่านเข้าไซต์คำนวณสดจากสถานะ+วันยกเลิกของสัญญาเอง
      (`contractCoverageOn`) · ใบสั่งขายยังชี้สัญญาเดิมเป็นประวัติ จนฝ่ายขายผูกฉบับใหม่
   ⚠️ `approvedAt` **ห้ามล้าง** — ด่านใช้แยก "เคยมีผล" (ครอบนัดก่อนวันยกเลิก) ออกจาก "ไม่เคยมีผล"
   ⚠️ ไม่ใช่ทรานแซกชันเดียว — สัญญาเขียนก่อน แล้วบันทึกเพิ่มเติมตาม · บันทึกที่ยกเลิกตามไม่สำเร็จถูกกันไว้สองชั้นแล้ว
      (ออกเลข/ลงนามบันทึกต้องการสัญญาแม่ที่ยัง signed) ⇒ ตอบ 500 ดัง ๆ ให้แจ้งผู้ดูแล ไม่ใช่ปล่อยเงียบ */
async function cancelSigned({ user, supabase, req, before }) {
  const linked = await loadLinkedHistoricalOrder(supabase, before);
  if (linked.error) {
    return fail(`ตรวจใบสั่งขายย้อนหลังของเอกสารแทนสัญญาไม่สำเร็จ — ${linked.error.message}`, 500);
  }
  const gate = signedCancelError(before, user, { linkedOrder: linked.order });
  if (gate) return canApproveExternalContract(user) ? fail(gate, 409) : forbidden(gate);

  const reason = await readReason(req);
  if (reason.length < MIN_REASON) return badRequest(`ระบุเหตุผลที่ยกเลิกอย่างน้อย ${MIN_REASON} ตัวอักษร`);

  const { orders, error: orderError } = await loadLinkedServiceOrders(supabase, before.id);
  if (orderError) return fail(`อ่านใบสั่งขายที่ผูกสัญญานี้ไม่สำเร็จ — ${orderError.message}`, 500);

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('sales_contracts').update({
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: reason,
    updatedAt: now,
    // ผู้ยกเลิก + สถานะก่อนยกเลิก — ไว้โชว์บนหน้าสัญญาและอ่านประวัติ (ไม่มีคอลัมน์ของตัวเอง ไม่มีใครใช้ตัดสิน)
    metadata: {
      ...(before.metadata || {}),
      cancelledFromStatus: 'signed',
      cancelledById: user.id ? String(user.id) : null,
      cancelledByName: user.name || null,
    },
  })
    // กันกดชน — สองคนกดพร้อมกัน/ใบสั่งขายย้อนหลังถูกยกเลิก (trigger 0374) ระหว่างนั้น ⇒ คนที่สองได้ 409
    .eq('id', before.id).eq('status', 'signed').select().maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('สถานะสัญญาเปลี่ยนไปแล้ว — เปิดใหม่แล้วลองอีกครั้ง', 409);

  const number = data.contractNo || data.id;
  const kindLabel = contractKindLabel(data.kind);
  const cancelDay = fmtDate(contractCancelDate(data) || now);

  const { data: addenda, error: addendaError } = await supabase.from('sales_contract_addenda').update({
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: `สัญญาแม่ ${number} ถูกยกเลิก — ${reason}`,
    updatedAt: now,
  })
    .eq('contractId', before.id).neq('status', 'cancelled')
    .select('id, "docNo"');

  const soNames = (orders || []).map((order) => order.orderNumber || order.id);
  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: before.id,
    before, after: data,
    summary: `ยกเลิก${kindLabel}ที่ลงนามแล้ว ${number} — ${reason}`
      + ` · ใบสั่งขายที่ผูกอยู่: ${soNames.length ? soNames.join(', ') : 'ไม่มี'}`
      + (addendaError ? ' · ⚠️ ยกเลิกบันทึกเพิ่มเติมตามไม่สำเร็จ' : ` · บันทึกเพิ่มเติมยกเลิกตาม ${(addenda || []).length} ฉบับ`),
    request: req,
  });
  if (addendaError) {
    return fail(
      `ยกเลิกสัญญา ${number} แล้ว แต่ยกเลิกบันทึกเพิ่มเติมที่แนบท้ายไม่สำเร็จ (${addendaError.message}) — `
      + 'บันทึกที่ค้างอยู่ถูกกันไม่ให้ออกเลข/ลงนามแล้ว · แจ้งผู้ดูแลระบบให้ยกเลิกตาม',
      500,
    );
  }
  for (const addendum of addenda || []) {
    await recordAudit({
      user, action: 'update', entityType: 'sales_contract_addendum', entityId: addendum.id,
      summary: `ยกเลิกบันทึกเพิ่มเติม ${addendum.docNo || '(ฉบับร่าง)'} ตามสัญญาแม่ ${number} — ${reason}`,
      request: req,
    });
  }
  /* ⭐ ร่องรอยบนใบสั่งขาย — ใบไม่ถูกแก้ แต่คนเปิดประวัติใบต้องเห็นว่าทำไมนัดตั้งแต่วันนี้ติดด่านสัญญา */
  for (const order of orders || []) {
    await recordAudit({
      user, action: 'update', entityType: 'sales_order', entityId: order.id,
      summary: `สัญญา ${number} ที่ผูกกับใบ ${order.orderNumber || order.id} ถูกยกเลิก — `
        + `นัดบริการตั้งแต่ ${cancelDay} ติดด่านสัญญาจนกว่าจะผูกสัญญาฉบับใหม่ · ${reason}`,
      request: req,
    });
  }

  const { issuedHtml, ...rest } = data;
  return ok({ ...rest, cancelledAddenda: (addenda || []).length, linkedServiceOrders: orders || [] });
}
