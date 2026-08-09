"use client";
// ── รายการบรรทัดที่ "ยุบเมื่อกรอกแล้ว" ──────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-09: บรรทัดที่กรอกเสร็จยุบเหลือแถวสรุปแถวเดียว เปิดเฉพาะใบที่
// กำลังกรอก · เลือกแบบนี้แทนรางข้างเพราะ **แถวสรุปโชว์รายละเอียดได้เยอะกว่าราง**
// (ราง 13rem ใส่ได้แค่ชื่อสั้น ๆ · แถวสรุปกินเต็มความกว้างจึงใส่หมวด+กลิ่น+วันที่ได้ครบ)
// และของทั้งชุดยังอยู่ในสายตาพร้อมกัน ซึ่งเป็นคำถามหลักของหัวข้อที่มีหลายรายการ
// ("ขออะไรไปแล้วบ้าง / ยังขาดอะไร")
//
// ⚠️ ต่างจาก `ui/SectionRail` ตรงที่รางใช้กับ **ชุดที่ตายตัวรู้ล่วงหน้า** (5 หมวดของ
// แบบฟอร์ม PDR) ส่วนอันนี้ใช้กับ **ของที่ผู้ใช้สร้างเอง 0..N** — สองอย่างนี้ไม่ใช่
// pattern เดียวกัน อย่ายุบรวม
import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";

export default function EditableLineList({
  count,                 // จำนวนบรรทัดทั้งหมด
  active,                // ตำแหน่งที่กำลังกรอก
  onActiveChange,
  renderSummary,         // (index) => node — เนื้อของแถวที่ยุบแล้ว
  children,              // ตัวแก้ไขของบรรทัดที่เปิดอยู่
  onAdd,
  addLabel = "เพิ่มรายการ",
  emptyText = "ยังไม่มีรายการ — กดปุ่มข้างล่างเพื่อเพิ่มรายการแรก",
  disabled = false,
}) {
  return (
    <div className="line-list">
      {/* ⚠️ ยังไม่มีแถวเลยต้อง **บอกว่าให้ทำอะไร** ไม่ใช่ปล่อยว่าง — ใบเพิ่งเลือกหัวข้อ
          จะมาถึงตรงนี้พร้อมศูนย์แถวเสมอ (มติผู้ใช้ 2026-08-09) */}
      {count === 0 && <p className="line-empty">{emptyText}</p>}
      {Array.from({ length: count }, (_, i) => (i === active ? (
        <div className="line-open" key={`open-${i}`}>{children}</div>
      ) : (
        // แถวที่ยุบแล้วเป็นปุ่ม — กดที่ไหนก็เปิดได้ ไม่ต้องเล็งปุ่ม "แก้"
        <button
          type="button" key={`sum-${i}`} className="line-summary"
          onClick={() => onActiveChange(i)} disabled={disabled}
        >
          {renderSummary(i)}
        </button>
      )))}

      <Button size="sm" disabled={disabled} icon={<Plus size={14} aria-hidden="true" />} onClick={onAdd}>
        {addLabel}
      </Button>
    </div>
  );
}
