"use client";
import { Fragment, useState } from "react";
import { ChevronDown, Paperclip, Wallet } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtDate, fmtMoney } from "@/lib/format";
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
  const [opened, setOpened] = useState({}); // แถวที่ผู้ใช้กดกางเอง

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

  /* แถวไหน "ต้องลงมือ" = กางเอง · ที่เหลือกดกางได้
     ⚠️ ผูกกับสถานะ ไม่ใช่กับสิทธิ์ของคนดู — ฝ่ายขายเปิดมาเห็นงวดที่บัญชีตีกลับกางอยู่
     ก็ถูกแล้ว เพราะเป็นงวดที่ต้องแก้ */
  const autoOpen = (row) => row.status === "reported" || row.status === "rejected";
  const isOpen = (row) => (row.id in opened ? opened[row.id] : autoOpen(row));
  const toggle = (row) => setOpened((s) => ({ ...s, [row.id]: !isOpen(row) }));

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
        <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={520}>
          <table className={`${styles.table} ${isPreview ? styles.preview : ""}`.trim()}>
            <thead>
              <tr>
                {single ? null : <th className={styles.seqCol}>งวด</th>}
                <th>รายละเอียด</th>
                <th>กำหนด / จ่ายจริง</th>
                <th className="num">ยอด</th>
                <th>สถานะ</th>
                <th aria-label="ขยาย" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overdue = row.status !== "confirmed" && row.dueDate && String(row.dueDate) < String(todayIso);
                const open = !row.preview && isOpen(row);
                const actions = row.preview ? [] : [
                  !gate(row, "schedule") && (
                    <Button key="s" variant="quiet" size="sm" disabled={!!busy}
                      onClick={() => setScheduleFor({ row, dueDate: row.dueDate || "" })}>
                      {row.dueDate ? "แก้กำหนดชำระ" : "ตั้งกำหนดชำระ"}
                    </Button>
                  ),
                  !gate(row, "report", { paidOn: "placeholder" }) && (
                    <Button key="r" tone="accent" size="sm" disabled={!!busy}
                      onClick={() => setReportFor({ row, paidOn: todayIso, files: [] })}>
                      แจ้งลูกค้าจ่ายแล้ว
                    </Button>
                  ),
                  !gate(row, "withdraw") && (
                    <Button key="w" variant="quiet" size="sm" disabled={!!busy}
                      onClick={() => onAction(row, "withdraw")}>ดึงกลับ</Button>
                  ),
                  !gate(row, "confirm") && (
                    <Button key="c" tone="accent" size="sm" disabled={!!busy}
                      onClick={() => onAction(row, "confirm")}>บัญชีคอนเฟิร์ม</Button>
                  ),
                  !gate(row, "reject", { reason: "x".repeat(MIN_REJECT_REASON) }) && (
                    <Button key="j" variant="quiet" size="sm" disabled={!!busy}
                      onClick={() => setRejectFor({ row, reason: "" })}>ตีกลับ</Button>
                  ),
                ].filter(Boolean);
                const evidence = Array.isArray(row.evidence) ? row.evidence : [];
                const hasDetail = actions.length || evidence.length || row.rejectedReason;

                return (
                  <Fragment key={row.id || `preview-${row.seq}`}>
                  <tr className={open ? styles.openRow : undefined}>
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
                    </td>
                    <td className="num">{fmtMoney(row.amount)}</td>
                    <td>
                      <StatusBadge
                        size="sm"
                        tone={row.preview ? "neutral" : (INSTALLMENT_STATUS_TONES[row.status] || "neutral")}
                        label={row.preview ? "ยังไม่เริ่มติดตาม" : (INSTALLMENT_STATUS_LABELS[row.status] || row.status)}
                      />
                    </td>
                    <td className={styles.toggleCell}>
                      {hasDetail ? (
                        <button
                          type="button" className={styles.toggle} onClick={() => toggle(row)}
                          aria-expanded={open}
                          aria-label={open ? `ย่อรายละเอียดงวดที่ ${row.seq}` : `กางรายละเอียดงวดที่ ${row.seq}`}
                        >
                          <ChevronDown size={15} aria-hidden="true" className={open ? styles.flip : undefined} />
                        </button>
                      ) : null}
                    </td>

                  </tr>
                  {/* ⚠️ แถวรายละเอียดต้องเป็น <tr> ของตัวเอง — td ที่ colSpan อยู่ในแถวเดียว
                      กับเซลล์อื่นไม่ได้ตามสเปกตาราง */}
                  {open && hasDetail ? (
                    <tr className={styles.detailRow}>
                      <td className={styles.detail} colSpan={single ? 5 : 6}>
                        {row.rejectedReason ? (
                          <div className={styles.rejected}>
                            <strong>บัญชีตีกลับ · {row.rejectedByName || "ฝ่ายบัญชี"}</strong>
                            <ReadableText text={row.rejectedReason} lines={3} />
                          </div>
                        ) : null}
                        {row.reportedByName || row.confirmedByName ? (
                          <p className={styles.who}>
                            {row.reportedByName ? `แจ้งโดย ${row.reportedByName}` : ""}
                            {row.reportedByName && row.confirmedByName ? " · " : ""}
                            {row.confirmedByName ? `บัญชีรับรองโดย ${row.confirmedByName}` : ""}
                          </p>
                        ) : null}
                        {evidence.length ? (
                          <div className={styles.evidence}>
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
                          </div>
                        ) : null}
                        {actions.length ? <div className={styles.actions}>{actions}</div> : null}
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
