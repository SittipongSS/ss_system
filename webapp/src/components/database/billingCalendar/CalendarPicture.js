"use client";
// ── รูปปฏิทินของลูกค้า (ต่อปี) ข้างตารางรอบจ่าย — แนบ · เปิดดูเทียบ · เปลี่ยน/เอาออก (รุ่นห้า · มติ 29/09) ─────────────
//
// ⭐ **ไม่มีระบบอ่านรูป** (มติ 29/09 "No AI picture reading") — รูปมีไว้ให้คนดูเทียบกับตารางทีละเดือน แล้วแตะ "ตรงกับรูป"
// ⭐ ทางแนบ = ทางเดียวของระบบ: `uploadAttachment` (ไบต์ขึ้น Drive → แถว attachments ของลูกค้า · docType `billing_calendar`
//    + metadata.year) · ทางเข้าไฟล์ = `useFileIntake` (กดเลือก · ลากวาง · Ctrl+V — docs/form-design-rules.md "แนบไฟล์")
//    กติกาเก็บแค่ `years[YYYY].fileId` = attachments.id — ไฟล์อยู่ในแท็บเอกสารของลูกค้าเหมือนไฟล์อื่น ลบกติกาแล้วไฟล์ไม่หาย
// ⚠️ แนบแล้ว = แถว attachments เกิดทันที (ก่อนกดบันทึกกติกา) — กดยกเลิกโมดัล ไฟล์ยังอยู่ในเอกสารของลูกค้า (ไม่ใช่ไฟล์กำพร้า)
//    และจอเสนอให้ "ใช้ไฟล์ที่แนบไว้แล้ว" ได้ในครั้งหน้า
// ⚠️ ชนิด `BILLING_CALENDAR_DOC_TYPE` + ช่องแคบ FN แนบได้ (`canAttachBillingCalendar` = `canEditCustomerBillingRule`) อยู่ที่
//    lib/master/attachmentTypes.js + attachmentAccess.js (สไลซ์ไฟล์แนบ · contracts §8) · `uploadAttachment` คืนแถวที่สร้าง
//    (`attachment` = body 201) ⇒ ผูก id นั้นตรง ๆ · อ่าน body ไม่ออก = ถอยไปหาแถวใหม่ด้วย id ที่เพิ่งเกิดในรายการ (ไม่ใช่ด้วย
//    docType — กันกรณี route ตกชนิดเป็น 'other') และพิมพ์เหตุจาก route ตรง ๆ
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, ImagePlus, Link2Off, Maximize2, Minimize2, Paperclip, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import PhotoThumb from "@/components/ui/PhotoThumb";
import { apiJson } from "@/lib/apiFetch";
import { attachmentHref } from "@/lib/master/attachmentStorage";
import { BILLING_CALENDAR_DOC_TYPE, docTypeFileRule, isRetiredAttachment } from "@/lib/master/attachmentTypes";
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import styles from "./CalendarEditor.module.css";

/* ชนิดไฟล์ที่รับ = กติกาไฟล์ของ docType นี้ในทะเบียนกลาง (รูป + PDF) — ไม่ประกาศซ้ำที่จอ */
const ACCEPT = docTypeFileRule(BILLING_CALENDAR_DOC_TYPE)?.accept || "image/*,application/pdf";

const fileHref = (row, fileId) => (row ? attachmentHref(row) : `/api/master/attachments/${encodeURIComponent(fileId)}/file`);
const isPdf = (row) => /pdf/i.test(String(row?.mimeType || "")) || /\.pdf$/i.test(String(row?.fileName || ""));

/**
 * แถวที่เพิ่งเกิดจากการแนบ — id ที่ไม่อยู่ในชุดก่อนแนบ (ชื่อไฟล์ตรงก่อน) · ไม่เจอ = null
 * ⭐ ไม่ตัดสินด้วย docType: ก่อนสไลซ์ไฟล์แนบลง `billing_calendar` route ตกชนิดเป็น 'other'
 */
export function newAttachmentOf(before, after, fileName) {
  const seen = new Set((before || []).map((row) => row.id));
  const fresh = (after || []).filter((row) => row?.id && !seen.has(row.id));
  return fresh.find((row) => row.fileName === fileName) || fresh[0] || null;
}

/**
 * ไฟล์ที่ "ใช้ได้" เป็นรูปปฏิทินของปีนี้ — แถว `billing_calendar` ที่ยังไม่ปลดระวาง · ปีตรงก่อน · ไม่รวมตัวที่ผูกอยู่
 * @returns `[{ id, fileName, year }]`
 */
export function calendarFileChoices(rows, year, currentId = "") {
  return (rows || [])
    .filter((row) => row?.id && row.docType === BILLING_CALENDAR_DOC_TYPE && row.id !== currentId && !isRetiredAttachment(row) && !row.restricted)
    .map((row) => ({ id: row.id, fileName: row.fileName || "ไฟล์ไม่มีชื่อ", year: Number(row.metadata?.year) || null }))
    .sort((a, b) => Number(b.year === Number(year)) - Number(a.year === Number(year)));
}

