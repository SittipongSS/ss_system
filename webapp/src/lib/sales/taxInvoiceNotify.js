// ── กระดิ่งแจ้งฝ่ายขายเมื่อบัญชีออก/ถอนใบกำกับภาษีของงวด (mig 0348) ────────
//
// > *"กระดิ่งแจ้ง SA ตอน FN ออกใบกำกับ"* (มติผู้ใช้ 2026-09-09)
//
// ⭐ **แจ้งผลลัพธ์ ไม่ใช่แจกงาน** ⇒ ส่ง **รายบุคคล** ไม่ใช่กระจายตามฝ่าย/role
// (การกระจายตาม role ในระบบนี้สงวนไว้ให้ *คิวงาน* เช่น SCREENERS ของลีด หรือ
// APPROVERS ของสรรพสามิต) · ผู้รับคือคนที่ผูกกับใบนั้นจริง ๆ ตามกติกาผู้รับของ mig 0185
//
// ⭐ **ผู้รับสองค่า** — `order.ownerId` (เจ้าของใบ ณ ตอนอนุมัติ · trigger ตรึงไว้ที่
// mig 0294) และ `order.deal.ownerId` (เจ้าของดีลวันนี้ = คนที่ลงมือต่อได้จริง)
// ปกติเป็นคนเดียวกัน จะต่างกันก็ต่อเมื่อดีลถูกย้ายมือหลังใบอนุมัติ ซึ่งเป็นเคสที่
// mig 0294 เกิดมาเตือนพอดี ⇒ ส่งทั้งคู่แล้ว dedupe ด้วย Set
//
// ⚠️ **กันแจ้งตัวเองต้องทำที่นี่** — `notifyUsers` ไม่มีพารามิเตอร์ actorId เลย
// (มีแต่ `actorName` ไว้โชว์) แล้วเขียนหนึ่งแถวต่อทุก id ที่ได้รับ ⇒ FN ที่บังเอิญเป็น
// เจ้าของดีลเอง (หรือ admin ที่ผ่าน `canConfirmPayment` ตั้งแต่บรรทัดแรก) จะเด้งใส่ตัวเอง
//
// ⚠️ **kind ต้องเป็นค่าคงที่ ประกาศตรง ๆ ในไฟล์นี้** — ยามกัน drift ใน
// `notifications.test.mjs` กวาดทั้ง `src/` ด้วย regex หา `kind: 'sales_order_…'`
// กับ `_KIND = 'sales_order_…'` แล้วเทียบกับ `SALES_ORDER_BELL_KINDS`
// ประกอบ kind จาก template string เมื่อไร ยามจะมองไม่เห็นแล้วแจ้งเตือนหายจากกระดิ่งเงียบ ๆ
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { fmtDate } from '@/lib/format';

export const TAX_INVOICE_KIND = 'sales_order_tax_invoice';
export const TAX_INVOICE_CLEARED_KIND = 'sales_order_tax_invoice_cleared';
export const TAX_INVOICE_ENTITY_TYPE = 'sales_order';

/* กุญแจกันยิงซ้ำ — หนึ่งงวด หนึ่งเลขใบกำกับ หนึ่งครั้ง
   ⚠️ **ต้องมีทั้ง installmentId และเลขใบ** — `taxInvoiceConflict` กันเฉพาะเลขที่ไปซ้ำ
   *งวดอื่น* ⇒ FN กดบันทึกเลขเดิมซ้ำสิบครั้งได้ · แต่คีย์ที่มีแต่ installmentId จะกลืน
   การแจ้งรอบสองหลังถอนใบแล้วออกใบใหม่ ซึ่งเป็นเรื่องที่ AE ต้องรู้จริง ๆ */
export const taxInvoiceDedupeKey = (installmentId, no) => `taxinv:${installmentId}:${String(no || '').trim()}`;

/** ปลายทางของลิงก์ — แท็บการชำระของใบ ซึ่งเป็นที่เดียวที่กดโหลดไฟล์ใบกำกับได้ */
const hrefOf = (orderId) => `/sa/sales-orders/${orderId}?tab=payment`;

