import { canAccessRd } from '@/lib/permissions';
import { withUser, ok, fail, unauthorized, forbidden } from '@/lib/http';
import { loadBomBoardRows } from '@/lib/rd/bomBoardStore';

export const dynamic = 'force-dynamic';

// GET /api/rd/bom-board — FG ที่ฝ่ายขายส่งมาให้ลง BOM ทุกสถานะ (mig 0419 · มติเจ้าของ 03/11/2026)
//
// ⚠️ **อ่านอย่างเดียว** — ปุ่มรับเรื่อง/ตีกลับ/ลงเสร็จเขียนผ่าน `POST /api/products/[id]/bom` ซึ่งมีด่านของตัวเอง ·
//    `proxy.js` เปิด `/api/rd` ไว้เฉพาะ GET โดยตั้งใจ
// ⭐ ตัวอ่านอยู่ที่ `lib/rd/bomBoardStore.js` — ตัวเดียวกับไฟล์ Excel (`./export`) · ไฟล์ = ของบนจอทุกช่อง
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  // ด่านเดียวกับเมนู + เส้นเขียนฝั่ง RD — แยกสองที่เมื่อไรก็ได้เมนูที่กดแล้ว 403
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่าย RD');
  try {
    return ok(await loadBomBoardRows(supabase));
  } catch (e) {
    return fail(e?.message || 'อ่านคิวลง BOM ไม่สำเร็จ', 500);
  }
});
