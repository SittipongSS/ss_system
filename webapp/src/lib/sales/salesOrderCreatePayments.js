// ── เขียนวันของงวด + เงินงวดแรกจากฟอร์มหน้าสร้างใบสั่งขาย ลงงวดร่างที่เพิ่งเกิด (ฝั่ง server) ──
//
// ผู้เรียกเดียว: POST `/api/sales-planning/sales-orders` หลัง RPC ออกเลขใบ + `ensureInstallments`
// ⭐ แยกออกจาก route.js เพื่อให้เทสต์ไล่ได้ด้วย supabase ปลอม (route import ของ Next ที่ node รันตรงไม่ได้)
//    กติกา "งวดหนึ่งล้มต้องไม่ลากงวดอื่นและเงินงวดแรกล้มตาม" เคยมีแค่ยามอ่านซอร์สคุม (review S4 26/09)
import { loadInstallments, updateInstallment } from './salesOrderInstallmentsStore.js';
import { isOpeningInstallment } from './historicalOrders.js';
import { prepaidDueDate } from './salesOrderPayments.js';

/**
 * วันของงวด (กำหนดชำระ + วันวางบิล/รอเหตุการณ์) + เงินงวดแรกที่กรอกมาจากฟอร์มหน้าสร้าง
 *
 * ⚠️ เขียนหลังงวดเกิดแล้วเท่านั้น (จับคู่ด้วย `seq`) · สถานะไม่ถูกแตะเลย — งวดร่าง
 * ต้องเป็น `pending` ตาม CHECK `sales_order_installments_draft_pending` (0259)
 * `paidOn` + `evidence` บนแถว pending = "งวดร่างที่บันทึกเงินไว้" (installmentPrepaid)
 * ซึ่งจะกลายเป็นคำแจ้งให้บัญชีเองตอนใบอนุมัติ (freezeInstallments)
 *
 * `dates` = ผลของ `parseCreateFormInstallments` (ตรวจแล้วก่อนออกเลขใบ) — `patch` มีเฉพาะช่องที่มีค่า
 * ⚠️ ข้ามงวดยกมา (`isOpeningInstallment`) — ไม่มีวันวางบิล/กำหนดชำระเสมอ (CHECK 0374 + 0389 · มติข้อ 10)
 *    ถามผ่านตัวตัดสินของ historicalOrders.js ไม่เขียนชื่อ kind เอง — ยาม historicalCancelSettleMigration.test.mjs
 *    นับไฟล์ JS ที่เอ่ยชื่อนั้น (ผู้เขียนงวดยกมาต้องมีแค่ใบย้อนหลัง)
 *    ใบที่เพิ่งออกจากใบเสนอราคามีแต่งวดปกติอยู่แล้ว กันไว้ไม่ให้ทางนี้เป็นทางเขียนงวดยกมาในวันหน้า
 * ⚠️ งวดที่ไม่อยู่ในแผน (หน้าค้างจากแผนเก่า) ถูกข้ามแบบเดิม · เขียนล้ม = โยนไปเป็นคำเตือนหลัง 201 ที่ผู้เรียก
 * ⚠️ **วันของงวดหนึ่งล้ม ต้องไม่ลากงวดอื่นและเงินงวดแรกล้มตาม** — จำ error ไว้ เขียนต่อจนจบ แล้วค่อยโยน
 *    (เดิมโยนทันที ⇒ หลักฐานเงินที่อัปแล้วไม่ถูกผูกกับงวด = ไฟล์ลอยค้างและคนต้องแนบใหม่ ทั้งที่ล้มแค่ช่องวันที่)
 */
export async function applyCreateFormPayments(supabase, { orderId, dates, firstPaidOn, firstEvidence }) {
  const rows = await loadInstallments(supabase, orderId);
  if (!rows.length) return;
  const bySeq = new Map(rows.map((row) => [row.seq, row]));

  let dateError = null;
  const written = new Map();
  const failed = new Set();
  for (const { seq, patch } of dates || []) {
    const row = bySeq.get(seq);
    if (!row || isOpeningInstallment(row)) continue;
    try {
      await updateInstallment(supabase, row.id, patch);
      written.set(seq, patch);
    } catch (writeError) {
      console.error('create SO: installment dates failed', orderId, seq, writeError);
      dateError = dateError || writeError;
      failed.add(seq);
    }
  }

  if (firstPaidOn) {
    const first = bySeq.get(1);
    if (first) {
      /* ⭐ กำหนดชำระว่าง = วันที่ลูกค้าจ่าย (`prepaidDueDate` · 17/11 SO-26110445-0) — ตัดสินจากค่าที่ลงฐานจริงแล้ว
         (แถวสด + วันที่เพิ่งเขียนสำเร็จ) · วันของงวด 1 เขียนล้ม = ไม่เติม: คนกรอกวันไว้แล้ว ให้คำเตือนหลัง 201 พาไปแก้
         ไม่เอาวันจ่ายไปกลบ (และการผูกเงินต้องไม่ล้มตามช่องวันที่) */
      const dueDate = failed.has(1) ? null : prepaidDueDate({ ...first, ...(written.get(1) || {}) }, firstPaidOn);
      await updateInstallment(supabase, first.id, {
        paidOn: firstPaidOn,
        evidence: firstEvidence,
        note: first.note || 'ลูกค้าจ่ายมาก่อนออกใบ — บันทึกจากฟอร์มสร้างใบสั่งขาย',
        ...(dueDate ? { dueDate } : {}),
      });
    }
  }
  if (dateError) throw dateError;
}
