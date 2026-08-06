"use client";
// ── ตัวเลือกสองชั้นของระบบ: กลุ่ม (ซ้าย) → รายการ (ขวา) ค้นได้ทั้งสองฝั่ง ─────
//
// ⭐ **ตัวกลางตัวเดียวของทั้งระบบ** (มติผู้ใช้ 2026-08-06) — เกิดจากตัวเลือกดีล/โครงการ
// ที่ทำแยกไว้ในฟอร์มงาน แล้วพบว่าจุดอื่นในระบบมีปัญหาเดียวกันเป๊ะ: ของสองชั้นที่ถูก
// วางเป็น "สองช่องเรียงกัน" (เลือกกล่องซ้ายก่อน ช่องขวาถึงกดได้) ซึ่งบังคับให้ผู้ใช้
// ต้องรู้คำตอบชั้นบนก่อน ทั้งที่เขาจำได้แค่ชื่อของชั้นล่าง
//
// เลือกใช้เมื่อ: รายการยาว (หลายสิบ–ร้อย) + มีการจัดกลุ่มตามธรรมชาติ + ผู้ใช้จำ
// "ชื่อของ" ได้แต่ไม่จำว่ามันอยู่กลุ่มไหน · ถ้ารายการสั้นหรือชั้นเดียว ใช้
// SearchableSelect ตามเดิม (อย่ายกของหนักมาใส่ช่องที่มี 5 ตัวเลือก)
//
// สิ่งที่ตัวนี้รับผิดชอบและอย่าไปทำซ้ำที่อื่น:
//   · วางแผงแบบ portal + พลิกขึ้นบนเมื่อที่ข้างล่างไม่พอ (เหมือน ui-select-menu)
//   · ความสูงคงที่ ไม่ยืดหดตามผลค้น — แผงที่หดจะ "กระโดด" หนีมือผู้ใช้
//   · ห้ามบีบช่องค้น/แถว (flex: 0 0 auto) — flex item ในคอลัมน์สูงคงที่จะถูกบีบ
//     เตี้ยลงก่อน scroll ทำให้ความสูงเปลี่ยนไปมาระหว่างพิมพ์ (ผู้ใช้ทัก 2026-08-06)
//   · กติกาค้นกลาง (lib/ui/pickerSearch) — หลายคำต้องเจอทุกคำ
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { filterByQuery } from "@/lib/ui/pickerSearch";
import styles from "./TwoPanePicker.module.css";

