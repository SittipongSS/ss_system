"use client";
import { useState, useEffect } from "react";

// ตรวจว่าเป็น "จอตั้ง" (portrait) หรือ "จอนอน" (landscape).
// คืน true เมื่อเป็นจอตั้ง — รวมกรณีจอแนวนอนแต่แคบ (< 820px) เพราะตารางต้องการ
// ความกว้าง ถ้าแคบเกินไปก็ควรใช้การ์ดแทน. SSR-safe: ก่อน mount ถือเป็นจอนอน.
export function useIsPortrait() {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait), (max-width: 820px)");
    const update = () => setPortrait(mq.matches);
    update();
    // ฟังทั้ง matchMedia (พลิกจอ) และ resize (ย่อ/ขยายหน้าต่างข้ามเส้น 820px)
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return portrait;
}

// มุมมองที่ "สลับอัตโนมัติตามจอ" แต่ผู้ใช้ override เองได้ในการวางจอแบบเดิม:
//   จอตั้ง → portraitView (เช่น "list"), จอนอน → landscapeView (เช่น "table").
// เมื่อ "พลิกจอ" (เปลี่ยน orientation) การ override จะถูกล้าง เพื่อให้เลย์เอาต์
// ปรับตามจอใหม่; ภายในการวางจอเดิม สิ่งที่ผู้ใช้กดเลือกจะคงอยู่.
// คืน [view, setView, isPortrait] — setView ใช้กับปุ่มสลับมุมมองได้ตรง ๆ.
export function useResponsiveView({ portrait, landscape }) {
  const isPortrait = useIsPortrait();
  const [manual, setManual] = useState(null);
  // พลิกจอ → ล้าง override ให้กลับไปตามค่าเริ่มต้นของจอนั้น
  useEffect(() => { setManual(null); }, [isPortrait]);
  const view = manual ?? (isPortrait ? portrait : landscape);
  return [view, setManual, isPortrait];
}
