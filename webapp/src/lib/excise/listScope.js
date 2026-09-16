// ── ขอบเขตของลิสต์ภาษีสรรพสามิต — ตัวกรองตัวเดียวที่ทุกที่ต้องใช้ ──────────
//
// 🐞 **ที่มา (ADR 0016 · PR0):** ป้ายตัวเลขบนเมนู `/tax/registrations` และ `/tax/filings`
//   นับ **ทั้งตาราง** ตามขั้นที่เลนของผู้ใช้เป็นเจ้าของ แต่หน้ารายการได้แถวจาก API
//   ที่กรองด้วยขอบเขตทีมมาแล้ว ⇒ คนที่ scope เป็น 'team' (senior_ae · ac · ae)
//   เห็นป้ายเท่ายอดทั้งบริษัท แล้วกดเข้าไปเจอเฉพาะของทีมตัวเอง
//   กติกาข้อแรกของป้ายคือ "กดเข้าไปแล้วต้องเจอของเท่าที่เมนูบอก" (ดู lib/nav/navCounts.js)
//
// ⭐ แถวที่ไม่มีทีม (`team = null`) เป็น **ของกลาง** ทุกทีมเห็น — คนที่ไม่สังกัดทีม
//   (admin/RA/staff) เป็นคนสร้าง ใบจึงเกิดมาไร้ทีมโดยปกติ
// ⚠️ คนที่ scope เป็น 'team' แต่ยังไม่มีทีมสักทีม = ไม่กรอง (ไม่งั้นได้ศูนย์แถวเสมอ)
import { viewScopeUser, userTeams } from '@/lib/permissions';
import { teamInClause } from '@/lib/teamScope';

/** ใส่ตัวกรองขอบเขตทีมให้ query ของ `orders` / `excise_registrations`
 *  — ใช้ทั้งที่ลิสต์ (API) และที่ตัวนับป้าย เพื่อให้สองที่ตอบจำนวนเดียวกันเสมอ */
export function applyExciseListScope(query, user) {
  if (viewScopeUser(user) === 'team' && userTeams(user).length) {
    return query.or(`${teamInClause(user)},team.is.null`);
  }
  return query;
}
