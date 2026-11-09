// ── ด่านทะเบียนของ SO ค่าสรรพสามิต (มติเจ้าของ 04/11 · แผนรื้อสรรพสามิต V32) ─────────────────────────────────────
//
// เจ้าของ: "การยื่นชำระสรรพสามิต ไม่ต้องติดด่านขึ้นทะเบียนหรอ ทำใบออกใบเสนอราคาได้ SO Actual ไปถึง RA ได้"
//   ⇒ เลือก "ตอน SA ยื่นอนุมัติ SO ค่าสรรพสามิต": ออกใบเสนอราคาค่าสรรพสามิตได้เหมือนเดิม (Q3 — เตือน) แต่ SO ค่าสรรพสามิต
//      **ยื่นอนุมัติ/อนุมัติไม่ได้** จนกว่าทุก FG มีทะเบียนที่ฝ่าย RA อนุมัติแล้ว ⇒ งานถึง RA เฉพาะงานที่ยื่นกรมได้จริง
//   🐞 ที่มา (ข้อมูลจริง 04/11): SO-26080009-0 ถึง RA โดยไม่มีทะเบียนเลยทั้ง 3 รายการ · SO-26080010-0 ขาด 3 จาก 6 —
//      ลูกค้าจ่ายค่าภาษีแล้ว แต่ RA กด "เริ่มยื่น" ไม่ได้ (ด่าน V4 ที่ RA ยังอยู่ — ใบที่อนุมัติไปก่อนมติข้อนี้ยังกันที่นั่น)
// ⭐ ตัวคิดบรรทัดเดียวกับด่านเริ่มยื่นของ RA: บรรทัดค่าสรรพสามิต → บรรทัด SO ลูกค้า (`exciseOrderFilingLines`) → ทะเบียน
//    ณ ตอนนี้ของนิติบุคคลเดียวกัน (`resolveSalesOrderFiling`)
//
// 🔁 ผ่อนด่าน (มติเจ้าของ 09/11 V34): "SO ยื่นอนุมัติ และอนุมัติ ได้ หาก ยื่นขึ้นทะเบียนไป RA แล้ว"
//    ⇒ ผ่าน = ทุก FG มีทะเบียน **อนุมัติแล้ว** หรือ **ยื่นแล้วรอ RA ตรวจ** (`pending_legal` → state `pending`)
//    · ยังกัน: ยังไม่เคยขึ้นทะเบียน (none) · ร่างค้างยังไม่ยื่น (draft) · ถูกตีกลับ (rejected) = งานยังอยู่ที่ SA
//    ⚠️ ด่านเริ่มยื่นของ RA (V4) **ไม่ผ่อน** — RA ยังต้องอนุมัติทะเบียนทุก FG ก่อนกด "เริ่มยื่น" (ใบที่ทะเบียนรอตรวจ
//       ถึงคิว RA ได้ แต่ค้างที่ด่าน V4 จน RA อนุมัติทะเบียน · ทั้งสองงานอยู่ที่ RA คนเดียวกัน)
import { resolveSalesOrderFiling } from '@/lib/excise/soFilingItems';
import { exciseOrderFilingLines } from '@/lib/excise/raFilingRules';
import { REGISTRATION_GAP_TEXT } from '@/lib/excise/soFiling';

/** สถานะทะเบียนที่ SO ค่าสรรพสามิตยื่นอนุมัติ/อนุมัติได้ (V34) — อนุมัติแล้ว หรือยื่นถึง RA แล้วรอตรวจ */
export const SO_GATE_REGISTRATION_STATES = Object.freeze(['approved', 'pending']);

/** บรรทัดที่ทะเบียนยังไม่ถึง RA → ข้อความของด่าน · ครบ = null
 *  `needsRegistration` = ยังไม่มีทะเบียนอนุมัติ · ผ่านได้ถ้าทะเบียนยื่นแล้วรอ RA ตรวจ (`registrationState: 'pending'`) */
export function exciseRegistrationBlocker(filingLines = []) {
  const missing = (filingLines || []).filter((line) => line?.needsRegistration
    && !SO_GATE_REGISTRATION_STATES.includes(line?.registrationState));
  if (!missing.length) return null;
  const detail = missing
    .map((line) => `${line.fgCode || line.description || 'รายการ'} (${REGISTRATION_GAP_TEXT[line.registrationState] || REGISTRATION_GAP_TEXT.none})`)
    .join(' · ');
  return `ทะเบียนสรรพสามิตยังไม่ได้ยื่นฝ่าย RA ${missing.length} รายการ — ใบค่าสรรพสามิตยื่นอนุมัติได้เมื่อทุก FG ยื่นขึ้นทะเบียนไปฝ่าย RA แล้ว`
    + ` (รอ RA ตรวจก็ยื่นได้): ${detail}`;
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
