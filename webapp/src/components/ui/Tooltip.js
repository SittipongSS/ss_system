"use client";
// ── คำอธิบายลอยเมื่อชี้ — พื้นผิวกลางของระบบ ไม่ใช่กล่องของเบราว์เซอร์ ─────────
//
// มติผู้ใช้ 2026-08-24: *"tooltip ปรับดีไซน์ให้เข้ากับดีไซน์กลางหน่อย"*
//
// ⭐ **ทำไมต้องมีคอมโพเนนต์ ทั้งที่ `title` ก็ขึ้นข้อความได้** — `title` ของเบราว์เซอร์
// วาดด้วยระบบปฏิบัติการ: ฟอนต์ สี มุม เงา ไม่ใช่ของเรา · หน่วงก่อนขึ้นประมาณหนึ่ง
// วินาที · ธีมมืดยังได้กล่องขาวของ OS · และขึ้นตรงเคอร์เซอร์ ไม่ได้เกาะกับตัวที่ชี้
// ⇒ ทั้งหน้าเป็นดีไซน์ของเรายกเว้นกล่องนี้กล่องเดียว
//
// ⚠️ **portal ไป body เสมอ** — เซลล์ตารางมีเพดานความกว้าง (--cell-text-max) พร้อม
// `overflow: hidden` ⇒ กล่องที่วาดอยู่ในเซลล์จะถูกตัดขาดครึ่งใบ · และ `position: fixed`
// เฉย ๆ ก็ไม่พอ เพราะบรรพบุรุษที่มี transform/backdrop-filter (แถบบน) กลายเป็น
// containing block ให้ fixed ได้
//
// ⚠️ **ไม่ผูก aria** — กล่องนี้เป็นภาพล้วน (`aria-hidden`) · ที่เรียกใช้อยู่ต้องมี
// ข้อความนั้นใน DOM อยู่แล้ว (เช่น StepTrack ซ่อนป้ายขั้นแบบ visually-hidden)
// ⇒ screen reader อ่านของจริง ไม่ใช่อ่านซ้ำจากกล่องลอย
import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

/* หน่วงก่อนขึ้น — กันกล่องกะพริบตอนลากเมาส์ผ่านหมุดทั้งราง (ห้าขั้นใน 157px)
   ค่าเท่ากับ --motion-standard คือช้าไป กว่าจะขึ้นรู้สึกเหมือนค้าง */
const SHOW_DELAY = 140;
/* ระยะห่างจากตัวที่ชี้ และขอบจอที่กล่องห้ามล้ำ */
const GAP = 8;
const EDGE = 8;

const compose = (theirs, ours) => (event) => { theirs?.(event); ours(event); };

export default function Tooltip({ label, note, children, disabled = false }) {
  const [anchor, setAnchor] = useState(null);
  const timer = useRef(null);
  const tipRef = useRef(null);
  const silent = disabled || (!label && !note);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setAnchor(null);
  }, []);

  /* ⚠️ วัดกรอบของตัวที่ชี้ **ทันทีในตัวจัดการเหตุการณ์** — `event.currentTarget`
     เป็น null แล้วเมื่อ setTimeout ทำงาน */
  const show = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const box = { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnchor(box), SHOW_DELAY);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  /* พิกัดที่คำนวณไว้จะเพี้ยนทันทีที่หน้าเลื่อนหรือจอเปลี่ยนขนาด ⇒ ปิดทิ้ง ง่ายและ
     ตรงกับที่คนคาด (เลื่อนหน้าแล้วกล่องยังลอยตามคือของแปลก)
     ⚠️ `scroll` ต้องดักแบบ capture — ตัวที่เลื่อนจริงคือกรอบตาราง ไม่ใช่ window */
  useEffect(() => {
    if (!anchor) return undefined;
    const onKey = (event) => { if (event.key === "Escape") hide(); };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, hide]);

  /* วางกล่อง **หลังวัดขนาดจริง** — กว้างเท่าไรขึ้นกับข้อความ จึงกึ่งกลางกับตัวที่ชี้
     ล่วงหน้าไม่ได้ · ขึ้นด้านบนก่อน ไม่พอที่ค่อยพลิกลงล่าง แล้วหนีบไม่ให้ล้ำขอบจอ
     ⚠️ เขียนลง style ตรง ๆ ไม่ผ่าน state — ผ่าน state คือเรนเดอร์รอบสองทุกครั้งที่ชี้
     🐞 **ต้องวางใหม่เมื่อกล่องเปลี่ยนขนาด** ไม่ใช่วัดครั้งเดียวจบ — ของจริงที่เจอ:
     ครั้งแรกที่ชี้ Next ยังฉีด CSS ของโมดูลนี้ไม่ทัน กล่องจึงถูกวัดตอนยังไม่มี
     padding/flex (กว้าง 231px แทน 82px) แล้วค้างเยื้องซ้าย 75px · ฟอนต์ที่มาช้า
     ก็ทำแบบเดียวกัน ⇒ ResizeObserver วางใหม่ให้เองเมื่อขนาดจริงมาถึง */
  useLayoutEffect(() => {
    const node = tipRef.current;
    if (!node || !anchor) return undefined;
    const place = () => {
      const box = node.getBoundingClientRect();
      let top = anchor.top - box.height - GAP;
      let side = "top";
      if (top < EDGE) {
        top = anchor.bottom + GAP;
        side = "bottom";
      }
      const centered = anchor.left + anchor.width / 2 - box.width / 2;
      const left = Math.max(EDGE, Math.min(centered, window.innerWidth - EDGE - box.width));
      node.style.top = `${Math.round(top)}px`;
      node.style.left = `${Math.round(left)}px`;
      node.dataset.place = side;
      node.dataset.ready = "true";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [anchor]);

  if (silent) return children;

  return (
    <>
      {cloneElement(children, {
        onMouseEnter: compose(children.props.onMouseEnter, show),
        onMouseLeave: compose(children.props.onMouseLeave, hide),
        onFocus: compose(children.props.onFocus, show),
        onBlur: compose(children.props.onBlur, hide),
      })}
      {anchor
        ? createPortal(
          <div ref={tipRef} className={styles.tip} aria-hidden="true">
            {label ? <span className={styles.label}>{label}</span> : null}
            {note ? <span className={styles.note}>{note}</span> : null}
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
