"use client";
// ── ขั้น ③ งวดชำระ (ม็อก Step3) ───────────────────────────────────────────────────
//
// ⭐ **งวดยกมา** (มติ 22/09 ข้อ 2) = เงินที่เก็บไปแล้วก่อนเข้าระบบ · บัญชีรับรองครั้งเดียว
//   · ครอบบริการตั้งแต่ **วันเริ่มสัญญาเสมอ** (ช่องล็อก — ฐานบังคับด้วย CHECK opening_shape)
//   · ไม่มีวันครบกำหนด (เก็บไปแล้ว) · ต้องมีวันที่รับเงินและหลักฐานอย่างน้อย 1 ไฟล์
// ⭐ งวดที่เหลือคีย์ปกติ พร้อม "ครอบบริการ ตั้งแต่–ถึง" ของแต่ละงวด — บัญชีรับรองทีละงวดเมื่อลูกค้าจ่าย
//
// 🔴 **สองข้อที่ฐานบังคับและตีกลับทั้งใบถ้าไม่ครบ** (historical_so_check_installments):
//   ① ผลรวมทุกงวด = ยอดใบ (คลาดเคลื่อนได้ 1 สตางค์)
//   ② ช่วงครอบต่อเนื่องเต็มสัญญา ไม่มีช่องโหว่ ไม่ซ้อนกัน
//   ⇒ บรรทัดตรวจท้ายขั้นนี้อ่านจากแผนของ server ตัวเดียวกับที่ RPC ใช้ ไม่คิดเอง (บทเรียน #1685)
import { AlertTriangle, CheckCircle2, Paperclip, Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import OptionTiles from "@/components/ui/OptionTiles";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { TableScroll } from "@/components/ui/Table";
import { fmtDate, fmtMoney, fmtNumber, NA } from "@/lib/format";
import { DOC_DATE_MAX, DOC_DATE_MIN, INSTALLMENT_NOTE_MAX, OPENING_INSTALLMENT_LABEL } from "@/lib/sales/historicalOrders";
import { addDays } from "@/lib/sales/paymentCoverage";
import {
  HISTORICAL_NEXT_BUTTON_LABEL, INSTALLMENT_LABEL_MAX, contractSpan, emptyHistoricalInstallment,
  historicalFieldAnchorId, historicalInstallmentSum, historicalMoneyView, splitRemaining,
} from "@/lib/sales/historicalIntakeForm";
import CoverageTimeline from "./CoverageTimeline";
import styles from "./HistoricalOrderWizard.module.css";

const OPENING_TILES = [
  { value: "yes", label: "เก็บเงินไปแล้วบางส่วน", description: `รวมยอดที่เก็บก่อนเข้าระบบเป็น${OPENING_INSTALLMENT_LABEL} 1 งวด` },
  { value: "no", label: "ยังไม่เคยเก็บเงิน", description: "ทุกงวดคีย์เป็นงวดที่ยังต้องเก็บ" },
];

export default function WizardMoneyStep({
  state, onChange, issues = [], plan = null, money = null, evidenceFiles = [], onEvidenceFiles,
  todayIso = null, busy = false, onOversize,
}) {
  const has = (field) => issues.some((issue) => issue.field === field);
  /* ข้อความรายช่อง — ก้อนเดียวกับที่หัวขั้นลิสต์ไว้ แต่แปะใต้ช่องของมันด้วย (เหมือนขั้น ①) */
  const noteOf = (field) => issues.find((issue) => issue.field === field)?.message || null;
  const start = state.contract?.startDate || "";
  const end = state.contract?.endDate || "";
  /* ⚠️ `months` = null เมื่อช่วงสัญญาไม่ลงตัวเป็นเดือน (ไม่ปัดเศษให้ — ดู contractMonths)
     ⇒ ชุดแบ่งงวด "รายเดือน/ราย 3 เดือน" หายไปเอง · ต้องบอกเหตุ ไม่ใช่ให้ตัวเลือกหายเฉย ๆ */
  const { months, partial: spanPartial } = contractSpan(start, end);
  const zeroValue = Boolean(plan?.zeroValue);
  /* 🐞 รีวิว R7: ทุกตัวเลขเงินของขั้นนี้เคยมาจาก `plan` อย่างเดียว แต่พรีวิวที่ยังมี error ตอบ 400
     โดยไม่คืน plan ⇒ ผู้คีย์มาถึงขั้นนี้พร้อม plan = null **ทุกครั้งที่คีย์ใบใหม่** (ฟอร์มที่ยัง
     ไม่มีงวดสักงวดมี error `installments` เสมอ) ⇒ ยอดใบขึ้นขีด · แผ่นแบ่งงวดเทาทั้งชุด · จอบอก
     ว่า "ตรวจขั้น ② ให้ผ่านก่อน" ทั้งที่ขั้น ② ผ่านแล้ว ⇒ ต้องคีย์ N งวดให้ตรงยอดใบ ±1 สตางค์
     โดยไม่เห็นยอดใบ
     ⇒ `historicalMoneyView` = มีแผนใช้แผน · ไม่มีก็คิดจากยอดโซน + โหมด VAT ด้วย
       `splitHistoricalAmounts` ก้อนเดียวกับ server (ไม่ใช่กฎชุดที่สอง)
     ⚠️ คิดไม่ได้ ต้องเป็น null + เหตุที่จริง **ห้ามเป็น 0** — 0 อ่านเหมือนใบยอด 0 บาท */
  const moneyView = money || historicalMoneyView(state, plan);
  const total = moneyView.ok ? moneyView.totalAmount : null;
  const rows = state.installments || [];
  const opening = state.opening || {};
  const openingOn = state.hasOpening === true;

  const setOpening = (next) => onChange({ opening: { ...opening, ...next } });
  const setRows = (next) => onChange({ installments: next });
  const patchRow = (key, next) => setRows(rows.map((row) => (row.key === key ? { ...row, ...next } : row)));

  /* ช่วงที่งวดที่เหลือต้องครอบ = ถัดจากงวดยกมา ถึงวันสิ้นสุดสัญญา */
  const remainingFrom = openingOn && opening.coversTo ? addDays(opening.coversTo, 1) : start;
  const remainingAmount = total === null ? null : Math.max(0, Math.round((total - (Number(opening.amount) || 0)) * 100) / 100);
  const splitOptions = [
    { value: "1", label: "ก้อนเดียว", description: "1 งวด" },
    ...(months && months >= 2 ? [{ value: "month", label: "รายเดือน", description: `${fmtNumber(months)} งวด` }] : []),
    ...(months && months >= 3 ? [{ value: "quarter", label: "ราย 3 เดือน", description: `${fmtNumber(Math.ceil(months / 3))} งวด` }] : []),
  ];
  const splitCount = (mode) => {
    if (mode === "month") return months || 1;
    if (mode === "quarter") return Math.ceil((months || 1) / 3);
    return 1;
  };
  const applySplit = (mode) => {
    const next = splitRemaining({
      startDate: remainingFrom, endDate: end, count: splitCount(mode),
      amount: remainingAmount ?? 0, label: "งวด",
    });
    if (next.length) setRows(next);
  };
  /* ⭐ เหตุต้องเป็นเหตุจริง — ของเดิมบอก "ตรวจข้อมูลขั้นก่อนหน้าให้ผ่านก่อน" ทั้งที่ขั้นก่อนหน้า
     ผ่านแล้ว (รีวิว R7) · ยอดใบ 0 ก็แบ่งงวดไม่ได้ (ใบ ฿0 ไม่มีงวดตามตัวตรวจของ 0374) */
  const splitBlocked = (() => {
    if (!remainingFrom || !end) return "กรอกวันเริ่ม–วันสิ้นสุดสัญญาในขั้น ① ก่อน";
    if (!moneyView.ok) return moneyView.reason;
    if (remainingAmount === null) return moneyView.reason;
    if (!(remainingAmount > 0)) return "ยอดที่เหลือเป็น 0 — ไม่มีอะไรให้แบ่งเป็นงวด";
    return null;
  })();

  const timelineSegments = [
    ...(openingOn && opening.coversTo && start
      ? [{ key: "opening", kind: "paid", from: start, to: opening.coversTo, label: `${OPENING_INSTALLMENT_LABEL} ${fmtMoney(opening.amount)}` }]
      : []),
    ...rows
      .filter((row) => row.coversFrom && row.coversTo)
      .map((row, index) => ({
        key: row.key || `row-${index}`, kind: "due", from: row.coversFrom, to: row.coversTo,
        label: `${row.label || "งวด"} ${fmtMoney(row.amount)}`,
      })),
  ];

  const check = plan?.check || null;
  const checkOk = Boolean(check && check.sumMatches && check.coverageContinuous);
  const localSum = historicalInstallmentSum(state, total);

  return (
    <>
      {issues.length > 0 && (
        <StatusNotice tone="error" title={`งวดยังไม่ผ่าน ${issues.length} ข้อ`} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
        </StatusNotice>
      )}

      {start && end ? (
        <CoverageTimeline startDate={start} endDate={end} segments={timelineSegments} todayIso={todayIso} />
      ) : (
        <p className={styles.hint}>กรอกช่วงสัญญาในขั้น ① ก่อน แถบช่วงบริการจึงจะขึ้น</p>
      )}

      {zeroValue ? (
        <StatusNotice tone="info" title="ใบยอด 0 บาท — ไม่มีงวดให้เก็บ" className={styles.notice}>
          ด่านเงินของนัดบริการผ่านเองเมื่อยอดใบเป็น 0 · ใบแบบนี้ต้องมีหมายเหตุบอกเหตุผลในขั้น ①
        </StatusNotice>
      ) : (
        <>
          <div className={styles.field} id={historicalFieldAnchorId("opening")}>
            <span>เคยเก็บเงินไปแล้วหรือยัง <b className={styles.req}>*</b></span>
            <OptionTiles
              ariaLabel="เคยเก็บเงินไปแล้วหรือยัง"
              options={OPENING_TILES}
              value={state.hasOpening === true ? "yes" : (state.hasOpening === false ? "no" : null)}
              onChange={(value) => onChange({ hasOpening: value === "yes" })}
              disabled={busy}
            />
            <small>ไม่มีค่าตั้งต้น · เลือก “ยังไม่เคยเก็บเงิน” = นัดบริการติดด่านเงินจนกว่าบัญชีรับรองงวดแรก</small>
          </div>

          {openingOn && (
            <section className={styles.carry}>
              <h4 className={styles.carryHead}>
                {OPENING_INSTALLMENT_LABEL} — เงินที่เก็บไปแล้วก่อนเข้าระบบ
              </h4>
              <div className={styles.grid3}>
                <div className={styles.field}>
                  <span>ยอดที่เก็บแล้ว <b className={styles.req}>*</b></span>
                  <MoneyInput
                    value={opening.amount}
                    disabled={busy}
                    onChange={(value) => setOpening({ amount: value })}
                    aria-label={`ยอดของ${OPENING_INSTALLMENT_LABEL}`}
                  />
                  <small>
                    {moneyView.ok
                      ? `${fmtMoney(opening.amount)} จากยอดใบ ${fmtMoney(total)}`
                      : moneyView.reason}
                  </small>
                </div>
                <div className={styles.field}>
                  <span>ครอบบริการ ตั้งแต่</span>
                  {/* ล็อกที่วันเริ่มสัญญา — CHECK opening_shape ของฐานบังคับ ⇒ ช่องกรอกจะโกหกผู้คีย์ */}
                  <p className={styles.derived} data-empty={start ? undefined : "yes"}>
                    {start ? fmtDate(start) : "ยังไม่ได้กรอกวันเริ่มสัญญา"}
                  </p>
                  <small>ล็อกตามวันเริ่มสัญญา</small>
                </div>
                <div className={styles.field}>
                  <span>ครอบบริการ ถึง <b className={styles.req}>*</b></span>
                  {/* 🐞 ขอบที่คิดจากค่าอื่นบนฟอร์ม **กลืนค่าที่พิมพ์** — `DateInput` ไม่เรียก onChange
                      เมื่อค่าหลุด min/max แล้วเด้งกลับค่าเดิมตอนเบลอ โดยไม่มีข้อความสักบรรทัด
                      (อาการเดียวกับสองช่องวันสัญญาของขั้น ① · UAT 23/09) ⇒ ขอบเหลือช่วงเอกสาร
                      ที่ระบบรองรับ (2000–2100) เท่านั้น · กฎ "ต้องอยู่ในช่วงสัญญา" เป็นข้อความ
                      ใต้ช่อง แล้วพรีวิวเป็นคนตีกลับพร้อมเหตุรายช่อง (`noteOf`) — ตัวตัดสินชุดเดียว */}
                  <DateInput
                    value={opening.coversTo || ""}
                    onChange={(value) => setOpening({ coversTo: value })}
                    min={DOC_DATE_MIN}
                    max={DOC_DATE_MAX}
                    disabled={busy}
                    ariaLabel={`ครอบบริการถึงของ${OPENING_INSTALLMENT_LABEL}`}
                  />
                  <small data-bad={has("opening.coversTo") ? "yes" : undefined}>
                    {noteOf("opening.coversTo")
                      || `ต้องอยู่ในช่วงสัญญา${start && end ? ` ${fmtDate(start)}–${fmtDate(end)}` : ""} · บัญชีรับรองแล้วเปิดบริการถึงวันนี้`}
                  </small>
                </div>
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <span>วันที่รับเงิน <b className={styles.req}>*</b></span>
                  {/* ขอบ `max={todayIso}` กลืนค่าที่พิมพ์เหมือนกัน ⇒ กฎอยู่ใต้ช่อง ไม่ใช่ที่ขอบ */}
                  <DateInput
                    value={opening.paidOn || ""}
                    onChange={(value) => setOpening({ paidOn: value })}
                    min={DOC_DATE_MIN}
                    max={DOC_DATE_MAX}
                    disabled={busy}
                    ariaLabel={`วันที่รับเงินของ${OPENING_INSTALLMENT_LABEL}`}
                  />
                  <small data-bad={has("opening.paidOn") ? "yes" : undefined}>
                    {noteOf("opening.paidOn")
                      || `ต้องไม่เกินวันนี้${todayIso ? ` (${fmtDate(todayIso)})` : ""}`}
                  </small>
                </div>
                {/* ช่องไฟล์บังคับ — ติดด่านแล้วต้องเห็นจากตัวช่อง ไม่ใช่เห็นแต่ในก้อน error ด้านบน */}
                <div className={styles.field} id={historicalFieldAnchorId("opening.evidence")}>
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
                  />
                  <small data-bad={has("opening.evidence") ? "yes" : undefined}>
                    {noteOf("opening.evidence")
                      || "อย่างน้อย 1 ไฟล์ — ใบกำกับ ใบเสร็จ หรือ statement · อัปหลังบันทึกใบ"}
                  </small>
                </div>
              </div>
              <div className={styles.field}>
                <span>หมายเหตุถึงฝ่ายบัญชี</span>
                <Textarea
                  value={opening.note || ""}
                  invalid={has("opening.note")}
                  disabled={busy}
                  onChange={(event) => setOpening({ note: event.target.value })}
                  aria-label={`หมายเหตุของ${OPENING_INSTALLMENT_LABEL}`}
                />
                <small>บัญชีเห็นข้อความนี้ตอนรับรองงวด · ไม่เกิน {fmtNumber(INSTALLMENT_NOTE_MAX)} ตัวอักษร</small>
              </div>
              <p className={styles.carryHint}>
                <CheckCircle2 size={15} aria-hidden="true" />
                บัญชีรับรองงวดนี้ครั้งเดียว — รับรองแล้วเปิดบริการถึง {opening.coversTo ? fmtDate(opening.coversTo) : NA}
              </p>
            </section>
          )}

          <h4 className={styles.section}>
            งวดที่ยังต้องเก็บ
            <span className={styles.sectionKind}>ลูกค้าจ่ายแล้ว ฝ่ายขายแจ้งชำระพร้อมหลักฐาน · บัญชีรับรองทีละงวด</span>
          </h4>
          <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={900}>
            <table className="w-full text-sm">
              <thead><tr>
                <th>ชื่องวด <b className={styles.req}>*</b></th>
                <th className="num">ยอด <b className={styles.req}>*</b></th>
                <th>ครบกำหนด <b className={styles.req}>*</b></th>
                <th>ครอบบริการ ตั้งแต่ <b className={styles.req}>*</b></th>
                <th>ถึง <b className={styles.req}>*</b></th>
                <th>หมายเหตุ</th>
                <th />
              </tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key}>
                    <td>
                      <Input
                        autoComplete="off" maxLength={INSTALLMENT_LABEL_MAX}
                        value={row.label}
                        disabled={busy}
                        onChange={(event) => patchRow(row.key, { label: event.target.value })}
                        aria-label={`ชื่องวดที่ ${index + 1}`}
                      />
                    </td>
                    <td className="num">
                      <MoneyInput
                        value={row.amount}
                        disabled={busy}
                        onChange={(value) => patchRow(row.key, { amount: value })}
                        aria-label={`ยอดของงวดที่ ${index + 1}`}
                      />
                    </td>
                    <td>
                      <DateInput
                        value={row.dueDate}
                        onChange={(value) => patchRow(row.key, { dueDate: value })}
                        min={DOC_DATE_MIN}
                        max={DOC_DATE_MAX}
                        disabled={busy}
                        ariaLabel={`วันครบกำหนดของงวดที่ ${index + 1}`}
                      />
                    </td>
                    {/* ⚠️ ขอบของสองช่องนี้เคยคิดจากช่วงสัญญา/ช่องข้าง ๆ ⇒ พิมพ์วันที่หลุดช่วงแล้ว
                        ค่าหายเงียบ (ดูคอมเมนต์ที่ช่อง "ครอบบริการ ถึง" ของงวดยกมา) · ช่วงครอบที่
                        ไม่ต่อเนื่อง/หลุดสัญญา ถูกตีกลับรายแถวโดยพรีวิวพร้อมช่วงวันที่เป๊ะ ๆ อยู่แล้ว */}
                    <td>
                      <DateInput
                        value={row.coversFrom}
                        onChange={(value) => patchRow(row.key, { coversFrom: value })}
                        min={DOC_DATE_MIN}
                        max={DOC_DATE_MAX}
                        disabled={busy}
                        ariaLabel={`ครอบบริการตั้งแต่ของงวดที่ ${index + 1}`}
                      />
                    </td>
                    <td>
                      <DateInput
                        value={row.coversTo}
                        onChange={(value) => patchRow(row.key, { coversTo: value })}
                        min={DOC_DATE_MIN}
                        max={DOC_DATE_MAX}
                        disabled={busy}
                        ariaLabel={`ครอบบริการถึงของงวดที่ ${index + 1}`}
                      />
                    </td>
                    <td>
                      <Input
                        autoComplete="off"
                        value={row.note}
                        disabled={busy}
                        onChange={(event) => patchRow(row.key, { note: event.target.value })}
                        aria-label={`หมายเหตุของงวดที่ ${index + 1}`}
                      />
                    </td>
                    <td>
                      <Button
                        iconOnly size="sm" variant="quiet" disabled={busy}
                        onClick={() => setRows(rows.filter((item) => item.key !== row.key))}
                        aria-label={`ลบงวดที่ ${index + 1}`}
                        title="ลบงวด"
                        icon={<Trash2 size={15} aria-hidden="true" />}
                      />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7}><span className={styles.muted}>ยังไม่มีงวดที่ต้องเก็บ</span></td></tr>
                )}
              </tbody>
            </table>
          </TableScroll>

          <div className={styles.splitRow}>
            <Button
              size="sm" variant="quiet" disabled={busy}
              onClick={() => setRows([...rows, emptyHistoricalInstallment({ coversFrom: remainingFrom, coversTo: end })])}
              icon={<Plus size={14} aria-hidden="true" />}
            >
              เพิ่มงวด
            </Button>
            {/* ⚠️ ปุ่มลัด ไม่ใช่ค่าตั้งต้น — แผนชำระจริงของใบเก่าไม่ได้แบ่งเท่ากันทุกใบ */}
            <OptionTiles
              ariaLabel="แบ่งงวดที่เหลืออัตโนมัติ"
              options={splitOptions}
              value={null}
              onChange={applySplit}
              disabled={busy || Boolean(splitBlocked)}
            />
          </div>
          {splitBlocked ? <p className={styles.hint}>{splitBlocked}</p> : (
            <p className={styles.hint}>
              แบ่งช่วง {remainingFrom ? fmtDate(remainingFrom) : NA}–{end ? fmtDate(end) : NA} ให้ต่อเนื่องเต็มสัญญา
              และยอดรวม {remainingAmount === null ? NA : fmtMoney(remainingAmount)} พอดี — กดแล้วเขียนทับงวดที่คีย์ไว้
              {spanPartial
                ? " · ช่วงสัญญานี้ไม่ลงตัวเป็นเดือน ตัวเลือกรายเดือน/ราย 3 เดือนจึงไม่ขึ้น — กด “เพิ่มงวด” แล้วกำหนดช่วงเอง"
                : ""}
            </p>
          )}

          {check ? (
            <p className={styles.checkLine} data-bad={checkOk ? undefined : "yes"}>
              {checkOk ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              {checkOk
                ? `ยอดครบ ${fmtMoney(total)} · ช่วงบริการต่อเนื่องถึง ${fmtDate(end)} ไม่มีช่องโหว่`
                : `ยอดงวดรวม ${fmtMoney(check.installmentSum)} · ${check.sumMatches ? "ช่วงบริการยังไม่ต่อเนื่องเต็มสัญญา" : `ยอดใบ ${fmtMoney(total)}`} — แก้ให้ครบก่อนไปขั้นถัดไป`}
            </p>
          ) : (
            /* ⭐ ยังไม่มีแผน = ยังไม่มีด่าน แต่ **ต้องมีตัวเลขให้ผู้คีย์เล็ง** (รีวิว R7) —
               ผลรวมงวดกับส่วนต่างคิดเองได้จากของที่อยู่บนฟอร์ม · ความต่อเนื่องของช่วงครอบ
               ยังเป็นของพรีวิวอย่างเดียว (กฎการครอบอยู่ที่ server ตัวเดียว) */
            <p className={styles.hint}>
              {moneyView.ok
                ? `ยอดงวดรวมตอนนี้ ${fmtMoney(localSum.sum)} · ยอดใบ ${fmtMoney(total)}${
                  localSum.diff === 0 ? " — ตรงแล้ว" : ` — ${localSum.diff > 0 ? "ยังขาด" : "เกิน"} ${fmtMoney(Math.abs(localSum.diff))}`
                } · ความต่อเนื่องของช่วงบริการตรวจตอนกด “${HISTORICAL_NEXT_BUTTON_LABEL}”`
                : `บรรทัดตรวจยอด/ช่วงบริการขึ้นเมื่อ${moneyView.reason}`}
            </p>
          )}
        </>
      )}
    </>
  );
}
