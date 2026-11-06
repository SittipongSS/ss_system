"use client";
// ── ตารางห้อง Studio ทั้งวัน — 3 ห้อง × 09:00–18:00 ช่องละ 30 นาที (แบบ ก · มติเจ้าของ 06/11/2026) ──
//
// เห็นนัดของทุกห้องทั้งวันเป็นก้อน ช่องที่ขาวคือว่าง · กดช่องว่างแล้วลากไปถึงเวลาจบ (กดเฉย ๆ = 30 นาที
// แล้วปรับความยาวที่แถวสรุปข้างล่าง) · ลากทับนัดคนอื่นไม่ได้ — หยุดที่ขอบนัดพร้อมบอกว่าชนนัดไหน
// กติกาทั้งหมดอยู่ที่ lib/sales/appointmentGrid.js (เทสต์ได้) — ไฟล์นี้วาดกับรับเมาส์/นิ้วอย่างเดียว
//
// ⚠️ ตำแหน่งก้อนมาจาก `data-col`/`data-span`/`data-row` ที่ CSS module แปลเป็น grid-column/grid-row
//    ไม่ใช่ inline style (audit:ui นับ `style={{` เป็นหนี้ · แพตเทิร์นเดียวกับรางชั่วโมงของกำหนดการของฉัน)
// ⚠️ มือถือ: ตารางเลื่อนซ้าย–ขวาได้ (`touch-action: pan-x`) ⇒ นิ้วลากเลือกช่วงไม่ได้ — แตะ = 30 นาที
//    แล้วกดปุ่ม 1 / 1.5 / 2 ชม. ที่แถวสรุปแทน

import { useRef, useState } from "react";
import { Flag } from "lucide-react";
import {
  GRID_OPEN, GRID_SLOTS, GRID_STEP, dragRange, freeUntil, gridBlocks, hhmm, slotOf,
} from "@/lib/sales/appointmentGrid";
import { STUDIO_ROOMS, STUDIO_ROOM_LABELS } from "@/lib/sales/leadAppointments";
import styles from "./LeadAppointmentFields.module.css";

const SLOTS = Array.from({ length: GRID_SLOTS }, (_, i) => i);

