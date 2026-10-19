"use client";
// ── ปฏิทินคำสัญญาของฝ่าย — "สัปดาห์นี้ต้องส่งอะไร" (มติผู้ใช้ 2026-08-12 · แบบ ข)
//
// ⭐ **เครื่องมือกันไม่ให้เลยกำหนด ไม่ใช่รายงานว่าเลยไปแล้วกี่ใบ** — ฝ่ายให้วันตอบ
// โดยไม่เห็นว่าวันนั้นรับปากไว้กี่ใบแล้ว · ปฏิทินนี้ตอบคำถามนั้นก่อนจะรับปากใบใหม่
//
// ⚠️ **ตัวเลข "ยังไม่ได้ให้วัน" ต้องอยู่คู่ปฏิทินเสมอ** — วันที่ทำ 8 จาก 15 ใบในคิวจริง
// ยังไม่มีใครให้วัน ⇒ ปฏิทินโล่งกว่าความจริงมาก · ไม่มีตัวเลขนี้คนจะสรุปว่าสัปดาห์นี้ว่าง
//
// ⭐ **"ยังไม่ได้ให้วัน" / "เลยกำหนดแล้ว" นับเฉพาะตาฝ่าย** (มติเจ้าของ 19/10 · ตรวจตัวกรอง 08/10 M6) —
// ผู้เรียกส่ง `undated` · `overdue` (`{ dept, requester }` จาก `deptCountByTurn`) ชุดเดียวกับแถบเตือนบนหน้า
// ⇒ ปฏิทินกับแถบพูดเลขเดียวกัน · ใบตาผู้ขอที่ไม่มีวันมีปุ่มรองของมันเองพาไปแท็บรอผู้ขอ
// 🐞 เดิมนับจาก `dueCalendar` (ทุกใบที่ยังไม่จบ) ⇒ "ยังไม่ได้ให้วัน 15" เปิดแท็บรอฝ่ายตอบเจอ 9
//
// ⭐ **สีบนช่องรายวันใช้ตัวตัดสินเดียวกับตัวเลข** (`matchesTurnCount`) — แดง = ใบที่นับเข้า "เลยกำหนดแล้ว"
// (ตาฝ่าย) เท่านั้น · ใบตาผู้ขอยังอยู่ในวันที่รับปากไว้ แต่เป็นเส้นประจาง ไม่แดงแม้เลยวัน
// 🐞 เดิมแดงตาม `dueCalendar` (ทุกใบที่เลยวัน ไม่ดูตา) ⇒ ตาฝ่าย 0 · กล่องเทาบอก "ไม่มีงานที่เลยวัน"
//    แต่ช่องรายวันข้างล่างแดงสองใบ (รีวิว 19/10)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { WorkspaceSection } from "@/components/ui/Workspace";
import { fmtDate, fmtDayMonth } from "@/lib/format";
import { dueCalendar, weekRangeText, weekStart } from "@/lib/requests/dueCalendar";
import { deptCalendarMarks, deptTurnCountHref } from "@/lib/requests/deptOverview";
import styles from "./dueWeek.module.css";

