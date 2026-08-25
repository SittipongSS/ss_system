"use client";
import { createContext, useContext, useMemo } from "react";
import { can as _can, homeSystemForUser, sanitizeExtraCaps, userTeams as _userTeams } from "./permissions";
import { adoptsPathname } from "@/config/navigation";

// Provided by AppLayout (which already knows the signed-in user's role).
// Pages use useCan('<resource>:<action>') to show/hide actions.
export const RoleContext = createContext(null);

// The signed-in user's PRIMARY team (ODM/KA/SV), or null for non-team roles.
// Kept in a separate context so useRole/useCan stay simple string consumers.
// ⚠️ ทีมหลักใช้ตอบคำถาม "ของใหม่ที่คนนี้สร้างเข้าทีมไหน" (attribution) เท่านั้น —
//    ถ้าจะถามว่า "เห็น/แก้แถวของทีมนี้ได้ไหม" ต้องใช้ useTeams() เพราะคนอยู่หลายทีมได้
export const TeamContext = createContext(null);

// ทุกทีมที่ผู้ใช้สังกัด (app_metadata.teams) — ใช้ตัดสินขอบเขตแถวฝั่ง UI
export const TeamsContext = createContext(null);

// Per-user capability grants (app_metadata.extraCaps) — additive caps on top of
// the role, e.g. an SA granted the LG legal:approve. useCan unions these so the
// approve/reject buttons show for a grantee, mirroring the server's canUser.
export const ExtraCapsContext = createContext(null);

// The signed-in user's department/ฝ่าย (SA/RD/PC/PD/QC/LG/WH/AD/...) — from
// app_metadata.department with fallback departmentFor(role), same rule as the
// server (assignable-users). Used e.g. by the timeline "เฉพาะฝ่ายของฉัน" toggle.
export const DepartmentContext = createContext(null);

export function useRole() {
  return useContext(RoleContext);
}

// ทีมหลักของผู้ใช้ — ใช้ตอนตั้งค่าเริ่มต้นของฟอร์ม/แสดงสังกัด
export function useTeam() {
  return useContext(TeamContext);
}

// ทุกทีมของผู้ใช้ — ใช้ตัดสินขอบเขตแถว (เช่นซ่อนปุ่มอนุมัติของทีมอื่น)
// ถอยไปทีมหลักเองถ้า provider ยังไม่ส่ง teams มา
//
// ⚠️ ต้องคืน "อาร์เรย์ตัวเดิม" ตราบใดที่ทีมไม่เปลี่ยน — ผู้เรียกเอาไปใส่ dependency
// ของ useMemo/useCallback กันทั้งระบบ ถ้าสร้างอาร์เรย์ใหม่ทุกรอบ memo จะพังทุกตัว
export function useTeams() {
  const teams = useContext(TeamsContext);
  const team = useContext(TeamContext);
  const key = (Array.isArray(teams) && teams.length ? teams : _userTeams(team)).join(",");
  return useMemo(() => (key ? key.split(",") : []), [key]);
}

// ผู้ใช้อยู่ในทีมนี้ไหม (ทีมเดียวหรือหลายทีมก็ถาม) — คู่กับ hasTeam ฝั่งเซิร์ฟเวอร์
export function useHasTeam(team) {
  const mine = useTeams();
  return _userTeams(team).some((t) => mine.includes(t));
}

export function useDepartment() {
  return useContext(DepartmentContext);
}

/* ตัวตนสำหรับส่งเข้า `canUser(user, cap)` ของ lib/permissions — บทบาท + สิทธิ์รายคน
   ⚠️ อย่าเช็คสิทธิ์ด้วย `useRole()` เปล่า ๆ เมื่อรายการยาวกว่าหนึ่ง cap: สิทธิ์
   เพิ่มเติมรายคน (extraCaps) จะหายไปเงียบ ๆ และคนที่ถูกให้สิทธิ์พิเศษจะไม่เห็นเมนู */
export function useCapUser() {
  const role = useContext(RoleContext);
  const extraCaps = useContext(ExtraCapsContext);
  return useMemo(() => ({ role, extraCaps }), [role, extraCaps]);
}

/* บ้านของคนที่กำลังดูอยู่ — 'rd' | 'finance' | null (= สายขาย/แอดมิน)
 *
 * ⭐ **ตัวเดียวกับที่เลือกเปลือกเมนู** (`homeSystemForUser` ที่ `config/navigation.js`
 * ใช้ตัดสินว่าเมนูเอกสารร่วมไปขึ้นกลุ่มไหน — มติผู้ใช้ 2026-08-22) ⇒ หน้าที่ต้อง
 * "พูดภาษาของคนที่ยืนอยู่" ต้องถามที่นี่ **ห้ามเช็ค role/department เองในหน้า**
 * ไม่งั้นวันที่เมนูเปลี่ยน (ฝ่ายใหม่ได้เอกสารร่วมเพิ่ม) เปลือกกับเนื้อหาจะเดินหนีกัน
 */
export function useHomeSystem() {
  const role = useContext(RoleContext);
  const department = useContext(DepartmentContext);
  return useMemo(() => homeSystemForUser({ role, department }), [role, department]);
}

/* เปลือกที่ "หน้านี้" สวมอยู่สำหรับคนดูคนนี้ — 'rd' | 'finance' | null (= เปลือกงานขาย)
 *
 * ⚠️ **บ้านของคนดูอย่างเดียวไม่พอ** — ฝ่ายหนึ่งรับเฉพาะบางเส้นทางมาไว้ในบ้านตัวเอง
 * (`ADOPTED_SHARED_PATHS`: RD รับแค่ `/requests` · FN รับเอกสารขายสี่ชนิด) ⇒ ต้องถาม
 * ทั้ง "บ้านของเขา" และ "หน้านี้ถูกรับไปหรือยัง" ด้วยฟังก์ชันชุดเดียวกับที่เมนูใช้
 * ไม่งั้นวันที่ลิสต์การรับเปลี่ยน เนื้อหาบนหน้าจะพูดภาษาของเปลือกที่ไม่ได้ครอบมันอยู่
 */
export function useShellSystem(pathname) {
  const home = useHomeSystem();
  return useMemo(
    () => (home && adoptsPathname(home, pathname) ? home : null),
    [home, pathname],
  );
}

export function useCan(cap) {
  const role = useContext(RoleContext);
  const extra = sanitizeExtraCaps(useContext(ExtraCapsContext));
  return _can(role, cap) || extra.includes(cap);
}
