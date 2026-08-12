"use client";
import { useState } from "react";
import { Paperclip, Wallet } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Modal from "@/components/Modal";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtDate, fmtMoney } from "@/lib/format";
import { WON_DOC_TYPE_LABELS } from "@/lib/sales/quotationWonEvidence";
import {
  INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES, MIN_REJECT_REASON,
  installmentActionError, paymentRollup, paymentState,
} from "@/lib/sales/salesOrderPayments";
import styles from "./SalesOrderPaymentPanel.module.css";

const STATE_TONE = { complete: "success", overdue: "error", rejected: "error", reviewing: "info", open: "warning", none: "info" };

/* การ์ด "การชำระ" ของใบสั่งขาย (mig 0245/0246)
   ⭐ การ์ดเดียว — **หลักฐานปิดการขายอยู่หัว งวดอยู่ล่าง** (มติผู้ใช้ 2026-08-13)
   เพราะเป็นเรื่องเดียวกัน: ตกลงซื้อด้วยอะไร แล้วจ่ายมากี่งวดแล้ว

   ⚠️ **หลักฐาน Won ≠ หลักฐานการชำระ** — PO ที่ลงนามแล้วคือหลักฐานว่า *สั่งซื้อ*
   ไม่ใช่ว่า *จ่ายเงิน* · หัวการ์ดจึงพูดว่า "ปิดการขายด้วยอะไร" ไม่ใช่ "ชำระแล้ว"
   ⚠️ ยอด Actual ไม่เกี่ยวกับการ์ดนี้เลย — SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ */
