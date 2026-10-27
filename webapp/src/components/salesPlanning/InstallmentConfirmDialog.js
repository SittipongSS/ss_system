"use client";
// ── โมดัล "บัญชีรับรองว่าเงินเข้าแล้ว" — ใช้ร่วมทุกที่ที่กดรับรองงวดได้ ────────
//
// มติผู้ใช้ 2026-08-13: คิวรับรองย้ายขึ้นมาอยู่บนหน้าทะเบียนการชำระด้วย
// ⇒ ตอนนี้มี **สองจอ** ที่กดรับรองได้ (การ์ดบนใบ SO · คิวบนทะเบียน)
//
// ⭐ **หนึ่งโมดัล สองทางเรียก** ตามกฎของโปรเจกต์ (AGENTS.md "ปุ่มแก้ไขต้องเปิดฟอร์ม
// ตัวเดียวกับตอนสร้าง") — เขียนสองชุดเมื่อไรมันเพี้ยนหากันเสมอ และที่นี่เจ็บเป็นพิเศษ
// เพราะเป็นการรับรองว่า **เงินเข้าจริง** — ถอยได้ทางเดียวคือบัญชี "ถอนคำรับรอง" พร้อมเหตุผล
// (action `unconfirm` · มติผู้ใช้ 2026-08-13) ไม่ใช่กดผิดแล้วแก้เองได้
//
// ⭐ **โชว์หลักฐานก่อนให้กด** — ความเสี่ยงที่ยกไว้ตอนตัดสินใจย้ายคิวขึ้นมาคือ
// *"คนกดคอนเฟิร์มจะมองไม่เห็นหลักฐานที่แนบมากับงวดซึ่งอยู่บนใบ"* · โมดัลนี้คือคำตอบ
// ⇒ การ์ดบนใบ SO ก็ได้ประโยชน์ด้วย เดิมมันถามยืนยันโดยไม่โชว์อะไรเลย
//
// ⚠️ ข้อความ/คำเตือนมาจาก `paymentConfirmPrompt` ตัวเดียวกับทั้งระบบ — ห้ามเขียนคำเอง
//    ประกอบผ่าน `installmentConfirmPrompt` (export ข้างล่าง) — โมดัลแจ้งชำระของแผงงวดเรียกตัวเดียวกัน
//    ตอนบัญชีกด "บันทึกการรับชำระ" (แจ้ง+รับรองในก้าวเดียว) ⇒ ผลลัพธ์ที่บอกก่อนกดเป็นชุดเดียวกันทั้งสองทาง
//
// ⭐ **ใบสั่งขายย้อนหลัง (มติ 22/09 · mock FnConfirm + REVISION 2)** — โมดัลตัวเดิม ไม่ใช่โมดัลที่สอง
//   ต่างแค่ "โหมด" ผ่าน props: ผลลัพธ์ชุดของใบย้อนหลัง (ไม่มีบรรทัด Rev./Actual · จ่ายถึง · งวดถัดไป) และแถวที่
//   บัญชีต้องเห็นก่อนรับรองเงินที่เก็บมาก่อนเข้าระบบ: ใบผ่าน AE Sup แล้วหรือยัง · เก็บแล้วเท่าไรจากยอดใบ · หมายเหตุจาก SA
//   ⚠️ แถว "อนุมัติใบ" **ขึ้นเสมอ** กับใบย้อนหลัง แม้ข้อมูลไม่มา (ขีด) — แถวที่หายไปเงียบ ๆ อ่านเหมือน "ไม่มีเรื่องต้องตรวจ"
//
// ⭐ **ใบ "Actual รายงวด" (mig 0412 · มติเจ้าของ 26/10/2026)** — โหมดของโมดัลตัวเดิมเช่นกัน: บรรทัด Actual ของผลลัพธ์บอกว่า
//   งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด (คำเดิม "ยอดเต็มตั้งแต่ใบอนุมัติ" เป็นเท็จกับใบนี้) + แถว "นับ Actual" (ยอดก่อน VAT · เดือน)
//   · งวดที่ AE Sup ยังไม่อนุมัติรับรองไม่ได้ (ปุ่มดับ + เหตุ — ข้อความเดียวกับ trigger ของ 0412)
import { Paperclip } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import { fmtDate, fmtMoney, fmtPercent, naText, NA } from "@/lib/format";
import { FN_SERVICE_GATE_UNREAD_MODAL, paymentConfirmPrompt } from "@/lib/approvalPrompt";
import { OPENING_INSTALLMENT_LABEL, isOpeningInstallment } from "@/lib/sales/historicalOrders";
import { openingInvoiceNote } from "@/lib/sales/taxInvoice";
import {
  installmentActualAutoCounted, installmentActualCountedLate, installmentActualLockReason, installmentActualMonth,
} from "@/lib/sales/salesOrderActualMode";
import { formatMonthLabel } from "@/lib/datePeriods";
import styles from "./InstallmentConfirmDialog.module.css";

