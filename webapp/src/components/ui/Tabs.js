"use client";

import { useEffect, useId, useRef } from "react";
import { nextEnabledIndex } from "@/lib/ui/selectionNavigation";
import { revealInRow } from "@/lib/ui/rowReveal";
import { scrollToTopOf } from "@/lib/ui/scrollToTopOf";

// แท็บสลับ "ส่วน/มุมมอง" ของหน้า (M3 Tabs — active = เส้นใต้). คู่กับ ViewSwitcher
// (`.segmented` = ตัวกรอง/สลับโหมด active พื้นส้ม). กติกา: สลับหน้า→Tabs, กรองในหน้า→segmented.
// component เดียวสำหรับทุก tab bar ในระบบ กัน drift (แต่ก่อนแต่ละหน้าเขียน .tabs-header เอง).
//   tabs=[{ key, label, disabled? }] · value · onChange(key). label เป็น node ได้ (ใส่ count/ไอคอน).
//   ตัวที่เป็น falsy ใน tabs ถูกข้าม → caller filter เงื่อนไขสิทธิ์ได้เลย.
export default function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel = "แท็บ",
  className = "",
  orientation = "horizontal",
  activationMode = "automatic",
  id,
}) {
  const generatedId = useId();
  const rootId = id || `tabs-${generatedId.replaceAll(":", "")}`;
  const buttonsRef = useRef([]);
  const rootRef = useRef(null);

  /* สลับแท็บตอนไถอยู่กลางหน้า = เนื้อหาของแท็บใหม่เริ่มเหนือขอบจอ คนอ่านต้องไถขึ้นเอง
     จึงพากลับมาที่แถบแท็บให้ (เลื่อนขึ้นอย่างเดียว — อยู่บนสุดอยู่แล้วจะไม่ขยับ) */
  const selectTab = (key) => {
    onChange?.(key);
    scrollToTopOf(rootRef.current);
  };
  const visibleTabs = (tabs || []).filter(Boolean);
  const hasSelectedTab = visibleTabs.some((tab) => value === tab.key && !tab.disabled);
  const firstEnabledIndex = visibleTabs.findIndex((tab) => !tab.disabled);
  const selectedIndex = visibleTabs.findIndex((tab) => value === tab.key);

  /* แท็บที่ถูกเลือกต้องอยู่ในกรอบของแถบ **เต็มตัว** — แถบเลื่อนแนวนอนได้แต่ซ่อนสกอร์ลบาร์ (`.tabs-header`)
     🐞 UAT PR-3 (D16 · 1440px): แท็บที่ล้นขอบขวาเห็นแค่ครึ่งป้าย กดส่วนที่เห็นแล้วถูกเลือกจริงแต่ป้ายยังขาดอยู่อย่างเดิม
        (คีย์บอร์ดไม่เจอ — `focus()` ของลูกศรเลื่อนให้เอง · เมาส์/นิ้วไม่มีอะไรเลื่อนให้)
     ผูกกับ `value` ไม่ใช่กับการกด ⇒ ครอบทั้งกด · ลูกศร · และค่าที่หน้าเปลี่ยนเอง (เปิดหน้ามาที่แท็บท้ายแถว)
     ⚠️ ขยับ `scrollLeft` ของแถบอย่างเดียว (lib/ui/rowReveal.js) — ไม่แตะการเลื่อนของหน้า · แถบที่ไม่ล้นไม่มีอะไรขยับ */
  useEffect(() => {
    if (orientation !== "horizontal" || selectedIndex < 0) return;
    revealInRow(rootRef.current, buttonsRef.current[selectedIndex]);
  }, [value, selectedIndex, orientation]);

  const moveFocus = (event, currentIndex) => {
    const nextIndex = nextEnabledIndex(visibleTabs, currentIndex, event.key, orientation);
    if (nextIndex < 0) return;
    event.preventDefault();
    buttonsRef.current[nextIndex]?.focus();
    if (activationMode === "automatic") selectTab(visibleTabs[nextIndex].key);
  };

  return (
    <div
      ref={rootRef}
      id={rootId}
      className={`tabs-header ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
    >
      {visibleTabs.map((tab, index) => {
        const selected = value === tab.key;
        return (
        <button
          key={tab.key}
          ref={(node) => { buttonsRef.current[index] = node; }}
          id={tab.id || `${rootId}-tab-${index}`}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls={tab.panelId}
          aria-label={tab.ariaLabel}
          tabIndex={selected || (!hasSelectedTab && index === firstEnabledIndex) ? 0 : -1}
          className={`tab-btn ${selected ? "active" : ""}`}
          onClick={() => selectTab(tab.key)}
          onKeyDown={(event) => moveFocus(event, index)}
          disabled={tab.disabled}
        >
          {tab.label}
        </button>
        );
      })}
    </div>
  );
}
