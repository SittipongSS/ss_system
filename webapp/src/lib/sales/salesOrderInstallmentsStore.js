// ── ที่เก็บงวดชำระของใบสั่งขาย (mig 0245) — ฝั่ง server เท่านั้น ─────────
//
// logic ล้วนอยู่ที่ `salesOrderPayments.js` (มีเทสต์) · ไฟล์นี้แตะ DB อย่างเดียว
// เพื่อให้ด่าน/การคำนวณทดสอบได้โดยไม่ต้องมีฐานข้อมูล
import { genId } from '@/lib/id';
import {
  billingFillPatch, buildInstallmentsForOrder, installmentPrepaid, installmentsFromPaymentPlan, isInstallmentFrozen,
} from '@/lib/sales/salesOrderPayments';
import { orderConfirmationOf } from '@/lib/sales/orderConfirmationDocs';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import { INSTALLMENT_REPLAN_SCHEMA_MISSING } from '@/lib/sales/installmentReplan';
import { INSTALLMENT_CARRY_SCHEMA_MISSING, carrySourcesFrom } from '@/lib/sales/installmentCarry';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { historicalSchemaMissing, pipelineRowsOnly } from '@/lib/sales/historicalOrders';

const TABLE = 'sales_order_installments';

/* ── ด่านลำดับ deploy ของ PR1 (mig 0376 · แผน so-payment-unlock-replan) ─────────────────────────────
   🛑 โค้ด PR1 ปลดด่าน "มีงวดที่บัญชีรับรองแล้ว" ออกจากการย้อนการอนุมัติ เพราะ RPC ออก Rev. ของ 0376 **ย้าย** งวด
     ไปใบ Rev. ทั้งแถว · ถ้าฐานยังเป็นตัวก๊อป (0363) เงินที่รับแล้วจะถูกก๊อปเป็นงวดค้างรับบนใบ Rev. (นับซ้ำ + ยืมสลิปซ้ำ)
   ⇒ route ย้อนการอนุมัติถามคอลัมน์ที่ 0376 เพิ่ม **ก่อน** เรียก RPC — ไม่มี = ไม่ย้อนให้ (แพตเทิร์น zoneSurveyOwnerColumnError)
   ⭐ limit 0 = ถามสคีมาอย่างเดียว ไม่ดึงแถว · select ที่เอ่ยชื่อคอลัมน์ ⇒ CI check:columns แดงจนกว่าจะรันมิก
   ⚠️ 42703 = ไม่มีคอลัมน์จริง · อย่างอื่น (เน็ต/สิทธิ์) ห้ามโทษ migration — คนจะไปรันซ้ำผิดเรื่อง */
export const INSTALLMENT_MOVE_SCHEMA_MISSING = 'ฐานข้อมูลยังไม่ได้รัน migration 0376 (ออก Rev. ย้ายงวดชำระไปใบใหม่)'
  + ' — ย้อนการอนุมัติไม่ได้จนกว่าจะรัน · แจ้งผู้ดูแลระบบ';

export async function installmentMoveColumnError(supabase) {
  const { error } = await supabase.from(TABLE).select('"movedFrom"').limit(0);
  if (!error) return null;
  return error.code === '42703'
    ? INSTALLMENT_MOVE_SCHEMA_MISSING
    : `ตรวจความพร้อมของงวดชำระไม่สำเร็จ — ${error.message} · ยังไม่ได้ย้อนการอนุมัติ ลองใหม่อีกครั้ง`;
}

/* ── ด่านลำดับ deploy ของ 0387 (มติเจ้าของ 24/09 · review 25/09 fail closed) ───────────────────────────────
   route ยกเลิกใบย้อนหลังปล่อยงวดยกมาที่มีเงินให้ trigger ของ 0387 จัดการ (ตีกลับงวดที่รอตรวจ · ด่านหมายเหตุ · ด่านแข่งกับบัญชี)
   🐞 โค้ดขึ้น prod ก่อนรันมิกได้ (deploy อัตโนมัติวันละ 3 รอบ ไม่ถามมิก) ⇒ ยกเลิกผ่านโดยไม่มีใครตีกลับ = งวดยกมาค้าง "รอตรวจ"
      บนใบที่ยกเลิกถาวร และรันมิกทีหลังก็ไม่ซ่อม ⇒ **ถามฐานก่อนเขียน** ว่า trigger สองตัวของ 0387 อยู่และเปิดอยู่
   · `{ ready: true }` เมื่อ RPC ตอบ true ตรง ๆ เท่านั้น · ไม่มีฟังก์ชัน (ยังไม่รันมิก) / ตอบอย่างอื่น = `{ ready: false }`
   · อ่านไม่ขึ้นด้วยเหตุอื่น (เน็ต/สิทธิ์) = `{ error }` — ห้ามถือว่าพร้อม และห้ามโทษ migration (คนจะไปรันซ้ำผิดเรื่อง)
   ⚠️ supabase ไม่ throw — อ่าน `error` เอง */
export async function historicalCancelSettleReady(supabase) {
  const { data, error } = await supabase.rpc('historical_so_cancel_settle_ready');
  if (error) return historicalSchemaMissing(error) ? { ready: false } : { error: error.message || String(error.code || 'unknown') };
  return { ready: data === true };
}

