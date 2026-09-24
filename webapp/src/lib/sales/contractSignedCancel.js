// ── ยกเลิกสัญญาที่ลงนามแล้ว — ตัวโหลดฝั่ง server (มติเจ้าของ 24/09/2026) ──────────────────────────
//
// ⭐ ตัวตัดสินอยู่ที่ `contracts.js` (`signedCancelError` · `signedCancelEffects`) ซึ่งจอใช้ร่วม · ไฟล์นี้แค่
//   **หาของที่การยกเลิกไปกระทบ** (ใบสั่งขายที่ผูก · บันทึกเพิ่มเติมที่ยังไม่ยกเลิก) ให้โมดัลกับ route ใช้ชุดเดียวกัน
// ⚠️ **อ่านไม่สำเร็จ = คืน error ไม่ใช่ลิสต์ว่าง** — supabase ไม่ throw ⇒ อ่านเอง · ลิสต์ว่างแปลว่า "ไม่มีใบสั่งขาย
//    ได้รับผล" ซึ่งโมดัลพิมพ์เป็นข้อเท็จจริง ⇒ กลืน error = โมดัลโกหกคนกดในเรื่องที่ย้อนไม่ได้
// ⚠️ ไม่มี literal 'historical' ในไฟล์นี้ (บ้านเดียวคือ historicalOrders.js)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { canApproveExternalContract } from '@/lib/sales/contracts';

/* ใบที่ไม่นับว่า "ผูกอยู่" — ใบยกเลิก และใบที่ถูก Rev. แทน
   🪤 RPC ออก Rev. ของใบสั่งขาย (0340 · 0343 · 0346 · 0363) ยก `serviceContractId` ไปใบใหม่ ⇒ ใบเก่าที่ถูกแทน
      ยังชี้สัญญาเดิมอยู่ · นับด้วย = ตัวเลขในโมดัล/audit บวมด้วยใบที่ตายแล้ว */
export const LINKED_SERVICE_ORDER_DEAD_STATUSES = Object.freeze(['cancelled', 'revised']);

/**
 * ใบสั่งขายที่ยังผูกสัญญาใบนี้อยู่ (ด่านเข้าไซต์ของนัดใต้ใบเหล่านี้จะติดตั้งแต่วันยกเลิก)
 * @returns {Promise<{ orders: object[]|null, error: object|null }>}
 */
export async function loadLinkedServiceOrders(supabase, contractId) {
  // ไล่หน้า — ตารางใบสั่งขายอยู่ในทะเบียน check:rowcap (สัญญาใบเดียวผูกหลายใบได้ แต่ไม่ถึงพัน · ห่อไว้ตามกติกา)
  const { data, error } = await fetchAllResult(() => supabase.from('sales_orders')
    .select('id, "orderNumber", status')
    .eq('serviceContractId', contractId)
    .not('status', 'in', `(${LINKED_SERVICE_ORDER_DEAD_STATUSES.join(',')})`)
    .order('id', { ascending: true }));
  if (error) return { orders: null, error };
  return { orders: data || [], error: null };
}

/** จำนวนบันทึกเพิ่มเติมที่ยังไม่ยกเลิก — จะถูกยกเลิกตามสัญญาแม่ (นับอย่างเดียว ไม่คืนแถว) */
export async function countLiveAddenda(supabase, contractId) {
  const { count, error } = await supabase.from('sales_contract_addenda')
    .select('id', { count: 'exact', head: true })
    .eq('contractId', contractId)
    .neq('status', 'cancelled');
  if (error) return { count: null, error };
  return { count: count || 0, error: null };
}

/**
 * บริบทของโมดัล "ยกเลิกสัญญาที่ลงนามแล้ว" ที่ GET ของหน้าสัญญาแนบมา
 * ⚠️ ยิงฐานเฉพาะใบที่ลงนามแล้ว **และ** คนดูเป็นผู้อนุมัติ — คนอื่นไม่มีปุ่มนี้ (กติกา "ไม่มีสิทธิ์ = ไม่โชว์")
 *    หน้าสัญญาเปิดบ่อย ⇒ คิวรีเพิ่มต้องเกิดเฉพาะตอนที่ปุ่มจะโผล่จริง
 * @returns {Promise<{ context: { linkedServiceOrders: object[], liveAddenda: number } | null, error: object|null }>}
 */
export async function loadSignedCancelContext(supabase, contract, user) {
  if (contract?.status !== 'signed' || !canApproveExternalContract(user)) return { context: null, error: null };
  const [orders, addenda] = await Promise.all([
    loadLinkedServiceOrders(supabase, contract.id),
    countLiveAddenda(supabase, contract.id),
  ]);
  const error = orders.error || addenda.error;
  if (error) return { context: null, error };
  return { context: { linkedServiceOrders: orders.orders, liveAddenda: addenda.count }, error: null };
}
