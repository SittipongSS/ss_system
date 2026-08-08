"use client";
// ── การ์ด "เริ่มที่นี่" — ใบเดียวที่ควรทำก่อน ─────────────────────────────
//
// ⭐ แก้อาการ *"ไม่รู้ว่าต้องทำอะไรต่อ"* (มติผู้ใช้ 2026-08-08) — ทั้งจอภาพรวมและ
// คิวตอบได้ว่า **มีอะไรค้างบ้าง** แต่ไม่มีที่ไหนตอบว่า **เริ่มที่ใบไหน** ⇒ คนเปิดมา
// เจอตัวเลข 4 ตัวกับตารางแล้วต้องตัดสินใจเองใหม่ทุกเช้า
//
// ⚠️ **ตัวเดียวใช้ทั้งสองฝั่ง** (RD ที่ `/rd` · ฝ่ายขายที่ `/requests`) — แยกเขียน
// สองชุดเมื่อไรก็เพี้ยนกันเมื่อนั้น (โรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์ม
// สร้าง/แก้) · สิ่งที่ต่างกันคือ **แถวที่ส่งเข้ามา** ไม่ใช่โครงของการ์ด
//
// ⚠️ ปุ่มเป็น `tone="primary"` (navy = "ทำสิ่งที่ค้างอยู่ต่อ") **ไม่ใช่ accent** —
// terracotta สงวนไว้ให้ "เริ่มของใหม่" ซึ่งบนหน้าคำร้องคือปุ่ม "เปิดคำร้อง"
// (Button.js: accent หน้าละ 1 ปุ่มเท่านั้น) · การ์ดนี้ไม่แย่งที่นั่น
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Flame } from "lucide-react";
import Button from "@/components/ui/Button";
import { fmtDate } from "@/lib/format";
import { requestKindLabel } from "@/lib/master/requestTypes";
import styles from "./StartHereCard.module.css";

export default function StartHereCard({
  // ผลจาก `startHereRequest()` — หน้าแม่เป็นคนเลือกว่าจะป้อนแถวชุดไหนเข้าไป
  pick = null,
  // ข้อความตอนไม่มีอะไรค้าง — ต่างกันตามฝั่ง (ฝ่ายตอบ vs ผู้ขอ)
  clearText = "ไม่มีเรื่องรอคุณอยู่ตอนนี้",
}) {
  const router = useRouter();

  // ⚠️ **บอกว่า "ว่าง" ไม่ใช่ซ่อนการ์ดทิ้ง** — หายไปเฉย ๆ อ่านไม่ออกว่างานหมดจริง
  // หรือหน้ายังโหลดไม่เสร็จ (บทเรียนเดียวกับแถบตัวเลขที่ต้องโชว์ 0)
  if (!pick?.request) {
    return (
      <div className={styles.clear}>
        <CheckCircle2 size={16} /> {clearText}
      </div>
    );
  }

  const { request, next, due, groupLabel, remaining } = pick;
  // ⚠️ ชุดคำเดียวกับคอลัมน์ "คำร้อง" ในคิว — สองที่พูดถึงใบเดียวกันคนละคำ
  // แปลว่าคนต้องแปลเองว่าการ์ดชี้แถวไหนในตาราง
  const docLine = [
    request.docNo || "ร่าง",
    requestKindLabel(request.kind),
    request.title && request.customerName ? request.customerName : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={styles.card}>
      <div className={styles.body}>
        <div className={styles.eyebrow}>
          <Flame size={13} /> เริ่มที่นี่
        </div>
        {/* ก้าวถัดไปมาจาก `requestNextStep` ตัวเดียวกับคอลัมน์แรกของคิว —
            การ์ดกับตารางขัดกันไม่ได้เชิงโครงสร้าง */}
        <div className={styles.step}>{next?.label || groupLabel}</div>
        <div className={styles.doc}>
          {request.title || request.customerName || "ราคากลาง"}
        </div>
        {/* 🪤 บรรทัดรองต้องมีคลาสของตัวเอง — เคยใช้ `.toolbar-label` ซึ่งเป็น
            inline-flex ⇒ เลขที่ไหลไปต่อท้ายชื่อเรื่องเป็นบรรทัดเดียวกัน
            ("…โรงแรม A" + "DR-0042" อ่านเป็น "ADR-0042") */}
        <div className={styles.docSub}>{docLine}</div>
        <div className={styles.meta}>
          <span className={`ui-badge ${due?.overdue ? styles.overdue : ""}`.trim()}>
            {due
              ? `กำหนด ${fmtDate(due.date)}${due.note ? ` · ${due.note}` : ""}`
              : groupLabel}
          </span>
          {remaining > 0 && (
            <span className={styles.rest}>และอีก {remaining} เรื่องต่อจากนี้</span>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        {/* ลูกศรอยู่ **ท้ายคำ** — มันบอกทิศทาง "ไปที่ใบนั้น" ไม่ใช่ไอคอนประจำปุ่ม
            (`icon` ของ Button วางไว้หน้าคำเสมอ จึงส่งผ่าน children แทน) */}
        <Button tone="primary" onClick={() => router.push(`/requests/${request.id}`)}>
          เปิดใบนี้ <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}
