// ── เอกสาร FM-SA-04 ที่ออกจาก SO — ตัวตัดสินล้วนของเอกสารกับ Rev (mig 0370) ─────
//
// ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md)
//   · AC (+ admin) ออกเอกสารจาก **บรรทัด SO ที่อนุมัติแล้ว** ได้ 1 ใบต่อบรรทัด
//   · เส้นอนุมัติ: AC ยื่น → **AE เจ้าของดีลของ SO** อนุมัติ → **AE Supervisor** อนุมัติ
//   · Rev.00 เริ่มที่การออก · แก้ก่อนอนุมัติขั้นสุดท้าย = Rev เดิม · อนุมัติแล้วกด
//     "แก้ไขเอกสาร" = Rev+1 **เลขที่เดิม** เดินด่านครบสามขั้นใหม่
//   · ทุกการยื่น/อนุมัติ/แก้ไข ต้องเช็คว่า SO **ยังอนุมัติอยู่** (ถูกย้อนการอนุมัติ = ติดด่าน บอกเหตุ)
//
// 🔴 **"admin" = `role === 'admin'` เท่านั้น — ห้ามใช้ `isSuperuser`** เพราะ `ae_supervisor`
//    นับเป็น superuser แล้วจะกดขั้น AE ข้ามเจ้าของดีลได้ (ขั้น AE คือลายเซ็นของเจ้าของดีล)
//
// ⚠️ ปุ่ม: ไม่มีสิทธิ์ = `visible: false` · มีสิทธิ์แต่ติดด่าน = `visible: true` + `reason`
//    (กฎ ui-visibility-rule) · ทำไปแล้ว/ไม่มีของให้ทำ = ซ่อนได้ (เช่นยื่นซ้ำ · เอกสารที่ void)
// ⚠️ ไฟล์นี้ไม่แตะฐาน — จอ (client) กับ API ถามตัวเดียวกัน คิดซ้ำที่ไหนเมื่อไร ปุ่มจะบอก
//    อย่างหนึ่งแล้วเซิร์ฟเวอร์ทำอีกอย่าง
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { SALES_ORDER_STATUS_LABELS } from '@/lib/sales/salesOrderWorkflow';
import { canEditProductSpec } from '@/lib/sales/productSpecWorkflow';
import { formatSpecDocNo } from '@/lib/sales/productSpecDocNo';

export const DOC_REVISION_STATUSES = Object.freeze([
  'draft', 'pending_ae', 'pending_ae_supervisor', 'approved', 'rejected', 'superseded',
]);

export const DOC_REVISION_STATUS_LABELS = Object.freeze({
  draft: 'ฉบับร่าง',
  pending_ae: 'รอ AE อนุมัติ',
  pending_ae_supervisor: 'รอ AE Supervisor อนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับให้แก้',
  superseded: 'ถูกแทนด้วย Rev. ใหม่',
});

export const DOC_STATUSES = Object.freeze(['active', 'void']);

export const DOC_STATUS_LABELS = Object.freeze({
  active: 'ใช้งาน',
  void: 'ยกเลิกแล้ว',
});

/* Rev ที่ยังไม่จบ — ตรงกับ WHERE ของ unique index `product_spec_document_revisions_open_uidx`
   ⚠️ `rejected` นับเป็น "ยังไม่จบ" เพราะมันรอ AC แก้แล้วยื่นใหม่ใน Rev เดิม */
export const OPEN_REVISION_STATUSES = Object.freeze(['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']);
const PENDING = Object.freeze(['pending_ae', 'pending_ae_supervisor']);
const SUBMITTABLE = Object.freeze(['draft', 'rejected']);

/* ราง 3 ขั้นของหน้าเอกสาร — `rejected` ไม่เป็นจุดของตัวเอง มันคือสุขภาพของขั้นที่ยืนอยู่
   (กติกาเดียวกับรางของคำร้อง/ใบสั่งขาย) · `stamp` = คำนำหน้าคอลัมน์ตราประทับของขั้นนั้น */
