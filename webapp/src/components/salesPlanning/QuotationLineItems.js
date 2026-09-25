"use client";
import { TableScroll } from "@/components/ui/Table";

// ตารางรายการสินค้า/บริการ + สรุปท้ายใบ (ส่วนลด/VAT/ยอดรวม) ของใบเสนอราคา —
// component เดียวใช้ทั้งหน้าสร้าง (/sa/quotations/new) และหน้าแก้ไข ([id])
// ตามกฎ AGENTS.md: ฟอร์มสร้าง/แก้ต้องเป็นชุดเดียวกัน ต่างได้แค่โหมดผ่าน props.
// ยอดเงินคิดจริงที่ server — ที่นี่พรีวิวด้วยสูตรเดียวกัน (quoteTotals จาก lib กลาง)
// ⭐ เซลล์ของบรรทัด (หัวคอลัมน์ · FG · จำนวน/ราคา/ส่วนลด/จำนวนเงิน) และกล่องตารางอยู่ที่ QuoteLineCells —
//   ชุดเดียวกับบรรทัดโซนของใบสั่งขายย้อนหลัง (มติเจ้าของ 23/09: สองฟอร์มต้องไม่ต่างกัน) · แก้ที่นั่นที่เดียว
import { useMemo } from "react";
import ReadableText from "@/components/ui/ReadableText";
import { quoteTotals } from "@/lib/salesPlanning";
import { fmtMoney, naText, NA } from "@/lib/format";
import { lineNoteEdit, quoteLineFromProduct } from "@/lib/sales/quoteLines";
import { productCategoryName } from "@/lib/master/productIdentity";
import { DEFAULT_SALE_UNIT } from "@/lib/master/units";
import { productSelectOptions } from "@/components/master/productOption";
import styles from "./QuotationLineItems.module.css";
import Textarea from "@/components/ui/Textarea";
import { lineIsServicePackage } from "@/lib/sales/serviceOrders";
import {
  QuoteLineActionsHead, QuoteLineFgInfo, QuoteLineHeadCells, QuoteLineIndexCell, QuoteLineIndexHead,
  QuoteLineInstallationPoint, QuoteLineItemCell, QuoteLineMoneyCells, QuoteLineProductPicker, QuoteLineRemoveCell,
  QuoteLineTotals, QuoteLineTotalsEditor, QuoteLinesEmptyRow, QuoteLinesTable,
} from "./QuoteLineCells";

export const newProductLine = () => ({
  _lineKind: "product", productId: null, fgCode: null, description: "", qty: 1, unit: DEFAULT_SALE_UNIT, unitPrice: 0,
  discountType: null, discountValue: 0, source: "manual",
});
export const newManualLine = () => ({
  _lineKind: "manual", productId: null, fgCode: null, description: "", qty: 1, unit: DEFAULT_SALE_UNIT, unitPrice: 0,
  discountType: null, discountValue: 0, source: "manual",
});

/* โทนของแถบเน้นท้ายตาราง (`highlightRows[].tone`) — ไม่ส่ง = เขียว (ค่าเดิมทุก px)
   ⭐ `warning`/`neutral` เพิ่มตอนหน้าใบสั่งขายโชว์ยอดสามกอง (มติผู้ใช้ 2026-09-11 · mig 0353):
     success = Actual (อนุมัติแล้ว) · warning = รออนุมัติ (ห้ามเขียว) · neutral = ยอดของใบเฉย ๆ
   ⚠️ อ้างคลาสตรง ๆ ทีละตัว ไม่ประกอบชื่อ — ด่าน CSS กำพร้าต้องมองเห็นทุกคลาส */
const HIGHLIGHT_TONE = {
  success: styles.successTotal,
  danger: styles.dangerTotal,
  warning: styles.warningTotal,
  neutral: styles.neutralTotal,
};

