"use client";
// ── มูลค่าคาดการณ์ของดีล แตกเป็นรายหมวดสินค้า (มติผู้ใช้ 2026-08-17) ──────────
//
// คำสั่งตั้งต้น: *"หมวดสินค้า เลือกหลายรายการได้ และใส่จำนวน และราคาต่อหน่วย
// คาดการณ์ มูลค่ารวมก็ให้คิดอัตโนมัติ"*
//
// ⭐ อยู่ในฟอร์มดีลตัวเดียว (DealFormFields) ⇒ ทั้งโมดัลสร้างและฟอร์มแก้ได้ของเหมือนกัน
// ตามกฎ AGENTS.md — ห้ามก๊อปตารางนี้ไปวางในหน้าใดหน้าหนึ่งอีกชุด
//
// ⚠️ **ยอดรวมล็อก** (มติผู้ใช้ 2026-08-17: "ล็อก คิดจากแถวเท่านั้น") — ไม่มีช่องให้
// พิมพ์ทับ เพราะยอดที่พิมพ์ทับได้จะเพี้ยนจากผลบวกของแถวทันทีที่มีคนแก้แถวเดียว
// แล้วไม่มีใครรู้ว่าตัวไหนจริง · สูตรอยู่ที่ lib/sales/dealValueItems.js ที่เดียว
// (server คิดซ้ำด้วยสูตรเดียวกันตอนบันทึก — ตรงนี้เป็นแค่พรีวิว)
//
// 🪤 หมวดสินค้า **ไม่ใช่ช่องเดี่ยวบนฟอร์มอีกแล้ว** — `deals.categoryCode` (ตัวกรอง
// ขั้นตอนของ Workflow Template) มาจากหมวดของ **แถวแรก** ฝั่ง server จัดให้เอง
// ⇒ ป้ายบนหัวตารางต้องบอกเรื่องนี้ ไม่งั้นคนสลับลำดับแถวโดยไม่รู้ว่ากระทบไทม์ไลน์
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import MoneyInput from "@/components/ui/MoneyInput";
import Textarea from "@/components/ui/Textarea";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import { TableScroll } from "@/components/ui/Table";
import { fmtMoney } from "@/lib/format";
import { DEFAULT_SALE_UNIT, SALE_UNITS, unitOptions } from "@/lib/master/units";
import { DEAL_VALUE_ITEMS_MAX, dealValueLineAmount, dealValueTotal } from "@/lib/sales/dealValueItems";
import styles from "./DealValueLines.module.css";

export const newDealValueLine = () => ({
  categoryCode: "", qty: 1, unit: DEFAULT_SALE_UNIT, unitPrice: "", note: "",
});