export default function DueWeekPanel({
  rows = [],
  todayIso,
  // ที่อยู่ของคิว — ตัวเลข "ยังไม่ได้ให้วัน" กดแล้วต้องไปถึงใบพวกนั้นได้
  queueHref = "/rd/requests",
  /* `{ dept, requester }` จาก `deptCountByTurn(..., 'undated' | 'overdue')` — **ผู้เรียกต้องส่ง** (ตัวเดียวกับที่
     แถบเตือนของหน้าใช้) · ⚠️ ห้ามกลับไปอ่าน `calendar.undated/overdue` บนจอ: นั่นคือผลรวมสองตาที่ไม่มีลิงก์ไหนเปิดเจอ
     ⚠️ **ไม่มีค่าตั้งต้นโดยตั้งใจ** — ค่าตั้งต้น 0 ทำให้ผู้เรียกที่ลืมส่งได้ปฏิทินที่ไม่มี "ยังไม่ได้ให้วัน" เงียบ ๆ
     (ตัวเลขที่หัวไฟล์บอกว่าต้องอยู่คู่ปฏิทินเสมอ) · ยามซอร์สใน deptOverview.test.mjs บังคับทุกที่ที่เรียกให้ส่งครบ */
  undated,
  overdue,
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const calendar = useMemo(
    () => dueCalendar(rows, { startIso: weekStart(todayIso, offset), todayIso }),
    [rows, todayIso, offset],
  );
  /* ตาใครของแต่ละใบบนช่องรายวัน — แดงเฉพาะใบที่ `matchesTurnCount(…, 'overdue', 'dept')` (ตัวเดียวกับที่นับ
     "เลยกำหนดแล้ว" / หัวแถบเตือน) ⇒ ใบแดงบนปฏิทินเป็นส่วนหนึ่งของตัวเลขนั้นเสมอ ไม่เกินมัน */
  const marks = useMemo(() => deptCalendarMarks(rows, { todayIso }), [rows, todayIso]);
  const weekHasRequesterTurn = calendar.days.some((day) => day.items.some((item) => marks.requesterTurn.has(item.id)));

  return (
    <WorkspaceSection
      icon={<CalendarClock size={17} />}
      title="ปฏิทินคำสัญญา"
      subtitle="วันที่ฝ่ายแจ้งไว้เอง — ดูก่อนแจ้งวันส่งใบใหม่ว่าวันไหนกองหนักแล้ว"
      actions={(
        <div className="flex gap-2 items-center flex-wrap">
          <span className="ui-badge">{calendar.inWeek} ใบในสัปดาห์นี้</span>
          {/* ⚠️ ปุ่มกดไปคิว **ที่กรองไว้แล้ว** ไม่ใช่คิวทั้งกอง — ของที่ยังไม่มีวันคือ
              กองที่ต้องไปให้วัน ไม่ใช่กองที่ต้องไปหาเอง
              ⭐ ปุ่มหลัก = ตาฝ่ายเท่านั้น (แท็บรอฝ่ายตอบ) · ใบตาผู้ขอเป็นปุ่มรอง (quiet) ไปแท็บรอผู้ขอ + ตัวกรองเดียวกัน
              — แท็บนั้นมีตัวเลข "ยังไม่ได้ให้วัน" บนแถบอยู่แล้ว ⇒ เลขบนปุ่ม = แถวที่เปิดเจอทั้งสองปุ่ม */}
          {undated.dept > 0 && (
            <Button size="sm" onClick={() => router.push(deptTurnCountHref("dept", "undated", { queueHref }))}>
              ยังไม่ได้ให้วัน {undated.dept}
            </Button>
          )}
          {undated.requester > 0 && (
            <Button
              size="sm" variant="quiet"
              title="ใบที่ส่งแล้ว รอผู้ขอทำต่อ และไม่มีวันที่รับปากไว้ — ไม่ใช่งานค้างของฝ่าย"
              onClick={() => router.push(deptTurnCountHref("requester", "undated", { queueHref }))}
            >
              รอผู้ขอ · ยังไม่ได้ให้วัน {undated.requester}
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
        {/* ใบที่สายจนหลุดสัปดาห์ไปแล้วไม่โผล่ในตาราง — บอกไว้ ไม่ให้หายเงียบ
            ⭐ ตาฝ่ายเท่านั้น = เลขเดียวกับหัวแถบเตือน "เลยวันที่รับปากไว้" ของหน้า (มติเจ้าของ 19/10) · ใบตาผู้ขอ
            ที่เลยวันมีปุ่มของมันบนแถบเตือนแล้ว ไม่พูดซ้ำที่นี่ */}
        {overdue.dept > 0 && (
          <span className={styles.overdueNote}>เลยกำหนดแล้ว {overdue.dept} ใบ</span>
        )}
        {/* ใบเส้นประบนช่องรายวันต้องมีคำอธิบาย — ไม่งั้นใบตาผู้ขอที่เลยวันแต่ไม่แดงอ่านเหมือนสีผิด */}
        {weekHasRequesterTurn && (
          <span className={styles.turnNote}>เส้นประ = ส่งแล้ว รอผู้ขอทำต่อ · ไม่นับเป็นงานค้างของฝ่าย</span>
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
            {day.items.map((item) => {
              const requesterTurn = marks.requesterTurn.has(item.id);
              return (
                <button
                  type="button" key={item.id} className={styles.job}
                  /* ⚠️ ไม่ใช่ `item.overdue` ของ `dueCalendar` (เลยวันทุกตา) — ดูคอมเมนต์ `marks` */
                  data-overdue={marks.deptOverdue.has(item.id) ? "" : undefined}
                  data-turn={requesterTurn ? "requester" : undefined}
                  title={[item.docNo, item.title, item.lines ? `${item.lines} รายการ` : null,
                    requesterTurn ? "ส่งแล้ว รอผู้ขอทำต่อ" : null]
                    .filter(Boolean).join(" · ")}
                  onClick={() => router.push(`/requests/${item.id}`)}
                >
                  {item.docNo}
                  {item.lines > 0 && <span className={styles.jobLines}> · {item.lines}</span>}
                  {item.urgent && <span className={styles.jobUrgent}> ด่วน</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </WorkspaceSection>
  );
}
