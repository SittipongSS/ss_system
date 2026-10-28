// ── ผูกงวดให้คำร้องขอเอกสารการเงินตอนเปิดใบ (กำหนดวางบิล 26/09 · รื้อเป็นหลายคำร้องต่องวดที่ mig 0413 · 28/10) ─────
//
// ⭐ **ทำไมต้องผูกให้เอง** — สัญญาณ "ขอใบวางบิลแล้ว" ของงวด (หยุดกระดิ่งก่อนวันวางบิล · ป้าย "ขอแล้ว" บนการ์ดการชำระ ·
//   ตัวกรองทะเบียนบัญชี) อ่านจากคำร้องที่ผูกงวด · ปุ่ม "ขอใบวางบิลงวดนี้" บนการ์ด/กระดิ่ง และ (PR-2) ปุ่มรายงวดบนหน้า QT
//   ส่ง `linkInstallmentId` มากับ POST เปิดคำร้อง แล้ว server ผูกให้หลังบันทึกร่างสำเร็จ
// ⭐ **ความจริงอยู่ที่แถวคำร้อง** (`installmentId` · 0413) — งวดเก็บแค่ตัวชี้ (`billingRequestId` = คำร้องแรก) ที่
//   `syncBillingPointers` เขียนให้ ⇒ ตัวผูกเขียนแถวคำร้อง แล้วซิงก์ตัวชี้ (ไม่แตะงวดเอง)
// ⭐ **ด่านเดียวกับการผูกเอง** (PATCH action `link` ของ /installments) — ส่วนที่ export ได้ใช้ของจริง (`installmentActionError` =
//   สิทธิ์ `salesplan:edit` + ล็อกทั้งใบ · `pipelineInstallmentLock` · `historicalInstallmentLock`) · สองข้อที่เขียนไว้ใน route
//   ตรง ๆ (ใบเสนอราคาเดียวกัน · ใบสั่งขายต้องอ้าง QT) ถูกลอกมาที่นี่ **ด้วยข้อความเดียวกัน**
//   ⚠️ ถ้าแก้สองข้อนั้นที่ route `sales-orders/[id]/installments` ต้องแก้ที่นี่ด้วย (ยังไม่มีบ้านกลาง)
// ⭐ **งวดเดียวมีได้หลายคำร้อง** (มติเจ้าของ 28/10 ข้อ 3) — ใบวางบิลก่อน ใบเสร็จทีหลัง ⇒ ไม่ถามว่างวดมีคำร้องอื่นอยู่ไหม
//   (ด่าน "ผูกคำร้องอื่นไว้แล้ว" · "ลิงก์ตายทับได้" ของรุ่น 0260 ถอดออก) · และผู้ใช้ **เลือกงวดเอง** ⇒ งวดที่บัญชีรับรองแล้วผูกได้
//   (ใบเสร็จหลังเงินเข้า) · เหลือข้อที่เข้มกว่าการผูกเองสองข้อ: งวดยกมา (มติข้อ 10 ของกำหนดวางบิล) · งวดที่คืนเงินแล้ว
// ⭐ คำร้องไม่ต้องอ้างใบสั่งขายมาก่อน (ขอจากหน้า QT) — ใบมาจากงวดเอง แล้วเติม `salesOrderId` ให้คำร้อง · อ้างใบอื่นอยู่ = ไม่ผูก
// 🔴 **ผูกไม่ได้ ≠ เปิดคำร้องไม่ได้** — ใบร่างบันทึกไปแล้ว ถ้าตอบ error คนจะกดซ้ำแล้วได้ใบซ้ำ
//   ⇒ ตัวผูก **ไม่ throw เด็ดขาด** · ผลเป็น `{ warning }` ให้ route ส่งกลับทาง `_warning` (lib/apiWarnings)
//   พร้อม log ฝั่ง server ทุกกรณีที่ไม่ได้ผูก
// ⚠️ ผลข้างเคียงที่รู้แล้วและยอมรับ: งวดที่ผูกคำร้องถูกล็อกจาก "ปรับแผนงวด" ของ AE Sup (0377 · "ถอดคำร้องก่อน") เท่ากับการผูกเอง
import {
  installmentActionError, installmentRefunded, pipelineInstallmentLock,
} from '@/lib/sales/salesOrderPayments';
import {
  OPENING_INSTALLMENT_LABEL, historicalInstallmentLock, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import { loadInstallment } from '@/lib/sales/salesOrderInstallmentsStore';
import { syncBillingPointers } from '@/lib/sales/installmentRequestsStore';
import { billingInstallmentSchemaError } from '@/lib/sales/installmentRequests';
import { loadScoped } from '@/lib/scopedRow';

export const BILLING_LINK_KIND = 'billing_doc';

/* ทางออกของคนที่ได้คำเตือน — เมนูแถวบนการ์ดการชำระของ SO (ชื่อเมนูตรงกับ SalesOrderPaymentPanel) */
export const BILLING_LINK_MANUAL_HINT = 'แนบเองได้ที่การ์ดการชำระของใบสั่งขาย (เมนูแถว › แนบคำร้องที่ขอไว้แล้ว)';

/* คำเตือนเต็มประโยค — บอกก่อนว่าใบร่างเก็บแล้ว (ไม่ต้องกดซ้ำ) แล้วค่อยบอกว่าติดอะไร */
export const billingLinkWarning = (reason) => `บันทึกร่างคำร้องแล้ว แต่ยังไม่ได้ผูกกับงวดชำระ — ${reason}`;

/* คำร้องอีกหน้าต่างผูกงวดไปก่อนแล้วระหว่างด่านกับการเขียน (CAS ของแถวคำร้อง) */
export const BILLING_LINK_RACE = 'คำร้องนี้ถูกผูกกับงวดอื่นไปแล้วระหว่างบันทึก';

/**
 * ด่านผูกงวดอัตโนมัติ — คืนเหตุผลภาษาไทย หรือ null ถ้าผูกได้ (ตรรกะล้วน ไม่แตะฐาน)
 *
 * @param installment แถวงวดสด (`loadInstallment`) · null = ไม่พบ
 * @param order       ใบสั่งขายของงวด + `quotation: { status, quoteNumber }` (ด่านร่างที่ QT ตาย)
 * @param request     `{ id, kind, quotationId, salesOrderId }` ของคำร้องที่เพิ่งสร้าง · `salesOrderId` ว่างได้ (ขอจากหน้า QT)
 * @param user        คนเปิดคำร้อง — ด่านสิทธิ์เดียวกับการผูกเอง (`salesplan:edit`)
 */
export function billingInstallmentLinkError({ installment, order, request, user } = {}) {
  if (request?.kind !== BILLING_LINK_KIND) return 'ผูกงวดได้เฉพาะคำร้องขอเอกสารการเงิน';
  /* งวดต้องอยู่ในใบที่โหลดมา และถ้าคำร้องอ้างใบสั่งขายไว้ ต้องเป็นใบเดียวกัน — ผู้ใช้เปลี่ยนใบในฟอร์มได้ และงวดอาจถูก
     สร้างชุดใหม่ระหว่างทาง (freeze reseed เปลี่ยน id) ⇒ id ที่มากับลิงก์ไม่ใช่หลักฐานพอ */
  if (!installment || !order || installment.salesOrderId !== order.id
    || (request.salesOrderId && request.salesOrderId !== order.id)) {
    return 'งวดที่กดมาไม่อยู่ในใบสั่งขายที่คำร้องอ้าง';
  }
  /* ล็อกทั้งใบ + สิทธิ์ — **ตัวเดียวกับที่ PATCH `link` เรียก** (route ส่ง orderLock สูตรเดียวกันนี้) */
  const gate = installmentActionError(installment, 'link', user, {
    billingRequestId: request.id,
    orderLock: historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'link'),
  });
  if (gate) return gate;
  /* ⚠️ สองข้อนี้ลอกจาก PATCH `link` (ไม่ได้ export) — ข้อความต้องตรงกันทุกตัวอักษร */
  if (!order.quotationId) return 'ใบสั่งขายนี้ไม่ได้อ้างใบเสนอราคา — ผูกคำร้องขอเอกสารการเงินไม่ได้';
  if (request.quotationId !== order.quotationId) return 'คำร้องนี้เป็นของใบเสนอราคาคนละใบกับใบสั่งขายนี้';
  // มติเจ้าของข้อ 10 (กำหนดวางบิล): งวดยกมาไม่มีรอบวางบิล — เงินเก็บไปแล้วก่อนเข้าระบบ
  if (isOpeningInstallment(installment)) return `${OPENING_INSTALLMENT_LABEL}เป็นเงินที่เก็บก่อนเข้าระบบ — ไม่ต้องขอใบวางบิล`;
  if (installmentRefunded(installment)) return 'งวดนี้บัญชีบันทึกคืนเงินแล้ว — ไม่ต้องขอเอกสาร';
  return null;
}

