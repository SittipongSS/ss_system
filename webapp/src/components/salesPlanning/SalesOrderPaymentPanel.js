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
  installmentActionError, paymentRollup, previewInstallments,
} from "@/lib/sales/salesOrderPayments";
import styles from "./SalesOrderPaymentPanel.module.css";

/* การ์ด "การชำระ" ของใบสั่งขาย (mig 0245/0246)
   ⭐ การ์ดเดียว — หลักฐานปิดการขายอยู่หัว งวดอยู่ล่าง (มติผู้ใช้ 2026-08-13)

   ⭐ **เงียบไว้ก่อน พูดเมื่อมีเรื่อง** (feedback ผู้ใช้ 2026-08-13: *"มี 1 ก็โชว์แค่ 1"*)
   รอบแรกการ์ดนี้มีแถบข้อความคาดทุกสถานะ + ป้าย "งวดที่ 1" + "100%" บนใบที่จ่ายครั้งเดียว
   ⇒ อ่านสามบรรทัดเพื่อรู้เรื่องเดียว · ตอนนี้:
     · สรุปยอดอยู่บนหัวการ์ด (meta) ไม่กินบรรทัดของตัวเอง
     · แถบเตือนขึ้น **เฉพาะตอนมีปัญหา** (เลยกำหนด / บัญชีตีกลับ)
     · ใบงวดเดียวไม่ขึ้น "งวดที่ 1" และไม่ขึ้น "100%" — ไม่มีอะไรให้เทียบ

   ⚠️ **หลักฐาน Won ≠ หลักฐานการชำระ** — PO ที่ลงนามแล้วคือหลักฐานว่า *สั่งซื้อ*
   ไม่ใช่ว่า *จ่ายเงิน* · หัวการ์ดจึงพูดว่า "ปิดการขายด้วย" ไม่ใช่ "ชำระแล้ว"
   ⚠️ ยอด Actual ไม่เกี่ยวกับการ์ดนี้ — SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ */
