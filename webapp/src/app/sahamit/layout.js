"use client";
import { LineChart } from "lucide-react";
import { useRole, useTeams } from "@/lib/roleContext";
import { canAccessSahamit } from "@/lib/permissions";
import { accessState } from "@/lib/accessGate";
import AccessDenied from "@/components/ui/AccessDenied";
import SkeletonRows from "@/components/ui/Skeleton";

// Client-side guard for the whole SAHAMIT module. The proxy only gates by role
// (coarse), so the precise team gate (Key Account only, + admin / sales-head
// oversight) lives here — and again in every /api/sahamit handler, which also
// scopes to customer สหมิตร AR-109. Role/team come from AppLayout's context.
//
/* ⛔ เดิม `router.replace("/home")` + `return null` — ทั้งโมดูลเด้งออกเงียบ ๆ
   ผู้ใช้เห็นแค่หน้าแรกที่ตัวเองไม่ได้กด · ด่านนี้อยู่ที่ **layout** จึงหลุดจาก
   สายตาตอนไล่หน้า page.js (กฎ: docs/ui-visibility-rule.md) */
export default function SahamitLayout({ children }) {
  const role = useRole();
  const teams = useTeams();
  const gate = accessState(role, canAccessSahamit(role, teams));
  if (gate === "loading") return <SkeletonRows rows={6} />;
  if (gate === "denied") {
    return (
      <AccessDenied
        icon={<LineChart size={22} />}
        title="งานสหมิตร"
        message="โมดูลสหมิตรเปิดให้ทีม Key Account หัวหน้าฝ่ายขาย และผู้ดูแลระบบเท่านั้น"
        back={{ href: "/home", label: "กลับหน้าแรก" }}
      />
    );
  }
  return children;
}
