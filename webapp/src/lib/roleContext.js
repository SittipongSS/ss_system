"use client";
import { createContext, useContext } from "react";
import { can as _can } from "./permissions";

// Provided by AppLayout (which already knows the signed-in user's role).
// Pages use useCan('<resource>:<action>') to show/hide actions.
export const RoleContext = createContext(null);

export function useRole() {
  return useContext(RoleContext);
}

export function useCan(cap) {
  return _can(useContext(RoleContext), cap);
}