export function QuotationReadOnlyLineItems({
  lines = [],
  /* ⭐ `showServiceRounds` — โชว์ "รอบบริการที่ขายไว้" ใต้คำอธิบายของบรรทัดหมวด 02-001
     ⚠️ ปิดไว้เป็นค่าตั้งต้นโดยตั้งใจ: คอมโพเนนต์นี้ใช้ทั้งใบเสนอราคาและใบสั่งขาย
     แต่จำนวนรอบเป็นของ **ใบสั่งขาย** ที่เดียว (มติผู้ใช้ 2026-08-31 รอบสอง)
     ⇒ เปิดทั่วไป = ใบเสนอราคาโชว์ขีดค้างไว้ทุกใบตลอดกาล */
  showServiceRounds = false,
  /* ⭐ `showInstallationPoint` — โชว์ "ไซต์ · โซน" ของบรรทัดใบสั่งขายย้อนหลัง (`line.installationPoint` · mig 0374)
     ใต้คำอธิบาย ตรงเดียวกับรอบบริการ — ใบย้อนหลังหนึ่งบรรทัดคือหนึ่งโซน ⇒ ตารางต้องบอกว่าบรรทัดไหนของโซนไหน
     (บรรทัด "12 แพ็คเกจ × 3,500" สี่บรรทัดที่เหมือนกันทุกตัวอักษรอ่านไม่ออกว่าต่างกันตรงไหน — มติ 23/09)
     ⚠️ ปิดเป็นค่าตั้งต้น เหตุผลเดียวกับ showServiceRounds: บรรทัดของใบเสนอราคาไม่มีโซน */
  showInstallationPoint = false,
  summaryRows = [],
  grandTotal,
  grandTotalLabel = "ยอดรวมทั้งสิ้น",
  highlightRows = [],
  emptyText = "ยังไม่มีรายการ",
}) {
  return (
    <>
      <TableScroll family="editable" minWidth={760} className={styles.linesContainer}>
        <table className={`premium-table ${styles.readOnlyTable}`}>
          <thead>
            <tr>
              <th className={styles.rowNumber}>#</th>
              <th>รหัส / รายละเอียด</th>
              <th className="num">จำนวน</th>
              <th>หน่วย</th>
              <th className="num">ราคาต่อหน่วย</th>
              <th className="num">ส่วนลด</th>
              <th className="num">รวม</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id || index}>
                <td className={styles.rowNumber}>{index + 1}</td>
                <td>
                  <div className={styles.readOnlyDescription}>
                    {/* รหัส FG · ชื่อหมวดสินค้า (มติผู้ใช้ 2026-09-22) — หมวดเป็น snapshot ในบรรทัด
                        ใบเก่าที่ยังไม่มี server เติมให้ตอนเปิดใบ (fillMissingLineCategories) */}
                    {line.fgCode ? (
                      <small>{[line.fgCode, productCategoryName(line)].filter(Boolean).join(" · ")}</small>
                    ) : null}
                    <ReadableText text={line.description} lines={3} />
                    {showInstallationPoint ? <QuoteLineInstallationPoint point={line.installationPoint} /> : null}
                    {showServiceRounds && lineIsServicePackage(line) ? (
                      <span className={styles.serviceRoundsTag}>
                        รอบบริการที่ขายไว้: <strong>{line.serviceRounds ? `${line.serviceRounds} รอบ` : NA}</strong>
                      </span>
                    ) : null}
                    {line.metadata?.note ? (
                      <span className={styles.noteReadonly}>
                        <strong>หมายเหตุ:</strong>
                        <ReadableText text={line.metadata.note} lines={2} />
                      </span>
                    ) : null}
                  </div>
                </td>
                {/* data-label = ป้ายที่ใช้ตอนตารางแปลงเป็นการ์ดบนจอแคบ (หัวตารางถูกซ่อน) */}
                <td className="num mono" data-label="จำนวน">{naText(line.qty)}</td>
                <td data-label="หน่วย">{naText(line.unit)}</td>
                <td className="num mono" data-label="ราคาต่อหน่วย">{fmtMoney(line.unitPrice)}</td>
                <td className="num mono" data-label="ส่วนลด">{Number(line.discountAmount || 0) > 0 ? fmtMoney(line.discountAmount) : NA}</td>
                <td className={`num mono ${styles.lineAmount}`} data-label="รวม">{fmtMoney(line.lineTotal)}</td>
              </tr>
            ))}
            {!lines.length ? <tr><td colSpan={7} className={styles.emptyRows}>{emptyText}</td></tr> : null}
          </tbody>
        </table>
      </TableScroll>

      {/* กล่องสรุปท้ายตาราง = ตัวเดียวกับท้ายบรรทัดโซนของฟอร์มคีย์ใบย้อนหลัง (QuoteLineTotals) */}
      <QuoteLineTotals rows={summaryRows} grandTotal={grandTotal} grandTotalLabel={grandTotalLabel}>
        {highlightRows.map((row, index) => (
          <div key={row.id || row.label || index} className={`${styles.highlightTotal} ${HIGHLIGHT_TONE[row.tone] || styles.successTotal}`}>
            <span>{row.label}</span>
            <strong className="mono">{naText(row.value)}</strong>
          </div>
        ))}
      </QuoteLineTotals>
    </>
  );
}

