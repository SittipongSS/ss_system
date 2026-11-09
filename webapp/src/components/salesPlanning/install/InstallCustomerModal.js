"use client";
// ── โมดัล "คอนเฟิร์มนัดติดตั้งกับลูกค้า" (ขั้นเข้าติดตั้ง PR-4 · ม็อก A5 · mig 0425) ─────────────────────────────
//
// ⭐ ลำดับตามที่คนคิด: นัดที่ TS ยืนยัน (วัน · ช่าง · โซน · เหตุที่ปรับ) › ลูกค้าตอบว่าอะไร › คุยกับใคร › หมายเหตุ
//    · "ลูกค้ายืนยันวันนี้" → นัดขึ้นงานช่างทันทีถ้าด่านครบ (ด่านติด = คงร่าง + เหตุ บอกในผลลัพธ์)
//    · "ลูกค้าขอเปลี่ยนวัน" → วันใหม่ + ช่วงเวลา + เหตุ กลับไปให้ TS ยืนยันอีกครั้ง
// ⭐ คำตอบของลูกค้าไม่มีค่าตั้งต้น (กติกาฟอร์ม: การตัดสินใจไม่มีค่าตั้งต้น) · "คุยกับ" ดึงจากผู้ติดต่อหน้างาน (แก้ได้)
// ⚠️ ด่านค่าถาม `installCustomerInput` ตัวเดียวกับ API — ปุ่มบอกเหตุในข้อความเดียว
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import TimeInput from "@/components/ui/TimeInput";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { INSTALL_CUSTOMER_LIMITS, installCustomerInput } from "@/lib/service/installCustomer";
import styles from "./InstallCustomerModal.module.css";

const slot = (start, end) => (start && end ? `${String(start).slice(0, 5)}–${String(end).slice(0, 5)}` : "ทั้งวัน");

