"use client";
// ── รูปของแถว checklist ใบสเปค (หนึ่งแถวหนึ่งรูป · ไม่บังคับ) — แนบ · เปิดดู · เปลี่ยน · เอาออก ─────────────
//
// ⭐ **มติเจ้าของ 08/10/2569**: ราคาทุนกับรูปของแถวเป็นของ **ในระบบเท่านั้น** — อยู่บนหน้าสเปคของสินค้าที่เดียว
//    ไม่ลงกระดาษ FM-SA-04 ไม่เข้าภาพนิ่งของเอกสาร ไม่ขึ้นจอเอกสาร
// ⭐ ทางแนบ = ทางเดียวของระบบ (ทรงเดียวกับ billingCalendar/CalendarPicture): `uploadAttachment` (ไบต์ขึ้น Drive →
//    แถว attachments ของสินค้า · docType `spec_item_image`) · ทางเข้าไฟล์ = `useFileIntake`
//    แถวเก็บแค่ตัวชี้ `imageAttachmentId` = attachments.id
// ⚠️ **เปลี่ยน/เอาออก แตะแค่ตัวชี้ในร่าง** — ไม่ลบไฟล์จากจอนี้: ผู้ใช้ยังไม่ได้กดบันทึก (ทิ้งร่างแล้วรูปเดิมต้องยังอยู่)
//    ไฟล์ที่ไม่มีแถวไหนชี้ถึงแล้ว server เก็บกวาดเองตอนบันทึกสเปค
// ⚠️ **paste: "focused"** — ตารางมีกล่องนี้แถวละกล่อง (17–37 กล่อง) และแนบแล้วขึ้น server ทันที ⇒ Ctrl+V ลอย ๆ
//    ต้องไม่ลงแถวแรกเงียบ ๆ และต้องไม่แย่งแผงภาพประกอบข้างล่าง · วางได้เมื่อโฟกัสอยู่ที่ปุ่มของกล่องนี้เอง
//    และป้ายกล่อง (`zoneProps`) อยู่บน <div> ของกล่องเท่านั้น — ติดบนเซลล์/แถวของตารางเมื่อไร การวางรูปตอนเคอร์เซอร์
//    อยู่ในช่อง "รายละเอียด" ของแถวเดียวกันจะกลายเป็นการแนบรูป
// ⚠️ `onBusy(+1)` ก่อนอัป · `onBusy(-1)` ใน finally **ที่เดียว** — ไม่ลดตอน unmount (แถวที่ถูกลบระหว่างอัปจะลดซ้ำสองรอบ)
//    ⇒ effect ตัวเดียวของไฟล์นี้คือตัวคืนโฟกัสข้างล่าง: ไม่คืน cleanup และไม่แตะ `onBusy`
// ⚠️ **คืนโฟกัสเข้ากล่องหลังแนบ/เอาออก** — ปุ่ม "แนบรูป" กับคู่ "เปลี่ยน/เอาออก" เป็นคนละ element ที่ตำแหน่งเดียวกัน
//    ⇒ ค่าเปลี่ยนเมื่อไร React ถอดปุ่มที่โฟกัสอยู่ทิ้ง โฟกัสตกไป <body>: คนใช้คีย์บอร์ดหลุดจากแถว และ Ctrl+V ต่อไม่ติด
//    (paste "focused" ต้องมีโฟกัสอยู่ในกล่อง) · ตั้งธง `refocus` ตอนลงมือ แล้ว effect ย้ายโฟกัสไปปุ่มแรกที่กดได้
import { useEffect, useRef, useState } from "react";
import { ImagePlus, RefreshCw, X } from "lucide-react";
import Button from "@/components/ui/Button";
import PhotoThumb from "@/components/ui/PhotoThumb";
import { naText } from "@/lib/format";
import { attachmentFileRuleError, docTypeFileRule, SPEC_ITEM_IMAGE_DOC_TYPE } from "@/lib/master/attachmentTypes";
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import styles from "./SpecItemImageCell.module.css";

/* ชนิดไฟล์ + เพดานขนาด = กติกาของ docType นี้ในทะเบียนกลาง (รูปเท่านั้น · 5 MB) — ไม่ประกาศซ้ำที่จอ */
const RULE = docTypeFileRule(SPEC_ITEM_IMAGE_DOC_TYPE) || {};

/** ยังไม่มีสเปค = ยังไม่มีแถวให้ผูกรูป — ข้อความที่จอส่งเป็น `blockedReason`
 * ⚠️ **ฟอร์มพิมพ์ประโยคนี้ครั้งเดียวเหนือตาราง** (ProductSpecForm) · กล่องนี้ถือไว้แค่เป็น `title` ของปุ่ม — พิมพ์ซ้ำใต้ปุ่มทุกแถว
 *    (เปิดจอดูแล้ว 08/10) = ประโยคเดียวกัน 17 บรรทัด และทุกแถวสูงจาก 53px เป็น 82px */
