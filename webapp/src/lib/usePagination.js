"use client";

import { useEffect, useMemo, useRef } from "react";
import useStickyState from "@/lib/ui/useStickyState";

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
 * @param {string} [opts.stickyKey] ชื่อสำหรับจำหน้าที่อยู่/ขนาดหน้า (useStickyState) — กดเข้าใบแล้วกดกลับ
 *   ต้องได้หน้าเดิม ไม่ใช่หน้า 1 · หน้าที่มีตารางแบ่งหน้าหลายชุดต้องตั้งชื่อไม่ซ้ำกัน · ไม่ส่ง = ไม่จำ
 */
export function usePagination(rows, { defaultSize = DEFAULT_PAGE_SIZE, resetKey, stickyKey } = {}) {
  const [pageSize, setPageSize, , sizeHydrated] = useStickyState(stickyKey ? `${stickyKey}.pageSize` : null, defaultSize);
  const [page, setPage, , pageHydrated] = useStickyState(stickyKey ? `${stickyKey}.page` : null, 1);
  const hydrated = sizeHydrated && pageHydrated;

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /* รีเซ็ตกลับหน้าแรกเมื่อตัวกรอง/ขนาดหน้าเปลี่ยน
     ⚠️ ข้ามรอบที่ค่าเพิ่งคืนจากที่จำไว้ — ตัวกรองกับเลขหน้าคืนค่าในเรนเดอร์เดียวกัน ⇒ resetKey "เปลี่ยน"
     ทั้งที่ผู้ใช้ไม่ได้แตะ · ถ้ารีเซ็ตตรงนั้น เลขหน้าที่เพิ่งคืนจะถูกทับเป็น 1 ทุกครั้งที่กดกลับ
     จึงจดค่าตอนคืนเสร็จไว้เป็นจุดตั้งต้น แล้วรีเซ็ตเฉพาะเมื่อเปลี่ยนไปจากจุดนั้น */
  const settledRef = useRef(null);
  const resetSignature = `${String(resetKey)}|${pageSize}`;
  useEffect(() => {
    if (!hydrated) return;
    if (settledRef.current === null) { settledRef.current = resetSignature; return; }
    if (settledRef.current === resetSignature) return;
    settledRef.current = resetSignature;
    setPage(1);
  }, [hydrated, resetSignature, setPage]);

  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = useMemo(
    () => rows.slice(start, start + pageSize),
    [rows, start, pageSize],
  );

  return { page: safePage, setPage, pageSize, setPageSize, pageCount, total, pageRows };
}