export const DOC_STEPS = Object.freeze([
  Object.freeze({ id: 'submit', label: 'AC ยื่น', actor: 'AC', stamp: 'submitted' }),
  Object.freeze({ id: 'ae', label: 'AE อนุมัติ', actor: 'AE เจ้าของดีล', stamp: 'aeApproved' }),
  Object.freeze({ id: 'ae_supervisor', label: 'AE Sup อนุมัติ', actor: 'AE Supervisor', stamp: 'supApproved' }),
]);

// เหตุผลของการตีกลับ/แก้ไขเอกสาร/ยกเลิก — 10–500 ตัวอักษร เท่าเหตุผลของ SO (0161/0366)
export const DOC_REASON_MIN = 10;
export const DOC_REASON_MAX = 500;

export const formatRevLabel = (revNo) => (
  revNo === null || revNo === undefined || revNo === '' || !Number.isFinite(Number(revNo))
    ? '—'
    : `Rev.${String(Number(revNo)).padStart(2, '0')}`
);

export const isRevisionOpen = (rev) => Boolean(rev) && OPEN_REVISION_STATUSES.includes(rev.status);

const isAdmin = (user) => user?.role === 'admin';

/** ใครออกเอกสารได้ — AC เท่านั้น (+ admin) · ฝ่ายขายอื่นแก้สเปคได้แต่ไม่ออกเลขที่ */
export const canIssueProductSpecDocument = (role) => role === 'ac' || role === 'admin';

/** ขั้น AE — เจ้าของดีลของ SO (`sales_deals.ownerId`) หรือ admin */
export const canAeApproveProductSpecDocument = (user, dealOwnerId) => isAdmin(user)
  || (Boolean(user?.id) && Boolean(dealOwnerId) && user.id === dealOwnerId);

/** ขั้น AE Sup — `ae_supervisor` หรือ admin */
export const canSupApproveProductSpecDocument = (user) => isAdmin(user) || user?.role === 'ae_supervisor';

/**
 * เหตุผลของการตีกลับ/แก้ไขเอกสาร/ยกเลิก — `null` = ใช้ได้
 * ⚠️ ด่านเดียวกับฝั่ง API (ความยาวที่ฐานกันคือ ≤ 500 ส่วนขั้นต่ำ 10 เป็นกติกาของระบบ)
 */
export function docReasonError(reason, { label = 'เหตุผล' } = {}) {
  const text = String(reason ?? '').trim();
  if (text.length < DOC_REASON_MIN) return `ต้องเขียน${label}อย่างน้อย ${DOC_REASON_MIN} ตัวอักษร`;
  if (text.length > DOC_REASON_MAX) return `${label}ยาวเกิน ${DOC_REASON_MAX} ตัวอักษร`;
  return null;
}

/**
 * SO ยังอนุมัติอยู่ไหม — `null` = อนุมัติอยู่
 *
 * ⚠️ ถามทุกครั้งที่ยื่น/อนุมัติ/แก้ไข/ออก ไม่ใช่แค่ตอนออก — SO ที่ถูกย้อนการอนุมัติ
 *    ระหว่างทางต้องหยุดเอกสารที่กำลังเดินด่านด้วย ไม่งั้นลายเซ็นรับรองของที่ยังไม่ตกลง
 */
export function salesOrderApprovedBlock(salesOrder) {
  if (!salesOrder) return 'ไม่พบใบสั่งขายต้นเรื่องของเอกสารนี้';
  if (salesOrder.status !== 'approved') {
    const label = SALES_ORDER_STATUS_LABELS[salesOrder.status] || salesOrder.status || 'ไม่ทราบสถานะ';
    const no = salesOrder.orderNumber ? ` ${salesOrder.orderNumber}` : '';
    return `ใบสั่งขาย${no} ยังไม่อยู่สถานะอนุมัติ (${label}) — ทำต่อได้เมื่อใบสั่งขายอนุมัติแล้ว`;
  }
  return null;
}