export const SPEC_ITEM_IMAGE_NEEDS_SPEC = "สร้างสเปคก่อน จึงแนบรูปของแต่ละแถวได้";

const imageHref = (id) => `/api/master/attachments/${encodeURIComponent(id)}/file`;

export default function SpecItemImageCell({
  productId,
  value = null,
  canAttach = false,
  blockedReason = "",
  readOnly = false,
  rowLabel = "",
  onChange,
  onBusy,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = rowLabel || "แถวนี้";
  // ⚠️ ref นี้อยู่บนแถวปุ่ม ไม่ใช่ <div> ของกล่อง — `zoneProps` พก ref ของ hook มาเอง ใส่ซ้อนที่เดียวกัน = ทับกัน
  const cellRef = useRef(null);
  const refocus = useRef(false);

  /* คืนโฟกัสหลังปุ่มที่กดถูกถอด (ดูหัวไฟล์) · ผูก `busy` ด้วย — หลังอัปเสร็จปุ่มต้องกลับมากดได้ก่อนจึงรับโฟกัสได้
     ⚠️ ผู้ใช้ย้ายโฟกัสไปที่อื่นระหว่างรูปกำลังขึ้น = ไม่แย่งกลับ (เขาอาจกำลังพิมพ์ช่องอื่นอยู่)
     ⚠️ ห้ามคืน cleanup จาก effect นี้ และห้ามเรียก `onBusy` ในนี้ — ตัวนับงานค้างลดที่ finally ที่เดียว */
  useEffect(() => {
    if (!refocus.current || busy) return;
    refocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body && !cellRef.current?.contains(active)) return;
    cellRef.current?.querySelector("button:not([disabled])")?.focus();
  }, [value, busy]);

  const attach = async ([file]) => {
    if (!file || busy || readOnly || !canAttach) return;
    // ด่านชนิด/ขนาดชุดเดียวกับที่ server ถาม — รู้ก่อนเสียรอบอัปขึ้น Drive
    const ruleError = attachmentFileRuleError(SPEC_ITEM_IMAGE_DOC_TYPE, file);
    if (ruleError) { setError(ruleError); return; }
    setBusy(true);
    setError("");
    onBusy?.(1);
    try {
      const result = await uploadAttachment({
        entityType: "product", entityId: productId, file, docType: SPEC_ITEM_IMAGE_DOC_TYPE,
      });
      if (!result.ok) { setError(result.error || "แนบรูปไม่สำเร็จ"); return; }
      if (result.attachment?.id) { refocus.current = true; onChange?.(result.attachment.id); }
      else setError("แนบแล้วแต่อ่านผลกลับไม่ได้ — ลองแนบอีกครั้ง");
    } catch (err) {
      setError(err?.message || "แนบรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
      onBusy?.(-1);
    }
  };

  const intake = useFileIntake({
    onFiles: attach,
    onOversize: setError,
    multiple: false,
    accept: RULE.accept,
    maxBytes: RULE.maxBytes,
    paste: "focused",
    disabled: readOnly || !canAttach || busy,
  });

  const thumb = value ? (
    <a
      className={styles.thumb}
      href={imageHref(value)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`เปิดรูปของ ${name} ในแท็บใหม่`}
      title="เปิดรูปในแท็บใหม่"
    >
      <PhotoThumb src={imageHref(value)} alt={`รูปของ ${name}`} className={styles.img} label="" />
    </a>
  ) : null;

  if (readOnly) return thumb || naText(null);

  return (
    <div className={styles.cell} data-over={intake.dragOver ? "1" : undefined} {...intake.zoneProps}>
      <div ref={cellRef} className={styles.row}>
        {thumb}
        {value ? (
          <>
            <Button
              iconOnly variant="ghost" size="sm" disabled={!canAttach || busy}
              aria-label={`เปลี่ยนรูปของ ${name}`}
              title={!canAttach && blockedReason ? blockedReason : (busy ? "กำลังแนบ…" : "เปลี่ยนรูป")}
              icon={<RefreshCw size={14} aria-hidden="true" />} onClick={intake.open}
            />
            <Button
              iconOnly tone="danger" variant="ghost" size="sm" disabled={busy}
              aria-label={`เอารูปออกจาก ${name}`} title="เอารูปออก"
              icon={<X size={14} aria-hidden="true" />} onClick={() => { setError(""); refocus.current = true; onChange?.(null); }}
            />
          </>
        ) : (
          <Button
            size="sm" variant="ghost" disabled={!canAttach || busy}
            aria-label={`แนบรูปของ ${name}`} title={!canAttach && blockedReason ? blockedReason : undefined}
            icon={<ImagePlus size={13} aria-hidden="true" />} onClick={intake.open}
          >
            {busy ? "กำลังแนบ…" : "แนบรูป"}
          </Button>
        )}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <input {...intake.inputProps} />
    </div>
  );
}
