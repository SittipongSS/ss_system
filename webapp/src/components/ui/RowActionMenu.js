"use client";
// เมนู "..." ท้ายแถวตาราง — ที่เก็บ action ที่ไม่ใช่ก้าวถัดไป
//
// มติผู้ใช้ 2026-08-01: แถวรายการเหลือ **ปุ่มก้าวถัดไป 1 ปุ่ม + เมนูนี้** ที่เหลือ
// (ตีกลับ / ไม่ไปต่อ / แก้ไข / ลบ) ยุบเข้ามาในเมนู — ของเดิมเรียงปุ่ม 3 + ไอคอน 2
// กินความกว้าง ~345px จนคอลัมน์อื่นถูกบีบ และอ่านไม่ออกว่าอันไหนคือสิ่งที่ต้องทำ
//
// ตั้งใจให้ generic (ไม่ผูกกับ lifecycle) เพราะยังมีหน้ารายการอีก ~24 หน้าที่รอย้ายมา
// ใช้ท่านี้ — หน้าที่ไม่มี lifecycle ก็ส่ง items ตรง ๆ ได้
//
// ⚠️ ต้องเปิดผ่าน portal + position:fixed เหมือน ui-select-menu/FilterPopover —
// วางเป็น absolute ในแถวจะโดน `overflow` ของกล่องตาราง (TableScroll) ตัดหายทันที

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import Button from "@/components/ui/Button";
import styles from "./RowActionMenu.module.css";

const MENU_WIDTH = 232;

/**
 * @param items  [{ id, label, icon, tone, disabled, disabledReason, onClick, separatorBefore }]
 *               tone: "neutral" | "warning" | "danger" — คุมสีข้อความ/ไอคอนของรายการ
 * @param label  ข้อความ aria ของปุ่มเปิด (ควรบอกว่าเป็นของแถวไหน)
 */
export default function RowActionMenu({ items = [], label = "การจัดการอื่น", busy = false, className = "" }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const visible = items.filter((item) => item && item.visible !== false);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.querySelector("button")?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = menuRef.current?.offsetHeight || 0;
      const roomBelow = window.innerHeight - rect.bottom;
      const above = height > 0 && roomBelow < height + 12 && rect.top > roomBelow;
      const next = {
        position: "fixed",
        // ชิดขวาให้ตรงกับปุ่ม แต่ไม่ให้ทะลุขอบจอ
        left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
        width: MENU_WIDTH,
        zIndex: "var(--z-portal-menu)",
        maxHeight: Math.max(120, (above ? rect.top : roomBelow) - 14),
      };
      if (above) next.bottom = window.innerHeight - rect.top + 6;
      else next.top = rect.bottom + 6;
      setStyle(next);
    };
    const onDown = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        close(false); // กดที่อื่น = ไม่ต้องดึงโฟกัสกลับ ผู้ใช้ตั้งใจไปที่อื่นแล้ว
      }
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    };
    place();
    // วัดซ้ำหลังเมนูได้ความสูงจริง — รอบแรก offsetHeight ยังเป็น 0
    const raf = requestAnimationFrame(place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close]);

  // เปิดแล้วโฟกัสรายการแรกที่กดได้ — คีย์บอร์ดจะได้ไม่ต้องไล่ tab จากศูนย์
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector("[role='menuitem']:not([disabled])");
    first?.focus();
  }, [open, style]);

  if (!visible.length) return null;

  /* ลูกศรขึ้น/ลงวนในเมนู — พฤติกรรมมาตรฐานของ role="menu" ที่คนคาดหวัง
     (Tab ปล่อยให้หลุดออกไปตามปกติ ไม่ดักไว้) */
  const onMenuKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = [...menuRef.current.querySelectorAll("[role='menuitem']:not([disabled])")];
    if (!nodes.length) return;
    const at = nodes.indexOf(document.activeElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    nodes[(at + step + nodes.length) % nodes.length].focus();
  };

  const run = (item) => {
    if (item.disabled) return;
    close(false);
    item.onClick?.();
  };

  const menu = (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={style || { position: "fixed", left: -9999, top: 0, width: MENU_WIDTH }}
      onKeyDown={onMenuKeyDown}
    >
      {visible.map((item) => (
        <div key={item.id} className={item.separatorBefore ? styles.group : undefined}>
          <button
            type="button"
            role="menuitem"
            className={`${styles.item} ${styles[item.tone || "neutral"] || ""}`.trim()}
            disabled={busy || item.disabled}
            title={item.disabledReason || undefined}
            onClick={() => run(item)}
          >
            {item.icon ? <item.icon size={15} aria-hidden="true" /> : <span className={styles.noIcon} />}
            <span className={styles.itemLabel}>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );

  /* ปุ่มเปิดห่อด้วย <span> แล้ววัดตำแหน่งจาก span — ท่าเดียวกับ FilterPopover
     เพราะ Button เป็น function component ที่ยังไม่รับ ref (จะได้ไม่ต้องแก้ primitive กลาง) */
  return (
    <span ref={triggerRef} className={`${styles.trigger} ${className}`.trim()}>
      <Button
        iconOnly
        icon={<MoreHorizontal size={16} aria-hidden="true" />}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      />
      {open && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </span>
  );
}
