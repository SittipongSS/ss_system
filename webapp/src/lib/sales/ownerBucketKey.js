// คีย์ถัง "รายคน" ของแดชบอร์ดขาย (GET /api/sales-planning/dashboard · byOwner[])
//
// ⭐ มติผู้ใช้ 2026-09-14 "ทีมตามดีล" — ถังคน = (ใคร, ทีมที่ประทับบนแถวต้นทาง)
//    ใคร    = บัญชีผู้ใช้ที่ตัวหาเจ้าของจับได้ (lib/sales/ownerIdentity: id ตรง หรือชื่อ snapshot
//             ตรงบัญชีแบบไม่ชนกัน) ⇒ id เก่า/ใหม่ปน หรือเปลี่ยนชื่อ ยังรวมเป็นคนเดียว
//    ทีมไหน = sales_deals.team ของดีล (ยอด Won/FC/แพ้/รออนุมัติ/รอยื่น SO) · sales_targets.team
//             ของเป้า — ⛔ ห้ามอ่านทีมจากบัญชี (acc.team / acc.teams) มาจัดยอด
//    ⇒ คนที่มีดีลหลายทีมได้ถังละทีม · คนย้ายทีม ยอดทีมเดิมไม่ขยับตาม · ถังทีมหนึ่ง = Σ ถังคนของทีมนั้น
//
// แยกมาไว้ที่ lib เพราะ route.js ของ Next export ได้แค่ HTTP handler — เทสต์เรียกของใน route ตรง ๆ ไม่ได้
//
// ⚠️ ทีมว่าง ('' / null) = ทีมเดียวกัน — ตรงกับถังทีมของ route (`team || 'ไม่ระบุ'`) ไม่งั้นดีลไร้ทีม
//    ของคนเดียวกันแตกสองถัง แล้วผลรวมรายคนไม่เท่าถัง "ไม่ระบุ"
// ⚠️ ไม่ตัดช่องว่าง/ไม่แปลงตัวพิมพ์ของรหัสทีม — ถังทีมของ route ก็ไม่ทำ ถ้าทำฝั่งเดียว Σ คน ≠ ทีม
import { normalizedOwnerName } from '@/lib/sales/dashboardMetrics';

/**
 * @param {object} p
 * @param {{ id: string } | null} p.acc บัญชีที่ resolveOwner(id, name) คืนมา (null = จับไม่ได้)
 * @param {string|null} p.id ownerId บนแถวต้นทาง
 * @param {string|null} p.name ownerName (snapshot) บนแถวต้นทาง
 * @param {string|null} p.team ทีมที่ประทับบนแถวต้นทาง (deal.team / target.team)
 * @returns {string} คีย์ถัง — ใช้ภายใน route เท่านั้น (payload ไม่ส่งคีย์นี้ออกไป)
 */
export function ownerBucketKey({ acc = null, id = null, name = null, team = null } = {}) {
  // จับบัญชีได้ → ตัวตน = บัญชี · แยกตามทีมที่ประทับ
  if (acc) return `u|${acc.id}|${team || ''}`;
  // จับไม่ได้ (คนลาออก id stale) → ถังชื่อ snapshot + ทีม — ประวัติยังโชว์ครบ ไม่หาย
  const cleanName = normalizedOwnerName(name);
  if (cleanName) return `${team || 'no-team'}|${cleanName}`;
  // ไม่มีชื่อเลย → ถัง id (หรือ "ไม่มีเจ้าของ") ของทีมนั้น
  return `${team || 'no-team'}|${id || 'unassigned'}`;
}
