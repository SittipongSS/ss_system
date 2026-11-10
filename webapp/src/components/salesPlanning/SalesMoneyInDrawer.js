"use client";
/* ── ลิ้นชักรายงวดของฝ่ายขาย + "ชุดเงินเข้า" (รื้อ SO + บัญชี PR-5 · มติเจ้าของ 09/11 ข้อ 3 "ดูก่อน เพิ่มทีหลัง") ─────────────────────
   ⭐ สามปุ่มพร้อมกัน: แจ้งชำระ + สลิป · แนบสลิปเพิ่ม · ดึงการแจ้งกลับ — ที่ใช้จริงของฝ่ายขาย (audit 12/08–09/11: แจ้งชำระ 41 · ดึงกลับ 1 ·
     แนบเพิ่ม 1) · งานวางแผนงวด (ช่วงบริการ · วันกำหนด · ผูกคำร้อง · ธงก่อนติดตั้ง · ยื่นนับ Actual) อยู่หน้าใบถาวร
   ⭐ ด่านมาจาก server (`GET …/installments` → `moneyIn` = installmentActionError ตัวเดียวกับ PATCH) · ปุ่มจาก `moneyInButtons` ·
     โมดัลชุดเดียวกับแผงงวดบนหน้าใบ (`InstallmentMoneyInDialogs`) · อัปสลิปครั้งเดียวต่อไฟล์ (`uploadPaymentEvidenceOnce`)
   ⚠️ เปลือกบัญชี (`moneyIn={false}`) = ลิ้นชักดูอย่างเดียวแบบเดิม — งานของบัญชีอยู่หน้างานบัญชี
   ⚠️ optimistic lock — ส่ง `updatedAt` ของแถวที่ตาเห็น · 409 = อ่านงวดสดแล้วโมดัลวาดแถวใหม่ (กดใหม่ได้ ไม่วน 409) */
