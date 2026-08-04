// ── เลขที่คำร้อง — ของกลาง ────────────────────────────────────────────────
// ออกตอนกดส่งเท่านั้น (ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง — บทเรียนใบขอราคาผลิต)
//
// scope มาจากหัวข้อ (requestDocScope) ไม่ใช่จากฝ่ายล้วน — ดู lib/master/requestTypes.js
import { businessMonthKey } from '@/lib/businessDate';
import { requestDocScope } from '@/lib/master/requestTypes';

export async function generateRequestDocNo(supabase, kind, dept, now = new Date()) {
  const scope = requestDocScope(kind, dept);
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: scope, p_month: month });
  if (error) throw new Error(`ออกเลขที่คำร้องไม่สำเร็จ: ${error.message}`);
  return `${scope}-${month}${String(data).padStart(4, '0')}`;
}
