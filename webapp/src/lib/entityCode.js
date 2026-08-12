// รหัสเอนทิตีมาตรฐาน DL-YYMMXXXX (ดีล) / PJ-YYMMXXXX (โครงการ) — mig 0096.
//   YY=ปี ค.ศ. 2 หลัก, MM=เดือน, XXXX=เลขรัน 4 หลัก (atomic ต่อ scope+เดือน).
//   "ฐาน" ที่เก็บใน DB ไม่มี -R; หน้าจอ/เอกสารแสดง base + '-' + revision
//   (revise เริ่ม 0, เพิ่มเมื่อออก Revise — โครงการ; ดีลคง 0 เสมอ). มติผู้ใช้ 2026-07-14.
import { businessMonthKey } from '@/lib/businessDate';

// เดือนคีย์ 'YYMM' ตามปฏิทินไทย (Asia/Bangkok) — ตัวเดียวกับที่ใบเสนอราคา/ใบขอราคา
// ผลิต/เลขที่คำร้องใช้ (businessMonthKey)
//
// ⚠️ ห้ามกลับไปอ่านเดือนจาก Date ตรง ๆ (getMonth/getFullYear) — นั่นคือเดือนตาม
// timezone ของเครื่องที่รัน ซึ่งบน Vercel คือ UTC ⇒ วันที่ 1 ช่วง 00:00–06:59 ตามเวลาไทย
// ดีล/โครงการ/ใบผลิต/งานบริการ/เรื่องแจ้งระบบ จะได้เลขต่อท้าย "เดือนก่อน" ขณะที่
// ใบเสนอราคาที่ออกนาทีเดียวกันขึ้นเดือนใหม่ไปแล้ว — เลขคาบเกี่ยวสองเดือนพร้อมกัน
export function ymKey(now = new Date()) {
  return businessMonthKey(now);
}

// ออกรหัสฐานใหม่ผ่าน RPC atomic (กันเลขซ้ำเมื่อสร้างพร้อมกัน). scope = 'PJ' | 'DL'.
export async function generateEntityCode(supabase, scope, now = new Date()) {
  const month = ymKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: scope, p_month: month });
  if (error) throw new Error(`ออกรหัส ${scope} ไม่สำเร็จ: ${error.message}`);
  return `${scope}-${month}${String(data).padStart(4, '0')}`;
}

// พรีวิวรหัสถัดไป "โดยไม่กินเลข" (สำหรับหน้าฟอร์มโชว์เฉย ๆ — ห้ามใช้ตอน insert จริง
// เพราะไม่ atomic). ตัวจริงตอนสร้างต้องใช้ generateEntityCode (RPC increment).
export async function peekNextEntityCode(supabase, scope, now = new Date()) {
  const month = ymKey(now);
  const { data } = await supabase
    .from('entity_number_counters').select('lastNo').eq('scope', scope).eq('month', month).maybeSingle();
  const next = (data?.lastNo || 0) + 1;
  return `${scope}-${month}${String(next).padStart(4, '0')}`;
}

// แสดงรหัสเต็ม = ฐาน + '-' + revision (revise เริ่ม 0). ไม่มีรหัส → '-'.
export function entityCodeDisplay(baseCode, rev) {
  if (!baseCode) return '-';
  const r = Number.isFinite(Number(rev)) ? Number(rev) : 0;
  return `${baseCode}-${r}`;
}