/* ด่านร่วมของทุกการกระทำที่ "เดินหน้า" (ยื่น · อนุมัติ · แก้ไขเอกสาร)
   ⚠️ บรรทัดถูกถอด = ไม่มีของให้รับรองแล้ว ทางออกคือยกเลิกเอกสาร ไม่ใช่เดินด่านต่อ */
function forwardBlock(document, salesOrder) {
  if (!document?.salesOrderLineId) {
    return 'บรรทัดของใบสั่งขายที่เอกสารนี้อ้างถูกถอดแล้ว — ยกเลิกเอกสารใบนี้แทน';
  }
  return salesOrderApprovedBlock(salesOrder);
}

const shown = (reason) => ({ visible: true, reason: reason || null });
const hidden = () => ({ visible: false, reason: null });

/* ── ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) ────────────────
 *
 * ⭐ ร่างที่ **บันทึกไว้แล้วแต่ยังไม่เคยยื่นให้ใครดู** ลบทิ้งได้เหมือนร่างใบเสนอราคา
 *   ⚠️ **เลขที่ไม่นำกลับมาใช้** — ลบแล้วเลขที่นั้นเป็นรูถาวรในตัวนับ FMSA04 (เหมือนใบเสนอราคา
 *      ที่ถูกลบ ซึ่ง `next_quote_number` ไม่เคยถอย) · บรรทัด SO เดิมออกใบใหม่ได้ทันที **เลขใหม่**
 * 🔴 ร่างที่เคยยื่นแล้ว "ดึงกลับ" และร่างที่ถูกตีกลับ **ลบไม่ได้** — AE เห็นใบนั้นและได้รับแจ้งเตือน
 *   ไปแล้ว ทางออกของสองกรณีนี้ยังเป็น "ยกเลิกเอกสาร" (void) เหมือนเดิม
 * 🪤 "ดึงกลับ" ล้าง `submittedAt/By/ByName` + `snapshot` จนหมด (`revisionPatch('withdraw')`)
 *   ⇒ ร่างที่เคยยื่นหน้าตา **เหมือนร่างที่ไม่เคยยื่นทุกช่อง** · รอยที่แยกสองอย่างนี้คือ
 *   `firstSubmittedAt` ซึ่ง trigger ของ 0375 ประทับตอนเข้าสู่ `pending_ae` และลบ/แก้ไม่ได้
 *   ⚠️ แถวที่อ่านมาโดยไม่มีคอลัมน์นี้ (select ตกหล่น) จะกลายเป็น undefined = "ไม่เคยยื่น"
 *      ⇒ ทุกทางที่ประกอบ `latest` ต้องดึงคอลัมน์นี้มาด้วย (productSpecStore ล็อกไว้ทั้งสองชุด)
 */
/* ⚠️ **ไม่ใช่รายชื่อเดียวกับ RPC เป๊ะ ๆ ช่องสุดท้าย** — ฐานตรวจ `frozenHtml` แต่ที่นี่ใช้ `frozenAt`
   เพราะ `frozenHtml` คือกระดาษทั้งแผ่น `REVISION_COLUMNS` จึงไม่ดึงมา (`latest` ไม่มีช่องนั้นเลย)
   ⇒ `frozenAt` เป็นตัวแทนที่อ่านได้ของเงื่อนไขเดียวกัน · 0370 ประกาศสองคอลัมน์นี้แยกกันโดยไม่มี
   CHECK ผูก ⇒ เพี้ยนกันได้ทางทฤษฎี แต่ไม่มีทางทำให้ลบของที่ไม่ควรลบ: frozenHtml มี/frozenAt ว่าง
   = ปุ่มโผล่แล้ว RPC ปฏิเสธพร้อมเหตุจริง (409) · กลับกัน = ปุ่มไม่โผล่ ไม่มีอะไรถูกยิง
   🔴 **คำตัดสินสุดท้ายอยู่ที่ RPC เสมอ** — ที่นี่คือด่านของจอกับข้อความ ไม่ใช่ของจริง */
