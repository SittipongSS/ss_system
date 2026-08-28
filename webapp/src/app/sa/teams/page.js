"use client";
// ── จัดทีมของฝ่ายขาย (/sa/teams) ─────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-28: จัดทีมเองได้ไม่ต้องรอแอดมิน
// ⚠️ ใช้ component เดียวกับหน้าจัดทีมของฝ่ายอื่น ต่างกันแค่ `department` —
//    เขียนสองไฟล์เมื่อไรมันเพี้ยนหากันภายในสองเดือน (กฎ AGENTS.md ข้อแรก)
import TeamManager from "@/components/teams/TeamManager";

export default function SalesTeamsPage() {
  return (
    <TeamManager
      department="SA"
      title="จัดทีมขาย"
      subtitle="ทีมขายผูกกับสิทธิ์การเห็นข้อมูลและยอดขาย — ย้ายคนแล้วดีล/เป้าที่ค้างต้องตามเก็บเอง"
    />
  );
}
