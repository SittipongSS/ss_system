"use client";
import { createContext, useContext } from "react";
import { can as _can, sanitizeExtraCaps } from "./permissions";

// Provided by AppLayout (which already knows the signed-in user's role).
// Pages use useCan('<resource>:<action>') to show/hide actions.
export const RoleContext = createContext(null);

// The signed-in user's team (ODM/KA/SV), or null for non-team roles. Kept in a
// separate context so useRole/useCan stay simple string consumers.
export const TeamContext = createContext(null);

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

// Current user's team — used for row-level scope decisions in the UI (e.g.
// hiding approve buttons for another team's records).
export function useTeam() {
  return useContext(TeamContext);
}

export function useDepartment() {
  return useContext(DepartmentContext);
}

export function useCan(cap) {
  const role = useContext(RoleContext);
  const extra = sanitizeExtraCaps(useContext(ExtraCapsContext));
  return _can(role, cap) || extra.includes(cap);
}