export async function loadInstallments(supabase, salesOrderId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('salesOrderId', salesOrderId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * สร้างงวดจากแผนชำระของ QT ต้นทาง — **idempotent**
 *
 * ⚠️ กันซ้ำด้วย unique index `(salesOrderId, seq)` ที่ระดับ DB ไม่ใช่พึ่งการเช็คก่อน insert
 * (ระหว่าง "เช็คว่าว่าง" กับ "insert" มีช่องให้กดสองครั้งพร้อมกันเสมอ)
 * ⇒ ชนแล้วถือว่าสำเร็จ คืนของที่มีอยู่
 *
 * ใช้สี่ทาง: **อัตโนมัติตอนออกใบจาก QT** (มติผู้ใช้ 2026-08-19 — ทางปกติ) · ปุ่ม
 * "เริ่มติดตามการชำระ" ที่เหลือเป็นทางกู้เมื่อตอนออกใบยังไม่มีแผนชำระหรือสร้างไม่สำเร็จ ·
 * ปุ่มเดียวกันบนใบเก่าที่อนุมัติไปก่อนมีระบบนี้ · และตอนอนุมัติใบสำหรับใบที่ยังไม่มีแถว
 *
 * ⚠️ แถวที่สร้างโดยไม่ส่ง `frozenAt` **ยังไม่ freeze** — ยอดยังเดินตามแผนของ QT
 * จนกว่าจะอนุมัติ (`freezeInstallments`) · ที่เขียนยอดลงไปเลยเพราะคอลัมน์เป็น NOT NULL
 * ส่วนตัวที่ผู้ใช้เห็นจริงมาจาก `withLiveAmounts` ที่ทับให้ตอนอ่าน
 *
 * 🐞 **หลักฐาน Won ยืมมาได้เฉพาะตอน freeze** — `buildInstallmentsForOrder` ตั้งงวดแรก
 * เป็น `reported` เมื่อ QT ปิดด้วยสลิป · แถวนั้นบนงวดร่างจะชน CHECK
 * `sales_order_installments_draft_pending` ของ 0259 (ไม่ freeze = ต้อง pending)
 * ⇒ ส่ง `frozenAt` มาด้วยเมื่อไร ถึงจะยืมหลักฐานได้ · ไม่งั้นได้แถว pending ล้วน
 * แล้ว `freezeInstallments` ไปยืมให้ทีหลังตอนอนุมัติ (เจตนาเดิมของมติ 2026-08-13 คงอยู่)
 */
export async function ensureInstallments(supabase, {
  order, user, now = null, frozenAt = null, borrowConfirmation = true,
}) {
  const existing = await loadInstallments(supabase, order.id);
  if (existing.length) return { rows: existing, created: false };

  const rows = buildInstallmentsForOrder(
    order.quotation?.paymentPlan,
    order.totalAmount,
    {
      // เอกสารยืนยันคำสั่งซื้อของใบ (ใบเก่าถอยไปอ่านหลักฐาน Won ของ QT ต้นทาง) —
      // ยืมมาตั้งงวดแรกเมื่อยืนยันด้วยสลิปโอนเงิน
      /* ⚠️ `borrowConfirmation: false` = ดีลมีเงินค้างจากใบที่ยกเลิก (review MONEY-1 · ดู freezeInstallments) */
      confirmation: frozenAt && borrowConfirmation ? orderConfirmationOf(order, order.quotation) : null,
      actor: { id: user?.id || null, name: user?.name || user?.email || null },
      now,
    },
  );
  if (!rows.length) return { rows: [], created: false };

  const payload = rows.map((row) => ({
    id: genId('SOI'),
    salesOrderId: order.id,
    seq: row.seq,
    label: row.label,
    percent: row.percent,
    amount: row.amount,
    status: row.status || 'pending',
    paidOn: row.paidOn || null,
    reportedAt: row.reportedAt || null,
    reportedById: row.reportedById || null,
    reportedByName: row.reportedByName || null,
    evidence: row.evidence || [],
    note: row.note || null,
    ...(frozenAt ? { frozenAt } : {}),
    createdById: user?.id || null,
    createdByName: user?.name || user?.email || null,
  }));

  const { data, error } = await supabase.from(TABLE).insert(payload).select('*');
  if (error) {
    // 23505 = unique violation ⇒ อีกคำขอสร้างไปแล้ว ไม่ใช่ความผิดพลาดที่ต้องแจ้งผู้ใช้
    if (error.code === '23505') {
      return { rows: await loadInstallments(supabase, order.id), created: false };
    }
    throw error;
  }
  return { rows: (data || []).sort((a, b) => a.seq - b.seq), created: true };
}

/**
 * หยุดยอดของงวดทั้งใบ — เรียกตอน **อนุมัติใบ** เท่านั้น (B-4 · mig 0259)
 *
 * ⭐ นี่คือจุดที่เหตุผลเดิมของ 0245 ย้ายมาอยู่: ยอดต่องวดถูกเขียนทับ **ครั้งสุดท้าย**
 * จากแผนของ QT + ยอดจริงของใบ ณ วินาทีที่อนุมัติ แล้วประทับ `frozenAt`
 * ⇒ ไม่มีทาง drift เพราะทุกครั้งที่อนุมัติจะทับใหม่เสมอ
 *
 * ⚠️ **จำนวนงวดต่างกันแก้ด้วยการทับยอดไม่ได้** — QT ถูกแก้หลังกด "เริ่มติดตาม" ได้
 * ⇒ ตั้งใหม่ทั้งชุด (ลบของเดิมแล้วสร้างจากแผนล่าสุด)
 * ⭐ **แต่ของที่คนกรอกเองถูกอุ้มข้ามการตั้งใหม่ตาม `seq`** (แก้ 07/09/2026):
 *   `coversFrom`/`coversTo` · `dueDate` · หมายเหตุ · `billingDate`/`billingEvent` (mig 0389) · เดิมหายทั้งหมด และหัวข้อนี้เคยเขียนว่า
 *   "แลกกับ `dueDate` ที่ SA กรอกไว้ — จอเตือนไว้ก่อนแล้ว" ซึ่งใช้ได้ตอนที่ยังไม่มีช่วงครอบ
 *   ⇒ วันนี้ช่วงครอบหายเมื่อไร `paidThrough` เป็น null และด่านเงินบล็อกนัดทั้งไซต์
 *     (ดูรายละเอียดที่จุดลบข้างล่าง)
 *
 * 🛑 **แต่ห้ามลบทิ้งถ้ามีเงินบันทึกไว้แล้ว** (มติผู้ใช้ 2026-08-19) — ตั้งแต่งวดร่างเก็บ
 * `paidOn` + หลักฐานได้ ข้อความเดิมที่ว่า *"ปลอดภัยเพราะงวดร่างเป็น pending จึงไม่มี
 * หลักฐานให้ทำหาย"* **ไม่จริงอีกต่อไป** · แผนที่เปลี่ยนทีหลังต้องไม่ทำลายสลิปของลูกค้า
 * ⇒ ใบที่มีงวดบันทึกเงินไว้ freeze ของเดิมตามที่เป็น แล้วปล่อยให้ธงเตือนแผนไม่ตรง
 * ค้างอยู่บนจอ ให้คนแก้เอง — ผิดแบบเห็นได้ ดีกว่าถูกแบบลบหลักฐานเงียบ ๆ
 *
 * ⚠️ **เส้น "จำนวนไม่ตรงแผน" แทบไปไม่ถึงอยู่แล้ว** — QT ที่ออก SO แล้วแก้ไม่ได้ (`accepted`
 * ไม่อยู่ใน `EDITABLE_STATUSES`) · `unaccept` ติด `sales_order_exists` ของ 0138 · SO ร่างแก้ได้แค่
 * `referenceDoc`/`notes`/เอกสารยืนยัน/กำหนดส่ง ⇒ เหลือทางเดียวคือ ยกเลิก SO → unaccept → แก้แผน
 * → รับใบใหม่ → admin กด restore ใบที่ยกเลิก · เก็บด่านนี้ไว้เพราะราคาเท่ากับ `filter` หนึ่งบรรทัด
 * แต่ราคาของการพลาดคือหลักฐานการเงินของลูกค้าหายไปทั้งแถว
 *
 * 🛑 **ชุดที่มีแถวตรึงยอดแล้วอย่างน้อยหนึ่งแถว = แผนจริงของใบ ไม่ใช่ร่าง** (PR0 · แผน
 *   so-payment-unlock-replan · มติเจ้าของ 23/09) — งวดที่ยกมากับใบ Rev. (PR1 ย้ายแถวไปทั้งแถว) และแผนที่
 *   AE Sup ปรับหลังอนุมัติ (PR2) ตรึงยอดแล้วทั้งแถว ⇒ ตอนอนุมัติใบ:
 *   · ห้ามเข้าเส้น "ลบแล้วตั้งใหม่" · ห้ามทับยอด/สัดส่วน/ป้ายจาก QT (หลักการ "Σ งวด = ยอดใบ" ถือโดยแผนนั้นเอง)
 *   · ห้ามยืมสลิปของตอนยืนยันคำสั่งซื้อ — สลิปนั้นอยู่ในงวดที่ยกมาแล้ว ยืมซ้ำ = เงินก้อนเดียวสองแถว
 *   · ประทับ `frozenAt` ให้แถวที่ยังไม่ตรึงเท่านั้น (งวดร่างที่บันทึกเงินไว้เองยังเข้าคิวบัญชีตามเดิม —
 *     เป็นเงินของแถวนั้น ไม่ใช่การยืม)
 *   · ยอดรวมไม่เท่ายอดใบ = `console.error` ดัง ๆ แต่ **ไม่แก้เอง** — ตัวเลขเงินที่ระบบเดาแก้ให้คือของที่
 *     ไม่มีใครตรวจ
 *
 * ⚠️ **idempotent** — อนุมัติซ้ำ/กู้ธงที่ล้ม เรียกซ้ำได้ แถวที่ freeze แล้วไม่ถูกแตะ
 *
 * 🛑 **`borrowConfirmation: false` = ห้ามยืมสลิปจากเอกสารยืนยันคำสั่งซื้อ** (review MONEY-1) — route อนุมัติส่งเมื่อดีลนี้มี
 *   "เงินค้างจากใบที่ยกเลิก" (หรืออ่านไม่ขึ้น): สลิปนั้นมักเป็นมัดจำก้อนเดียวกับเงินค้าง ยืมมาตั้งงวดแรกแล้วมีคนกดยกเงินค้างเข้ามาอีก
 *   = เงินก้อนเดียวนับสองครั้ง (บทเรียน SO-26080039-0 / -043-0) ⇒ งวดแรกคง pending ให้คนตัดสิน (แจ้งเงินใหม่ หรือยกเงินค้าง)
 *   ⚠️ เงินที่ฝ่ายขายบันทึกไว้เองตอนร่าง (prepaid) ยังเลื่อนเป็น reported ตามเดิม — ของที่คนบันทึก ไม่ใช่ระบบเดา · ถ้าซ้ำกับเงินค้าง
 *     ด่านยกซ้ำ (carryDuplicates · RPC installment_carry_duplicate) บังคับให้บัญชีตีกลับงวดนั้นก่อนยก
 */
export async function freezeInstallments(supabase, { order, user, now = null, borrowConfirmation = true }) {
  const existing = await loadInstallments(supabase, order.id);
  const stamp = now || new Date().toISOString();

  // freeze ไปแล้วทั้งชุด = อนุมัติซ้ำ ไม่ต้องทำอะไร (ยอดที่เซ็นไปแล้วห้ามขยับ)
  if (existing.length && existing.every(isInstallmentFrozen)) {
    return { rows: existing, frozen: false };
  }

  const plan = installmentsFromPaymentPlan(order.quotation?.paymentPlan, order.totalAmount);
  const draft = existing.filter((row) => !isInstallmentFrozen(row));

  // จำนวนไม่ตรงแผนล่าสุด ⇒ ตั้งใหม่ทั้งชุด — **เว้นใบที่มีเงินบันทึกไว้แล้ว** (ดูเหตุผลข้างบน)
  const prepaidDraft = draft.filter(installmentPrepaid);
  /* ⭐ **งวดที่มีใบกำกับภาษีแล้วก็ห้ามตั้งใหม่** (mig 0348 · มติผู้ใช้ 2026-09-07)
     เหตุผลเดียวกับ `prepaidDraft` แต่หนักกว่า: ใบกำกับเป็นเอกสารกฎหมายที่ออกไปหา
     ลูกค้าแล้ว · ลบแถวทิ้ง = เลข/วัน/ไฟล์หายพร้อมกันโดยไม่มี error และ store ไม่เขียน
     audit ⇒ กู้ไม่ได้เลย (ไม่มีถังขยะ · audit_logs.before คือทางกู้ทางเดียวของระบบนี้)
     ⚠️ ต้องเป็น predicate แยก **ห้ามขยาย `installmentPrepaid`** — ตัวนั้นคุมสถานะบนจอ
     (`prepaid`) และตัวกรองลำดับงวดด้วย · งวดที่มีใบกำกับแต่ยังไม่มีวันจ่ายไม่ใช่ "จ่ายแล้ว" */
  const invoicedDraft = draft.filter((row) => !!row.taxInvoiceNo);
  /* มีแถวตรึงแล้ว = แผนจริงของใบ (ดูหัวฟังก์ชัน) ⇒ ไม่มีวันเข้าเส้นตั้งใหม่ และไม่ทับอะไรจาก QT */
  const anchored = existing.some(isInstallmentFrozen);
  if (draft.length && plan.length && draft.length !== plan.length
    && !prepaidDraft.length && !invoicedDraft.length && !anchored) {
    /* 🔴 **อุ้มของที่คนกรอกเองข้ามการตั้งใหม่** (แก้ 07/09/2026)
       🐞 เดิมลบแล้วสร้างจากแผนเปล่า ⇒ `coversFrom`/`coversTo` หายไปด้วย
         ⇒ `paidThrough` คืน null ⇒ ด่านเงินของ `visitGate` **บล็อกนัดช่างทุกโซนของไซต์**
           ทั้งที่ลูกค้าจ่ายแล้ว — อาการเดียวกับบั๊กออก Rev. (mig 0346) แต่คนละเส้น
           เส้นนี้เกิดตอน **กดอนุมัติใบ** ไม่ใช่ตอนออก Rev.
       ⚠️ ตอนเขียนกติกานี้ครั้งแรก คอลัมน์ช่วงครอบยังไม่เกิด (มาที่ mig 0320) ⇒ หัวไฟล์
         ยอมแลก `dueDate` ทิ้งโดยบอกว่า "จอเตือนไว้ก่อนแล้ว" · วันนี้ของที่หายไปด้วย
         ไม่ใช่ความสะดวก แต่คือของที่ **หยุดงานหน้างานทั้งไซต์** ⇒ เหตุผลเดิมหมดอายุ
       ⚠️ **อุ้มตาม `seq` ไม่ใช่ตาม id** — id ชุดใหม่คนละตัว · แผนที่งวดไม่เท่ากันแปลว่า
         บางงวดไม่มีคู่ ⇒ งวดที่เกินมาได้ค่าว่างตามเดิม ให้คนไปเติม (ด่านยังกันอยู่:
         งวดที่ confirmed แต่ไม่มี `coversTo` ไม่ขยับ "จ่ายถึง" แม้แต่วันเดียว)
       ⚠️ **ไม่อุ้ม `billingRequestId`** — คำร้องขอใบวางบิลผูกกับ *งวดที่มียอดเท่านั้น*
         และแผนที่เปลี่ยนแปลว่ายอดเปลี่ยน ⇒ ยกมาแปะงวดใหม่คือชี้คำร้องไปที่ยอดคนละตัว
         · ระบบกันแนบซ้ำด้วยการถามว่าคำร้องใบนี้เกาะงวดไหนอยู่ ⇒ ปล่อยให้หลุดแล้ว
           ให้คนแนบใหม่ ปลอดภัยกว่าแปะผิดงวดเงียบ ๆ
       ⭐ **วันวางบิล / รอเหตุการณ์ (mig 0389 · กำหนดวางบิล) อุ้มด้วย** — SA แตะรอบให้งวดตั้งแต่ใบยังเป็นร่าง
         (ม็อก B/C) ⇒ ไม่อุ้ม = อนุมัติใบแล้ววันวางบิลหายเงียบทั้งที่กำหนดชำระยังอยู่ (สองช่องที่ตั้งมาคู่กันแยกจากกัน)
         · CHECK "ไม่มีทั้งคู่พร้อมกัน" ของ 0389 ผ่านเสมอ — ค่าคู่นี้มาจากแถวเดิมที่ผ่าน CHECK มาแล้ว
       🔴 **เก็บเฉพาะค่าที่ไม่ว่าง** (แก้ 26/09) — เดิม `.update(keep)` เขียนทั้งสี่ช่องเมื่อช่องใดช่องหนึ่งมีค่า
         ⇒ null ของแถวเก่าเขียนทับค่าที่งวดใหม่ได้มา · 🐞 **เคยเสียของจริงแล้ว**: งวดใหม่ได้ `note` ตอนสร้าง (หมายเหตุของ
         แผนใน QT ผ่าน installmentsFromPaymentPlan · หมายเหตุสลิปที่ยืม) แล้วถูก null ของแถวเก่าลบทิ้งทุกครั้งที่แถวนั้นมี
         ช่วงครอบ/กำหนดชำระให้อุ้ม ⇒ **พฤติกรรมเปลี่ยน**: หมายเหตุจากแผนรอดแล้ว (หมายเหตุที่คนพิมพ์ไว้ในแถวเก่ายังชนะเหมือนเดิม)
         · และก่อนรัน 0389 ชื่อคอลัมน์ `billingDate` ใน payload = PostgREST ตอบ PGRST204 ⇒ แถวนั้น **ไม่ได้อุ้มอะไรเลย**
         รวมช่วงครอบ (ด่านเงินของนัดช่าง) — ตัดค่าว่างทิ้ง ทำให้ใบที่ยังไม่มีวันวางบิลไม่เอ่ยชื่อคอลัมน์ใหม่เลย */
    const CARRIED = ['coversFrom', 'coversTo', 'dueDate', 'note', 'billingDate', 'billingEvent'];
    const carried = new Map(draft.map((row) => [row.seq, Object.fromEntries(
      CARRIED.map((field) => [field, row[field] ?? null]).filter(([, value]) => value !== null && value !== ''),
    )]));

    const { error } = await supabase.from(TABLE).delete().in('id', draft.map((r) => r.id));
    if (error) throw error;
    const seeded = await ensureInstallments(supabase, { order, user, now: stamp, frozenAt: stamp, borrowConfirmation });

    /* เขียนค่าที่อุ้มไว้กลับทีละงวด — ทำ **หลัง** สร้างสำเร็จเสมอ
       ⚠️ ล้มตรงนี้ต้องไม่ลากการอนุมัติล้มตาม: งวดถูกตั้งใหม่ครบแล้ว ของที่หายคือค่าที่คน
         กรอกเอง ซึ่งกรอกซ้ำได้ · โยน error ที่นี่ = ใบที่อนุมัติสำเร็จแล้วตอบ 500 */
    const restored = [];
    for (const row of seeded.rows) {
      const keep = carried.get(row.seq);
      if (!keep || !Object.keys(keep).length) { restored.push(row); continue; }
      const { data, error: patchError } = await supabase.from(TABLE)
        .update(keep).eq('id', row.id).select('*').maybeSingle();
      restored.push(patchError ? row : (data || row));
    }
    return { rows: restored, frozen: true };
  }

  // ยังไม่เคยกด "เริ่มติดตาม" — สร้างให้ตอนอนุมัติเหมือนพฤติกรรมเดิมของ 0245
  if (!existing.length) {
    const seeded = await ensureInstallments(supabase, { order, user, now: stamp, frozenAt: stamp, borrowConfirmation });
    return { rows: seeded.rows, frozen: !!seeded.rows.length };
  }

  /* ชุดที่มีแถวตรึงแล้ว — ประทับ frozenAt ให้แถวที่ยังไม่ตรึง ไม่ทับยอด/ป้ายจาก QT ไม่ยืมสลิป (หัวฟังก์ชัน)
     ⚠️ งวดร่างที่บันทึกเงินไว้เอง (`installmentPrepaid`) ยังเลื่อนเป็น `reported` ตามมติ 2026-08-19 —
       เป็นเงินของแถวนั้นเอง · `reportedAt` ต้องมีค่า (CHECK `..._state_sane` ของ 0245) */
  if (anchored) {
    for (const row of draft) {
      const prepaid = installmentPrepaid(row);
      const { error } = await supabase.from(TABLE).update({
        ...(prepaid ? { status: 'reported', reportedAt: row.reportedAt || stamp } : {}),
        frozenAt: stamp,
        updatedAt: stamp,
      }).eq('id', row.id);
      if (error) throw error;
    }
    const rows = await loadInstallments(supabase, order.id);
    const sum = Math.round(rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0) * 100) / 100;
    const total = Math.round((Number(order.totalAmount) || 0) * 100) / 100;
    if (Math.abs(sum - total) >= 0.005) {
      console.error('[freezeInstallments] ยอดรวมงวดไม่เท่ายอดใบ — ไม่แก้เอง ให้แอดมินตรวจ',
        order.id, order.orderNumber || '', `งวดรวม ${sum}`, `ยอดใบ ${total}`);
    }
    return { rows, frozen: draft.length > 0 };
  }

  /* จำนวนตรงกัน — ทับยอด/สัดส่วน/ป้ายรายแถว แล้วประทับ frozenAt
     ⭐ **ยืมเอกสารยืนยันคำสั่งซื้อตรงนี้ด้วย** — งวดร่างเป็น `pending` ล้วนเสมอ (CHECK ของ 0259)
     ⇒ ใบที่ SA กด "เริ่มติดตาม" ไว้ก่อน ต้องได้งวดแรกเป็น `reported` พร้อมสลิปจากตอน
     ปิด Won เหมือนใบที่ไม่เคยกด ไม่งั้นการกดปุ่มเร็วกลายเป็นการเสียสิทธิ์ */
  const bySeq = new Map(plan.map((row) => [row.seq, row]));
  const seeded = buildInstallmentsForOrder(order.quotation?.paymentPlan, order.totalAmount, {
    confirmation: borrowConfirmation ? orderConfirmationOf(order, order.quotation) : null,
    actor: { id: user?.id || null, name: user?.name || user?.email || null },
    now: stamp,
  });
  const seedBySeq = new Map(seeded.filter((r) => r.status === 'reported').map((r) => [r.seq, r]));

  for (const row of draft) {
    const fresh = bySeq.get(row.seq);
    const prepaid = installmentPrepaid(row);
    // ⚠️ ยืมให้เฉพาะแถวที่ยังไม่มีใครแตะ — SA บันทึกเงินไว้เองแล้วต้องไม่ถูกทับ
    const seed = row.status === 'pending' && !prepaid ? seedBySeq.get(row.seq) : null;
    const { error } = await supabase.from(TABLE).update({
      ...(fresh ? { percent: fresh.percent, amount: fresh.amount, label: fresh.label } : {}),
      ...(seed ? {
        status: 'reported',
        paidOn: seed.paidOn,
        reportedAt: seed.reportedAt,
        reportedById: seed.reportedById,
        reportedByName: seed.reportedByName,
        evidence: seed.evidence,
        note: row.note || seed.note,
      } : {}),
      /* ⭐ **เงินที่บันทึกไว้ตอนร่าง เข้าคิวบัญชีตรงนี้** (มติผู้ใช้ 2026-08-19)
         งวดร่างจอดที่ `pending` เพราะงานถึงบัญชีได้ต่อเมื่อ AE Supervisor อนุมัติใบ
         · ผ่านด่านนั้นแล้วมันคือคำแจ้งที่สมบูรณ์ ไม่ต้องให้ใครมากดซ้ำ
         ⚠️ `reportedAt` ต้องมีค่า ไม่งั้นชน CHECK `..._state_sane` ของ 0245
         (reported ต้องมี reportedAt) — แถวที่บันทึกผ่าน API มีอยู่แล้ว ที่ fallback ไว้
         เผื่อแถวที่ถูกเขียนมาทางอื่น ไม่ใช่ให้ API เลิกกรอก */
      ...(prepaid ? { status: 'reported', reportedAt: row.reportedAt || stamp } : {}),
      frozenAt: stamp,
      updatedAt: stamp,
    }).eq('id', row.id);
    if (error) throw error;
  }
  return { rows: await loadInstallments(supabase, order.id), frozen: draft.length > 0 };
}

/**
 * อัปเดตงวดเดียว — คืนแถวหลังอัปเดต
 *
 * ⭐ `expectedUpdatedAt` = optimistic lock (PR0) — เขียนเฉพาะเมื่อแถวยังเป็นรุ่นที่ผู้เรียกอ่านมา
 *   ⇒ ไม่ตรง = **คืน `null` และไม่เขียนอะไร** (ผู้เรียกตอบ 409 `INSTALLMENT_STALE_MESSAGE`)
 *   🐞 เดิมเขียนโดยไม่มีเงื่อนไข ⇒ สองหน้าต่างเขียนแถวเดียวกันพร้อมกัน ตัวที่มาทีหลังชนะเงียบ ๆ
 * ⚠️ ไม่ส่ง = เขียนแบบเดิม (ผู้เรียกตอนออกใบที่เพิ่งสร้างแถวเอง ไม่มีใครแย่งเขียน)
 */
export async function updateInstallment(supabase, id, patch, { expectedUpdatedAt = null } = {}) {
  let query = supabase
    .from(TABLE)
    .update({ ...patch, updatedAt: new Date().toISOString() })
    .eq('id', id);
  if (expectedUpdatedAt) query = query.eq('updatedAt', expectedUpdatedAt);
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * เขียนวันของ "เติมตามรอบ เดือนละงวด" ทีละงวด (กำหนดวางบิล · mig 0389) — route เรียกหลังด่านผ่าน **ครบทุกงวด** แล้ว
 * ⭐ เขียนแบบมีเงื่อนไข `updatedAt` ของแถวที่ด่านเพิ่งตัดสิน (ไม่มี RPC ⇒ ไม่มีทรานแซกชัน) ⇒ อีกหน้าต่างเขียนแทรก = หยุดที่งวดนั้น
 *   งวดที่ลงไปแล้วคงอยู่ (กดซ้ำเติมต่อเฉพาะงวดที่ยังว่าง — installmentBillingFillable) · **ไม่ย้อนงวดที่ลงแล้ว** (ย้อนเองก็แข่งได้อีกชั้น)
 * ⚠️ พังตั้งแต่งวดแรก = ยังไม่มีอะไรลงฐาน ⇒ **โยน error เดิม** ให้ผู้เรียกแปลแบบเขียนงวดเดียว (0389 ยังไม่รัน · รหัสของฐาน)
 * @param rows     งวดสดทั้งใบ (ตัวล็อก updatedAt มาจากชุดนี้)
 * @param planned  แถวของ `billingFillCheck().rows` (id · seq · billingDate · dueDate · keptDue)
 * @returns `{ before, after, stopped }` — before/after = **เฉพาะงวดที่เขียนจริง** (ป้อน audit ตรง ๆ) ·
 *   `stopped` = null (ครบ) | `{ seq, error }` (`error` null = แถวเปลี่ยนไปแล้ว · ไม่ null = ฐานตีกลับ)
 */
export async function writeBillingFill(supabase, rows, planned) {
  const byId = new Map((rows || []).map((row) => [row.id, row]));
  const before = [];
  const after = [];
  for (const plan of planned || []) {
    const row = byId.get(plan.id);
    if (!row) return { before, after, stopped: { seq: plan.seq, error: null } };
    let updated;
    try {
      updated = await updateInstallment(supabase, row.id, billingFillPatch(plan), { expectedUpdatedAt: row.updatedAt });
    } catch (error) {
      if (!after.length) throw error;
      return { before, after, stopped: { seq: plan.seq, error } };
    }
    if (!updated) return { before, after, stopped: { seq: plan.seq, error: null } };
    before.push(row);
    after.push(updated);
  }
  return { before, after, stopped: null };
}

export async function loadInstallment(supabase, id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * ปรับแผนงวดของใบที่อนุมัติแล้ว (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติ D1) — ทางเขียนทางเดียว
 *
 * ⭐ RPC `replan_sales_order_installments` ตรวจทุกด่านในทรานแซกชันเดียว (สิทธิ์ · สถานะใบ · บัญชียังไม่ปิด · เหตุผล ·
 *   p_expected ครบทุกแถว · แถวล็อกไม่เปลี่ยน · Σ = ยอดใบ) แล้วเขียนเฉพาะตารางงวด — **ไม่แตะตัวใบ** ⇒ Actual ไม่ขยับ
 * 🛑 ห้ามถอยไปเขียนงวดทีละแถวเองเมื่อ RPC ไม่มี — ข้ามด่านทั้งชุด · ไม่มี = 503 ให้ไปรัน 0377
 * ⭐ วันวางบิล/รอเหตุการณ์ (mig 0389) **ไม่ได้แก้ RPC ให้รู้จักโดยตั้งใจ** — ④ UPDATE ของแกน 0377 เอ่ยเฉพาะคอลัมน์เดิม
 *   ⇒ งวดเปิดที่ถูกปรับยอด/ย้ายเลขงวด **คงวันวางบิลเดิม** · งวดใหม่จาก ⑤ INSERT ยังไม่มีวันวางบิล (SA เลือกรอบต่อที่แผง
 *   หรือกด "เติมตามรอบ") · แก้ RPC จากไฟล์เมื่อไร = ย้อนสิทธิ์ที่ 0382/0385 ปะไว้ในฐาน (installmentReplanMigration.test.mjs)
 * ⚠️ supabase ไม่ throw ⇒ อ่าน `error` เอง · รหัสของ RPC แปลเป็นไทยผ่าน `documentWorkflowError` (ตารางกลาง)
 * @param rows      ชุดสุดท้ายทั้งใบจาก `buildReplanRows().rows` (บาท · เลขงวด · สัดส่วน คำนวณแล้ว)
 * @param expected  `[{ id, updatedAt }]` ของทุกแถวที่ตาเห็นตอนเปิดตัวแก้ (สตริงจาก API ห้ามแปลงรูปเวลา)
 * @returns `{ before, after }` (แถวทั้งใบก่อน/หลัง สำหรับ audit) หรือ `{ error, status }`
 */
export async function replanInstallments(supabase, { orderId, rows, expected, reason, user }) {
  const { data, error } = await supabase.rpc('replan_sales_order_installments', {
    p_order_id: orderId,
    p_rows: rows,
    p_expected: expected,
    p_reason: reason,
    p_actor_id: user?.id ?? null,
    p_actor_name: user?.name || user?.email || null,
    p_actor_role: user?.role ?? null,
  });
  if (error) {
    if (error.code === 'PGRST202') return { error: INSTALLMENT_REPLAN_SCHEMA_MISSING, status: 503 };
    const mapped = documentWorkflowError(error, { context: `installment replan ${orderId}` });
    return { error: mapped.message, status: mapped.status };
  }
  return {
    before: Array.isArray(data?.before) ? data.before : [],
    after: Array.isArray(data?.after) ? data.after : [],
  };
}


/* ══ PR3 · เงินค้างจากใบที่ยกเลิก (mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ══════════════════ */

/**
 * ยกเงินค้างจากใบที่ยกเลิกเข้าใบใหม่ของดีลเดียวกัน — ทางเขียนทางเดียว (RPC `carry_sales_order_installments` ของ 0378)
 * ⭐ RPC ตรวจทุกด่านในทรานแซกชันเดียว (สิทธิ์ · ต้นทางยกเลิก/ปลายทางอนุมัติ · ดีลเดียวกัน · บัญชียังไม่ปิด · แถวเป็นเงินค้าง ·
 *   p_expected ครบ · ยกเกิน) แล้วย้ายแถวเดิม + เขียนแผนที่เหลือผ่านแกน 0377 — **ไม่แตะตัวใบ** ⇒ Actual ไม่ขยับ
 * 🛑 ห้ามถอยไปย้ายแถวเองเมื่อ RPC ไม่มี — ข้ามด่านทั้งชุด · ไม่มี = 503 ให้ไปรัน 0378
 * @param rows ชุดสุดท้ายทั้งใบของใบปลายทางจาก `applyCarryIn().rows`
 * @returns `{ before, after, carried }` หรือ `{ error, status }`
 */
export async function carryInstallments(supabase, { sourceId, targetId, ids, rows, expected, reason, user }) {
  const { data, error } = await supabase.rpc('carry_sales_order_installments', {
    p_source_order_id: sourceId,
    p_target_order_id: targetId,
    p_installment_ids: ids,
    p_target_rows: rows,
    p_expected: expected,
    p_reason: reason,
    p_actor_id: user?.id ?? null,
    p_actor_name: user?.name || user?.email || null,
    p_actor_role: user?.role ?? null,
  });
  if (error) {
    if (error.code === 'PGRST202') return { error: INSTALLMENT_CARRY_SCHEMA_MISSING, status: 503 };
    const mapped = documentWorkflowError(error, { context: `installment carry ${sourceId} → ${targetId}` });
    return { error: mapped.message, status: mapped.status };
  }
  return {
    before: Array.isArray(data?.before) ? data.before : [],
    after: Array.isArray(data?.after) ? data.after : [],
    carried: data?.carried && typeof data.carried === 'object' ? data.carried : null,
  };
}

/**
 * แถวงวด (ที่ไหนก็ได้) ที่ movedFrom อ้างใบนี้ — ด่านกู้คืน/ลบถาวร และลิงก์ "ยกไป …" บนใบที่ยกเลิก
 * ⭐ ถามด้วย `@>` (ดัชนี GIN ของ 0378) · ⚠️ ต้องส่ง **สตริง JSON** — `.contains()` ของ supabase-js รับ JS array
 *   แล้วต่อเป็นรูป `{a,b}` (array ของ Postgres · ผิดรูปสำหรับ jsonb) ⇒ ใช้ `.filter(col, 'cs', JSON.stringify([...]))`
 * ⚠️ อ่านพลาด = โยน (supabase ไม่ throw เอง) — ด่านที่ถามต้องหยุด ไม่ใช่ถือว่า "ไม่มีเงินย้ายออก"
 * @param reason 'carry' | 'revision' | null (ทุกการย้าย)
 * @returns `[{ id, salesOrderId, orderNumber (ใบที่ถืองวดอยู่ตอนนี้), seq, label, amount, status, reason, movedAt }]`
 */
export async function loadMovedOut(supabase, orderId, { reason = null } = {}) {
  const needle = JSON.stringify([{ salesOrderId: orderId, ...(reason ? { reason } : {}) }]);
  const { data, error } = await fetchAllResult(() => supabase.from(TABLE)
    .select('id, "salesOrderId", seq, label, amount, status, "movedFrom"')
    .filter('movedFrom', 'cs', needle)
    .order('id', { ascending: true }));
  if (error) throw error;
  const rows = (data || []).filter((r) => r && r.salesOrderId !== orderId);
  if (!rows.length) return [];
  const { data: holders, error: holderError } = await fetchInChunks(
    rows.map((r) => r.salesOrderId),
    (chunk) => fetchAllResult(() => supabase.from('sales_orders').select('id, "orderNumber"').in('id', chunk)
      .order('id', { ascending: true })),
  );
  if (holderError) throw holderError;
  const numberOf = new Map((holders || []).map((o) => [o.id, o.orderNumber]));
  return rows.map((r) => {
    const entry = [...(Array.isArray(r.movedFrom) ? r.movedFrom : [])].reverse()
      .find((m) => m && m.salesOrderId === orderId && (!reason || m.reason === reason)) || {};
    return {
      id: r.id,
      salesOrderId: r.salesOrderId,
      orderNumber: numberOf.get(r.salesOrderId) || '',
      seq: r.seq,
      label: r.label,
      amount: Number(r.amount) || 0,
      status: r.status,
      reason: entry.reason || null,
      movedAt: entry.movedAt || null,
    };
  });
}

/**
 * แถวงวดที่ย้ายไปจาก **ใบชุดหนึ่ง** และยังอยู่กับใบนอกชุดนั้น — ด่านลบใบเสนอราคา (ลบใบสั่งขายลูกทุกใบพร้อมกัน)
 * ⭐ งวดที่ใบลูกอีกใบของชุดถืออยู่ (สายโซ่ Rev. ของใบเสนอราคาเดียวกัน) หายไปพร้อมกันอยู่แล้ว — ไม่นับ
 *   (ไม่งั้นใบเสนอราคาที่มี Rev. ลบไม่ได้ตลอดกาล) · แถวเดียวอ้างหลายใบของชุดได้ (ย้ายต่อกัน) ⇒ ไม่ซ้ำแถว
 * ⚠️ อ่านพลาด = โยน (loadMovedOut) — ด่านลบต้องหยุด ไม่ใช่ถือว่าไม่มีงวดย้ายออก
 * 🐞 review qt-force-delete-bypasses-movedout: เดิมด่านนี้มีแต่ DELETE ของใบสั่งขาย ⇒ บังคับลบใบเสนอราคาต้นทาง = force_delete_sales_order
 *   ของใบลูก + purgePrivateEvidence กวาดโฟลเดอร์ใบลูกและ order-confirmation ใต้ใบเสนอราคา ⇒ หลักฐานของเงินที่ยกไปใบอื่นหาย
 */
export async function loadMovedOutOfOrders(supabase, orderIds = []) {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : []).filter(Boolean))];
  const doomed = new Set(ids);
  const byId = new Map();
  for (const id of ids) {
    for (const m of await loadMovedOut(supabase, id)) {
      if (!doomed.has(m.salesOrderId) && !byId.has(m.id)) byId.set(m.id, m);
    }
  }
  return [...byId.values()];
}

