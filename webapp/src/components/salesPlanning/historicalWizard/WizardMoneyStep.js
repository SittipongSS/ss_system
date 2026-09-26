"use client";
// ── ขั้น ③ งวดชำระ (มติเจ้าของ 25/09 — "ขอรื้อส่วนงวดชำระด้วย" · ม็อก Step3New / Step3Full / Step3Split) ─────────────
//
// ⭐ การ์ดตามเรื่องแบบขั้น ① (หน้าสร้างใบเสนอราคา):
//   ① ช่วงบริการตามสัญญา — แถบเวลา เก็บแล้ว / ยังไม่ถึงกำหนด / เลยกำหนด + วันนี้
//   ② เงินที่เก็บก่อนเข้าระบบ — คำถามสามทาง: **จ่ายครบทั้งใบแล้ว** (3 ใน 4 ใบจริง — ยอด/ช่วงคิดให้ทั้งก้อน)
//      · จ่ายมาแล้วบางส่วน (กรอกยอด + ครอบถึง) · ยังไม่เคยจ่าย · แล้ววันที่รับเงิน + หลักฐาน + หมายเหตุถึงบัญชี
//   ③ งวดการชำระ — ตารางห่วงโซ่ (`HistoricalInstallmentTable`) · ปุ่ม "แบ่งงวดอัตโนมัติ" (หน้าต่าง ดูผลก่อนสร้าง) ·
//      "เพิ่มงวด" · กล่องสรุปท้ายตารางแบบใบเสนอราคา (ยอดใบ · หักงวดยกมา · งวดที่ยังต้องเก็บ)
// ⭐ ไม่มีแถบสรุปข้างขวาแล้ว (มติ 25/09 ข้อ 1) — ยอดอยู่ในกล่องสรุปท้ายตาราง
// 🔴 สองข้อที่ฐานบังคับทั้งใบ (historical_so_check_installments) — ผลรวม = ยอดใบ ±1 สตางค์ · ช่วงครอบต่อเนื่องเต็มสัญญา
//   ⇒ ห่วงโซ่ทำให้ทั้งสองข้อเป็นจริงเองเมื่อกรอกครบ (งวดสุดท้ายรับยอดที่เหลือ · ช่วงต่อจากงวดก่อน) เหลือกรณีที่พิมพ์ผิดได้
//     ซึ่งขึ้นใต้ช่องทันที (`live`) · ตัวตัดสินจริงยังเป็นพรีวิวของ server
import { useMemo, useState } from "react";
import { CalendarClock, CalendarRange, CheckCircle2, Lock, Paperclip, Plus, SplitSquareHorizontal, Wallet } from "lucide-react";
import GatedAction from "@/components/ui/GatedAction";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import OptionTiles from "@/components/ui/OptionTiles";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { NA, fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { DOC_DATE_MAX, DOC_DATE_MIN, HISTORICAL_APPROVER_LABEL, OPENING_INSTALLMENT_LABEL } from "@/lib/sales/historicalOrders";
import { addDays } from "@/lib/sales/paymentCoverage";
import { QuoteLineTotals } from "@/components/salesPlanning/QuoteLineCells";
import {
  historicalAddInstallment, historicalFieldAnchorId, historicalInstallmentChain, historicalInstallmentIssueText,
  historicalOverdueWarningText,
  contractSpan, historicalInstallmentIssues, historicalMoneyView, historicalOpeningModeChange, historicalStepIssueNotice,
  historicalZeroValue, serviceMonthSpan,
} from "@/lib/sales/historicalIntakeForm";
import CardHeading from "./CardHeading";
import CoverageTimeline from "./CoverageTimeline";
import HistoricalInstallmentTable from "./HistoricalInstallmentTable";
import HistoricalSplitModal from "./HistoricalSplitModal";
import styles from "./HistoricalOrderWizard.module.css";

export default function WizardMoneyStep({
  state, onChange, issues = [], summary = true, plan = null, money = null, evidenceFiles = [], onEvidenceFiles,
  todayIso = null, customerTerms = null, busy = false, onOversize,
}) {
  const [splitOpen, setSplitOpen] = useState(false);
  const has = (field) => issues.some((issue) => issue.field === field);
  /* ข้อความรายช่อง — ก้อนเดียวกับที่หัวขั้นลิสต์ไว้ แต่แปะใต้ช่องของมันด้วย (เหมือนขั้น ① ②) */
  const noteOf = (field) => issues.find((issue) => issue.field === field)?.message || null;
  const start = state.contract?.startDate || "";
  const end = state.contract?.endDate || "";
  /* ยอดใบที่ใช้ได้ตั้งแต่ยังไม่มีแผน (รีวิว R7) — มีแผนใช้แผน ไม่มีก็คิดจากฟอร์มด้วยสูตรเดียวกับ server
     ⚠️ คิดไม่ได้ต้องเป็น null + เหตุที่จริง **ห้ามเป็น 0** — 0 อ่านเหมือนใบยอด 0 บาท */
  const moneyView = money || historicalMoneyView(state, plan);
  const total = moneyView.ok ? moneyView.totalAmount : null;
  const zeroValue = historicalZeroValue(plan, moneyView);
  const chain = historicalInstallmentChain(state, { totalAmount: total, todayIso });
  const mode = chain.mode;
  const rows = state.installments || [];
  const opening = state.opening || {};
  const rowIssues = useMemo(() => historicalInstallmentIssues(issues), [issues]);
  const notice = historicalStepIssueNotice(issues.length);

  const setOpening = (next) => onChange({ opening: { ...opening, ...next } });
  const setRows = (next) => onChange({ installments: next });
  const patchRow = (key, next) => setRows(rows.map((row) => (row.key === key ? { ...row, ...next } : row)));

  /* เปลี่ยนคำตอบ = ของที่จะหายต้องถามก่อน (ตัวตัดสินเดียว `historicalOpeningModeChange`) */
  const changeMode = async (next) => {
    const change = historicalOpeningModeChange(state, next, { pendingEvidence: evidenceFiles.length });
    if (change.ask) {
      const go = await confirmAction({
        title: change.title,
        description: change.description,
        confirmLabel: change.confirmLabel,
        tone: "danger",
      });
      if (!go) return;
    }
    /* "ยังไม่เคยจ่าย" = ไม่มีงวดยกมา ⇒ ไฟล์หลักฐานในตะกร้าไม่มีที่ไปแล้ว (ค้างไว้ = อัปขึ้นไปเป็นไฟล์กำพร้า) */
    if (change.clearsEvidence && evidenceFiles.length) onEvidenceFiles?.([]);
    onChange(change.patch);
  };

  /* ── การ์ดงวด: ปุ่มหัวตารางติดด่าน = บอกเหตุ (บรรทัดใต้หัวการ์ดพูดเหตุเดียวกัน) ── */
  const addBlocker = chain.startReason;
  /* 🐞 รีวิว 25/09: ยังไม่รู้ยอดที่ต้องเก็บ (ยังไม่กรอกยอดที่เก็บแล้ว) เคยปล่อยปุ่มแบ่งงวด · งวดยกมาเกินยอดใบเคยพูดว่า "ยอดเหลือ 0" */
  const remainingNegative = chain.remaining !== null && chain.remaining < 0;
  const splitBlocker = chain.startReason
    || (total === null ? moneyView.reason : null)
    || (chain.remaining === null ? "กรอกยอดที่เก็บแล้วก่อน — งวดที่ต้องเก็บแบ่งจากยอดที่เหลือ" : null)
    || (remainingNegative ? "ยอดที่เก็บแล้วเกินยอดใบ — แก้ยอดที่การ์ด “เงินที่เก็บก่อนเข้าระบบ”" : null)
    || (!(chain.remaining > 0) ? "ยอดที่เหลือเป็น 0 — ถ้าเก็บครบแล้วเลือก “จ่ายครบทั้งใบแล้ว”" : null);
  const remainingText = chain.remaining === null || remainingNegative ? NA : fmtMoney(chain.remaining);
  const overdueCount = chain.rows.filter((row) => row.overdue).length;

  /* ── แถบเวลา ── */
  const segments = [
    ...(chain.opening?.coversFrom && chain.opening?.coversTo
      ? [{ key: "opening", kind: "paid", from: chain.opening.coversFrom, to: chain.opening.coversTo, label: `${OPENING_INSTALLMENT_LABEL} ${fmtMoney(chain.opening.amount)}` }]
      : []),
    ...chain.rows
      .filter((row) => row.coversFrom && row.coversTo && row.coversTo >= row.coversFrom)
      .map((row) => ({
        key: row.key, kind: row.overdue ? "overdue" : "planned", from: row.coversFrom, to: row.coversTo,
        label: `งวดที่ ${row.seq} ${row.label || ""} ${row.amount === null ? "" : fmtMoney(row.amount)}`.trim(),
      })),
  ];
  const legend = [
    ...(chain.opening && chain.opening.amount !== null
      ? [{ kind: "paid", text: `เก็บแล้ว ${fmtMoney(chain.opening.amount)}${chain.opening.coversTo ? ` ถึง ${fmtDate(chain.opening.coversTo)}` : ""}` }]
      : []),
    ...(chain.rows.length
      ? [{ kind: "planned", text: `ยังต้องเก็บ ${fmtNumber(chain.rows.length)} งวด${remainingText === NA ? "" : ` ${remainingText}`}` }]
      : []),
    ...(overdueCount ? [{ kind: "overdue", text: `เลยกำหนด ${fmtNumber(overdueCount)} งวด` }] : []),
    /* "วันนี้" แถบเวลาเติมเอง (มีเส้นวันนี้เมื่อได้ todayIso) — ใส่ที่นี่ด้วย = ขึ้นสองครั้ง (UAT 25/09) */
  ];
  const contractMonthsText = contractSpan(start, end).monthsText;

  /* ── ไทล์คำตอบ — คำกำกับบอกผลของแต่ละทาง ── */
  const tiles = [
    {
      value: "full",
      label: "จ่ายครบทั้งใบแล้ว",
      description: total === null
        ? `ยอดใบยังคิดไม่ได้ — ${moneyView.reason}`
        : `งวดยกมา = ยอดใบ ${fmtMoney(total)} ครอบถึง ${end ? fmtDate(end) : NA} · ไม่มีงวดต้องเก็บ`,
    },
    { value: "part", label: "จ่ายมาแล้วบางส่วน", description: "กรอกยอดที่เก็บแล้ว · ที่เหลือแบ่งเป็นงวดต้องเก็บ" },
    { value: "none", label: "ยังไม่เคยจ่าย", description: "ทุกงวดเป็นงวดต้องเก็บ · นัดบริการรอจนบัญชีรับรองงวดแรก" },
  ];

  /* ช่วงที่งวดยกมา (บางส่วน) ครอบ — บอกว่างวดที่เหลือเริ่มวันไหน และลงตัวเป็นเดือนไหม (ตัวเลือกแบ่งงวดขึ้นกับข้อนี้) */
  const openingSpanChip = (() => {
    const to = opening.coversTo || "";
    if (!start || !to || to < start || (end && to >= end)) return null;
    const span = serviceMonthSpan(start, to);
    const next = addDays(to, 1);
    /* "พอดี" เฉพาะเดือนเต็มจริง — n เดือน + 1 วัน (กติกาวันครบรอบ) ใช้กับวันสิ้นสุดสัญญาเท่านั้น (รีวิว 25/09) */
    return span && !span.extraDay
      ? { tone: "ok", text: `ครบ ${fmtNumber(span.months)} เดือนพอดี · งวดที่เหลือเริ่ม ${fmtDate(next)}` }
      : { tone: "muted", text: `ไม่ลงตัวเป็นเดือน · งวดที่เหลือเริ่ม ${fmtDate(next)}` };
  })();

  const remainingChip = mode === "part" && chain.remaining !== null && chain.remaining > 0 && !noteOf("opening.amount")
    ? `เหลือให้แบ่งเป็นงวด ${fmtMoney(chain.remaining)}` : null;

  const statusLine = (() => {
    if (!chain.rows.length) return null;
    if (total === null) return { tone: "muted", text: moneyView.reason };
    /* 🐞 รีวิว 25/09: ยังไม่รู้ยอดที่ต้องเก็บ/ช่วงเริ่ม เคยขึ้นเขียว "ครบยอด" */
    if (chain.startReason) return { tone: "muted", text: chain.startReason };
    if (chain.remaining === null) return { tone: "muted", text: "กรอกยอดที่เก็บแล้วก่อน — งวดสุดท้ายคิดจากยอดที่เหลือ" };
    if (remainingNegative) return { tone: "bad", text: "ยอดที่เก็บแล้วเกินยอดใบ — แก้ยอดที่การ์ด “เงินที่เก็บก่อนเข้าระบบ”" };
    if (chain.missingTo) return { tone: "muted", text: `ยังไม่ได้กรอก “ถึง” ${fmtNumber(chain.missingTo)} งวด` };
    if (chain.overflow) return { tone: "bad", text: "งวดอื่นรวมกันเกินยอดที่ต้องเก็บ — ลดยอดงวดก่อนหน้า" };
    const complete = chain.rows.every((row) => row.coversFrom && row.coversTo && row.coversTo >= row.coversFrom);
    return complete
      ? { tone: "ok", text: `ครบยอด · ครอบบริการต่อเนื่อง ${fmtDate(start)} – ${fmtDate(end)}` }
      : { tone: "muted", text: "ช่วงครอบยังไม่ต่อเนื่อง — ดูข้อความใต้ช่อง “ถึง”" };
  })();

  return (
    <div className={styles.cardStack}>
      {/* ก้อนแดงขึ้นหลังกดไปต่อเท่านั้น (มติ 25/09 · ผู้เรียกตัดสินผ่าน `summary`) · ป้ายงวดพูดเลขงวดปัจจุบัน */}
      {summary && issues.length > 0 && (
        <StatusNotice tone="error" title={notice.title} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => (
              <li key={`${issue.field}-${issue.rowKey || ""}-${issue.message}`}>{historicalInstallmentIssueText(issue, chain)}</li>
            ))}
          </ul>
        </StatusNotice>
      )}

      <section className={styles.card} aria-labelledby="hist-card-span">
        <CardHeading
          icon={CalendarRange}
          title={<span id="hist-card-span">ช่วงบริการตามสัญญา</span>}
          note={start && end ? `${fmtDate(start)} – ${fmtDate(end)}` : null}
          actions={contractMonthsText ? <span className={styles.monthsChip}>{contractMonthsText}</span> : null}
        />
        {start && end ? (
          <CoverageTimeline startDate={start} endDate={end} segments={segments} todayIso={todayIso} legend={legend} />
        ) : (
          <p className={styles.hint}>กรอกวันเริ่ม–วันสิ้นสุดสัญญาในขั้น ① ก่อน — แถบช่วงบริการและงวดทั้งหมดต่อจากช่วงนี้</p>
        )}
      </section>

      {zeroValue ? (
        <StatusNotice tone="info" title="ใบยอด 0 บาท — ไม่มีงวดให้เก็บ" className={styles.notice}>
          ด่านเงินของนัดบริการผ่านเองเมื่อยอดใบเป็น 0 · ใบแบบนี้ต้องมีหมายเหตุบอกเหตุผลในขั้น ①
          {/* ใบที่กลายเป็น ฿0 หลังตอบขั้นนี้แล้ว — ของที่คีย์ไว้ไม่ถูกส่ง (body) · ยอดกลับมาเมื่อไรก็ยังอยู่ */}
          {mode || rows.length ? " · คำตอบและงวดที่คีย์ไว้ก่อนหน้าจะไม่ถูกบันทึก (ยังอยู่ถ้ายอดใบกลับมาไม่เป็น 0)" : ""}
        </StatusNotice>
      ) : (
        <>
          <section className={styles.card} aria-labelledby="hist-card-paid">
            <CardHeading
              icon={Wallet}
              title={<span id="hist-card-paid">เงินที่เก็บก่อนเข้าระบบ</span>}
              note={`รวมเป็น${OPENING_INSTALLMENT_LABEL} 1 งวด · บัญชีรับรองครั้งเดียวหลัง${HISTORICAL_APPROVER_LABEL}อนุมัติ`}
            />
            <div className={styles.field} id={historicalFieldAnchorId("opening")}>
              <span>ลูกค้าจ่ายเงินมาแล้วหรือยัง <b className={styles.req}>*</b></span>
              <OptionTiles
                ariaLabel="ลูกค้าจ่ายเงินมาแล้วหรือยัง"
                options={tiles}
                value={mode}
                onChange={changeMode}
                invalid={has("opening")}
                disabled={busy}
              />
              {noteOf("opening") ? <small data-bad="yes">{noteOf("opening")}</small> : null}
            </div>

            {mode === "full" ? (
              <>
                <div className={styles.grid3}>
                  <div className={styles.field}>
                    <span>ยอดที่เก็บแล้ว</span>
                    <p className={styles.derived} data-empty={total === null ? "yes" : undefined}>
                      {total === null ? moneyView.reason : fmtMoney(total)}
                    </p>
                  </div>
                  <div className={styles.field}>
                    <span>ครอบบริการ ตั้งแต่</span>
                    <p className={styles.derived} data-empty={start ? undefined : "yes"}>{start ? fmtDate(start) : "ยังไม่ได้กรอกวันเริ่มสัญญา"}</p>
                  </div>
                  <div className={styles.field}>
                    <span>ครอบบริการ ถึง</span>
                    <p className={styles.derived} data-empty={end ? undefined : "yes"}>{end ? fmtDate(end) : "ยังไม่ได้กรอกวันสิ้นสุดสัญญา"}</p>
                  </div>
                </div>
                <p className={styles.lockLine}>
                  <Lock size={12} aria-hidden="true" />
                  ยอดเท่ายอดใบ · ครอบเต็มสัญญา — ถ้ายังเก็บไม่ครบ เลือก “จ่ายมาแล้วบางส่วน”
                </p>
              </>
            ) : null}

            {mode === "part" ? (
              <div className={styles.grid3}>
                <div className={styles.field} id={historicalFieldAnchorId("opening.amount")}>
                  <span>ยอดที่เก็บแล้ว <b className={styles.req}>*</b></span>
                  <MoneyInput
                    value={opening.amount}
                    className={has("opening.amount") ? "is-invalid" : ""}
                    aria-invalid={has("opening.amount") ? "true" : undefined}
                    disabled={busy}
                    onChange={(value) => setOpening({ amount: value ?? "" })}
                    aria-label={`ยอดของ${OPENING_INSTALLMENT_LABEL}`}
                  />
                  {noteOf("opening.amount") ? <small data-bad="yes">{noteOf("opening.amount")}</small> : null}
                  {remainingChip ? <span className={styles.monthsChip}>{remainingChip}</span> : null}
                  {total === null ? <small>{moneyView.reason}</small> : null}
                </div>
                <div className={styles.field}>
                  <span>ครอบบริการ ตั้งแต่</span>
                  {/* ล็อกที่วันเริ่มสัญญา — CHECK opening_shape ของฐานบังคับ ⇒ ช่องกรอกจะโกหกผู้คีย์ */}
                  <p className={styles.derived} data-empty={start ? undefined : "yes"}>
                    {start ? fmtDate(start) : "ยังไม่ได้กรอกวันเริ่มสัญญา"}
                  </p>
                  <small>วันเริ่มสัญญาเสมอ</small>
                </div>
                <div className={styles.field} id={historicalFieldAnchorId("opening.coversTo")}>
                  <span>ครอบบริการ ถึง <b className={styles.req}>*</b></span>
                  {/* 🐞 ขอบที่คิดจากค่าอื่นบนฟอร์ม **กลืนค่าที่พิมพ์** (UAT 23/09) ⇒ ขอบเหลือช่วงเอกสาร 2000–2100 ·
                      กฎ "ต้องอยู่ในช่วงสัญญา" เป็นข้อความใต้ช่อง (`noteOf`) — ตัวตัดสินชุดเดียวกับแผน */}
                  <DateInput
                    value={opening.coversTo || ""}
                    onChange={(value) => setOpening({ coversTo: value })}
                    min={DOC_DATE_MIN}
                    max={DOC_DATE_MAX}
                    invalid={has("opening.coversTo")}
                    disabled={busy}
                    ariaLabel={`ครอบบริการถึงของ${OPENING_INSTALLMENT_LABEL}`}
                  />
                  {noteOf("opening.coversTo") ? <small data-bad="yes">{noteOf("opening.coversTo")}</small> : null}
                  {!noteOf("opening.coversTo") && openingSpanChip ? (
                    <span className={styles.monthsChip} data-tone={openingSpanChip.tone}>{openingSpanChip.text}</span>
                  ) : null}
                  {!noteOf("opening.coversTo") && !openingSpanChip ? (
                    <small>{`ต้องอยู่ในช่วงสัญญา${start && end ? ` ${fmtDate(start)}–${fmtDate(end)}` : ""}`}</small>
                  ) : null}
                </div>
              </div>
            ) : null}

            {mode === "full" || mode === "part" ? (
              <>
                <div className={styles.grid3}>
                  <div className={styles.field} id={historicalFieldAnchorId("opening.paidOn")}>
                    <span>วันที่รับเงิน <b className={styles.req}>*</b></span>
                    {/* ขอบ `max={todayIso}` กลืนค่าที่พิมพ์เหมือนกัน ⇒ กฎอยู่ใต้ช่อง ไม่ใช่ที่ขอบ */}
                    <DateInput
                      value={opening.paidOn || ""}
                      onChange={(value) => setOpening({ paidOn: value })}
                      min={DOC_DATE_MIN}
                      max={DOC_DATE_MAX}
                      invalid={has("opening.paidOn")}
                      disabled={busy}
                      ariaLabel={`วันที่รับเงินของ${OPENING_INSTALLMENT_LABEL}`}
                    />
                    <small data-bad={has("opening.paidOn") ? "yes" : undefined}>
                      {noteOf("opening.paidOn") || `ต้องไม่เกินวันนี้${todayIso ? ` (${fmtDate(todayIso)})` : ""}`}
                    </small>
                  </div>
                  {/* ช่องไฟล์บังคับ — ติดด่านแล้วต้องเห็นจากตัวช่อง ไม่ใช่เห็นแต่ในก้อน error ด้านบน */}
                  <div className={`${styles.field} ${styles.span2}`} id={historicalFieldAnchorId("opening.evidence")}>
                    <span>หลักฐานการเก็บเงิน <b className={styles.req}>*</b></span>
                    {state.openingEvidence?.length ? (
                      <ul className={styles.evidenceList}>
                        {state.openingEvidence.map((ref, index) => (
                          <li key={ref.storagePath || `${ref.fileName}-${index}`}>
                            <Paperclip size={13} aria-hidden="true" />
                            {ref.fileName || "ไฟล์หลักฐาน"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <PendingFiles
                      files={evidenceFiles}
                      onChange={onEvidenceFiles}
                      disabled={busy}
                      invalid={has("opening.evidence")}
                      onOversize={onOversize}
                      label="แนบหลักฐาน"
                      hint="ใบกำกับ ใบเสร็จ หรือ statement อย่างน้อย 1 ไฟล์ · ลากมาวาง หรือ Ctrl+V ได้"
                    />
                    {noteOf("opening.evidence") ? <small data-bad="yes">{noteOf("opening.evidence")}</small> : null}
                  </div>
                </div>
                <div className={styles.field} id={historicalFieldAnchorId("opening.note")}>
                  <span>หมายเหตุถึงฝ่ายบัญชี</span>
                  <Textarea
                    value={opening.note || ""}
                    invalid={has("opening.note")}
                    disabled={busy}
                    placeholder="ไม่บังคับ — บัญชีเห็นตอนรับรองงวดนี้ · เช่น ลูกค้าจ่าย 2 ครั้ง 10/01 และ 15/03"
                    onChange={(event) => setOpening({ note: event.target.value })}
                    aria-label={`หมายเหตุของ${OPENING_INSTALLMENT_LABEL}`}
                  />
                  {noteOf("opening.note") ? <small data-bad="yes">{noteOf("opening.note")}</small> : null}
                </div>
              </>
            ) : null}
          </section>

          {mode === "part" || mode === "none" ? (
            <section className={styles.card} aria-labelledby="hist-card-installments" id={historicalFieldAnchorId("installments")}>
              <CardHeading
                icon={CalendarClock}
                title={<span id="hist-card-installments">งวดการชำระ</span>}
                note={`${fmtNumber(chain.rows.length + (mode === "part" ? 1 : 0))} งวด · ต้องเก็บ ${fmtNumber(chain.rows.length)}`}
                actions={(
                  <>
                    {/* ⭐ ติดด่าน = โชว์แล้วบอกเหตุตอนกด (GatedAction) · เหตุเดียวกันขึ้นบรรทัดใต้หัวด้วย */}
                    <GatedAction
                      size="sm"
                      tone="neutral"
                      blocker={splitBlocker || ""}
                      disabled={busy}
                      icon={<SplitSquareHorizontal size={14} aria-hidden="true" />}
                      onClick={() => setSplitOpen(true)}
                    >
                      แบ่งงวดอัตโนมัติ
                    </GatedAction>
                    <GatedAction
                      size="sm"
                      tone="neutral"
                      blocker={addBlocker || ""}
                      disabled={busy}
                      icon={<Plus size={14} aria-hidden="true" />}
                      onClick={() => setRows(historicalAddInstallment(state, { totalAmount: total }))}
                    >
                      เพิ่มงวด
                    </GatedAction>
                  </>
                )}
              />
              <p className={styles.hint} data-blocked={splitBlocker ? "yes" : undefined}>
                {splitBlocker
                  ? splitBlocker
                  : `ครอบ ${chain.chainStart ? fmtDate(chain.chainStart) : NA} – ${end ? fmtDate(end) : NA} · ยอด ${remainingText} — ช่วงของแต่ละงวดต่อจากงวดก่อนเอง กรอกแค่ “ถึง” · งวดสุดท้ายรับยอดที่เหลือและถึงวันสิ้นสุดสัญญาเอง`}
              </p>
              {noteOf("installments") ? <small className={styles.cellBad}>{noteOf("installments")}</small> : null}

              {overdueCount > 0 ? (
                <StatusNotice tone="warning" title="ขั้นนี้มีคำเตือน 1 ข้อ — ไม่บล็อกการบันทึก" className={styles.notice}>
                  {historicalOverdueWarningText(overdueCount, todayIso)}
                </StatusNotice>
              ) : null}

              <HistoricalInstallmentTable
                chain={chain}
                rowIssues={rowIssues}
                busy={busy}
                onPatch={patchRow}
                onRemove={(key) => setRows(rows.filter((row) => row.key !== key))}
                emptyText="ยังไม่มีงวด — กด “แบ่งงวดอัตโนมัติ” หรือ “เพิ่มงวด”"
              />

              <QuoteLineTotals
                rows={[
                  { id: "total", label: "ยอดใบ (รวม VAT)", value: total === null ? null : fmtMoney(total) },
                  ...(mode === "part"
                    ? [{ id: "opening", label: `หัก ${OPENING_INSTALLMENT_LABEL} (เก็บแล้ว)`, value: chain.opening?.amount === null ? null : `-${fmtMoney(chain.opening.amount)}` }]
                    : []),
                ]}
                grandTotalLabel={`งวดที่ยังต้องเก็บ ${fmtNumber(chain.rows.length)} งวด`}
                grandTotal={remainingText}
              >
                {statusLine ? (
                  <p className={styles.instStatus} data-tone={statusLine.tone} role="status">
                    {statusLine.tone === "ok" ? <CheckCircle2 size={15} aria-hidden="true" /> : null}
                    {statusLine.text}
                  </p>
                ) : null}
              </QuoteLineTotals>
            </section>
          ) : null}
        </>
      )}

      {/* `customerTerms` = รอบวางบิลของลูกค้า (mig 0389) → ชิป "ตามรอบของลูกค้า" (ดูหัว `historicalCustomerDueOption`) */}
      <HistoricalSplitModal
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        from={chain.chainStart}
        to={end || null}
        amount={chain.remaining}
        gridStart={start || null}
        todayIso={todayIso}
        customerTerms={customerTerms}
        replacing={rows.length}
        onCreate={(next) => { setRows(next); setSplitOpen(false); }}
      />
    </div>
  );
}
