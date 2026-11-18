// ── ป้าย "สิ่งที่ขอ" ของแถวคำร้อง — ตัดส่วนที่ต่อท้ายตอนส่งงานทิ้ง ──
//
// 🐞 **ป้ายเคยถูกต่อ "→ รหัสสูตร" ทุกครั้งที่ส่งสูตร** และรอบแก้ยกป้ายของแถวต้นทางทั้งดุ้น ⇒ ป้ายยาวขึ้นทุกรอบ
//    (prod 2026-09-15: 13 แถวมีลูกศร · 2 แถวมีลูกศรซ้อน "→ PF9010103-P1 → PF9010103-P1") · รหัสที่ต่อไว้คือรหัส
//    **ตอนส่ง** — ทะเบียนเปลี่ยนรหัสทีหลังแล้วแถวเดียวโชว์สองรหัส (ป้ายเก่า "→ 6731108202601" คู่กับค่าสด "PF319010103-P3")
//    · แถวรอบแก้ที่ยังไม่ส่งอะไรเลยก็โชว์ "→ รหัส" ของแถวต้นทาง อ่านเป็นว่าส่งแล้ว
// ⇒ ป้ายคือ "สิ่งที่ขอ" เท่านั้น · สูตรที่ได้อ่านจากทะเบียนสด (`RegistryCell`) · ตัดหางลูกศรตอนอ่านป้ายเก่าที่ค้างในฐาน
//    (ไม่แก้ข้อมูลย้อนหลัง — ป้ายเดิมยังเป็นหลักฐานในฐานว่าตอนนั้นส่งอะไร)

import { scentLabel } from '@/lib/master/registryLabel';

const ARROW = ' → ';

const SEP = ' · ';

/**
 * ป้ายสิ่งที่ขอ — ตัดตั้งแต่ลูกศรตัวแรกทิ้ง
 *
 * ⭐ `categoryCode` (แถวพัฒนาผลิตภัณฑ์) — หมวดสินค้าต้องโชว์ **รหัส + ชื่อ** เสมอ (มติเจ้าของ 18/11/2026)
 *    ป้ายที่เก็บในฐานก่อนวันนั้นมีแต่ชื่อหมวด ("แชมพู · PF… กลิ่น") ⇒ เติมรหัสหน้าชื่อตอนอ่าน
 *    (ไม่แก้ข้อมูลย้อนหลัง · ป้ายที่ขึ้นต้นด้วยรหัสอยู่แล้ว = ไม่แตะ ไม่ซ้อนรหัส)
 */
export function requestedLabel(label, categoryCode = null) {
  const text = String(label ?? '').trim();
  const at = text.indexOf(ARROW);
  const base = at === -1 ? text : text.slice(0, at).trim();
  const code = String(categoryCode ?? '').trim();
  if (!code || !base.includes(SEP) || base.startsWith(code)) return base;
  return `${code} ${base}`;
}

/**
 * ป้ายสิ่งที่ขอของแถวพัฒนาสูตร ประกอบจาก **กลิ่นในทะเบียนสด** — ป้ายเก่าแช่รหัสกลิ่นตอนเปิดใบ (เคยเป็น "-") ·
 * ส่วนหมวดยังมาจากป้าย (ชื่อหมวดไม่ได้อยู่บนแถว) · ไม่มีกลิ่นสดหรือป้ายไม่มีตัวคั่น = ใช้ป้ายที่ตัดหางแล้ว
 */
export function productDevLabel(label, scent = null, categoryCode = null) {
  const base = requestedLabel(label, categoryCode);
  if (!scent?.name) return base || '—';
  const sep = base.indexOf(SEP);
  const typeName = sep === -1 ? '' : base.slice(0, sep).trim();
  // PF · ชื่อ · วันที่ผลิต (มติเจ้าของ 13/11) — รหัสขีดของข้อมูลเก่านับเป็น "ไม่มีรหัส"
  const code = String(scent.code ?? '').trim();
  const scentText = scentLabel({ ...scent, code: code === '-' ? '' : code });
  return typeName ? `${typeName} · ${scentText}` : (base || scentText);
}
