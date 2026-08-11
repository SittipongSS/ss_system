"use client";
import { createContext, useContext, useMemo } from "react";
import { can as _can, sanitizeExtraCaps, userTeams as _userTeams } from "./permissions";

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

export function useCan(cap) {
  const role = useContext(RoleContext);
  const extra = sanitizeExtraCaps(useContext(ExtraCapsContext));
  return _can(role, cap) || extra.includes(cap);
}
