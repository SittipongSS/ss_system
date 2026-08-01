"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  empty = null,
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

    const measure = () => {
      setCanExpand(node.scrollHeight > node.clientHeight + 1);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
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
