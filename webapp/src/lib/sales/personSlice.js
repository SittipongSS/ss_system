// "แถวคน" ของตัวเลขขาย = (ใคร, ทีมไหน) — มติผู้ใช้ 2026-09-14 "ทีมตามดีล"
//
// ⭐ ใคร  = บัญชีผู้ใช้ (ตัวหาเจ้าของรวมคนเปลี่ยนชื่อ/id เก่าเป็นคนเดียว — ownerIdentity)
// ⭐ ทีมไหน = ทีมที่ประทับบนแถวต้นทาง: sales_deals.team (ดีล/SO) · sales_targets.team (เป้า) ·
//    sales_history.team (ยอดกรอกมือ) — **ห้ามอ่านทีมจากบัญชี** (acc.team / teams) มาจัดยอด
//    ⇒ คนย้ายทีม ประวัติทีมเดิมไม่ขยับ · คนที่มีดีลหลายทีมได้แถวละทีม และแถวทีม = ผลรวมคนใต้ทีมนั้น
// ⭐ คีย์เดียวทุกจอ = historyRowKey (คีย์ upsert ของ sales_history อยู่แล้ว) — แดชบอร์ด · รายงานเป้า ·
//    ยอดรออนุมัติ ต้องได้คีย์ตรงกันทุกตัวอักษร ไม่งั้นยอดไปตกแถวเกินแล้วนับซ้ำเงียบ ๆ
import { historyRowKey } from '@/lib/sales/historyEntry';
import { teamRank } from '@/lib/salesPlanning';

export const NO_TEAM_LABEL = 'ไม่ระบุทีม';

/** คีย์ของแถวคนหนึ่งในทีมหนึ่ง · แถว legacy ที่ไม่มี ownerId ใช้ชื่อแทน (ไม่มีทางชนกับคีย์ owner:) */
export function personSliceKey({ team = null, ownerId = null, ownerName = null } = {}) {
  if (ownerId) return historyRowKey({ team, ownerId });
  return `name:${team || '-'}:${String(ownerName || '').trim() || 'ไม่ระบุ'}`;
}

/**
 * หาแถวคนจากพารามิเตอร์ (ลิงก์ ?person=) — รับทั้งคีย์แถวเต็ม และ user id เปล่า (ลิงก์เดิม /
 * "ดูผลงานเต็ม" จากแดชบอร์ดของฉัน) · id เปล่าที่มีหลายแถว (หลายทีม) ได้แถวของทีมที่เรียงก่อน
 * ⚠️ หาไม่เจอ = null — ห้ามถอยไปแถวแรกของรายชื่อ ไม่งั้นจอโชว์ผลงานของคนอื่นเงียบ ๆ
 */
export function findPersonRow(people = [], param) {
  if (!param) return null;
  const list = Array.isArray(people) ? people : [];
  const exact = list.find((p) => p?.id === param);
  if (exact) return exact;
  const slices = list.filter((p) => p?.ownerId && p.ownerId === param);
  if (!slices.length) return null;
  return slices.slice().sort((a, b) => teamRank(a.team) - teamRank(b.team))[0];
}
