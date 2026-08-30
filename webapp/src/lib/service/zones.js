// ── โซนบริการ (mig 0297) — logic ล้วน ─────────────────────────────────────
//
// ⭐ "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception / ห้องน้ำชั้น 2) — entity ถาวร
// ไม่ตายตามใบสั่งขาย · ต่อสัญญา = SO ใหม่มาผูกโซนเดิม ประวัติ/consumption ต่อเนื่อง
// (มติผู้ใช้ 2026-08-27 · แผนระบบธุรกิจบริการ เฟส 2)
//
// ⚠️ คนละเรื่องกับ "เขตวิ่งงาน" (service_sites.routeZone — mig 0304) ที่ใช้จัดรอบวิ่ง
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์ม) และ server (validate ก่อน insert)
import { normalizeFloor } from '@/lib/service/zoneCode';

export function normalizeZoneInput(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อโซน' };
  if (name.length > 150) return { value: null, error: 'ชื่อโซนยาวเกิน 150 ตัวอักษร' };

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  /* ── ชั้น + อาคาร (mig 0314 · บังคับตั้งแต่ 0315) ──────────────────────
     ⭐ **ชั้นเป็นส่วนหนึ่งของรหัสโซน** `ZN-CCCC-FF-DDDDD` (มติผู้ใช้ 2026-08-29)
        ไม่ใช่ข้อมูลประกอบ ⇒ บังคับกรอกทุกโซน และเก็บเป็นค่ามาตรฐาน (04 · GF · B1)
        ไม่ใช่ข้อความอิสระ ไม่งั้นอาคารเดียวจะมี 'G' 'g' 'ชั้น G' ปนกันในรหัส
     ⚠️ **แก้ชั้นทีหลังไม่แก้รหัส** — รหัสคือตัวตน ไม่ใช่สรุปสถานะปัจจุบัน
     ⚠️ อาคารเป็นข้อความอิสระได้ เพราะไม่ได้อยู่ในรหัส (ไซต์ใหญ่มีตึก A/B/C) */
  const floor = normalizeFloor(body.floor);
  if (floor.error) return { value: null, error: floor.error };

  const building = String(body.building ?? '').trim().replace(/\s+/g, ' ');
  if (building.length > 60) return { value: null, error: 'ชื่ออาคารยาวเกิน 60 ตัวอักษร' };

  return {
    value: {
      name,
      note: note || null,
      floor: floor.value,
      building: building || null,
      isActive: body.isActive === undefined ? true : !!body.isActive,
    },
    error: null,
  };
}
