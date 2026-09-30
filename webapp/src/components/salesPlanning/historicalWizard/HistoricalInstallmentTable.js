"use client";
// ── ตารางงวดของขั้น ③ (มติเจ้าของ 25/09 — ม็อก Step3New) ───────────────────────────────────────
//
// ⭐ วาดจาก **ห่วงโซ่** (`historicalInstallmentChain`) เท่านั้น — ช่วงเริ่มของแต่ละงวดต่อจากงวดก่อนเอง ·
//   งวดสุดท้ายรับยอดที่เหลือและถึงวันสิ้นสุดสัญญาเอง (ล็อกพร้อมป้ายบอกเหตุ) · งวดยกมาเป็นแถวแรก (งวดที่ 1)
//   เลขงวดในคอลัมน์ = เลขงวดของใบบนหน้าใบสั่งขาย (0379 เรียงงวดยกมาก่อน)
// ⚠️ ทำไมไม่ใช้ `QuotationInstallments` (ตัวแก้งวด "ตัวเดียวของระบบ" ของหน้าใบสั่งขาย — ข้อยกเว้นตามกฎ AGENTS.md
//   ต้องมีเหตุด้านข้อมูล): (1) ช่วงครอบต่อเป็นห่วงโซ่ + งวดสุดท้ายคิดให้ — ตัวนั้นให้กรอกช่วงเองทุกงวด
//   (2) ตัวนั้นรับไม่เกิน 12 งวด แต่สัญญา 24/36 เดือนเก็บรายเดือนมีจริงในชีต (3) ตัวนั้นขึ้นแดงสดระหว่างพิมพ์
//   ขัดมติ "แดงหลังกดถัดไป" ของฟอร์มนี้ (4) ยอด ±1 สตางค์ ≥ 0 ของ 0374 ไม่ใช่กฎ < 0.005 ของตัวนั้น
//   ⇒ หน้าปรับงวดหลังอนุมัติของใบสั่งขายไม่ถูกแตะเลย
// ⚠️ ข้อความใต้ช่องมาจากผู้เรียก (`historicalInstallmentIssues` — ผูกกับ key ของงวด ไม่ใช่ลำดับ)
// ⚠️ วันวางบิลเป็นช่องวันเฉย ๆ (ไม่ยืม InstallmentDateEditor — ต้องมี hook โหมดตั้งวัน + id งวด · ไม่มี 'รอเหตุการณ์'
//   เพราะงวดของใบย้อนหลังต้องมีวันครบกำหนด) · PR-D (mig 0394/P7) · คอลัมน์ขึ้นตามธง `billingColumn` ของผู้เรียก
//   (`historicalBillingColumn` — ตัวตัดสินเดียว) · ไม่บังคับ ⇒ หัวไม่มีดาว · งวดยกมา = ขีด (CHECK ของ 0389)
import { useState } from "react";
import { Lock, MessageSquarePlus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import StatusBadge from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import { TableScroll } from "@/components/ui/Table";
import { NA, fmtDate, fmtNumber } from "@/lib/format";
import { DOC_DATE_MAX, DOC_DATE_MIN, INSTALLMENT_NOTE_MAX, OPENING_INSTALLMENT_LABEL } from "@/lib/sales/historicalOrders";
import { HISTORICAL_BILLING_TEXT, INSTALLMENT_LABEL_MAX, historicalFieldAnchorId } from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

/* ยอดในตาราง = ตัวเลขล้วนแบบช่องกรอก (ไม่มี ฿) ⇒ ค่าล็อก/งวดยกมาอ่านเป็นคอลัมน์เดียวกับช่องที่พิมพ์ได้ */
const amountText = (value) => fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctText = (value) => (value === null || value === undefined
  ? null : `${fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

/**
 * @param chain      ผลของ `historicalInstallmentChain` (ตัวเดียวกับที่ body ส่งขึ้น API)
 * @param rowIssues  `Map<rowKey, { label?, amount?, dueDate?, coversTo?, coverage?, note?, billingDate?, row? }>`
 * @param onPatch    `(key, patch)` แก้ค่าที่พิมพ์ของงวดหนึ่ง
 * @param onRemove   `(key)` ลบงวด (ไม่ถาม — ห่วงโซ่คิดใหม่เอง · งวดบนกลายเป็นงวดสุดท้ายที่คิดให้)
 * @param emptyText  ข้อความของตารางว่าง
 * @param billingColumn วาดคอลัมน์ "วันวางบิล" (ไม่บังคับ) ต่อจากครบกำหนด — ปิด = ตารางเดิมทุกช่อง
 * @param billingReadOnly คอลัมน์ขึ้นเพราะวันเดิมเท่านั้น (ลูกค้าไม่ต้องวางบิล / อ่านกติกาไม่ได้ — `historicalBillingColumn().readOnly`)
 *   ⇒ วันเดิมเป็นข้อความ + ปุ่ม "ล้าง" (review 29/09 — server ตีกลับวันใหม่ของกรณีนี้ · ล้างผ่านเสมอ)
 */
export default function HistoricalInstallmentTable({
  chain, rowIssues = new Map(), onPatch, onRemove, busy = false, emptyText = "ยังไม่มีงวด", billingColumn = false, billingReadOnly = false,
}) {
  /* หมายเหตุรายงวดเปิดด้วยปุ่มท้ายแถว — ไม่ใช่คอลัมน์ถาวร (ม็อก: คอลัมน์หมายเหตุว่างเกือบทุกแถวแต่กินที่ทั้งตาราง) */
  const [notesOpen, setNotesOpen] = useState(() => new Set());
  const rows = chain?.rows || [];
  const opening = chain?.mode === "part" ? chain.opening : null;
  const toggleNote = (key) => setNotesOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    /* ⚠️ 960 = คอลัมน์คงที่ ~47rem + รายละเอียดอย่างน้อย ~13rem · จอแคบกว่านั้นเลื่อนข้าง (แบบตัวแก้งวดของหน้าใบสั่งขาย)
       🐞 UAT 25/09 จอ 390: ที่ 860 ช่องรายละเอียดถูกบีบเหลือ "งวด :" · คอลัมน์วันวางบิล (PR-D) = 1064 = ผลรวมจริงของคอลัมน์
       🐞 review 29/09: 1100 ล้นตัวเลื่อนของการ์ดที่ 1440 (1070) ⇒ ปุ่มลบงวดถูกตัดครึ่ง · ใต้ `data-billing` คอลัมน์แคบลง
          (จำนวนเงิน/ครบกำหนด 9.5 · วันวางบิล 11 · ครอบคลุม 14.5rem — CSS) รวม 66.5rem */
    <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={billingColumn ? 1064 : 960}>
      <table className={`w-full text-sm ${styles.instTable}`} data-billing={billingColumn ? "yes" : undefined}>
        <thead><tr>
          <th className={styles.instSeq}>งวด</th>
          <th className={styles.instLabel}>รายละเอียด <b className={styles.req}>*</b></th>
          <th className={`num ${styles.instAmount}`}>จำนวนเงิน <b className={styles.req}>*</b></th>
          <th className={styles.instDue}>ครบกำหนด <b className={styles.req}>*</b></th>
          {billingColumn ? (
            <th className={`${styles.instBill} ${styles.instBillHead}`}>
              {HISTORICAL_BILLING_TEXT.head}
              <small>{HISTORICAL_BILLING_TEXT.sub}</small>
            </th>
          ) : null}
          <th className={styles.instCover}>ครอบคลุมบริการ <b className={styles.req}>*</b></th>
          <th className={styles.instActions}><span className="sr-only">จัดการงวด</span></th>
        </tr></thead>
        <tbody>
          {opening ? (
            /* งวดยกมา — แถวอ่านอย่างเดียว (แก้ที่การ์ด "เงินที่เก็บก่อนเข้าระบบ") */
            <tr className={styles.instOpening}>
              <td className={styles.instSeq}>{opening.seq}</td>
              <td>
                <span className={styles.instTag}>
                  <b>{OPENING_INSTALLMENT_LABEL}</b>
                  <StatusBadge tone="info" label="ยกมา" title="แก้ยอด วันที่ และหลักฐานที่การ์ด “เงินที่เก็บก่อนเข้าระบบ”" />
                </span>
              </td>
              <td className="num">
                <span className={styles.instMoney}>{opening.amount === null ? NA : amountText(opening.amount)}</span>
                {pctText(opening.percent) ? <small className={styles.instSub}>{pctText(opening.percent)}</small> : null}
              </td>
              <td><span className={styles.instTag}>{NA}</span></td>
              {billingColumn ? <td><span className={styles.instTag}>{NA}</span></td> : null}
              <td>
                <span className={styles.instTag}>
                  {opening.coversFrom ? fmtDate(opening.coversFrom) : NA} – {opening.coversTo ? fmtDate(opening.coversTo) : NA}
                </span>
              </td>
              <td />
            </tr>
          ) : null}
          {rows.map((row) => {
            const bad = rowIssues.get(row.key) || {};
            const name = `งวดที่ ${row.seq}`;
            /* หมายเหตุที่มีข้อความ/มีข้อผิด = เปิดค้าง (ซ่อนแล้วข้อความหายจากตา) — ปุ่มพาไปที่ช่องแทนการซ่อน (รีวิว 25/09) */
            const noteForced = Boolean(row.note) || Boolean(bad.note);
            const noteShown = notesOpen.has(row.key) || noteForced;
            const anchor = (slot) => historicalFieldAnchorId(`installments.${row.index}.${slot}`);
            return (
              <tr key={row.key} className={row.last ? styles.instLast : undefined}>
                <td className={styles.instSeq}>{row.seq}</td>
                <td>
                  <div id={anchor("label")}>
                    <Input
                      autoComplete="off"
                      maxLength={INSTALLMENT_LABEL_MAX}
                      value={row.label}
                      invalid={Boolean(bad.label)}
                      disabled={busy}
                      placeholder="เช่น งวด 3/12 หรือ มัดจำ 30%"
                      onChange={(event) => onPatch?.(row.key, { label: event.target.value })}
                      aria-label={`รายละเอียด${name}`}
                    />
                  </div>
                  {bad.label ? <span className={styles.cellBad}>{bad.label}</span> : null}
                  {noteShown ? (
                    <div className={styles.instNote} id={anchor("note")}>
                      <Textarea
                        value={row.note}
                        invalid={Boolean(bad.note)}
                        disabled={busy}
                        placeholder={`ไม่บังคับ — เช่น ชำระหลังติดตั้ง · ไม่เกิน ${fmtNumber(INSTALLMENT_NOTE_MAX)} ตัวอักษร`}
                        onChange={(event) => onPatch?.(row.key, { note: event.target.value })}
                        aria-label={`หมายเหตุ${name}`}
                      />
                      {bad.note ? <span className={styles.cellBad}>{bad.note}</span> : null}
                    </div>
                  ) : null}
                  {bad.row ? <span className={styles.cellBad}>{bad.row}</span> : null}
                </td>
                <td className="num" id={anchor("amount")}>
                  {row.last ? (
                    /* งวดสุดท้ายรับยอดที่เหลือ (มติเจ้าของ 25/09 ข้อ 2) — ล็อกพร้อมเหตุ ไม่ใช่ช่องที่พิมพ์ได้แล้วถูกเขียนทับ */
                    <span className={styles.instLocked} title="งวดสุดท้ายรับยอดที่เหลือ — แก้ยอดงวดก่อนหน้าแทน">
                      <Lock size={12} aria-hidden="true" />
                      {row.amount === null ? NA : amountText(row.amount)}
                    </span>
                  ) : (
                    <MoneyInput
                      value={row.amountText}
                      className={bad.amount ? "is-invalid" : ""}
                      aria-invalid={bad.amount ? "true" : undefined}
                      disabled={busy}
                      onChange={(value) => onPatch?.(row.key, { amount: value ?? "" })}
                      aria-label={`จำนวนเงิน${name}`}
                    />
                  )}
                  <small className={styles.instSub}>
                    {[row.last ? "ยอดที่เหลือ — คิดให้" : null, pctText(row.percent)].filter(Boolean).join(" · ") || null}
                  </small>
                  {bad.amount ? <span className={styles.cellBad}>{bad.amount}</span> : null}
                </td>
                <td id={anchor("dueDate")}>
                  <DateInput
                    compact
                    value={row.dueDate}
                    invalid={Boolean(bad.dueDate)}
                    onChange={(value) => onPatch?.(row.key, { dueDate: value })}
                    min={DOC_DATE_MIN}
                    max={DOC_DATE_MAX}
                    disabled={busy}
                    ariaLabel={`วันครบกำหนด${name}`}
                  />
                  {row.overdue ? <small className={styles.instOverdue}>เลยกำหนดแล้ว</small> : null}
                  {bad.dueDate ? <span className={styles.cellBad}>{bad.dueDate}</span> : null}
                </td>
                {billingColumn ? (
                  <td id={anchor("billingDate")}>
                    {billingReadOnly ? (
                      /* review 29/09: วันเดิมของลูกค้าที่ตั้งวันใหม่ไม่ได้ — ข้อความ + ล้าง (ไม่ใช่ช่องที่พิมพ์แล้วโดนตีกลับ) */
                      <span className={styles.instBillLocked}>
                        <span className={styles.instTag}>{row.billingDate ? fmtDate(row.billingDate) : NA}</span>
                        {row.billingDate ? (
                          <Button
                            size="sm" variant="quiet" disabled={busy}
                            onClick={() => onPatch?.(row.key, { billingDate: "" })}
                            aria-label={HISTORICAL_BILLING_TEXT.clearAria(name)}
                          >
                            {HISTORICAL_BILLING_TEXT.clear}
                          </Button>
                        ) : null}
                      </span>
                    ) : (
                      <DateInput
                        compact
                        value={row.billingDate}
                        invalid={Boolean(bad.billingDate)}
                        onChange={(value) => onPatch?.(row.key, { billingDate: value })}
                        min={DOC_DATE_MIN}
                        max={DOC_DATE_MAX}
                        disabled={busy}
                        ariaLabel={HISTORICAL_BILLING_TEXT.aria(name)}
                      />
                    )}
                    {bad.billingDate ? <span className={styles.cellBad}>{bad.billingDate}</span> : null}
                  </td>
                ) : null}
                <td id={anchor("coversTo")}>
                  <div className={styles.instCoverLine}>
                    <span className={styles.instFrom}>{row.coversFrom ? `${fmtDate(row.coversFrom)} –` : `${NA} –`}</span>
                    {row.last ? (
                      <span className={styles.instLocked} title="งวดสุดท้ายครอบถึงวันสิ้นสุดสัญญาเสมอ">
                        {row.coversTo ? fmtDate(row.coversTo) : NA}
                        <Lock size={12} aria-hidden="true" />
                      </span>
                    ) : (
                      /* ⚠️ ขอบเหลือช่วงเอกสาร 2000–2100 เท่านั้น — ขอบที่คิดจากสัญญา/งวดข้าง ๆ กลืนค่าที่พิมพ์เงียบ ๆ
                         (UAT 23/09) · กฎของช่วงเป็นข้อความใต้ช่อง (`historicalMoneyIssues`) */
                      <DateInput
                        compact
                        value={row.coversToText}
                        invalid={Boolean(bad.coversTo || bad.coverage)}
                        onChange={(value) => onPatch?.(row.key, { coversTo: value })}
                        min={DOC_DATE_MIN}
                        max={DOC_DATE_MAX}
                        disabled={busy}
                        ariaLabel={`ครอบคลุมบริการถึง${name}`}
                      />
                    )}
                  </div>
                  {row.last ? <small className={styles.instSub}>ถึงวันสิ้นสุดสัญญา</small> : null}
                  {bad.coversTo ? <span className={styles.cellBad}>{bad.coversTo}</span> : null}
                  {bad.coverage ? <span className={styles.cellBad}>{bad.coverage}</span> : null}
                </td>
                <td className={styles.instActions}>
                  <Button
                    iconOnly size="sm" variant="quiet" disabled={busy}
                    aria-expanded={noteShown}
                    aria-label={`หมายเหตุ${name}`}
                    title={noteForced ? "หมายเหตุมีข้อความ — ลบข้อความเพื่อซ่อน" : (noteShown ? "ซ่อนหมายเหตุ" : "เพิ่มหมายเหตุ")}
                    onClick={() => {
                      if (noteForced) {
                        document.getElementById(anchor("note"))?.querySelector("textarea")?.focus();
                        return;
                      }
                      toggleNote(row.key);
                    }}
                    icon={<MessageSquarePlus size={14} aria-hidden="true" />}
                  />
                  <Button
                    iconOnly size="sm" variant="quiet" tone="danger" disabled={busy}
                    aria-label={`ลบ${name}`}
                    title="ลบงวด — งวดที่เหลือต่อช่วงกันใหม่เอง"
                    onClick={() => onRemove?.(row.key)}
                    icon={<Trash2 size={14} aria-hidden="true" />}
                  />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr><td colSpan={billingColumn ? 7 : 6} className={styles.instEmpty}>{emptyText}</td></tr>
          ) : null}
        </tbody>
      </table>
    </TableScroll>
  );
}
