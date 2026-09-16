"use client";
// ── ขั้น ③ งวดและด่านเงิน ──────────────────────────────────────────────────────
//
// ⭐ **คีย์เฉพาะงวดที่ยังต้องเก็บ** (คำตอบข้อ 2) — งวดที่เก็บเงินนอกระบบไปแล้วไม่ต้องคีย์
//    ใช้สวิตช์ยกเว้นด่านเงินแทน · งวดที่เลยกำหนดเป็น **คำเตือน** ของพรีวิว ไม่ใช่ตัวบล็อกปุ่ม
// 🪤 ห้ามส่งคีย์ `status` ไปกับงวด — plan ตีกลับทุกค่าที่ไม่ใช่ `pending` และป้ายบนจอคือ
//    "รอชำระ" ตายตัว (มติข้อ 13: คำว่า "รอบัญชียืนยัน" เหลืออยู่แค่ในข้อความ error)
// ⭐ ใบยอด 0 = สวิตช์เปิดล็อก + เหตุผลตายตัวของระบบ และโมดัลส่ง `paymentGateExemptReason: null`
//    เสมอ (ตัวประกอบ body เป็นคนทิ้งเหตุผลให้ — ดู historicalIntakeForm)
import { Lock, Plus, Trash2 } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyInput from "@/components/ui/MoneyInput";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtMoney, fmtPercent, NA } from "@/lib/format";
import { DOC_DATE_MAX, DOC_DATE_MIN } from "@/lib/sales/historicalOrders";
import {
  EXEMPT_REASON_MAX, EXEMPT_REASON_MIN, INSTALLMENT_LABEL_MAX, ZERO_VALUE_EXEMPT_REASON,
  charLength, emptyHistoricalInstallment, exemptReasonError,
} from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalSalesOrderModal.module.css";

