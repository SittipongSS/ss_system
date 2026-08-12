"use client";
// ── โมดัลใส่ราคา F/FB บนหน้ารายละเอียดกลิ่น/สูตร ─────────────────────────
//
// ⭐ ทำไมต้องมี (มติผู้ใช้ 2026-08-10): ทะเบียนวัสดุเหลือ PM อย่างเดียว —
// ทางใส่ราคา RM เดิมมีแค่ขั้นราคาบนคำร้องสายพัฒนา กลิ่น/สูตรที่ "เพิ่มเอง"
// จึงไม่มีทางมีราคาเลย · โมดัลนี้ยิง endpoint ที่ลงเอย `priceRegistryEntry`
// ก้อนเดียวกับสายคำร้อง — ราคาไปอยู่ที่ทะเบียนวัสดุ (rev ใหม่) ไม่เก็บสำเนา
//
// ⚠️ **โมดัลเดียวสองทะเบียน** — กลิ่นกับสูตรต่างกันแค่ endpoint กับป้าย
// (กฎ AGENTS.md: ของที่เหมือนกันต้องเป็น component เดียว)
//
// ⚠️ F/FB ไม่มีชั้นจำนวน (มติ 2026-08-03) — ราคาเดียว ฿/กก. · แก้ราคา = ออก
// rev ใหม่ทับไม่ได้ ป้ายปุ่มจึงเป็น "บันทึกราคาใหม่" ไม่ใช่ "บันทึก"
import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import DateInput from "@/components/ui/DateInput";
import { DEFAULT_PRICE_TTL_DAYS } from "@/lib/materialPrices";
import styles from "./registryForm.module.css";

export default function RegistryPriceModal({
  open,
  onClose,
  title,            // เช่น "ใส่ราคา F — ARMANI POWER OF YOU"
  unitLabel = "฿/กก.",
  endpoint,         // POST { price, validUntil, note }
  onSaved,          // (msg) => void — ผู้เรียกรีโหลด + โชว์ toast
}) {
  const [price, setPrice] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setPrice(""); setValidUntil(""); setNote(""); setError(""); };

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price,
          validUntil: validUntil || null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "บันทึกราคาไม่สำเร็จ");
      reset();
      onSaved?.(`บันทึกราคาแล้ว (rev ${data.revisionNo})`);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const close = () => { if (!saving) { reset(); onClose(); } };
  const priceMissing = price === "" || price == null;

  return (
    <Modal
      open={open} onClose={close} size="sm" dismissible={!saving} title={title}
      /* ปุ่มอยู่ในโซน .drawer-footer ของโครงโมดัล — ห้ามใช้ div class เอง
         (.modal-actions ที่เคยลอกมาไม่มี CSS อยู่จริง ปุ่มติดกัน 0px) */
      footer={(
        <>
          <Button variant="quiet" onClick={close} disabled={saving}>ยกเลิก</Button>
          <Button tone="accent" onClick={submit} disabled={saving || priceMissing}>
            บันทึกราคาใหม่
          </Button>
        </>
      )}
    >
      <div className="form-group">
        <label htmlFor="registry-price">ราคา ({unitLabel})</label>
        <MoneyInput
          id="registry-price" name="registryPrice" value={price}
          onChange={(v) => setPrice(v ?? "")} className="w-full" autoFocus
        />
        <small className={styles.hint}>
          ราคาเดียวต่อหน่วย ไม่มีชั้นจำนวน — บันทึกเป็นรุ่น (rev) ใหม่ รุ่นเก่าคงอยู่เป็นประวัติ
        </small>
      </div>
      <div className="form-group">
        <label htmlFor="registry-price-until">ใช้ได้ถึงวันที่</label>
        <DateInput
          id="registry-price-until" value={validUntil}
          onChange={setValidUntil} disabled={saving}
        />
        <small className={styles.hint}>
          เว้นว่าง = อายุมาตรฐาน {DEFAULT_PRICE_TTL_DAYS} วันนับจากวันนี้ — เกินแล้วใบขอราคาผลิตจะขอให้ยืนยันก่อนใช้
        </small>
      </div>
      <div className="form-group">
        <label htmlFor="registry-price-note">หมายเหตุ</label>
        <Input
          id="registry-price-note" value={note} disabled={saving}
          placeholder="เช่น ราคาจากผู้ขายรายใหม่ · ต่ออายุรอบปี" maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error && <div className={styles.priceModalError}>{error}</div>}
    </Modal>
  );
}
