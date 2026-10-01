"use client";
// ── โมดัลเพิ่ม/แก้ขนาดแพ็คเกจ (mig 0398 · มติเจ้าของ 01/10 "เพิ่ม ลบ ได้") ───────────────
//
// ⚠️ **ฟอร์มสร้าง = ฟอร์มแก้** (กฎของ AGENTS.md) — ต่างกันแค่โหมดผ่าน `size`
//   สร้าง: พิมพ์รหัสเอง · แก้: รหัสล็อก (ดูข้อถัดไป) — ที่เหลือช่องเดียวกัน ลำดับเดียวกัน
//
// 🔴 **รหัสแก้ไม่ได้** — พื้นที่ที่เคาะไปแล้วเก็บรหัสเป็นภาพนิ่ง (ไม่มี FK ให้ตามไปแก้) ⇒ เปลี่ยนรหัส =
//   ใบที่ยังไม่ส่งผลทุกใบกลายเป็น "ขนาดถูกลบ" เงียบ ๆ · ล็อกแล้วต้อง **บอกเหตุและทางออก** (เพิ่มขนาดใหม่แล้วลบตัวนี้)
//
// ⭐ ลำดับช่อง (docs/form-design-rules.md): รหัส · ชื่อ → วิธีเลือก (ตัวกำหนดว่าช่องช่วงมีไหม) → ช่วง (อยู่ใต้ตัวที่เปิดมัน)
//   → หมายเหตุ · ช่องช่วง **หายไป** เมื่อเลือก "หัวหน้าเลือกเอง" (ขนาดนั้นไม่มีช่วง — `normalizePackageSizeInput` ทิ้งให้)
// 🔑 ด่านของปุ่มบันทึก = `packageSizeFormError` ซึ่งถาม `packageSizeError` ตัวเดียวกับ route — เหตุผลเป็นตัวหนังสือเหนือปุ่ม
//   ในแถบท้ายที่นิ่ง (ไม่เลื่อนหายไปกับฟอร์ม)
import { useEffect, useMemo, useState } from "react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/Modal";
import OptionTiles from "@/components/ui/OptionTiles";
import Textarea from "@/components/ui/Textarea";
import {
  PACKAGE_SIZE_BAND_OPTIONS, PACKAGE_SIZE_PICK_OPTIONS, emptyPackageSizeForm, packageSizeFormError,
  packageSizeFormOf, packageSizeFormPayload,
} from "@/lib/service/packageSizeForm";
import { PACKAGE_SIZE_NAME_MAX, PACKAGE_SIZE_NOTE_MAX } from "@/lib/service/packageSizes";
import styles from "./PackageSizeModal.module.css";

/**
 * @param size     แถวที่แก้ (`null` = เพิ่มขนาดใหม่)
 * @param sizes    ทะเบียนทั้งชุด — ด่านรหัสซ้ำ/ช่วงชน/ไม่มีเพดานซ้ำ ตรวจบนจอก่อนยิง
 * @param onSubmit `(payload) => Promise` — โยน error เมื่อไม่สำเร็จ (ข้อความขึ้นในโมดัล ฟอร์มไม่หาย)
 */