export default function HistoricalOrderMoneyStep({
  state, onChange, issues = [], plan = null, zeroValue = false, busy = false,
}) {
  const rows = state.installments || [];
  const planRows = plan?.installments || [];
  const total = plan?.header?.totalAmount;
  const reasonLength = charLength(state.exemptReason);
  const on = zeroValue || state.exempt;

  const patchRow = (key, next) => onChange({
    installments: rows.map((row) => (row.key === key ? { ...row, ...next } : row)),
  });

  return (
    <>
      {issues.length > 0 && (
        <StatusNotice tone="error" title={`งวดและด่านเงินยังไม่ผ่าน ${issues.length} ข้อ`} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
        </StatusNotice>
      )}

      <h4 className={styles.section}>
        งวดที่ยังต้องเก็บ<span className={styles.sectionKind}>(ไม่บังคับ)</span>
      </h4>
      <p className={styles.lockWhy}>งวดที่เก็บเงินนอกระบบแล้วไม่ต้องคีย์ — ใช้สวิตช์ยกเว้นด่านเงินแทน</p>

      <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={900}>
        <table className="w-full text-sm">
          <thead><tr>
            <th>ชื่องวด <b className={styles.req}>*</b></th>
            <th className="num">ยอด <b className={styles.req}>*</b></th>
            <th className="num">% ของยอดใบ</th>
            <th>กำหนดชำระ</th>
            <th>ครอบช่วง จาก</th>
            <th>ครอบช่วง ถึง</th>
            <th>สถานะ</th>
            <th />
          </tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const planRow = planRows[index] || null;
              return (
                <tr key={row.key}>
                  <td>
                    <Input
                      value={row.label}
                      maxLength={INSTALLMENT_LABEL_MAX}
                      autoComplete="off"
                      disabled={busy}
                      onChange={(e) => patchRow(row.key, { label: e.target.value })}
                      aria-label={`ชื่อของงวดที่ ${index + 1}`}
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
                  {/* % ระบบคิดให้ตอนรู้ยอดใบ — ไม่ใช่ช่องกรอก */}
                  <td className="num mono">
                    {planRow && Number.isFinite(Number(planRow.percent)) ? fmtPercent(planRow.percent) : NA}
                  </td>
                  <td>
                    <DateInput
                      value={row.dueDate}
                      onChange={(value) => patchRow(row.key, { dueDate: value })}
                      min={DOC_DATE_MIN}
                      max={DOC_DATE_MAX}
                      disabled={busy}
                      ariaLabel={`กำหนดชำระของงวดที่ ${index + 1}`}
                    />
                  </td>
                  <td>
                    <DateInput
                      value={row.coversFrom}
                      onChange={(value) => patchRow(row.key, { coversFrom: value })}
                      min={DOC_DATE_MIN}
                      max={DOC_DATE_MAX}
                      disabled={busy}
                      ariaLabel={`วันเริ่มช่วงครอบของงวดที่ ${index + 1}`}
                    />
                  </td>
                  <td>
                    <DateInput
                      value={row.coversTo}
                      onChange={(value) => patchRow(row.key, { coversTo: value })}
                      min={DOC_DATE_MIN}
                      max={DOC_DATE_MAX}
                      disabled={busy}
                      ariaLabel={`วันสิ้นสุดช่วงครอบของงวดที่ ${index + 1}`}
                    />
                  </td>
                  <td><StatusBadge tone="neutral" size="sm" label="รอชำระ" /></td>
                  <td>
                    <Button
                      iconOnly
                      size="sm"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => onChange({ installments: rows.filter((r) => r.key !== row.key) })}
                      aria-label={`ลบงวดที่ ${index + 1}`}
                      title="ลบงวด"
                      icon={<Trash2 size={15} aria-hidden="true" />}
                    />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={8}>
                <div className={styles.addRow}>
                  <Button size="sm" variant="quiet" disabled={busy}
                    onClick={() => onChange({ installments: [...rows, emptyHistoricalInstallment()] })}
                    icon={<Plus size={14} aria-hidden="true" />}>
                    เพิ่มงวด
                  </Button>
                  <span>ผลรวมห้ามเกินยอดใบ {Number.isFinite(Number(total)) ? fmtMoney(total) : NA}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </TableScroll>

      <p className={styles.hint}>
        ชื่องวด 1–{INSTALLMENT_LABEL_MAX} ตัวอักษร · ยอดไม่ติดลบ · กำหนดชำระไม่บังคับ —
        เลยวันนี้ = เตือน “จะขึ้นเลยกำหนดในทะเบียนบัญชีทันที” · ครอบช่วงไม่บังคับ (จาก ≤ ถึง) ·
        สถานะคงที่ “รอชำระ” อ่านอย่างเดียว — ยอดตรึงตั้งแต่บันทึก · เข้าคิวบัญชีเป็น “รอบัญชีตรวจ”
        เมื่อมีคนแจ้งชำระพร้อมหลักฐาน · % ระบบคิด
      </p>

      {/* ⭐ สวิตช์ยกเว้นเป็น **ธง** (เริ่มปิด) ไม่ใช่การตัดสินใจที่ต้องเลือกหนึ่งในหลายทาง
          ⇒ ไม่เข้ากฎ "ไม่มีค่าตั้งต้น" · ใบยอด 0 เปิดล็อก ถอนไม่ได้ (มติข้อ 11) */}
      <div className={styles.switchRow}>
        <button
          type="button"
          className="ui-switch"
          data-on={on ? "1" : undefined}
          aria-pressed={on}
          aria-label="ยกเว้นด่านเงินของนัดบริการ (ใบนี้)"
          disabled={busy || zeroValue}
          onClick={() => onChange({ exempt: !state.exempt })}
        >
          <i aria-hidden="true" />
        </button>
        <span className={styles.switchText}>
          <b>
            {zeroValue ? <Lock size={13} aria-hidden="true" /> : null}
            {zeroValue ? "ยกเว้นด่านเงินอัตโนมัติ · ใบยอด 0 บาท" : "ยกเว้นด่านเงินของนัดบริการ (ใบนี้)"}
          </b>
          <small>
            {zeroValue
              ? "เปิดล็อก · ถอนการยกเว้นไม่ได้ · หมายเหตุในขั้น ① บังคับ"
              : on
                ? "เปิดแล้ว — ต้องมีเหตุผล"
                : "ใช้เมื่อเงินของงานนี้เก็บนอกระบบแล้ว หรือไม่มีงวดให้คีย์ · ยกเว้นเฉพาะด่านเงิน "
                  + "ด่านสัญญายังต้องผ่าน · เก็บชื่อผู้ยกเว้นและเวลา"}
          </small>
        </span>
      </div>

      {zeroValue && (
        <div className={styles.field}>
          <span>เหตุผล</span>
          <p className={styles.derived}>{ZERO_VALUE_EXEMPT_REASON}</p>
          <small>เหตุผลตายตัวของระบบ — แก้ไม่ได้</small>
        </div>
      )}
      {!zeroValue && state.exempt && (
        <div className={styles.field}>
          <span>เหตุผล <b className={styles.req}>*</b></span>
          <Textarea
            value={state.exemptReason}
            disabled={busy}
            invalid={issues.some((issue) => issue.field === "paymentGateExemptReason")}
            onChange={(e) => onChange({ exemptReason: e.target.value })}
            aria-label="เหตุผลที่ยกเว้นด่านเงินของใบนี้"
          />
          {/* นับทีละ code point แบบเดียวกับ API และ CHECK 10–500 */}
          <span className={styles.counter} data-over={reasonLength > EXEMPT_REASON_MAX ? "yes" : undefined}>
            {reasonLength}/{EXEMPT_REASON_MAX} · ขั้นต่ำ {EXEMPT_REASON_MIN}
          </span>
        </div>
      )}

    </>
  );
}

/** ข้อความแถบท้ายของขั้น ③ — สภาพของสวิตช์
 *  🔴 "ยกเว้นแล้ว" พูดได้ต่อเมื่อ **เหตุผลใช้ได้จริง** — API ไม่มีบูลีนของสวิตช์ อ่านแต่ข้อความ
 *     ⇒ สวิตช์เปิดกับเหตุผลว่าง = ใบลงฐานแบบไม่ยกเว้น (ด่านของขั้นนี้กันไม่ให้เดินต่อแล้ว
 *     แต่แถบท้ายต้องไม่บอกตรงข้ามระหว่างที่ยังพิมพ์ไม่ครบ) */
export function historicalMoneyFootNote(state, { zeroValue = false } = {}) {
  if (zeroValue) return { text: "เหตุผลตายตัวของระบบ — แก้ไม่ได้", tone: null };
  if (state.exempt) {
    const reasonError = exemptReasonError(state.exemptReason);
    if (reasonError) return { text: `ยังไม่ยกเว้น — ${reasonError}`, tone: null };
    return { text: "ด่านเงินยกเว้นแล้ว — ด่านสัญญายังต้องผูกหลังบันทึก", tone: "ok" };
  }
  const count = (state.installments || []).length;
  if (!count) return { text: "ไม่ยกเว้น: ยังไม่มีงวด — นัดบริการของใบนี้จะติดด่านเงิน", tone: null };
  return { text: `ไม่ยกเว้น: งวด ${count} งวด รอชำระ — นัดติดด่านเงินจนกว่าบัญชีรับรองงวด`, tone: null };
}
