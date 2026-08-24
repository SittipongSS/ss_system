"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { NA } from "@/lib/format";

/* ── ตัวตัดวง: กันคำตอบ "ล้นไหม" สลับไปมาทุกเฟรม ────────────────────────────
 *
 * 🐞 ของจริงที่เจอ (ผู้ใช้ส่งวิดีโอมา 2026-08-24 · ตารางหน้า "งานของฉัน" สั่นทั้งตาราง):
 * บล็อกนี้วัดว่าข้อความล้นไหม แล้ววาด **ปุ่ม** ตามคำตอบ · ปุ่มนั้นไปเปลี่ยน layout
 * ที่ตัวมันเองกำลังวัดอยู่ ⇒ เป็นวงปิดทันทีที่มีกฎ CSS ข้อไหนก็ตามที่มองเห็นปุ่ม
 * ของจริงคือ `.scroll[data-family] td:has(… button …) { max-width: none }` (#1391):
 *   ไม่มีปุ่ม → ช่องโดนเพดาน 220px → ข้อความล้น 2 บรรทัด → ขึ้นปุ่ม
 *   มีปุ่ม   → เพดานถูกถอด ช่องกว้างขึ้น → ข้อความไม่ล้นแล้ว → ถอดปุ่ม → วนต่อ
 * วัดจริงในเบราว์เซอร์: กวาดความกว้างกล่อง 620–1400px เจอ 104 ค่าที่สลับสองสถานะ
 *
 * ⚠️ ตัวตัดวงนี้เป็น **ตาข่ายรับ ไม่ใช่ตัวแก้เหตุ** — เหตุแก้ที่ Table.module.css
 * (ปุ่มของบล็อกนี้ไม่นับเป็นคอนโทรลที่ต้องถอดเพดาน) · เก็บไว้เพราะบล็อกนี้ถูกใช้
 * 102 จุด และกฎ CSS ข้อถัดไปที่บังเอิญมองเห็นปุ่มจะปลุกวงเดิมขึ้นมาอีกโดยไม่มีใครรู้
 *
 * ⚠️ นับเป็น **ช่วงเวลา** ไม่ใช่นับสะสม — ผู้ใช้ลากขอบหน้าต่างข้ามจุดพอดีก็สลับได้
 * หลายครั้ง แต่ไม่มีทางสลับถึง 4 ครั้งใน 250ms ส่วนวงจริงสลับทุกเฟรม (~16ms) */
const FLIP_LIMIT = 4;
const FLIP_WINDOW_MS = 250;

/**
 * Shared presentation for user-entered, potentially long text.
 * Keeps intentional line breaks, clamps previews by rendered height, and only
 * shows the expand control when the content actually overflows.
 */
export default function ReadableText({
  text,
  lines = 4,
  className = "",
  style,
  /* ⭐ ว่าง = ขีด `—` (มติผู้ใช้ 2026-08-17 · กฎค่าว่างทั้งระบบ ดู `naText` ใน lib/format)
     ส่งค่าอื่นได้ถ้าที่นั้นมีคำที่มีความหมายเฉพาะจริง ๆ · ส่ง `null` ถ้าตั้งใจให้หายไปเลย */
  empty = NA,
  defaultExpanded = false,
  // ชิ้นส่วนที่ประกอบไว้แล้ว (RichText ส่งข้อความที่มีลิงก์ในตัวเข้ามา) — ยังต้องส่ง
  // `text` มาด้วยเสมอ เพราะการวัด/ตัดสินว่าว่างเปล่าใช้ข้อความดิบเป็นเกณฑ์
  children = null,
}) {
  const content = text == null ? "" : String(text);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef(null);
  const contentId = useId();

  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node || expanded) return undefined;

    /* 🪤 ประกาศ observer ไว้ก่อน `measure` แล้วเติมค่าทีหลัง — measure ต้องปิดตัวเฝ้า
       ได้จากข้างใน (แพตเทิร์นเดียวกับ lib/ui/useScrollTopOnNavigate.js) */
    let observer = null;
    let last = null;
    let flips = [];

    const measure = () => {
      const next = node.scrollHeight > node.clientHeight + 1;
      if (last !== null && next !== last) {
        const now = performance.now();
        flips = flips.filter((at) => now - at < FLIP_WINDOW_MS);
        flips.push(now);
        if (flips.length >= FLIP_LIMIT) {
          observer?.disconnect();
          /* ค้างที่ "มีปุ่ม" ไม่ใช่ "ไม่มีปุ่ม" — ปุ่มเกินมาคือปุ่มที่กดแล้วไม่มีอะไร
             เพิ่ม ส่วนปุ่มที่หายไปคือข้อความที่ผู้ใช้เปิดอ่านไม่ได้อีกเลย */
          setCanExpand(true);
          return;
        }
      }
      last = next;
      setCanExpand(next);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [content, expanded, lines]);

  if (!content) return empty;

  return (
    <div className={`readable-text-block ${className}`.trim()} style={style}>
      <div
        ref={textRef}
        id={contentId}
        className={`readable-text ${expanded ? "is-expanded" : "is-collapsed"}`}
        style={{ "--readable-lines": lines }}
      >
        {children ?? content}
      </div>
      {(canExpand || expanded) && (
        <button
          type="button"
          className="readable-text-toggle"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          {expanded ? "ย่อข้อความ" : "อ่านทั้งหมด"}
        </button>
      )}
    </div>
  );
}
