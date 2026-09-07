// ── ใบกำกับภาษีรายงวด (mig 0348) — logic ล้วน ใช้ทั้ง client และ server ────────
//
// > *"อยากได้หน้ารวมรายการที่ SA แจ้งว่าลูกค้าชำระมาแล้ว ไว้เป็นหน้าเดียวทุกรายการ
// >  เพื่อให้ FN ตรวจและยืนยัน รวมถึงแนบใบกำกับ กับเลขที่วันที่ใบกำกับ"* (2026-09-07)
//
// ⭐ **โปรเซสหลักไม่ผ่านคำร้อง** (มติผู้ใช้ 2026-09-07):
//   SA แจ้งจ่าย → FN ยืนยันเงินเข้า → FN บันทึกเลข/วัน/ไฟล์ใบกำกับที่ทะเบียนการชำระ
//   → SA เปิดดู/โหลดไฟล์จากแผงงวดบนใบ SO เอาไปส่งลูกค้า
//   คำร้องขอเอกสาร (`billing_doc` · บรรทัด `docType='tax_invoice'`) เหลือเป็น *ทางพิเศษ*
//   กรณีลูกค้าขอไฟล์ก่อนจ่าย
//
// ⭐ **หนึ่งความจริง สองที่แสดง** — บ้านของเลขคือ **แถวงวด** เพราะคำถามที่ต้องตอบ
// ทุกวันคือ "งวดไหนเงินเข้าแล้วยังไม่มีใบ" ซึ่งต้องเป็น query เดียวบนตารางเดียว
// บรรทัดคำร้อง (`dept_request_items.docNumber`) เป็น **สำเนาที่ผู้ขอเห็น** และถูกเขียน
// โดยตัวกลางในไฟล์นี้เท่านั้น ⇒ ไม่มีทางที่สองที่จะเขียนข้างเดียวจนสองที่ไม่ตรงกัน
//
// 🔴 **ห้ามเพิ่มเส้นเขียนที่สอง** — ถ้าวันหน้ามีจอไหนอยากบันทึกเลขใบกำกับเอง
// ให้เรียกผ่าน action `tax-invoice` ของ route งวดชำระ ไม่ใช่ `.update()` ตรง ๆ
// (คลาสเดียวกับชื่อลูกค้าที่ก๊อปไป 5 ตาราง แล้วต้องมีทะเบียนกลางตามเก็บทีหลัง)
import { canConfirmPayment } from '@/lib/permissions';

/** ยาวสุดของเลขที่ใบกำกับ — ต้องตรงกับ CHECK `sales_order_installments_tax_invoice_sane` */
export const MAX_TAX_INVOICE_NO = 40;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

/** งวดนี้บันทึกใบกำกับไปแล้วหรือยัง — ใช้ทั้งจอ (ป้าย/ตัวกรอง) และด่าน */
export const hasTaxInvoice = (row) => !!String(row?.taxInvoiceNo || '').trim();

/**
 * งวดนี้ "ค้างใบกำกับ" ไหม — เงินเข้าแล้ว/แจ้งแล้ว แต่ยังไม่มีเลข
 *
 * ⭐ บริษัทเก็บ VAT ⇒ **ทุกงวดที่ลูกค้าจ่ายต้องมีใบกำกับ** (มติผู้ใช้ 2026-09-07)
 * ไม่มีเคส "ไม่ต้องออก" ⇒ ของค้างชุดนี้เคลียร์ได้จริง ไม่ใช่ของที่ค้างถาวร
 * ⚠️ นับ `confirmed` เป็นหลัก และรวม `reported` ด้วยเพราะบัญชีที่แจ้งชำระเองจบเป็น
 * `confirmed` ในก้าวเดียว (`installmentReportOutcome`) ⇒ ถ้านับจาก "เคยผ่านคิว"
 * งวดกลุ่มนั้นจะหายไปจากของค้างทั้งที่เงินเข้าแล้ว
 */
export const taxInvoicePending = (row) => ['reported', 'confirmed'].includes(row?.status)
  && !hasTaxInvoice(row);

/**
 * ตรวจค่าที่กรอก — **ตายที่นี่ ไม่ปล่อยไปตาย CHECK ของ DB**
 * (ปลายทางนั้น route จะ catch เป็น 500 พร้อมข้อความ Postgres ดิบที่ผู้ใช้อ่านไม่รู้เรื่อง)
 */
