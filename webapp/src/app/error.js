"use client";

// ── หน้าที่แสดงเมื่อหน้าใดหน้าหนึ่งพัง (React error boundary ของ Next) ────
//
// ⭐ ปุ่ม "แจ้งปัญหานี้" (มติ Q21) — เปิดโมดัลเดิมพร้อมกรอก stack ให้แล้ว ผู้ใช้
// เติมแค่ "กดอะไรถึงเจอ" ซึ่งเป็นข้อมูลที่ stack ไม่มีทางบอกได้
//
// ⚠️ **ไม่ส่งอัตโนมัติ** ทั้งที่ทำได้ง่ายกว่า — error เดียวกันเด้งซ้ำจะได้เรื่องซ้ำ
// ใบละสิบ และ stack อาจมีข้อมูลใน state ติดไปโดยไม่มีใครดูก่อน · คนกดเอง =
// มีคนยืนยันแล้วว่าพังจริง
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bug } from "lucide-react";
import Button from "@/components/ui/Button";
import ReportIssueModal from "@/components/issues/ReportIssueModal";
import styles from "./error.module.css";

export default function AppError({ error, reset }) {
  const [reporting, setReporting] = useState(false);

  // digest = id ของ error ฝั่ง server ที่ Next ใส่มาให้ (ตัว stack จริงถูกตัดทิ้ง
  // ในโหมด production) — ส่งไปด้วยเสมอ เพราะเป็นสิ่งเดียวที่ตามกลับไปหา log ได้
  const stack = [
    error?.message,
    error?.digest ? `digest: ${error.digest}` : null,
    error?.stack,
  ].filter(Boolean).join("\n");

  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden="true"><AlertTriangle size={26} /></span>
      <h1>หน้านี้ทำงานต่อไม่ได้</h1>
      <p>
        เกิดข้อผิดพลาดที่เราไม่ได้เตรียมไว้ ข้อมูลที่บันทึกไปแล้วยังอยู่ครบ
        <br />ช่วยส่งเรื่องให้ผู้ดูแลระบบดูหน่อยได้ไหม
      </p>

      <div className={styles.actions}>
        <Button tone="accent" onClick={() => setReporting(true)} icon={<Bug size={16} aria-hidden="true" />}>
          แจ้งปัญหานี้
        </Button>
        <Button onClick={() => reset()}>โหลดหน้าใหม่</Button>
        <Button as={Link} href="/home" variant="quiet">กลับหน้าแรก</Button>
      </div>

      {error?.digest && <p className={styles.digest}>รหัสอ้างอิง: {error.digest}</p>}

      <ReportIssueModal open={reporting} onClose={() => setReporting(false)} errorStack={stack} />
    </div>
  );
}
