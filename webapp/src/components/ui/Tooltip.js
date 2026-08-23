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
// มีสองทางเข้า — เลือกตามว่ารู้จักตัวที่ชี้ตอนเขียนโค้ดไหม:
//   `<Tooltip label note>` ครอบ element ที่รู้จัก (เช่นหมุดในราง StepTrack)
//   `<TooltipHost />`      ตัวเดียวทั้งแอป ดักให้ **ทุกเซลล์ตารางที่ถูกตัด** และ
//                          ทุก element ที่ติด `data-tip` โดยไม่ต้องแตะที่เรียกใช้
//
// ⚠️ **portal ไป body เสมอ** — เซลล์ตารางมีเพดานความกว้าง (--cell-text-max) พร้อม
// `overflow: hidden` ⇒ กล่องที่วาดอยู่ในเซลล์จะถูกตัดขาดครึ่งใบ · และ `position: fixed`
// เฉย ๆ ก็ไม่พอ เพราะบรรพบุรุษที่มี transform/backdrop-filter (แถบบน) กลายเป็น
// containing block ให้ fixed ได้
//
// ⚠️ **ไม่ผูก aria** — กล่องนี้เป็นภาพล้วน (`aria-hidden`) · ข้อความที่มันพูดต้องมี
// อยู่ใน DOM อยู่แล้ว (ป้ายขั้นที่ซ่อนแบบ visually-hidden · ข้อความเต็มในเซลล์ที่ถูก
// ตัดด้วย CSS ยังอยู่ครบ) ⇒ screen reader อ่านของจริง ไม่ใช่อ่านซ้ำจากกล่องลอย
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

const anchorBox = (element) => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width };
};

/* ── กล่องจริง ────────────────────────────────────────────────────────────
   วางกล่อง **หลังวัดขนาดจริง** — กว้างเท่าไรขึ้นกับข้อความ จึงกึ่งกลางกับตัวที่ชี้
   ล่วงหน้าไม่ได้ · ขึ้นด้านบนก่อน ไม่พอที่ค่อยพลิกลงล่าง แล้วหนีบไม่ให้ล้ำขอบจอ
   ⚠️ เขียนลง style ตรง ๆ ไม่ผ่าน state — ผ่าน state คือเรนเดอร์รอบสองทุกครั้งที่ชี้
   🐞 **ต้องวางใหม่เมื่อกล่องเปลี่ยนขนาด** ไม่ใช่วัดครั้งเดียวจบ — ของจริงที่เจอ:
   ครั้งแรกที่ชี้ Next ยังฉีด CSS ของโมดูลนี้ไม่ทัน กล่องจึงถูกวัดตอนยังไม่มี
   padding/flex (กว้าง 231px แทน 82px) แล้วค้างเยื้องซ้าย 75px · ฟอนต์ที่มาช้า
   ก็ทำแบบเดียวกัน ⇒ ResizeObserver วางใหม่ให้เองเมื่อขนาดจริงมาถึง */
function TipBox({ anchor, label, note }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const node = ref.current;
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

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className={styles.tip} aria-hidden="true">
      {label ? <span className={styles.label}>{label}</span> : null}
      {/* ไม่มีหัว = กล่องนี้พูดข้อความของตัวมันเอง (เซลล์ที่ถูกตัด) ⇒ สีหลัก
          มีหัว = บรรทัดนี้เป็นคำขยายของหัว ⇒ สีรอง */}
      {note ? <span className={label ? styles.note : styles.plain}>{note}</span> : null}
    </div>,
    document.body,
  );
}

