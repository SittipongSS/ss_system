// TTL cache ในหน่วยความจำของ function instance — ลดภาระ Vercel Active CPU และ
// DB/GoTrue (Fluid compute ใช้ instance เดียวรับหลาย request พร้อมกันและอยู่ warm
// ต่อเนื่อง cache ระดับ module จึงได้ hit สูงจริง). ใช้กับข้อมูลที่ "เหมือนกันทุกผู้ใช้
// และแทบไม่เปลี่ยน" เท่านั้น (รายชื่อผู้ใช้/วันหยุด/หมวดสินค้า) — ห้ามใช้กับข้อมูลที่
// scope ตาม user/team.
//
// ข้อจำกัดโดยธรรมชาติ: instance อื่น (หรือ cold start ใหม่) มองไม่เห็นการ invalidate
// ข้าม instance — ของสดช้าสุดเท่ากับ TTL ซึ่งยอมรับได้สำหรับ master data ประเภทนี้.
const store = new Map();

export async function cachedJson(key, ttlMs, loader) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await loader();
  store.set(key, { at: Date.now(), value });
  return value;
}

// ล้าง cache ที่ key ขึ้นต้นด้วย prefix — เรียกจาก write handler ของข้อมูลนั้น
// เพื่อให้ instance เดียวกันเห็นของใหม่ทันที (instance อื่นรอ TTL หมดอายุ)
export function invalidateCache(prefix) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

/* ── ผูก cache เข้ากับ "สแตมป์ของข้อมูล" ไม่ใช่รอ TTL หมดอายุอย่างเดียว ─────────
 *
 * 🐞 **ปัญหาที่แก้ (2026-08-25):** แดชบอร์ดขาย cache ไว้ 5 นาทีและ **ไม่มีใครล้างเลย**
 * ⇒ ปิดดีล Won เสร็จ กด F5 สิบรอบก็ยังเห็นเลขเก่า ต้องรอครบ 5 นาทีเอง
 *
 * ⚠️ **ทำไมไม่ใช้ `invalidateCache` ที่เส้นเขียนแทน** — cache อยู่ต่อ instance
 * (ดูหัวไฟล์) ⇒ เรียกตอนเขียนจะล้างได้แค่ instance ที่รับ write นั้น · instance อื่น
 * ยังตอบของเก่าจนครบ TTL อยู่ดี และ Fluid compute มีหลาย instance พร้อมกัน
 * ⇒ ผู้ใช้ยังเจอ "รีเฟรชสองทีได้เลขสองแบบสลับไปมา" เหมือนเดิม
 *
 * สแตมป์แก้ที่ต้นเหตุ: ทุก instance ถามค่าเดียวกันจาก DB ก่อนตอบ ⇒ ข้อมูลเปลี่ยน
 * เมื่อไร **ทุก instance เห็นพร้อมกัน** และไม่มีเส้นเขียนไหนต้องจำว่าต้องล้าง cache
 */
const stamps = new Map();

/**
 * แจ้งสแตมป์ล่าสุดของข้อมูลกลุ่มหนึ่ง — เปลี่ยนจากเดิม = ล้าง cache ทั้ง prefix ทันที
 * @returns true ถ้าเพิ่งล้าง (ข้อมูลเปลี่ยน) · false ถ้าเหมือนเดิม
 */
export function bumpStamp(prefix, stamp) {
  if (stamp == null) return false;           // อ่านสแตมป์ไม่ได้ = ถอยไปใช้ TTL ตามเดิม
  if (stamps.get(prefix) === stamp) return false;
  invalidateCache(prefix);
  stamps.set(prefix, stamp);
  return true;
}

/** สำหรับเทสต์เท่านั้น — ล้างสแตมป์ที่จำไว้ */
export function resetStamps() {
  stamps.clear();
}
