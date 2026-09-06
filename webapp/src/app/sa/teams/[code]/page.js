"use client";
// ── หน้าทีมขายหนึ่งทีม (/sa/teams/[code]) ────────────────────────────────
// ⚠️ ใช้ component เดียวกับหน้าทีมของธุรกิจบริการ ต่างกันแค่ `department` —
//    เขียนสองไฟล์เมื่อไรมันเพี้ยนหากันภายในสองเดือน (กฎ AGENTS.md ข้อแรก)
import { use } from "react";
import TeamDetail from "@/components/teams/TeamDetail";

export default function SalesTeamPage({ params }) {
  const { code } = use(params);
  return <TeamDetail department="SA" code={decodeURIComponent(code)} />;
}
