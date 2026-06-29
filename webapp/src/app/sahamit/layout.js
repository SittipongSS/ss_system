"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole, useTeam } from "@/lib/roleContext";
import { canAccessSahamit } from "@/lib/permissions";

// Client-side guard for the whole SAHAMIT module. The proxy only gates by role
// (coarse), so the precise team gate (Key Account only, + admin / sales-head
// oversight) lives here — and again in every /api/sahamit handler, which also
// scopes to customer สหมิตร AR-109. Role/team come from AppLayout's context.
export default function SahamitLayout({ children }) {
  const router = useRouter();
  const role = useRole();
  const team = useTeam();
  const allowed = role ? canAccessSahamit(role, team) : null;

  useEffect(() => {
    if (role && allowed === false) router.replace("/home");
  }, [role, allowed, router]);

  if (!role || allowed === false) return null; // not loaded yet, or redirecting
  return children;
}
