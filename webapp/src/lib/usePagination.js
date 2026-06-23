"use client";

import { useState, useEffect, useMemo } from "react";

// ตัวเลือกจำนวนแถวต่อหน้า ใช้ร่วมกันทุกตารางทั้งเว็บ
export const PAGE_SIZE_OPTIONS = [10, 25, 50];
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Pagination ฝั่ง client แบบใช้ซ้ำได้ทุกตาราง — รับ array (ที่เรียง/กรองแล้ว)
 * คืนแถวเฉพาะหน้าปัจจุบัน + state สำหรับคู่กับ <Pager>.
 *
 * @param {Array} rows  ข้อมูลที่จะแบ่งหน้า (เรียง/กรองมาแล้ว)
 * @param {Object} [opts]
 * @param {number} [opts.defaultSize] จำนวนแถวต่อหน้าเริ่มต้น
 * @param {*} [opts.resetKey] เปลี่ยนค่านี้เมื่อ filter/ค้นหาเปลี่ยน เพื่อรีเซ็ตกลับหน้า 1
 */
export function usePagination(rows, { defaultSize = DEFAULT_PAGE_SIZE, resetKey } = {}) {
  const [pageSize, setPageSize] = useState(defaultSize);
  const [page, setPage] = useState(1);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // รีเซ็ตกลับหน้าแรกเมื่อข้อมูล/ตัวกรอง/ขนาดหน้าเปลี่ยน
  useEffect(() => { setPage(1); }, [resetKey, pageSize]);

  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = useMemo(
    () => rows.slice(start, start + pageSize),
    [rows, start, pageSize],
  );

  return { page: safePage, setPage, pageSize, setPageSize, pageCount, total, pageRows };
}