/**
 * ข้อความของการรับรองงวดนี้ — ตัวเดียวที่ทั้งโมดัลรับรองและโมดัล "บันทึกการรับชำระ" ของบัญชี (แผงงวด) ใช้
 * @param row        งวดที่จะรับรอง (`seq` · `label` · `amount` · `coversTo`)
 * @param multi      true = ใบนี้แบ่งหลายงวด ⇒ ชื่องวดเป็น "งวดที่ n"
 * @param historical งวดของใบสั่งขายย้อนหลัง · @param opening งวดยกมา (ตั้งต้นอ่านจากแถว)
 * @param outlook    ภาพหลังรับรองจาก `installmentConfirmOutlook` (ไม่ส่ง = ถอยไปใช้ช่วงครอบของแถวนี้)
 * @param orderStatus สถานะใบ — ไม่ส่ง = คำของใบที่อนุมัติอยู่ (ภาพนิ่งเดิม) · ผู้เรียกทุกทางส่ง (แผงงวด · คิวบนทะเบียน)
 * @param serviceZones จำนวนโซนของรอบขายที่มีผลของใบ (server นับ — GET ใบ `serviceTermZones` / แถวทะเบียน · PR-C C5)
 *                     0/ไม่รู้ = ไม่มีบรรทัดด่านเงินของนัดบริการ
 * @param serviceContractLinked ใบผูกสัญญาแล้วไหม — ไม่ส่ง = true (ไม่รู้ ⇒ ไม่พูดเรื่องสัญญา)
 * @param actualMode แบบการนับ Actual ของใบ (mig 0412) — 'installment' = งวดนี้นับ Actual ไปแล้วตอน AE Sup อนุมัติงวด
 *                   (ไม่ใช่ "ยอดเต็มตั้งแต่ใบอนุมัติ") · ไม่ส่ง = ทั้งใบ (คำเดิม)
 * @param orderApprovedAt เวลาอนุมัติใบ — แยกงวด `so_approval` ที่นับตอนคลิกอนุมัติ (เวลาเท่ากันพอดี) ออกจากที่ปุ่มกู้ "นับงวด 1" นับทีหลัง
 *                   (review รอบหก 27/10) · ไม่ส่ง = อ่าน `row.orderApprovedAt` (แถวทะเบียน) · ไม่รู้ = คำเดิม
 */
