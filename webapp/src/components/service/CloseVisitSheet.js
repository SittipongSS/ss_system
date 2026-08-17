"use client";
// ── แผ่นปิดงานหน้าไซต์ (S-3) ──────────────────────────────────────────────
//
// ⭐ นี่คือจุดที่ข้อมูลจริงเข้าระบบ · ทุกอย่างอยู่ในจอเดียว ไม่ต้องกดข้ามหน้า
// ⚠️ รูปและลายเซ็น **ไม่บังคับ** (มติผู้ใช้ 2026-07-30) — บังคับแล้วช่างจะปิดงาน
//    ไม่ได้ตรงนั้น แล้วไปบันทึกย้อนหลังทีหลัง ทำให้เวลาที่บันทึกผิดทั้งชุด
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import TimeInput from "@/components/ui/TimeInput";
import SignaturePad from "./SignaturePad";
import { uploadFileForEntity } from "@/lib/master/uploadFile";
import { ATTACHMENT_KIND_LABELS, VISIT_KIND_LABELS } from "@/lib/service/rounds";
import { closeFormDefaults, missingEvidence } from "@/lib/service/myVisits";
import styles from "./CloseVisitSheet.module.css";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { fmtNumber } from "@/lib/format";

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function CloseVisitSheet({ open, visit, site, onClose, onSubmit }) {
  const [form, setForm] = useState(() => closeFormDefaults(null));
  const [items, setItems] = useState([]);
  const [draftItem, setDraftItem] = useState({ label: "", qty: "", unit: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signing, setSigning] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || !visit) return;
    setError("");
    setDraftItem({ label: "", qty: "", unit: "" });
    setForm(closeFormDefaults(visit, { nowHHMM: nowHHMM() }));
    (async () => {
      try {
        const res = await fetch(`/api/service/visits/${visit.id}/items`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดของที่ใช้ไม่สำเร็จ");
        setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [open, visit]);

  /* ⚠️ ต้องอยู่ **เหนือ** `if (!visit) return null` — hook เรียกใต้ early return
     ไม่ได้ (rules-of-hooks) · `addPhoto` ประกาศทีหลังได้ เพราะ callback ถูกเรียก
     ตอนผู้ใช้วางไฟล์ ไม่ใช่ตอน render */
  const intake = useFileIntake({
    disabled: uploading,
    multiple: false,
    accept: "image/*",
    onFiles: ([file]) => addPhoto(file),
    onOversize: setError,
  });

  if (!visit) return null;

  const addItem = async () => {
    const label = draftItem.label.trim();
    if (!label) { setError("ต้องระบุชื่อของที่ใช้"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/service/visits/${visit.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftItem),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
      setItems((prev) => [...prev, data]);
      setDraftItem({ label: "", qty: "", unit: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (itemId) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/service/visits/${visit.id}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "ลบไม่สำเร็จ");
      }
      setItems((prev) => prev.filter((row) => row.id !== itemId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // อัปไฟล์ขึ้น Drive ผ่านท่อกลาง — โฟลเดอร์ปลายทางคือของลูกค้าเจ้าของไซต์
  // ⚠️ อย่ากลืน error ของชั้นอัปเป็น "อัปโหลดไม่สำเร็จ" ลอย ๆ — ข้อความจริงบอกได้ว่า
  // ไฟล์ใหญ่เกิน/ชนิดไม่รองรับ/ท่อ Drive ตาย ซึ่งแก้คนละทาง
  const uploadBlob = async (blob, name) => {
    const file = new File([blob], name, { type: blob.type || "image/png" });
    const ref = await uploadFileForEntity({
      file, entityType: "service_visit", entityId: visit.id,
    });
    return ref.url || null;
  };

  const addPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadBlob(file, file.name || "photo.jpg");
      if (!url) throw new Error("อัปโหลดสำเร็จแต่ไม่ได้ลิงก์กลับมา");
      // รูปแรก = "ก่อน" · รูปถัดไป = "หลัง" (แก้ชนิดทีหลังได้ที่หน้ารายละเอียด)
      const kind = form.attachments.length === 0 ? "before" : "after";
      setForm((prev) => ({
        ...prev,
        attachments: [...prev.attachments, { url, name: file.name || "รูปหน้างาน", kind }],
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const saveSignature = async (blob) => {
    setSigning(true);
    setError("");
    try {
      const url = await uploadBlob(blob, `signature-${visit.code || visit.id}.png`);
      setForm((prev) => ({ ...prev, customerSignatureUrl: url }));
    } catch (e) {
      setError(e.message);
    } finally {
      setSigning(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await onSubmit({ ...form, status: "done" });
    } catch (e) {
      setError(e.message || "ปิดงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const missing = missingEvidence(form);

  return (
    <Modal open={open} onClose={onClose} title={`ปิดงาน ${visit.code || ""}`.trim()} size="md">
      <p className={styles.site}>
        {site?.name || visit.siteId}
        {site?.zone ? ` · ${site.zone}` : ""} · {VISIT_KIND_LABELS[visit.kind] || visit.kind}
      </p>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>เวลาที่เข้าจริง</h3>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>วันที่</span>
            <DateInput value={form.actualDate} onChange={(iso) => setForm((p) => ({ ...p, actualDate: iso }))} />
          </label>
          <label className={styles.field}>
            <span>เริ่ม</span>
            <TimeInput value={form.actualStartTime} onChange={(v) => setForm((p) => ({ ...p, actualStartTime: v }))} />
          </label>
          <label className={styles.field}>
            <span>เสร็จ</span>
            <TimeInput value={form.actualEndTime} onChange={(v) => setForm((p) => ({ ...p, actualEndTime: v }))} />
          </label>
          {/* ช่างที่ยืนอยู่หน้างานจะไม่พิมพ์เวลาเอง */}
          <Button tone="neutral" variant="quiet" size="sm"
            onClick={() => setForm((p) => ({ ...p, actualEndTime: nowHHMM() }))}>
            ตอนนี้
          </Button>
        </div>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>ของที่ใช้</h3>
        <p className={styles.note}>บันทึกไว้เป็นหลักฐานอย่างเดียว — ระบบไม่ตัดสต็อกและไม่ออกบิลจากรายการนี้</p>
        {items.map((item) => (
          <div key={item.id} className={styles.itemRow}>
            <span className={styles.itemLabel}>{item.label}</span>
            <span className={styles.itemQty}>
              {item.qty == null ? "—" : `${fmtNumber(item.qty)}${item.unit ? ` ${item.unit}` : ""}`}
            </span>
            <Button iconOnly tone="danger" variant="quiet" size="sm" aria-label={`ลบ ${item.label}`}
              onClick={() => removeItem(item.id)} disabled={busy} icon={<Trash2 size={14} aria-hidden="true" />} />
          </div>
        ))}
        <div className={styles.row}>
          <Input value={draftItem.label} onChange={(e) => setDraftItem((p) => ({ ...p, label: e.target.value }))}
            placeholder="เช่น Forest night" aria-label="ชื่อของที่ใช้" className={styles.grow} />
          <Input type="number" min="0" step="any" value={draftItem.qty}
            onChange={(e) => setDraftItem((p) => ({ ...p, qty: e.target.value }))}
            placeholder="จำนวน" aria-label="จำนวน" className={styles.qtyInput} />
          <Input value={draftItem.unit} onChange={(e) => setDraftItem((p) => ({ ...p, unit: e.target.value }))}
            placeholder="หน่วย" aria-label="หน่วย" className={styles.unitInput} />
          <Button tone="neutral" size="sm" onClick={addItem} disabled={busy}>เพิ่ม</Button>
        </div>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>รูปหน้างาน</h3>
        {/* ลากรูปมาวาง หรือ Ctrl+V ได้ด้วย — ช่างที่ปิดงานจากโน้ตบุ๊กมีภาพอยู่ใน
            คลิปบอร์ดอยู่แล้ว ไม่ได้ถ่ายสดจากมือถือทุกครั้ง (IS-26080013) */}
        <div className={styles.photoRow} {...intake.zoneProps}>
          {form.attachments.map((att) => (
            <a key={att.url} href={att.url} target="_blank" rel="noreferrer noopener" className={styles.photo}>
              {ATTACHMENT_KIND_LABELS[att.kind] || "รูป"}
            </a>
          ))}
          {/* capture="environment" = เปิดกล้องหลังตรง ๆ บนมือถือ ไม่ต้องเลือกจากอัลบั้ม */}
          <input ref={fileRef} type="file" accept="image/*" capture="environment"
            onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ""; addPhoto(f); }}
            className={styles.fileInput} aria-label="ถ่ายรูปหน้างาน" />
          <Button tone="neutral" variant="quiet" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
            icon={<Camera size={15} aria-hidden="true" />}>
            {uploading ? "กำลังอัปโหลด…" : "ถ่ายรูป"}
          </Button>
        </div>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>ลายเซ็นผู้รับงาน</h3>
        {form.customerSignatureUrl ? (
          <div className={styles.row}>
            <a href={form.customerSignatureUrl} target="_blank" rel="noreferrer noopener">ดูลายเซ็นที่เซ็นไว้</a>
            <Button tone="neutral" variant="quiet" size="sm"
              onClick={() => setForm((p) => ({ ...p, customerSignatureUrl: null }))}>เซ็นใหม่</Button>
          </div>
        ) : (
          <SignaturePad onSave={saveSignature} onSkip={() => {}} saving={signing} />
        )}
      </section>

      <label className={`${styles.field} ${styles.block}`}>
        <span>สรุปงานที่ทำ</span>
        <Input as="textarea" rows={2} value={form.summary}
          onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} maxLength={2000} />
      </label>

      {/* เตือน ไม่บล็อก — ปุ่มปิดงานยังกดได้ตามปกติ */}
      {missing.length > 0 && (
        <p className={styles.warn}>
          <AlertTriangle size={14} aria-hidden="true" />
          {missing.join(" · ")} — ปิดงานได้ แต่หัวหน้าจะเห็นว่ายังขาด
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={busy}>ยังไม่ปิด</Button>
        <Button tone="primary" onClick={submit} disabled={busy}>
          {busy ? "กำลังบันทึก…" : "บันทึกและปิดงาน"}
        </Button>
      </div>
    </Modal>
  );
}
