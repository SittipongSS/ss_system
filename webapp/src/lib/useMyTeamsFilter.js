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
/* ⭐ **ค่าที่เลือกจำข้ามหน้า** (มติผู้ใช้ 2026-08-12 · IS-26080012)
   🐞 เดิมเป็น state ต่อหน้า ⇒ เลือก "ODM อย่างเดียว" ที่หน้าดีล พอเด้งไปหน้าลีด/คำร้อง
   ต้องเลือกใหม่ทุกครั้ง · ยิ่งติดตั้งครบหลายหน้ายิ่งต้องเลือกซ้ำมากขึ้นเป็นเงาตามตัว
   (คอมเมนต์ใน `ui/MyTeamsFilter` เตือนเรื่องนี้ไว้เองว่า "อย่าถือ state เอง ไม่งั้น
   แต่ละหน้าจะจำคนละค่า" — ซึ่งเป็นจริงอยู่ เพราะ hook เก็บค่าแยกต่อหน้า)

   ⚠️ `sessionStorage` ไม่ใช่ `localStorage` — ตัวกรองนี้เป็น "มุมมองของรอบการทำงานนี้"
   ไม่ใช่การตั้งค่าถาวร · ค้างข้ามวันแล้วผู้ใช้จะเปิดระบบมาเจอลิสต์ที่ไม่ครบโดยจำไม่ได้
   ว่าตัวเองกรองไว้ ซึ่งอ่านเหมือนข้อมูลหาย
   ⚠️ อ่านแบบ lazy ใน useState — อ่านนอก component ทำให้ค่าค้างข้าม session ของ SSR */
const STORE_KEY = "ss.myTeamsFilter";

const readStored = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : null;
  } catch { return null; }
};

export default function useMyTeamsFilter() {
  const teams = useTeams();
  const [selected, setSelected] = useState(() => readStored() || teams);

  // teams มาหลัง mount (AppLayout โหลด session เสร็จค่อยส่งเข้ามา) — ต้อง sync
  // ครั้งแรก ไม่งั้นตัวกรองจะค้างเป็นอาร์เรย์ว่างแล้วลิสต์โล่งทั้งหน้า
  // ⚠️ ค่าที่จำไว้ต้องถูก **กรองด้วยทีมจริงของวันนี้** — คนถูกย้ายออกจากทีมแล้วค่าเก่า
  // ยังค้างอยู่ = ตัวกรองชี้ทีมที่เขาไม่ได้อยู่แล้ว แล้วลิสต์ว่างโดยไม่มีอะไรอธิบาย
  useEffect(() => {
    if (!teams.length) return;
    const stored = readStored();
    const usable = stored ? stored.filter((t) => teams.includes(t)) : [];
    setSelected(usable.length ? usable : teams);
  }, [teams]);

  useEffect(() => {
    if (typeof window === "undefined" || !selected.length) return;
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(selected)); } catch { /* โหมดส่วนตัว/โควตาเต็ม — ตัวกรองยังทำงาน แค่ไม่จำ */ }
  }, [selected]);

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