export default function TwoPanePicker({
  // [{ key, label, meta?, icon?, search?, alwaysVisible?, items: [{ value, label, meta?, search? }] }]
  groups = [],
  value = "",
  onChange,                 // (value, item) => void
  disabled = false,
  clearable = false,
  clearLabel = "— ไม่เลือก —",
  placeholder = "— เลือก —",
  headLabel,
  headMeta,
  groupSearchPlaceholder = "ค้นหากลุ่ม…",
  itemSearchPlaceholder = "ค้นหา…",
  groupEmptyText = "ไม่พบกลุ่มที่ตรงกับคำค้น",
  itemEmptyText = "ไม่พบรายการที่ตรงกับคำค้น",
  // กลุ่มที่เป็น "ทุกอย่างรวมกัน" — ไม่ถูกกรองทิ้งจากฝั่งซ้าย และเป็นปลายทางของ
  // ปุ่ม "ค้นต่อในทั้งหมด" เมื่อค้นในกลุ่มเดียวแล้วไม่เจอ
  allGroupKey = null,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? null);
  const [groupQuery, setGroupQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [panelStyle, setPanelStyle] = useState({});
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const allItems = groups.flatMap((group) => group.items || []);
  const selected = value ? allItems.find((item) => String(item.value) === String(value)) : null;
  const groupOfSelected = selected
    ? groups.find((group) => (group.items || []).some((item) => String(item.value) === String(value)))
    : null;

  const shownGroups = groups.filter(
    (group) => group.alwaysVisible || group.key === allGroupKey || filterByQuery([group], groupQuery).length > 0,
  );
  const activeGroup = groups.find((group) => group.key === groupKey) || groups[0];
  const shownItems = filterByQuery(activeGroup?.items || [], itemQuery);

  // กางแผงแล้วเปิดค้างที่กลุ่มของค่าที่เลือกอยู่ ไม่ใช่เด้งกลับกลุ่มแรกทุกครั้ง
  useEffect(() => {
    if (!open) return;
    setGroupKey(groupOfSelected?.key ?? groups[0]?.key ?? null);
    setGroupQuery("");
    setItemQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(window.innerWidth - 16, Math.max(rect.width, 460));
    const roomBelow = window.innerHeight - rect.bottom;
    const height = panelRef.current?.offsetHeight || 340;
    const above = roomBelow < height + 12 && rect.top > roomBelow;
    const next = {
      position: "fixed",
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(200, (above ? rect.top : roomBelow) - 14),
    };
    if (above) next.bottom = window.innerHeight - rect.top + 6;
    else next.top = rect.bottom + 6;
    setPanelStyle(next);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    place();
    const raf = requestAnimationFrame(place);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const choose = (item) => {
    onChange?.(item ? item.value : "", item || null);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`ui-select w-full ${open ? "open" : ""}`.trim()}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => { if (!open) place(); setOpen((current) => !current); }}
      >
        <span className={styles.triggerValue}>
          {selected ? (
            <>
              {selected.chip ? <span className={styles.triggerChip}>{selected.chip}</span> : null}
              <span className={styles.triggerText}>{selected.label}{selected.meta ? ` · ${selected.meta}` : ""}</span>
            </>
          ) : (
            <span className={`${styles.triggerText} ${styles.placeholder}`}>{placeholder}</span>
          )}
        </span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>

      {open && !disabled && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} className={styles.panel} style={panelStyle} role="dialog" aria-label={ariaLabel}>
          {headLabel || headMeta ? (
            <div className={styles.head}>
              <span>{headLabel}</span>
              <span className={styles.headMeta}>{headMeta}</span>
            </div>
          ) : null}

          <div className={styles.panes}>
            {/* ── ซ้าย: กลุ่ม ────────────────────────────────────────────── */}
            <div className={`${styles.pane} ${styles.left}`}>
              <label className="ui-select-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={groupQuery}
                  placeholder={groupSearchPlaceholder}
                  aria-label={groupSearchPlaceholder}
                  onChange={(event) => setGroupQuery(event.target.value)}
                />
              </label>
              {shownGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <button
                    key={group.key}
                    type="button"
                    className={`${styles.row} ${styles.stacked} ${group.key === activeGroup?.key ? styles.active : ""}`.trim()}
                    onClick={() => { setGroupKey(group.key); setItemQuery(""); }}
                  >
                    {Icon ? <Icon size={14} aria-hidden="true" className={styles.rowIcon} /> : null}
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{group.label}</span>
                      {group.meta ? <span className={styles.rowMeta}>{group.meta}</span> : null}
                    </span>
                    <span className={styles.count}>{(group.items || []).length}</span>
                  </button>
                );
              })}
              {shownGroups.every((group) => group.key === allGroupKey) && groupQuery.trim() ? (
                <div className={styles.empty}>{groupEmptyText}</div>
              ) : null}
            </div>

            {/* ── ขวา: รายการของกลุ่มที่เลือก ───────────────────────────── */}
            <div className={`${styles.pane} ${styles.right}`}>
              <label className="ui-select-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={itemQuery}
                  placeholder={itemSearchPlaceholder}
                  aria-label={itemSearchPlaceholder}
                  onChange={(event) => setItemQuery(event.target.value)}
                />
              </label>
              {clearable && !itemQuery.trim() ? (
                <button type="button" className={`${styles.row} ${!value ? styles.active : ""}`.trim()} onClick={() => choose(null)}>
                  <span className={styles.rowLabel}>{clearLabel}</span>
                  {!value ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ) : null}
              {shownItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.row} ${styles.stacked} ${String(item.value) === String(value) ? styles.active : ""}`.trim()}
                  onClick={() => choose(item)}
                >
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{item.label}</span>
                    {item.meta ? <span className={styles.rowMeta}>{item.meta}</span> : null}
                  </span>
                  {String(item.value) === String(value) ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))}
              {!shownItems.length ? (
                <div className={styles.empty}>{itemQuery.trim() ? itemEmptyText : (activeGroup?.emptyText || itemEmptyText)}</div>
              ) : null}
              {/* ค้นในกลุ่มเดียวแล้วไม่เจอ = มักเพราะของอยู่คนละกลุ่มกับที่เดา —
                  พาไปค้นต่อในกลุ่มรวมโดยไม่ต้องพิมพ์ใหม่ ไม่ใช่ปล่อยให้ตัน */}
              {!shownItems.length && itemQuery.trim() && allGroupKey && activeGroup?.key !== allGroupKey ? (
                <button type="button" className={styles.row} onClick={() => setGroupKey(allGroupKey)}>
                  <span className={styles.rowLabel}>ค้น “{itemQuery.trim()}” ในทั้งหมด</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
