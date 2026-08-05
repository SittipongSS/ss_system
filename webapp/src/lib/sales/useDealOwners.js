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
import { assignableOwners, canAssignDealOwner, ownsDealsByDefault } from "@/lib/sales/dealOwner";

/**
 * @param meId  ผู้ใช้ปัจจุบัน — ใช้ตั้งค่าตั้งต้นของช่อง
 * @returns { owners, defaultOwnerId }
 *   owners ว่าง = ไม่ต้องโชว์ช่องนี้ (AE ยกดีลให้คนอื่นไม่ได้อยู่แล้ว)
 */
export default function useDealOwners(meId = null) {
  const directory = usePeopleDirectory();
  const role = useRole();
  const team = useTeam();

  return useMemo(() => {
    if (!canAssignDealOwner(role)) return { owners: [], defaultOwnerId: "" };
    const owners = assignableOwners(directory, team);
    const canDefaultToSelf = ownsDealsByDefault(role) && owners.some((o) => o.id === meId);
    return { owners, defaultOwnerId: canDefaultToSelf ? meId : "" };
  }, [directory, role, team, meId]);
}
