"use client";
import { useState } from "react";
import { TableScroll } from "@/components/ui/Table";

import { CalendarClock, Lock, Plus, Trash2 } from "lucide-react";
import {
  MAX_INSTALLMENTS,
  computeInstallments,
  evenPercents,
  paymentScheduleRows,
} from "@/lib/sales/paymentPlan";
import {
  REPLAN_VAT_NOTE, monthlyDueDates, replanEvenAmounts, replanEvenPercents, replanSwitchUnit,
} from "@/lib/sales/installmentReplan";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import ReadableText from "@/components/ui/ReadableText";
import StatusBadge from "@/components/ui/StatusBadge";
import { fmtDate, fmtMoney, fmtNumber, fmtPercent, NA } from "@/lib/format";
import styles from "./QuotationPaymentTerms.module.css";

// คอลัมน์ "%" มีสัญลักษณ์อยู่ที่หัวตารางแล้ว ⇒ ในเซลล์พิมพ์ตัวเลขเปล่า 2 ตำแหน่ง
const pctText = (value) => fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_INSTALLMENTS = () => evenPercents(2).map((percent, index) => ({
  label: index === 0 ? "มัดจำ" : "งวดสุดท้าย",
  percent,
  note: "",
}));

/* ══ โหมด "replan" — ปรับแผนงวดของใบสั่งขายที่อนุมัติแล้ว (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติ D1) ═══
   ⭐ ตัวแก้งวด **ตัวเดียว** ของระบบ (กฎ AGENTS.md: ฟอร์มเดียวหลายทางเรียก · ต่างกันแค่โหมดผ่าน props) —
     โหมดใบเสนอราคาแก้ "แผน" (สัดส่วนล้วน ไม่มีวัน) · โหมดนี้แก้ "งวดจริง" ของใบ SO:
       · แถวล็อก (มีเงิน/เอกสารผูก) อ่านอย่างเดียวพร้อมเหตุ — `lockOf(row)` ของกฎ AGENTS.md มาจาก lib (`row.lock`)
       · ใส่เป็นบาทหรือ % (ChoiceChips) · วันครบกำหนดรายงวด + ตัวช่วยรายเดือน · ช่วงครอบ (ใบสายบริการ)
       · ยอดรวมวิ่งเทียบยอดใบ "ต้องเท่ากันพอดี" + คงเหลือให้แบ่ง
   ⚠️ ข้อยกเว้นที่มีเหตุผลด้านข้อมูล: โหมดนี้ **ไม่มีสวิตช์ "แบ่งชำระ/เต็มจำนวน"** — งวดจริงของใบมีตัวตน (id · สถานะ · หลักฐาน)
     สลับเป็น "เต็มจำนวน" คือลบงวดที่มีเงินทิ้ง ซึ่ง RPC ปฏิเสธอยู่แล้ว · ผลรวมจึงเป็นยอดเงิน ไม่ใช่ % (Σ = ยอดใบถึงสตางค์)
   ⚠️ คำนวณทุกอย่างที่ `buildReplanRows` (ผู้เรียกส่ง `view` + `totals` มา) — ตัวนี้แค่วาดและแก้ร่าง ไม่ตัดสินเอง
   @param view    แถวสุดท้ายทั้งใบเรียงตามเลขงวด (`buildReplanRows().view`) — แถวเปิดชี้กลับร่างด้วย `draftIndex`
   @param value   ร่างของแถวเปิด (ลำดับในตัวแก้ = ลำดับเลขงวด) · `onChange(nextDraft)` */
const REPLAN_UNITS = [
  { value: "amount", label: "ใส่เป็นบาท" },
  { value: "percent", label: "ใส่เป็น %" },
];
const BLANK_ROW = () => ({ id: null, label: "", amount: null, percent: null, dueDate: "", coversFrom: "", coversTo: "", note: "" });