export default function RoomTimeline({
  rows = [],
  date,
  leadId = null,
  selection = null,     // { room, start, end } นาทีไทย · ห้องเดียวกับแถว
  onSelect,             // ({ room, start, end }) => void
  pastBefore = null,    // นาทีที่ "เลยเวลาแล้ว" ของวันนี้ (null = ไม่ใช่วันนี้)
  disabled = false,
}) {
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [hint, setHint] = useState({ text: "", bad: false });
  const { blocks, outside } = gridBlocks(rows, date, { leadId });
  const countOf = (room) => blocks.filter((block) => block.room === room && !block.own).length
    + outside.filter((row) => row.room === room && !row.own).length;

  const cellFrom = (event) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const cell = el?.closest?.("[data-cell]");
    if (!cell || !gridRef.current?.contains(cell)) return null;
    return { room: cell.dataset.room, slot: Number(cell.dataset.slot) };
  };
  /* ก้อนนัดใต้เมาส์/นิ้ว — ก้อนบังช่องข้างใต้ไว้ (elementFromPoint ได้ก้อน ไม่ใช่ช่อง) ⇒ ลากเข้าไปบนก้อน
     ต้องยังบอกว่าลากต่อไม่ได้ ไม่งั้นข้อความค้างเป็นช่วงล่าสุดที่ "ผ่าน" แล้วดูเหมือนไม่มีอะไรขวาง */
  const blockFrom = (event) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const block = el?.closest?.("[data-block]");
    return block && gridRef.current?.contains(block) ? blocks.find((b) => b.id === block.dataset.block) || null : null;
  };

  const begin = (event, room, slot) => {
    if (disabled || event.button > 0) return;
    const range = dragRange(rows, date, room, slot, slot, { leadId });
    if (!range) return;
    dragRef.current = { room, anchor: slot };
    gridRef.current?.setPointerCapture?.(event.pointerId);
    onSelect?.({ room, start: range.start, end: range.end });
  };
  const move = (event) => {
    const hit = cellFrom(event);
    const drag = dragRef.current;
    if (!drag) {
      if (!hit) return;
      const start = GRID_OPEN + hit.slot * GRID_STEP;
      const until = freeUntil(rows, date, hit.room, start, { leadId });
      if (until > start) setHint({ text: `${STUDIO_ROOM_LABELS[hit.room]} ว่างตั้งแต่ ${hhmm(start)} ถึง ${hhmm(until)} — กดเพื่อเริ่มนัดตรงนี้`, bad: false });
      return;
    }
    if (!hit) {
      const block = blockFrom(event);
      if (block && block.room === drag.room && !block.own) {
        setHint({ text: `ลากต่อไม่ได้ — ${STUDIO_ROOM_LABELS[block.room]} มีนัด ${hhmm(block.start)}–${hhmm(block.end)}${block.contactName ? ` (${block.contactName})` : ""}`, bad: true });
      }
      return;
    }
    if (hit.room !== drag.room) return;
    const range = dragRange(rows, date, drag.room, drag.anchor, hit.slot, { leadId });
    if (!range) return;
    onSelect?.({ room: drag.room, start: range.start, end: range.end });
    setHint(range.capped
      ? { text: `ลากต่อไม่ได้ — ${STUDIO_ROOM_LABELS[drag.room]} มีนัดอื่น${hit.slot >= drag.anchor ? `เริ่ม ${hhmm(range.limit)}` : `จบ ${hhmm(range.limit)}`}`, bad: true }
      : { text: `${STUDIO_ROOM_LABELS[drag.room]} ${hhmm(range.start)}–${hhmm(range.end)}`, bad: false });
  };
  const end = () => { dragRef.current = null; };

  const selCol = selection ? slotOf(Math.max(selection.start, GRID_OPEN)) : null;
  const selSpan = selection && selCol != null
    ? Math.max(1, Math.min(GRID_SLOTS - selCol, Math.ceil((selection.end - GRID_OPEN) / GRID_STEP) - selCol))
    : 0;

  return (
    <div className={styles.timelineWrap}>
      <div className={styles.timelineScroll}>
        <div
          ref={gridRef}
          className={styles.timeline}
          role="grid"
          aria-label="ตารางห้อง Studio ทั้งวัน"
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={() => { if (!dragRef.current) setHint({ text: "", bad: false }); }}
        >
          <div className={styles.tlCorner} aria-hidden="true" />
          {SLOTS.map((slot) => (
            <div key={`h-${slot}`} className={styles.tlHead} data-col={slot} data-hour={slot % 2 === 0 ? "1" : undefined} aria-hidden="true">
              {slot % 2 === 0 ? hhmm(GRID_OPEN + slot * GRID_STEP) : ""}
            </div>
          ))}

          {STUDIO_ROOMS.map((room, index) => (
            <div key={room} className={styles.tlRoom} data-row={index}>
              {STUDIO_ROOM_LABELS[room]}
              <small>{countOf(room) ? `${countOf(room)} นัด` : "ว่างทั้งวัน"}</small>
            </div>
          ))}

          {STUDIO_ROOMS.map((room, index) => SLOTS.map((slot) => {
            const start = GRID_OPEN + slot * GRID_STEP;
            const past = pastBefore != null && start + GRID_STEP <= pastBefore;
            return (
              <button
                key={`${room}-${slot}`}
                type="button"
                className={styles.tlCell}
                data-cell="1"
                data-room={room}
                data-slot={slot}
                data-row={index}
                data-col={slot}
                data-hour={slot % 2 === 0 ? "1" : undefined}
                data-past={past ? "1" : undefined}
                disabled={disabled}
                aria-label={`${STUDIO_ROOM_LABELS[room]} ${hhmm(start)}${past ? " (เลยเวลาแล้ว)" : ""}`}
                onPointerDown={(event) => begin(event, room, slot)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  const range = dragRange(rows, date, room, slot, slot, { leadId });
                  if (range) onSelect?.({ room, start: range.start, end: range.end });
                }}
              />
            );
          }))}

          {blocks.map((block) => (
            <div
              key={block.id}
              className={styles.tlBlock}
              data-block={block.id}
              data-row={block.roomIndex}
              data-col={block.col}
              data-span={block.span}
              data-pending={block.source === "intake" ? "1" : undefined}
              data-own={block.own ? "1" : undefined}
              title={blockTitle(block)}
              aria-label={blockTitle(block)}
              onPointerEnter={() => { if (!dragRef.current) setHint({ text: blockTitle(block), bad: false }); }}
            >
              <b>{block.own ? "นัดของลีดนี้" : block.contactName || "นัดของลีดทีมอื่น"}</b>
              <span>{hhmm(block.start)}–{hhmm(block.end)}{block.source === "intake" ? " · รอยืนยัน" : ""}</span>
            </div>
          ))}

          {selection && selCol != null && (
            <div
              className={styles.tlSelection}
              data-row={STUDIO_ROOMS.indexOf(selection.room)}
              data-col={selCol}
              data-span={selSpan}
              aria-hidden="true"
            >
              <Flag size={12} aria-hidden="true" />
              <span>{hhmm(selection.start)}–{hhmm(selection.end)}</span>
            </div>
          )}
        </div>
      </div>

      <small className={styles.tlHint} data-bad={hint.bad ? "1" : undefined} aria-live="polite">
        {hint.text || "กดช่องว่างเพื่อเริ่ม แล้วลากไปถึงเวลาจบ · ชี้ที่ช่องเพื่อดูว่าว่างถึงกี่โมง"}
      </small>
      {/* นัดนอก 09:00–18:00 ต้องยังเห็น ไม่ใช่หายไปเพราะตารางไม่มีช่องให้วาง */}
      {outside.length > 0 && (
        <small className={styles.tlOutside}>
          นอกช่วง 09:00–18:00: {outside.map((row) => `${STUDIO_ROOM_LABELS[row.room]} ${hhmm(row.start)}–${hhmm(row.end)}`).join(" · ")}
        </small>
      )}
      <div className={styles.tlLegend} aria-hidden="true">
        <span><i data-kind="free" />ว่าง</span>
        <span><i data-kind="busy" />มีนัดแล้ว</span>
        <span><i data-kind="pending" />MKT จองไว้ รอ AE ยืนยัน</span>
        <span><i data-kind="sel" />นัดที่กำลังเลือก</span>
        <span><i data-kind="past" />เลยเวลาแล้ว</span>
      </div>
    </div>
  );
}

function blockTitle(block) {
  const who = block.own ? "นัดของลีดนี้ (ไม่นับว่าชน)" : block.contactName || "นัดของลีดทีมอื่น";
  const by = block.source === "intake" ? `จองโดย ${block.createdByName || "MKT"} · รอ AE ยืนยัน` : "AE ยืนยันแล้ว";
  return `${STUDIO_ROOM_LABELS[block.room]} ${hhmm(block.start)}–${hhmm(block.end)} · ${who} · ${by}`;
}
