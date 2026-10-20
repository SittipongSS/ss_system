"use client";
// ── ช่องไฟล์บังคับของรูปแบบคำร้อง (ประเมินจากแบบ งวด 4 · S4 B-3) ────────────────────────────
//
// ⭐ **บล็อกเดียว สองที่เก็บ** — ป้าย · คำบรรยาย · เครื่องหมายบังคับชุดเดียวกันทั้งตอนสร้างและตอนแก้
//    (กฎ "แก้ไข = ฟอร์มเดียวกับสร้าง") ต่างกันแค่ที่พักไฟล์ ซึ่งเป็นเหตุผลด้านข้อมูล:
//    · `mode="pending"` (สร้าง) — ใบยังไม่มี id ⇒ ถือไฟล์ไว้ในหน่วยความจำ (`PendingFiles`) ผู้เรียกอัปหลังบันทึก
//    · `mode="saved"` (แก้ · การ์ดบนหน้าคำร้อง) — ใบมี id แล้ว ⇒ `AttachmentsPanel` ที่ขอ docType เดียว อัป/ลบทันที
//    รูปเดียวกับช่อง "แนบไฟล์" ทั่วไปของฟอร์มที่แยกสองโหมดอยู่แล้ว
// ⭐ ข้อความทุกคำมาจากทะเบียน (`requestRequiredFiles(subject)` → `{ docType, label, hint, accept, rejectText }`)
//    ไม่มีชื่อหัวข้อหรือชื่อ docType ในไฟล์นี้
// ⚠️ ไฟล์ที่ชนิดไม่ตรงถูกทิ้ง **ก่อน** เข้าตะกร้า/ก่อนอัป แล้วบอก `rejectText` — ไฟล์ที่ผ่านในชุดเดียวกันยังเข้าได้
// ⚠️ ตัวนับ (`onCountChange`) โหมด saved: ตัวเลข = รายการโหลดได้แล้ว · `null` = ยังไม่รู้ (กำลังโหลด/โหลดพัง)
//    ห้ามแปลง "ยังไม่รู้" เป็น 0 — ด่านจะบอกว่าไม่มีไฟล์ทั้งที่ใบมีแบบแนบอยู่
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import PendingFiles from "@/components/ui/PendingFiles";
import { requestRequiredFileAccepts, requestRequiredFileCount } from "@/lib/master/requestTypes";
import { requiredFilesPick } from "@/lib/requests/requiredFilesPick";
import formStyles from "./requestForm.module.css";
import styles from "./RequiredFilesBlock.module.css";

// รายการในตะกร้าเป็นได้ทั้ง `File` และ `{ file, ref }` (ไฟล์ที่อัปไปแล้วรอบก่อน — กดส่งซ้ำต้องไม่อัปซ้ำ)
const fileOf = (entry) => entry?.file || entry;

