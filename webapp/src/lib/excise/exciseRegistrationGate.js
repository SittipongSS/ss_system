// ── ด่านทะเบียนของ SO ค่าสรรพสามิต (มติเจ้าของ 04/11 · แผนรื้อสรรพสามิต V32) ─────────────────────────────────────
//
// เจ้าของ: "การยื่นชำระสรรพสามิต ไม่ต้องติดด่านขึ้นทะเบียนหรอ ทำใบออกใบเสนอราคาได้ SO Actual ไปถึง RA ได้"
//   ⇒ เลือก "ตอน SA ยื่นอนุมัติ SO ค่าสรรพสามิต": ออกใบเสนอราคาค่าสรรพสามิตได้เหมือนเดิม (Q3 — เตือน) แต่ SO ค่าสรรพสามิต
//      **ยื่นอนุมัติ/อนุมัติไม่ได้** จนกว่าทุก FG มีทะเบียนที่ฝ่าย RA อนุมัติแล้ว ⇒ งานถึง RA เฉพาะงานที่ยื่นกรมได้จริง
//   🐞 ที่มา (ข้อมูลจริง 04/11): SO-26080009-0 ถึง RA โดยไม่มีทะเบียนเลยทั้ง 3 รายการ · SO-26080010-0 ขาด 3 จาก 6 —
//      ลูกค้าจ่ายค่าภาษีแล้ว แต่ RA กด "เริ่มยื่น" ไม่ได้ (ด่าน V4 ที่ RA ยังอยู่ — ใบที่อนุมัติไปก่อนมติข้อนี้ยังกันที่นั่น)
// ⭐ ตัวตัดสินเดียวกับด่านเริ่มยื่นของ RA: บรรทัดค่าสรรพสามิต → บรรทัด SO ลูกค้า (`exciseOrderFilingLines`) → ทะเบียนที่อนุมัติ
//    ณ ตอนนี้ของนิติบุคคลเดียวกัน (`resolveSalesOrderFiling` — เฉพาะ status approved)
import { resolveSalesOrderFiling } from '@/lib/excise/soFilingItems';
import { exciseOrderFilingLines } from '@/lib/excise/raFilingRules';
import { REGISTRATION_GAP_TEXT } from '@/lib/excise/soFiling';

/** บรรทัดที่ยังไม่มีทะเบียนอนุมัติ → ข้อความของด่าน · ครบ = null */
export function exciseRegistrationBlocker(filingLines = []) {
  const missing = (filingLines || []).filter((line) => line?.needsRegistration);
  if (!missing.length) return null;
  const detail = missing
    .map((line) => `${line.fgCode || line.description || 'รายการ'} (${REGISTRATION_GAP_TEXT[line.registrationState] || REGISTRATION_GAP_TEXT.none})`)
    .join(' · ');
  return `ทะเบียนสรรพสามิตยังไม่อนุมัติ ${missing.length} รายการ — ใบค่าสรรพสามิตยื่นอนุมัติได้เมื่อทุก FG มีทะเบียนที่ฝ่าย RA อนุมัติแล้ว`
    + ` (ฝ่าย RA ยื่นกรมไม่ได้ถ้าไม่มีทะเบียน): ${detail}`;
}

/**
 * ด่านของ SO ค่าสรรพสามิตหนึ่งใบ (ต้องมี `lines` · `sourceSalesOrderId`) — ข้อความ หรือ null · อ่านพลาด = throw (ห้ามเดาว่าผ่าน)
 * @param resolve ตัวคิดบรรทัดของ SO ลูกค้า (ส่งตัวจำลองในเทสต์)
 */
export async function loadExciseRegistrationBlocker(supabase, exciseOrder, { resolve = resolveSalesOrderFiling } = {}) {
  if (!exciseOrder?.sourceSalesOrderId) throw new Error('ใบค่าสรรพสามิตไม่มีใบสั่งขายต้นทาง — ตรวจทะเบียนไม่ได้');
  const { data: source, error } = await supabase.from('sales_orders')
    .select('*, lines:sales_order_lines(*)').eq('id', exciseOrder.sourceSalesOrderId).maybeSingle();
  if (error) throw new Error(`อ่านใบสั่งขายต้นทางไม่สำเร็จ: ${error.message}`);
  if (!source) throw new Error('ไม่พบใบสั่งขายต้นทางของใบค่าสรรพสามิต — ตรวจทะเบียนไม่ได้');
  const customer = await resolve(supabase, source);
  const { lines } = exciseOrderFilingLines({ exciseLines: exciseOrder.lines || [], customerLines: customer.lines || [] });
  return exciseRegistrationBlocker(lines);
}