export function installmentConfirmPrompt({
  actualMode = 'order', orderApprovedAt = null,
  row, multi = false, historical = false, opening = isOpeningInstallment(row), outlook = null, orderStatus = null,
  serviceZones = 0, serviceContractLinked = true,
} = {}) {
  const label = opening ? OPENING_INSTALLMENT_LABEL : multi ? `งวดที่ ${row?.seq}` : (row?.label || "ชำระเต็มจำนวน");
  /* "จ่ายถึง" หลังรับรอง — ไม่มีภาพจากงวดทั้งใบก็ถอยไปปลายช่วงครอบของงวดนี้ (ค่าปกติของมันอยู่แล้ว) */
  const through = outlook?.paidThrough || row?.coversTo || null;
  /* วันที่ด่านเงินของนัดเปิดจริง (review 29/09) — งวดอื่นที่ค้างและครบกำหนดก่อน "จ่ายถึง" กดไว้ได้ (`gateOpenThrough`) */
  const gateThrough = outlook?.gateOpenThrough || through;
  const next = outlook?.next || null;
  return paymentConfirmPrompt({
    label,
    amount: fmtMoney(row?.amount),
    historical,
    opening,
    paidThroughLabel: through ? fmtDate(through) : null,
    nextInstallmentLabel: next
      ? [next.label, fmtMoney(next.amount), next.dueDate ? `ครบกำหนด ${fmtDate(next.dueDate)}` : ""].filter(Boolean).join(" ")
      : null,
    /* บรรทัดด่านเงินของนัดบริการของใบนี้ (PR-C C5 · FN_SERVICE_GATE_LINE) — ใบย้อนหลังไม่ใช้ (มีบรรทัดของตัวเอง)
       ⭐ วันที่พูด = วันที่ด่านเปิดจริง + งวดที่ค้างกดไว้ (review 29/09) — ไม่ใช่ "จ่ายถึง" ตรง ๆ */
    serviceGateThroughLabel: gateThrough ? fmtDate(gateThrough) : null,
    serviceGateHeld: outlook?.gateHeldBy
      ? { seq: outlook.gateHeldBy.seq, dueLabel: fmtDate(outlook.gateHeldBy.dueDate) }
      : null,
    /* ใบ Actual รายงวด (mig 0412) — บรรทัด Actual บอกว่างวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด + ยื่นงวดถัดไปได้หลังรับรอง
       (ชื่องวดถัดไปมาจาก `nextInstallmentLabel` ข้างบน) · ทั้งใบ = คำเดิม
       ⭐ บรรทัด "ยื่นงวดถัดไป" ขึ้นเฉพาะเมื่องวดถัดไปยังต้องยื่นจริง (ยังไม่ยื่น/ถูกตีกลับ) — งวดสุดท้าย · นับที่เหลือทั้งหมดแล้ว ·
         งวดถัดไปยื่น/นับแล้ว = ไม่มีบรรทัดนี้ (review 26/10) */
    actualMode,
    nextNeedsActualSubmit: Boolean(next) && (next.actualStatus == null || next.actualStatus === "rejected"),
    /* ทางที่งวดนี้ถูกนับ — บรรทัด Actual บอก "นับตอนไหน" ตามจริง (อนุมัติงวด · อนุมัติใบ · นับที่เหลือทั้งหมด · ระบบนับเอง — UAT FN 27/10 ข้อ 4)
       ⚠️ แถวทะเบียนพก `actualApprovedVia`/`actualNote` (ledgerRow) · แถวบนแผงงวดคือแถวดิบของฐาน */
    actualApprovedVia: row?.actualStatus === "approved" ? row?.actualApprovedVia || null : null,
    actualAutoCounted: installmentActualAutoCounted(row),
    /* 🐞 review รอบหก 27/10: `so_approval` ที่ลงเวลา **หลัง** เวลาอนุมัติใบ = ปุ่มกู้ "นับงวด 1"/"นับงวดที่ค้าง" (RPC ลงเวลาที่กด) ไม่ใช่คลิกอนุมัติ
       (route ส่งเวลาอนุมัติให้ RPC ⇒ เท่ากันพอดี · Rev. ที่รับงวดนับแล้วมา = เวลาเก่ากว่า · ยกเงิน C2b ลอกเวลาของงวดที่ถูกแทน)
       ⇒ บรรทัด Actual ไม่อ้าง "ตอนอนุมัติใบ" (แถว "นับ Actual" ของโมดัลเดียวกันโชว์เดือนที่กด) */
    actualCountedLate: installmentActualCountedLate(row, orderApprovedAt ?? row?.orderApprovedAt ?? null),
    serviceZoneCount: serviceZones,
    serviceContractLinked,
    /* สถานะใบ (review UI-1) — ใบยกเลิก/ย้อนการอนุมัติ/Rev. ที่ยังไม่อนุมัติ พูดผลคนละชุดกับใบที่อนุมัติอยู่ (เงินค้าง · Actual) */
    orderStatus,
  });
}

