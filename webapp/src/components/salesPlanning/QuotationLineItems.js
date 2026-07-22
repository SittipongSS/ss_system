"use client";

// ตารางรายการสินค้า/บริการ + สรุปท้ายใบ (ส่วนลด/VAT/ยอดรวม) ของใบเสนอราคา —
// component เดียวใช้ทั้งหน้าสร้าง (/sa/quotations/new) และหน้าแก้ไข ([id])
// ตามกฎ AGENTS.md: ฟอร์มสร้าง/แก้ต้องเป็นชุดเดียวกัน ต่างได้แค่โหมดผ่าน props.
// ยอดเงินคิดจริงที่ server — ที่นี่พรีวิวด้วยสูตรเดียวกัน (quoteTotals จาก lib กลาง)
import { useMemo } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";
import SearchableSelect from "@/components/ui/SearchableSelect";
import MoneyInput from "@/components/ui/MoneyInput";
import { quoteLineNet, quoteTotals } from "@/lib/salesPlanning";
import { fmtMoney } from "@/lib/format";
import { fgLineDescription } from "@/lib/sales/quoteLines";
import { productSelectOptions } from "@/components/master/productOption";
import styles from "./QuotationLineItems.module.css";

export const newProductLine = () => ({
  _lineKind: "product", productId: null, fgCode: null, description: "", qty: 1, unitPrice: 0,
  discountType: null, discountValue: 0, source: "manual",
});
export const newManualLine = () => ({
  _lineKind: "manual", productId: null, fgCode: null, description: "", qty: 1, unitPrice: 0,
  discountType: null, discountValue: 0, source: "manual",
});

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
  // มาตรฐาน dropdown สินค้าทั้งระบบ: รหัส (ตัวหนา) · แบรนด์ · ชื่อสินค้า · ปริมาตร
  const productOptions = useMemo(() => productSelectOptions(products), [products]);

  const totals = useMemo(() => quoteTotals(lines, {
    discountType: discountType || null,
    discountValue: discountValue || 0,
    vatRate: vatRate || 0,
  }), [lines, discountType, discountValue, vatRate]);

  const setLine = (index, patch) => onChange?.(lines.map((line, lineIndex) => (
    lineIndex === index ? { ...line, ...patch } : line
  )));
  const removeLine = (index) => onChange?.(lines.filter((_, lineIndex) => lineIndex !== index));

  // บรรทัด FG โชว์ 2 บรรทัด (มติผู้ใช้ 2026-07-19): รหัส · แบรนด์ / ชื่อสินค้า · ปริมาตร
  // — บรรทัดเดียวยาวโดนตัด … แล้วชื่อ/ปริมาตรหาย. ดึงสดจากฐานข้อมูลสินค้า;
  // สินค้าหายจาก master → โชว์ค่าที่ snapshot ไว้ในใบ (description เดิม)
  const fgDisplayFor = (line) => {
    const product = line.productId ? products.find((item) => item.id === line.productId) : null;
    if (!product) return { code: line.fgCode || "", brand: "", name: line.description || "" };
    return {
      code: product.fgCode || line.fgCode || "",
      brand: product.brandName || product.brandNameEn || "",
      name: [
        product.productDescription || product.productDescriptionEn || "",
        product.volume ? `${product.volume} ${product.volumeUnit || "ml"}` : "",
      ].filter(Boolean).join(" · "),
    };
  };
  // ราคาขายในใบ = ราคาผลิต (costPrice) ทั้งระบบ (มติ 2026-07-19) — ตรงกับที่
  // server enforce ตอนบันทึก; retailPriceIncVat มีไว้คำนวณสรรพสามิตเท่านั้น
  const masterPriceFor = (productId) => {
    const product = products.find((item) => item.id === productId);
    return Number(product?.costPrice || 0);
  };

  const selectLineProduct = (index, productId) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setLine(index, {
      productId: product.id,
      fgCode: product.fgCode || null,
      // คำอธิบายมาตรฐาน แบรนด์ · ชื่อสินค้า · ปริมาตร (รหัสแสดงเป็นป้าย FG แยก)
      description: fgLineDescription(product),
      unitPrice: Number(product.costPrice || 0),
    });
  };

  return (
    <>
      <div className="premium-glass-table table-responsive">
        <table className={`w-full text-sm ${styles.linesTable}`}>
          <thead>
            <tr>
              <th className={styles.rowNumber} style={{ width: 36 }}>#</th>
              <th>รายการ</th>
              {/* หัวคอลัมน์ตัวเลขชิดขวาให้ตรงกับตัวเลขในช่องกรอก (numeric-input ชิดขวา) */}
              <th className={styles.numHeader} style={{ width: 120 }}>จำนวน</th>
              <th className={styles.numHeader} style={{ width: 130 }}>ราคา/หน่วย</th>
              <th style={{ width: 210 }}>ส่วนลดรายการ</th>
              {/* 150px รับยอดรายบรรทัดถึงหลักสิบล้าน (จำนวนหลักพัน × ราคาหลักหมื่น) ไม่ล้นช่อง */}
              <th className="num" style={{ width: 150 }}>จำนวนเงิน</th>
              {editable && <th style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id || index} className="premium-row">
                <td className={styles.rowNumber}>{index + 1}</td>
                <td>
                  <div className={styles.lineDescriptionCell}>
                    {editable && line._lineKind === "product" && (
                      <SearchableSelect
                        entity="product"
                        size="sm"
                        className="w-full"
                        value={line.productId || ""}
                        onChange={(productId) => selectLineProduct(index, productId)}
                        ariaLabel={`เลือกสินค้า รายการ ${index + 1}`}
                        placeholder="เลือก FG / สินค้า..."
                        options={productOptions}
                      />
                    )}
                    {(line.productId || line.fgCode) ? (
                      (() => {
                        const fg = fgDisplayFor(line);
                        return (
                          <div className={styles.fgInfo} title="ข้อมูลจากฐานข้อมูลสินค้า — แก้ที่ฐานข้อมูลสินค้า">
                            <span className={styles.fgInfoMeta}><strong>{fg.code || "FG"}</strong>{fg.brand && <> · {fg.brand}</>}</span>
                            <span className={styles.fgInfoName}>{fg.name || "-"}</span>
                          </div>
                        );
                      })()
                    ) : (
                      <input
                        className="premium-input"
                        value={line.description || ""}
                        disabled={!editable}
                        placeholder={line._lineKind === "product" ? "รายละเอียดสินค้าจะเติมอัตโนมัติ" : "รายละเอียด"}
                        onChange={(event) => setLine(index, { description: event.target.value })}
                      />
                    )}
                    {/* หมายเหตุรายบรรทัด (metadata.note) — โชว์ใต้รายการในใบเสนอราคา */}
                    {editable
                      ? ((line._noteOpen || line.metadata?.note)
                        ? <textarea className="premium-input" rows={2} value={line.metadata?.note || ""} placeholder="หมายเหตุรายการนี้ — แสดงใต้รายการในใบเสนอราคา" aria-label={`หมายเหตุ รายการ ${index + 1}`} onChange={(event) => setLine(index, { metadata: { ...(line.metadata || {}), note: event.target.value } })} />
                        : <button type="button" className="linklike" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={() => setLine(index, { _noteOpen: true })}>+ แทรกหมายเหตุ</button>)
                      : (line.metadata?.note && <div className={styles.noteReadonly}>หมายเหตุ: {line.metadata.note}</div>)}
                  </div>
                </td>
                <td><MoneyInput min="0" value={line.qty} disabled={!editable} onChange={(value) => setLine(index, { qty: value ?? "" })} aria-label={`จำนวน รายการ ${index + 1}`} /></td>
                <td>
                  <MoneyInput min="0" value={line.unitPrice} disabled={!editable || !!(line.productId || line.fgCode)} title={(line.productId || line.fgCode) ? "ราคาจากฐานข้อมูลสินค้า — แก้ราคาต้องแก้ที่ฐานข้อมูล" : undefined} onChange={(value) => setLine(index, { unitPrice: value ?? "" })} aria-label={`ราคาต่อหน่วย รายการ ${index + 1}`} />
                  {/* เตือนเฉพาะตอน master ยังไม่ตั้งราคา (ห้ามกรอกราคาในใบ) — กรณีปกติ
                      ไม่ต้องมีคำอธิบายกำกับ ช่องถูกล็อกอยู่แล้วและมี tooltip บอกที่มา */}
                  {editable && line.productId && !(masterPriceFor(line.productId) > 0) && (
                    <Link prefetch={false} href={`/database/products/${line.productId}`} target="_blank" className={styles.fgCode} style={{ color: "var(--amber)" }}>
                      ยังไม่ตั้งราคาในฐานข้อมูล — ไปตั้งราคา →
                    </Link>
                  )}
                </td>
                <td>
                  <div className={styles.discountControls}>
                    <Select className="premium-select" value={line.discountType || ""} disabled={!editable} onChange={(event) => setLine(index, { discountType: event.target.value || null, discountValue: event.target.value ? line.discountValue : 0 })}>
                      <option value="">ไม่ลด</option>
                      <option value="percent">%</option>
                      <option value="amount">บาท</option>
                    </Select>
                    <MoneyInput min="0" value={line.discountValue || ""} disabled={!editable || !line.discountType} onChange={(value) => setLine(index, { discountValue: value ?? "" })} aria-label={`ส่วนลด รายการ ${index + 1}`} />
                  </div>
                </td>
                <td className={`num mono ${styles.lineAmount}`}>{fmtMoney(quoteLineNet(line).lineTotal)}</td>
                {editable && (
                  <td className={styles.rowActions}><button type="button" className="btn-icon danger" onClick={() => removeLine(index)} aria-label={`ลบรายการ ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                )}
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={editable ? 7 : 6} className={styles.emptyRows}>ยังไม่มีรายการ — กด “เพิ่มสินค้า” หรือ “เพิ่มรายการเอง”</td></tr>}
          </tbody>
        </table>
      </div>

      <div className={styles.totalsWrap}>
        <div className={styles.totalsPanel}>
          <div className={styles.totalLine}><span>ยอดรวมสินค้า/บริการ</span><strong className="mono">{fmtMoney(totals.subtotal)}</strong></div>
          <div className={styles.totalLine}>
            {/* ป้ายต้องห่อ span — grid วาง anonymous text node เป็น item แต่ :nth-child
                นับเฉพาะ element ทำให้กฎจัดคอลัมน์เพี้ยน (ช่องกรอกตกไปอีกบรรทัด) */}
            <span className={styles.totalControls}>
              <span>หัก ส่วนลด</span>
              <Select className="premium-select" value={discountType || ""} disabled={!editable} onChange={(event) => onDiscountChange?.({ type: event.target.value, value: event.target.value ? discountValue : 0 })}>
                <option value="">ไม่ลด</option>
                <option value="percent">%</option>
                <option value="amount">บาท</option>
              </Select>
              <MoneyInput min="0" value={discountValue || ""} disabled={!editable || !discountType} onChange={(value) => onDiscountChange?.({ type: discountType, value: value ?? "" })} aria-label="ส่วนลดท้ายใบ" />
            </span>
            <strong className="mono" style={{ color: totals.discountAmount > 0 ? "var(--red)" : "inherit" }}>{totals.discountAmount > 0 ? `-${fmtMoney(totals.discountAmount)}` : "-"}</strong>
          </div>
          {totals.discountAmount > 0 && (
            <div className={styles.totalLine}><span>ยอดหลังหักส่วนลด</span><strong className="mono">{fmtMoney(totals.subtotal - totals.discountAmount)}</strong></div>
          )}
          <div className={styles.totalLine}>
            <span className={styles.totalControls}>
              <span>ภาษีมูลค่าเพิ่ม</span>
              <Select className="premium-select" value={String(vatRate ?? 0)} disabled={!editable} onChange={(event) => onVatRateChange?.(Number(event.target.value))}>
                <option value="0">รวม VAT แล้ว</option>
                <option value="7">+ VAT 7% ท้ายใบ</option>
              </Select>
            </span>
            <strong className="mono">{vatRate > 0 ? fmtMoney(totals.vatAmount) : "-"}</strong>
          </div>
          <div className={styles.totalGrand}>
            <strong>ยอดรวมทั้งสิ้น</strong><strong className="mono">{fmtMoney(totals.totalAmount)}</strong>
          </div>
        </div>
      </div>
    </>
  );
}
