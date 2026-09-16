"use client";
// ── แผง "ไม่พบจุดนี้หน้างาน" ของ TS (มติ 16/09/2026 ข้อ 23 · mig 0362) ──────────
//
// ⭐ **แผงเดียวสองที่** — ขั้น 1 ของวิซาร์ด (ทั้งใบ · เลือกจุดเองได้ ไม่ต้องเลือกไซต์ก่อน)
//   และขั้น 2 (รายกลุ่มจุด · กรณีเจอบางจุด) ต่างกันแค่ชุดจุดที่ส่งเข้ามา
//   ⚠️ ขั้น 1 ต้องมีทางนี้ เพราะปุ่ม "จัดสรรลงโซน" ปิดจนกว่าจะเลือกไซต์ ⇒ ลูกค้าที่สาขาปิด
//      จนไม่มีไซต์เลย จะไปไม่ถึงขั้น 2 และไม่มีทางบอกใครได้เลยว่าจุดนี้ไม่มีอยู่จริง
//
// ⚠️ **ไทล์เหตุผลไม่มีค่าตั้งต้น** — ของที่ต้องตัดสินห้ามมีคำตอบรออยู่แล้ว
// ⚠️ **หมายเหตุบังคับเฉพาะ "อื่น ๆ"** (มติข้อ 23.3) — ม็อกวาดบังคับทุกไทล์ ซึ่งมติทับแล้ว
//   บังคับพิมพ์ซ้ำในสิ่งที่ไทล์บอกครบแล้ว = คนพิมพ์ "-" ทิ้งไว้ แล้วฝ่ายขายไม่ได้อะไรเพิ่ม
//
// ⚠️ ปุ่มบอกผลลัพธ์ก่อนกด ไม่ใช่หลังกด — "ส่งกลับให้ฝ่ายขายตัดสิน · ยอดเงินและงวดไม่เปลี่ยน
//   · ถอนได้จนกว่าฝ่ายขายจะตัดสิน" อยู่เหนือปุ่มเสมอ
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import OptionTiles from "@/components/ui/OptionTiles";
import {
  SITE_NOTE_MAX, SITE_NOTE_REQUIRED_REASON, SITE_NOT_FOUND_REASONS,
  noteLength, siteNotFoundInputError,
} from "@/lib/sales/siteNotFound";
import { fmtNumber } from "@/lib/format";
import styles from "./IntakeWizard.module.css";

/* `points` = [{ key, label, lineIds, detail? }] — ขั้น 2 ส่งมากลุ่มเดียว ขั้น 1 ส่งมาทุกกลุ่ม */
export default function SiteNotFoundPanel({ points = [], onSubmit, onCancel, allowPick = false }) {
  const [picked, setPicked] = useState(() => (allowPick ? [] : points.map((p) => p.key)));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const lineIds = useMemo(
    () => points.filter((p) => picked.includes(p.key)).flatMap((p) => p.lineIds),
    [points, picked],
  );
  const noteRequired = reason === SITE_NOTE_REQUIRED_REASON;

  const submit = async () => {
    if (!lineIds.length) { setError("เลือกจุดที่ไม่พบอย่างน้อยหนึ่งจุด"); return; }
    const inputError = siteNotFoundInputError({ reason, note });
    if (inputError) { setError(inputError); return; }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ lineIds, reason, note });
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.notFoundPanel} role="group" aria-label="ไม่พบจุดนี้หน้างาน">
      <p className={styles.notFoundHead}>
        <AlertTriangle size={14} aria-hidden="true" /> <b>ไม่พบจุดนี้หน้างาน</b>
      </p>

      {/* ขั้น 1 เลือกได้ทีละจุดหรือทุกจุด · ขั้น 2 มีจุดเดียวอยู่แล้ว ⇒ ไม่ต้องมีอะไรให้เลือก */}
      {allowPick ? (
        <div className={styles.field}>
          <span>จุดที่ไม่พบ *</span>
          <OptionTiles
            multiple
            value={picked}
            onChange={setPicked}
            ariaLabel="จุดที่ไม่พบหน้างาน"
            options={points.map((p) => ({ value: p.key, label: p.label, description: p.detail }))}
          />
          <small className={styles.lead}>
            เลือกแล้ว {fmtNumber(picked.length)} จาก {fmtNumber(points.length)} จุด
          </small>
        </div>
      ) : (
        <p className={styles.lead}>
          จุด <b>{points[0]?.label}</b>{points[0]?.detail ? ` · ${points[0].detail}` : ""}
        </p>
      )}

      <div className={styles.field}>
        <span>เหตุผล *</span>
        <OptionTiles
          value={reason}
          onChange={setReason}
          ariaLabel="เหตุผลที่ไม่พบจุดนี้"
          options={SITE_NOT_FOUND_REASONS.map((r) => ({
            value: r.value, label: r.label, description: r.description,
          }))}
        />
      </div>

      <label className={styles.field}>
        <span>บอกฝ่ายขายว่าเจออะไรหน้างาน{noteRequired ? " *" : ""}</span>
        <Textarea
          rows={3}
          value={note}
          maxLength={SITE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={noteRequired ? "อธิบายว่าหน้างานเป็นอย่างไร" : "ไม่บังคับ — เขียนเพิ่มได้ถ้ามีรายละเอียด"}
        />
        <small>{fmtNumber(noteLength(note))}/{fmtNumber(SITE_NOTE_MAX)}</small>
      </label>

      <small className={styles.lead}>
        ส่งกลับให้ฝ่ายขายตัดสิน · <b>ยอดเงินและงวดในใบไม่เปลี่ยน</b> · จุดที่ส่งกลับหลุดจากคิวและป้ายทันที
        · จุดอื่นในใบผูกต่อได้ · ถอนได้จนกว่าฝ่ายขายจะตัดสิน
      </small>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className={styles.inlineAction}>
        <Button tone="neutral" variant="quiet" size="sm" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
        <Button tone="warning" size="sm" onClick={submit} disabled={saving}>
          {saving ? "กำลังส่ง…" : `ส่งกลับฝ่ายขาย ${fmtNumber(lineIds.length)} จุด`}
        </Button>
      </div>
    </div>
  );
}
