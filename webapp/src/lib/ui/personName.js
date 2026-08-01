// ── ชื่อคนบนหน้าจอ ↔ บัญชีผู้ใช้ ─────────────────────────────────────────
// ไฟล์ล้วน (ไม่มี JSX/DOM) เพื่อให้เทสต์เรียกได้ตรง ๆ — `PersonSelect` import ไปใช้
// ต่อ เพื่อให้ "ค่าที่ตัวเลือกเขียนลง DB" กับ "การจับคู่กลับเป็น id" ใช้กฎเดียวกัน

export const personFullName = (u) => String(u?.name || u?.email || '').trim();

/**
 * ชื่อที่ช่องหนึ่ง ๆ เก็บไว้ → id ของบัญชี (null ถ้าจับไม่ได้ หรือชื่อชนกันหลายบัญชี)
 *
 * ⭐ ใช้กับช่องที่เก็บ "ชื่อ" เป็นค่าจริงในฐานข้อมูลแล้วต้องบันทึก id ควบคู่ไว้เป็น
 * ตัวตน (projects.aeOwner + aeOwnerId — mig 0190)
 *
 * ⚠️ ชื่อซ้ำสองบัญชี = คืน null ดีกว่าเดา เพราะค่านี้ไปตัดสินว่าจะแจ้งเตือนใคร
 */
export function personIdByName(users = [], name) {
  const wanted = String(name || '').trim();
  if (!wanted) return null;
  const hits = (users || []).filter((u) => personFullName(u) === wanted);
  return hits.length === 1 ? (hits[0].id ?? null) : null;
}
