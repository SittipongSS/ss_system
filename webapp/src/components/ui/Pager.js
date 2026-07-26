"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "@/lib/usePagination";
import Segmented from "@/components/ui/Segmented";
import styles from "./Pager.module.css";

export default function Pager({
  page = 1,
  pageCount = 1,
  total = 0,
  onPage,
  pageSize,
  onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  itemLabel = "รายการ",
  ariaLabel = "การแบ่งหน้า",
  className = "",
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePageCount = Math.max(1, Number(pageCount) || 1);
  const safePage = Math.min(safePageCount, Math.max(1, Number(page) || 1));
  const options = pageSizeOptions
    .map(Number)
    .filter((size) => Number.isFinite(size) && size > 0);
  const showSize = Boolean(onPageSize) && options.length > 0 && safeTotal > options[0];
  const showNav = safePageCount > 1;

  if (!showSize && !showNav) return null;

  const goTo = (nextPage) => {
    onPage?.(Math.min(safePageCount, Math.max(1, nextPage)));
  };

  return (
    <nav className={`${styles.root} ${className}`.trim()} aria-label={ariaLabel}>
      <span>ทั้งหมด {safeTotal.toLocaleString("th-TH")} {itemLabel}</span>
      <div className={styles.controls}>
        {showSize ? (
          <div className={styles.size}>
            <span>แสดง</span>
            <Segmented
              options={options}
              value={Number(pageSize)}
              onChange={onPageSize}
              ariaLabel="จำนวนรายการต่อหน้า"
            />
          </div>
        ) : null}
        {showNav ? (
          <div className={styles.navigation}>
            <button
              type="button"
              className={`btn-icon ${styles.navButton}`}
              disabled={safePage <= 1}
              onClick={() => goTo(safePage - 1)}
              aria-label="ก่อนหน้า"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className={styles.position} aria-live="polite">
              หน้า {safePage} / {safePageCount}
            </span>
            <button
              type="button"
              className={`btn-icon ${styles.navButton}`}
              disabled={safePage >= safePageCount}
              onClick={() => goTo(safePage + 1)}
              aria-label="ถัดไป"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