const SUBMIT_TRACE_FIELDS = Object.freeze([
  'firstSubmittedAt', 'submittedAt', 'aeApprovedAt', 'supApprovedAt', 'rejectedAt', 'frozenAt',
]);

/**
 * เหตุที่ลบร่างใบนี้ไม่ได้ — `null` = ลบได้ (กติกาชุดเดียวกับที่ RPC `delete_product_spec_document_draft`
 * ตรวจซ้ำที่ฐาน · ต่างกันช่องเดียวคือ `frozenAt` แทน `frozenHtml` — ดูเหตุผลที่ `SUBMIT_TRACE_FIELDS`)
 *
 * ⚠️ ข้อความที่นี่คือสิ่งที่ API ตอบตอนมีคนยิงเส้นลบทั้งที่ปุ่มถูกซ่อน (แท็บค้าง/ยิงตรง) —
 *    ต้องบอกเหตุจริง ไม่ใช่ "สถานะเปลี่ยนแล้ว" ลอย ๆ ซึ่งไม่จริงในกรณีที่มันลบไม่ได้มาแต่ต้น
 * @returns {string|null}
 */
export function draftDeleteBlock(document, latest) {
  if (!document) return 'ไม่พบเอกสารนี้';
  if (document.status !== 'active') return 'เอกสารถูกยกเลิกแล้ว — ลบไม่ได้';
  if (document.currentRevNo !== null && document.currentRevNo !== undefined) {
    return `เอกสารผ่านการอนุมัติแล้ว (${formatRevLabel(document.currentRevNo)}) — ลบไม่ได้ ใช้ "ยกเลิกเอกสาร" แทน`;
  }
  if (!latest) return 'เอกสารนี้ไม่มี Rev.';
  if (Number(latest.revNo) !== 0) {
    return `เอกสารมี ${formatRevLabel(latest.revNo)} แล้ว — ลบได้เฉพาะใบที่มี Rev.00 ฉบับเดียว`;
  }
  if (latest.status !== 'draft') {
    const label = DOC_REVISION_STATUS_LABELS[latest.status] || latest.status;
    return `Rev.00 อยู่ในขั้น "${label}" ไม่ใช่ร่างที่ยังไม่ได้ยื่น — ลบไม่ได้ ใช้ "ยกเลิกเอกสาร" แทน`;
  }
  if (SUBMIT_TRACE_FIELDS.some((field) => latest[field])) {
    return 'เอกสารนี้เคยยื่นให้ผู้อนุมัติดูแล้ว — ลบไม่ได้ ใช้ "ยกเลิกเอกสาร" แทน';
  }
  return null;
}

/** ลบร่างใบนี้ได้ไหม (ไม่ดูสิทธิ์ของคน — ดู `documentActions().remove`) */
export const isDeletableDraft = (document, latest) => draftDeleteBlock(document, latest) === null;

/**
 * ออกเอกสารจากบรรทัด SO ได้ไหม (ปุ่ม "ออกเอกสาร" บนหน้า SO)
 *
 * @returns {{ visible: boolean, reason: string|null }}
 */