export default function PackageSizeModal({
  open, size = null, sizes = [], canEdit = false, busy = false, onClose, onSubmit,
}) {
  const [form, setForm] = useState(emptyPackageSizeForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(packageSizeFormOf(size));
    setError("");
  }, [open, size]);

  const patch = (next) => { setError(""); setForm((f) => ({ ...f, ...next })); };
  const editing = !!size;
  const auto = form.pick !== "manual";

  const gate = useMemo(
    () => packageSizeFormError(editing ? "update" : "create", form, { canEdit, before: size, sizes }),
    [form, editing, canEdit, size, sizes],
  );

  const save = async () => {
    setError("");
    try {
      await onSubmit(packageSizeFormPayload(form));
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  /* ⭐ **เหตุที่กดไม่ได้ · error ของรอบที่เพิ่งล้ม · ปุ่ม อยู่ในแถบท้ายที่นิ่ง** (`footer` ของ Modal) ไม่ใช่ท้ายเนื้อที่เลื่อน
     🐞 UAT PR-P 01/10 (จอ 390): ฟอร์มสูงกว่าจอ ⇒ เหตุ "รหัส SM มีอยู่แล้วในทะเบียน" อยู่ท้ายเนื้อใต้แถบปุ่มที่ลอยทับ — คนที่พิมพ์รหัสซ้ำ
        ที่ช่องบนสุดเห็นแค่ปุ่ม "บันทึก" สีเทาโดยไม่มีเหตุ · error ของการบันทึกที่ล้มก็โผล่แค่ขอบเหนือปุ่ม
     ⇒ ข้อความกับปุ่มที่มันอธิบายอยู่ก้อนเดียวกัน เห็นเสมอไม่ว่าเลื่อนฟอร์มอยู่ตรงไหน */
  const footer = (
    <div className={styles.foot}>
      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {!error && gate ? <p className={styles.gate} role="status">{gate}</p> : null}
      <div className={styles.footBtns}>
        <Button onClick={onClose} disabled={busy}>ยกเลิก</Button>
        <Button tone="primary" onClick={save} disabled={busy || !!gate}>
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={editing ? `แก้ขนาด ${size.code}` : "เพิ่มขนาดแพ็คเกจ"} size="md" footer={footer}>
      {/* ⚠️ `.form-grid` คือตัวจัดระยะระหว่างช่องของทั้งระบบ (ท่าเดียวกับ AssetModelModal)
          ⭐ ช่องพิมพ์ทุกช่องเป็น `touch` — ตัวอักษร 16px (ต่ำกว่านี้ iOS ซูมทั้งหน้าตอนแตะช่อง) และสูงเต็มนิ้ว 44px:
             หัวหน้าแก้ทะเบียนจากมือถือ/แท็บเล็ตได้ (UAT 01/10) */}
      <div className="form-grid">
        <div className="form-grid cols-2">
          <label className="form-field">
            <span>รหัส <em className={styles.req}>ต้องระบุ</em></span>
            <Input
              value={form.code}
              onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              placeholder="เช่น MD"
              maxLength={4}
              mono
              touch
              disabled={editing}
              autoComplete="off"
            />
            <small className={styles.hintSm}>
              {editing
                ? "รหัสแก้ไม่ได้ — พื้นที่ที่เคาะไปแล้วเก็บรหัสนี้ไว้ · ต้องการรหัสใหม่ให้เพิ่มขนาดใหม่แล้วลบขนาดนี้"
                : "ตัวอักษรอังกฤษตัวใหญ่หรือตัวเลข 2–4 ตัว · ขึ้นบนแถบเลือกของหัวหน้าและบนเอกสาร · ตั้งแล้วแก้ไม่ได้"}
            </small>
          </label>

          <label className="form-field">
            <span>ชื่อเต็ม <em className={styles.req}>ต้องระบุ</em></span>
            <Input
              value={form.nameEn}
              onChange={(e) => patch({ nameEn: e.target.value })}
              placeholder="เช่น Medium"
              touch
              maxLength={PACKAGE_SIZE_NAME_MAX}
              autoComplete="off"
            />
            <small className={styles.hintSm}>ชื่อที่คนอ่าน — แก้ได้เสมอ</small>
          </label>
        </div>

        {/* กลุ่มตัวเลือกไม่ห่อด้วย <label> — คลิกป้ายแล้วไปกดแผ่นแรกแทนคน (ชื่อกลุ่มอยู่ที่ ariaLabel ของแผ่นเลือก) */}
        <div className="form-field">
          <span>วิธีเลือก <em className={styles.req}>ต้องระบุ</em></span>
          <OptionTiles
            value={form.pick}
            onChange={(pick) => patch({ pick })}
            options={PACKAGE_SIZE_PICK_OPTIONS}
            ariaLabel="วิธีเลือกขนาดนี้"
          />
        </div>

        {/* ช่องที่ขึ้นตามเงื่อนไขอยู่ใต้ตัวที่เปิดมัน — "หัวหน้าเลือกเอง" ไม่มีช่วง จึงไม่มีช่องนี้ */}
        {auto ? (
          <div className="form-field">
            <span>ขนาดพื้นที่ที่ระบบเสนอ <em className={styles.req}>ต้องระบุ</em></span>
            <OptionTiles
              value={form.band}
              onChange={(band) => patch({ band })}
              options={PACKAGE_SIZE_BAND_OPTIONS}
              ariaLabel="ช่วงขนาดพื้นที่"
            />
            {form.band !== "open" ? (
              <div className={styles.bandRow}>
                <span aria-hidden="true">ไม่เกิน</span>
                <Input
                  value={form.maxCbm}
                  onChange={(e) => patch({ maxCbm: e.target.value })}
                  placeholder="เช่น 1,000"
                  inputMode="decimal"
                  mono
                  touch
                  maxLength={12}
                  autoComplete="off"
                  aria-label="ขนาดพื้นที่สูงสุด หน่วยลูกบาศก์เมตร"
                />
                <span aria-hidden="true">ลบ.ม.</span>
              </div>
            ) : null}
            <small className={styles.hintSm}>
              {form.band === "open"
                ? "ระบบเสนอขนาดนี้ให้ทุกพื้นที่ที่ใหญ่กว่าช่วงของขนาดอื่น"
                : "ระบบเสนอขนาดที่มีเพดานเล็กที่สุดซึ่งยังครอบปริมาตรของพื้นที่ — ขนาดอื่นเริ่มต่อจากค่านี้เอง"}
            </small>
          </div>
        ) : null}

        <label className="form-field">
          <span>หมายเหตุ</span>
          <Textarea
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            maxLength={PACKAGE_SIZE_NOTE_MAX}
            touch
            placeholder={auto ? "ถ้ามี" : "เช่น ใช้กับห้องน้ำ"}
          />
        </label>
      </div>

      {/* แก้ช่วง/วิธีเลือก มีผลกับการเคาะครั้งถัดไปเท่านั้น — คนแก้ต้องรู้ก่อนกด ว่าใบที่เคาะไปแล้วไม่ขยับตาม */}
      {editing ? (
        <p className={styles.effect}>
          แก้แล้วมีผลกับการเคาะครั้งถัดไป — พื้นที่ที่เคาะไปแล้วและใบที่ส่งผลแล้วไม่เปลี่ยน
        </p>
      ) : null}

    </Modal>
  );
}