/* ── ตัวจับเวลา + ตัวปิด ที่ทั้งสองทางเข้าใช้ร่วมกัน ─────────────────────── */
function useTipAnchor() {
  const [anchor, setAnchor] = useState(null);
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setAnchor(null);
  }, []);

  const showAfterDelay = useCallback((box) => {
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

  return { anchor, hide, showAfterDelay };
}

/* ── ทางเข้าที่ 1 · ครอบ element ที่รู้จักตอนเขียนโค้ด ───────────────────── */
export default function Tooltip({ label, note, children, disabled = false }) {
  const { anchor, hide, showAfterDelay } = useTipAnchor();
  const silent = disabled || (!label && !note);

  /* ⚠️ วัดกรอบของตัวที่ชี้ **ทันทีในตัวจัดการเหตุการณ์** — `event.currentTarget`
     เป็น null แล้วเมื่อ setTimeout ทำงาน */
  const show = useCallback((event) => showAfterDelay(anchorBox(event.currentTarget)), [showAfterDelay]);

  if (silent) return children;

  return (
    <>
      {cloneElement(children, {
        onMouseEnter: compose(children.props.onMouseEnter, show),
        onMouseLeave: compose(children.props.onMouseLeave, hide),
        onFocus: compose(children.props.onFocus, show),
        onBlur: compose(children.props.onBlur, hide),
      })}
      {anchor ? <TipBox anchor={anchor} label={label} note={note} /> : null}
    </>
  );
}

/* ── ทางเข้าที่ 2 · ตัวเดียวทั้งแอป ดักจาก DOM ───────────────────────────
   ⭐ **เซลล์ที่ถูกตัดไม่ต้องประกาศอะไรเลย** (มติผู้ใช้ 2026-08-24) — เดิม Table.js
   เดินไล่ทุก `<td>` ด้วย MutationObserver + ResizeObserver แล้วเติม `title` ให้ช่อง
   ที่ถูกตัด · คิดตอนชี้แทนได้ผลเท่ากันโดยไม่ต้องเฝ้าอะไรเลย และครอบคลุมตาราง
   ชั้นเก่า (`.premium-table`) ที่ไม่ได้ผ่าน TableScroll ด้วย
   ⚠️ **ไม่แตะช่องที่คนอื่นตั้ง `title` ไว้เอง** — เจ้าของช่องตั้งใจให้ tooltip พูด
   อย่างอื่น (เช่นวันที่ที่โชว์เวลาเต็ม) กล่องนี้ต้องไม่ไปทับ */
const TIP_SELECTOR = "[data-tip], td";

function tipFor(element) {
  if (element.dataset.tip) {
    return { label: element.dataset.tipLabel || null, note: element.dataset.tip };
  }
  if (element.title) return null;
  /* +1 = กันเศษทศนิยมของการวัด ไม่ใช่ค่าเผื่อ */
  if (element.scrollWidth <= element.clientWidth + 1) return null;
  /* ⚠️ `innerText` ไม่ใช่ `textContent` — เซลล์ในระบบนี้ซ้อนสองบรรทัดเป็นปกติ
     (รหัสบน · ชื่อล่าง) · textContent เชื่อมทุกบรรทัดติดกันเป็นพืดอ่านไม่ออก
     ส่วน innerText ให้ขึ้นบรรทัดตามที่ตาเห็น (คู่กับ white-space: pre-line) */
  const text = element.innerText.trim();
  return text ? { label: null, note: text } : null;
}

export function TooltipHost() {
  const { anchor, hide, showAfterDelay } = useTipAnchor();
  const [content, setContent] = useState(null);
  const current = useRef(null);

  useEffect(() => {
    const onOver = (event) => {
      const target = event.target instanceof Element ? event.target.closest(TIP_SELECTOR) : null;
      if (!target) {
        if (current.current) { current.current = null; hide(); }
        return;
      }
      /* ขยับเมาส์ในตัวเดิม = ไม่ต้องเริ่มจับเวลาใหม่ ไม่งั้นกล่องไม่มีวันขึ้น */
      if (target === current.current) return;
      current.current = target;
      const tip = tipFor(target);
      if (!tip) { hide(); return; }
      setContent(tip);
      showAfterDelay(anchorBox(target));
    };
    const onOut = (event) => {
      if (event.relatedTarget && current.current?.contains(event.relatedTarget)) return;
      current.current = null;
      hide();
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, [hide, showAfterDelay]);

  if (!anchor || !content) return null;
  return <TipBox anchor={anchor} label={content.label} note={content.note} />;
}
