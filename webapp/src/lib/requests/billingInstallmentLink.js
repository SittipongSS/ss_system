// ── ผูกงวดให้คำร้องขอใบวางบิลที่เปิดจากปุ่ม "ขอใบวางบิลงวดนี้" (กำหนดวางบิล · 26/09) ──────
//
// ⭐ **ทำไมต้องผูกให้เอง** — สัญญาณ "ขอใบวางบิลแล้ว" ของงวด (หยุดกระดิ่งก่อนวันวางบิล ·
//   ป้าย "ขอแล้ว" บนการ์ดการชำระ · ตัวกรองทะเบียนบัญชี) อ่านจาก `installments.billingRequestId`
//   แต่ปุ่มบนการ์ดเคยเปิดคำร้องโดย **ไม่ผูก** ⇒ SA ต้องย้อนกลับมากด "แนบคำร้องที่ขอไว้แล้ว" อีกรอบ
//   ซึ่งไม่มีใครทำ (ปุ่มเดิมไม่บอกด้วยซ้ำว่าต้องทำ) ⇒ ทุกงวดที่ขอไปแล้วยังถูกเตือนว่า "ยังไม่ขอ"
//   ⇒ ตอนนี้จอส่ง `linkInstallmentId` มากับ POST เปิดคำร้อง แล้ว server ผูกให้หลังบันทึกร่างสำเร็จ
// ⭐ **ด่านเดียวกับการผูกเอง** (PATCH action `link` ของ /installments) — ปุ่มกับทางอัตโนมัติต้อง
//   ตอบคำเดียวกัน · ส่วนที่ export ได้ใช้ของจริง (`installmentActionError` = สิทธิ์ `salesplan:edit`
//   + ล็อกทั้งใบ · `pipelineInstallmentLock` · `historicalInstallmentLock`) · สองข้อที่เขียนไว้ใน route
//   ตรง ๆ (ใบเสนอราคาเดียวกัน · ใบสั่งขายต้องอ้าง QT) ถูกลอกมาที่นี่ **ด้วยข้อความเดียวกัน**
//   ⚠️ ถ้าแก้สองข้อนั้นที่ route `sales-orders/[id]/installments` ต้องแก้ที่นี่ด้วย (ยังไม่มีบ้านกลาง)
// ⭐ **เข้มกว่าการผูกเองสามข้อ** (ข้อกำหนดของงานกำหนดวางบิล · งวดยกมา = มติเจ้าของข้อ 10): งวดยกมา · งวดที่รับรอง/คืนเงินแล้ว · งวดที่ผูกคำร้องอื่นอยู่
//   — ผูกเองยังทำได้ครบตามเดิม (ใบเสร็จหลังเงินเข้า) · ทางอัตโนมัติมีไว้หยุด "ยังไม่ขอใบวางบิล"
//   ของงวดที่ยังรอเงินเท่านั้น และ **ไม่ทับคำร้องที่ยังมีชีวิตซึ่งผูกไว้ก่อนแล้ว** (ทับ = ใบเดิมหลุดจากงวดเงียบ ๆ)
//   ⭐ ลิงก์ที่ **ตายแล้ว** (คำร้องถูกลบ/ยกเลิก/ปฏิเสธ) ทับได้ — ข้อกำหนด "ขอแล้ว" ไม่นับลิงก์พวกนี้อยู่แล้ว
//     (ทะเบียนบัญชี + กระดิ่งถือว่า "ยังไม่ขอ") ⇒ ถ้าไม่ให้ทับ ทางอัตโนมัติจะตอบ "ผูกคำร้องอื่นไว้แล้ว" ทั้งที่
//     ทุกจอบอกว่ายังไม่ขอ · ตัดสินด้วย `billingRequestAlive` **ตัวเดียวกับทะเบียนบัญชี** (ห้ามเขียนกติกาเอง)
//     · id เดิมไม่หาย — audit ของงวดเก็บ before/after ทั้งแถว
// 🔴 **ผูกไม่ได้ ≠ เปิดคำร้องไม่ได้** — ใบร่างบันทึกไปแล้ว ถ้าตอบ error คนจะกดซ้ำแล้วได้ใบซ้ำ
//   ⇒ ตัวผูก **ไม่ throw เด็ดขาด** · ผลเป็น `{ warning }` ให้ route ส่งกลับทาง `_warning` (lib/apiWarnings)
//   พร้อม log ฝั่ง server ทุกกรณีที่ไม่ได้ผูก
// ⚠️ ผลข้างเคียงที่รู้แล้วและยอมรับ: งวดที่ผูกคำร้องถูกล็อกจาก "ปรับแผนงวด" ของ AE Sup (0377 ·
//   "ถอดคำร้องก่อน") เท่ากับการผูกเองทุกประการ
import {
  INSTALLMENT_STALE_MESSAGE, installmentActionError, installmentRefunded, pipelineInstallmentLock,
} from '@/lib/sales/salesOrderPayments';
import {
  OPENING_INSTALLMENT_LABEL, historicalInstallmentLock, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import { loadInstallment, updateInstallment } from '@/lib/sales/salesOrderInstallmentsStore';
import { billingRequestAlive } from '@/lib/finance/paymentLedger';
import { loadScoped } from '@/lib/scopedRow';

export const BILLING_LINK_KIND = 'billing_doc';

/* ทางออกของคนที่ได้คำเตือน — เมนูแถวบนการ์ดการชำระของ SO (ชื่อเมนูตรงกับ SalesOrderPaymentPanel) */
export const BILLING_LINK_MANUAL_HINT = 'แนบเองได้ที่การ์ดการชำระของใบสั่งขาย (เมนูแถว › แนบคำร้องที่ขอไว้แล้ว)';

/* คำเตือนเต็มประโยค — บอกก่อนว่าใบร่างเก็บแล้ว (ไม่ต้องกดซ้ำ) แล้วค่อยบอกว่าติดอะไร */
export const billingLinkWarning = (reason) => `บันทึกร่างคำร้องแล้ว แต่ยังไม่ได้ผูกกับงวดชำระ — ${reason}`;

/**
 * ลิงก์คำร้องที่ค้างบนงวดตายแล้วไหม (คำร้องถูกลบ/ยกเลิก/ปฏิเสธ) — ตายแล้ว = ใบใหม่ผูกทับได้
 *
 * @param linkedRequest แถว `dept_requests` ({ id, status }) ของ `installment.billingRequestId`
 *   · `null` = โหลดแล้วไม่พบ (ถูกลบไปพร้อมดีล/ลบร่าง) ⇒ ตาย
 *   · `undefined` = **ไม่ได้โหลดมา** ⇒ ถือว่ายังมีชีวิต — ไม่รู้ = ไม่ทับ (ทับผิด = ใบจริงหลุดจากงวดเงียบ ๆ)
 *   ⚠️ แยก null กับ undefined เป๊ะ ๆ **ห้ามใช้ falsy** — ผู้เรียกที่ลืมโหลดต้องได้ "ผูกไว้แล้ว" ไม่ใช่ได้ทับ
 */
export function billingLinkDead(installment, linkedRequest) {
  const linkedId = String(installment?.billingRequestId || '').trim();
  if (!linkedId || linkedRequest === undefined) return false;
  // แถวที่โหลดมาผิดใบ = ไม่ได้พิสูจน์อะไรเกี่ยวกับลิงก์นี้ ⇒ ไม่ทับ
  if (linkedRequest !== null && linkedRequest.id !== linkedId) return false;
  return !billingRequestAlive(linkedRequest);
}

/**
 * ด่านผูกงวดอัตโนมัติ — คืนเหตุผลภาษาไทย หรือ null ถ้าผูกได้ (ตรรกะล้วน ไม่แตะฐาน)
 *
 * @param installment   แถวงวดสด (`loadInstallment`) · null = ไม่พบ
 * @param order         ใบสั่งขายที่คำร้องอ้าง + `quotation: { status, quoteNumber }` (ด่านร่างที่ QT ตาย)
 * @param request       `{ id, kind, quotationId, salesOrderId }` ของคำร้องที่เพิ่งสร้าง
 * @param user          คนเปิดคำร้อง — ด่านสิทธิ์เดียวกับการผูกเอง (`salesplan:edit`)
 * @param linkedRequest คำร้องที่ผูกค้างบนงวดอยู่แล้ว (ดู `billingLinkDead`) · ไม่ส่ง = ลิงก์เดิมถือว่ายังมีชีวิต
 */
export function billingInstallmentLinkError({ installment, order, request, user, linkedRequest } = {}) {
  if (request?.kind !== BILLING_LINK_KIND || !request?.salesOrderId) {
    return 'ผูกงวดได้เฉพาะคำร้องขอเอกสารการเงินที่อ้างใบสั่งขาย';
  }
  /* งวดต้องอยู่ในใบที่คำร้องอ้าง **ตอนบันทึก** — ผู้ใช้เปลี่ยนใบสั่งขายในฟอร์มได้ และงวดอาจถูก
     สร้างชุดใหม่ระหว่างทาง (freeze reseed เปลี่ยน id) ⇒ id ที่มากับลิงก์ไม่ใช่หลักฐานพอ */
  if (!installment || !order || installment.salesOrderId !== order.id) {
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
  // มติเจ้าของข้อ 10: งวดยกมาไม่มีรอบวางบิล — เงินเก็บไปแล้วก่อนเข้าระบบ
  if (isOpeningInstallment(installment)) return `${OPENING_INSTALLMENT_LABEL}เป็นเงินที่เก็บก่อนเข้าระบบ — ไม่ต้องขอใบวางบิล`;
  // ลิงก์ที่ยังมีชีวิตไม่ทับ · ลิงก์ตาย (ลบ/ยกเลิก/ปฏิเสธ) ผ่านไปผูกทับได้ — ดู `billingLinkDead`
  if (String(installment.billingRequestId || '').trim() && !billingLinkDead(installment, linkedRequest)) {
    return `งวดที่ ${installment.seq} ผูกคำร้องอื่นไว้แล้ว — ถ้าจะใช้ใบนี้แทน ถอดคำร้องเดิมออกจากงวดก่อน แล้วแนบใบนี้ที่การ์ดการชำระของใบสั่งขาย`;
  }
  // คืนเงินแล้วสถานะยังเป็น confirmed ⇒ ถามก่อน ไม่งั้นได้ข้อความ "รับรองแล้ว" ที่ชี้ทางผิด
  if (installmentRefunded(installment)) return 'งวดนี้บัญชีบันทึกคืนเงินแล้ว — ไม่ต้องขอใบวางบิล';
  if (installment.status === 'confirmed') {
    return `งวดนี้บัญชีรับรองการชำระแล้ว จึงไม่ผูกให้อัตโนมัติ — ถ้าคำร้องนี้เป็นใบเสร็จของงวดนี้ ${BILLING_LINK_MANUAL_HINT}`;
  }
  return null;
}

/**
 * ผูกคำร้องที่เพิ่งสร้างเข้ากับงวด — **ไม่ throw เด็ดขาด**
 *
 * @returns `{}` ไม่ได้ขอให้ผูก · `{ warning }` ผูกไม่ได้ (log แล้ว) ·
 *          `{ before, after, order, replaced }` ผูกแล้ว (ผู้เรียกลง audit ของงวดเอง — before/after ทั้งแถว ·
 *          `replaced` = ลิงก์ตายที่ถูกทับ `{ id, docNo, status }` หรือ null)
 */
export async function linkNewBillingRequest(supabase, { user, request, installmentId } = {}) {
  const id = String(installmentId ?? '').trim();
  if (!id) return {};
  const refuse = (reason) => {
    console.warn('[requests] ไม่ได้ผูกงวดให้คำร้องใหม่', request?.id, id, reason);
    return { warning: billingLinkWarning(reason) };
  };
  try {
    // หัวข้อผิด/ไม่อ้าง SO ตัดก่อนแตะฐาน — ด่านบริสุทธิ์ตอบข้อความเดียวกันอยู่แล้ว
    if (request?.kind !== BILLING_LINK_KIND || !request?.salesOrderId) {
      return refuse(billingInstallmentLinkError({ request }));
    }
    /* ใบสั่งขาย + ด่านขอบเขตการเห็นตามดีล — ตัวเดียวกับที่ PATCH ของ /installments ผ่านก่อนแตะงวด
       (`loadOrderForUser` → inSalesViewScope) · ไม่พบ/ไม่มีสิทธิ์/อ่านพลาด = ไม่ผูก พร้อมเหตุผลจากตัวโหลด */
    const { row: order, response } = await loadScoped(supabase, 'sales_orders', request.salesOrderId, user, 'view');
    if (response) {
      /* ตัวโหลดตอบ 403 เป็นคำอังกฤษ `forbidden` (หรือข้อความไทยของแถวไร้ดีล) · 404 ไทยอยู่แล้ว ·
         500 = ข้อความดิบของฐาน ⇒ ไม่ส่งถึงจอ ถอยไปทางระบบขัดข้อง (log ข้างล่าง) */
      const body = await response.json().catch(() => ({}));
      const text = String(body?.error || '').trim();
      if (response.status === 403) {
        return refuse(text && text !== 'forbidden' ? text : 'ไม่มีสิทธิ์ดูใบสั่งขายที่คำร้องอ้าง');
      }
      if (response.status === 404) return refuse(text || 'ไม่พบใบสั่งขายที่คำร้องอ้าง');
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
    const installment = await loadInstallment(supabase, id);
    /* คำร้องที่ผูกค้างอยู่บนงวด — ตายแล้ว (ลบ/ยกเลิก/ปฏิเสธ) ทับได้ · ยังมีชีวิต = ไม่ทับ (`billingLinkDead`)
       ⚠️ อ่านพลาดต้องดัง (throw → คำเตือนระบบขัดข้อง) — ไม่รู้สถานะแล้วเดาว่าตาย = ทับใบจริงเงียบ ๆ */
    let linkedRequest;
    const linkedId = String(installment?.billingRequestId || '').trim();
    if (linkedId) {
      const { data, error } = await supabase
        .from('dept_requests').select('id, status, "docNo"').eq('id', linkedId).maybeSingle();
      if (error) throw error;
      linkedRequest = data || null;
    }
    const reason = billingInstallmentLinkError({
      installment, order: { ...order, quotation }, request, user, linkedRequest,
    });
    if (reason) return refuse(reason);
    /* optimistic lock เดียวกับ PATCH — อีกหน้าต่างเขียนงวดนี้แทรกระหว่างด่านกับการเขียน = ไม่ผูก
       (กันทั้ง "ผูกคำร้องอื่นแทรกเข้ามา" · แถวที่เพิ่งถูกรับรอง · และลิงก์ตายที่มีคนเพิ่งผูกใบจริงทับ) */
    const after = await updateInstallment(supabase, id, { billingRequestId: request.id }, {
      expectedUpdatedAt: installment.updatedAt,
    });
    if (!after) return refuse(`${INSTALLMENT_STALE_MESSAGE} · ${BILLING_LINK_MANUAL_HINT}`);
    // `replaced` = ลิงก์ตายที่ถูกทับ (ผู้เรียกเขียนลงสรุปของ audit ให้คนตามรอยเจอ) · null = งวดว่างอยู่แล้ว
    return {
      before: installment, after, order,
      replaced: linkedId ? { id: linkedId, docNo: linkedRequest?.docNo || null, status: linkedRequest?.status || null } : null,
    };
  } catch (error) {
    console.error('[requests] ผูกงวดให้คำร้องใหม่ล้ม', request?.id, id, error?.message || error);
    return { warning: billingLinkWarning(`ระบบขัดข้องระหว่างผูกงวด · ${BILLING_LINK_MANUAL_HINT}`) };
  }
}
