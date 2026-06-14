"use client";
import { createContext, useContext } from "react";
import { can as _can } from "./permissions";

// Provided by AppLayout (which already knows the signed-in user's role).
// Pages use useCan('<resource>:<action>') to show/hide actions.
export const RoleContext = createContext(null);

// The signed-in user's team (ODM/KA/SV), or null for non-team roles. Kept in a
// separate context so useRole/useCan stay simple string consumers.
export const TeamContext = createContext(null);

export function useRole() {
  return useContext(RoleContext);
}

// Current user's team — used for row-level scope decisions in the UI (e.g.
// hiding approve buttons for another team's records).
export function useTeam() {
  return useContext(TeamContext);
}

export function useCan(cap) {
  return _can(useContext(RoleContext), cap);
}