export function taxInvoiceValueError({ no, date } = {}) {
  const cleanNo = String(no ?? '').trim();
  const cleanDate = String(date ?? '').trim();
  if (!cleanNo) return 'ต้องระบุเลขที่ใบกำกับภาษี';
  if (cleanNo.length > MAX_TAX_INVOICE_NO) {
    return `เลขที่ใบกำกับภาษียาวเกิน ${MAX_TAX_INVOICE_NO} ตัวอักษร`;
  }
  if (!cleanDate) return 'ต้องระบุวันที่บนใบกำกับภาษี';
  if (!isDate(cleanDate)) return 'รูปแบบวันที่ใบกำกับภาษีไม่ถูกต้อง';
  /* ช่วงปีต้องตกที่นี่ด้วย — CHECK ของฐานกันปี 2000–2100 ไว้ และปีพิมพ์เกินเป็นเคสจริง
     ที่ระบบนี้เจอมาแล้ว (`formulaDate = '2202-08-06'`) */
  if (cleanDate < '2000-01-01' || cleanDate > '2100-12-31') {
    return 'ปีของวันที่ใบกำกับภาษีไม่ถูกต้อง (รับปี ค.ศ. 2000–2100)';
  }
  return null;
}

/**
 * ด่านสิทธิ์ของคำสั่งใบกำกับ — **ของฝ่ายบัญชีล้วน**
 *
 * ⭐ ใบกำกับออกโดยบัญชี (FN) ⇒ คนบันทึกคือคนออก · ฝ่ายขาย **เปิดดูและโหลดไฟล์ได้**
 * (ด่านอ่านของ `payment-file` กว้างกว่าด่านเขียนโดยตั้งใจ) แต่ไม่ใช่คนกรอก
 * ⚠️ **ไม่มีเงื่อนไขสถานะงวด** (มติผู้ใช้ 2026-09-07) — บางกรณีออกใบกำกับก่อนเงินเข้า
 * (ลูกค้าขอไฟล์ก่อน) ⇒ กรอกได้ตั้งแต่งวดยัง `reported` · ทรงเดียวกับ `link`/`unlink`
 * ที่จงใจไม่ผูกกับสถานะ ไม่ใช่ทรง `schedule` ที่ล็อกตายเมื่อ confirmed
 */
export function taxInvoiceActionError(row, action, user, options = {}) {
  if (!row) return 'ไม่พบงวดที่ระบุ';
  if (!canConfirmPayment(user)) return 'บันทึกใบกำกับภาษีได้เฉพาะฝ่ายบัญชี';
  if (action === 'tax-invoice-clear') {
    if (!hasTaxInvoice(row)) return 'งวดนี้ยังไม่ได้บันทึกใบกำกับภาษี';
    return null;
  }
  return taxInvoiceValueError({ no: options.taxInvoiceNo, date: options.taxInvoiceDate });
}

/**
 * เลขนี้ถูกใช้กับงวดอื่นไปแล้วหรือยัง — คืนข้อความไทย หรือ null
 *
 * ⚠️ **กันที่นี่ ไม่ใช่ที่ UNIQUE ของ DB** — เลขมาจากระบบบัญชีข้างนอก (Express) และ
 * ใบที่ยกเลิกแล้วออกเลขซ้ำได้ (เหตุผลเดียวกับที่ 0258 ปฏิเสธ unique) ⇒ ที่นี่จึงเป็น
 * **คำเตือนที่บล็อกได้** ไม่ใช่กฎของฐาน · ถ้าวันหน้าต้องยอมให้ซ้ำจริง ๆ แก้ที่นี่ที่เดียว
 * ⚠️ ต้องมี `.limit()` ในสายเดียวกัน — check:rowcap เต็มเพดานอยู่แล้ว
 */
export async function taxInvoiceConflict(supabase, { installmentId, no }) {
  const cleanNo = String(no ?? '').trim();
  if (!cleanNo) return null;
  const { data, error } = await supabase
    .from('sales_order_installments')
    .select('id, seq, "salesOrderId"')
    .eq('taxInvoiceNo', cleanNo)
    .neq('id', installmentId)
    .limit(2);
  if (error) throw error;
  if (!data?.length) return null;
  return `เลขที่ใบกำกับ ${cleanNo} ถูกใช้กับงวดที่ ${data[0].seq} ของใบสั่งขายอื่นไปแล้ว`;
}

