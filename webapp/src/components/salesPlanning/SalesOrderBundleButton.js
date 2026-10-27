"use client";

/* ปุ่ม "โหลดชุดเอกสาร" (มติเจ้าของ 27/10/2569) — ใบที่ติ๊กไว้ → ZIP โฟลเดอร์ละใบ
 * อยู่สองที่: ทะเบียนใบสั่งขาย · รายงานยอดขาย (แผงใบสั่งขายที่อนุมัติแล้ว) — แถวรายงานของใบ Actual รายงวดมีหลายแถวต่อใบ
 * ⇒ นับ/ส่งเป็นใบที่ไม่ซ้ำ (`uniqueSalesOrders`)
 * (QT · SO · หลักฐานการชำระ · ใบกำกับภาษี) · ตรรกะทั้งหมดอยู่ `lib/sales/salesOrderBundle.js` ที่นี่แค่ต่อสาย
 *
 * ⭐ **ปุ่มขึ้นเสมอ บอกเหตุตอนกด** (กฎปุ่มกดไม่ได้ของระบบ) — ยังไม่ติ๊ก / เกินเพดาน = บอกผ่าน `onNotice`
 * ⭐ ผลทุกรอบบอกผ่าน `onNotice` เป็นกล่องในแผง — ขาดไฟล์ = เตือนพร้อมจำนวน (รายละเอียดอยู่ใน ไฟล์ที่ขาด.txt)
 * ⚠️ `jszip` โหลดตอนกดเท่านั้น (dynamic import) — ไม่พกเข้า bundle ของทะเบียนที่ทุกคนเปิดทุกวัน
 */

import { useState } from "react";
import { FolderDown } from "lucide-react";
import Button from "@/components/ui/Button";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import {
  BUNDLE_MISSING_FILE, SALES_ORDER_BUNDLE_MAX, buildSalesOrderBundle, uniqueSalesOrders,
} from "@/lib/sales/salesOrderBundle";

const enc = encodeURIComponent;

/* ไบต์ของไฟล์หนึ่งไฟล์ผ่าน proxy ของบ้านนั้น — 401/403 ของระบบตอบคำอังกฤษ ⇒ แปลเป็นไทยก่อนลง ไฟล์ที่ขาด.txt
   ⭐ 5xx = ลองอีกครั้งเดียว (GET ทุกเส้นที่นี่อ่านอย่างเดียว · เส้น PDF สร้างไฟล์แบบ idempotent) — 🐞 27/10 PDF ใบสั่งขายล้มด้วย
   `spawn ETXTBSY` ครั้งเดียวแล้วหายจากชุดทั้งที่ลองใหม่ก็ได้ */
async function fetchFile(href) {
  let res = await apiFetch(href, { cache: "no-store" });
  if (res.status >= 500) {
    await new Promise((resolve) => { setTimeout(resolve, 1500); });
    res = await apiFetch(href, { cache: "no-store" });
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่แล้วโหลดอีกครั้ง");
    if (res.status === 403) throw new Error("ไม่มีสิทธิ์เปิดไฟล์นี้");
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `ดึงไฟล์ไม่สำเร็จ (${res.status})`);
  }
  return res.blob();
}

const loadDocuments = (order) => apiJson(`/api/sales-planning/sales-orders/${enc(order.id)}/documents`, {
  cache: "no-store", fallbackError: "อ่านรายการเอกสารของใบนี้ไม่สำเร็จ",
});

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SalesOrderBundleButton({ orders: rows = [], onNotice }) {
  const orders = uniqueSalesOrders(rows);
  const [progress, setProgress] = useState(null);
  const busy = progress !== null;

  const download = async () => {
    if (busy) return;
    if (!orders.length) {
      onNotice?.({ tone: "info", title: "ยังไม่ได้เลือกใบ", text: "ติ๊กใบสั่งขายในตารางก่อน แล้วกดโหลดชุดเอกสารอีกครั้ง" });
      return;
    }
    if (orders.length > SALES_ORDER_BUNDLE_MAX) {
      onNotice?.({
        tone: "warning", title: `เลือกไว้ ${orders.length} ใบ — โหลดได้ครั้งละไม่เกิน ${SALES_ORDER_BUNDLE_MAX} ใบ`,
        text: "ไฟล์ทั้งหมดถูกรวมในเบราว์เซอร์ ชุดที่ใหญ่เกินไปจะช้าและกินหน่วยความจำ — แบ่งโหลดเป็นหลายรอบ",
      });
      return;
    }
    onNotice?.(null);
    setProgress({ done: 0, total: 0 });
    try {
      const { default: JSZip } = await import("jszip");
      const { blob, fileCount, missing } = await buildSalesOrderBundle(orders, {
        loadDocuments, fetchFile, JSZip, onProgress: setProgress,
      });
      saveBlob(blob, `ชุดเอกสาร SO ${orders.length} ใบ ${businessDate()}.zip`);
      /* ดึงไม่ได้ (failed) = เตือน — ต้องมีคนทำอะไรต่อ · ยังไม่มีในระบบ (absent · งวดที่ยังไม่จ่าย ฯลฯ) = เรื่องปกติ บอกจำนวนพอ */
      const failed = missing.filter((m) => !m.absent).length;
      const absent = missing.length - failed;
      const title = `โหลดแล้ว ${orders.length} ใบ ${fileCount} ไฟล์${failed ? ` · ดึงไม่ได้ ${failed} ไฟล์` : ""}`;
      const absentText = absent ? `ยังไม่มีในระบบ ${absent} รายการ (เช่นงวดที่ยังไม่ชำระยังไม่มีสลิป)` : "";
      onNotice?.(missing.length
        ? {
          tone: failed ? "warning" : "success",
          title,
          text: [
            failed ? "ลองโหลดใบที่ขาดอีกครั้ง" : "",
            absentText,
            `รายละเอียดอยู่ใน "${BUNDLE_MISSING_FILE}" ในไฟล์ ZIP`,
          ].filter(Boolean).join(" · "),
        }
        : { tone: "success", title, text: "ใบละหนึ่งโฟลเดอร์ ครบทุกไฟล์" });
    } catch (error) {
      onNotice?.({ tone: "error", title: "สร้างชุดเอกสารไม่สำเร็จ", text: error?.message || "ลองใหม่อีกครั้ง" });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      icon={<FolderDown size={14} aria-hidden="true" />}
      onClick={download}
      disabled={busy}
      aria-busy={busy || undefined}
      title={`QT · SO · หลักฐานการชำระ · ใบกำกับภาษี ของใบที่ติ๊ก — ZIP ใบละหนึ่งโฟลเดอร์ (ครั้งละไม่เกิน ${SALES_ORDER_BUNDLE_MAX} ใบ)`}
    >
      {busy
        ? (progress.total ? `กำลังรวมไฟล์ ${progress.done}/${progress.total}…` : "กำลังเตรียม…")
        : `โหลดชุดเอกสาร${orders.length ? ` (${orders.length})` : ""}`}
    </Button>
  );
}
