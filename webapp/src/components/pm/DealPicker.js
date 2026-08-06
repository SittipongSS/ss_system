"use client";
// ── ตัวเลือกดีลสองชั้น: โครงการ (ซ้าย) → ดีล (ขวา) ────────────────────────────
//
// มติผู้ใช้ 2026-08-06: ฟอร์มงานเคยมีสองช่องเรียงกัน (เลือกโครงการก่อน → ค่อยเลือกดีล)
// ซึ่งบังคับให้ต้องรู้ก่อนว่าดีลอยู่โครงการไหน · แล้วลองยุบเหลือช่องเดียวหัวกลุ่ม ซึ่งลิสต์
// ยาวเกินไปเมื่อมีดีลเป็นร้อยใบ ⇒ ลงตัวที่ **แผงเดียวสองชั้น** แบบเดียวกับปุ่มตัวกรอง
// (ui/FilterPopover) ที่คนในระบบใช้อยู่แล้ว — เห็นภาพรวมโครงการ + จำนวนดีลในคลิกเดียว
//
// ⭐ **ค้นได้ทั้งสองฝั่ง** — ฝั่งขวาอย่างเดียวไม่พอ: โครงการก็มีเป็นสิบ ๆ ใบเหมือนกัน
// และถัง "ดีลทั้งหมด" ไม่เคยถูกกรองทิ้งจากฝั่งซ้าย มันคือทางออกเมื่อจำได้แค่ชื่อดีล
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FolderOpen, Layers, Search } from "lucide-react";
import {
  ALL_DEALS_BUCKET, buildDealBuckets, filterBuckets, filterDeals,
  initialBucketKey, NO_PROJECT_BUCKET, projectLabelOf,
} from "@/lib/pm/dealPickerTree";
import styles from "./DealPicker.module.css";

const dealMeta = (deal) => [deal.customerName, `FC ${deal.forecastMonth || "ไม่ระบุ"}`].filter(Boolean).join(" · ");

