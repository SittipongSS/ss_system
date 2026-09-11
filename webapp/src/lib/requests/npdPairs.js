// ── คู่ หมวด × กลิ่น ของแถวสินค้าในแบบฟอร์ม PDR (ม-144) ─────────────────────────────────────
//
// ⚠️ **โมดูลใบไม้** — `stages.js` (ด่านปิด/ตราปิด) กับ `npdWorkRows.js` (ตัววางแผนแถวงาน) ใช้ร่วมกัน
//    ห้าม import `stages.js` ที่นี่ (`npdWorkRows.js` import `stages.js` อยู่แล้ว ⇒ วน)
import { requestPdrRowsPickScent, requestUsesDeliveredRows } from '@/lib/master/requestTypes';

export const pairKey = (categoryCode, scentId) => `${String(categoryCode ?? '').trim()}::${String(scentId ?? '').trim()}`;

/** แถวสินค้าใน PDR → คู่ หมวด × กลิ่น ที่ไม่ซ้ำ ตามลำดับที่ปรากฏครั้งแรก (แถวที่ยังไม่เลือกกลิ่นข้าม) */
export function npdTargetPairs(targets = []) {
  const map = new Map();
  for (const t of targets || []) {
    const categoryCode = String(t?.categoryCode ?? '').trim();
    const scentId = String(t?.scentId ?? '').trim();
    if (!categoryCode || !scentId) continue;
    const key = pairKey(categoryCode, scentId);
    if (!map.has(key)) map.set(key, { key, categoryCode, scentId, targets: [] });
    map.get(key).targets.push(t);
  }
  return [...map.values()];
}

/**
 * คู่ในแบบฟอร์มที่ **ยังไม่มีแถวงานถือ** — [] เสมอสำหรับใบที่ไม่ใช่ NPD
 *
 * ⭐ **คู่ที่ไม่มีแถว = งานยังไม่จบ** (รีวิว ม-144 รอบ 4) — ความครบของใบ NPD ต้องคิดจากแบบฟอร์มด้วย ไม่ใช่
 *    แถวอย่างเดียว · 🐞 งอกแถวของคู่ใหม่ไม่สำเร็จ ⇒ แถวที่มีจบครบ ⇒ ตราอัตโนมัติ/ปุ่ม "ตอบแล้ว"/ปิดเรื่อง ผ่านหมด
 *    แล้วใบปิดถาวร (แก้แบบฟอร์มไม่ได้อีก) ทั้งที่สินค้าตัวนั้นไม่เคยมีงาน · ธงชั่วคราวตอนบันทึกแก้ไม่ได้ เพราะ
 *    ตราถูกคิดใหม่จากทางอื่น (ก้าวรายแถว · ราคา · ลบแถว) — คิดตอนอ่านทุกครั้ง ไม่เก็บ (กติกาเดียวกับ `stages.js`)
 * ⚠️ นับทุกแถว product_dev ทุกขั้น รวมรอบแก้ — กติกา "มีแล้ว" ตัวเดียวกับ `planNpdWorkRows`
 * ⚠️ `request.targets` ต้องเป็นชุด **หลังบันทึก** — ผู้เรียกในก้าวบันทึกแบบฟอร์มต้องส่งชุดใหม่เข้ามาเอง
 */
export function npdUncoveredPairs(request, items = []) {
  if (!requestUsesDeliveredRows(request) || !requestPdrRowsPickScent(request)) return [];
  const covered = new Set((items || []).filter((r) => r?.lineKind === 'product_dev')
    .map((r) => pairKey(r.categoryCode, r.scentId)));
  return npdTargetPairs(request?.targets).filter((p) => !covered.has(p.key));
}

/** ข้อความของด่านปิด/ตอบ เมื่อยังมีคู่ที่ไม่มีแถวงาน — หรือ null */
export function npdUncoveredError(request, items = []) {
  const n = npdUncoveredPairs(request, items).length;
  if (!n) return null;
  return `สินค้าในแบบฟอร์ม PDR ${n} รายการยังไม่มีรายการงาน — ${request?.dept || 'ฝ่าย'}`
    + ' กดแก้ไขแล้วบันทึกแบบฟอร์มอีกครั้ง ระบบจะสร้างรายการให้';
}
