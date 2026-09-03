"use client";

import { useRouter } from "next/navigation";
import { isInteractiveTarget } from "@/lib/uiRules";

/* การ์ดที่ทั้งใบคลิกได้ — **ฝาแฝดของ `ui/DetailRow.js` ต่างแค่เรนเดอร์ `<div>` แทน `<tr>`**
   (2026-09-02) ⚠️ อ่านสองข้อนี้ก่อนใช้
   1) `onClick` บน <div> คือ **ทางลัดของเมาส์** ไม่ใช่ทางเข้าของฟังก์ชัน
   2) ทางเข้าจริงคือ <Link href={ตัวเดียวกับ href ของการ์ด}> ที่ต้องอยู่ **ในตัวการ์ด**
      (ปกติที่หัวการ์ด) — คีย์บอร์ด · โปรแกรมอ่านหน้าจอ · คลิกขวาเปิดแท็บใหม่ อยู่ที่นั่น
   ด่าน CARD_MIRROR ใน `npm run audit:ui` บังคับข้อ 2 กับ **ทุกที่เรียก** (hard-zero)
   ⇒ href เป็น prop บังคับ · การ์ดที่ไม่พาไปไหนให้ใช้ <div> ธรรมดา

   ── ใช้ตัวนี้เมื่อไหร่ (เลือกจาก "ข้างในมี interactive ไหม" อย่างเดียว ไม่ใช่หน้าตา) ──
   · การ์ดที่ข้างใน **ไม่มี** ปุ่ม/ลิงก์/ช่องกรอกเลย → **ห่อทั้งใบด้วย `<Link>`** ไปเลย
     (ย้าย className/style ของ <div> เดิมขึ้นไปทั้งชุด + เติมคลาส `card-link`)
     ⇒ ไม่ต้องใช้ไฟล์นี้ และไม่ต้องพึ่งด่านอะไรเลย · ตัวอย่าง: `excise/DataList` การ์ด
     จอแนวตั้ง และ `RelationRow` ของหน้ารายละเอียดลูกค้า
   · การ์ดที่ข้างใน **มี** ปุ่ม/ลิงก์ของตัวเอง → ห่อทั้งใบไม่ได้ (`<a>` ห้ามมี interactive
     descendant · `<button>` รับได้แค่ phrasing content) ⇒ ใช้ไฟล์นี้ แล้ววาง `<Link>`
     ที่หัวการ์ดด้วย href **ตัวเดียวกันเป๊ะ**
   · การ์ดที่ทำงานอยู่ในหน้าเดิม (เปิดโมดัล/สลับเซลล์) → ไม่ใช่งานของไฟล์นี้เลย
     ต้องเป็น `<button type="button">` และ <div> ข้างในต้องกลายเป็น <span> ก่อน

   ── 🚫 ห้ามใส่ role/tabIndex/onKeyDown บน <div> ตัวนี้ ──────────────────────────
   เหตุผลเดียวกับที่ถอดออกจาก `<tr>` ของ DetailRow: ได้ tab stop เกินมาการ์ดละ 1 จุด
   ที่กด Enter แล้วผลเหมือนลิงก์ถัดไป 1 tab พอดี · และ Space บนลิงก์กลับไปเลื่อนหน้า
   ตามมาตรฐาน (ตัวรับคีย์ที่เขียนเองมักจะ preventDefault ทิ้งทุกครั้ง)

   🪤 ต้องส่ง `currentTarget` (= <div> ตัวนี้) เป็น **ขอบเขต** ให้ `isInteractiveTarget`
      เสมอ — ลืมข้อนี้เมื่อไหร่ ฟังก์ชันจะไล่ `closest()` ขึ้นไปเจอตัวการ์ดเองแล้วคืน
      true ทุกครั้ง ⇒ คลิกการ์ดไม่ทำงานเลยสักใบ (บั๊กที่ DetailRow เคยเจอมาแล้ว —
      คอมเมนต์ของ `isInteractiveTarget` ใน lib/uiRules.js เขียนไว้)

   📌 ที่เรียกวันนี้ **5 จุดใน 4 ไฟล์** (ทั้งหมดคือการ์ดที่มีปุ่มของตัวเองอยู่ข้างใน
   จึงห่อทั้งใบไม่ได้): ทะเบียนลูกค้า · ทะเบียนสินค้า (ทั้งคู่มี `<ApprovalActions>`
   โผล่มา **แบบมีเงื่อนไข** — `status === "pending" && canApproveRow`) · pm/tasks ซึ่งมี
   **สองที่เรียก** คือ `miniCard` กับ `taskRow` (มี `<StatusSelect>` ซึ่งเป็น `<select>`
   จริง · ปุ่มติดตาม · `<RowActionMenu>`) · settings/design-preview (ตัวอย่างสาธิตของ
   ท่านี้ในหน้าต้นแบบ วางคู่กับตาราง DetailRow เพื่อให้เห็นว่าเป็นกฎเดียวกันคนละแท็ก)
   ⚠️ **ที่เรียกต้องไม่มี `onClick` ของตัวเอง** — ทางยกเว้น cardShortcutExempt ยกให้
   `<div onClick>` **ในไฟล์นี้จุดเดียว** ไม่ได้ยกให้ที่เรียก · ส่ง `onClick` เข้ามาได้
   (prop ยังรับอยู่ เผื่อต้องทำอย่างอื่นก่อนเดินทาง) แต่มันจะไปเกาะบน `<div>` ตัวนี้
   ซึ่งถูกยกเว้นไปแล้ว ⇒ ไม่ใช่ช่องโหว่ · ที่ห้ามคือเขียน `<div onClick>` ขึ้นมาใหม่
   ในไฟล์ผู้เรียกเอง ซึ่งด่านจะนับเป็นความผิดตามปกติ */
export default function ClickableCard({ href, children, className = "", onClick, ...props }) {
  const router = useRouter();
  return (
    <div
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && href && !isInteractiveTarget(event.target, event.currentTarget)) {
          router.push(href);
        }
      }}
      {...props}
    >
      {children}
    </div>
  );
}
