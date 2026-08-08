"use client";
// ── รายชื่อ "ผู้รับผิดชอบ (AE)" สำหรับฟอร์มดีล ─────────────────────────────
//
// มี 3 หน้าที่เปิดฟอร์มดีลได้ (หน้ารวมดีล · คิวลีด · หน้ารายละเอียดลีด) ถ้าปล่อยให้แต่ละ
// หน้ากรองรายชื่อเอง กติกา "เฉพาะทีมตัวเอง" จะถูกก๊อป 3 ชุดแล้วเพี้ยนหากัน — เหมือนที่
// เคยเกิดกับดรอปดาวน์ผู้รับผิดชอบลีด (senior_ae เห็นชื่อ AE ข้ามทีมทั้งบริษัท)
//
// ⚠️ นี่คือชั้น **ความสะดวก** เท่านั้น ด่านจริงอยู่ที่ API ทุกครั้ง (validateDealOwner)
import { useMemo } from "react";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { useRole, useTeam } from "@/lib/roleContext";
import { assignableOwners, canAssignDealOwner, ownerLockedToSelf } from "@/lib/sales/dealOwner";

/**
 * @param meId  ผู้ใช้ปัจจุบัน — ใช้ตั้งค่าตั้งต้น/ล็อกของช่อง
 * @returns { owners, defaultOwnerId, lockedOwner }
 *   lockedOwner = { id, name, team } เมื่อดีลเป็นหน้าที่ของผู้ใช้เอง (ae/senior_ae —
 *   มติผู้ใช้ 2026-08-08) ⇒ ฟอร์ม **สร้าง** โชว์ชื่อล็อกไว้ ไม่มีดรอปดาวน์
 *   · owners ยังคืนให้ role ที่มองเห็นทีม (senior_ae) ใช้ตอน **แก้** ดีลของทีม
 *   · ac / ae_supervisor / admin: owners เต็ม แต่ไม่มีค่าตั้งต้น — ต้องเลือกเอง
 */
export default function useDealOwners(meId = null) {
  const directory = usePeopleDirectory();
  const role = useRole();
  const team = useTeam();

  return useMemo(() => {
    const self = directory.find((person) => person.id === meId) || null;
    const lockedOwner = ownerLockedToSelf(role) && self
      ? { id: self.id, name: self.name, team: self.team || null }
      : null;
    if (!canAssignDealOwner(role)) {
      // ae: ยกดีลให้คนอื่นไม่ได้อยู่แล้ว — มีแค่ชื่อตัวเองที่ล็อกไว้
      return { owners: [], defaultOwnerId: lockedOwner ? meId : "", lockedOwner };
    }
    const owners = assignableOwners(directory, team);
    return { owners, defaultOwnerId: lockedOwner ? meId : "", lockedOwner };
  }, [directory, role, team, meId]);
}