export default function QuotationLineItems({
  lines,
  onChange,
  editable = true,
  products = [],
  discountType,
  discountValue,
  vatRate,
  onDiscountChange,
  onVatRateChange,
}) {
  // มาตรฐาน dropdown สินค้าทั้งระบบ: รหัส · แบรนด์ / ชื่อสินค้า · ปริมาตร
  // + ชื่อหมวดสินค้าต่อท้ายรหัส · แบรนด์ (มติผู้ใช้ 2026-09-22 — เฉพาะเอกสารขาย)
  const productOptions = useMemo(
    () => productSelectOptions(products, undefined, { withCategory: true }),
    [products],
  );

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: discountType || null,
    discountValue: discountValue || 0,
    vatRate: vatRate || 0,
  }), [lines, discountType, discountValue, vatRate]);

  const setLine = (index, patch) => onChange?.(lines.map((line, lineIndex) => (
    lineIndex === index ? { ...line, ...patch } : line
  )));
  const removeLine = (index) => onChange?.(lines.filter((_, lineIndex) => lineIndex !== index));
  const productOf = (line) => (line.productId ? products.find((item) => item.id === line.productId) || null : null);

  // ราคาขายในใบ = ราคาผลิต (costPrice) ทั้งระบบ (มติ 2026-07-19) — ตรงกับที่ server enforce ตอนบันทึก;
  // retailPriceIncVat มีไว้คำนวณสรรพสามิตเท่านั้น · บรรทัดหลังเลือกสินค้ามาจาก quoteLineFromProduct
  // ตัวเดียวกับบรรทัดโซนของใบสั่งขายย้อนหลัง (หน่วย/ราคา/หมวด/หมายเหตุประจำสินค้า — เหตุผลเต็มอยู่ใน lib)
  const selectLineProduct = (index, productId) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    onChange?.(lines.map((line, lineIndex) => (lineIndex === index ? quoteLineFromProduct(line, product) : line)));
  };

  return (
    <>
      <QuoteLinesTable>
        <thead>
          <tr>
            <QuoteLineIndexHead />
            <QuoteLineHeadCells />
            {editable && <QuoteLineActionsHead />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id || index} className="premium-row">
              <QuoteLineIndexCell index={index} />
              <QuoteLineItemCell>
                {editable && line._lineKind === "product" && (
                  <QuoteLineProductPicker
                    value={line.productId}
                    onChange={(productId) => selectLineProduct(index, productId)}
                    name={`รายการ ${index + 1}`}
                    options={productOptions}
                  />
                )}
                {(line.productId || line.fgCode) ? (
                  <QuoteLineFgInfo line={line} product={productOf(line)} editable={editable} />
                ) : (
                  editable ? (
                    <input
                      className="premium-input"
                      value={line.description || ""}
                      placeholder={line._lineKind === "product" ? "รายละเอียดสินค้าจะเติมอัตโนมัติ" : "รายละเอียด"}
                      onChange={(event) => setLine(index, { description: event.target.value })}
                    />
                  ) : (
                    <div className="readable-field is-compact">
                      <ReadableText text={line.description} lines={3} empty={<span className="readable-field-empty">ไม่มีรายละเอียด</span>} />
                    </div>
                  )
                )}
                {/* หมายเหตุรายบรรทัด (metadata.note) — โชว์ใต้รายการในใบเสนอราคา
                    บรรทัดที่ผูกสินค้าได้ข้อความตั้งต้นจากทะเบียนสินค้า (mig 0317)
                    แก้ทับได้เสมอ · แก้แล้วธง noteAuto หลุด (lineNoteEdit) ⇒ ใบภาษา
                    อังกฤษพิมพ์ข้อความที่พิมพ์เอง ไม่ใช่คู่แปลของสินค้า */}
                {editable
                  ? ((line._noteOpen || line.metadata?.note)
                    ? (
                      <>
                        <Textarea rows={2} value={line.metadata?.note || ""} placeholder="หมายเหตุรายการนี้ — แสดงใต้รายการในใบเสนอราคา" aria-label={`หมายเหตุ รายการ ${index + 1}`} onChange={(event) => setLine(index, { metadata: lineNoteEdit(line.metadata, event.target.value) })} />
                        {line.metadata?.noteAuto && (
                          <span className={styles.noteFromMaster}>หมายเหตุตั้งต้นจากทะเบียนสินค้า — แก้เฉพาะใบนี้ได้</span>
                        )}
                      </>
                    )
                    /* คู่แฝดของ DealValueLines — คลี่ <Textarea> ในเซลล์เดิม
                       ไม่มีปลายทางให้ไป จึงเป็น `.text-action` ไม่ใช่ `.linklike`
                       ⚠️ สองไฟล์นี้คือคอนโทรลตัวเดียวกันที่ก๊อปกันมา ควรยกเป็น
                       component ร่วมรอบหน้า (AGENTS.md §"ฟอร์มแก้ = ฟอร์มสร้าง") */
                    : <button type="button" className="text-action" style={{ alignSelf: "flex-start", fontSize: "var(--fs-5)" }} onClick={() => setLine(index, { _noteOpen: true })}>+ แทรกหมายเหตุ</button>)
                  : (line.metadata?.note && (
                    <div className={styles.noteReadonly}>
                      <strong>หมายเหตุ:</strong>
                      <ReadableText text={line.metadata.note} lines={3} />
                    </div>
                  ))}
              </QuoteLineItemCell>
              <QuoteLineMoneyCells
                line={line}
                product={productOf(line)}
                editable={editable}
                onPatch={(patch) => setLine(index, patch)}
                name={`รายการ ${index + 1}`}
              />
              {editable && <QuoteLineRemoveCell name={`รายการ ${index + 1}`} onRemove={() => removeLine(index)} />}
            </tr>
          ))}
          {!lines.length && <QuoteLinesEmptyRow colSpan={editable ? 7 : 6}>ยังไม่มีรายการ — กด “เพิ่มสินค้า” หรือ “เพิ่มรายการเอง”</QuoteLinesEmptyRow>}
        </tbody>
      </QuoteLinesTable>

      {/* กล่องสรุปแบบแก้ได้ = ตัวเดียวกับฟอร์มคีย์ใบสั่งขายย้อนหลัง (QuoteLineTotalsEditor · มติเจ้าของ 25/09) */}
      <QuoteLineTotalsEditor
        values={{
          subtotal: fmtMoney(totals.subtotal),
          discount: totals.discountAmount > 0 ? `-${fmtMoney(totals.discountAmount)}` : null,
          afterDiscount: totals.discountAmount > 0 ? fmtMoney(totals.subtotal - totals.discountAmount) : null,
          vat: vatRate > 0 ? fmtMoney(totals.vatAmount) : null,
          total: fmtMoney(totals.totalAmount),
        }}
        discountType={discountType}
        discountValue={discountValue}
        vatRate={vatRate}
        editable={editable}
        onDiscountChange={(next) => onDiscountChange?.({ type: next.type || "", value: next.type ? next.value : 0 })}
        onVatRateChange={onVatRateChange}
      />
    </>
  );
}
