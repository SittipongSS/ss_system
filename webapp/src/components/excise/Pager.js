"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Compact pagination control. Renders nothing when there's only one page.
export default function Pager({ page, pageCount, total, onPage }) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 mt-3" style={{ fontSize: 13, color: "var(--text-3)" }}>
      <span>ทั้งหมด {total.toLocaleString("th-TH")} รายการ</span>
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
    </div>
  );
}
