"use client";
// ── /home — เมนูของทุกระบบที่บัญชีนี้เข้าได้ (ADR 0016) ─────────────────────
//
// ⭐ หน้านี้อยู่ **ในเปลือก** `AppLayout` แล้ว ⇒ session · devBypass · โมดัลบังคับ
//    เปลี่ยนรหัสผ่าน · ออกจากระบบ · ตัวดึงตัวเลข อยู่ที่เปลือกชุดเดียว ไม่มีสำเนาที่สอง
//    (สองชุดเคยเพี้ยนกันมาแล้ว: หน้าแรกเดิมไม่ล้าง userId ตอนออกจากระบบ และทิ้ง
//     `teams` จน AE ที่มี KA เป็นทีมรองไม่เห็นงานสหมิตร)
// ⚠️ ห้ามมี <main> — เปลือกมีอยู่แล้ว
import { useContext } from 'react';
import { useRole, useTeam, useTeams, useDepartment, ExtraCapsContext } from '@/lib/roleContext';
import SystemMenuSheet from '@/components/home/SystemMenuSheet';

export default function HomePage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const extraCaps = useContext(ExtraCapsContext);
  /* ⚠️ ต้องครบทุกช่องที่ด่านสิทธิ์อ่าน (`canAccessRd` · `sharedItemBelongsInGroup` ·
     `canAccessSahamit` ใช้ทุกทีม) — `useCapUser()` ให้แค่ role + extraCaps ซึ่งไม่พอ */
  const user = { role, team, teams, department, extraCaps };
  return <SystemMenuSheet user={user} />;
}