export default function DealValueLines({
  items = [],
  onChange,
  categories = [],
  disabled = false,
  /* ดีลเก่าที่ยังไม่มีแถว (สร้างก่อน mig 0264 / ดีลจากระบบเดิม): ยอดเดิมยังอยู่ใน
     `projectValue` และใช้ได้ต่อไป — ไม่ backfill เป็นแถวปลอม (qty/ราคาของอดีตไม่มี
     ใครรู้) · ส่งค่ามาเพื่อบอกผู้ใช้ว่ายอดที่เห็นอยู่ตอนนี้มาจากไหน และจะโดนแทนที่
     เมื่อไร */
  legacyValue = null,
  label = "มูลค่าคาดการณ์",
  // คำอธิบายเพิ่มของผู้เรียก (เช่น ดีลเก่าที่สร้างเป็น Won: ยอดนี้เป็น Actual ทันที)
  hint = null,
}) {
  const rows = items || [];
  const total = dealValueTotal(rows);
  const usingLegacy = rows.length === 0 && Number(legacyValue) > 0;

  const setRow = (index, patch) =>
    onChange?.(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addRow = () => onChange?.([...rows, newDealValueLine()]);
  const removeRow = (index) => onChange?.(rows.filter((_, i) => i !== index));

  return (
    <div className={`deal-field ${styles.block}`}>
      <span className="deal-field-label split">
        <span className="deal-field-label">
          {label} <span className="required-mark">*</span>
          {disabled ? <span className="soft">(ล็อกหลังปิด Won)</span> : null}
        </span>
        {!disabled && (
          <Button
            variant="ghost" size="sm"
            onClick={addRow}
            disabled={rows.length >= DEAL_VALUE_ITEMS_MAX}
            title={rows.length >= DEAL_VALUE_ITEMS_MAX ? `ใส่ได้สูงสุด ${DEAL_VALUE_ITEMS_MAX} รายการ` : undefined}
          >
            <Plus size={14} aria-hidden="true" /> เพิ่มหมวดสินค้า
          </Button>
        )}
      </span>

      {/* cells="stacked": เซลล์หมวดซ้อนสองบรรทัด (ตัวเลือก + หมายเหตุ)
          minWidth ต้องส่งผ่าน prop — `.scroll table` ของ Table.module.css อ่าน
          --table-min-width ด้วย specificity ที่สูงกว่าคลาสของหน้า (ดู QuotationLineItems)
          ⚠️ ไม่มี `premium-glass-table` ครอบ และตารางไม่ใส่ `premium-table` — สองคลาสนั้น
          เป็นชั้นเก่าที่ audit:ui รูดเพดานลงอยู่ (TableScroll วาดพื้นให้เองแล้ว) */}
      <TableScroll surface="embedded" family="editable" cells="stacked" minWidth={640} className={styles.container}>
          <table className={`w-full text-sm ${styles.table}`}>
            <thead>
              <tr>
                <th className={styles.rowNumber}>#</th>
                <th>หมวดสินค้า</th>
                <th className={`${styles.numHeader} ${styles.colQty}`}>จำนวน</th>
                <th className={styles.colUnit}>หน่วย</th>
                <th className={`${styles.numHeader} ${styles.colPrice}`}>ราคา/หน่วย</th>
                <th className={`num ${styles.colAmount}`}>มูลค่า</th>
                {!disabled && <th className={styles.colActions} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="premium-row">
                  <td className={styles.rowNumber}>{index + 1}</td>
                  <td data-label="หมวดสินค้า">
                    <div className={styles.categoryCell}>
                      <ProductCategorySelect
                        categories={categories}
                        value={row.categoryCode || ""}
                        mainValue={String(row.categoryCode || "").split("-")[0] || ""}
                        disabled={disabled}
                        onChange={(categoryCode) => setRow(index, { categoryCode })}
                        // ป้ายอยู่บนหัวคอลัมน์แล้ว — ป้ายในตัวจะซ้อนสองชั้น (ท่าเดียวกับ PdrForm)
                        label={null}
                        ariaLabel={`หมวดสินค้า รายการ ${index + 1}`}
                      />
                      {disabled
                        ? (row.note ? <span className={styles.noteReadonly}>{row.note}</span> : null)
                        : ((row._noteOpen || row.note)
                          ? (
                            <Textarea
                              rows={2}
                              value={row.note || ""}
                              placeholder="หมายเหตุรายการนี้ (ไม่บังคับ)"
                              aria-label={`หมายเหตุ รายการ ${index + 1}`}
                              onChange={(event) => setRow(index, { note: event.target.value })}
                            />
                          )
                          : (
                            <button type="button" className="linklike" onClick={() => setRow(index, { _noteOpen: true })}>
                              + แทรกหมายเหตุ
                            </button>
                          ))}
                    </div>
                  </td>
                  <td data-label="จำนวน">
                    <MoneyInput
                      min="0"
                      value={row.qty}
                      disabled={disabled}
                      onChange={(value) => setRow(index, { qty: value ?? "" })}
                      aria-label={`จำนวน รายการ ${index + 1}`}
                    />
                  </td>
                  <td data-label="หน่วย">
                    <Select
                      value={row.unit || DEFAULT_SALE_UNIT}
                      disabled={disabled}
                      onChange={(event) => setRow(index, { unit: event.target.value })}
                      aria-label={`หน่วย รายการ ${index + 1}`}
                    >
                      {unitOptions(SALE_UNITS, row.unit).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Select>
                  </td>
                  <td data-label="ราคา/หน่วย">
                    <MoneyInput
                      min="0"
                      value={row.unitPrice}
                      disabled={disabled}
                      onChange={(value) => setRow(index, { unitPrice: value ?? "" })}
                      aria-label={`ราคาต่อหน่วยคาดการณ์ รายการ ${index + 1}`}
                    />
                  </td>
                  <td className={`num mono ${styles.lineAmount}`} data-label="มูลค่า">
                    {fmtMoney(dealValueLineAmount(row.qty, row.unitPrice))}
                  </td>
                  {!disabled && (
                    <td className={styles.rowActions}>
                      {/* ปุ่มผ่าน primitive กลาง — คลาส btn ดิบเป็นชั้นเก่าที่ audit:ui รูดลงอยู่ */}
                      <Button
                        iconOnly tone="danger" variant="quiet"
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        onClick={() => removeRow(index)}
                        aria-label={`ลบรายการ ${index + 1}`}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={disabled ? 6 : 7} className={styles.emptyRows}>
                    {usingLegacy
                      ? `ดีลนี้ยังเป็นยอดรวมเดิม ${fmtMoney(legacyValue)} บาท (ก่อนแยกหมวด) — เพิ่มหมวดสินค้าเพื่อแตกยอด`
                      : "ยังไม่มีรายการ — กด “เพิ่มหมวดสินค้า” เพื่อใส่จำนวนและราคาต่อหน่วยคาดการณ์"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </TableScroll>

      {/* ยอดรวม: ผลบวกของแถวเท่านั้น ไม่มีช่องให้พิมพ์ทับ */}
      <div className={styles.totalRow}>
        <span>มูลค่ารวมคาดการณ์</span>
        <strong className="mono">{fmtMoney(usingLegacy ? Number(legacyValue) : total)}</strong>
      </div>
      <small>
        {usingLegacy
          ? "ยอดรวมเดิมของดีลนี้ — เพิ่มแถวเมื่อไร ยอดจะคิดจากแถวแทนทันที"
          : "คิดจาก จำนวน × ราคา/หน่วย ของทุกแถว — พิมพ์ทับไม่ได้ · หมวดของแถวแรกคือหมวดของดีล (ใช้กรองขั้นตอนไทม์ไลน์)"}
      </small>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
