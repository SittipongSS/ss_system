"use client";
// ── ไฟล์ที่เลือกไว้ก่อนบันทึก — ปุ่มแนบ + รายการรอ ────────────────────────
//
// ⭐ ของที่ยังไม่มี entityId แนบขึ้น server ไม่ได้ (ทุกทางอัปต้องมี id ก่อน) ⇒ ฟอร์ม
// "สร้าง" ต้องถือ `File[]` ไว้ในหน่วยความจำแล้วให้ผู้เรียกอัปหลังบันทึก · หน้าที่ของ
// component นี้คือทำให้ทุกฟอร์มสร้างในระบบ **หน้าตาเหมือนกัน** ตอนอยู่ในจังหวะนั้น
//
// ⚠️ **คนละตัวกับ `AttachmentsPanel`** — ตัวนั้นคุยกับ server ได้แล้ว (ของที่บันทึกแล้ว
// มี id) มีลบจริง/พรีวิว/ประวัติ · อันนี้เป็นแค่ตะกร้ารอ ยังไม่มีอะไรอยู่บนเซิร์ฟเวอร์
//
// ⭐ ทางเข้าไฟล์ (กด · ลาก · Ctrl+V) และด่านขนาดไฟล์อยู่ที่ `lib/ui/useFileIntake`
// ที่เดียวทั้งระบบ (มติผู้ใช้ 2026-08-12 · IS-26080013) — ที่นี่เหลือแค่หน้าตา
import { FileText, Paperclip, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

const keyOf = (file) => `${file.name}:${file.size}:${file.lastModified}`;

export default function PendingFiles({
  files = [],
  onChange,
  disabled = false,
  onOversize,          // (message) => void — ผู้เรียกเอาไปโชว์ที่ที่ตัวเองใช้แจ้ง error
  label = "แนบไฟล์",
  // จำนวนสูงสุดที่ผู้เรียกยอมรับ — เกินแล้วปุ่มปิดตัวเอง พร้อมบอกเหตุผลติดปุ่ม
  // (ไม่ใช่ปุ่มจางเฉย ๆ ซึ่งเป็นสิ่งที่ทำให้คนคิดว่าระบบพัง — กติกา form-design-rules §2)
  max = 0,
  multiple = true,
  accept = UPLOAD_ACCEPT_ATTR,
  // คำบรรยายใต้ปุ่ม — ผู้เรียกที่มีข้อจำกัดของตัวเอง (PNG · 1 MB) เขียนทับได้
  hint,
}) {
  const full = max > 0 && files.length >= max;
  const off = disabled || full;

  const { open, inputProps, zoneProps } = useFileIntake({
    disabled: off,
    multiple,
    accept,
    onOversize,
    onFiles: (picked) => onChange(multiple ? [...files, ...picked] : picked),
  });

  return (
    <div className="pending-files" {...zoneProps}>
      <button
        type="button" className="pending-files-add" disabled={off}
        onClick={open}
        title={full ? `แนบได้สูงสุด ${max} ไฟล์` : undefined}
      >
        <Paperclip size={13} aria-hidden="true" />
        <span>{label}</span>
        <small>{hint ?? `ลากมาวาง หรือ Ctrl+V ได้ · สูงสุด ${MAX_UPLOAD_MB} MB ต่อไฟล์`}</small>
      </button>
      <input {...inputProps} />

      {full && (
        <p className="pending-files-note">แนบครบ {max} ไฟล์แล้ว — เอาบางไฟล์ออกก่อนถ้าจะเปลี่ยน</p>
      )}

      {files.length > 0 && (
        <ul className="pending-files-list">
          {files.map((file) => (
            <li key={keyOf(file)} className="pending-files-row">
              <FileText size={14} aria-hidden="true" />
              <span className="pending-files-name">{file.name}</span>
              <span className="pending-files-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              {/* ปุ่มไอคอนผ่าน <Button> กลาง — ห้ามเขียนคลาส btn เองในของใหม่
                  (ด่าน audit:ui นับ rawButtonClass เป็น ratchet ขึ้นไม่ได้) */}
              <Button
                iconOnly icon={<X size={13} />} disabled={disabled}
                title="นำออก" aria-label={`นำ ${file.name} ออกจากรายการแนบ`}
                onClick={() => onChange(files.filter((f) => keyOf(f) !== keyOf(file)))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