export default function SalesOrderPaymentPanel({
  order, installments, user, todayIso, canStart, busy, onStart, onAction,
}) {
  const [reportFor, setReportFor] = useState(null); // { row, paidOn, files }
  const [rejectFor, setRejectFor] = useState(null); // { row, reason }
  const [scheduleFor, setScheduleFor] = useState(null); // { row, dueDate }

  const rows = Array.isArray(installments) ? installments : [];
  const rollup = paymentRollup(rows, todayIso);
  const state = paymentState(rollup);
  const quotation = order?.quotation;
  const wonLabel = WON_DOC_TYPE_LABELS[quotation?.wonDocType] || quotation?.wonDocType || "-";
  const wonFiles = Array.isArray(quotation?.wonAttachments) ? quotation.wonAttachments : [];

  const gate = (row, action, options) => installmentActionError(row, action, user, options);

  const summary = rollup.count
    ? `ชำระแล้ว ${rollup.confirmedCount}/${rollup.count} งวด · ${fmtMoney(rollup.confirmedAmount)} จาก ${fmtMoney(rollup.totalAmount)}`
    : undefined;

  return (
    <DetailCard icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta={summary}>
      {/* ── หัวการ์ด: ปิดการขายด้วยเอกสารอะไร ─────────────────────────── */}
      <dl className={styles.wonGrid}>
        <div>
          <dt>ปิดการขายด้วย</dt>
          <dd>{wonLabel}</dd>
        </div>
        <div>
          <dt>วันที่เอกสาร</dt>
          <dd>{fmtDate(quotation?.wonDocDate)}</dd>
        </div>
        <div>
          <dt>เลขที่เอกสาร</dt>
          {/* mig 0246 — ใบเก่าที่ปิด Won ก่อนมีคอลัมน์นี้จะว่าง ไม่ backfill */}
          <dd>{quotation?.wonDocNo || <span className={styles.empty}>ไม่ได้ระบุ</span>}</dd>
        </div>
        <div>
          <dt>ไฟล์หลักฐาน</dt>
          <dd>
            {wonFiles.length ? (
              <span className={styles.files}>
                {wonFiles.map((att, i) => (
                  <a
                    key={`${att.storagePath || att.fileUrl || "f"}-${i}`}
                    href={`/api/sales-planning/quotations/${order.quotationId}/file?i=${i}`}
                    target="_blank" rel="noreferrer" className={styles.fileLink}
                    title={att.fileName || `ไฟล์ ${i + 1}`}
                  >
                    <Paperclip size={13} aria-hidden="true" />
                    <span className="cell-ellipsis">{att.fileName || `ไฟล์ ${i + 1}`}</span>
                  </a>
                ))}
              </span>
            ) : <span className={styles.empty}>ไม่มีไฟล์</span>}
          </dd>
        </div>
      </dl>

      {/* ── งวดชำระ ───────────────────────────────────────────────────── */}
      {!rows.length ? (
        <div className={styles.startBlock}>
          <StatusNotice tone={order?.status === "approved" ? "warning" : "info"}>
            {order?.status === "approved"
              ? "ใบนี้ยังไม่ได้เริ่มติดตามการชำระ — ระบบจะยกงวดมาจากแผนการชำระของใบเสนอราคา"
              : "งวดชำระจะถูกสร้างให้อัตโนมัติเมื่อใบนี้อนุมัติแล้ว"}
          </StatusNotice>
          {canStart && order?.status === "approved" ? (
            <Button tone="accent" size="sm" onClick={onStart} disabled={!!busy}>
              {busy === "start-payments" ? "กำลังสร้าง…" : "เริ่มติดตามการชำระ"}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <StatusNotice tone={STATE_TONE[state.state] || "info"}>
            {rollup.complete
              ? `เก็บเงินครบทุกงวดแล้ว — ${fmtMoney(rollup.totalAmount)}`
              : `ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`}
            {rollup.overdueCount ? ` · เลยกำหนดแล้ว ${rollup.overdueCount} งวด` : ""}
            {!rollup.complete && rollup.nextDue ? ` · งวดถัดไปครบ ${fmtDate(rollup.nextDue)}` : ""}
          </StatusNotice>

          <ol className={styles.list}>
            {rows.map((row) => {
              const overdue = row.status !== "confirmed" && row.dueDate && String(row.dueDate) < String(todayIso);
              return (
                <li key={row.id} className={styles.row}>
                  <div className={styles.rowHead}>
                    <StatusBadge
                      size="sm"
                      tone={INSTALLMENT_STATUS_TONES[row.status] || "neutral"}
                      label={INSTALLMENT_STATUS_LABELS[row.status] || row.status}
                    />
                    <strong className={styles.rowLabel}>
                      งวดที่ {row.seq} · {row.label}
                    </strong>
                    <span className={styles.amount}>{fmtMoney(row.amount)}</span>
                  </div>

                  <div className={styles.rowMeta}>
                    <span className={overdue ? styles.overdue : undefined}>
                      {row.dueDate ? `กำหนด ${fmtDate(row.dueDate)}` : "ยังไม่กำหนดวัน"}
                      {overdue ? " · เลยกำหนด" : ""}
                    </span>
                    <span>{row.percent}%</span>
                    {row.paidOn ? <span>ลูกค้าจ่าย {fmtDate(row.paidOn)}</span> : null}
                    {row.reportedByName ? <span>แจ้งโดย {row.reportedByName}</span> : null}
                    {row.confirmedByName ? <span>บัญชีรับรอง {row.confirmedByName}</span> : null}
                  </div>

                  {Array.isArray(row.evidence) && row.evidence.length ? (
                    <span className={styles.files}>
                      {row.evidence.map((att, i) => (
                        <a
                          key={`${att.storagePath || "e"}-${i}`}
                          href={`/api/sales-planning/sales-orders/${order.id}/payment-file?installment=${encodeURIComponent(row.id)}&i=${i}`}
                          target="_blank" rel="noreferrer" className={styles.fileLink}
                          title={att.fileName || `หลักฐาน ${i + 1}`}
                        >
                          <Paperclip size={13} aria-hidden="true" />
                          <span className="cell-ellipsis">{att.fileName || `หลักฐาน ${i + 1}`}</span>
                        </a>
                      ))}
                    </span>
                  ) : null}

                  {/* งวดที่ถูกตีกลับต้องขึ้นเหตุผลเป็นข้อความ ไม่ใช่ป้ายเปล่า
                      (กฎเดียวกับใบสั่งขายที่ถูกตีกลับ) */}
                  {row.status === "rejected" && row.rejectedReason ? (
                    <div className={styles.rejected}>
                      <strong>บัญชีตีกลับโดย {row.rejectedByName || "ฝ่ายบัญชี"}</strong>
                      <ReadableText text={row.rejectedReason} lines={3} />
                    </div>
                  ) : null}

                  <div className={styles.rowActions}>
                    {!gate(row, "schedule") ? (
                      <Button variant="quiet" size="sm" disabled={!!busy}
                        onClick={() => setScheduleFor({ row, dueDate: row.dueDate || "" })}>
                        {row.dueDate ? "แก้กำหนดชำระ" : "ตั้งกำหนดชำระ"}
                      </Button>
                    ) : null}
                    {!gate(row, "report", { paidOn: "placeholder" }) ? (
                      <Button tone="accent" size="sm" disabled={!!busy}
                        onClick={() => setReportFor({ row, paidOn: todayIso, files: [] })}>
                        แจ้งลูกค้าจ่ายแล้ว
                      </Button>
                    ) : null}
                    {!gate(row, "withdraw") ? (
                      <Button variant="quiet" size="sm" disabled={!!busy}
                        onClick={() => onAction(row, "withdraw")}>
                        ดึงกลับ
                      </Button>
                    ) : null}
                    {!gate(row, "confirm") ? (
                      <Button tone="accent" size="sm" disabled={!!busy}
                        onClick={() => onAction(row, "confirm")}>
                        บัญชีคอนเฟิร์ม
                      </Button>
                    ) : null}
                    {!gate(row, "reject", { reason: "x".repeat(MIN_REJECT_REASON) }) ? (
                      <Button variant="quiet" size="sm" disabled={!!busy}
                        onClick={() => setRejectFor({ row, reason: "" })}>
                        ตีกลับ
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {/* ── แจ้งชำระ ──────────────────────────────────────────────────── */}
      {reportFor ? (
        <Modal open onClose={() => setReportFor(null)} title={`แจ้งชำระ งวดที่ ${reportFor.row.seq}`} size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            <p className="form-note">
              ยอดงวดนี้ {fmtMoney(reportFor.row.amount)} — บัญชีจะตรวจหลักฐานก่อนรับรอง
            </p>
            <label className={styles.field}>
              <span>วันที่ลูกค้าชำระ *</span>
              <DateInput value={reportFor.paidOn} ariaLabel="วันที่ลูกค้าชำระ"
                onChange={(iso) => setReportFor((f) => ({ ...f, paidOn: iso }))} />
            </label>
            <div className={styles.field}>
              <span>หลักฐานการชำระ * (สลิป/ใบนำฝาก)</span>
              <PendingFiles files={reportFor.files} disabled={!!busy} max={8}
                onChange={(files) => setReportFor((f) => ({ ...f, files }))} />
            </div>
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setReportFor(null)} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="accent" disabled={!!busy || !reportFor.paidOn || !reportFor.files.length}
                onClick={async () => {
                  const done = await onAction(reportFor.row, "report", {
                    paidOn: reportFor.paidOn, files: reportFor.files,
                  });
                  if (done) setReportFor(null);
                }}>
                {busy ? "กำลังส่ง…" : "ส่งให้บัญชีตรวจ"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ── ตั้ง/แก้กำหนดชำระ ─────────────────────────────────────────── */}
      {scheduleFor ? (
        <Modal open onClose={() => setScheduleFor(null)} title={`กำหนดชำระ งวดที่ ${scheduleFor.row.seq}`} size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            <p className="form-note">
              ใบเสนอราคาระบุแค่สัดส่วนของแต่ละงวด ไม่มีวัน — กรอกที่นี่ทีละงวด
            </p>
            <label className={styles.field}>
              <span>วันครบกำหนด</span>
              <DateInput value={scheduleFor.dueDate} ariaLabel="วันครบกำหนด"
                onChange={(iso) => setScheduleFor((f) => ({ ...f, dueDate: iso }))} />
            </label>
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setScheduleFor(null)} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="accent" disabled={!!busy}
                onClick={async () => {
                  const done = await onAction(scheduleFor.row, "schedule", { dueDate: scheduleFor.dueDate || null });
                  if (done) setScheduleFor(null);
                }}>
                บันทึก
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <ReasonDialog
        open={!!rejectFor}
        title={`ตีกลับ งวดที่ ${rejectFor?.row?.seq || ""}`}
        description="งวดนี้จะกลับไปให้ฝ่ายขายแก้แล้วแจ้งใหม่"
        label="เหตุผลที่ตีกลับ"
        value={rejectFor?.reason || ""}
        onChange={(reason) => setRejectFor((f) => ({ ...f, reason }))}
        onClose={() => setRejectFor(null)}
        onConfirm={async () => {
          const done = await onAction(rejectFor.row, "reject", { reason: rejectFor.reason });
          if (done) setRejectFor(null);
        }}
        confirmLabel="ยืนยันตีกลับ"
        placeholder={`ระบุเหตุผลอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
        minLength={MIN_REJECT_REASON}
        maxLength={500}
        tone="danger"
        busy={!!busy}
      />
    </DetailCard>
  );
}
