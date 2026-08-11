"use client";
import ChoiceChips from "@/components/ui/ChoiceChips";
import { TEAM_LABELS } from "@/lib/permissions";

// ตัวกรอง "แสดงทีมไหนบ้าง" — โผล่เฉพาะคนที่อยู่ตั้งแต่ 2 ทีมขึ้นไป
// (คนทีมเดียวไม่มีคำตอบอื่นให้เลือก การกางไว้จึงเป็นช่องที่ต้องอ่านแล้วข้ามทุกครั้ง)
//
// วางคู่กับตัวสลับขอบเขตใน `.scope-row` เสมอ — มันขยายความให้ปุ่ม "ทีม" ว่าทีมไหน
// ⚠️ ใช้ผ่าน useMyTeamsFilter() เท่านั้น อย่าถือ state เอง ไม่งั้นแต่ละหน้าจะจำคนละค่า
export default function MyTeamsFilter({ teams = [], selected = [], onChange }) {
  if (teams.length < 2) return null;
  return (
    <ChoiceChips
      multiple
      ariaLabel="ทีมที่แสดง"
      value={selected}
      onChange={onChange}
      options={teams.map((t) => ({ value: t, label: TEAM_LABELS[t] || t }))}
    />
  );
}