/**
 * ผูกคำร้องที่เพิ่งสร้างเข้ากับงวด — **ไม่ throw เด็ดขาด**
 *
 * @returns `{}` ไม่ได้ขอให้ผูก · `{ warning }` ผูกไม่ได้ (log แล้ว) ·
 *          `{ installment, order, pointers }` ผูกแล้ว (ผู้เรียกเขียนลงสรุป audit ของการเปิดคำร้อง · `pointers` = ตัวชี้ที่เปลี่ยน)
 */
export async function linkNewBillingRequest(supabase, { user, request, installmentId } = {}) {
  const id = String(installmentId ?? '').trim();
  if (!id) return {};
  const refuse = (reason) => {
    console.warn('[requests] ไม่ได้ผูกงวดให้คำร้องใหม่', request?.id, id, reason);
    return { warning: billingLinkWarning(reason) };
  };
  try {
    // หัวข้อผิดตัดก่อนแตะฐาน — ด่านบริสุทธิ์ตอบข้อความเดียวกันอยู่แล้ว
    if (request?.kind !== BILLING_LINK_KIND) return refuse(billingInstallmentLinkError({ request }));
    const installment = await loadInstallment(supabase, id);
    if (!installment) return refuse(billingInstallmentLinkError({ request, installment: null }));
    /* ใบสั่งขายของงวด + ด่านขอบเขตการเห็นตามดีล — ตัวเดียวกับที่ PATCH ของ /installments ผ่านก่อนแตะงวด
       (`loadOrderForUser` → inSalesViewScope) · ไม่พบ/ไม่มีสิทธิ์/อ่านพลาด = ไม่ผูก พร้อมเหตุผลจากตัวโหลด */
    const { row: order, response } = await loadScoped(supabase, 'sales_orders', installment.salesOrderId, user, 'view');
    if (response) {
      /* ตัวโหลดตอบ 403 เป็นคำอังกฤษ `forbidden` (หรือข้อความไทยของแถวไร้ดีล) · 404 ไทยอยู่แล้ว ·
         500 = ข้อความดิบของฐาน ⇒ ไม่ส่งถึงจอ ถอยไปทางระบบขัดข้อง (log ข้างล่าง) */
      const body = await response.json().catch(() => ({}));
      const text = String(body?.error || '').trim();
      if (response.status === 403) {
        return refuse(text && text !== 'forbidden' ? text : 'ไม่มีสิทธิ์ดูใบสั่งขายของงวดที่เลือก');
      }
      if (response.status === 404) return refuse(text || 'ไม่พบใบสั่งขายของงวดที่เลือก');
      throw new Error(text || `load sales order ${response.status}`);
    }
    /* สถานะ QT — ด่านร่างที่ QT ถูกถอด Won แล้ว (`pipelineInstallmentLock`) อ่าน `order.quotation.status`
       ไม่มีค่า = ด่านนั้นไม่ตัดสิน ⇒ ต้องโหลดมาให้ (route ของงวดก็โหลด) · อ่านพลาดต้องดัง ห้ามผูกทั้งที่ไม่รู้ */
    let quotation = null;
    if (order.quotationId) {
      const { data, error } = await supabase
        .from('quotations').select('id, "quoteNumber", status').eq('id', order.quotationId).maybeSingle();
      if (error) throw error;
      quotation = data || null;
    }
    const reason = billingInstallmentLinkError({ installment, order: { ...order, quotation }, request, user });
    if (reason) return refuse(reason);
    /* เขียนแถวคำร้อง — CAS `installmentId IS NULL` (คำร้องที่เพิ่งสร้างยังไม่ผูก · อีกคำขอผูกแทรก = ไม่ทับ)
       · เลขงวด ณ ตอนผูก (โชว์บนหน้า QT) · เติมใบสั่งขายให้คำร้องที่ขอจากหน้า QT */
    const { data: done, error: writeError } = await supabase.from('dept_requests')
      .update({
        installmentId: installment.id,
        installmentSeq: Math.min(Math.max(Number(installment.seq) || 1, 1), 12),
        ...(request.salesOrderId ? {} : { salesOrderId: order.id }),
      })
      .eq('id', request.id).is('installmentId', null)
      .select('id').maybeSingle();
    if (writeError) {
      const schema = billingInstallmentSchemaError(writeError);
      if (schema) return refuse(schema);
      throw writeError;
    }
    if (!done) return refuse(`${BILLING_LINK_RACE} · ${BILLING_LINK_MANUAL_HINT}`);
    const sync = await syncBillingPointers(supabase, [installment.id]);
    if (sync.error) {
      // คำร้องผูกแล้ว (ความจริงอยู่ที่แถวคำร้อง) — ตัวชี้พลาดแค่ล็อกปรับแผน · log ไว้ ไม่เตือนผู้ใช้เรื่องที่เขาแก้เองไม่ได้
      console.error('[requests] เขียนตัวชี้ของงวดไม่สำเร็จ', installment.id, sync.error?.message || sync.error);
    }
    return { installment, order, pointers: sync.changed || [] };
  } catch (error) {
    console.error('[requests] ผูกงวดให้คำร้องใหม่ล้ม', request?.id, id, error?.message || error);
    return { warning: billingLinkWarning(`ระบบขัดข้องระหว่างผูกงวด · ${BILLING_LINK_MANUAL_HINT}`) };
  }
}
