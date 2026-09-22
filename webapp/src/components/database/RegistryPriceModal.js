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
// ⚠️ F/B/FB ไม่มีชั้นจำนวน (มติ 2026-08-03) — ราคาเดียว ฿/กก. ต่อช่อง · แก้ราคา = ออก
// rev ใหม่ทับไม่ได้ ป้ายปุ่มจึงเป็น "บันทึกราคาใหม่" ไม่ใช่ "บันทึก"
//
// ⭐ **หลายช่อง** (ม-148 · มติผู้ใช้ 2026-09-22: *"ถ้าเป็นสูตร ก็ใส่ได้ทั้ง F และ B และ FB … ยกเว้น
// กลิ่น(หัวน้ำหอม)ที่ใส่ได้แค่ F"*) — ผู้เรียกส่ง `slots` จาก `priceSlotsFor`/`rowPriceSlots` ตัวเดียวกับ API
// · ใส่อย่างน้อยหนึ่งช่อง · วันยืนราคา/หมายเหตุใช้ร่วมทุกช่อง · ขั้นใส่ราคาในคำร้องใช้โมดัลตัวนี้ด้วย
import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import DateInput from "@/components/ui/DateInput";
import StatusNotice from "@/components/ui/StatusNotice";
import { DEFAULT_PRICE_TTL_DAYS } from "@/lib/materialPrices";
import styles from "./registryForm.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function RegistryPriceModal({
  open,
  onClose,
  title,            // เช่น "ใส่ราคา — ARMANI POWER OF YOU"
  unitLabel = "฿/กก.",
  endpoint,         // POST { prices: { F?, B?, FB? } | price, validUntil, note }
  // ช่องราคา `[{ key, text, hint }]` — ไม่ส่ง = ช่องเดียวแบบเดิม (ส่ง `price`)
  slots = null,
  // บรรทัดอธิบายใต้ช่องราคา (เช่น ราคาเฉพาะลูกค้ารายนี้) · null = ใช้ข้อความมาตรฐาน
  hint = null,
  onSaved,          // (msg, data) => void — ผู้เรียกรีโหลด + โชว์ toast · `data` = body ที่ API ตอบ
  onError = null,   // (error) => void — ตีกลับแล้วผู้เรียกอยากโหลดข้อมูลใหม่ (สถานะเปลี่ยนระหว่างเปิดโมดัล)
  // ม-148 — คำเตือนก่อนใส่ราคา (เช่น กลิ่นที่ส่งเป็นสินค้า: ราคาเนื้อต้องไปใส่ที่สูตร) · null = ไม่มี
  notice = null,
}) {
  const [price, setPrice] = useState("");
  const [prices, setPrices] = useState({});
  const multi = Array.isArray(slots) && slots.length > 0;
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setPrice(""); setPrices({}); setValidUntil(""); setNote(""); setError(""); };

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(multi
            // ช่องที่เว้นว่างไม่ส่ง — server ตีกลับช่องที่รายการนี้ไม่มี (ไม่ทิ้งเงียบ)
            ? { prices: Object.fromEntries(slots.map((s) => [s.key, prices[s.key]]).filter(([, v]) => v !== "" && v != null)) }
            : { price }),
          validUntil: validUntil || null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "บันทึกราคาไม่สำเร็จ");
      reset();
      // ทะเบียนตอบเลข rev ต่อช่อง · ขั้นราคาในคำร้องตอบทั้งใบกลับมา (ไม่มีเลข rev) — ข้อความต้องไม่ขึ้น "rev undefined"
      const revs = Array.isArray(data?.revisions) && data.revisions.length > 1
        ? data.revisions.map((r) => `${r.key} rev ${r.revisionNo}`).join(" · ")
        : data?.revisionNo != null ? `rev ${data.revisionNo}` : "";
      onSaved?.(revs ? `บันทึกราคาแล้ว (${revs})` : "บันทึกราคาแล้ว", data);
    } catch (e) {
      setError(e.message);
      onError?.(e);
    }
    setSaving(false);
  };

  const close = () => { if (!saving) { reset(); onClose(); } };
  const priceMissing = multi
    ? !slots.some((s) => prices[s.key] !== "" && prices[s.key] != null)
    : price === "" || price == null;

  return (
    <Modal
      open={open} onClose={close} size="sm" dismissible={!saving} title={title}
      /* ปุ่มอยู่ในโซน .drawer-footer ของโครงโมดัล — ห้ามใช้ div class เอง
         (.modal-actions ที่เคยลอกมาไม่มี CSS อยู่จริง ปุ่มติดกัน 0px) */
      footer={(
        <>
          <Button variant="quiet" onClick={close} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" onClick={submit} disabled={saving || priceMissing}>
            บันทึกราคาใหม่
          </Button>
        </>
      )}
    >
      {/* ⚠️ เตือน ไม่บล็อก — ราคา F ของกลิ่นที่มีสูตรยังมีได้จริง (ลูกค้าซื้อหัวน้ำหอมแยก · SDS) */}
      {notice && <StatusNotice tone="warning" className={styles.priceNotice}>{notice}</StatusNotice>}
      {multi ? slots.map((slot, i) => (
        <div className="form-group" key={slot.key}>
          <label htmlFor={`registry-price-${slot.key}`}>{slot.text} ({unitLabel})</label>
          <MoneyInput
            id={`registry-price-${slot.key}`} name={`registryPrice${slot.key}`} value={prices[slot.key] ?? ""}
            onChange={(v) => setPrices((prev) => ({ ...prev, [slot.key]: v ?? "" }))}
            className="w-full" autoFocus={i === 0}
          />
          {slot.hint && <small className={styles.hint}>{slot.hint}</small>}
        </div>
      )) : (
        <div className="form-group">
          <label htmlFor="registry-price">ราคา ({unitLabel})</label>
          <MoneyInput
            id="registry-price" name="registryPrice" value={price}
            onChange={(v) => setPrice(v ?? "")} className="w-full" autoFocus
          />
        </div>
      )}
      <small className={`${styles.hint} ${styles.priceSlotsHint}`}>
        {hint || (multi
          ? "ใส่อย่างน้อยหนึ่งช่อง · เว้นว่าง = ไม่เปลี่ยนราคาช่องนั้น · ราคาเดียวต่อกิโล ไม่มีชั้นจำนวน — บันทึกเป็นรุ่น (rev) ใหม่ รุ่นเก่าคงอยู่เป็นประวัติ"
          : "ราคาเดียวต่อหน่วย ไม่มีชั้นจำนวน — บันทึกเป็นรุ่น (rev) ใหม่ รุ่นเก่าคงอยู่เป็นประวัติ")}
      </small>
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
