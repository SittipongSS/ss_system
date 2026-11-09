"use client";
// ── โมดัล "ขอคิวติดตั้ง" (ขั้นเข้าติดตั้ง PR-2b · ม็อก A2 · mig 0425) ────────────────────────────────────────
//
// ⭐ ลำดับคำถามตามที่คนคิด: โซนไหน › วันที่ลูกค้าต้องการ (+ ช่วงเวลา) › ใครคือผู้ติดต่อหน้างาน › ฝากอะไรถึง TS
// ⭐ ไม่มีค่าตั้งต้นของการตัดสินใจ (โซน · วันที่) — ยกเว้นตอนแก้คำขอ ค่าเดิมคือค่าที่ตัดสินไปแล้ว
// ⭐ กล่อง "ก่อนติดตั้ง" บอกผลก่อนกด: ขอคิวได้เลยแม้มัดจำยังไม่ผ่าน · TS ยืนยันวันได้เมื่อบัญชีรับรอง
// ⚠️ ด่านค่าถาม `installRequestInput` ตัวเดียวกับ API — ปุ่มบอกเหตุทุกข้อที่ขาดในข้อความเดียว
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { INSTALL_REQUEST_LIMITS, installRequestInput } from "@/lib/service/installRequest";
import styles from "./InstallRequestModal.module.css";

export default function InstallRequestModal({ orderId, site, deposit, todayIso, onClose, onSaved }) {
  const before = site.request?.requestedAt ? site.request : null;
  const [form, setForm] = useState(() => ({
    zoneIds: before ? site.zones.filter((z) => z.requested).map((z) => z.zoneId) : [],
    requestedDate: before?.requestedDate || "",
    requestedStartTime: before?.requestedStartTime ? String(before.requestedStartTime).slice(0, 5) : "",
    requestedEndTime: before?.requestedEndTime ? String(before.requestedEndTime).slice(0, 5) : "",
    contactName: before?.contactName || "",
    contactPhone: before?.contactPhone || "",
    note: before?.note || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  /* ด่านเดียวกับ API — โชว์เหตุติดปุ่ม (กติกาฟอร์ม: ปุ่มที่กดไม่ได้ต้องบอกเหตุ) */
  const check = useMemo(() => installRequestInput(form, { siteZoneIds: site.zones.map((z) => z.zoneId), todayIso }), [form, site, todayIso]);

  async function submit() {
    if (check.error) { setError(check.error); return; }
    setSaving(true);
    setError("");
    try {
      await apiJson(`/api/sales-planning/sales-orders/${orderId}/install`, {
        method: "POST", json: { siteId: site.siteId, ...form }, fallbackError: "ขอคิวติดตั้งไม่สำเร็จ",
      });
      notifyToast.success(before ? "แก้คำขอคิวติดตั้งแล้ว — แจ้ง TS แล้ว" : "ขอคิวติดตั้งแล้ว — แจ้ง TS แล้ว · TS ยืนยันวันได้เมื่อมัดจำผ่าน");
      await onSaved?.();
    } catch (e) {
      setError(e?.message || "ขอคิวติดตั้งไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const allSelected = form.zoneIds.length === site.zones.length;
  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={before ? "แก้คำขอคิวติดตั้ง" : "ขอคิวติดตั้ง"}
      subtitle={`${site.siteCode || ""} ${site.siteName || ""}`.trim()}
      size="md"
      sheetOnPhone
      footer={(
        <div className={styles.footer}>
          {check.error ? <span className={styles.why} role="status">{check.error}</span> : <span />}
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" onClick={submit} disabled={saving || Boolean(check.error)}>
            {saving ? "กำลังส่ง…" : before ? "บันทึกคำขอ" : "ขอคิวติดตั้ง"}
          </Button>
        </div>
      )}
    >
      {error ? <StatusNotice tone="error" className={styles.notice}>{error}</StatusNotice> : null}

      <fieldset className={styles.block}>
        <legend className="form-field-label">โซนที่ต้องติดตั้ง <span className="req">*</span></legend>
        <div className={styles.zoneHead}>
          <small>เลือกได้หลายโซน · TS แยกเป็นหลายนัดได้</small>
          <button type="button" className="linklike" onClick={() => set("zoneIds")(allSelected ? [] : site.zones.map((z) => z.zoneId))}>
            {allSelected ? "ล้างที่เลือก" : "เลือกทุกโซน"}
          </button>
        </div>
        <ChoiceChips
          multiple
          minSelected={0}
          ariaLabel={`โซนที่ต้องติดตั้ง · ${site.siteCode || ""}`}
          value={form.zoneIds}
          onChange={set("zoneIds")}
          options={site.zones.map((zone) => ({
            value: zone.zoneId,
            label: [zone.name || zone.code, zone.packsPerRound ? `${zone.packsPerRound} แพ็ค/รอบ` : null].filter(Boolean).join(" · "),
          }))}
        />
      </fieldset>

      <div className={`form-grid cols-3 ${styles.block}`}>
        <label className="form-field">
          <span className="form-field-label">วันที่ลูกค้าต้องการ <span className="req">*</span></span>
          <DateInput value={form.requestedDate} onChange={set("requestedDate")} min={todayIso || undefined} weekday ariaLabel="วันที่ลูกค้าต้องการให้เข้าติดตั้ง" />
        </label>
        <label className="form-field">
          <span className="form-field-label">เริ่ม</span>
          <TimeInput value={form.requestedStartTime} onChange={set("requestedStartTime")} ariaLabel="เวลาเริ่ม" />
        </label>
        <label className="form-field">
          <span className="form-field-label">ถึง</span>
          <TimeInput value={form.requestedEndTime} onChange={set("requestedEndTime")} ariaLabel="เวลาจบ" />
        </label>
      </div>
      <p className={styles.hint}>เว้นเวลาว่างทั้งคู่ = ทั้งวัน · แก้วันที่ขอเองได้จนกว่า TS จะยืนยันวัน</p>

      <div className={`form-grid cols-2 ${styles.block}`}>
        <label className="form-field">
          <span className="form-field-label">ผู้ติดต่อหน้างาน</span>
          <Input value={form.contactName} onChange={(e) => set("contactName")(e.target.value)} maxLength={INSTALL_REQUEST_LIMITS.contactName} autoComplete="off" />
        </label>
        <label className="form-field">
          <span className="form-field-label">เบอร์ติดต่อ</span>
          <Input value={form.contactPhone} onChange={(e) => set("contactPhone")(e.target.value)} maxLength={INSTALL_REQUEST_LIMITS.contactPhone} inputMode="tel" autoComplete="off" />
        </label>
      </div>

      <label className={`form-field ${styles.block}`}>
        <span className="form-field-label">หมายเหตุถึง TS</span>
        <Textarea variant="form" value={form.note} onChange={(e) => set("note")(e.target.value)} maxLength={INSTALL_REQUEST_LIMITS.note} placeholder="เช่น ทางเข้า ที่จอดรถ เวลาที่ห้ามเข้า" />
      </label>

      <div className={styles.gate} data-state={deposit?.state}>
        <b>ก่อน TS ยืนยันวัน</b>
        <span>{deposit?.state === "blocked" ? deposit.reason : (deposit?.detail || "มัดจำก่อนติดตั้งบัญชีรับรองครบแล้ว")}</span>
        <small>ขอคิวได้เลยแม้มัดจำยังไม่ผ่าน · สัญญาทำหลังติดตั้ง (ใช้จำนวนเครื่องและจุดที่ติดจริง)</small>
      </div>
    </Modal>
  );
}
