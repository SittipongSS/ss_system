"use client";
import { Paperclip } from "lucide-react";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import OptionTiles from "@/components/ui/OptionTiles";
import PendingFiles from "@/components/ui/PendingFiles";
import { fmtDate, naText } from "@/lib/format";
import {
  CONFIRM_DOC_TYPES, CONFIRM_DOC_TYPE_LABELS, MAX_CONFIRM_ATTACHMENTS,
  MAX_CONFIRM_DOC_NO, confirmDocNoRule,
} from "@/lib/sales/orderConfirmationDocs";
import styles from "./SalesOrderConfirmationFields.module.css";

const TILE_DESCRIPTIONS = {
  payment_slip: "ลูกค้าจ่ายมาแล้ว — ใช้เป็นหลักฐานงวดแรกได้เลย",
  po: "ต้องมีเลขที่ PO — ใบสั่งขายใช้เป็นเอกสารอ้างอิง",
  order_confirmation: "อีเมล/ใบยืนยันที่ไม่มีเลขที่ก็ได้",
};

/**
 * ช่องกรอก "เอกสารยืนยันคำสั่งซื้อ" — **ตัวเดียวกันทั้งตอนสร้างใบและตอนแก้ใบร่าง**
 * (กฎ AGENTS.md: ฟอร์มสร้างกับฟอร์มแก้ต้องเป็น component เดียว ต่างกันได้แค่โหมด)
 *
 * โหมด:
 *   `pending` — ยังไม่มีใบ ⇒ ไฟล์เป็น `File[]` ในหน่วยความจำ (PendingFiles)
 *   `saved`   — ใบมีแล้ว ⇒ ไฟล์เป็น ref ที่บันทึกไว้ แสดงเป็นลิงก์ผ่าน proxy
 *   `read`    — อ่านอย่างเดียว (ใบที่ยื่น/อนุมัติแล้ว)
 *
 * ⚠️ ชนิดเอกสารใช้ OptionTiles ไม่ใช่ดรอปดาวน์ — ชุดตายตัว 3 ตัวเลือกและมันเป็น
 * ช่องที่เปลี่ยนความหมายของช่องอื่น (เลขที่บังคับ/ไม่บังคับ) จึงต้องเห็นครบก่อนเลือก
 */
export default function SalesOrderConfirmationFields({
  value,                 // { docType, docNo, docDate, attachments }
  onChange,
  files = [],            // File[] — โหมด pending เท่านั้น
  onFilesChange,
  onOversize,
  mode = "pending",
  disabled = false,
  fileHref,              // (index) => string — โหมด saved/read: ลิงก์เปิดไฟล์ผ่าน proxy
}) {
  const docType = value?.docType || "";
  const docNoRule = confirmDocNoRule(docType);
  const saved = Array.isArray(value?.attachments) ? value.attachments : [];
  const set = (patch) => onChange?.({ ...value, ...patch });

  if (mode === "read") {
    return (
      <div className="form-grid cols-2">
        <div className="readonly-field">
          <span className="toolbar-label">ประเภทเอกสาร</span>
          <div className="readable-field is-compact">{naText(CONFIRM_DOC_TYPE_LABELS[docType])}</div>
        </div>
        <div className="readonly-field">
          <span className="toolbar-label">วันที่บนเอกสาร</span>
          <div className="readable-field is-compact">{value?.docDate ? fmtDate(value.docDate) : naText(null)}</div>
        </div>
        {docNoRule !== "none" && (
          <div className="readonly-field">
            <span className="toolbar-label">เลขที่เอกสาร</span>
            <div className="readable-field is-compact mono">{naText(value?.docNo)}</div>
          </div>
        )}
        <div className={`readonly-field ${styles.wide}`}>
          <span className="toolbar-label">ไฟล์แนบ</span>
          <SavedFiles files={saved} fileHref={fileHref} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <div className="form-group">
        <span className="toolbar-label">ประเภทเอกสาร *</span>
        <OptionTiles
          ariaLabel="ประเภทเอกสารยืนยันคำสั่งซื้อ"
          value={docType}
          disabled={disabled}
          onChange={(next) => set({
            docType: next,
            // เลขที่ของสลิปไม่มีความหมาย — ล้างทิ้งตอนสลับ ไม่ปล่อยให้ค้างแล้วถูกส่งไป
            docNo: confirmDocNoRule(next) === "none" ? "" : (value?.docNo || ""),
          })}
          options={CONFIRM_DOC_TYPES.map((t) => ({
            value: t.value,
            label: t.label,
            description: TILE_DESCRIPTIONS[t.value],
          }))}
        />
      </div>

      <div className="form-grid cols-2">
        {docNoRule !== "none" && (
          <label>
            <span>เลขที่เอกสาร {docNoRule === "required" ? "*" : "(ถ้ามี)"}</span>
            <Input
              value={value?.docNo || ""} maxLength={MAX_CONFIRM_DOC_NO} disabled={disabled}
              placeholder="เช่น PO-2569-00123"
              onChange={(event) => set({ docNo: event.target.value })}
            />
            <p className="form-note">ค่านี้เป็นค่าตั้งต้นของ &ldquo;เอกสารอ้างอิง&rdquo; ของใบ — ค้นหาได้และขึ้นเป็นคอลัมน์ในตาราง</p>
          </label>
        )}
        <label>
          <span>วันที่บนเอกสาร *</span>
          <DateInput value={value?.docDate || ""} disabled={disabled} onChange={(next) => set({ docDate: next })} />
          <p className="form-note">วันที่ลูกค้าออกเอกสาร ไม่ใช่วันที่บันทึกเข้าระบบ</p>
        </label>
      </div>

      <div className="form-group">
        <span className="toolbar-label">ไฟล์เอกสารยืนยัน *</span>
        {mode === "saved" && saved.length > 0 && <SavedFiles files={saved} fileHref={fileHref} />}
        <PendingFiles
          files={files} onChange={onFilesChange} disabled={disabled}
          max={Math.max(0, MAX_CONFIRM_ATTACHMENTS - (mode === "saved" ? saved.length : 0))}
          onOversize={onOversize}
        />
      </div>
    </div>
  );
}

function SavedFiles({ files = [], fileHref }) {
  if (!files.length) return <div className="readable-field is-compact"><span className="readable-field-empty">ยังไม่มีไฟล์แนบ</span></div>;
  return (
    <ul className={styles.fileList}>
      {files.map((att, index) => {
        const label = att.fileName || `ไฟล์ ${index + 1}`;
        const href = fileHref?.(index) || att.fileUrl || null;
        return (
          <li key={`${att.storagePath || att.fileUrl || "f"}-${index}`}>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className={`linklike ${styles.fileItem}`}>
                <Paperclip size={13} aria-hidden="true" /> <span className="cell-ellipsis">{label}</span>
              </a>
            ) : (
              <span className={styles.fileItem}>
                <Paperclip size={13} aria-hidden="true" /> {label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
