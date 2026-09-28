"use client";
// ── ทางเพิ่มไซต์ที่ฝ่ายขายใช้ได้จริง (D19) — ท้ายตารางงานบริการ ────────────────────────────────────────────────
//
// ⭐ ฝ่ายขายสร้างไซต์/โซนเองไม่ได้ (ทะเบียนเป็นของ TS) — มีสองทาง:
//   1. ลูกค้าใหม่/สาขาที่ยังไม่เคยประเมิน → เปิดคำร้องประเมินพื้นที่ (ลิงก์ติดดีล + ใบนี้ + กลับมาที่ใบนี้หลังบันทึก)
//   2. สาขาที่ติดตั้งไปแล้วแต่ไม่อยู่ในทะเบียน → หัวหน้า TS เพิ่มเองที่ "ทะเบียนไซต์ › เพิ่มไซต์ย้อนหลัง" (บรรทัดแนะนำ **ไม่มีปุ่ม**)
// 🔴 **ห้ามมีปุ่ม "ขอ TS เพิ่มไซต์ที่ติดตั้งแล้ว" / TaskFormModal** — มอบหมายงานข้ามฝ่ายถูกห้าม (`canAssignTask` ·
//   มติ 17/07) ⇒ ปุ่มนั้นตอบ 403 กับทุกคนที่ไม่ใช่แอดมิน [owner] (ยามใน serviceSetupUi.test.mjs)
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import Button from "@/components/ui/Button";
import { surveyRequestHref } from "./serviceSetupDraft";
import styles from "./SalesOrderServiceLines.module.css";

export const LEGACY_SITE_GUIDANCE = "ไซต์ที่ติดตั้งแล้วแต่ยังไม่อยู่ในทะเบียน — แจ้งหัวหน้า TS ให้เพิ่มที่ ทะเบียนไซต์ › เพิ่มไซต์ย้อนหลัง";

/** @param dealId ดีลของใบ · @param orderId ใบสั่งขาย */
export default function ServiceRegistryPaths({ dealId = null, orderId = null }) {
  return (
    <div className={styles.registryLine}>
      <span className={styles.registryText}>ไม่เจอสาขาในช่อง ‘ไซต์ · โซน’? ฝ่ายขายสร้างไซต์/โซนเองไม่ได้</span>
      <Button as={Link} href={surveyRequestHref({ dealId, orderId })} size="sm" icon={<ClipboardList size={14} aria-hidden="true" />}>
        เปิดคำร้องประเมินพื้นที่
      </Button>
      <span className={styles.registryGuide}>{LEGACY_SITE_GUIDANCE}</span>
    </div>
  );
}