export function documentCreateGate({
  user, salesOrder, line, spec, existingDocument, scopeReason,
} = {}) {
  if (!canIssueProductSpecDocument(user?.role)) return hidden();
  if (scopeReason) return shown(scopeReason);
  if (!line) return shown('ไม่พบบรรทัดสินค้านี้ในใบสั่งขาย');
  if (!line.productId) return shown('บรรทัดนี้ไม่ได้ผูกสินค้าในทะเบียน — ออกเอกสารไม่ได้');
  /* 🛑 ใบย้อนหลังคือของที่ส่งไปแล้วในอดีต ไม่มีรอบขายให้ตกลงสเปค · ปล่อยผ่าน = เผาเลขที่
     ของเดือนนี้ไปกับใบที่ไม่มีใครใช้ (มติข้อ 21 ของสาย SO ย้อนหลัง) */
  if (isHistoricalOrder(salesOrder)) {
    return shown('ใบสั่งขายย้อนหลังไม่ออกใบสเปคสินค้า — ใบนี้คีย์จากเอกสารเดิมที่ส่งของไปแล้ว');
  }
  const orderBlock = salesOrderApprovedBlock(salesOrder);
  if (orderBlock) return shown(orderBlock);
  if (!spec) return shown('สินค้านี้ยังไม่มีสเปค — สร้างสเปคที่หน้าสินค้าก่อนจึงออกเอกสารได้');
  if (existingDocument && existingDocument.status !== 'void') {
    return shown(`บรรทัดนี้ออกเอกสารไปแล้ว (${existingDocument.docNo || 'ไม่ทราบเลขที่'})`);
  }
  return shown(null);
}

/**
 * ปุ่มทุกตัวบนหน้าเอกสาร — ตัวเดียวที่ทั้งจอและ `PATCH /api/sales-planning/spec-documents/[id]` ถาม
 *
 * @param {object} input.document   แถว product_spec_documents
 * @param {object} input.latest     Rev ล่าสุด (revNo มากสุด)
 * @param {object} input.salesOrder SO ปัจจุบันของเอกสาร (`{ status, orderNumber }` พอ)
 * @param {string} input.dealOwnerId `sales_deals.ownerId` ของดีลที่ SO ผูก
 * @param {object} input.user       `{ id, role }`
 * @returns {{ submit, withdraw, aeApprove, supApprove, reject, revise, void, remove }} แต่ละตัว `{ visible, reason }`
 */
