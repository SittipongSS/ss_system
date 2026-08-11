import { userTeams } from '@/lib/permissions';

// ── ตัวกรอง "เฉพาะทีมของฉัน" บน query ──────────────────────────────────
// คนหนึ่งคนอยู่ได้หลายทีม (มติผู้ใช้ 2026-08-11: AE อยู่ทั้ง ODM และ Services)
// ⇒ ทุกจุดที่เคยเป็น `.eq('team', user.team)` ต้องกลายเป็น `.in('team', ทีมทั้งหมด
// ของคนนั้น)` ไม่งั้นลิสต์จะโชว์แค่ทีมหลัก ทั้งที่หน้าตั้งค่าบอกว่าเขาอยู่สองทีม —
// และจะเพี้ยนกับ inScope() ซึ่งอนุญาตทั้งสองทีมแล้ว (แถวที่เปิดรายตัวได้ แต่หาในลิสต์ไม่เจอ)
//
// ⚠️ ตัวนี้ใช้กับ **ขอบเขตการเห็น** เท่านั้น — ตอนเขียนทีมลงแถวใหม่ยังเป็นทีมเดียว
//    (primaryTeam) เสมอ ไม่งั้นยอดจะถูกนับซ้ำสองทีม

// ค่าที่ไม่มีวันตรงกับทีมจริง — คนที่ยังไม่ถูกจัดทีมต้องได้ลิสต์ว่าง ไม่ใช่ทั้งระบบ
export const NO_TEAM = '__no_team__';

// ทีมที่ใช้กรอง; คืน [NO_TEAM] เมื่อผู้ใช้ยังไม่มีทีม เพื่อให้ตัวกรอง fail closed
export function scopeTeams(user) {
  const teams = userTeams(user);
  return teams.length ? teams : [NO_TEAM];
}

// `.in('team', …)` — ตัวแทนตรง ๆ ของ `.eq('team', user.team)` เดิม
export function whereTeamIn(query, user, column = 'team') {
  return query.in(column, scopeTeams(user));
}

// ชิ้นส่วนสำหรับ `.or(...)` — ใช้เมื่อแถวไร้ทีม (`team is null`) เป็น "ของกลาง"
// ที่ทุกทีมต้องเห็น หรือเมื่อมีเงื่อนไข or อื่นต่อท้าย (เช่น ownerId ของตัวเอง)
//   query.or(`${teamInClause(user)},team.is.null`)
export function teamInClause(user, column = 'team') {
  return `${column}.in.(${scopeTeams(user).join(',')})`;
}
