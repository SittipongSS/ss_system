"use client";
// ── จัดทีมช่างของฝ่ายบริการ (/service/teams) ─────────────────────────────
//
// ⭐ *"TS ก็มีแยกทีม"* (มติผู้ใช้ 2026-08-28) — ฝ่ายช่างแบ่งทีมกันจริงในหน้างาน
//
// ⚠️ ทีมที่นี่เป็น **ทีมปฏิบัติงาน** (kind='crew') — จัดคนอย่างเดียว **ไม่แตะสิทธิ์**
//    ช่างจึงไม่ต้องถือ role ฝ่ายขายเพื่อจะ "มีทีม" ซึ่งจะลากสิทธิ์เห็นดีล/ใบเสนอราคา/
//    มูลค่าทั้งทีมมาด้วย (มติ 2026-07-31 ที่ห้ามไว้ · docs/team-management-plan.md §2)
//
// ⚠️ ใช้ component เดียวกับ /sa/teams ต่างกันแค่ `department`
import TeamManager from "@/components/teams/TeamManager";

export default function ServiceTeamsPage() {
  return (
    <TeamManager
      department="TS"
      title="จัดทีมช่าง"
      subtitle="ทีมปฏิบัติงานของฝ่ายบริการ — ใช้จัดคนและจัดคิวงาน ไม่กระทบสิทธิ์การเข้าถึงข้อมูล"
    />
  );
}
