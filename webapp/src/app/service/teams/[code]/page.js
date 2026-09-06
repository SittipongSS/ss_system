"use client";
// ── หน้าทีมเจ้าหน้าที่บริการหนึ่งทีม (/service/teams/[code]) ─────────────────
// ⚠️ ทีมที่นี่เป็น **ทีมปฏิบัติงาน** (kind='crew') — จัดคนอย่างเดียว ไม่แตะสิทธิ์
//    (มติ 2026-07-31 · docs/team-management-plan.md §2)
import { use } from "react";
import TeamDetail from "@/components/teams/TeamDetail";

export default function ServiceTeamPage({ params }) {
  const { code } = use(params);
  return <TeamDetail department="TS" code={decodeURIComponent(code)} />;
}