export function documentActions({
  document, latest, salesOrder, dealOwnerId, user,
} = {}) {
  const none = {
    submit: hidden(), withdraw: hidden(), aeApprove: hidden(), supApprove: hidden(),
    reject: hidden(), revise: hidden(), void: hidden(), remove: hidden(),
  };
  // เอกสารที่ void แล้ว = ไม่มีของให้ทำ (เลขที่ถูกปิดถาวร)
  if (!document || document.status !== 'active' || !latest) return none;

  const status = latest.status;
  const mayIssue = canIssueProductSpecDocument(user?.role);
  const mayAe = canAeApproveProductSpecDocument(user, dealOwnerId);
  const maySup = canSupApproveProductSpecDocument(user);
  const forward = forwardBlock(document, salesOrder);
  const notSubmitted = SUBMITTABLE.includes(status)
    ? 'เอกสาร Rev. นี้ยังไม่ได้ยื่น — รอ AC ยื่นก่อน'
    : null;

  // ยื่น: เฉพาะ Rev ที่ยังไม่ยื่น · ยื่นแล้ว = ทำไปแล้ว ซ่อน
  const submit = mayIssue && SUBMITTABLE.includes(status) ? shown(forward) : hidden();

  // ดึงกลับ: ผู้ยื่นเอง หรือ admin · ไม่ต้องเช็ค SO (ดึงกลับคือถอย ไม่ใช่เดินหน้า)
  const mine = Boolean(user?.id) && Boolean(latest.submittedBy) && latest.submittedBy === user.id;
  const withdraw = PENDING.includes(status) && (mine || isAdmin(user)) ? shown(null) : hidden();

  // ขั้น AE: โชว์ตั้งแต่ร่างจนถึงขั้นของตัวเอง · ผ่านขั้นไปแล้ว = ซ่อน
  const aeApprove = mayAe && [...SUBMITTABLE, 'pending_ae'].includes(status)
    ? shown(notSubmitted || forward)
    : hidden();

  // ขั้น AE Sup: โชว์ตั้งแต่ร่างจนถึงขั้นของตัวเอง
  const supApprove = maySup && [...SUBMITTABLE, ...PENDING].includes(status)
    ? shown(notSubmitted
      || (status === 'pending_ae' ? 'รอ AE เจ้าของดีลอนุมัติก่อน' : null)
      || forward)
    : hidden();

  /* ตีกลับ: คนที่มีสิทธิ์อนุมัติของขั้นที่เอกสารยืนอยู่ · ไม่เช็ค SO — ตีกลับคือส่งคืน
     ไม่ใช่รับรอง (SO ที่ถูกย้อนการอนุมัติยิ่งต้องตีกลับได้) */
  const rejectable = (mayAe && [...SUBMITTABLE, 'pending_ae'].includes(status))
    || (maySup && [...SUBMITTABLE, ...PENDING].includes(status));
  // AE Sup (ที่ไม่ใช่เจ้าของดีล) ตีกลับขั้นของ AE แทนไม่ได้ — ขั้นนั้นเป็นของเจ้าของดีล
  const rejectReason = notSubmitted
    || (status === 'pending_ae' && !mayAe
      ? 'ขั้นนี้รอ AE เจ้าของดีล — AE Supervisor ตีกลับได้เมื่อถึงขั้นของตัวเอง'
      : null);
  const reject = rejectable ? shown(rejectReason) : hidden();

  // แก้ไขเอกสาร (Rev+1): เฉพาะเมื่อ Rev ล่าสุดอนุมัติแล้ว · มี Rev ค้างอยู่ = กำลังแก้อยู่ ซ่อน
  const revise = mayIssue && status === 'approved' ? shown(forward) : hidden();

  // ยกเลิกเอกสาร: AC/admin ตลอดอายุที่ยัง active
  const voidAction = mayIssue ? shown(null) : hidden();

  /* ลบร่าง (มติ 23/09/2569 · mig 0375): เฉพาะใบที่ยังไม่เคยยื่นให้ใครดู — ใบที่ยื่น/ถูกตีกลับ/
     อนุมัติแล้ว **ไม่มีของให้ลบ** จึงซ่อน (กติกาเดียวกับปุ่ม "ยื่น" ที่หายเมื่อยื่นไปแล้ว)
     ⚠️ ไม่เช็ค SO — ลบร่างของตัวเองคือถอย ไม่ใช่เดินหน้า (เหมือนดึงกลับ/ยกเลิก) · SO ที่ถูก
        ย้อนการอนุมัติยิ่งต้องเก็บกวาดร่างที่ออกค้างไว้ได้ */
  const remove = mayIssue && isDeletableDraft(document, latest) ? shown(null) : hidden();

  return {
    submit, withdraw, aeApprove, supApprove, reject, revise, void: voidAction, remove,
  };
}

/* คีย์ action ของ API (`PATCH { action }`) → คีย์ใน `documentActions`
   ⚠️ **ไม่มี `remove` ในตารางนี้โดยเจตนา** — ลบร่างเป็น `DELETE /api/sales-planning/spec-documents/<id>`
      ไม่ใช่ action ของ PATCH (การลบไม่ใช่การเปลี่ยนสถานะ · แถวหายทั้งใบ) · เติมลงตารางนี้เมื่อไร
      เทสต์จะไปบังคับให้ PATCH มี branch `action === 'remove'` ซึ่งไม่มีอยู่จริง */
export const DOC_ACTION_KEYS = Object.freeze({
  submit: 'submit',
  withdraw: 'withdraw',
  ae_approve: 'aeApprove',
  sup_approve: 'supApprove',
  reject: 'reject',
  revise: 'revise',
  void: 'void',
});

/** ขั้นที่ Rev ยืนอยู่ตอนตีกลับ — ค่าที่ลง `rejectedStage` */
export const rejectStageOf = (rev) => (
  rev?.status === 'pending_ae' ? 'ae'
    : rev?.status === 'pending_ae_supervisor' ? 'ae_supervisor'
      : null
);

