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
/**
 * ตัวย่อสำหรับวงกลมแทนรูปคน — "สมชาย ขายดี" → "สข" · "Sittipong Kaenthaw" → "SK"
 *
 * ⚠️ ภาษาไทยไม่มีตัวพิมพ์ใหญ่ จึงตัดอักษรแรกของสองคำแรกตรง ๆ · ชื่อคำเดียวเอา
 * สองอักษรแรก (สระ/วรรณยุกต์ที่ตามมาเป็นอักขระแยกใน JS แต่แสดงซ้อนตัวเดิม
 * จึงไม่กินที่เพิ่ม) · ไม่มีชื่อเลย = จุดเดียว ไม่ใช่วงกลมว่าง
 */
export function personInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function personIdByName(users = [], name) {
  const wanted = String(name || '').trim();
  if (!wanted) return null;
  const hits = (users || []).filter((u) => personFullName(u) === wanted);
  return hits.length === 1 ? (hits[0].id ?? null) : null;
}
