// ── ล็อกเอกสารแทนสัญญาของใบสั่งขายย้อนหลัง — ฝั่ง server (มติ 22/09/2026 · mig 0374) ──────────
//
// ⭐ ตัวตัดสินอยู่ที่ `contracts.js` (`historicalContractLockReason` · `historicalContractFilesFrozen`) ซึ่งจอ
//   ใช้ร่วม · ไฟล์นี้แค่ **หาใบสั่งขายที่ใบสัญญาชี้กลับ** มาป้อนให้มัน แล้วแปลผลเป็นคำตอบของ route
// ⭐ ล็อกคิดจากใบสั่งขายที่ยังมีชีวิต ไม่ใช่จาก metadata ล้วน — ใบสั่งขายหาย/ยกเลิก = ไม่ล็อก (ใบกำพร้าไม่ติดค้าง)
// ⚠️ **อ่านไม่สำเร็จ = หยุดที่ 500 ไม่ใช่ถือว่าไม่ล็อก** — supabase ไม่ throw ⇒ อ่าน error เอง
//    กลืน error แล้วคืน null = เปิดประตูให้แก้/ลบ/อนุมัติใบที่ต้องอนุมัติพร้อมใบสั่งขาย
// ⚠️ ใบที่ไม่มี `metadata.historicalSalesOrderId` (สัญญาทั่วไปทุกใบ) ไม่แตะฐานเลย — route ของสัญญา/ไฟล์แนบ
//    ยิงทุกครั้งที่มีคนกด คิวรีเพิ่มต้องเกิดเฉพาะใบที่เกี่ยวจริง
// ⚠️ ไม่มี literal 'historical' ในไฟล์นี้ (บ้านเดียวคือ historicalOrders.js — historicalMoneyGuards ตรวจ)
import {
  HISTORICAL_CONTRACT_FILES_FROZEN_MESSAGE,
  historicalContractFilesFrozen,
  historicalContractLockReason,
  isSubstituteContract,
} from '@/lib/sales/contracts';

/**
 * ใบสั่งขายย้อนหลังที่เอกสารแทนสัญญาใบนี้ชี้กลับ
 *
 * @returns {Promise<{ order: object|null, error: object|null }>} `order: null` เมื่อใบไม่ใช่เอกสารแทนสัญญา
 *   หรือใบสั่งขายไม่มีแล้ว · ผู้เรียกต้องดู `error` ก่อนเสมอ
 */
export async function loadLinkedHistoricalOrder(supabase, contract) {
  if (!isSubstituteContract(contract)) return { order: null, error: null };
  // by-id แถวเดียว — ไม่ใช่ตัวอ่านยอด (ไม่ select ยอด/สถานะอนุมัติเป็นตัวกรอง)
  const { data, error } = await supabase
    .from('sales_orders')
    .select('id, "orderNumber", status, origin')
    .eq('id', contract.metadata.historicalSalesOrderId)
    .maybeSingle();
  if (error) return { order: null, error };
  return { order: data || null, error: null };
}

/** ด่านแก้/ลบ/ยกเลิก/อนุมัติ ใบสัญญา — คืน `{ message, status }` เมื่อไม่ผ่าน หรือ null */
export async function historicalContractLockGate(supabase, contract) {
  const { order, error } = await loadLinkedHistoricalOrder(supabase, contract);
  if (error) return { message: `ตรวจใบสั่งขายย้อนหลังของเอกสารแทนสัญญาไม่สำเร็จ — ${error.message}`, status: 500 };
  const reason = historicalContractLockReason(contract, order);
  return reason ? { message: reason, status: 409 } : null;
}

/** ด่านแนบ/ลบ/แก้ไฟล์ของใบสัญญา — ล็อกเฉพาะช่วงรอ AE Sup อนุมัติ · คืน `{ message, status }` หรือ null */
export async function historicalContractFilesFrozenGate(supabase, contract) {
  const { order, error } = await loadLinkedHistoricalOrder(supabase, contract);
  if (error) return { message: `ตรวจใบสั่งขายย้อนหลังของเอกสารแทนสัญญาไม่สำเร็จ — ${error.message}`, status: 500 };
  return historicalContractFilesFrozen(contract, order)
    ? { message: HISTORICAL_CONTRACT_FILES_FROZEN_MESSAGE, status: 409 }
    : null;
}