/* แถว "นับ Actual" ของใบรายงวดที่ไม่ได้อนุมัติอยู่ — ตรงกับผลลัพธ์ของ pipelineConfirmEffects (ใบที่ยกเลิก/ย้อนอนุมัติไม่นับ Actual) */
const ACTUAL_NOT_LIVE_TEXT = Object.freeze({
  cancelled: "ไม่นับ — ใบยกเลิกแล้ว",
  approval_revoked: "ไม่นับ — ใบถูกย้อนการอนุมัติ (รอออก Rev.)",
  other: "ไม่นับ — ใบไม่ได้อยู่ในสถานะอนุมัติ",
});

/**
 * @param row        งวดที่จะรับรอง — ต้องมี `id` · `seq` · `label` · `amount` และควรมี
 *                   `paidOn` · `reportedByName` · `evidence[{index,fileName}]` · `kind` · `note`
 * @param order      ใบต้นทางเท่าที่มี — `id` (ใช้ทำลิงก์ไฟล์) · `orderNumber` · `customerName`
 *                   ใบย้อนหลังควรมี `totalAmount` · `approvedByName` · `approvedAt` · `historicalInvoiceRef`
 * @param multi      true = ใบนี้แบ่งหลายงวด ⇒ พาดหัวต้องบอก "งวดที่ n"
 * @param historical งวดของใบสั่งขายย้อนหลัง (ผู้เรียกตัดสินด้วย isHistoricalOrder)
 * @param opening    งวดยกมา — ตั้งต้นอ่านจากแถว (`kind`)
 * @param outlook    ภาพหลังรับรอง `{ paidThrough, collected, next }` จาก `installmentConfirmOutlook`
 *                   (คิดจากงวดทั้งใบ — ทะเบียนประทับมาจากก่อนกรอง) · ไม่ส่ง = ถอยไปใช้ค่าของแถวนี้เอง
 */
