"use client";
import ChoiceChips from "@/components/ui/ChoiceChips";
/* ⚠️ ป้ายทีมอ่านจาก **ทะเบียนจริง** ไม่ใช่ค่าคงที่ (มติ 2026-09-07) — ทีมขายที่สร้างใหม่
   ต้องขึ้นชื่อจริง ไม่ใช่รหัสดิบ · hook คืนค่าสำรองทันทีในรอบแรก จอจึงไม่ว่าง/ไม่กระพริบ */
import { salesTeamLabel, useSalesTeams } from "@/lib/master/salesTeamRegistry";

// ตัวกรอง "แสดงทีมไหนบ้าง" — โผล่เฉพาะคนที่อยู่ตั้งแต่ 2 ทีมขึ้นไป
// (คนทีมเดียวไม่มีคำตอบอื่นให้เลือก การกางไว้จึงเป็นช่องที่ต้องอ่านแล้วข้ามทุกครั้ง)
//
// วางคู่กับตัวสลับขอบเขตใน `.scope-row` เสมอ — มันขยายความให้ปุ่ม "ทีม" ว่าทีมไหน
// ⚠️ ใช้ผ่าน useMyTeamsFilter() เท่านั้น อย่าถือ state เอง ไม่งั้นแต่ละหน้าจะจำคนละค่า
export default function MyTeamsFilter({ teams = [], selected = [], onChange }) {
  const registry = useSalesTeams();
  if (teams.length < 2) return null;
  return (
    <ChoiceChips
      multiple
      ariaLabel="ทีมที่แสดง"
      value={selected}
      onChange={onChange}
      options={teams.map((t) => ({ value: t, label: salesTeamLabel(registry, t) }))}
    />
  );
}