export default function InstallCustomerModal({ orderId, site, visit, todayIso, onClose, onSaved }) {
  const request = site.request || {};
  const [form, setForm] = useState(() => ({
    action: "",
    contactName: request.contactName || "",
    contactPhone: request.contactPhone || "",
    note: "",
    requestedDate: "",
    requestedStartTime: "",
    requestedEndTime: "",
    changeReason: "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const check = useMemo(() => installCustomerInput(form, { visit, todayIso }), [form, visit, todayIso]);
  const moved = Boolean(visit.dateChangeReason) && request.requestedDate && request.requestedDate !== visit.scheduledDate;

  async function submit() {
    if (check.error) { setError(check.error); return; }
    setSaving(true);
    setError("");
    try {
      const result = await apiJson(`/api/sales-planning/sales-orders/${orderId}/install/customer`, {
        method: "POST",
        json: { siteId: site.siteId, visitId: visit.id, ...form },
        fallbackError: "บันทึกคำตอบของลูกค้าไม่สำเร็จ",
      });
      if (form.action === "reschedule") {
        notifyToast.success("บันทึกวันใหม่แล้ว — แจ้ง TS ให้ยืนยันวันใหม่ · คุณจะได้กระดิ่งเมื่อ TS ยืนยัน");
      } else if (result?.scheduled) {
        notifyToast.success("ลูกค้ายืนยันแล้ว — นัดขึ้นงานช่าง");
      } else {
        notifyToast.warning(`บันทึกว่าลูกค้ายืนยันแล้ว แต่นัดยังเป็นร่าง${result?.blocker ? ` — ${result.blocker}` : ""}`);
      }
      await onSaved?.();
    } catch (e) {
      setError(e?.message || "บันทึกคำตอบของลูกค้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      size="md"
      sheetOnPhone
      onClose={saving ? undefined : onClose}
      title={`คอนเฟิร์มนัดติดตั้งกับลูกค้า · ${site.siteName || site.siteCode || "ไซต์"}`}
      subtitle={`${[visit.code, site.siteCode].filter(Boolean).join(" · ")} — โทรถามลูกค้าแล้วบันทึกคำตอบ`}
      footer={(
        <div className={styles.footer}>
          {check.error ? <span className={styles.why} role="status">{check.error}</span> : <span />}
          <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={saving || Boolean(check.error)}>
            {saving ? "กำลังบันทึก…" : form.action === "reschedule" ? "ส่งวันใหม่ให้ TS" : "ลูกค้ายืนยันแล้ว"}
          </Button>
        </div>
      )}
    >
      {error ? <StatusNotice tone="error" className={styles.block}>{error}</StatusNotice> : null}

      <dl className={styles.facts}>
        <div><dt>TS ยืนยันวัน</dt><dd><b>{fmtDate(visit.scheduledDate)}</b> {slot(visit.startTime, visit.endTime)}</dd></div>
        <div><dt>ช่าง</dt><dd>{visit.assigneeName ? `${visit.assigneeName} · หัวหน้างาน` : "ยังไม่ระบุ"}</dd></div>
        <div><dt>โซน</dt><dd>{visit.zoneNames.join(" + ") || "ไม่มีโซน"}</dd></div>
        {moved ? (
          <div className={styles.moved}>
            <dt>TS ปรับวัน</dt>
            <dd>จากที่ขอ {fmtDate(request.requestedDate)} {slot(request.requestedStartTime, request.requestedEndTime)} — {visit.dateChangeReason}</dd>
          </div>
        ) : null}
        {visit.tsConfirmedByName ? <div><dt>ยืนยันโดย</dt><dd>{visit.tsConfirmedByName} · {fmtDateTime(visit.tsConfirmedAt)}</dd></div> : null}
      </dl>

      <fieldset className={styles.block}>
        <legend className="form-field-label">คำตอบของลูกค้า <span className="req">*</span></legend>
        <OptionTiles
          ariaLabel="คำตอบของลูกค้า"
          value={form.action}
          onChange={set("action")}
          options={[
            { value: "confirm", label: "ลูกค้ายืนยันวันนี้", description: `${fmtDate(visit.scheduledDate)} ${slot(visit.startTime, visit.endTime)} · นัดขึ้นงานช่าง`, tone: "teal" },
            { value: "reschedule", label: "ลูกค้าขอเปลี่ยนวัน", description: "ใส่วันใหม่ ช่วงเวลา และเหตุ · กลับไปให้ TS ยืนยันอีกครั้ง", tone: "amber" },
          ]}
        />
      </fieldset>

      {form.action === "reschedule" ? (
        <>
          <div className={`form-grid cols-3 ${styles.block}`}>
            <label className="form-field">
              <span className="form-field-label">วันใหม่ที่ลูกค้าต้องการ <span className="req">*</span></span>
              <DateInput value={form.requestedDate} onChange={set("requestedDate")} min={todayIso || undefined} weekday ariaLabel="วันใหม่ที่ลูกค้าต้องการ" />
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
          <label className={`form-field ${styles.block}`}>
            <span className="form-field-label">เหตุที่ลูกค้าขอเปลี่ยนวัน (TS เห็น) <span className="req">*</span></span>
            <Textarea variant="form" value={form.changeReason} onChange={(e) => set("changeReason")(e.target.value)} maxLength={INSTALL_CUSTOMER_LIMITS.reason} placeholder="เช่น ห้างปิดปรับปรุงวันนั้น" />
          </label>
        </>
      ) : null}

      <div className={`form-grid cols-2 ${styles.block}`}>
        <label className="form-field">
          <span className="form-field-label">คุยกับ <span className="req">*</span></span>
          <Input value={form.contactName} onChange={(e) => set("contactName")(e.target.value)} maxLength={INSTALL_CUSTOMER_LIMITS.contactName} autoComplete="off" />
        </label>
        <label className="form-field">
          <span className="form-field-label">เบอร์</span>
          <Input value={form.contactPhone} onChange={(e) => set("contactPhone")(e.target.value)} maxLength={INSTALL_CUSTOMER_LIMITS.contactPhone} inputMode="tel" autoComplete="off" />
        </label>
      </div>
      <p className={styles.hint}>ดึงจากผู้ติดต่อหน้างาน · แก้ได้ถ้าคุยกับคนอื่น</p>

      <label className={`form-field ${styles.block}`}>
        <span className="form-field-label">หมายเหตุ</span>
        <Textarea variant="form" value={form.note} onChange={(e) => set("note")(e.target.value)} maxLength={INSTALL_CUSTOMER_LIMITS.note} placeholder="เช่น ลูกค้าขอให้โทรแจ้งก่อนเข้า 30 นาที" />
      </label>

      <p className={styles.result}>
        {form.action === "reschedule"
          ? "ส่งแล้ว TS ได้กระดิ่ง · นัดเดิมยังเป็นร่างจนกว่า TS ยืนยันวันใหม่ แล้วคุณคอนเฟิร์มลูกค้าอีกครั้ง"
          : form.action === "confirm"
            ? "ยืนยันแล้วนัดขึ้นงานช่าง · ช่างเห็นงานตั้งแต่ตอนนี้ (ถ้าด่านข้ออื่นติด นัดคงเป็นร่างและบอกเหตุ)"
            : "เลือกคำตอบของลูกค้าก่อน"}
      </p>
    </Modal>
  );
}
