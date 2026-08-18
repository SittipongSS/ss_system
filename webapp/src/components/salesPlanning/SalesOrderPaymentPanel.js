"use client";
import { Fragment, useState } from "react";
import { CalendarClock, Link2, Paperclip, Receipt, Undo2, Unlink, Wallet, XCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import ReasonDialog from "@/components/ui/ReasonDialog";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import RowActionMenu from "@/components/ui/RowActionMenu";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import InstallmentConfirmDialog from "./InstallmentConfirmDialog";
import { WON_DOC_TYPE_LABELS } from "@/lib/sales/quotationWonEvidence";
import {
  INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES, MIN_REJECT_REASON,
  installmentActionError, installmentDisplayStatus, installmentPlanDrift, installmentPrepaid,
  installmentReportOutcome, paymentNotRequired, paymentRollup, previewInstallments,
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
  const [confirmFor, setConfirmFor] = useState(null);
  const [linkFor, setLinkFor] = useState(null);

  const saved = Array.isArray(installments) ? installments : [];
  const rows = saved.length ? saved : previewInstallments(order?.quotation?.paymentPlan, order?.totalAmount);
  const isPreview = !saved.length;
  const single = rows.length === 1;
  const rollup = paymentRollup(saved, todayIso);
  /* ⭐ **งวดร่าง** (B-4) — มีตัวตนจริง กรอกกำหนดชำระได้ และ **บันทึกเงินที่ลูกค้าจ่าย
     มาแล้วได้** (มติผู้ใช้ 2026-08-19) ⇒ สิ่งเดียวที่ยังทำไม่ได้คือส่งให้บัญชีตรวจ
     เพราะงานถึงบัญชีต่อเมื่อ AE Supervisor อนุมัติใบแล้วเท่านั้น
     ⚠️ ต่างจาก `isPreview` ซึ่งคือ "ยังไม่มีแถวเลย" — สองสถานะนี้หน้าตาใกล้กันมาก
     แต่กดได้คนละอย่าง จึงต้องแยกชื่อให้ชัดตั้งแต่ตัวแปร */
  const draftRows = saved.filter((r) => !r.frozenAt);
  const isDraftPlan = saved.length > 0 && draftRows.length === saved.length;
  const drift = installmentPlanDrift(saved, order?.quotation?.paymentPlan, order?.totalAmount);
  // มีเงินบันทึกไว้แล้ว = freeze จะไม่ตั้งงวดใหม่ทับ (ดู `freezeInstallments`) ⇒ คำเตือนคนละใจความ
  const hasPrepaid = saved.some(installmentPrepaid);
  // ใบที่ยกเลิก/ตีกลับไม่มีอะไรให้ติดตาม — ด่านเดียวกับที่ route ของงวดใช้
  const canTrackPayments = !["cancelled", "rejected"].includes(order?.status);

  /* ── คำร้องขอเอกสารการเงินของใบเสนอราคาเดียวกัน (B-5) ────────────────────
     ⚠️ **ไม่จับคู่ให้อัตโนมัติ** — คำร้องเกิดตั้งแต่ตอนมีแค่ QT ส่วนงวดเกิดจาก SO
     เดาจาก % ที่ใกล้เคียงเมื่อไร ใบวางบิลจะไปแขวนผิดงวดโดยไม่มีใครรู้ (ม-ค) */
  const billingRequests = Array.isArray(order?.billingRequests) ? order.billingRequests : [];
  const requestById = new Map(billingRequests.map((r) => [r.id, r]));
  const linkedIds = new Set(saved.map((r) => r.billingRequestId).filter(Boolean));
  const linkableRequests = billingRequests.filter((r) => !linkedIds.has(r.id));
  /* ลิงก์เปิดคำร้องใหม่แบบเติมค่าให้แล้ว — ⚠️ **เติมค่าไม่ใช่ปลดด่าน** ฟอร์มกับ POST
     ยังตรวจครบทุกข้อ (ใบต้องอนุมัติแล้ว · ยอดต้องไม่เกินใบ) เหมือนเปิดเองจาก /requests */
  const newBillingRequestHref = (row) => {
    const params = new URLSearchParams({
      kind: "billing_doc",
      quotationId: order?.quotationId || "",
      salesOrderId: order?.id || "",
      billAmount: String(row?.amount ?? ""),
      returnTo: `/sales-planning/sales-orders/${order?.id || ""}`,
    });
    return `/requests/new?${params.toString()}`;
  };

  const quotation = order?.quotation;
  const wonFiles = Array.isArray(quotation?.wonAttachments) ? quotation.wonAttachments : [];
  // ⚠️ ส่ง `rows` เข้าไปด้วยเสมอ — ด่าน "งวดต้องไล่ลำดับ" (2026-08-18) ต้องเห็นงวดอื่น
  // ไม่ส่ง = ปุ่มบนจอจะเปิดให้กดงวดที่ API จะตีกลับ
  const gate = (row, action, options) => installmentActionError(row, action, user, {
    ...options, rows, orderTotal: order?.totalAmount,
  });
  /* งวดร่าง = บันทึกเก็บไว้ ยังไม่ส่งให้บัญชี (มติผู้ใช้ 2026-08-19)
     ⚠️ ตัดสินจากฟังก์ชันเดียวกับที่ route ใช้เขียนสถานะจริง — เขียนเงื่อนไข
     `!row.frozenAt` ซ้ำที่นี่เมื่อไร คำบนจอกับผลของ API แยกกันเดินทันที */
  const prepayMode = (row) => installmentReportOutcome(user, row) === "pending";

  const headline = isPreview
    ? `แผนจากใบเสนอราคา${single ? "" : ` · ${rows.length} งวด`}`
    : isDraftPlan
      ? `ร่างกำหนดชำระ${single ? "" : ` · ${rows.length} งวด`} — ยอดยืนยันตอนใบอนุมัติ`
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

  /* ── ใบยอด 0 จบที่อนุมัติใบ (มติผู้ใช้ 2026-08-18) ────────────────────────
     ไม่มีเงินให้เก็บ ⇒ ไม่มีงวด ไม่มีการแจ้ง/ยืนยัน · การ์ดยังอยู่เพื่อ **บอกว่าทำไม
     ไม่มีอะไรให้ทำ** ไม่ใช่ซ่อนทั้งการ์ด — การ์ดที่หายไปเฉย ๆ อ่านเหมือนระบบลืม
     ⚠️ ใบเก่าที่มีงวดค้างอยู่แล้ว (สร้างก่อนมติ) ยังโชว์ตารางตามเดิม ไม่กลืนของเดิมทิ้ง */
  const noPaymentStep = paymentNotRequired(order?.totalAmount);
  if (noPaymentStep && !saved.length) {
    return (
      <DetailCard id="payment" icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta="ยอด 0 — ไม่ต้องยืนยันการชำระ">
        <StatusNotice tone="info">
          ใบนี้ยอดรวม 0 บาท จึงไม่มีงวดชำระให้ติดตาม — จบที่ขั้นอนุมัติใบสั่งขาย
        </StatusNotice>
      </DetailCard>
    );
  }

  return (
    <DetailCard id="payment" icon={Wallet} eyebrow="PAYMENT" title="การชำระ" meta={headline}>
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
          {WON_DOC_TYPE_LABELS[quotation?.wonDocType] || naText(quotation?.wonDocType)}
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

      {/* ⭐ ใบยอด 0 ที่ออกก่อนมติ 2026-08-18 ยังมีงวดค้างอยู่ — **ไม่ลบประวัติทิ้ง**
          แต่ปุ่มทุกตัวถูกปิดที่ `installmentActionError` แล้ว ⇒ ต้องบอกว่าทำไมกดอะไรไม่ได้
          ไม่งั้นคนจะคิดว่าสิทธิ์ตัวเองหาย */}
      {noPaymentStep ? (
        <StatusNotice tone="info">
          ใบนี้ยอดรวม 0 บาท — ไม่มีขั้นยืนยันการชำระแล้ว (จบที่การอนุมัติใบ)
          · งวดด้านล่างเก็บไว้เป็นประวัติของใบที่ออกก่อนหน้านี้
        </StatusNotice>
      ) : null}

      {alert ? <StatusNotice tone="error">{alert}</StatusNotice> : null}

      {/* ⭐ บอกให้ตรงว่างวดร่างทำอะไรได้/ไม่ได้ — ไม่งั้นคนจะหาปุ่ม "แจ้งลูกค้าจ่ายแล้ว"
          ที่หายไปแล้วสรุปเองว่าระบบพัง (ด่านที่ไม่บอกเหตุผลคือด่านที่คนหาทางอ้อม) */}
      {isDraftPlan ? (
        <StatusNotice tone="info">
          กรอกกำหนดชำระและบันทึกเงินที่ลูกค้าจ่ายมาแล้วได้เลยตั้งแต่ตอนนี้ —
          ยอดต่องวดยังเดินตามใบเสนอราคาและจะถูกยืนยันตอนใบสั่งขายอนุมัติ ·
          ที่บันทึกไว้จะถูกส่งให้บัญชีตรวจเองตอนนั้น
        </StatusNotice>
      ) : null}

      {/* ⚠️ จำนวนงวดไม่ตรงแผนล่าสุด — ทับยอดอย่างเดียวแก้ไม่ได้ ต้องบอกว่าจะเกิดอะไร */}
      {drift ? (
        <StatusNotice tone="warning">
          ใบเสนอราคาถูกแก้เป็น {drift.planned} งวด แต่ที่ตั้งไว้มี {drift.tracked} งวด —
          {hasPrepaid
            ? " มีงวดที่บันทึกการจ่ายไว้แล้ว ระบบจะไม่ตั้งงวดใหม่ทับ (ไม่ทำหลักฐานหาย) ⇒ ต้องแก้จำนวนงวดให้ตรงกันเอง ก่อนอนุมัติใบ"
            : " ตอนใบอนุมัติ ระบบจะตั้งงวดใหม่ตามแผนล่าสุด (กำหนดชำระที่กรอกไว้จะหายไป)"}
        </StatusNotice>
      ) : null}

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
                const rowStatus = installmentDisplayStatus(row);
                /* บัญชีกดปุ่มเดียวกันแต่จบในก้าวเดียว (มติผู้ใช้ 2026-08-18 — ทางเลือก ก.)
                   ⇒ คำบนปุ่มต้องบอกผลจริง ไม่ใช่ "แจ้ง" ที่แปลว่ารอคนอื่นมาตรวจ
                   ⭐ งวดร่างจอดที่ `pending` ไม่ว่าใครกด (มติผู้ใช้ 2026-08-19) ⇒ คำบนปุ่ม
                   ต้องไม่สัญญาว่าส่งให้บัญชีแล้ว มันแค่ **บันทึกไว้** รอใบอนุมัติ */
                const outcome = installmentReportOutcome(user, row);
                const reportsAsConfirmed = outcome === "confirmed";
                const parksAsDraft = outcome === "pending";
                const primary = canReport
                  ? { label: parksAsDraft
                        ? "บันทึกว่าลูกค้าจ่ายแล้ว"
                        : reportsAsConfirmed
                          ? "บันทึกการรับชำระ"
                          : row.status === "rejected" ? "แจ้งใหม่" : "แจ้งลูกค้าจ่ายแล้ว",
                      onClick: () => setReportFor({ row, paidOn: todayIso, files: [] }) }
                  : canConfirm
                    ? {
                      label: "บัญชีคอนเฟิร์ม",
                      /* ⚠️ ถอนคืนไม่ได้จริง ๆ — ไม่มี action un-confirm และงวดที่คอนเฟิร์มแล้ว
                         ล็อกใบไม่ให้ย้อนการอนุมัติ/ออก Rev. (ดู paymentLockReason)
                         ⇒ ต้องถามก่อนเสมอ (มติผู้ใช้ 2026-08-13) */
                      /* ⭐ โมดัลตัวเดียวกับคิวบนทะเบียนการชำระ (มติผู้ใช้ 2026-08-13) —
                         และมัน **โชว์หลักฐานก่อนกด** ซึ่งของเดิมไม่มี ทั้งที่หน้านี้เป็น
                         ที่ที่หลักฐานอยู่ · เขียนสองชุดเมื่อไรมันเพี้ยนหากัน (AGENTS.md) */
                      onClick: () => setConfirmFor({ row }),
                    }
                    : null;

                const menu = row.preview ? [] : [
                  !gate(row, "schedule") && {
                    id: "schedule", icon: CalendarClock,
                    label: row.dueDate ? "แก้กำหนดชำระ" : "ตั้งกำหนดชำระ",
                    onClick: () => setScheduleFor({ row, dueDate: row.dueDate || "" }),
                  },
                  !gate(row, "withdraw") && {
                    id: "withdraw", icon: Undo2, tone: "warning",
                    // งวดร่างยังไม่ได้ส่งให้ใคร ⇒ "ดึงกลับ" ไม่ตรงกับสิ่งที่เกิดจริง
                    label: installmentPrepaid(row) ? "ลบบันทึกการจ่าย" : "ดึงกลับการแจ้งชำระ",
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
                  /* ── คำร้องขอเอกสารการเงิน (B-5) ────────────────────────────
                     ⭐ **สองทางเข้า คนละสถานการณ์** — ยังไม่เคยขอ = เปิดใบใหม่ ·
                     ขอไปแล้วตั้งแต่ตอนมีแค่ QT = แนบใบที่มีอยู่ (คำร้องเกิดก่อนงวดเสมอ)
                     ⚠️ ทั้งคู่อยู่ในเมนู `⋯` ไม่ใช่ปุ่มหลัก — ก้าวถัดไปของงวดคือเรื่องเงิน
                     ส่วนเอกสารเป็นแกนคู่ขนานที่ไม่ได้ทำให้งวดเดินหน้า */
                  !row.billingRequestId && !gate(row, "link", { billingRequestId: "x" }) && {
                    id: "ask-doc", icon: Receipt, label: "ขอใบวางบิลงวดนี้",
                    href: newBillingRequestHref(row),
                  },
                  !row.billingRequestId && linkableRequests.length > 0
                    && !gate(row, "link", { billingRequestId: "x" }) && {
                    id: "link-doc", icon: Link2, label: "แนบคำร้องที่ขอไว้แล้ว",
                    onClick: () => setLinkFor({ row, billingRequestId: "" }),
                  },
                  !gate(row, "unlink") && {
                    id: "unlink-doc", icon: Unlink, tone: "warning", label: "ถอดคำร้องออกจากงวด",
                    onClick: () => onAction(row, "unlink"),
                  },
                ].filter(Boolean);

                return (
                  <Fragment key={row.id || `preview-${row.seq}`}>
                  <tr>
                    {single ? null : <td className={styles.seqCol}>{row.seq}</td>}
                    <td>
                      <strong>{row.label}</strong>
                      {single ? null : <small>{row.percent}%</small>}
                      {/* ⭐ คำร้องขอเอกสารที่ครอบงวดนี้ (B-5) — โชว์ **เลขที่เอกสารที่บัญชี
                          ออกให้จริง** ไม่ใช่แค่เลขคำร้อง เพราะสิ่งที่ SA เอาไปคุยกับลูกค้า
                          คือเลขใบวางบิล · ตามกลับไม่เจอ = คำร้องถูกลบ ต้องบอกตรง ๆ */}
                      {row.billingRequestId ? (() => {
                        const linked = requestById.get(row.billingRequestId);
                        if (!linked) return <small className={styles.overdue}>คำร้องขอเอกสารถูกลบไปแล้ว</small>;
                        const issued = (linked.items || [])
                          .map((it) => it.docNumber).filter(Boolean);
                        return (
                          <small>
                            <a className="linklike" href={`/requests/${linked.id}`}>
                              {linked.docNo || "คำร้องขอเอกสาร"}
                            </a>
                            {issued.length ? ` · ${issued.join(" · ")}` : " · รอบัญชีออกเอกสาร"}
                          </small>
                        );
                      })() : null}
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
                      ) : <span className={styles.none}>{NA}</span>}
                    </td>
                    <td>
                      {/* ⚠️ อ่านจาก `installmentDisplayStatus` ไม่ใช่ `row.status` ตรง ๆ —
                          งวดร่างที่บันทึกเงินไว้แล้วยังเป็น `pending` ใน DB (CHECK ของ 0259)
                          ป้าย "รอชำระ" บนงวดที่มีสลิปแนบอยู่คือจอที่โกหก */}
                      <StatusBadge
                        size="sm"
                        tone={row.preview ? "neutral" : (INSTALLMENT_STATUS_TONES[rowStatus] || "neutral")}
                        label={row.preview ? "ยังไม่เริ่มติดตาม" : (INSTALLMENT_STATUS_LABELS[rowStatus] || rowStatus)}
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

      {/* ⭐ **ปุ่มนี้เป็นทางกู้ ไม่ใช่ก้าวปกติ** (มติผู้ใช้ 2026-08-19) — งวดถูกสร้างให้
          ตั้งแต่ตอนออกใบจาก QT แล้ว (ดู POST `/api/sales-planning/sales-orders`)
          ⇒ ปกติจะไม่เห็นปุ่มนี้เลย · ที่ยังเหลือไว้เพราะมีสามทางที่ทำให้ใบไม่มีแถว:
          ใบเก่าที่อนุมัติไปก่อน B-4 · QT ที่ยังไม่มีแผนชำระตอนออกใบแล้วมาเพิ่มทีหลัง ·
          และตอนออกใบสร้างไม่สำเร็จ (ตรงนั้นกลืน error ไว้ไม่ให้ล้มทั้งการออกใบ)
          ⚠️ ใบที่ยกเลิก/ตีกลับไม่มีอะไรให้ติดตาม — ด่านเดียวกับที่ route ใช้ */}
      {isPreview && canStart && canTrackPayments ? (
        <>
          <Button tone="accent" size="sm" className={styles.start} onClick={onStart} disabled={!!busy}>
            {busy === "start-payments" ? "กำลังสร้าง…" : "เริ่มติดตามการชำระ"}
          </Button>
          {order?.status !== "approved" ? (
            <p className="form-note">
              ใบนี้ยังไม่มีงวดให้ติดตาม — กดเพื่อยกแผนชำระจากใบเสนอราคามาตั้งเป็นงวด
              แล้วจะได้ช่องกำหนดชำระรายงวดไว้กรอกตอนคุยกับลูกค้า
            </p>
          ) : null}
        </>
      ) : null}

      {reportFor ? (
        <Modal open onClose={() => setReportFor(null)}
          title={prepayMode(reportFor.row)
            ? (single ? "บันทึกว่าลูกค้าจ่ายแล้ว" : `บันทึกการจ่าย งวดที่ ${reportFor.row.seq}`)
            : (single ? "แจ้งลูกค้าจ่ายแล้ว" : `แจ้งชำระ งวดที่ ${reportFor.row.seq}`)}
          size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            {/* ⭐ งวดร่างต้องบอกให้ครบว่า "เก็บไว้แล้วเกิดอะไรต่อ" — ไม่งั้นคนกดจะรอคิว
                บัญชีที่ยังไม่มี แล้วโทรตามว่าทำไมบัญชีไม่ตรวจสักที (มติผู้ใช้ 2026-08-19) */}
            <p className="form-note">
              {prepayMode(reportFor.row)
                ? `ยอด ${fmtMoney(reportFor.row.amount)} (ยังไม่ยืนยันจนกว่าใบจะอนุมัติ) — เก็บวันจ่ายกับหลักฐานไว้ก่อน ระบบจะส่งให้บัญชีตรวจเองตอนใบสั่งขายอนุมัติ`
                : `ยอด ${fmtMoney(reportFor.row.amount)} — บัญชีจะตรวจหลักฐานก่อนรับรอง`}
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
                  const done = await onAction(reportFor.row, "report", { paidOn: reportFor.paidOn, files: reportFor.files });
                  if (done) setReportFor(null);
                }}>
                {busy ? "กำลังบันทึก…" : (prepayMode(reportFor.row) ? "บันทึกไว้" : "ส่งให้บัญชีตรวจ")}
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

      {/* ⭐ แนบคำร้องที่ขอไว้แล้ว (B-5) — โชว์ **ยอดของคำร้อง** คู่กับยอดของงวดเสมอ
          เพราะสองอย่างนี้ไม่จำเป็นต้องเท่ากัน (ขอวางบิลรวมสองงวดก็มี) ⇒ คนกดต้องเห็น
          ทั้งคู่ก่อนตัดสิน ไม่ใช่ให้ระบบเดาว่าอันไหนคู่กัน */}
      {linkFor ? (
        <Modal open onClose={() => setLinkFor(null)} title="แนบคำร้องขอเอกสารการเงิน" size="sm" dismissible={!busy}>
          <div className={styles.dialog}>
            <p className="form-note">
              งวดที่ {linkFor.row.seq} · {fmtMoney(linkFor.row.amount)} — เลือกคำร้องของใบเสนอราคาเดียวกันนี้
            </p>
            <label className={styles.field}>
              <span>คำร้อง</span>
              <SearchableSelect
                value={linkFor.billingRequestId}
                onChange={(v) => setLinkFor((f) => ({ ...f, billingRequestId: v }))}
                options={linkableRequests.map((r) => ({
                  value: r.id,
                  label: [r.docNo || "ร่าง", r.title, r.billAmount ? fmtMoney(r.billAmount) : null]
                    .filter(Boolean).join(" · "),
                  search: `${r.docNo || ""} ${r.title || ""}`,
                }))}
                placeholder="เลือกคำร้อง"
                emptyText="ไม่มีคำร้องที่ยังไม่ถูกแนบ"
                ariaLabel="คำร้องขอเอกสารการเงินที่จะแนบ"
              />
            </label>
            <div className="action-bar">
              <Button variant="ghost" onClick={() => setLinkFor(null)} disabled={!!busy}>ยกเลิก</Button>
              <Button tone="accent" disabled={!!busy || !linkFor.billingRequestId}
                onClick={async () => {
                  const done = await onAction(linkFor.row, "link", { billingRequestId: linkFor.billingRequestId });
                  if (done) setLinkFor(null);
                }}>แนบ</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ⚠️ ถอนคำรับรอง = กลับคำเรื่องเงินที่เคยบอกว่ารับแล้ว และปลดล็อกใบให้ยกเลิก
          อนุมัติ/ออก Rev. ได้ด้วย ⇒ ต้องมีเหตุผลเท่ากับตอนตีกลับ ไม่ใช่กดแล้วจบ */}
      <InstallmentConfirmDialog
        open={!!confirmFor}
        row={confirmFor?.row}
        order={order}
        multi={rows.length > 1}
        busy={!!busy}
        onClose={() => setConfirmFor(null)}
        onConfirm={async (target) => {
          const done = await onAction(target, "confirm");
          if (done) setConfirmFor(null);
        }}
      />

      <ReasonDialog
        open={!!unconfirmFor}
        title="ถอนคำรับรองการชำระ"
        description="งวดนี้จะกลับไปเป็น “รอบัญชีตรวจ” — หลักฐานและคำแจ้งของฝ่ายขายยังอยู่ครบ และใบนี้จะย้อนการอนุมัติ/ออก Rev. ได้อีกครั้ง"
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
