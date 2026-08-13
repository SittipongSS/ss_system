"use client";
import { Fragment, useState } from "react";
import { CalendarClock, Paperclip, Undo2, Wallet, XCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtDate, fmtMoney } from "@/lib/format";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { paymentConfirmPrompt } from "@/lib/approvalPrompt";
import { WON_DOC_TYPE_LABELS } from "@/lib/sales/quotationWonEvidence";
import {
  INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES, MIN_REJECT_REASON,
  installmentActionError, paymentRollup, previewInstallments,
} from "@/lib/sales/salesOrderPayments";
import styles from "./SalesOrderPaymentPanel.module.css";

/* การ์ด "การชำระ" ของใบสั่งขาย (mig 0245/0246) — **แบบ ข** (มติผู้ใช้ 2026-08-13)
   เทียบสามแบบไว้ที่ `docs/so-payment-panel-options-mockup.html`
   หลักฐานปิดการขายอยู่หัว · แถบสัดส่วนเงิน · ตารางแน่นที่เทียบข้ามงวดได้ด้วยตากวาดคอลัมน์

   ⭐ **แก้ข้อแลกของแบบ ข ที่รู้ตั้งแต่ตอนเทียบ** — mockup วางปุ่มไว้ในเมนู `⋯`
   ซึ่งแปลว่าคลิกเพิ่มหนึ่งครั้งทุกครั้งที่จะแจ้ง/คอนเฟิร์ม และแถวเดียวใส่หลักฐาน+
   เหตุผลตีกลับไม่ลง ⇒ ที่นี่ใช้ **แถวขยาย** แทน: งวดที่ต้องลงมือกางเองอัตโนมัติ
   ที่เหลือกดกางได้ · ได้ความแน่นของตารางโดยไม่ต้องซ่อนปุ่มไว้ในเมนู

   ⚠️ **หลักฐาน Won ≠ หลักฐานการชำระ** — PO ที่ลงนามแล้วคือหลักฐานว่า *สั่งซื้อ*
   ⚠️ ยอด Actual ไม่เกี่ยวกับการ์ดนี้ — SA ได้ยอดเต็ม 100% ตั้งแต่ใบอนุมัติ
   ⚠️ ยอด "เก็บแล้ว" นับเฉพาะที่บัญชีคอนเฟิร์ม — `reported` ไม่นับ */
