"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTeams } from "@/lib/roleContext";

// ── "แสดงทีมไหนบ้าง" ของคนที่อยู่หลายทีม (มติผู้ใช้ 2026-08-11) ────────────
//
// ปัญหาที่แก้: พอคนหนึ่งคนอยู่ได้หลายทีม ปุ่มขอบเขต "ทีม" จะกว้างขึ้นเงียบ ๆ —
// AE ที่อยู่ ODM+SV กด "ทีม" แล้วได้ดีล/ลีดของสองทีมปนกัน แยกดูทีละทีมไม่ได้เลย
//
// กติกา:
//   • คนอยู่ทีมเดียว (ส่วนใหญ่ของระบบ) → `multi` เป็น false, `matches` คืน true เสมอ
//     ⇒ ไม่มีตัวกรองโผล่ และพฤติกรรมเดิมไม่เปลี่ยนแม้แต่นิดเดียว
//   • ตั้งต้น "เลือกครบทุกทีม" — ตัวกรองมีไว้ *แคบลง* ไม่ใช่บังคับให้เลือกก่อนใช้งาน
//   • เหลืออย่างน้อยหนึ่งทีมเสมอ (ChoiceChips ล็อกตัวสุดท้ายให้)
//
// ⚠️ ตัวนี้กรอง **ฝั่งจอเท่านั้น** และแคบกว่าขอบเขตที่ server ให้มาแล้วเสมอ —
//    ห้ามใช้แทนด่านสิทธิ์ (ด่านจริงอยู่ที่ inScope/whereTeamIn ฝั่ง API)
export default function useMyTeamsFilter() {
  const teams = useTeams();
  const [selected, setSelected] = useState(teams);

  // teams มาหลัง mount (AppLayout โหลด session เสร็จค่อยส่งเข้ามา) — ต้อง sync
  // ครั้งแรก ไม่งั้นตัวกรองจะค้างเป็นอาร์เรย์ว่างแล้วลิสต์โล่งทั้งหน้า
  useEffect(() => { setSelected(teams); }, [teams]);

  const multi = teams.length > 1;
  const matches = useCallback(
    (rowTeam) => !multi || selected.includes(rowTeam),
    [multi, selected],
  );

  // ⚠️ ต้อง memo ก้อนที่คืน — ผู้เรียกเอาไปใส่ dependency ของ useMemo ที่กรองลิสต์ทั้งหน้า
  // คืน object ใหม่ทุกรอบ = memo พังทุกรอบ (กรองลีด 129 ใบใหม่ทุกครั้งที่พิมพ์ค้นหา)
  return useMemo(
    () => ({ teams, selected, setSelected, multi, matches }),
    [teams, selected, multi, matches],
  );
}