/**
 * หา **บรรทัดใบกำกับของคำร้องที่งวดนี้ผูกไว้** (ถ้ามี) — ไม่มีก็ไม่เป็นไร
 *
 * ⭐ คำร้องเป็น *ทางพิเศษ* ไม่ใช่ทางบังคับ ⇒ ฟังก์ชันนี้ **ไม่เคยคืน error** ที่บล็อก
 * การบันทึก · หน้าที่เดียวคือบอกว่ามีสำเนาให้เขียนตามไหม
 * ⚠️ หนึ่งคำร้องมีบรรทัด `tax_invoice` ได้หลายบรรทัด (dedup ที่ docType+spec) ⇒
 * ชี้ที่ "ใบ" อย่างเดียวไม่ระบุว่าใบไหน · มีมากกว่าหนึ่งบรรทัด = ไม่เดา ปล่อยว่าง
 */
export async function findLinkedTaxInvoiceItem(supabase, billingRequestId) {
  const requestId = String(billingRequestId || '').trim();
  if (!requestId) return null;
  const { data, error } = await supabase
    .from('dept_request_items')
    .select('id, "requestId", "lineKind", "docType"')
    .eq('requestId', requestId)
    .eq('docType', 'tax_invoice')
    .limit(2);
  if (error) throw error;
  if (data?.length !== 1) return null;
  return data[0];
}

/**
 * แถวงวดที่จะเขียน — คืน object ล้วน ไม่แตะฐาน
 *
 * 🔴 **ต้องคืน object จริงเสมอ** — route ทำ `.update({ ...patch, updatedAt })` ⇒ คืน
 * `null` เมื่อไร จะได้ 200 + toast "บันทึกแล้ว" โดยไม่มีค่าไหนถูกเก็บ (บั๊กนี้เคยเกิด
 * จริงกับ `coversFrom`/`coversTo` — UAT 2026-09-01)
 */
export function taxInvoicePatch({ no, date, file = null, requestId = null, itemId = null, user, now }) {
  return {
    taxInvoiceNo: String(no).trim(),
    taxInvoiceDate: String(date).trim(),
    taxInvoiceFile: file || null,
    taxInvoiceRequestId: requestId || null,
    taxInvoiceItemId: itemId || null,
    taxInvoiceById: user?.id || null,
    taxInvoiceByName: user?.name || user?.email || null,
    taxInvoiceAt: now,
  };
}

/** ล้างใบกำกับทั้งชุด — ใช้ตอนแนบผิดใบ (ร่องรอยอยู่ที่ audit before/after) */
export function taxInvoiceClearPatch() {
  return {
    taxInvoiceNo: null,
    taxInvoiceDate: null,
    taxInvoiceFile: null,
    taxInvoiceRequestId: null,
    taxInvoiceItemId: null,
    taxInvoiceById: null,
    taxInvoiceByName: null,
    taxInvoiceAt: null,
  };
}

/**
 * เขียนสำเนาลงบรรทัดคำร้อง — **best-effort เสมอ**
 *
 * ⚠️ แถวงวดถูกเขียนไปแล้วตอนมาถึงที่นี่ · โยน error ทิ้งจะได้ "บันทึกไม่สำเร็จ" ทั้งที่
 * ของหลักเก็บแล้ว (แพตเทิร์นเดียวกับ `removeStorageFolder`/`releaseAttachmentFile`)
 * ⚠️ **เขียนแค่ `docNumber`** — `docDueDate` ของ 0258 คือ *วันครบกำหนดชำระของเอกสาร*
 * ไม่ใช่วันที่บนใบกำกับ · เขียนทับ = ทำลายความหมายของช่องนั้น
 */
export async function mirrorTaxInvoiceToRequestItem(supabase, { itemId, no }) {
  if (!itemId) return false;
  try {
    const { error } = await supabase
      .from('dept_request_items')
      .update({ docNumber: no ? String(no).trim() : null, updatedAt: new Date().toISOString() })
      .eq('id', itemId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[taxInvoice] เขียนเลขลงบรรทัดคำร้องไม่สำเร็จ', itemId, err?.message);
    return false;
  }
}
