"use client";

/* ปุ่ม "ดาวน์โหลด Excel" ตัวกลาง — รายงานยอดขาย · ลีด · FC ดีล ใช้ตัวเดียว (มติผู้ใช้ 2026-09-22 "ใช้เหมือนกัน")
 *
 * ⭐ โหลดผ่าน `apiFetch` แล้วสร้างไฟล์จาก blob — ไม่ใช่ลิงก์ตรงไป URL
 *    - `<Link>` ของ Next ยิงคำขอ RSC ไปที่ปลายทางก่อนแล้วค่อยโหลดจริง = สร้างไฟล์ทั้งรายงานสองรอบต่อคลิก
 *    - `<a download>` ตอนปลายทางพลาด (403/500) พาหน้าไปเปิด JSON ดิบ หรือได้ไฟล์ .xlsx ที่ข้างในเป็นข้อความ error
 *    - ตัวนี้บอกพลาดเป็นภาษาไทยผ่าน `onError` และโชว์ "กำลังสร้างไฟล์…" ระหว่างรอ (ไฟล์ใหญ่ใช้เวลาหลายวินาที)
 * ⭐ ชื่อไฟล์อ่านจาก Content-Disposition — รองรับ `filename*=UTF-8''…` (ชื่อไทย · RFC 5987) ก่อน `filename="…"`
 */

import { useState } from "react";
import { Download } from "lucide-react";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/apiFetch";
import { filenameFromDisposition } from "@/lib/ui/contentDisposition";

export default function ExcelDownloadButton({
  href,
  fallbackName = "report.xlsx",
  title,
  onError,
  onDone,
  label = "ดาวน์โหลด Excel",
  disabled = false,
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy || !href) return;
    setBusy(true);
    try {
      const res = await apiFetch(href, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || (res.status === 403 ? "ไม่มีสิทธิ์ดาวน์โหลดไฟล์นี้" : "ดาวน์โหลดไฟล์ไม่สำเร็จ"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(res.headers.get("content-disposition"), fallbackName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onDone?.();
    } catch (err) {
      onError?.(err?.message || "ดาวน์โหลดไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="quiet"
      icon={<Download size={15} aria-hidden="true" />}
      onClick={download}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      title={title}
    >
      {busy ? "กำลังสร้างไฟล์…" : label}
    </Button>
  );
}