export default function DealPicker({
  deals = [],
  projects = [],
  value = "",
  onChange,
  disabled = false,
  // เลือก "ไม่ผูกดีล" ได้ไหม — ปิดไว้เมื่อกติกาบังคับผูก (ตัวเลือกที่กดแล้วโดน API
  // ตีกลับไม่ควรมีอยู่ตั้งแต่แรก)
  clearable = false,
  placeholder = "— เลือกดีล —",
  ariaLabel = "ดีลที่ผูกกับงาน",
}) {
  const [open, setOpen] = useState(false);
  const [bucketKey, setBucketKey] = useState(ALL_DEALS_BUCKET);
  const [projectQuery, setProjectQuery] = useState("");
  const [dealQuery, setDealQuery] = useState("");
  const [panelStyle, setPanelStyle] = useState({});
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selected = value ? deals.find((d) => d.id === value) : null;
  const buckets = useMemo(() => buildDealBuckets(deals, projects), [deals, projects]);
  const labelOf = useCallback(
    (deal) => (deal.projectId ? projectLabelOf(projects.find((p) => p.id === deal.projectId)) : "ยังไม่ผูกโครงการ"),
    [projects],
  );

  const shownBuckets = filterBuckets(buckets, projectQuery);
  const activeBucket = buckets.find((b) => b.key === bucketKey) || buckets[0];
  const shownDeals = filterDeals(activeBucket?.deals || [], dealQuery, labelOf);

  // กางแผงแล้วเปิดค้างที่ถังของดีลที่เลือกอยู่ — ไม่ใช่เด้งกลับถังแรกทุกครั้ง
  useEffect(() => {
    if (!open) return;
    setBucketKey(initialBucketKey(selected));
    setProjectQuery("");
    setDealQuery("");
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

  const choose = (dealId) => {
    onChange?.(dealId);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const selectedProject = selected?.projectId ? projects.find((p) => p.id === selected.projectId) : null;

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
        onClick={() => { if (!open) place(); setOpen((v) => !v); }}
      >
        <span className={styles.triggerValue}>
          {selected ? (
            <>
              {selectedProject?.code ? <span className={styles.triggerChip}>{selectedProject.code}</span> : null}
              <span className={styles.triggerText}>{selected.title}{selected.customerName ? ` — ${selected.customerName}` : ""} · FC {selected.forecastMonth || "ไม่ระบุ"}</span>
            </>
          ) : (
            <span className={`${styles.triggerText} ${styles.placeholder}`}>{placeholder}</span>
          )}
        </span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>

      {open && !disabled && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} className={styles.panel} style={panelStyle} role="dialog" aria-label={ariaLabel}>
          <div className={styles.head}>
            <span>เลือกดีล</span>
            <span className={styles.headMeta}>ทั้งหมด {deals.length} ดีล</span>
          </div>

          <div className={styles.panes}>
            {/* ── ซ้าย: โครงการ ─────────────────────────────────────────── */}
            <div className={`${styles.pane} ${styles.left}`}>
              <label className={styles.search}>
                <Search size={14} aria-hidden="true" />
                <input
                  value={projectQuery}
                  placeholder="ค้นหาโครงการ…"
                  aria-label="ค้นหาโครงการ"
                  onChange={(event) => setProjectQuery(event.target.value)}
                />
              </label>
              {shownBuckets.map((bucket) => (
                <button
                  key={bucket.key}
                  type="button"
                  className={`${styles.row} ${styles.deal} ${bucket.key === activeBucket?.key ? styles.active : ""}`.trim()}
                  onClick={() => { setBucketKey(bucket.key); setDealQuery(""); }}
                >
                  {bucket.key === ALL_DEALS_BUCKET
                    ? <Layers size={14} aria-hidden="true" className={styles.rowIcon} />
                    : <FolderOpen size={14} aria-hidden="true" className={styles.rowIcon} />}
                  <span className={styles.dealText}>
                    <span className={styles.dealTitle}>{bucket.label}</span>
                    {/* ชื่อลูกค้าเป็นบรรทัดรอง — โครงการชื่อคล้ายกันของคนละลูกค้ามีจริง
                        และรหัส PJ- อย่างเดียวแยกไม่ออกด้วยตา */}
                    {bucket.customerName ? <span className={styles.dealMeta}>{bucket.customerName}</span> : null}
                  </span>
                  <span className={styles.count}>{bucket.deals.length}</span>
                </button>
              ))}
              {shownBuckets.length === 1 && projectQuery.trim() ? (
                // บอก **ทางออก** ไม่ใช่แค่ "ไม่พบ" — คนมักพิมพ์ชื่อดีลผิดช่อง
                <div className={styles.empty}>ไม่พบโครงการที่ตรงกับคำค้น — ถ้ากำลังหาชื่อดีล ให้ค้นที่ช่องขวาในถัง “ดีลทั้งหมด”</div>
              ) : null}
            </div>

            {/* ── ขวา: ดีลของถังที่เลือก ────────────────────────────────── */}
            <div className={`${styles.pane} ${styles.right}`}>
              <label className={styles.search}>
                <Search size={14} aria-hidden="true" />
                <input
                  value={dealQuery}
                  placeholder="ค้นหาดีล / ลูกค้า…"
                  aria-label="ค้นหาดีล"
                  onChange={(event) => setDealQuery(event.target.value)}
                />
              </label>
              {clearable && !dealQuery.trim() ? (
                <button type="button" className={`${styles.row} ${!value ? styles.active : ""}`.trim()} onClick={() => choose("")}>
                  <span className={styles.rowLabel}>— ไม่ผูกดีล —</span>
                  {!value ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ) : null}
              {shownDeals.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  className={`${styles.row} ${styles.deal} ${deal.id === value ? styles.active : ""}`.trim()}
                  onClick={() => choose(deal.id)}
                >
                  <span className={styles.dealText}>
                    <span className={styles.dealTitle}>{deal.title}</span>
                    {/* ชื่อโครงการโผล่ในบรรทัดรองเฉพาะถัง "ดีลทั้งหมด" — ในถังโครงการ
                        มันซ้ำกับหัวแผงซ้ายที่เลือกค้างอยู่ */}
                    <span className={styles.dealMeta}>
                      {dealMeta(deal)}{activeBucket?.key === ALL_DEALS_BUCKET ? ` · ${labelOf(deal)}` : ""}
                    </span>
                  </span>
                  {deal.id === value ? <Check size={14} aria-hidden="true" /> : null}
                </button>
              ))}
              {!shownDeals.length ? (
                <div className={styles.empty}>
                  {dealQuery.trim()
                    ? "ไม่พบดีลที่ตรงกับคำค้นในถังนี้"
                    : activeBucket?.key === NO_PROJECT_BUCKET
                      ? "ไม่มีดีลที่ยังไม่ผูกโครงการ"
                      : "โครงการนี้ยังไม่มีดีลที่ผูกงานได้"}
                </div>
              ) : null}
              {/* ค้นในถังโครงการแล้วไม่เจอ = มักเป็นเพราะดีลอยู่คนละโครงการกับที่เดา
                  — พาไปค้นต่อในถังรวมโดย **ไม่ต้องพิมพ์ใหม่** ไม่ใช่ปล่อยให้ตัน */}
              {!shownDeals.length && dealQuery.trim() && activeBucket?.key !== ALL_DEALS_BUCKET ? (
                <button type="button" className={styles.row} onClick={() => setBucketKey(ALL_DEALS_BUCKET)}>
                  <Layers size={14} aria-hidden="true" className={styles.rowIcon} />
                  <span className={styles.rowLabel}>ค้น “{dealQuery.trim()}” ในดีลทั้งหมด</span>
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
