"use client";
// ── รางเลือกส่วน (สองชั้น) — รายชื่อส่วนด้านข้าง + เนื้อของส่วนที่เลือก ──────
//
// ⭐ มติผู้ใช้ 2026-08-09 ("แบบ A"): ในแท็บที่มีหลายหัวข้อย่อย ให้ทำเป็นสองชั้น
// ด้านข้าง แทนการกางลิ้นชักซ้อนกันลงมา · ตัวแรกที่ใช้: 5 ส่วนของแบบฟอร์ม PDR
//
// ⚠️ **ไม่ใช่แท็บแนวตั้ง** — `ui/Tabs` เป็นตัวสลับ "ส่วน/มุมมองของหน้า" ที่มีเส้นใต้
// และคุมด้วยลูกศรซ้าย-ขวา · อันนี้เป็นรายการของ *เนื้อในหน้าเดียวกัน* ที่ยาวเกิน
// จะโชว์พร้อมกัน จึงใช้ role="tablist" แนวตั้งของตัวเอง ให้ลูกศรขึ้น-ลงเดิน
//
// ⚠️ จอแคบ: ราง**ไม่ยุบเป็นดรอปดาวน์** แต่กลายเป็นแถบเลื่อนแนวนอนด้านบน — ยุบ
// เป็นดรอปดาวน์เมื่อไร จำนวนช่องที่กรอกแล้วของส่วนอื่นจะหายไปจากสายตาทั้งหมด
import { useId, useRef } from "react";
import { nextEnabledIndex } from "@/lib/ui/selectionNavigation";

export default function SectionRail({
  sections,          // [{ key, label, count?: {filled,total,optional?} }]
  value,
  onChange,
  ariaLabel = "ส่วนของแบบฟอร์ม",
  children,          // เนื้อของส่วนที่เลือก
}) {
  const generatedId = useId();
  const rootId = `rail-${generatedId.replaceAll(":", "")}`;
  const buttonsRef = useRef([]);
  const items = (sections || []).filter(Boolean);

  const moveFocus = (event, index) => {
    const next = nextEnabledIndex(items, index, event.key, "vertical");
    if (next < 0) return;
    event.preventDefault();
    buttonsRef.current[next]?.focus();
    onChange?.(items[next].key);
  };

  return (
    <div className="section-rail">
      <div className="section-rail-nav" role="tablist" aria-label={ariaLabel} aria-orientation="vertical">
        {items.map((item, index) => {
          const on = item.key === value;
          const { filled = 0, total = 0, optional = false } = item.count || {};
          /* ⭐ `optional` = ส่วนที่ **ไม่มีช่องไหนบังคับเลย** (เช่น ตารางลายเซ็นของ PDR)
             ⇒ ตัวหารไม่มีความหมาย · โชว์จำนวนที่กรอกเฉย ๆ และไม่มีสถานะ "ยังไม่ครบ"
             🐞 เดิมส่วนพวกนี้ขึ้น "0/6" กับจุดเทาเหมือนงานค้าง ทั้งที่เว้นว่างได้ตามตั้งใจ
                ⇒ อ่านเป็นหนี้ที่ไม่มีวันเคลียร์ */
          // จุดสีบอก "แตะแล้วหรือยัง" — เขียวเมื่อครบ, เหลืองเมื่อเริ่มแล้ว, เทาเมื่อยังว่าง
          const tone = optional
            ? (filled > 0 ? "full" : "none")
            : total > 0 && filled >= total ? "full" : filled > 0 ? "some" : "none";
          return (
            <button
              key={item.key}
              ref={(node) => { buttonsRef.current[index] = node; }}
              type="button"
              role="tab"
              id={`${rootId}-tab-${index}`}
              aria-selected={on}
              aria-controls={`${rootId}-panel`}
              tabIndex={on ? 0 : -1}
              className="section-rail-item"
              data-on={on ? "1" : undefined}
              onClick={() => onChange?.(item.key)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              <span className="section-rail-dot" data-tone={tone} aria-hidden="true" />
              <span className="section-rail-label">{item.label}</span>
              {optional
                ? filled > 0 && <span className="section-rail-count">กรอก {filled}</span>
                : total > 0 && <span className="section-rail-count">{filled}/{total}</span>}
            </button>
          );
        })}
      </div>
      <div className="section-rail-body" role="tabpanel" id={`${rootId}-panel`}>
        {children}
      </div>
    </div>
  );
}
