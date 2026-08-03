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

/**
 * ชื่อที่ควรขึ้นจอ *ตอนนี้* — ยึด id เป็นตัวตน แล้วค่อยถอยไปชื่อที่เก็บไว้ในแถว
 *
 * ⭐ ที่ต้องมี: ชื่อคนถูกคัดลอกลง DB ตอนบันทึก (`ownerName`/`assigneeName`/…) แต่การ
 * เปลี่ยนชื่อผู้ใช้แก้แค่บัญชี auth ไม่ไล่แก้สำเนา — ช่องที่เป็น "สถานะปัจจุบัน"
 * จึงค้างชื่อเก่าไว้ตลอดกาล (ของจริงบน prod: `sales_leads.assigneeName` 64 แถว
 * เก็บชื่อย่อ/ชื่อเก่า · `sales_targets.ownerName` 12 แถว)
 *
 * ⚠️ **ใช้กับช่องที่เป็นสถานะปัจจุบันเท่านั้น** (เจ้าของดีล · ผู้รับผิดชอบลีด ·
 * เจ้าของเป้า) — **ห้ามใช้กับ snapshot ของเหตุการณ์/เอกสารที่ออกไปแล้ว**
 * (`audit_logs` · `attachments.uploadedByName` · `entity_updates.authorName` ·
 * `lead_events` · ใบที่ issue แล้ว · ใบพิมพ์) เพราะตรงนั้น "ชื่อ ณ ตอนนั้น"
 * คือคำตอบที่ถูก ดู [[entity-updates-plan]] §snapshot ≠ กระจก
 *
 * users: array หรือ Map (id → user) ก็ได้ — ฝั่ง client ได้ array จาก
 * assignable-users ส่วนฝั่ง server ได้ Map จาก `loadUserDirectory`
 * ไม่มี id / หาบัญชีไม่เจอ (ลบบัญชีไปแล้ว) → คืนชื่อที่เก็บไว้ ไม่ใช่ค่าว่าง
 */
export function livePersonName(users, id, storedName) {
  const stored = String(storedName || '').trim();
  if (!id) return stored;
  const hit = users instanceof Map ? users.get(id) : (users || []).find((u) => u?.id === id);
  return hit ? (personFullName(hit) || stored) : stored;
}
