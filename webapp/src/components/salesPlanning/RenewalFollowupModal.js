"use client";
// ── โมดัลบันทึกผลการติดตามต่อสัญญา (mig 0327 · แผน §PR-E) ───────────────────
//
// ⚠️ ด่านมาจาก `followupSaveError` ตัวเดียวกับที่ API ใช้ปฏิเสธ — ห้ามคิดเงื่อนไข
//   เองที่นี่ (กติกาเดียวกับทุกปุ่มในโมดูลนี้)
//
// ⚠️ ช่องที่โผล่ตามผลที่เลือก **อยู่ใต้แผ่นเลือกเสมอ** (กฎฟอร์มข้อ 3) — วางไว้เหนือ
//   เมื่อไร ผู้ใช้จะเจอช่องงอกขึ้นมาเหนือจุดที่ตัวเองกำลังมองอยู่
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import OptionTiles from "@/components/ui/OptionTiles";
import AlertBanner from "@/components/ui/AlertBanner";
import { fmtDate, naText } from "@/lib/format";
import {
  DECLINE_REASON_MIN, FOLLOWUP_RESULTS, FOLLOWUP_RESULT_HINTS, FOLLOWUP_RESULT_LABELS,
  followupSaveError,
} from "@/lib/service/renewals";

const EMPTY = { status: "", nextContactOn: "", resultNote: "", declineReason: "" };

export default function RenewalFollowupModal({ open, row, canEdit = false, busy = false, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  /* ค่าตั้งต้นมาจากเรื่องที่เปิดอยู่ (ถ้ามี) — แต่ **ผลการติดตามไม่มีค่าตั้งต้น**
     เพราะมันคือการตัดสินใจ (กฎฟอร์ม §2: ห้าม default ให้สิ่งที่เป็นการตัดสินใจ) */
  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      ...EMPTY,
      nextContactOn: row?.followup?.nextContactOn || "",
      resultNote: row?.followup?.resultNote || "",
    });
  }, [open, row]);

  const gate = followupSaveError(row?.followup || null, form, { canEdit });

  const submit = async () => {
    if (gate) { setError(gate); return; }
    try {
      await onSave?.({ siteId: row.siteId, ...form });
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="บันทึกผลการติดตาม" size="md">
      <div className="form-grid cols-2">
        <div className="form-field span-2">
          <span className="form-field-label">ไซต์</span>
          <span>
            {naText(row?.site?.name)}
            {row?.site?.customerName ? ` · ${row.site.customerName}` : ""}
          </span>
        </div>
        <div className="form-field span-2">
          <span className="form-field-label">รอบบริการหมด</span>
          <span>
            {fmtDate(row?.endDate)}
            {row?.state === "expired"
              ? " — หมดแล้ว"
              : (row?.daysLeft != null ? ` — อีก ${row.daysLeft} วัน` : "")}
          </span>
        </div>

        <div className="form-field span-2">
          <span className="form-field-label">ผลการติดตาม *</span>
          <OptionTiles
            ariaLabel="ผลการติดตาม"
            value={form.status}
            disabled={busy || !canEdit}
            onChange={(status) => setForm((prev) => ({ ...prev, status }))}
            options={FOLLOWUP_RESULTS.map((value) => ({
              value,
              label: FOLLOWUP_RESULT_LABELS[value],
              description: FOLLOWUP_RESULT_HINTS[value],
            }))}
          />
        </div>

        {/* ตามต่อ = ต้องมีวันนัดครั้งหน้า ไม่งั้นเรื่องค้างในทะเบียนโดยไม่มีใครรู้ว่ากลับมาดูวันไหน */}
        {form.status === "following" && (
          <label className="form-field span-2">
            <span className="form-field-label">วันติดต่อครั้งหน้า *</span>
            <DateInput
              value={form.nextContactOn}
              onChange={(iso) => setForm((prev) => ({ ...prev, nextContactOn: iso }))}
            />
          </label>
        )}

        {form.status === "declined" && (
          <label className="form-field span-2">
            <span className="form-field-label">เหตุผลที่ลูกค้าไม่ต่อ *</span>
            <Textarea
              rows={3}
              value={form.declineReason}
              placeholder={`อย่างน้อย ${DECLINE_REASON_MIN} ตัวอักษร — ทีมขายต้องอ่านย้อนได้ว่าเพราะอะไร`}
              onChange={(e) => setForm((prev) => ({ ...prev, declineReason: e.target.value }))}
            />
          </label>
        )}

        <label className="form-field span-2">
          <span className="form-field-label">บันทึกการคุย</span>
          <Textarea
            rows={3}
            value={form.resultNote}
            placeholder="สรุปสิ่งที่คุยกับลูกค้าครั้งนี้"
            onChange={(e) => setForm((prev) => ({ ...prev, resultNote: e.target.value }))}
          />
        </label>
      </div>

      {/* 🪤 ห้ามใช้ `.form-hint`/`.form-error` — สองคลาสนั้นถูกเขียนไว้หลายจอแต่
          **ไม่มี selector จริงใน globals.css** (โรคเดียวกับ `.hint`) ⇒ ข้อความจะ
          ออกมาเป็นตัวธรรมดาขนาดเท่าเนื้อความ · ใช้คอมโพเนนต์กลางที่มีสไตล์จริงแทน */}
      {form.status === "renewed" && (
        <AlertBanner tone="warning">
          บันทึกแล้วระบบจะเปิดฟอร์มสร้างดีล RE-ORDER สายบริการให้ต่อทันที
          พร้อมลูกค้าเดิม — ยอด/ผู้รับผิดชอบกรอกในฟอร์มนั้น
        </AlertBanner>
      )}

      {error && <AlertBanner tone="danger">{error}</AlertBanner>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={busy}>ยกเลิก</Button>
        {/* ปุ่มที่กดไม่ได้ต้องบอกเหตุผลติดปุ่ม (กฎฟอร์ม §2) — จางเฉย ๆ = คนคิดว่าระบบพัง */}
        <Button tone="primary" onClick={submit} disabled={busy || !!gate} title={gate || undefined}>
          {busy ? "กำลังบันทึก…" : "บันทึกผล"}
        </Button>
      </div>
    </Modal>
  );
}
