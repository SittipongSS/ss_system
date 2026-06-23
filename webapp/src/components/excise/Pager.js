"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE_OPTIONS } from "@/lib/usePagination";

// Compact pagination control.
//   • ตัวเลือกจำนวนแถวต่อหน้า (10/25/50) — แสดงเมื่อส่ง onPageSize มาและมีแถวมากกว่าค่าน้อยสุด
//   • ปุ่มเลื่อนหน้า — แสดงเมื่อมีมากกว่า 1 หน้า
export default function Pager({ page, pageCount, total, onPage, pageSize, onPageSize }) {
  const showSize = !!onPageSize && total > PAGE_SIZE_OPTIONS[0];
  const showNav = pageCount > 1;
  if (!showSize && !showNav) return null;

  return (
    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap" style={{ fontSize: 13, color: "var(--text-3)" }}>
      <span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ</span>
      <div className="flex items-center gap-3 flex-wrap">
        {showSize && (
          <div className="flex items-center gap-1.5">
            <span>แสดง</span>
            <div className="segmented">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={n === pageSize ? "active" : ""}
                  onClick={() => onPageSize(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
        {showNav && (
          <div className="flex items-center gap-2">
            <button
              className="btn-icon"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="ก่อนหน้า"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ minWidth: 70, textAlign: "center" }}>
              หน้า {page} / {pageCount}
            </span>
            <button
              className="btn-icon"
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              aria-label="ถัดไป"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