import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import InstallmentDrawer from "@/components/salesPlanning/InstallmentDrawer";
import { InstallmentEvidenceAddDialog, InstallmentReportDialog } from "@/components/salesPlanning/InstallmentMoneyInDialogs";
import { notifyToast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { moneyInButtons } from "@/lib/sales/installmentMoneyIn";
import { uploadPaymentEvidenceList } from "@/lib/sales/paymentEvidenceUpload";
import { installmentReportDoneMessage } from "@/lib/sales/salesOrderPayments";
import styles from "./SalesMoneyInDrawer.module.css";

const DONE = {
  "evidence-add": "แนบหลักฐานเพิ่มแล้ว",
  withdraw: "ดึงกลับแล้ว",
};

export default function SalesMoneyInDrawer({ row, focusSeq = null, showActual = true, moneyIn = true, onClose, onChanged }) {
  const orderId = row?.id || null;
  const [live, setLive] = useState({ installments: [], moneyIn: {} });
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState("");
  const [reportFor, setReportFor] = useState(null);
  const [addFor, setAddFor] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  /* งวดสดของใบนี้ + ด่านของสามปุ่ม — อ่านอย่างเดียว (GET ไม่เขียนอะไร) · อ่านใหม่หลังทุกคำสั่งและหลัง 409 */
  const read = useCallback(async () => {
    if (!moneyIn || !orderId) return;
    setLoading(true); setReadError("");
    try {
      const res = await apiFetch(`/api/sales-planning/sales-orders/${orderId}/installments`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "อ่านงวดชำระไม่สำเร็จ");
      setLive({ installments: Array.isArray(body.installments) ? body.installments : [], moneyIn: body.moneyIn || {} });
    } catch (readFailure) {
      setReadError(readFailure.message);
    } finally {
      setLoading(false);
    }
  }, [moneyIn, orderId]);
  useEffect(() => { read(); }, [read]);

  const liveRow = (target) => (target ? live.installments.find((r) => r.id === target.id) || target : null);
  const single = live.installments.length === 1;

  /* แจ้งชำระ · แนบเพิ่ม · ดึงกลับ — API ตัวเดิมของแผงงวด (`PATCH …/installments`) · ด่านจริงอยู่ที่นั่น */
  const run = async (target, action, { paidOn = null, files = [] } = {}) => {
    setBusy(action); setError("");
    try {
      const evidence = action === "report" || action === "evidence-add"
        ? await uploadPaymentEvidenceList(files, { orderId, upload: uploadFileBytes })
        : undefined;
      const res = await apiFetch(`/api/sales-planning/sales-orders/${orderId}/installments`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installmentId: target.id, action, paidOn: paidOn || undefined, evidence,
          expectedUpdatedAt: target.updatedAt || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) await read();
        setError(body.error || "อัปเดตงวดชำระไม่สำเร็จ");
        return false;
      }
      notifyToast.success(action === "report" ? installmentReportDoneMessage(body.installment?.status) : DONE[action]);
      await read();
      onChanged?.();
      return true;
    } catch (runFailure) {
      setError(runFailure.message || "อัปโหลดหลักฐานไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };

  const renderActions = (inst) => {
    const target = live.installments.find((r) => r.id === inst.id);
    if (!target) return loading ? <span className="cell-sub">กำลังโหลดปุ่ม…</span> : null;
    const buttons = moneyInButtons(target, live.moneyIn?.[target.id]);
    if (!buttons.length) return null;
    const locks = [...new Set(buttons.map((b) => b.lock).filter(Boolean))];
    return (
      <div className={styles.actions}>
        <div className={styles.buttons}>
          {buttons.map((b) => (
            <Button key={b.action} size="sm"
              tone={b.tone === "primary" ? "primary" : undefined}
              variant={b.tone === "quiet" ? "quiet" : undefined}
              disabled={!!busy || !!b.lock} title={b.lock || undefined}
              onClick={() => {
                setError("");
                if (b.action === "report") setReportFor({ row: target, paidOn: businessDate(), files: [] });
                else if (b.action === "evidence-add") setAddFor({ row: target, files: [] });
                else run(target, "withdraw");
              }}>
              {b.label}
            </Button>
          ))}
        </div>
        {/* ติดด่าน = โชว์แล้วบอกเหตุ (กติกาการโชว์ UI) — เหตุจากด่านของ server ตัวเดียวกับ PATCH */}
        {locks.map((text) => <span key={text} className="cell-sub">{text}</span>)}
      </div>
    );
  };

  const dialogOpen = !!(reportFor || addFor);
  const reportRow = liveRow(reportFor?.row);
  const addRow = liveRow(addFor?.row);
  const addEntry = addRow ? live.moneyIn?.[addRow.id] : null;
  return (
    <>
      {/* ⚠️ ลิ้นชักหลบตอนโมดัลเปิด — กับดักโฟกัส/Esc ของลิ้นชักชนโมดัล (กติกาเดียวกับลิ้นชักบัญชี PR-3b) · ปิดโมดัลแล้วกลับมาที่งวดเดิม */}
      {!dialogOpen ? (
        <InstallmentDrawer
          row={row} focusSeq={focusSeq} showActual={showActual} onClose={onClose}
          renderActions={moneyIn ? renderActions : null}
          notice={moneyIn && readError ? <span className="cell-num-bad">{readError}</span> : null}
        />
      ) : null}
      {reportFor && reportRow ? (
        <InstallmentReportDialog
          row={reportRow} single={single}
          prepay={live.moneyIn?.[reportRow.id]?.outcome === "pending"}
          paidOn={reportFor.paidOn} files={reportFor.files}
          onChange={(next) => setReportFor((f) => ({ ...f, ...next }))}
          error={error} busy={!!busy}
          onClose={() => { if (!busy) { setReportFor(null); setError(""); } }}
          onSubmit={async () => {
            if (await run(reportRow, "report", { paidOn: reportFor.paidOn, files: reportFor.files })) setReportFor(null);
          }}
        />
      ) : null}
      {addFor && addRow ? (
        <InstallmentEvidenceAddDialog
          row={addRow} single={single}
          have={Array.isArray(addRow.evidence) ? addRow.evidence.length : 0}
          room={addEntry?.room ?? 0}
          files={addFor.files}
          onChange={(files) => setAddFor((f) => ({ ...f, files }))}
          error={error} busy={!!busy}
          onClose={() => { if (!busy) { setAddFor(null); setError(""); } }}
          onSubmit={async () => {
            if (await run(addRow, "evidence-add", { files: addFor.files })) setAddFor(null);
          }}
        />
      ) : null}
    </>
  );
}
