// ตัวตนของ "เจ้าของดีล/เป้า" บนภาพรวมผลงานขาย — ดีลกับเป้าเก็บ ownerId/ownerName
// เป็น snapshot ตอนสร้าง (deals/route.js, targets/route.js) ไม่อัพเดทตามบัญชีผู้ใช้:
//   - เปลี่ยนชื่อในบัญชี → แถวเก่าชื่อเก่า แถวใหม่ชื่อใหม่ → คนเดียวกันแตกเป็นสองแถว
//     (FC Total / FC คงเหลือ กระจายคนละแถว อ่านเหมือน "ของบางคนหาย")
//   - บัญชีถูกสร้างใหม่ → id เก่าค้างบนแถวเดิม (stale id) — เหตุที่ byOwner เดิม
//     ต้อง key ด้วย ชื่อ+ทีม แทน id
//
// ทางแก้: ยึด "บัญชีผู้ใช้ปัจจุบัน" เป็นตัวตนจริง — จับด้วย id ก่อน, id ไม่เจอ
// (stale) ค่อยถอยไปจับด้วยชื่อ normalize แล้ว และใช้ชื่อ/ทีมจากบัญชีเป็นค่าแสดงผล
// จับด้วยชื่อเฉพาะเมื่อชื่อนั้น "ไม่ชนกัน" ระหว่างบัญชี — ชื่อพ้องกันสองคน
// ห้ามเดา ปล่อยเป็นถัง legacy ตามเดิมปลอดภัยกว่ารวมผิดคน
//
// แถวที่จับไม่ได้เลย (id ก็ stale ชื่อ snapshot ก็ไม่ตรงบัญชีไหน เช่น พนักงานที่
// ลาออกไปแล้ว) → คืน null ให้ผู้เรียก fallback ถัง ชื่อ+ทีม เดิม — ข้อมูลประวัติ
// ต้องยังโชว์ ไม่ใช่หายไป

import { normalizedOwnerName } from '@/lib/sales/dashboardMetrics';

// users: iterable ของ { id, name, team } (จาก loadUserDirectory)
// คืน resolve(id, name) → บัญชีที่เป็นตัวตนจริง หรือ null ถ้าจับไม่ได้
export function buildOwnerResolver(users) {
  const byId = new Map();
  const byName = new Map(); // normalized name → user | null (null = ชื่อชนกัน ห้ามใช้จับ)
  for (const u of users || []) {
    if (!u?.id) continue;
    byId.set(u.id, u);
    const k = normalizedOwnerName(u.name);
    if (!k) continue;
    byName.set(k, byName.has(k) ? null : u);
  }
  return (id, name) => {
    if (id && byId.has(id)) return byId.get(id);
    const k = normalizedOwnerName(name);
    return (k && byName.get(k)) || null;
  };
}