const stamp = (user, now) => ({ at: now, by: user?.id || null, byName: user?.name || null });

/**
 * ก้อนที่ต้องเขียนลง Rev ต่อหนึ่งการกระทำ — ตัวเดียวที่ API และ store ใช้
 *
 * ⚠️ ทุกก้อนต้องผ่าน CHECK ของ 0370 (ยื่นแล้วต้องมีภาพนิ่ง · อนุมัติต้องมีตราประทับ ·
 *    ตีกลับต้องมีเหตุผล+ขั้น) — ประกอบก้อนเองที่เราต์เมื่อไร ลืมช่องเดียวคือ 500 ภาษาอังกฤษ
 * ⚠️ `from` = สถานะที่ต้องเป็นอยู่ก่อนเขียน (ใช้คู่กับ `.eq('status', rev.status)` ของ store)
 *
 * @param {'submit'|'withdraw'|'ae_approve'|'sup_approve'|'reject'|'reset_to_draft'} action
 * @returns {{ from: string[], patch: object } | null}
 */
export function revisionPatch(action, {
  user, now = new Date().toISOString(), snapshot, illustrationIds = [], reason, stage,
} = {}) {
  const who = stamp(user, now);
  const clearSubmit = { submittedAt: null, submittedBy: null, submittedByName: null };
  const clearAe = { aeApprovedAt: null, aeApprovedBy: null, aeApprovedByName: null };
  const clearSup = { supApprovedAt: null, supApprovedBy: null, supApprovedByName: null };
  const clearReject = {
    rejectedAt: null, rejectedBy: null, rejectedByName: null, rejectionReason: null, rejectedStage: null,
  };
  // ถอยเป็นร่าง = ภาพนิ่งกับตราประทับของรอบที่ยื่นไว้หมดความหมาย (ร่างแสดงสดเสมอ)
  const backToDraft = {
    status: 'draft', snapshot: null, illustrationIds: [], ...clearSubmit, ...clearAe, ...clearSup, updatedAt: now,
  };
  switch (action) {
    case 'submit':
      return {
        from: [...SUBMITTABLE],
        patch: {
          status: 'pending_ae',
          snapshot: snapshot ?? null,
          illustrationIds: Array.isArray(illustrationIds) ? illustrationIds : [],
          submittedAt: who.at, submittedBy: who.by, submittedByName: who.byName,
          ...clearAe, ...clearSup, ...clearReject,
          updatedAt: now,
        },
      };
    case 'withdraw':
    case 'reset_to_draft':
      return { from: [...PENDING], patch: backToDraft };
    case 'ae_approve':
      return {
        from: ['pending_ae'],
        patch: {
          status: 'pending_ae_supervisor',
          aeApprovedAt: who.at, aeApprovedBy: who.by, aeApprovedByName: who.byName,
          updatedAt: now,
        },
      };
    case 'sup_approve':
      return {
        from: ['pending_ae_supervisor'],
        patch: {
          status: 'approved',
          supApprovedAt: who.at, supApprovedBy: who.by, supApprovedByName: who.byName,
          updatedAt: now,
        },
      };
    case 'reject':
      return {
        from: [...PENDING],
        patch: {
          status: 'rejected',
          rejectedAt: who.at, rejectedBy: who.by, rejectedByName: who.byName,
          rejectionReason: String(reason ?? '').trim() || null,
          rejectedStage: stage || null,
          updatedAt: now,
        },
      };
    default:
      return null;
  }
}

/**
 * ราง 3 ขั้นของ Rev หนึ่งใบ — `state`: done | current | todo · `rejected` ติดที่ขั้นที่ตีกลับ
 *
 * ⚠️ Rev ที่ถูกตีกลับ = งานกลับไปอยู่ที่ AC (ขั้น "ยื่น" เป็น current อีกรอบ) · ป้ายตีกลับ
 *    ติดที่ขั้นของคนตีกลับ ให้คนอ่านรู้ว่าใครส่งคืนและเพราะอะไร
 */
