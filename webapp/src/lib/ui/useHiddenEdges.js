"use client";
import { useEffect, useRef, useState } from "react";
import { hiddenEdges } from "./hiddenEdges";

/**
 * วัดว่ากล่องเลื่อนแนวนอนยังซ่อนเนื้อทางไหน — คืน `[ref, edges]` (`edges` = "start" · "end" · "start end" · "")
 * ⭐ ผู้ใช้: TableScroll `edgeHint` (UAT FN 27/10 ข้อ 6 — คอลัมน์ที่จมใต้กลุ่มตรึงขวาต้องมีคำใบ้ว่าเลื่อนได้)
 * ⭐ เฝ้า **กล่องเดียว** (เลื่อน + กล่อง/ลูกตัวแรกเปลี่ยนขนาด) — ไม่ไล่เฝ้าทุกเซลล์ (บทเรียนของ Table.js เดิม · tooltip.test)
 * @param enabled ปิด = ไม่ผูกอะไรเลย (ค่าว่างตลอด)
 */
export default function useHiddenEdges(enabled = true) {
  const ref = useRef(null);
  const [edges, setEdges] = useState("");
  useEffect(() => {
    const box = ref.current;
    if (!enabled || !box) return undefined;
    const measure = () => setEdges(hiddenEdges(box));
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(box);
    if (box.firstElementChild) observer?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [enabled]);
  return [ref, enabled ? edges : ""];
}
