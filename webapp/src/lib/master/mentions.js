// ── กล่าวถึงคน (@mention) ในเธรดอัปเดต ───────────────────────────────────
//
// เก็บเป็น **user id ใน `meta.mentions`** ไม่ใช่ตีความจากข้อความ — ชื่อคนไทยมี
// ช่องว่าง ("สมชาย ขายดี") การ parse `@ชื่อ` จากข้อความดิบจึงเดาขอบเขตไม่ได้
// ตัวเลือกในกล่องพิมพ์เป็นคนบอกว่า "@นี่คือใคร" ตั้งแต่ตอนพิมพ์
//
// 🔴 **กติกาข้อสำคัญที่สุด: mention ได้เฉพาะคนที่เปิดเธรดนี้ได้จริง** — ถ้า @คนที่
// ไม่มีสิทธิ์ เขาจะได้แจ้งเตือนที่กดแล้วเจอ 404 (และรู้ว่ามีเอกสารนี้อยู่ ทั้งที่
// ไม่ควรรู้) · ด่านอยู่ที่ server เสมอ ไม่ใช่แค่กรองรายชื่อใน dropdown
import { loadUserDirectory } from '@/lib/usersRepo';
import { canViewUpdates } from '@/lib/master/updateAccess';

// เผื่อคนพิมพ์ยาว ๆ แล้วแท็กทั้งฝ่าย — เกินนี้คือประกาศ ควรใช้ Chat webhook แทน
export const MAX_MENTIONS = 10;

// ใครบ้างที่ mention ได้ในเธรดนี้ — คืน [{ id, name, role, team, department }]
//
// ⚠️ เช็คทีละคนด้วยทะเบียนสิทธิ์ตัวเดียวกับ GET /api/updates (ห้ามเขียนกฎใหม่)
// · `parent` โหลดมาแล้วครั้งเดียวจากผู้เรียก จึงไม่ได้ query ซ้ำต่อคน
export async function mentionableUsers(supabase, entityType, parent) {
  if (!parent) return [];
  const dir = await loadUserDirectory(supabase);
  const people = [...dir.values()].filter((u) => !u.disabled);
  const allowed = await Promise.all(
    people.map((u) => canViewUpdates(supabase, entityType, parent, u).catch(() => false)),
  );
  return people
    .filter((_, i) => allowed[i])
    .map(({ id, name, role, team, department }) => ({ id, name, role, team, department }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
}

// กรอง id ที่ client ส่งมาให้เหลือเฉพาะคนที่ mention ได้จริง — คืน [{ id, name }]
//
// ⚠️ คืนเฉพาะที่ผ่านด่าน ไม่ throw: mention ผิดคนไม่ควรทำให้ทั้งข้อความโพสต์ไม่ได้
// แค่ไม่ต้องได้รับแจ้งเตือน
// ⭐ เก็บ **ชื่อ ณ ตอนพิมพ์** มาด้วย เพราะข้อความที่บันทึกไว้เขียนว่า "@สมชาย ขายดี"
// ถ้าเขาเปลี่ยนชื่อทีหลัง ตัวไฮไลต์ต้องยังจับคู่กับข้อความเดิมได้
export async function sanitizeMentions(supabase, entityType, parent, input) {
  const ids = [...new Set((Array.isArray(input) ? input : [])
    .map((v) => String(v ?? '').trim())
    .filter(Boolean))].slice(0, MAX_MENTIONS);
  if (!ids.length || !parent) return [];
  const byId = new Map((await mentionableUsers(supabase, entityType, parent)).map((u) => [u.id, u]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id).name || '' }));
}

// id ที่ถูก mention ในแถวหนึ่ง (ใช้ตอน fan-out แจ้งเตือน)
export function mentionIdsOf(row) {
  const list = row?.meta?.mentions;
  return Array.isArray(list) ? list.map((v) => String(v)).filter(Boolean) : [];
}
