"use client";
// ── สถานะลง BOM ของ FG (mig 0419 · มติเจ้าของ 03/11/2026) — กล่องในการ์ดจัดการของหน้าสินค้า ─────────────
//
// ⚠️ **กล่องนี้ไม่มีปุ่ม** — ปุ่มระดับระเบียน (ส่ง RD · ดึงกลับ) อยู่ในช่องปุ่มของการ์ดจัดการที่เดียว (ม-49/ม-57)
//    ปุ่มของ RD (รับเรื่อง · ตีกลับ · ลงเสร็จ) อยู่ที่คิว /rd/bom
// ⭐ ป้าย/โทนมาจาก `BOM_STATUS_META` ตัวเดียวกับคิว RD — "รอ RD รับเรื่อง" แปลว่าอย่างเดียวกันทั้งสองจอ
import StatusNotice from "@/components/ui/StatusNotice";
import { BOM_STATUS_META, bomStatusOf } from "@/lib/master/productBom";
import { fmtDateTime } from "@/lib/format";
import styles from "./ProductBomStatus.module.css";

const by = (name, at) => [name, at ? fmtDateTime(at) : null].filter(Boolean).join(" · ");

export default function ProductBomStatus({ product }) {
  const status = bomStatusOf(product);
  const meta = BOM_STATUS_META[status || "none"];
  const lines = [];
  if (status === "queued") {
    lines.push(`ส่งโดย ${by(product.bomSentByName, product.bomSentAt)}`);
    lines.push("สูตร/กลิ่น · ปริมาตรล็อกไว้ — ดึงกลับได้จนกว่า RD จะรับเรื่อง");
  } else if (status === "in_progress") {
    lines.push(`RD รับเรื่อง ${by(product.bomAcceptedByName, product.bomAcceptedAt)}`);
    lines.push("สูตร/กลิ่น · ปริมาตรล็อกไว้ — ต้องแก้ ให้ RD ตีกลับ");
  } else if (status === "returned") {
    lines.push(`ตีกลับโดย ${by(product.bomReturnedByName, product.bomReturnedAt)}`);
    if (product.bomReturnReason) lines.push(`เหตุผล: ${product.bomReturnReason}`);
    lines.push("แก้ตามเหตุผลแล้วกดส่ง RD อีกครั้ง");
  } else if (status === "done") {
    lines.push(product.bomCode ? `รหัส BOM ใน Express: ${product.bomCode}` : "ไม่ได้ระบุรหัส BOM");
    lines.push(`ลงเสร็จ ${by(product.bomDoneByName, product.bomDoneAt)}`);
    if (product.bomNote) lines.push(product.bomNote);
  } else {
    // ⚠️ ไม่พูดว่า "ข้อมูลครบแล้ว" — กล่องนี้ไม่รู้ด่าน · ด่านที่ยังไม่ผ่านบอกอยู่เหนือปุ่มส่งแล้ว
    lines.push("อนุมัติและผูกสูตร/กลิ่นครบแล้วกด \"ส่ง RD ลง BOM\" — RD ลงใน Express แล้วอัปเดตสถานะกลับมาที่นี่");
  }
  return (
    <StatusNotice tone={meta.tone} title={`BOM · ${meta.label}`}>
      <ul className={styles.lines}>
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </StatusNotice>
  );
}