/**
 * ใบที่ยกเลิกของดีลเดียวกันที่มีเงินค้าง — ตัวเลือกต้นทางของปุ่ม "ยกเงินจากใบที่ยกเลิก" + คำเตือนในโมดัลอนุมัติ
 * ⚠️ งวดอ่านด้วย `select('*')` **ห้ามเอ่ยชื่อคอลัมน์คืนเงิน** — ก่อนรัน 0378 ไม่มีคอลัมน์ ⇒ query พัง = ปุ่มหายทั้งระบบ
 *   (ตัวตัดสิน "ยังไม่คืน" อ่าน undefined เป็นยังไม่คืนอยู่แล้ว) · กรองสถานะที่มีเงินที่ query แล้วกรองซ้ำที่ lib
 * ⚠️ อ่านพลาด = โยน — ผู้เรียก (หน้าใบ) จับแล้วบอกบนจอ ไม่กลืนเป็น "ไม่มีเงินค้าง"
 */
export async function loadCarrySources(supabase, order) {
  if (!order?.dealId) return [];
  /* ใบย้อนหลังไม่เป็นต้นทาง (RPC 0378 รับเฉพาะใบ pipeline) — กรองที่ query ด้วยตัวกลาง (literal ของ origin มีบ้านเดียว) */
  const { data: orders, error } = await fetchAllResult(() => pipelineRowsOnly(supabase
    .from('sales_orders')
    .select('id, "orderNumber", "quotationId", "dealId", status, origin, "totalAmount"'))
    .eq('dealId', order.dealId)
    .eq('status', 'cancelled')
    .neq('id', order.id)
    .order('id', { ascending: true }));
  if (error) throw error;
  if (!orders?.length) return [];
  const { data: rows, error: rowError } = await fetchInChunks(orders.map((o) => o.id), (chunk) => fetchAllResult(() => supabase
    .from(TABLE).select('*').in('salesOrderId', chunk).in('status', ['confirmed', 'reported'])
    .order('id', { ascending: true })));
  if (rowError) throw rowError;
  return carrySourcesFrom(orders, rows || []);
}