/**
 * ใครควรได้รับ + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ เทสต์ได้โดยไม่ต้องมี DB
 *
 * @param cleared true = FN ถอนใบกำกับคืน (AE อาจส่งไฟล์ให้ลูกค้าไปแล้ว ต้องรู้พอกัน)
 * @returns payload ของ `notifyUsers` หรือ null เมื่อไม่มีใครต้องรู้
 */
export function taxInvoiceNotice({ order, installment, actorId = null, cleared = false } = {}) {
  if (!order?.id || !order?.orderNumber || !installment?.id) return null;

  const actor = actorId ? String(actorId) : null;
  const userIds = [...new Set([order.ownerId, order.deal?.ownerId].filter(Boolean).map(String))]
    .filter((id) => id !== actor);
  // ไม่มีเจ้าของ หรือเจ้าของคือคนกดเอง ⇒ ไม่มีใครต้องรู้ · ยิงเปล่าคือเสียงรบกวน
  if (!userIds.length) return null;

  const seq = installment.seq ? `งวดที่ ${installment.seq}` : 'งวดชำระ';
  const label = installment.label ? ` ${installment.label}` : '';
  const customer = order.customerName ? ` · ${order.customerName}` : '';

  if (cleared) {
    return {
      userIds,
      entityType: TAX_INVOICE_ENTITY_TYPE,
      entityId: order.id,
      kind: TAX_INVOICE_CLEARED_KIND,
      /* ⚠️ **ไม่ dedupe การถอน** — ถอนแล้วออกใหม่แล้วถอนอีกคือลำดับเหตุการณ์ที่ AE
         ต้องเห็นครบทุกครั้ง · และเลขที่ถูกถอนไม่ได้อยู่บนแถวแล้ว จึงประกอบกุญแจไม่ได้ */
      title: `ใบกำกับภาษีถูกถอนคืน · ${order.orderNumber}`,
      body: `${seq}${label}${customer} — ฝ่ายบัญชีถอนใบกำกับของงวดนี้ ถ้าส่งไฟล์ให้ลูกค้าไปแล้วต้องแจ้งกลับ`,
      href: hrefOf(order.id),
    };
  }

  const no = String(installment.taxInvoiceNo || '').trim();
  if (!no) return null;
  const issued = installment.taxInvoiceDate ? ` ลว. ${fmtDate(installment.taxInvoiceDate)}` : '';
  return {
    userIds,
    entityType: TAX_INVOICE_ENTITY_TYPE,
    entityId: order.id,
    kind: TAX_INVOICE_KIND,
    dedupeKey: taxInvoiceDedupeKey(installment.id, no),
    /* ⚠️ หัวข้อประกอบจาก `orderNumber` ซึ่งมีค่าเสมอ — หัวข้อที่ว่างหลัง btrim ตก CHECK
       ของ 0185 แล้ว insert **ล้มทั้ง batch** เงียบ ๆ (ร่องรอยเดียวคือ console.error) */
    title: `ใบกำกับภาษีออกแล้ว · ${order.orderNumber}`,
    body: `${seq}${label} · เลขที่ ${no}${issued}${customer} — เปิดไฟล์ได้ที่แท็บการชำระ`,
    href: hrefOf(order.id),
  };
}

/**
 * ยิงจริง — fire-and-forget หลังบันทึกสำเร็จแล้ว
 *
 * ⚠️ **ห้ามให้กระดิ่งที่ยิงพลาดทำให้การบันทึกตอบ error** — FN กดมาบันทึกใบกำกับ
 * ไม่ได้มาส่งแจ้งเตือน · `notifyUsers` กลืน error ของตัวเองอยู่แล้ว ที่ห่อเพิ่มคือกัน
 * `after()` ที่โยนนอก request scope (แพตเทิร์นเดียวกับ `registrationNotify`)
 */
export function notifyTaxInvoice(supabase, { order, installment, actor, cleared = false } = {}) {
  const notice = taxInvoiceNotice({ order, installment, actorId: actor?.id, cleared });
  if (!notice) return false;
  const deliver = () => notifyUsers(supabase, {
    ...notice,
    actorName: actor?.name || actor?.email || null,
  });
  try {
    after(deliver);
  } catch {
    deliver().catch(() => {});
  }
  return true;
}
