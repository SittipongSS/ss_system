"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "@/lib/usePagination";
import { closestScrollSection, scrollToTopOf } from "@/lib/ui/scrollToTopOf";
import Segmented from "@/components/ui/Segmented";
import Button from "@/components/ui/Button";
import styles from "./Pager.module.css";
import { fmtNumber } from "@/lib/format";

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
  const rootRef = useRef(null);
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePageCount = Math.max(1, Number(pageCount) || 1);
  const safePage = Math.min(safePageCount, Math.max(1, Number(page) || 1));
  const options = pageSizeOptions
    .map(Number)
    .filter((size) => Number.isFinite(size) && size > 0);
  const showSize = Boolean(onPageSize) && options.length > 0 && safeTotal > options[0];
  const showNav = safePageCount > 1;

  if (!showSize && !showNav) return null;

  /* ปุ่มพวกนี้อยู่ท้ายตาราง — เปลี่ยนหน้าแล้วต้องพากลับขึ้นหัวตารางให้ ไม่งั้นแถวแรก
     ของหน้าใหม่อยู่เหนือจอ ต้องไถขึ้นเองทุกครั้ง (เลื่อนขึ้นอย่างเดียว ดู scrollToTopOf) */
  const goTo = (nextPage) => {
    const target = Math.min(safePageCount, Math.max(1, nextPage));
    if (target === safePage) return;
    onPage?.(target);
    scrollToTopOf(closestScrollSection(rootRef.current));
  };

  /* หน้าต้นแบบใช้ปุ่มเลขหน้า กดข้ามได้ทันที (มติ 2026-07-26 ข้อ 9)
     โชว์ได้มากสุด 7 ปุ่ม แล้วเลื่อนช่วงตามหน้าปัจจุบัน — ตารางที่มี 40 หน้าจะได้
     ไม่ดันแถวล่างจนล้น และปุ่มไม่กระโดดไปมาเวลาเปลี่ยนหน้าทีละหน้า */
  const windowSize = Math.min(7, safePageCount);
  const windowStart = Math.min(
    Math.max(1, safePage - Math.floor(windowSize / 2)),
    safePageCount - windowSize + 1
  );
  const pageNumbers = Array.from({ length: windowSize }, (_, index) => windowStart + index);

  return (
    /* `data-pager` = จุดเกาะให้เปลือกกลางรู้ว่านี่คือแถบแบ่งหน้า — เมื่ออยู่ในเนื้อ
       การ์ดที่มีระยะขอบของตัวเองแล้ว (`.ui-section-body`) globals จะตัดระยะซ้ำออก
       (กติกาเดียวกับตารางที่ฝังในการ์ด · ดู --panel-inset) */
    <nav ref={rootRef} data-pager className={`${styles.root} ${className}`.trim()} aria-label={ariaLabel}>
      <span>ทั้งหมด {fmtNumber(safeTotal)} {itemLabel}</span>
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
            {/* ปุ่มลูกศรต้องมีพื้น/ขอบ/ความสูงเท่าปุ่มเลขหน้า จึงใช้ ui-pager-page เหมือนกัน
                ห้ามใช้ iconOnly ที่นี่ — iconOnly ให้คลาส btn-icon แทน btn ซึ่งตั้งใจให้
                เป็นไอคอนเปล่า ๆ ไม่มีพื้น (ไอคอนแก้ไข/ลบในแถวตาราง) ผลคือลูกศรกลายเป็น
                เชฟรอนลอย ๆ สูง 28px ข้างปุ่มเลขที่สูง 36px */}
            <Button
              className={`ui-pager-page ${styles.navButton}`}
              disabled={safePage <= 1}
              onClick={() => goTo(safePage - 1)}
              aria-label="ก่อนหน้า"
              icon={<ChevronLeft size={16} aria-hidden="true" />}
            />
            <span className={styles.srOnly} aria-live="polite">
              หน้า {safePage} จาก {safePageCount}
            </span>
            {pageNumbers.map((number) => (
              <Button
                key={number}
                className={`ui-pager-page ${number === safePage ? "active" : ""}`.trim()}
                onClick={() => goTo(number)}
                aria-current={number === safePage ? "page" : undefined}
                aria-label={`หน้า ${number}`}
              >
                {fmtNumber(number)}
              </Button>
            ))}
            <Button
              className={`ui-pager-page ${styles.navButton}`}
              disabled={safePage >= safePageCount}
              onClick={() => goTo(safePage + 1)}
              aria-label="ถัดไป"
              icon={<ChevronRight size={16} aria-hidden="true" />}
            />
          </div>
        ) : null}
      </div>
    </nav>
  );
}
