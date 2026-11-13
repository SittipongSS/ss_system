"use client";
// ── ช่องชื่อของแถวคำร้องที่ผูกทะเบียนกลิ่น/สูตร (มติผู้ใช้ 2026-08-18) ──────
//
// ⭐ **ค่าที่โชว์มาจากทะเบียนสดเสมอ** — แก้ชื่อ/รหัสที่ไหนก็เห็นตรงกันทันที เพราะมี
// สำเนาที่เขียนได้ชุดเดียว ไม่ใช่สองชุดคอยไล่ซิงก์ (ดู `lib/requests/registryLinks.js`)
//
// ⭐ ทรง "รหัสบน · ชื่อล่าง" = กติกาของทั้งเว็บสำหรับ entity ในตาราง
//    บรรทัดล่าง = "ชื่อ · วันที่" (มติเจ้าของ 13/11/2026 · lib/master/registryLabel)
//
// ⭐ **ทั้งก้อนเป็นทางเข้าหน้ารายละเอียด** (มติผู้ใช้ 2026-08-18) — เดิมมีแต่รหัสที่กดได้
// ส่วนชื่อเป็นข้อความเฉย ๆ ⇒ คนกดที่ชื่อแล้วไม่มีอะไรเกิดขึ้น · ทะเบียนกลิ่น/สูตรกดที่
// แถวแล้วเข้าหน้ารายละเอียดอยู่แล้ว รายการในคำร้องต้องเดินเรื่องเหมือนกัน
//
// ⚠️ **ปุ่มแก้ไม่ได้อยู่ที่นี่** — อยู่ท้ายแถว (คอลัมน์สุดท้าย) รวมกับปุ่มลงมืออื่น ๆ
// ⚠️ **ไม่มีลิงก์ทะเบียน = ไม่ใช่ข้อมูลหาย** — แถวที่เกิดก่อนมีลิงก์ยังมีป้ายสแนปช็อต
// ของตัวเอง · บอกตรง ๆ ว่ายังไม่ผูก ดีกว่าโชว์ขีดแล้วให้เดาว่าข้อมูลหาย
import Link from "next/link";
import { formulaLabelParts, scentLabelParts } from "@/lib/master/registryLabel";
import styles from "./briefBoard.module.css";

const HREF = { formula: "/database/formulas", scent: "/database/scents" };

export function registryHref(registry) {
  if (!registry?.id) return null;
  return `${HREF[registry.kind] || HREF.scent}/${registry.id}`;
}

export default function RegistryCell({ registry = null, fallback = "—", extra = null, title = undefined }) {
  if (!registry) {
    return (
      <div className={styles.name}>
        <strong>{fallback}</strong>
        {extra}
      </div>
    );
  }
  const parts = registry.kind === "formula" ? formulaLabelParts(registry) : scentLabelParts(registry);
  return (
    <>
      {/* ลิงก์เดียวคร่อมทั้งรหัสและชื่อ — กดตรงไหนของก้อนก็เข้าหน้ารายละเอียดตัวนั้น */}
      <Link className={styles.registryLink} href={registryHref(registry)} title={title}>
        {/* PF บน · ชื่อ · วันที่ล่าง (มติเจ้าของ 13/11) — ไม่มีรหัสก็ขึ้น "ไม่มี PF" ให้เห็นว่าขาด */}
        <strong>{parts.code}</strong>
        <span>{`${registry.name || fallback} · ${parts.date}`}</span>
      </Link>
      {extra}
    </>
  );
}
