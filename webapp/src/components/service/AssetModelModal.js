"use client";
// ── โมดัลเพิ่ม/แก้รุ่นเครื่อง (mig 0344) ─────────────────────────────────
//
// ⚠️ **ฟอร์มสร้าง = ฟอร์มแก้** (กฎของ AGENTS.md) — ต่างกันแค่โหมดผ่าน props
//   สร้าง: ไม่มีสวิตช์ "ใช้งาน" (ของใหม่เริ่มที่เปิดเสมอ) · แก้: มี
//
// 🔴 **รหัส 4 ตัวล็อกเมื่อมีเครื่องแล้ว** — มันอยู่ในรหัสเครื่องที่ออกไปแล้ว
//   (`MC-OV08-260900013`) ⇒ แก้ทะเบียนอย่างเดียวจะได้ทะเบียนที่ไม่ตรงกับของจริง
//   ⚠️ ล็อกแล้วต้อง **บอกเหตุ** ไม่ใช่ช่องที่พิมพ์ไม่ได้เฉย ๆ
import { useEffect, useMemo, useState } from "react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import Textarea from "@/components/ui/Textarea";
import { COMMON_COLOURS, assetKindOptions, assetModelError, normalizeColours } from "@/lib/service/assetModels";
import styles from "./AssetModelModal.module.css";

const emptyForm = { kind: "diffuser", name: "", modelCode: "", colours: [], isActive: true, note: "" };

export default function AssetModelModal({
  open, model = null, usedBy = 0, canEdit = false, busy, onClose, onSubmit,
}) {
  const [form, setForm] = useState(emptyForm);
  const [colourDraft, setColourDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(model ? {
      kind: model.kind, name: model.name, modelCode: model.modelCode,
      colours: Array.isArray(model.colours) ? model.colours : [],
      isActive: model.isActive !== false, note: model.note || "",
    } : emptyForm);
    setColourDraft("");
    setError("");
  }, [open, model]);

  const patch = (next) => setForm((f) => ({ ...f, ...next }));
  const locked = !!model && usedBy > 0;

  const addColour = (raw) => {
    const { value, error: colourError } = normalizeColours([...form.colours, raw]);
    if (colourError) return setError(colourError);
    setError("");
    patch({ colours: value });
    setColourDraft("");
  };
  const dropColour = (colour) => patch({ colours: form.colours.filter((c) => c !== colour) });

  const gate = useMemo(
    () => assetModelError(model ? "update" : "create", form, { canEdit, before: model, usedBy }),
    [form, canEdit, model, usedBy],
  );

  const save = async () => {
    setError("");
    try {
      await onSubmit(form);
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={model ? `แก้รุ่น ${model.name}` : "เพิ่มรุ่นเครื่อง"} size="md">
      <label className="form-field">
        <span>ชนิด <em className={styles.req}>ต้องระบุ</em></span>
        <div className={styles.picks}>
          {assetKindOptions().map((k) => (
            <Button
              key={k.value} size="sm"
              tone={form.kind === k.value ? "accent" : "neutral"}
              variant={form.kind === k.value ? "filled" : "outline"}
              disabled={locked}
              onClick={() => patch({ kind: k.value })}
            >
              {k.label}
            </Button>
          ))}
        </div>
        {locked && <small className={styles.hintSm}>มีเครื่องใช้รุ่นนี้ {usedBy} ตัว — ย้ายชนิดไม่ได้</small>}
      </label>

      <div className="two">
        <label className="form-field">
          <span>ชื่อรุ่น <em className={styles.req}>ต้องระบุ</em></span>
          <Input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="เช่น OV-08"
            maxLength={100}
            autoComplete="off"
          />
          <small className={styles.hintSm}>ชื่อที่คนอ่าน — แก้ได้เสมอ</small>
        </label>

        <label className="form-field">
          <span>รหัส 4 ตัว <em className={styles.req}>ต้องระบุ</em></span>
          <Input
            value={form.modelCode}
            onChange={(e) => patch({ modelCode: e.target.value.toUpperCase() })}
            placeholder="OV08"
            maxLength={4}
            mono
            disabled={locked}
            autoComplete="off"
          />
          <small className={styles.hintSm}>
            {locked
              ? `มีเครื่องใช้รุ่นนี้ ${usedBy} ตัว — แก้ไม่ได้ เพราะรหัสเครื่องที่ออกไปแล้วถือค่านี้อยู่`
              : `ท่อนกลางของรหัสเครื่อง — MC-${form.modelCode || "AAAA"}-YYMMBBBBB`}
          </small>
        </label>
      </div>

      {/* ⭐ สีผูกกับรุ่น (มติผู้ใช้) — เว้นว่างได้ถ้ารุ่นนี้ไม่แยกสี */}
      <label className="form-field">
        <span>สีที่รุ่นนี้มี</span>
        {form.colours.length > 0 && (
          <div className={styles.chips}>
            {form.colours.map((c) => (
              <button key={c} type="button" className={styles.chip} onClick={() => dropColour(c)}
                aria-label={`เอาสี ${c} ออก`}>
                {c} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        <div className={styles.colourAdd}>
          <Input
            value={colourDraft}
            onChange={(e) => setColourDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (colourDraft.trim()) addColour(colourDraft);
            }}
            placeholder="พิมพ์สีแล้วกด Enter"
            maxLength={50}
            autoComplete="off"
          />
          <Button size="sm" disabled={!colourDraft.trim()} onClick={() => addColour(colourDraft)}>เพิ่มสี</Button>
        </div>
        <div className={styles.picks}>
          {COMMON_COLOURS.filter((c) => !form.colours.includes(c)).map((c) => (
            <Button key={c} size="sm" variant="outline" onClick={() => addColour(c)}>+ {c}</Button>
          ))}
        </div>
        <small className={styles.hintSm}>
          เว้นว่างได้ถ้ารุ่นนี้ไม่แยกสี — ตอนเพิ่มเครื่องจะไม่มีช่องสีให้กรอกเลย
        </small>
      </label>

      {/* สร้าง = ไม่มีช่องสถานะ (ของใหม่เริ่มที่ค่าตั้งต้นเสมอ) · แก้ = มี */}
      {model && (
        <div className={styles.switchRow}>
          <button
            type="button" className="ui-switch"
            data-on={form.isActive ? "1" : undefined}
            aria-pressed={form.isActive ? "true" : "false"}
            onClick={() => patch({ isActive: !form.isActive })}
          >
            <i aria-hidden="true" />เปิดใช้งาน
          </button>
          <small className={styles.hintSm}>
            ปิดใช้งาน = ไม่ให้เลือกเพิ่ม · เครื่องเก่าที่ใช้รุ่นนี้ยังอ่านชื่อรุ่นได้ปกติ
          </small>
        </div>
      )}

      <label className="form-field">
        <span>หมายเหตุ</span>
        <Textarea value={form.note} onChange={(e) => patch({ note: e.target.value })} rows={2} />
      </label>

      {error && <AlertBanner tone="danger">{error}</AlertBanner>}
      {!error && gate && <p className={styles.gate} role="status">{gate}</p>}

      <div className="form-action-bar">
        <Button onClick={onClose} disabled={busy}>ยกเลิก</Button>
        <Button tone="primary" onClick={save} disabled={busy || !!gate}>
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </Modal>
  );
}
