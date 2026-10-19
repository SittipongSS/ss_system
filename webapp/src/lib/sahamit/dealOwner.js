// ── ผู้ดูแลดีลที่สร้างจาก FC สหมิตร ─────────────────────────────────────────
//
// สหมิตรเป็นลูกค้าของทีม KA ทีมเดียว ⇒ ผู้ดูแลต้องเป็น "คนถือดีลได้" (AE / Senior AE
// ตาม `DEAL_HOLDER_ROLES` มติ 2026-08-08) **และอยู่ทีม KA** — เป็นทีมรองก็นับ
//
// 🐞 เดิมจอกรอง `u.role === "ae"` และ API ตีกลับ `role !== 'ae'` แยกกันคนละที่
//    ⇒ Senior AE ทีม KA ไม่ขึ้นในดรอปดาวน์ "ผู้ดูแล (AE)" เลย ทั้งที่ถือดีลได้
//    จอกับ API จึงต้องถามคำถามเดียวกันจากตัวนี้ตัวเดียว
import { isDealHolder, normalizeRole, userTeams } from '@/lib/permissions';

export const SAHAMIT_DEAL_TEAM = 'KA';

/** @param account แถวจาก /api/pm/assignable-users หรือ `app_metadata` ของบัญชี ({ role, team, teams }) */
export function isSahamitDealOwner(account) {
  if (!account) return false;
  return isDealHolder(normalizeRole(account.role)) && userTeams(account).includes(SAHAMIT_DEAL_TEAM);
}
