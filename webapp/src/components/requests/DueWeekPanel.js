"use client";
// ── ปฏิทินคำสัญญาของฝ่าย — "สัปดาห์นี้ต้องส่งอะไร" (มติผู้ใช้ 2026-08-12 · แบบ ข)
//
// ⭐ **เครื่องมือกันไม่ให้เลยกำหนด ไม่ใช่รายงานว่าเลยไปแล้วกี่ใบ** — ฝ่ายให้วันตอบ
// โดยไม่เห็นว่าวันนั้นรับปากไว้กี่ใบแล้ว · ปฏิทินนี้ตอบคำถามนั้นก่อนจะรับปากใบใหม่
//
// ⚠️ **ตัวเลข "ยังไม่ได้ให้วัน" ต้องอยู่คู่ปฏิทินเสมอ** — วันที่ทำ 8 จาก 15 ใบในคิวจริง
// ยังไม่มีใครให้วัน ⇒ ปฏิทินโล่งกว่าความจริงมาก · ไม่มีตัวเลขนี้คนจะสรุปว่าสัปดาห์นี้ว่าง
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { WorkspaceSection } from "@/components/ui/Workspace";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { dueCalendar, weekRangeText, weekStart } from "@/lib/requests/dueCalendar";
import styles from "./dueWeek.module.css";

export default function DueWeekPanel({
  rows = [],
  todayIso,
  // ที่อยู่ของคิว — ตัวเลข "ยังไม่ได้ให้วัน" กดแล้วต้องไปถึงใบพวกนั้นได้
  queueHref = "/rd/requests",
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const calendar = useMemo(
    () => dueCalendar(rows, { startIso: weekStart(todayIso, offset), todayIso }),
    [rows, todayIso, offset],
  );

  return (
    <WorkspaceSection
      icon={<CalendarClock size={17} />}
      title="ปฏิทินคำสัญญา"
      subtitle="วันที่ฝ่ายรับปากไว้เอง — ดูก่อนรับปากใบใหม่ว่าวันไหนกองหนักแล้ว"
      actions={(
        <div className="flex gap-2 items-center flex-wrap">
          <span className="ui-badge">{calendar.inWeek} ใบในสัปดาห์นี้</span>
          {/* ⚠️ ปุ่มกดไปคิว **ที่กรองไว้แล้ว** ไม่ใช่คิวทั้งกอง — ของที่ยังไม่มีวันคือ
              กองที่ต้องไปให้วัน ไม่ใช่กองที่ต้องไปหาเอง */}
          {calendar.undated > 0 && (
            <Button size="sm" onClick={() => router.push(`${queueHref}?tab=todo&count=undated`)}>
              ยังไม่ได้ให้วัน {calendar.undated}
            </Button>
          )}
          <Button
            iconOnly size="sm" icon={<ChevronLeft size={15} />}
            title="สัปดาห์ก่อน" aria-label="สัปดาห์ก่อน"
            onClick={() => setOffset((n) => n - 1)}
          />
          <Button
            size="sm" disabled={offset === 0} onClick={() => setOffset(0)}
            title="กลับมาสัปดาห์นี้"
          >
            สัปดาห์นี้
          </Button>
          <Button
            iconOnly size="sm" icon={<ChevronRight size={15} />}
            title="สัปดาห์หน้า" aria-label="สัปดาห์หน้า"
            onClick={() => setOffset((n) => n + 1)}
          />
        </div>
      )}
    >
      <div className={styles.rangeRow}>
        <span className={styles.range}>
          {weekRangeText(calendar.start, calendar.end, { fmtDayMonth, fmtDate })}
        </span>
        {/* ใบที่สายจนหลุดสัปดาห์ไปแล้วไม่โผล่ในตาราง — บอกไว้ ไม่ให้หายเงียบ */}
        {calendar.overdue > 0 && (
          <span className={styles.overdueNote}>เลยกำหนดแล้ว {calendar.overdue} ใบ</span>
        )}
      </div>

      <div className={styles.week}>
        {calendar.days.map((day) => (
          <div
            key={day.iso} className={styles.day}
            data-today={day.today ? "" : undefined}
            data-weekend={day.weekend ? "" : undefined}
          >
            <div className={styles.dayHead}>
              {day.label} {day.dayOfMonth}
              {day.today && <span className={styles.todayTag}>วันนี้</span>}
            </div>
            {day.items.map((item) => (
              <button
                type="button" key={item.id} className={styles.job}
                data-overdue={item.overdue ? "" : undefined}
                title={[item.docNo, item.title, item.lines ? `${item.lines} รายการ` : null]
                  .filter(Boolean).join(" · ")}
                onClick={() => router.push(`/requests/${item.id}`)}
              >
                {item.docNo}
                {item.lines > 0 && <span className={styles.jobLines}> · {item.lines}</span>}
                {item.urgent && <span className={styles.jobUrgent}> ด่วน</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </WorkspaceSection>
  );
}
