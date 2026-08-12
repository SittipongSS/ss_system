"use client";

import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import { prevPeriod, nextPeriod, windowForPeriod, bpOfWindow, toKind } from "@/lib/sales/performanceMath";
import { PERIOD_KINDS, periodOptions } from "./shared";

/* 🕒 แถบคุมของแท็บผลงานขาย — **งวดเดียวและนโยบายทบยอดเดียว ใช้ทั้งแท็บ**
 *
 * ⭐ ยกออกมาเป็นแถบของตัวเองเพราะของเดิมกระจายอยู่สามที่แล้วขัดกันเอง (2026-08-12):
 * · แถบความคืบหน้ามี "เดือนนี้/ไตรมาสนี้/ทั้งปี" เป็น `useState` ในตัวเอง — ล็อกอยู่ที่
 *   เดือนปัจจุบัน เลื่อนไปเดือนอื่นไม่ได้ และ **ไม่เข้า URL** แชร์ลิงก์แล้วมุมมองไม่ตาม
 * · ตารางติดตามมี "เดือน/ไตรมาส/ปี" + ปุ่มเลื่อนงวด ผูกกับ `bp` ใน URL
 * · กดของชุดหนึ่งอีกชุดไม่ขยับ ⇒ สองการ์ดที่วางซ้อนกันแสดงคนละงวดโดยไม่มีอะไรบอก
 *
 * ⚠️ สวิตช์ทบยอดเคยอยู่ในหัวการ์ดแถบความคืบหน้า เหมือนคุมแค่การ์ดนั้น ทั้งที่จริง
 * เพิ่มสองคอลัมน์ในตารางติดตาม · เปลี่ยนหัวคอลัมน์ · และเสกแผงทบยอดขึ้นมาทั้งแผง
 * — ที่ของมันคือแถบระดับแท็บ ไม่ใช่หัวการ์ดใบใดใบหนึ่ง
 */
export default function PeriodBar({ year, win, onBpChange, carry, onCarryChange }) {
  const bp = bpOfWindow(win);
  const prev = prevPeriod(bp);
  const next = nextPeriod(bp);
  // งวดต้องอยู่ในปีที่เลือกเสมอ — ข้อมูล matrix เป็นรายปี ข้ามปีแล้วไม่มีอะไรให้แสดง
  const canPrev = windowForPeriod(prev)?.year === year;
  const canNext = windowForPeriod(next)?.year === year;

  return (
    <section className="glass-panel" style={{ padding: "10px 14px" }}>
      <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
        <span className="flex items-center gap-1.5" style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)" }}>
          <CalendarRange size={16} aria-hidden="true" /> งวด
        </span>
        <Segmented
          ariaLabel="ชนิดงวด"
          options={PERIOD_KINDS}
          value={win.kind}
          onChange={(kind) => onBpChange(toKind(bp, kind))}
        />
        {win.kind !== "year" && (
          <div className="flex items-center" style={{ gap: 4 }}>
            <button type="button" className="btn ghost sm icon-only" disabled={!canPrev} onClick={() => onBpChange(prev)} aria-label="งวดก่อนหน้า">
              <ChevronLeft size={15} aria-hidden="true" />
            </button>
            <Select className="premium-select" value={bp} onChange={(e) => onBpChange(e.target.value)} aria-label="เลือกงวด" style={{ width: 130 }}>
              {periodOptions(win.kind, year).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <button type="button" className="btn ghost sm icon-only" disabled={!canNext} onClick={() => onBpChange(next)} aria-label="งวดถัดไป">
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="spacer" />
        <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>นโยบายเป้า</span>
        <Segmented
          ariaLabel="โหมดทบยอด"
          options={[
            { value: true, label: "ทบยอด", title: "ยอดที่ขาดของงวดก่อนทบเข้างวดนี้" },
            { value: false, label: "เป้าปกติ", title: "เทียบเป้าของงวดตรง ๆ ไม่ทบ" },
          ]}
          value={carry}
          onChange={onCarryChange}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
        งวดนี้ใช้กับแถบความคืบหน้าและตารางติดตามด้านล่าง · นโยบายเป้ามีผลทั้งแท็บ
        {carry ? " — ตอนนี้ทบยอด: งวดไหนขาด ยอดที่ขาดทบเข้างวดถัดไป" : " — ตอนนี้เป้าปกติ: เทียบเป้าของงวดตรง ๆ"}
      </div>
    </section>
  );
}
