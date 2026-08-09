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
// ⚠️ ด่านขนาดไฟล์อยู่ที่นี่ที่เดียว — ปล่อยให้ผู้เรียกเช็คเองแล้วจะมีที่ที่ลืมเช็ค
// แล้วผู้ใช้เพิ่งรู้ตอนอัปไม่ผ่านหลังกดบันทึก (เสียรอบไปหนึ่งรอบ)
import { useRef } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

const keyOf = (file) => `${file.name}:${file.size}:${file.lastModified}`;

export default function PendingFiles({
  files = [],
  onChange,
  disabled = false,
  onOversize,          // (message) => void — ผู้เรียกเอาไปโชว์ที่ที่ตัวเองใช้แจ้ง error
  label = "แนบไฟล์",
}) {
  const inputRef = useRef(null);

  const pick = (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";   // เลือกไฟล์เดิมซ้ำได้ (ถอดออกแล้วเปลี่ยนใจ)
    const oversized = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized.length) {
      onOversize?.(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB: ${oversized.map((f) => f.name).join(", ")}`);
    }
    const ok = picked.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (ok.length) onChange([...files, ...ok]);
  };

  return (
    <div className="pending-files">
      <button
        type="button" className="pending-files-add" disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={13} aria-hidden="true" />
        <span>{label}</span>
        <small>สูงสุด {MAX_UPLOAD_MB} MB ต่อไฟล์</small>
      </button>
      <input
        ref={inputRef} type="file" multiple accept={UPLOAD_ACCEPT_ATTR}
        disabled={disabled} onChange={pick} className="hidden"
      />

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