export default function InstallmentConfirmDialog({
  open, row, order, multi = false, busy = false, error = "", onClose, onConfirm,
  historical = false, opening = isOpeningInstallment(row), outlook = null,
}) {
  if (!open || !row) return null;
  /* จำนวนโซน/ธงสัญญาของบรรทัดด่านเงิน (PR-C C5): ใบจาก GET ใบ (หน้าใบ) ก่อน แถวทะเบียนรอง (หน้าทะเบียนส่งทั้งสองทาง)
     ⚠️ GET อ่านรอบขายไม่ขึ้น = `serviceTermZones: null` ⇒ 0 ⇒ ไม่มีบรรทัด (ไม่ใช่ "0 โซน") — แต่โมดัลบอกว่าไม่รู้
        (`serviceTermZonesError` → แถบเหลืองใต้คำนำ · review 29/09) ไม่ปล่อยให้หน้าตาเหมือนใบที่ไม่มีโซน */
  /* แบบการนับ Actual ของใบ (mig 0412): ใบจาก GET ใบ (หน้าใบ) ก่อน แถวทะเบียนรอง (`actualMode` ของ ledgerRow = แบบของใบ) — ไม่รู้ = ทั้งใบ (คำเดิม) */
  const actualMode = order?.actualMode ?? row.actualMode ?? "order";
  const prompt = installmentConfirmPrompt({
    row, multi, historical, opening, outlook, actualMode, orderStatus: order?.status ?? row.orderStatus ?? null,
    orderApprovedAt: order?.approvedAt ?? row.orderApprovedAt ?? null,
    serviceZones: Number(order?.serviceTermZones ?? row.serviceTermZones) || 0,
    serviceContractLinked: order?.serviceContractLinked ?? row.serviceContractLinked ?? true,
  });
  const orderTotal = order?.totalAmount ?? row.orderTotal ?? null;
  const collected = outlook ? outlook.collected : Number(row.amount) || 0;
  const invoiceRef = String(order?.historicalInvoiceRef || row.historicalInvoiceRef || "").trim();
  /* ⚠️ รับได้สองรูป — การ์ดบนใบส่งแถวดิบจาก DB (`{fileName, storagePath}`) ส่วนทะเบียน
     ส่งรูปที่ตัด path ออกแล้ว (`{index, fileName}`) · normalize ที่นี่ที่เดียว
     ไม่ให้ผู้เรียกต้องรู้ว่าอีกฝั่งส่งอะไร */
  const files = (Array.isArray(row.evidence) ? row.evidence : []).map((file, i) => ({
    index: file?.index ?? i,
    fileName: file?.fileName || `หลักฐาน ${i + 1}`,
  }));
  const orderId = order?.id || row.orderId;
  /* ⭐ ใบ Actual รายงวด (mig 0412): บัญชีรับรองได้หลัง AE Sup อนุมัติงวด (trigger ของ 0412 กันอีกชั้น) — โมดัลบอกว่างวดนี้นับ Actual
     เท่าไร เดือนไหน · งวดที่ยังไม่อนุมัติ = แถวบอกเหตุ + ปุ่มยืนยันดับ (ผู้เรียกไม่ควรเปิดโมดัลนี้ให้งวดแบบนั้นอยู่แล้ว —
     แผงงวด/คิวทะเบียนถามด่านเดียวกันก่อน) · ⚠️ ดับเฉพาะเมื่อแถวพก `actualStatus` มาจริง (แถวทะเบียนรุ่นที่ยังไม่พก = ไม่เดา)
     ⛔ ใบที่ยกเลิกไม่ติดด่านนี้ (installmentActualPaymentGated · trigger ของ 0412 — รับรองแล้วคืนเงินได้ · review 26/10) */
  const installmentActual = actualMode === "installment" && !historical;
  /* 🐞 review รอบสอง 26/10: แถว "นับ Actual" เคยอ่านแค่แบบของใบ — ใบยกเลิก/ย้อนอนุมัติ (แบบค้างเป็นรายงวด) โชว์ "นับ Actual ฿x · เดือน"
     ทั้งที่ผลลัพธ์ข้างล่างบอก "ใบนี้ไม่นับ Actual" · หรือ "ยังไม่อนุมัติงวด" ทั้งที่ไม่มีใครอนุมัติได้แล้ว ⇒ ใบที่ไม่ได้อนุมัติอยู่ = บอกว่าไม่นับ
     (ไม่รู้สถานะใบ = ถือว่าอนุมัติอยู่ — คำเดิม) */
  const orderStatus = order?.status ?? row.orderStatus ?? null;
  const actualLive = !orderStatus || orderStatus === "approved";
  const actualMonth = installmentActual && actualLive && row.actualStatus === "approved" ? installmentActualMonth(row, order) : null;
  const orderCancelled = orderStatus === "cancelled";
  const actualBlocked = installmentActual && !orderCancelled && "actualStatus" in row && row.actualStatus !== "approved";

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={prompt.title} size="sm">
      <div className={styles.body}>
        <p className={styles.lead}>{prompt.description}</p>
        {/* อ่านรอบขายของใบไม่ขึ้น (หน้าใบ · `serviceTermZonesError`) — รายการผลลัพธ์จะขาดบรรทัดด่านเงินของนัดบริการ ⇒ บอก ไม่เงียบ
            (review 29/09) · ใบย้อนหลังมีบรรทัดของตัวเอง ไม่อ่านจำนวนโซนนี้ · ทะเบียนการชำระโยนเมื่ออ่านไม่ขึ้น ⇒ ไม่มีช่องนี้ */}
        {order?.serviceTermZonesError && !historical ? <StatusNotice tone="warning">{FN_SERVICE_GATE_UNREAD_MODAL}</StatusNotice> : null}

        {/* สิ่งที่กำลังรับรอง — ข้อมูลพอให้ตัดสินได้โดยไม่ต้องเปิดใบ */}
        <dl className={styles.facts}>
          {order?.orderNumber ? <><dt>ใบสั่งขาย</dt><dd className="mono">{order.orderNumber}</dd></> : null}
          {order?.customerName ? <><dt>ลูกค้า</dt><dd>{order.customerName}</dd></> : null}
          {/* ⭐ ใบย้อนหลัง: งานถึงบัญชีต่อเมื่อ AE Sup อนุมัติใบแล้ว — แถวนี้ **บังคับขึ้นเสมอ** (REVISION 2) */}
          {historical ? (
            <>
              <dt>อนุมัติใบ</dt>
              <dd>
                {naText(order?.approvedByName)}
                {order?.approvedAt ? ` · ${fmtDate(order.approvedAt)}` : ""}
                {" · ไม่นับ Actual"}
              </dd>
            </>
          ) : null}
          {/* ⚠️ คงเงื่อนไข falsy ของ `row.percent` ไว้ — งวดที่ไม่มีสัดส่วนต้องไม่โผล่ " · 0.00%" */}
          <dt>งวด</dt><dd>{naText(row.label)}{row.percent ? ` · ${fmtPercent(row.percent)}` : ""}</dd>
          <dt>ยอด</dt><dd className="mono">{fmtMoney(row.amount)}</dd>
          {/* ใบ Actual รายงวด — ยอดก่อน VAT ที่งวดนี้นับเข้า Actual + เดือนที่นับ (เวลาไทย · GREATEST ของเวลาอนุมัติงวด/ใบ) */}
          {installmentActual ? (
            <>
              <dt>นับ Actual</dt>
              <dd>
                {!actualLive
                  ? <span className="cell-quiet">{ACTUAL_NOT_LIVE_TEXT[orderStatus] || ACTUAL_NOT_LIVE_TEXT.other}</span>
                  : row.actualStatus === "approved"
                    ? `${fmtMoney(row.actualAmount)} (ก่อน VAT)${actualMonth ? ` · ${formatMonthLabel(actualMonth)}` : ""}`
                    : <span className="cell-quiet">ยังไม่อนุมัติงวด</span>}
              </dd>
            </>
          ) : null}
          {/* เก็บแล้วรวมงวดนี้ เทียบยอดทั้งใบ — งวดยกมา = เงินทั้งก้อนที่เก็บไปก่อนเข้าระบบ (mock FnConfirm) */}
          {historical ? (
            <>
              <dt>ยอดที่เก็บแล้ว</dt>
              <dd className="mono">
                {fmtMoney(collected)}
                {orderTotal === null ? "" : ` จาก ${fmtMoney(orderTotal)}`}
                {opening ? "" : " (รวมงวดนี้)"}
              </dd>
            </>
          ) : null}
          {/* ⭐ ช่วงบริการที่งวดนี้ครอบ (mig 0320) — **ต้องอยู่ในโมดัลนี้**
              เพราะลายเซ็นของบัญชีคือสิ่งที่ทำให้ค่านี้กลายเป็น "จ่ายถึง" ที่ปล่อยให้ TS
              เข้าไซต์ได้ · ฝ่ายขายกรอกช่วงเองได้ตอนงวดยังไม่รับรอง ⇒ ถ้าโมดัลไม่โชว์
              บัญชีจะรับรองช่วงที่ไม่เคยเห็น (กติกาเดิมของโมดัลนี้: "โชว์หลักฐานก่อนให้กด")
              ⚠️ โผล่เฉพาะงวดที่มีค่า — ใบสายสินค้าไม่มีเรื่องนี้ ไม่ต้องเห็นแถวเปล่า */}
          {row.coversFrom || row.coversTo ? (
            <>
              <dt>ครอบบริการ</dt>
              <dd>
                {row.coversFrom && row.coversTo
                  ? `${fmtDate(row.coversFrom)} – ${fmtDate(row.coversTo)}`
                  : <span className="cell-quiet">ยังกรอกไม่ครบช่วง</span>}
              </dd>
            </>
          ) : null}
          <dt>วันที่ลูกค้าจ่าย</dt>
          <dd>{row.paidOn ? fmtDate(row.paidOn) : <span className="cell-quiet">ไม่ได้ระบุ</span>}</dd>
          <dt>ผู้แจ้ง</dt>
          <dd>{row.reportedByName || <span className="cell-quiet">{NA}</span>}</dd>
          {/* ⭐ ใบกำกับภาษี (mig 0348) — **อ่านอย่างเดียว ไม่มีช่องกรอก** (มติผู้ใช้ 2026-09-07)
              บันทึกใบกำกับเป็นคนละคำสั่งกับการรับรองเงิน เพราะ `confirm` ถอยได้ทางเดียวคือบัญชีถอนคำรับรอง
              พร้อมเหตุผล ส่วนเลขพิมพ์ผิดได้ทุกวัน · ที่โชว์ตรงนี้เพราะคนกดควรรู้ว่างวดนี้ออกใบไปหรือยัง */}
          <dt>ใบกำกับภาษี</dt>
          <dd>
            {/* งวดยกมา: ใบกำกับของเงินก้อนนี้ออกในระบบเดิมแล้ว — "ยังไม่ออกใบ" คือคำที่ชวนให้ออกซ้ำ (taxInvoicePending) */}
            {row.taxInvoiceNo
              ? <span className="mono">{row.taxInvoiceNo}{row.taxInvoiceDate ? ` · ${fmtDate(row.taxInvoiceDate)}` : ""}</span>
              : opening
                ? <span className="cell-quiet">{openingInvoiceNote}{invoiceRef ? ` · ${invoiceRef}` : ""}</span>
                : <span className="cell-quiet">ยังไม่ออกใบ — บันทึกได้หลังรับรอง</span>}
          </dd>
          {/* หมายเหตุที่ฝ่ายขายคีย์มากับงวด (≤1,000 ตัวอักษร) — ตัวแสดงข้อความยาวกลาง ว่าง = ขีด */}
          {historical ? <><dt>หมายเหตุจาก SA</dt><dd><ReadableText text={String(row.note || "").trim()} lines={3} /></dd></> : null}
        </dl>

        {/* 🔴 หลักฐาน — เปิดดูได้ก่อนกด · ไม่มีไฟล์เลยต้องเตือน ไม่ใช่ปล่อยผ่านเงียบ ๆ */}
        {files.length ? (
          <div className={styles.files}>
            <span className={styles.filesLabel}>หลักฐานการชำระ {files.length} ไฟล์</span>
            {files.map((file) => (
              <a
                key={file.index}
                href={`/api/sales-planning/sales-orders/${orderId}/payment-file?installment=${encodeURIComponent(row.id)}&i=${file.index}`}
                target="_blank" rel="noreferrer" className={styles.file} title={file.fileName}
              >
                <Paperclip size={13} aria-hidden="true" />
                <span className="cell-ellipsis">{file.fileName}</span>
              </a>
            ))}
          </div>
        ) : (
          <StatusNotice tone="warning">งวดนี้ไม่มีไฟล์หลักฐานแนบมา — ตรวจกับฝ่ายขายก่อนรับรอง</StatusNotice>
        )}

        <p className={`${styles.detail} pre-line`}>{prompt.detail}</p>

        {actualBlocked ? <StatusNotice tone="warning">{installmentActualLockReason(row, order)}</StatusNotice> : null}
        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}

        <div className={styles.actions}>
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button tone="primary" onClick={() => onConfirm(row)} disabled={busy || actualBlocked} aria-busy={busy || undefined}>
            {busy ? "กำลังบันทึก…" : prompt.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