export default function SalesOrderPaymentPanel({
  order, installments, user, todayIso, canStart, busy, onStart, onAction,
}) {
  const [reportFor, setReportFor] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);

  const saved = Array.isArray(installments) ? installments : [];
  /* ยังไม่มีงวดจริง = โชว์แผนจากใบเสนอราคาไปก่อน (มติผู้ใช้ 2026-08-13)
     คำนวณสดทุกครั้งที่เรนเดอร์ จึงไม่มีปัญหายอดค้างแบบที่เขียนลง DB ตั้งแต่ตอนร่าง */
  const rows = saved.length ? saved : previewInstallments(order?.quotation?.paymentPlan, order?.totalAmount);
  const isPreview = !saved.length;
  const single = rows.length === 1;
  const rollup = paymentRollup(saved, todayIso);

  const quotation = order?.quotation;
  const wonFiles = Array.isArray(quotation?.wonAttachments) ? quotation.wonAttachments : [];
  const gate = (row, action, options) => installmentActionError(row, action, user, options);

  // สรุปหนึ่งบรรทัดบนหัวการ์ด — ไม่กินบรรทัดในเนื้อการ์ด
  const headline = isPreview
    ? `แผนจากใบเสนอราคา${single ? "" : ` · ${rows.length} งวด`}`
    : rollup.complete
      ? `เก็บครบแล้ว ${fmtMoney(rollup.totalAmount)}`
      : single
        ? `ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`
        : `เก็บแล้ว ${rollup.confirmedCount}/${rollup.count} งวด · ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`;

  // ⚠️ เตือนเฉพาะตอนมีเรื่อง — สถานะปกติอ่านจากป้ายบนแถวได้อยู่แล้ว
  const alert = !isPreview && rollup.overdueCount
    ? `เลยกำหนดแล้ว ${rollup.overdueCount} งวด${rollup.nextDue ? ` · งวดถัดไปครบ ${fmtDate(rollup.nextDue)}` : ""}`
    : null;

  return (
    <DetailCard icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta={headline}>
      {/* หลักฐานปิดการขาย — แถวเดียว ไม่ใช่ตาราง 4 ช่อง */}
      <div className={styles.won}>
        <span className={styles.wonLabel}>ปิดการขายด้วย</span>
        <span className={styles.wonValue}>
          {WON_DOC_TYPE_LABELS[quotation?.wonDocType] || quotation?.wonDocType || "-"}
          {quotation?.wonDocNo ? <> · <b>{quotation.wonDocNo}</b></> : null}
          {quotation?.wonDocDate ? ` · ${fmtDate(quotation.wonDocDate)}` : ""}
        </span>
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
      </div>

      {alert ? <StatusNotice tone="error">{alert}</StatusNotice> : null}

      {!rows.length ? (
        <p className="form-note">ใบเสนอราคาต้นทางไม่ได้ระบุแผนการชำระ — ไม่มีงวดให้ติดตาม</p>
      ) : (
        <ol className={`${styles.list} ${isPreview ? styles.preview : ""}`.trim()}>
          {rows.map((row) => {
            const overdue = row.status !== "confirmed" && row.dueDate && String(row.dueDate) < String(todayIso);
            const meta = [
              row.dueDate ? `กำหนด ${fmtDate(row.dueDate)}` : null,
              row.paidOn ? `จ่าย ${fmtDate(row.paidOn)}` : null,
              row.reportedByName ? `แจ้งโดย ${row.reportedByName}` : null,
              row.confirmedByName ? `รับรองโดย ${row.confirmedByName}` : null,
            ].filter(Boolean);

            return (
              <li key={row.id || `preview-${row.seq}`} className={styles.row}>
                <div className={styles.main}>
                  <StatusBadge
                    size="sm"
                    tone={row.preview ? "neutral" : (INSTALLMENT_STATUS_TONES[row.status] || "neutral")}
                    label={row.preview ? "ยังไม่เริ่มติดตาม" : (INSTALLMENT_STATUS_LABELS[row.status] || row.status)}
                  />
                  <span className={styles.name}>
                    {/* ใบงวดเดียวไม่ต้องขึ้นเลขงวดหรือ % — ไม่มีอะไรให้เทียบ */}
                    {single ? row.label : `งวดที่ ${row.seq} · ${row.label}`}
                    {single ? null : <em>{row.percent}%</em>}
                  </span>
                  <span className={styles.amount}>{fmtMoney(row.amount)}</span>
                </div>

                {meta.length || overdue ? (
                  <p className={styles.meta}>
                    {overdue ? <b className={styles.overdue}>เลยกำหนด</b> : null}
                    {meta.join(" · ")}
                  </p>
                ) : null}

                {Array.isArray(row.evidence) && row.evidence.length ? (
                  <div className={styles.evidence}>
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
                  </div>
                ) : null}

                {/* งวดที่ถูกตีกลับต้องขึ้นเหตุผลเป็นข้อความ ไม่ใช่ป้ายเปล่า */}
                {row.status === "rejected" && row.rejectedReason ? (
                  <div className={styles.rejected}>
                    <strong>บัญชีตีกลับ · {row.rejectedByName || "ฝ่ายบัญชี"}</strong>
                    <ReadableText text={row.rejectedReason} lines={3} />
                  </div>
                ) : null}

                {row.preview ? null : (
                  <div className={styles.actions}>
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
                        onClick={() => onAction(row, "withdraw")}>ดึงกลับ</Button>
                    ) : null}
                    {!gate(row, "confirm") ? (
                      <Button tone="accent" size="sm" disabled={!!busy}
                        onClick={() => onAction(row, "confirm")}>บัญชีคอนเฟิร์ม</Button>
                    ) : null}
                    {!gate(row, "reject", { reason: "x".repeat(MIN_REJECT_REASON) }) ? (
                      <Button variant="quiet" size="sm" disabled={!!busy}
                        onClick={() => setRejectFor({ row, reason: "" })}>ตีกลับ</Button>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* ใบเก่าที่อนุมัติก่อนมีระบบนี้ (หรือรอบ seed ตอนอนุมัติล้ม) ต้องมีทางกู้
          ⚠️ ใบใหม่ไม่เห็นปุ่มนี้เลย — อนุมัติแล้วระบบสร้างงวดให้เอง */}
      {isPreview && canStart && order?.status === "approved" ? (
        <Button tone="accent" size="sm" className={styles.start} onClick={onStart} disabled={!!busy}>
          {busy === "start-payments" ? "กำลังสร้าง…" : "เริ่มติดตามการชำระ"}
        </Button>
      ) : null}

      {reportFor ? (
        <Modal open onClose={() => setReportFor(null)} title={single ? "แจ้งลูกค้าจ่ายแล้ว" : `แจ้งชำระ งวดที่ ${reportFor.row.seq}`} size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            <p className="form-note">ยอด {fmtMoney(reportFor.row.amount)} — บัญชีจะตรวจหลักฐานก่อนรับรอง</p>
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
                  const done = await onAction(reportFor.row, "report", { paidOn: reportFor.paidOn, files: reportFor.files });
                  if (done) setReportFor(null);
                }}>
                {busy ? "กำลังส่ง…" : "ส่งให้บัญชีตรวจ"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {scheduleFor ? (
        <Modal open onClose={() => setScheduleFor(null)} title="กำหนดชำระ" size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            <p className="form-note">ใบเสนอราคาระบุแค่สัดส่วนของแต่ละงวด ไม่มีวัน — กรอกที่นี่</p>
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
                }}>บันทึก</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <ReasonDialog
        open={!!rejectFor}
        title="ตีกลับการแจ้งชำระ"
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
