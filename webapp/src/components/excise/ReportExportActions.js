"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FileSpreadsheet, FolderArchive, Printer } from "lucide-react";
import Button from "@/components/ui/Button";
import { notifyToast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/apiFetch";
import { ATTACHMENT_TYPES } from "@/lib/master/attachmentTypes";
import { openReportPrintWindow } from "@/lib/tax/reportPrint";
import { buildExportUrl } from "@/lib/tax/exportUrl";
import styles from "./ReportExportActions.module.css";

/* ── ปุ่มโหลดไฟล์ของคิวภาษี ────────────────────────────────────────────────
 *
 * ⭐ มติผู้ใช้ 2026-08-29: **ไม่มีเมนู "รายงาน" แยกอีกแล้ว** — Excel / พิมพ์ / ZIP
 * ไปอยู่บนคิวที่คนกำลังดูอยู่ · หน้า `/tax/reports` ถูกยุบทิ้ง
 *
 * ⚠️ **โหลดตามที่เห็นบนจอเสมอ** — ตัวกรองมีชุดเดียว (ชิป + ค้นหา + ตัวกรองในแถบ)
 * ไม่มีชุดที่สองให้ตั้งค่าซ้ำแล้วสงสัยว่าอันไหนมีผล · ที่ติ๊กเลือกไว้ชนะทุกอย่าง
 *
 * 🪤 **ค้นหาไม่มีคู่ฝั่ง server** ⇒ เวลามีคำค้นต้องส่ง `ids` ของแถวที่เห็นไปด้วย
 * ไม่งั้นไฟล์จะมีแถวที่จอกรองทิ้งไปแล้ว · แต่ `ids` ยาวเกินจะทำให้ URL ถูกตัดเงียบ ๆ
 * (เบราว์เซอร์/พร็อกซีจำกัดราว 2,000 ตัวอักษร) ⇒ เกินเพดานต้องบอกให้แคบก่อน
 * ไม่ใช่โหลดของที่ไม่ครบออกไปโดยไม่มีใครรู้
 */

// ประเภทเอกสารที่เลือกรวมใน ZIP ได้ — เอกสารทะเบียน + แผนที่ที่อยู่ (เอกสารลูกค้า
// ที่ผูกกับทะเบียน ไม่ใช่การ์ดของทะเบียนเอง จึงเติมเป็นตัวเลือกพิเศษท้ายลิสต์)
const ZIP_DOC_TYPES = [
  ...ATTACHMENT_TYPES.registration,
  { key: "address_map", label: "แผนที่ที่อยู่ (เอกสารลูกค้า)" },
];
const ZIP_ALL_KEYS = ZIP_DOC_TYPES.map((t) => t.key);

function ZipButton({ disabled, docTypes, onDocTypes, onDownload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (key) => onDocTypes((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div ref={ref} className={styles.wrap}>
      <Button
        tone="neutral"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        icon={<FolderArchive size={16} />}
        title="เลือกประเภทเอกสารที่จะดาวน์โหลด แบ่งโฟลเดอร์ตามรายการสินค้า"
      >
        ไฟล์แนบ (ZIP)
        <ChevronDown size={14} className={`${styles.caret} ${open ? styles.caretOpen : ""}`.trim()} />
      </Button>

      {open && (
        <div className={`glass-panel ${styles.menu}`}>
          <div className={styles.menuTitle}>เลือกประเภทเอกสารที่จะรวมใน ZIP</div>
          <div className={styles.list}>
            {ZIP_DOC_TYPES.map((t) => {
              const on = docTypes.has(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggle(t.key)}
                  className={`${styles.option} ${on ? styles.optionOn : ""}`.trim()}
                >
                  <span className={`${styles.tick} ${on ? styles.tickOn : ""}`.trim()}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <div className={styles.menuFoot}>
            <Button variant="ghost" size="sm" onClick={() => onDocTypes(new Set(ZIP_ALL_KEYS))}>เลือกทั้งหมด</Button>
            <Button tone="primary" size="sm" disabled={docTypes.size === 0} onClick={() => { onDownload([...docTypes]); setOpen(false); }}>
              ดาวน์โหลด
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @param type       'registration' | 'filing'
 * @param params     ตัวกรองที่ server เข้าใจ ({ status, customerId, from, to })
 * @param ids        รายการ id ที่จะโหลด — ที่ติ๊กเลือกไว้ หรือแถวที่เห็นบนจอเมื่อมีคำค้น
 *                   · ว่าง = ให้ server กรองเองจาก `params`
 * @param rowCount   จำนวนแถวที่จะได้ (ใช้ปิดปุ่มเมื่อไม่มีอะไรให้โหลด)
 * @param printMeta  หัวกระดาษของเอกสารพิมพ์ ({ from, to, customerName })
 */
export default function ReportExportActions({ type, params = {}, ids = [], rowCount = 0, printMeta = {} }) {
  const [docTypes, setDocTypes] = useState(() => new Set(ZIP_ALL_KEYS));
  const [printing, setPrinting] = useState(false);
  const empty = rowCount === 0;

  const tooLong = useMemo(() => buildExportUrl({ type, params, ids }).tooLong, [type, params, ids]);

  const go = (format, docTypeList = null) => {
    const { url, tooLong: over } = buildExportUrl({
      type, params, ids, format, docTypes: docTypeList, allDocTypeCount: ZIP_ALL_KEYS.length,
    });
    if (over) {
      notifyToast.error("รายการที่เลือกยาวเกินไป — กรองให้แคบลงหรือเลือกน้อยลงก่อนดาวน์โหลด");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.click();
  };

  /* พิมพ์ต้องดึง JSON มาก่อนเพราะยอดรวมท้ายรายงานคิดจาก **แถวที่พิมพ์จริง**
     — ไม่ใช่ยอดของทั้งคิว (ผู้ใช้เลือกบางแถวแล้วยอดต้องตรงกับที่เห็นบนกระดาษ) */
  const print = async () => {
    const { url, tooLong: over } = buildExportUrl({ type, params, ids });
    if (over) {
      notifyToast.error("รายการที่เลือกยาวเกินไป — กรองให้แคบลงหรือเลือกน้อยลงก่อนพิมพ์");
      return;
    }
    setPrinting(true);
    try {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error("โหลดข้อมูลสำหรับพิมพ์ไม่สำเร็จ");
      openReportPrintWindow(await res.json(), printMeta);
    } catch (e) {
      notifyToast.error(e?.message || "พิมพ์ไม่สำเร็จ");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      {type === "registration" && (
        <ZipButton
          disabled={empty || tooLong}
          docTypes={docTypes}
          onDocTypes={setDocTypes}
          onDownload={(list) => go("zip", list)}
        />
      )}
      <Button tone="neutral" onClick={print} disabled={empty || printing} icon={<Printer size={16} />}>
        {printing ? "กำลังเตรียม..." : "พิมพ์ / PDF"}
      </Button>
      <Button tone="primary" onClick={() => go("xlsx")} disabled={empty} icon={<FileSpreadsheet size={16} />}>
        ดาวน์โหลด Excel
      </Button>
    </>
  );
}