export default function CalendarPicture({ customerId, year, fileId = "", onFile }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(false);
  const rowsRef = useRef([]);

  const load = useCallback(async () => {
    if (!customerId) return [];
    const list = await apiJson(`/api/master/attachments?entityType=customer&entityId=${encodeURIComponent(customerId)}`, {
      cache: "no-store", fallbackError: "โหลดรายการเอกสารของลูกค้าไม่สำเร็จ",
    });
    const next = Array.isArray(list) ? list : [];
    rowsRef.current = next;
    setRows(next);
    return next;
  }, [customerId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const attach = async ([file]) => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const before = rowsRef.current;
      const result = await uploadAttachment({
        entityType: "customer", entityId: customerId, file, docType: BILLING_CALENDAR_DOC_TYPE, metadata: { year: Number(year) },
      });
      if (!result.ok) { setError(result.error || "แนบรูปปฏิทินไม่สำเร็จ"); return; }
      const after = await load();
      const row = result.attachment?.id ? result.attachment : newAttachmentOf(before, after, file.name);
      if (row?.id) onFile?.(row.id);
      else setError("แนบแล้ว แต่หาไฟล์ที่เพิ่งแนบไม่เจอ — เลือกจาก \"ใช้ไฟล์ที่แนบไว้แล้ว\" ด้านล่าง");
    } catch (err) {
      setError(err?.message || "แนบรูปปฏิทินไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const intake = useFileIntake({ onFiles: attach, onOversize: setError, multiple: false, accept: ACCEPT, disabled: busy });
  const current = fileId ? rows.find((row) => row.id === fileId) || null : null;
  const choices = calendarFileChoices(rows, year, fileId);
  const href = fileId ? fileHref(current, fileId) : "";

  return (
    <div className={styles.pic} {...intake.zoneProps}>
      <div className={styles.picHead}>
        <b>รูปปฏิทิน {year}</b>
        <small>{fileId ? (current?.fileName || "แนบไว้กับลูกค้า") : "ยังไม่แนบ"} · ดูเทียบเอง ไม่มีระบบอ่านรูป</small>
      </div>

      {fileId ? (
        <>
          {isPdf(current) ? (
            <a className={styles.picFile} href={href} target="_blank" rel="noopener noreferrer">
              <FileText size={16} aria-hidden="true" />
              <span>{current?.fileName || "ไฟล์ปฏิทิน"} — เปิดในแท็บใหม่</span>
            </a>
          ) : (
            <div className={styles.picBox} data-zoom={zoom ? "1" : undefined} tabIndex={0} aria-label={`รูปปฏิทินวางบิลปี ${year} — เลื่อนเพื่อดูเดือนอื่น`}>
              <PhotoThumb src={href} alt={`ปฏิทินวางบิลปี ${year} ของลูกค้า`} className={styles.picImg} label="เปิดรูปไม่ได้ — ลองเปิดในแท็บใหม่" />
            </div>
          )}
          <div className={styles.picActs}>
            {isPdf(current) ? null : (
              <Button variant="quiet" size="sm" icon={zoom ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />} aria-pressed={zoom} onClick={() => setZoom((v) => !v)}>
                {zoom ? "ย่อทั้งปี" : "ขยาย"}
              </Button>
            )}
            <a className={styles.picLink} href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} aria-hidden="true" />เปิดเต็ม
            </a>
            <Button variant="quiet" size="sm" icon={<RefreshCw size={14} aria-hidden="true" />} disabled={busy} onClick={intake.open}>
              {busy ? "กำลังแนบ…" : "เปลี่ยนรูป"}
            </Button>
            <Button variant="quiet" size="sm" icon={<Link2Off size={14} aria-hidden="true" />} disabled={busy} onClick={() => onFile?.("")}>
              เอาออกจากปีนี้
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.drop} data-over={intake.dragOver ? "1" : undefined}>
          <ImagePlus size={20} aria-hidden="true" />
          <b>แนบรูปปฏิทินของลูกค้า ปี {year}</b>
          <small>กดเลือก · ลากมาวาง · หรือวางจากคลิปบอร์ด (Ctrl+V) · เก็บไว้ในเอกสารของลูกค้า</small>
          <Button size="sm" tone="neutral" icon={<Paperclip size={14} aria-hidden="true" />} disabled={busy} onClick={intake.open}>
            {busy ? "กำลังแนบ…" : "เลือกไฟล์"}
          </Button>
        </div>
      )}

      {choices.length ? (
        <div className={styles.picChoices}>
          <small>ใช้ไฟล์ที่แนบไว้แล้ว:</small>
          {choices.slice(0, 4).map((choice) => (
            <button key={choice.id} type="button" className="choice-chip" onClick={() => { setError(""); onFile?.(choice.id); }}>
              {choice.fileName}{choice.year ? ` · ${choice.year}` : ""}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className={styles.picError} role="alert">{error}</p> : null}
      <input {...intake.inputProps} />
    </div>
  );
}
