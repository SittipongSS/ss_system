"use client";

/* ที่มาของยอด FC บนหน้าดีล (mig 0337 · มติผู้ใช้ 2026-09-02)
 *
 * การ์ดนี้ตอบคำถามเดียว: **ตัวเลข "มูลค่าคาดการณ์" บน KPI ข้างบนมาจากไหน**
 * — ยอดที่ AE กรอกเอง หรือยอดบนใบเสนอราคาที่อนุมัติแล้ว (ก่อน VAT)
 *
 * ⚠️ ขึ้นเฉพาะดีลที่ "มีเรื่องให้เล่า" — ดีลที่ยังไม่มีใบอนุมัติสักใบและไม่ได้ปักอะไรไว้
 *    ไม่ต้องเห็นการ์ดนี้ (มันคือดีลปกติที่ยอดมาจากตารางมูลค่ารายหมวดตามเดิม)
 * ⚠️ ทุกปุ่มบอกตัวเลข **ก่อน → หลัง** ก่อนกด (กฎ approvalPrompt ของระบบ) เพราะบางดีล
 *    ยอดใบต่ำกว่ายอดที่กรอกไว้มาก (ของจริง: ใบตัวอย่าง 500 บาท กับ FC 250,000)
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { Layers, Lock, Unlock } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiFetch } from "@/lib/apiFetch";
import { fmtMoney } from "@/lib/format";
import styles from "./DealForecastSourceCard.module.css";

const REASON_TEXT = {
  lowest: "ดีลนี้มีใบเสนอราคาอนุมัติแล้วหลายเลขที่ — ระบบใช้ยอดของใบที่ต่ำที่สุดไว้ก่อน (ประมาณการแบบระมัดระวัง) · ถ้าใบที่ลูกค้าจะซื้อไม่ใช่ใบนั้น กดเลือกใบที่ถูกไว้เอง แล้วระบบจะไม่เลื่อนทับอีก",
  awaiting_revision: "กำลังรอฉบับแก้อนุมัติ — FC ค้างที่ยอดของฉบับก่อนหน้าไว้ก่อน ไม่ตกกลับ",
  single: "มีใบอนุมัติฉบับเดียว — กดรับเพื่อให้ FC เดินตามยอดบนใบ",
  revision: "มีฉบับแก้ที่อนุมัติแล้ว — กดรับเพื่อให้ FC เดินตามยอดใหม่",
  no_eligible: "ยังไม่มีใบเสนอราคาที่อนุมัติแล้ว",
  pointer_gone: "ใบที่ FC เคยเดินตามไม่มีผลแล้ว — ยอดถอยกลับไปที่ยอดกรอกเอง",
  pinned: "ที่มาถูกปักไว้ ระบบจะไม่เลื่อนให้อัตโนมัติ",
  won_frozen: "ดีลปิดแล้ว ยอดแช่แข็ง",
};

export default function DealForecastSourceCard({ dealId, view, canEdit, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const post = useCallback(async (payload, successNote) => {
    setBusy(true);
    try {
      await apiFetch(`/api/sales-planning/deals/${dealId}/forecast-source`, {
        method: "POST", json: payload, fallbackError: "เปลี่ยนที่มาของ FC ไม่สำเร็จ",
      });
      setError("");
      onChanged?.(successNote);
    } catch (postError) {
      setError(postError.message || "เปลี่ยนที่มาของ FC ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [dealId, onChanged]);

  if (!view) return null;
  const followsQuotation = view.source === "quotation";
  const hasCandidates = Boolean(view.candidates?.length);
  // ดีลธรรมดาที่ยังไม่มีใบอนุมัติและไม่ได้ปักอะไร = ไม่มีเรื่องให้เล่า
  if (!followsQuotation && !hasCandidates && !view.pinned) return null;

  const applyQuotation = async (quotation) => {
    const delta = quotation.value - view.value;
    const okToGo = await confirmAction({
      title: "ให้ FC เดินตามใบนี้",
      description: `FC ${fmtMoney(view.value)} → ${fmtMoney(quotation.value)} บาท (${delta >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${fmtMoney(Math.abs(delta))})\n\nยอดที่กรอกไว้ ${fmtMoney(view.manualValue)} บาท ยังถูกเก็บไว้ กลับมาใช้ได้ตลอด`,
      confirmLabel: `ใช้ยอดใบ ${quotation.quoteNumber}`,
    });
    if (okToGo) await post({ source: "quotation", quotationId: quotation.id }, `FC เดินตามใบ ${quotation.quoteNumber} แล้ว`);
  };

  const backToManual = async () => {
    const okToGo = await confirmAction({
      title: "กลับไปใช้ยอดที่กรอกเอง",
      description: `FC ${fmtMoney(view.value)} → ${fmtMoney(view.manualValue)} บาท\n\nหลังจากนี้ระบบจะไม่ให้ FC เดินตามใบเสนอราคาอัตโนมัติอีก จนกว่าจะเลือกใบใหม่ที่การ์ดนี้`,
      confirmLabel: "ใช้ยอดที่กรอกเอง",
    });
    if (okToGo) await post({ source: "manual" }, "FC กลับไปใช้ยอดที่กรอกเองแล้ว");
  };

  const unpin = async () => {
    if (!followsQuotation) return;
    await post(
      { source: "quotation", quotationId: view.quotation?.id, pin: false },
      "คืนสิทธิ์ให้ระบบเลื่อนที่มาของ FC เองแล้ว",
    );
  };

  return (
    <DetailCard
      icon={Layers}
      eyebrow="Forecast source"
      title="ที่มาของยอดคาดการณ์"
      meta={followsQuotation
        ? `เดินตามใบเสนอราคา · ${fmtMoney(view.value)} บาท (ก่อน VAT)`
        : `ยอดที่กรอกเอง · ${fmtMoney(view.value)} บาท`}
      actions={view.pinned && canEdit && followsQuotation ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={unpin}>
          <Unlock size={13} aria-hidden="true" /> ให้ระบบเลื่อนเอง
        </Button>
      ) : null}
    >
      {error ? <StatusNotice tone="danger" onDismiss={() => setError("")}>{error}</StatusNotice> : null}

      <p className={styles.state}>
        {followsQuotation && view.quotation ? (
          <>
            ตอนนี้เดินตามใบ{" "}
            <Link href={`/sa/quotations/${view.quotation.id}`} className="linklike mono">{view.quotation.quoteNumber}</Link>
            {view.pinned ? <span className={styles.pin}><Lock size={12} aria-hidden="true" /> ปักไว้โดย {view.pinnedBy || "ผู้ใช้"}</span> : null}
          </>
        ) : (
          <>
            ตอนนี้ใช้ยอดที่กรอกในตารางมูลค่ารายหมวด
            {view.pinned ? <span className={styles.pin}><Lock size={12} aria-hidden="true" /> ปักไว้โดย {view.pinnedBy || "ผู้ใช้"}</span> : null}
          </>
        )}
      </p>

      {REASON_TEXT[view.reason] ? (
        <p className={styles.reason} data-tone={view.multiple && !view.pinned ? "warn" : undefined}>{REASON_TEXT[view.reason]}</p>
      ) : null}

      {hasCandidates ? (
        <div className={styles.choices}>
          {view.candidates.map((quotation) => {
            const value = Math.max(0, Number(quotation.totalAmount || 0) - Number(quotation.vatAmount || 0));
            const active = view.quotation?.id === quotation.id;
            const delta = value - view.value;
            return (
              <button
                key={quotation.id}
                type="button"
                className={styles.choice}
                data-active={active ? "true" : undefined}
                disabled={!canEdit || busy || active}
                onClick={() => applyQuotation({ ...quotation, value })}
              >
                <span className="mono">{quotation.quoteNumber}</span>
                <strong>{fmtMoney(value)}</strong>
                {active
                  ? <small data-dir="now">ใช้อยู่</small>
                  : <small data-dir={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(delta))}</small>}
              </button>
            );
          })}
        </div>
      ) : null}

      {canEdit && followsQuotation ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={backToManual}>
          กลับไปใช้ยอดที่กรอกเอง ({fmtMoney(view.manualValue)})
        </Button>
      ) : null}
    </DetailCard>
  );
}
