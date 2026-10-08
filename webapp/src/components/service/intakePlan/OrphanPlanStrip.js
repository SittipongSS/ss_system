"use client";
// ── แถบรอบกำพร้าบนแท็บ "รอตั้งรอบ" (PR-C · C-D11 · [owner]) ─────────────────────────────────────────
//
// ⭐ รอบบริการที่ยังเดินอยู่แต่ชี้ใบสั่งขายที่ไม่มีผลแล้ว — route คำนวณด้วย `orphanPlanRows` (intakePlanFacts.js)
//   · dropped   ใบถูก Rev. และใบล่าสุดไม่มีไซต์นี้แล้ว → ปิดรอบ หรือนัดถอนเครื่อง
//   · stale     ใบ Rev. ล่าสุดครอบไซต์นี้ แต่รอบยังชี้ใบเก่า → ย้ายรอบไปใบนั้นที่หน้าไซต์
//   · cancelled ใบถูกยกเลิก → ปิดรอบ หรือนัดถอนเครื่อง
//   · unset     ใบ Rev. ล่าสุดอนุมัติแล้วแต่ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404) → ยังไม่ต้องปิดรอบ รอฝ่ายขายตั้งงานบริการ
// ⚠️ **ระบบไม่ปิด/ย้ายรอบเอง** — แถบนี้บอกอย่างเดียว ทางลงมือคือหน้าไซต์ (แก้รอบ/ปิดรอบอยู่ที่นั่น)
// ⚠️ ไม่มีรอบกำพร้า = ไม่วาดอะไรเลย (ไม่มีกล่อง "ไม่มีปัญหา" ให้รก) · ผู้เรียกวาดเฉพาะตอนโหลดสำเร็จ
import Link from "next/link";
import { Unlink } from "lucide-react";
import StatusNotice from "@/components/ui/StatusNotice";
import { ORPHAN_ITEM_TEXT, ORPHAN_TITLES } from "@/lib/service/intakePlanFacts";
import styles from "./OrphanPlanStrip.module.css";

/* ลำดับกล่อง: ใบถูกแทน (พบบ่อยสุด) → ใบ Rev. ครอบแล้ว → ใบยกเลิก → ใบ Rev. ยังไม่ตั้งงานบริการ (ไม่ต้องลงมือ — อยู่ท้ายสุด) */
const ORPHAN_KINDS = ["dropped", "stale", "cancelled", "unset"];

export default function OrphanPlanStrip({ orphans }) {
  const groups = ORPHAN_KINDS
    .map((kind) => [kind, Array.isArray(orphans?.[kind]) ? orphans[kind] : []])
    .filter(([, rows]) => rows.length > 0);
  if (!groups.length) return null;

  return (
    <div className={styles.strip}>
      {groups.map(([kind, rows]) => (
        <StatusNotice key={kind} tone="warning" icon={Unlink} title={ORPHAN_TITLES[kind](rows.length)}>
          <ul className={styles.list}>
            {rows.map((item) => (
              <li key={item.planId} className={styles.item}>
                <span className={styles.text}>{ORPHAN_ITEM_TEXT(item)}</span>
                <Link href={`/database/sites/${item.siteId}`} className={`linklike ${styles.link}`}>
                  หน้าไซต์
                </Link>
              </li>
            ))}
          </ul>
        </StatusNotice>
      ))}
    </div>
  );
}