function ReplanInstallments({
  view = [],
  value = [],
  onChange,
  entryUnit = "amount",
  onEntryUnitChange,
  totals = null,
  showCoverage = false,
  disabled = false,
}) {
  const [firstDue, setFirstDue] = useState("");
  const draft = Array.isArray(value) ? value : [];
  const rows = Array.isArray(view) ? view : [];
  const update = (next) => { if (!disabled) onChange?.(next); };
  const patchRow = (index, patch) => update(draft.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index) => update(draft.filter((_, i) => i !== index));
  const addRow = () => update([...draft, BLANK_ROW()]);
  const lockedPercent = rows.filter((row) => row.lock).reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  /* เกลี่ย "ที่เหลือหลังหักงวดล็อก" เท่ากัน — ปัดลงรายสตางค์/0.01% งวดสุดท้ายรับเศษ (กติกาเดียวกับ evenPercents) */
  const evenSplit = () => {
    if (!draft.length) return;
    if (entryUnit === "percent") {
      const percents = replanEvenPercents(100 - lockedPercent, draft.length);
      update(draft.map((row, i) => ({ ...row, percent: percents[i] })));
    } else {
      const amounts = replanEvenAmounts((totals?.total || 0) - (totals?.locked || 0), draft.length);
      update(draft.map((row, i) => ({ ...row, amount: amounts[i] })));
    }
  };
  // วันเดียวกันของทุกเดือนนับจากงวดแรกที่ปรับ (เดือนที่สั้นกว่าใช้วันสุดท้าย) — เป็นปุ่มให้คนกด ไม่ใช่ค่าตั้งต้นเงียบ ๆ
  const fillMonthly = () => {
    const dates = monthlyDueDates(firstDue, draft.length);
    if (dates.length) update(draft.map((row, i) => ({ ...row, dueDate: dates[i] })));
  };
  /* สลับหน่วย: ร่างรับทั้งยอดและสัดส่วนล่าสุดก่อน ⇒ ตัวเลขที่ตาเห็นไม่กระโดด */
  const switchUnit = (unit) => {
    if (!unit || unit === entryUnit || disabled) return;
    update(replanSwitchUnit(draft, rows));
    onEntryUnitChange?.(unit);
  };
  const balanced = totals ? Math.abs(Number(totals.remaining) || 0) < 0.005 : false;
  const colCount = 7 + (showCoverage ? 1 : 0);

  return (
    <>
      <div className={styles.paymentHeading}>
        <div className={styles.paymentTitle}>
          <CalendarClock size={17} aria-hidden="true" />
          <h2>งวดการชำระ</h2>
        </div>
        <div className="spacer" />
        <ChoiceChips value={entryUnit} onChange={switchUnit} options={REPLAN_UNITS} disabled={disabled}
          ariaLabel="หน่วยที่ใช้กรอกยอดงวด" />
      </div>

      <div className={styles.installmentPanel}>
        <div className={`toolbar ${styles.replanToolbar}`}>
          <Button variant="quiet" size="sm" icon={<Plus size={13} aria-hidden="true" />}
            disabled={disabled || rows.length >= MAX_INSTALLMENTS} onClick={addRow}>เพิ่มงวด</Button>
          <Button variant="quiet" size="sm" disabled={disabled || !draft.length} onClick={evenSplit}>
            เกลี่ยยอดที่เหลือเท่ากัน
          </Button>
          <div className="spacer" />
          {totals ? (
            <span role="status" className={styles.replanSum}>
              <StatusBadge tone={balanced ? "success" : "danger"} showIcon={false}
                label={`รวม ${fmtMoney(totals.sum)} / ยอดใบ ${fmtMoney(totals.total)} (ต้องเท่ากันพอดี)`
                  + ` · คงเหลือให้แบ่ง ${fmtMoney(totals.remaining)}`} />
            </span>
          ) : null}
        </div>
        <div className={styles.replanDue}>
          <span>ครบกำหนดรายเดือน เริ่มงวดแรกที่ปรับ</span>
          <DateInput compact value={firstDue} onChange={setFirstDue} disabled={disabled}
            ariaLabel="วันครบกำหนดของงวดแรกที่ปรับ" />
          <Button variant="quiet" size="sm" disabled={disabled || !firstDue || !draft.length} onClick={fillMonthly}>
            ตั้งทุกงวดวันเดียวกันของเดือนถัดไป
          </Button>
        </div>
        <p className="form-note">{REPLAN_VAT_NOTE}</p>

        <TableScroll surface="auto" family="editable" cells="stacked" minWidth={showCoverage ? 1040 : 860}>
          <table className={styles.replanTable}>
            <thead>
              <tr>
                <th className={styles.replanSeq}>งวด</th>
                <th>รายละเอียด</th>
                <th className={styles.replanPct}>%</th>
                <th className={`num ${styles.replanAmount}`}>จำนวนเงิน</th>
                <th>ครบกำหนด</th>
                {showCoverage ? <th>ครอบคลุมบริการ</th> : null}
                <th>หมายเหตุ</th>
                <th aria-label="ลบงวด" />
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => {
                const index = row.draftIndex;
                const entry = index === null || index === undefined ? null : draft[index];
                const name = `งวดที่ ${row.seq}`;
                if (row.lock || !entry) {
                  return (
                    <tr key={row.id || `locked-${row.seq}`} className={styles.replanLocked}>
                      <td className={styles.rowNumber}>{row.seq}</td>
                      <td>
                        <strong>{row.label}</strong>
                        <StatusBadge size="sm" tone="neutral" icon={Lock} label={row.lock || "ล็อก"} />
                      </td>
                      <td className="mono">{pctText(row.percent)}</td>
                      <td className="num mono">{fmtMoney(row.amount)}</td>
                      <td>{row.dueDate ? fmtDate(row.dueDate) : NA}</td>
                      {showCoverage ? (
                        <td>{row.coversFrom || row.coversTo
                          ? `${row.coversFrom ? fmtDate(row.coversFrom) : "…"} – ${row.coversTo ? fmtDate(row.coversTo) : "…"}`
                          : NA}</td>
                      ) : null}
                      <td><ReadableText text={row.note} lines={2} empty={NA} /></td>
                      <td />
                    </tr>
                  );
                }
                return (
                  <tr key={row.id || `new-${index}`}>
                    <td className={styles.rowNumber}>{row.seq}</td>
                    <td>
                      <Input value={entry.label || ""} placeholder={name} disabled={disabled} aria-label={`ชื่อ${name}`}
                        onChange={(event) => patchRow(index, { label: event.target.value })} />
                    </td>
                    <td>
                      {entryUnit === "percent" ? (
                        /* ⚠️ ช่องกรอกต้องได้ค่าดิบ — จัดรูปแบบใน value แล้วผู้ใช้พิมพ์ต่อไม่ได้ (กติกาเดียวกับโหมดใบเสนอราคา) */
                        <Input type="number" min="0" max="100" step="0.01" mono value={entry.percent ?? ""}
                          disabled={disabled} aria-label={`สัดส่วน${name}`}
                          onChange={(event) => patchRow(index, { percent: event.target.value })} />
                      ) : <span className="mono">{pctText(row.percent)}</span>}
                    </td>
                    <td className="num mono">
                      {entryUnit === "amount" ? (
                        <MoneyInput value={entry.amount} disabled={disabled} aria-label={`ยอด${name}`}
                          onChange={(amount) => patchRow(index, { amount })} />
                      ) : fmtMoney(row.amount)}
                    </td>
                    <td>
                      <DateInput compact value={entry.dueDate || ""} disabled={disabled} ariaLabel={`ครบกำหนด${name}`}
                        onChange={(iso) => patchRow(index, { dueDate: iso })} />
                    </td>
                    {showCoverage ? (
                      <td>
                        <span className={styles.replanCover}>
                          <DateInput compact value={entry.coversFrom || ""} disabled={disabled}
                            ariaLabel={`ครอบบริการตั้งแต่ · ${name}`} onChange={(iso) => patchRow(index, { coversFrom: iso })} />
                          <DateInput compact value={entry.coversTo || ""} disabled={disabled}
                            ariaLabel={`ครอบบริการถึง · ${name}`} onChange={(iso) => patchRow(index, { coversTo: iso })} />
                        </span>
                      </td>
                    ) : null}
                    <td>
                      <Input value={entry.note || ""} placeholder="เช่น หลังติดตั้ง" disabled={disabled} aria-label={`หมายเหตุ${name}`}
                        onChange={(event) => patchRow(index, { note: event.target.value })} />
                    </td>
                    <td>
                      <Button iconOnly variant="quiet" tone="danger" size="sm" disabled={disabled}
                        icon={<Trash2 size={14} aria-hidden="true" />} aria-label={`ลบ${name}`}
                        onClick={() => removeRow(index)} />
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={colCount} className={styles.rowNumber}>ยังไม่มีงวด — กด “เพิ่มงวด”</td></tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>
    </>
  );
}

export default function QuotationInstallments({
  value,
  onChange,
  totalAmount,
  disabled = false,
  // โหมด "replan" (ปรับแผนงวดของใบสั่งขายที่อนุมัติแล้ว) — ดู ReplanInstallments ข้างบน
  mode = "quotation",
  view,
  entryUnit,
  onEntryUnitChange,
  totals,
  showCoverage = false,
}) {
  if (mode === "replan") return <ReplanInstallments view={view} value={value} onChange={onChange} entryUnit={entryUnit}
    onEntryUnitChange={onEntryUnitChange} totals={totals} showCoverage={showCoverage} disabled={disabled} />;
  const payment = {
    type: value?.type === "installment" ? "installment" : "full",
    paymentMethod: value?.paymentMethod || "",
    paymentTerms: value?.paymentTerms || "",
    installments: Array.isArray(value?.installments) ? value.installments : [],
    presetVersionId: value?.presetVersionId || null,
  };
  const split = payment.type === "installment";
  const rows = paymentScheduleRows(payment);
  // ⚠️ เก็บเป็น "ตัวเลขดิบ" — ตัวนี้เป็นตัวตัดสินสี/ข้อความเตือนด้านล่าง (Math.abs(pctSum - 100))
  // การปัดตรงนี้คือกันขยะทศนิยมของ float ไม่ใช่การจัดรูปแบบ · จัดรูปแบบเฉพาะตอนพิมพ์
  const pctSum = split
    ? Math.round(rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0) * 100) / 100
    : 100;
  const amounts = computeInstallments(totalAmount, rows);

  const update = (patch) => {
    if (!disabled) onChange?.({ ...payment, ...patch });
  };
  const updateInstallment = (index, patch) => update({
    installments: payment.installments.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )),
  });
  const switchType = () => update(split
    ? { type: "full", installments: [] }
    : { type: "installment", installments: DEFAULT_INSTALLMENTS() });
  const addInstallment = () => update({
    installments: payment.installments.length >= MAX_INSTALLMENTS
      ? payment.installments
      : [...payment.installments, { label: "", percent: 0, note: "" }],
  });
  const removeInstallment = (index) => update({
    installments: payment.installments.length <= 2
      ? payment.installments
      : payment.installments.filter((_, rowIndex) => rowIndex !== index),
  });
  const recalcEven = () => {
    const percents = evenPercents(payment.installments.length);
    update({
      installments: payment.installments.map((row, index) => ({
        ...row,
        percent: percents[index],
      })),
    });
  };

  return (
    <>
      <div className={styles.paymentHeading}>
        <div className={styles.paymentTitle}>
          <CalendarClock size={17} aria-hidden="true" />
          <h2>งวดการชำระ</h2>
        </div>
        <div className="spacer" />
        <button
          type="button"
          role="switch"
          aria-checked={split}
          className={`${styles.installmentToggle} ${split ? styles.installmentOn : ""}`.trim()}
          disabled={disabled}
          onClick={switchType}
        >
          <span className={styles.toggleTrack}><span /></span>
          <span><strong>แบ่งชำระเป็นงวด</strong><small>{split ? "เปิดใช้งาน" : "ปิด · ชำระเต็มจำนวน"}</small></span>
        </button>
      </div>

      <div className={styles.installmentPanel}>
        <div className="toolbar" style={{ gap: 8 }}>
          {split && !disabled && (
            <>
              <button type="button" className="btn ghost sm" disabled={rows.length >= MAX_INSTALLMENTS} onClick={addInstallment}><Plus size={13} aria-hidden="true" /> เพิ่มงวด</button>
              <button type="button" className="btn ghost sm" onClick={recalcEven}>เกลี่ย % เท่ากัน</button>
            </>
          )}
          <div className="spacer" />
          <span className="ui-badge" style={{ color: Math.abs(pctSum - 100) < 0.01 ? "var(--green)" : "var(--red)" }}>
            รวม {fmtPercent(pctSum)}{Math.abs(pctSum - 100) < 0.01 ? "" : " (ต้อง 100%)"}
          </span>
        </div>
        {/* ⚠️ คลาสการ์ดเก่าอยู่บน TableScroll เอง ไม่ใช่ div ที่ห่ออีกชั้น (2026-09-07)
            เหตุผลเดียวกับ QuotationLineItems — กรอบมนซ้อนกันสามชั้นบนหน้าเดียวกัน
            ยุบทิ้งเฉย ๆ ไม่ได้เพราะเซลล์กินสไตล์จาก `.premium-glass-table tbody td` */}
        <TableScroll surface="embedded" family="editable" className={`premium-glass-table table-responsive ${styles.installmentScroll}`}><table className="w-full text-sm">
          <thead>
            <tr>
              <th style={{ width: 40 }}>งวด</th>
              <th>รายละเอียด</th>
              <th style={{ width: 90 }}>%</th>
              <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
              <th>หมายเหตุ</th>
              {split && !disabled && <th style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="premium-row">
                <td className={styles.rowNumber}>{index + 1}</td>
                <td>{split
                  ? disabled
                    ? <div className="readable-field is-compact"><ReadableText text={row.label} lines={2} empty={<span className="readable-field-empty">งวดที่ {index + 1}</span>} /></div>
                    : <input className="premium-input" value={row.label} placeholder={`งวดที่ ${index + 1}`} onChange={(event) => updateInstallment(index, { label: event.target.value })} />
                  : <span className={styles.readonlyValue}>{row.label}</span>}</td>
                <td>{split
                  ? disabled
                    ? <span className={`${styles.readonlyValue} mono`}>{pctText(row.percent)}</span>
                    /* ⚠️ ช่องกรอกต้องได้ค่าดิบ — จัดรูปแบบใน value แล้วผู้ใช้พิมพ์ต่อไม่ได้ */
                    : <input type="number" min="0" max="100" step="0.01" className="premium-input mono" value={row.percent} onChange={(event) => updateInstallment(index, { percent: event.target.value })} />
                  : <span className={`${styles.readonlyValue} mono`}>{pctText(100)}</span>}</td>
                <td className="num mono">{fmtMoney(amounts[index]?.amount || 0)}</td>
                <td>{split
                  ? disabled
                    ? <div className="readable-field is-compact"><ReadableText text={row.note} lines={3} empty={<span className="readable-field-empty">{NA}</span>} /></div>
                    : <input className="premium-input" value={row.note} placeholder="เช่น ก่อนเริ่มงาน" onChange={(event) => updateInstallment(index, { note: event.target.value })} />
                  : <span className={styles.readonlyValue}>{NA}</span>}</td>
                {split && !disabled && (
                  <td><button type="button" className="btn-icon danger" disabled={rows.length <= 2} onClick={() => removeInstallment(index)} aria-label={`ลบงวด ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table></TableScroll>
      </div>
    </>
  );
}