/* ด่านลำดับ deploy ของ PR3 — บันทึกคืนเงินเขียนคอลัมน์ของ 0378 · ยังไม่รัน = PostgREST ตอบ PGRST204 (ไม่รู้จักคอลัมน์)
   ⇒ บอกให้รันมิก ไม่ใช่ 500 ดิบ · ⚠️ error อย่างอื่นห้ามโทษ migration (คนจะไปรันซ้ำผิดเรื่อง) */
export const INSTALLMENT_REFUND_SCHEMA_MISSING = 'ฐานยังไม่ได้รัน 0378 (บันทึกคืนเงินของงวด) — แจ้งผู้ดูแลระบบ';

export function installmentRefundSchemaError(error) {
  if (!error) return null;
  return error.code === 'PGRST204' || error.code === '42703' ? INSTALLMENT_REFUND_SCHEMA_MISSING : null;
}

/* ด่านลำดับ deploy ของกำหนดวางบิล (mig 0389 — เจ้าของรันเองใน SQL Editor) — โค้ดขึ้น prod ก่อนมิกได้ (deploy อัตโนมัติ
   วันละ 3 รอบ) ⇒ เขียน `billingDate`/`billingEvent` ก่อนมีคอลัมน์ = PGRST204 ⇒ บอกให้รันมิก ไม่ใช่ 500 ดิบ
   ⚠️ ต้องถามตัวนี้ **ก่อน** `installmentRefundSchemaError` — ตัวนั้นเหมารหัสเดียวกันทุกคอลัมน์ว่าเป็น 0378 (คนจะไปรันผิดมิก)
   ⚠️ ตัดสินจากชื่อคอลัมน์ในข้อความด้วย — รหัสเดียวกันของคอลัมน์อื่นไม่ใช่เรื่องของ 0389 */
export const INSTALLMENT_BILLING_SCHEMA_MISSING = 'ฐานยังไม่ได้รัน 0389 (วันวางบิลของงวด) — ตอนนี้บันทึกได้เฉพาะกำหนดชำระ'
  + ' · แจ้งผู้ดูแลระบบ';

export function installmentBillingSchemaError(error) {
  if (!error || !(error.code === 'PGRST204' || error.code === '42703')) return null;
  return /billing(Date|Event|Rule)/.test(String(error.message || '')) ? INSTALLMENT_BILLING_SCHEMA_MISSING : null;
}
