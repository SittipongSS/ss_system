"use client";
// ── การตัดสินอนุมัติ master data (ลูกค้า/สินค้า) — ตรรกะชุดเดียวสองหน้าใช้ ──────
// หน้าลูกค้ากับหน้าสินค้าเคยเขียน decide() ของตัวเองคนละชุด พอเพิ่มด่านเอกสารบังคับ
// (มติ 2026-07-31) จะกลายเป็นสองชุดที่เพี้ยนกันทันที — ยกมารวมที่นี่ตามกฎของโปรเจกต์
//
// ด่านเอกสาร: server ตอบ 409 พร้อม code 'missing-documents' เมื่อเอกสารบังคับไม่ครบ
// → เปิดกล่องให้ผู้อนุมัติเขียนเหตุผลถ้าจะยกเว้น แล้วยิงซ้ำพร้อม overrideDocuments
// (ถ้าไม่มีทางยกเว้น ระเบียนที่ยังไม่มีเอกสารจะแก้แล้วอนุมัติกลับไม่ได้เลย เพราะการแก้
//  ทำให้ตกเป็น "รออนุมัติ" อัตโนมัติ — ดู lib/master/attachmentTypes)
import { useState } from "react";
import ReasonDialog from "@/components/ui/ReasonDialog";
import { notifyToast } from "@/components/ui/Toast";
import { MIN_OVERRIDE_REASON } from "@/lib/master/attachmentTypes";

export default function useApprovalDecision({ endpoint, onDone }) {
  const [blocked, setBlocked] = useState(null); // { id, message }
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = async (id, payload) => {
    const res = await fetch(`${endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  const decide = async (id, status, { rejectionReason = null } = {}) => {
    try {
      const { ok, data } = await patch(id, { approvalStatus: status, rejectionReason });
      if (ok) { onDone?.(); return; }
      // เอกสารไม่ครบ = ไม่ใช่ error ที่จบแค่ toast — ต้องให้ทางไปต่อ
      if (data.code === "missing-documents") {
        setReason("");
        setError("");
        setBlocked({ id, message: data.error });
        return;
      }
      notifyToast.error(data.error || "ดำเนินการไม่สำเร็จ");
    } catch {
      notifyToast.error("เกิดข้อผิดพลาดในการอนุมัติ");
    }
  };

  const confirmOverride = async () => {
    if (!blocked) return;
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await patch(blocked.id, {
        approvalStatus: "approved",
        overrideDocuments: true,
        overrideReason: reason,
      });
      if (!ok) { setError(data.error || "ดำเนินการไม่สำเร็จ"); return; }
      setBlocked(null);
      notifyToast.success("อนุมัติแล้ว — บันทึกเหตุผลที่ยกเว้นเอกสารไว้ในประวัติของระเบียนนี้");
      onDone?.();
    } catch {
      setError("เกิดข้อผิดพลาดในการอนุมัติ");
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <ReasonDialog
      open={!!blocked}
      title="เอกสารบังคับยังไม่ครบ"
      description={blocked?.message}
      detail="อนุมัติต่อได้ถ้าจำเป็น แต่ต้องบอกเหตุผล — ระบบจะบันทึกไว้ในประวัติและความเคลื่อนไหวของระเบียนนี้ เพื่อให้ตามเก็บเอกสารทีหลังได้"
      label="เหตุผลที่อนุมัติโดยยังไม่มีเอกสารครบ"
      placeholder="เช่น ลูกค้าเก่า ส่งเอกสารตามภายในสัปดาห์นี้"
      value={reason}
      onChange={setReason}
      minLength={MIN_OVERRIDE_REASON}
      confirmLabel="อนุมัติโดยยกเว้นเอกสาร"
      error={error}
      busy={busy}
      onConfirm={confirmOverride}
      onClose={() => setBlocked(null)}
    />
  );

  return { decide, overrideDialog: dialog };
}
