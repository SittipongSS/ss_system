"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronsDownUp, ChevronsUpDown, Layers } from "lucide-react";
import Button from "./Button";
import MenuSelect from "./MenuSelect";

/* ── ปุ่มคุมมุมมองของตาราง: จัดกลุ่ม · ย่อ/ขยายทุกกลุ่ม · เรียง · ทิศทาง ─────────
 *
 * ⭐ **ชุดเดียวของทั้งเว็บ** (มติผู้ใช้ 2026-08-08 เรื่องทรงปุ่ม · ยกมารวมไฟล์เดียว
 * 2026-08-15 ตอนกระจายไป 5 ตาราง) — ปุ่มพวกนี้ทรงเดียวกับปุ่มตัวกรอง ชื่อ+ไอคอน
 * อยู่ในปุ่มเอง ไม่มีป้ายข้างนอก · แต่ละหน้าเคยประกอบเองทีละชิ้น ซึ่งแปลว่าไอคอน
 * ป้าย และ tooltip จะค่อย ๆ เพี้ยนกันเองทีละหน้า
 *
 * ลำดับบน toolbar ที่ยึดกัน: ค้นหา · ตัวกรอง · [จัดกลุ่ม + ย่อ/ขยาย] · spacer · [เรียง + ทิศทาง]
 */

/** ปุ่ม "จัดกลุ่ม" — `options` ต้องมี `{ value: "none" }` เป็นตัวแรกเสมอ */
export function GroupMenu({ value, onChange, options, title = "จัดกลุ่มรายการ" }) {
  return (
    <MenuSelect
      icon={Layers}
      label="จัดกลุ่ม"
      title={title}
      value={value}
      onChange={onChange}
      options={options}
      isActive={(current) => current !== "none"}
    />
  );
}

/* ปุ่มไอคอนล้วนข้างปุ่มจัดกลุ่ม — โผล่เฉพาะตอนจัดกลุ่มอยู่จริง
   ⚠️ ป้ายบอก **สิ่งที่จะเกิดเมื่อกด** ไม่ใช่สถานะปัจจุบัน (กติกาเดียวกับตารางดีล) */
export function CollapseAllButton({ collapsed, onToggle }) {
  const label = collapsed ? "ขยายทุกกลุ่ม" : "ย่อทุกกลุ่ม";
  return (
    <Button
      iconOnly
      onClick={onToggle}
      title={label}
      aria-label={label}
      icon={collapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
    />
  );
}

/** ปุ่ม "เรียง" — `defaultValue` คือแบบเรียงตั้งต้นของหน้านั้น (ไม่ทำให้ปุ่มติดสี) */
export function SortMenu({ value, onChange, options, defaultValue, title = "เรียงลำดับ" }) {
  return (
    <MenuSelect
      icon={ArrowUpDown}
      label="เรียง"
      title={title}
      value={value}
      onChange={onChange}
      options={options}
      showValue
      isActive={(current) => current !== defaultValue}
    />
  );
}

/** ปุ่มสลับทิศทางการเรียง — คู่กับ `SortMenu` เสมอ */
export function SortDirButton({ dir, onToggle }) {
  const asc = dir !== "desc";
  return (
    <Button
      iconOnly
      className="ui-sort-direction"
      onClick={onToggle}
      title={asc ? "น้อย → มาก" : "มาก → น้อย"}
      aria-label={asc ? "เรียงจากน้อยไปมาก" : "เรียงจากมากไปน้อย"}
      icon={asc ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
    />
  );
}
