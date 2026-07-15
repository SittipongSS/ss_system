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