export default function SalesOrderPaymentPanel({
  order, installments, user, todayIso, canStart, busy, onStart, onAction,
}) {
  const [reportFor, setReportFor] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [unconfirmFor, setUnconfirmFor] = useState(null);

  const saved = Array.isArray(installments) ? installments : [];
  const rows = saved.length ? saved : previewInstallments(order?.quotation?.paymentPlan, order?.totalAmount);
  const isPreview = !saved.length;
  const single = rows.length === 1;
  const rollup = paymentRollup(saved, todayIso);

  const quotation = order?.quotation;
  const wonFiles = Array.isArray(quotation?.wonAttachments) ? quotation.wonAttachments : [];
  const gate = (row, action, options) => installmentActionError(row, action, user, options);

  const headline = isPreview
    ? `แผนจากใบเสนอราคา${single ? "" : ` · ${rows.length} งวด`}`
    : rollup.complete
      ? `เก็บครบแล้ว ${fmtMoney(rollup.totalAmount)}`
      : single
        ? `ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`
        : `เก็บแล้ว ${rollup.confirmedCount}/${rollup.count} งวด · ค้างรับ ${fmtMoney(rollup.outstandingAmount)}`;

  // เตือนเฉพาะตอนมีเรื่อง — สถานะปกติอ่านจากป้ายในตารางได้อยู่แล้ว
  const rejectedCount = saved.filter((r) => r.status === "rejected").length;
  const alert = !isPreview && (rollup.overdueCount || rejectedCount)
    ? [
      rollup.overdueCount ? `เลยกำหนดแล้ว ${rollup.overdueCount} งวด` : null,
      rejectedCount ? `บัญชีตีกลับ ${rejectedCount} งวด` : null,
    ].filter(Boolean).join(" · ")
    : null;

  const pct = rollup.totalAmount > 0 ? Math.round((rollup.confirmedAmount / rollup.totalAmount) * 100) : 0;

  return (
    <DetailCard icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta={headline}>
      {/* แถบสัดส่วนเงิน — เฉพาะใบที่แบ่งงวดจริง ใบงวดเดียวไม่มีอะไรให้เทียบ */}
      {!isPreview && !single ? (
        <div className={styles.progress}>
          {/* แถบกลางของระบบ (.progress ใน globals.css) — ความกว้างของ fill ตั้ง inline
              ตามที่คอมเมนต์ของคลาสนั้นระบุไว้เอง ไม่ใช่ทรงใหม่ */}
          <div className="progress" role="progressbar"
            aria-valuenow={rollup.confirmedAmount} aria-valuemax={rollup.totalAmount}
            aria-label="สัดส่วนเงินที่เก็บได้แล้ว">
            <span className={rollup.complete ? "done" : undefined} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.barMeta}>
            <span>เก็บแล้ว {fmtMoney(rollup.confirmedAmount)}</span>
            <span>ทั้งใบ {fmtMoney(rollup.totalAmount)}</span>
          </div>
        </div>
      ) : null}

      {/* หลักฐานปิดการขาย — แถวเดียว */}
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
        /* surface="auto" = ตารางมีขอบ/มุมมน/พื้นของตัวเอง (ตัวแปรกลางใน Table.module.css)
           เดิมใช้ "embedded" ซึ่งไม่มีขอบ ⇒ ตารางลอยอยู่ในการ์ดโดยไม่มีกรอบ (ผู้ใช้ขอเพิ่มขอบ)
           ⚠️ ใช้ตัวแปรของ primitive ไม่เขียน border ทับเองในโมดูลนี้ — ไม่งั้นได้ทรงที่สอง */
        <TableScroll family="editable" surface="auto" cells="stacked" minWidth={680}>
          <table className={`${styles.table} ${isPreview ? styles.preview : ""}`.trim()}>
            <thead>
              <tr>
                {single ? null : <th className={styles.seqCol}>งวด</th>}
                <th>รายละเอียด</th>
                <th>กำหนด / จ่ายจริง</th>
                <th className="num">ยอด</th>
                <th>หลักฐาน</th>
                <th>สถานะ</th>
                <th aria-label="การจัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overdue = row.status !== "confirmed" && row.dueDate && String(row.dueDate) < String(todayIso);
                const evidence = Array.isArray(row.evidence) ? row.evidence : [];

                /* ⭐ **ปุ่มก้าวถัดไป 1 ปุ่ม + เมนู "…"** (มติผู้ใช้ 2026-08-01 · RowActionMenu)
                   "ก้าวถัดไป" = action ที่ทำให้งวดนี้เดินหน้า **สำหรับคนที่กำลังดูอยู่**
                     · รอชำระ / ถูกตีกลับ → ฝ่ายขายแจ้งชำระ
                     · รอบัญชีตรวจ       → บัญชีคอนเฟิร์ม
                   ⚠️ ฝ่ายขายเปิดดูงวดที่ "รอบัญชีตรวจ" จะ **ไม่มีปุ่มหลัก** โดยตั้งใจ —
                   สิ่งเดียวที่เขาทำได้คือ "ดึงกลับ" ซึ่งเป็นการถอย ไม่ใช่ก้าวถัดไป
                   เอามาเป็นปุ่มเด่นจะกลายเป็นชวนให้ถอย */
                const canReport = !row.preview && !gate(row, "report", { paidOn: "placeholder" });
                const canConfirm = !row.preview && !gate(row, "confirm");
                const primary = canReport
                  ? { label: row.status === "rejected" ? "แจ้งใหม่" : "แจ้งลูกค้าจ่ายแล้ว",
                      onClick: () => setReportFor({ row, paidOn: todayIso, files: [] }) }
                  : canConfirm
                    ? {
                      label: "บัญชีคอนเฟิร์ม",
                      /* ⚠️ ถอนคืนไม่ได้จริง ๆ — ไม่มี action un-confirm และงวดที่คอนเฟิร์มแล้ว
                         ล็อกใบไม่ให้ยกเลิกอนุมัติ/ออก Rev. (ดู paymentLockReason)
                         ⇒ ต้องถามก่อนเสมอ (มติผู้ใช้ 2026-08-13) */
                      onClick: async () => {
                        const ok = await confirmAction(paymentConfirmPrompt({
                          label: rows.length > 1 ? `งวดที่ ${row.seq}` : "ชำระเต็มจำนวน",
                          amount: fmtMoney(row.amount),
                        }));
                        if (ok) await onAction(row, "confirm");
                      },
                    }
                    : null;

                const menu = row.preview ? [] : [
                  !gate(row, "schedule") && {
                    id: "schedule", icon: CalendarClock,
                    label: row.dueDate ? "แก้กำหนดชำระ" : "ตั้งกำหนดชำระ",
                    onClick: () => setScheduleFor({ row, dueDate: row.dueDate || "" }),
                  },
                  !gate(row, "withdraw") && {
                    id: "withdraw", icon: Undo2, tone: "warning", label: "ดึงกลับการแจ้งชำระ",
                    onClick: () => onAction(row, "withdraw"),
                  },
                  !gate(row, "reject", { reason: "x".repeat(MIN_REJECT_REASON) }) && {
                    id: "reject", icon: XCircle, tone: "danger", label: "ตีกลับให้แก้",
                    onClick: () => setRejectFor({ row, reason: "" }),
                  },
                  /* ถอนคำรับรอง (มติผู้ใช้ 2026-08-13) — **อยู่ในเมนู `⋯` ไม่ใช่ปุ่มหลัก**
                     งวดที่คอนเฟิร์มแล้วคือ "จบแล้ว" ปุ่มหลักของแถวจึงต้องไม่มี ·
                     การถอยเป็นทางออกฉุกเฉิน ไม่ใช่ก้าวถัดไปที่ชวนให้กด */
                  !gate(row, "unconfirm", { reason: "x".repeat(MIN_REJECT_REASON) }) && {
                    id: "unconfirm", icon: Undo2, tone: "warning", label: "ถอนคำรับรอง",
                    onClick: () => setUnconfirmFor({ row, reason: "" }),
                  },
                ].filter(Boolean);

                return (
                  <Fragment key={row.id || `preview-${row.seq}`}>
                  <tr>
                    {single ? null : <td className={styles.seqCol}>{row.seq}</td>}
                    <td>
                      <strong>{row.label}</strong>
                      {single ? null : <small>{row.percent}%</small>}
                    </td>
                    <td>
                      <span className={overdue ? styles.overdue : undefined}>
                        {row.dueDate ? fmtDate(row.dueDate) : row.preview ? "กำหนดหลังอนุมัติ" : "ยังไม่กำหนด"}
                        {overdue ? " · เลยกำหนด" : ""}
                      </span>
                      {row.paidOn ? <small>จ่าย {fmtDate(row.paidOn)}</small> : null}
                      {row.reportedByName || row.confirmedByName ? (
                        <small>
                          {row.confirmedByName ? `บัญชีรับรอง ${row.confirmedByName}` : `แจ้งโดย ${row.reportedByName}`}
                        </small>
                      ) : null}
                    </td>
                    <td className="num">{fmtMoney(row.amount)}</td>
                    <td>
                      {evidence.length ? (
                        <span className={styles.evidence}>
                          {evidence.map((att, i) => (
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
                      ) : <span className={styles.none}>—</span>}
                    </td>
                    <td>
                      <StatusBadge
                        size="sm"
                        tone={row.preview ? "neutral" : (INSTALLMENT_STATUS_TONES[row.status] || "neutral")}
                        label={row.preview ? "ยังไม่เริ่มติดตาม" : (INSTALLMENT_STATUS_LABELS[row.status] || row.status)}
                      />
                    </td>
                    <td className={styles.actionCell}>
                      {primary ? (
                        <Button tone="accent" size="sm" disabled={!!busy} onClick={primary.onClick}>
                          {primary.label}
                        </Button>
                      ) : null}
                      {menu.length ? (
                        <RowActionMenu items={menu} busy={!!busy}
                          label={single ? "การจัดการอื่นของงวดนี้" : `การจัดการอื่นของงวดที่ ${row.seq}`} />
                      ) : null}
                    </td>
                  </tr>
                  {/* เหตุผลที่บัญชีตีกลับ — **โชว์เสมอ ไม่ซ่อนในเมนู** เพราะมันคือสิ่งที่
                      บอกว่าต้องแก้อะไรก่อนแจ้งใหม่ (กฎเดียวกับใบสั่งขายที่ถูกตีกลับ) */}
                  {row.status === "rejected" && row.rejectedReason ? (
                    <tr className={styles.detailRow}>
                      <td className={styles.detail} colSpan={single ? 6 : 7}>
                        <div className={styles.rejected}>
                          <strong>บัญชีตีกลับ · {row.rejectedByName || "ฝ่ายบัญชี"}</strong>
                          <ReadableText text={row.rejectedReason} lines={3} />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
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

      {/* ⚠️ ถอนคำรับรอง = กลับคำเรื่องเงินที่เคยบอกว่ารับแล้ว และปลดล็อกใบให้ยกเลิก
          อนุมัติ/ออก Rev. ได้ด้วย ⇒ ต้องมีเหตุผลเท่ากับตอนตีกลับ ไม่ใช่กดแล้วจบ */}
      <ReasonDialog
        open={!!unconfirmFor}
        title="ถอนคำรับรองการชำระ"
        description="งวดนี้จะกลับไปเป็น “รอบัญชีตรวจ” — หลักฐานและคำแจ้งของฝ่ายขายยังอยู่ครบ และใบนี้จะยกเลิกอนุมัติ/ออก Rev. ได้อีกครั้ง"
        label="เหตุผลที่ถอนคำรับรอง"
        value={unconfirmFor?.reason || ""}
        onChange={(reason) => setUnconfirmFor((f) => ({ ...f, reason }))}
        onClose={() => setUnconfirmFor(null)}
        onConfirm={async () => {
          const done = await onAction(unconfirmFor.row, "unconfirm", { reason: unconfirmFor.reason });
          if (done) setUnconfirmFor(null);
        }}
        confirmLabel="ยืนยันถอนคำรับรอง"
        placeholder={`ระบุเหตุผลอย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
        minLength={MIN_REJECT_REASON}
        maxLength={500}
        tone="danger"
        busy={!!busy}
      />

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
