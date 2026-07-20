"use client";
// เตือนล่วงหน้าว่า "คุณยังเซ็นไม่ได้" ก่อนกดอนุมัติ
//
// mig 0125 บล็อกการอนุมัติใบเสนอราคา/SO ถ้าผู้อนุมัติไม่มีลายเซ็นที่ใช้งานอยู่ (409
// signature_required). หน้ารายละเอียดจับ error นั้นได้อยู่แล้วและโชว์ลิงก์ไปบัญชีของฉัน
// แต่ผู้ใช้จะรู้ตัวก็ต่อเมื่อกดปุ่มไปแล้ว — ตอนที่มักเป็นจังหวะเร่งของงานจริง
// กล่องนี้ทำให้รู้ตั้งแต่เปิดหน้า โดยเช็คลายเซ็นของตัวเองเท่านั้น (API self-scope)
import { useEffect, useState } from "react";
import Link from "next/link";
import { PenLine } from "lucide-react";

// active = แสดงเฉพาะตอนที่ผู้ใช้คนนี้กำลังจะเป็นผู้อนุมัติจริง ๆ
// (ไม่ยิง API ทิ้งทุกครั้งที่เปิดหน้าเอกสาร)
export default function SignatureReadyNotice({ active = true, docLabel = "เอกสารนี้" }) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!active) { setMissing(false); return undefined; }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/account/signature", { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) return; // โหลดไม่ได้ = ไม่เดา ปล่อยให้ 409 ตอนกดเป็นตัวบอกแทน
        const data = await res.json();
        setMissing(!data.active);
      } catch {
        // เงียบไว้ — กล่องนี้เป็นตัวช่วย ไม่ใช่ตัวบล็อก
      }
    })();
    return () => ctrl.abort();
  }, [active]);

  if (!missing) return null;

  return (
    <div
      className="glass-panel"
      role="alert"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, padding: "12px 14px", marginBottom: 12,
        borderColor: "var(--amber)", color: "var(--amber)", fontSize: 13,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <PenLine size={16} aria-hidden="true" />
        คุณยังไม่มีลายเซ็นอิเล็กทรอนิกส์ในบัญชี — อนุมัติ{docLabel}ไม่ได้จนกว่าจะเพิ่มลายเซ็น
      </span>
      <Link href="/account" className="btn ghost sm">เพิ่มลายเซ็น</Link>
    </div>
  );
}