export default function RequiredFilesBlock({
  spec,
  mode = "pending",
  files = [],
  onFilesChange,
  requestId = null,
  canEdit = false,
  disabled = false,
  invalid = false,
  onCountChange,
  /* โหมด saved: แผงไฟล์แนบอีกแผงของใบเดียวกัน (การ์ด "ไฟล์แนบของคำร้อง") ซิงก์กับบล็อกนี้ผ่านผู้เรียก
     (`lib/requests/attachmentsSync`) — `onAttachmentsChange(items, { loaded })` = รายการทั้งใบที่แผงนี้โหลดได้ ·
     `reloadKey` = ผู้เรียกขยับเมื่ออีกแผงแนบ/ลบ ⇒ โหลดใหม่ (ตัวนับของด่านส่งตามทัน) */
  onAttachmentsChange,
  reloadKey = 0,
  /* ผู้เรียกวาดชื่อของบล็อกเองแล้ว (การ์ด DRAWINGS ของหน้าคำร้อง — ชื่อการ์ด = `spec.label`) ⇒ ไม่วาดบรรทัดป้ายซ้ำ
     คำบรรยาย (`spec.hint`) ยังอยู่ · ฟอร์ม (สร้าง/แก้) ไม่ส่ง = ป้าย "… (บังคับ)" เหมือนเดิม (UAT S4 รอบ 4 ข้อ 14) */
  hideLabel = false,
}) {
  /* สองข้อความแยกกัน (ผลรีวิวรอบแก้ S4 · `requiredFilesPick`) — ไฟล์ใหญ่เกินถูกบอก **ก่อน** ไฟล์ที่เหลือมาถึง `pick`
     ในรอบเดียวกัน ⇒ ข้อความเดียวถูกล้างทิ้งทันที · `oversizeNow` = ชุดที่กำลังเข้ามีไฟล์ใหญ่ (คืนค่าหลังจบชุด) */
  const [typeMessage, setTypeMessage] = useState("");
  const [oversizeMessage, setOversizeMessage] = useState("");
  const oversizeNow = useRef(false);

  // ผู้เรียกส่งฟังก์ชันใหม่ทุกรอบ render ได้ — ถือไว้ใน ref เพื่อให้ `onItemsChange` ของแผงคงตัว
  // (แผงยิง callback ใน effect ที่ขึ้นกับตัวมัน ⇒ ตัวใหม่ทุกรอบ = ยิงทุกรอบ)
  const countRef = useRef(onCountChange);
  const specRef = useRef(spec);
  const attachmentsRef = useRef(onAttachmentsChange);
  useEffect(() => {
    countRef.current = onCountChange;
    specRef.current = spec;
    attachmentsRef.current = onAttachmentsChange;
  }, [onCountChange, spec, onAttachmentsChange]);
  const onItemsChange = useCallback((items, { loaded } = {}) => {
    countRef.current?.(loaded ? requestRequiredFileCount(items, specRef.current) : null);
    attachmentsRef.current?.(items, { loaded });
  }, []);

  const fileGate = useMemo(() => (spec ? {
    accept: spec.accept,
    test: (file) => requestRequiredFileAccepts(spec, file),
    rejectText: spec.rejectText,
  } : null), [spec]);
  const docTypes = useMemo(() => (spec ? [{ key: spec.docType, label: spec.label, required: false }] : []), [spec]);

  if (!spec) return null;

  const warnOversize = (text) => {
    oversizeNow.current = true;
    setOversizeMessage(text);
    // ตัวรับไฟล์เรียก onOversize แล้วต่อด้วย onFiles แบบ synchronous ⇒ คืนค่าหลังจบชุดนี้
    queueMicrotask(() => { oversizeNow.current = false; });
  };
  const pick = (next) => {
    const out = requiredFilesPick(spec, files, next, { oversizeInBatch: oversizeNow.current });
    setTypeMessage(out.typeMessage);
    if (out.clearOversize) setOversizeMessage("");
    onFilesChange?.(out.files);
  };

  return (
    <div className={styles.block}>
      {!hideLabel && <span className={formStyles.fieldLabel}>{spec.label} (บังคับ)</span>}
      <small className={formStyles.hint}>{spec.hint}</small>
      {mode === "saved" ? (
        <AttachmentsPanel
          entityType="dept_request"
          entityId={requestId}
          canEdit={canEdit && !disabled}
          inlineUpload
          docTypes={docTypes}
          fileGate={fileGate}
          onItemsChange={onItemsChange}
          reloadKey={reloadKey}
        />
      ) : (
        <PendingFiles
          files={files.map(fileOf)}
          onChange={pick}
          disabled={disabled}
          invalid={invalid}
          accept={spec.accept}
          label="แนบไฟล์"
          onOversize={warnOversize}
        />
      )}
      {oversizeMessage && <small className={styles.error} role="alert">{oversizeMessage}</small>}
      {typeMessage && <small className={styles.error} role="alert">{typeMessage}</small>}
    </div>
  );
}