export function docRevisionSteps(rev) {
  const status = rev?.status || 'draft';
  const at = {
    draft: 0, rejected: 0, pending_ae: 1, pending_ae_supervisor: 2, approved: 3, superseded: 3,
  }[status] ?? 0;
  const rejectedStep = status === 'rejected'
    ? (rev?.rejectedStage === 'ae_supervisor' ? 2 : 1)
    : -1;
  return DOC_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    actor: step.actor,
    state: index < at ? 'done' : index === at ? 'current' : 'todo',
    rejected: index === rejectedStep,
    byName: rev?.[`${step.stamp}ByName`] || null,
    at: rev?.[`${step.stamp}At`] || null,
  }));
}

/**
 * สถานะเอกสารของบรรทัด SO หนึ่งบรรทัด — ตัวเดียวที่การ์ดบนหน้า SO ใช้
 *
 * ⚠️ `document` ที่ void แล้วนับว่า "ยังไม่มีเอกสาร" (ออกใบใหม่ได้ เลขใหม่)
 * ⚠️ `revStatus` = สถานะดิบของ Rev ล่าสุด — การ์ดใช้เลือกสีป้าย (ตีกลับ = แดง · ร่าง = เทา) ชุดเดียวกับ
 *    หน้าสเปค/หน้าเอกสาร · 🐞 เดิมการ์ดทาเขียวทุกใบที่ "ออกแล้ว" จนใบที่ถูกตีกลับดูเหมือนเสร็จ
 * @returns {{ kind: 'out_of_scope'|'no_spec'|'not_issued'|'issued', label: string, reason: string|null,
 *   action: null|'create_spec'|'issue'|'open', documentId: string|null, docNo: string|null,
 *   docNoText: string|null, revLabel: string|null, statusLabel: string|null, revStatus: string|null }}
 */
export function lineDocumentState({
  line, spec, document, latest, salesOrder, user, scopeReason,
} = {}) {
  const base = {
    reason: null, action: null, documentId: null, docNo: null, docNoText: null, revLabel: null, statusLabel: null, revStatus: null,
  };
  if (scopeReason) {
    return { ...base, kind: 'out_of_scope', label: 'ไม่ต้องใช้', reason: scopeReason };
  }
  const live = document && document.status !== 'void' ? document : null;
  if (live) {
    return {
      ...base,
      kind: 'issued',
      label: 'ออกแล้ว',
      action: 'open',
      documentId: live.id || null,
      docNo: live.docNo || null,
      // ⭐ เลขที่ที่คนอ่าน DDMMYY-XXX-RR (มติ 22/09) — ตัวเดียวกับกระดาษ (`formatSpecDocNo`)
      docNoText: live.docNo ? formatSpecDocNo(live.docNo, latest?.revNo) : null,
      revLabel: latest ? formatRevLabel(latest.revNo) : null,
      statusLabel: latest ? (DOC_REVISION_STATUS_LABELS[latest.status] || latest.status) : null,
      revStatus: latest?.status || null,
    };
  }
  if (!spec) {
    return {
      ...base,
      kind: 'no_spec',
      label: 'ยังไม่มีสเปค',
      // ลิงก์ไปสร้างสเปคที่หน้าสินค้า — เฉพาะคนที่แก้สเปคได้ (ไม่มีสิทธิ์ = ไม่โชว์ลิงก์)
      action: canEditProductSpec(user?.role) && line?.productId ? 'create_spec' : null,
    };
  }
  const gate = documentCreateGate({
    user, salesOrder, line, spec, existingDocument: null, scopeReason: null,
  });
  return {
    ...base,
    kind: 'not_issued',
    label: 'ยังไม่ออก',
    action: gate.visible ? 'issue' : null,
    reason: gate.visible ? gate.reason : null,
  };
}
