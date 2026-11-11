"use client";
// ── หัวข้อ ④ ของฟอร์มสินค้า: ราคาขายปลีกและสรรพสามิต (มติเจ้าของ 11/11/2026 · docs/product-form-rework.md F1–F5) ───────────
//
// ⭐ ที่เดียวของฟอร์มที่พูดเรื่องสรรพสามิต (เดิมสองที่ไม่ตรงกัน: กล่องหมวดด้านบนดูแค่ธงหมวด · ป้ายใต้รายการสูตรของชุดของขวัญ)
//   · กล่องสถานะ "เสีย / ไม่เสียสรรพสามิต" + เหตุ (`productExciseStatus` — กติกาเดียวกับตอนบันทึก)
//   · ชุดของขวัญที่มีน้ำหอม: ปุ่ม "รวมชุด / รายชิ้น" (G5 · ไม่มีค่าเลือกไว้ก่อน) แล้วช่องราคาโผล่ **ใต้ปุ่ม** ทันที
//     (เดิมปุ่มอยู่หัวข้อสูตร แต่ช่องราคาทั้งชุดอยู่หัวข้อ 3 — ผิด form-design-rules §1 ข้อ 3)
//       รวมชุด  = ราคาขายปลีกทั้งชุด
//       รายชิ้น = ตารางชิ้นที่เสียภาษี (ราคา/ชิ้น × จำนวนจากหัวข้อ ② — F3 ไม่กรอกซ้ำ) + ช่องราคาทั้งชุดไว้อ้างอิง
//   · F4 ภาษีต่อหน่วยคิดให้ทันทีตอนพิมพ์ (`exciseTaxPreview` — ตัวคิดเดียวกับระบบ)
//   · F5 สินค้าที่ไม่ใช้ราคาขายปลีกและไม่เสียภาษี = บรรทัดเดียว (หัวข้อยังอยู่ ทุกสินค้ามี 4 หัวข้อเหมือนกัน)
// ⚠️ ช่องที่ส่งให้ API เหมือนเดิมทุกตัว (`retailPriceIncVat` · `exciseTaxBase` · `formulaComponents[].retailPriceIncVat/pieceQty`)
//    — ไฟล์นี้ย้ายที่วางช่อง ไม่ได้เพิ่มข้อมูลใหม่
import MoneyInput from "@/components/ui/MoneyInput";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { RETAIL_PRICE_MAIN_CATEGORY, categoryRow, isExciseCategory } from "@/lib/master/categoryOf";
import { categoryName } from "@/lib/master/productCategoryOptions";
import { EXCISE_TOTAL_RATE, EXCISE_VAT_RATE } from "@/lib/tax/exciseBilling";
import {
  EXCISE_TAX_BASE, GIFT_SET_PRICE_MODE_OPTIONS, giftSetPiecePrice, giftSetPieceQty,
} from "@/lib/excise/giftSetExcise";
import { exciseTaxPreview, productExciseStatus } from "@/lib/excise/productExciseStatus";
import { NA, fmtMoney } from "@/lib/format";

const pct = (rate) => `${Math.round(rate * 1000) / 10}%`;

/* บรรทัดภาษีต่อหน่วย (F4) — ฐานว่าง = ไม่โชว์ (คำเตือนขาดราคาอยู่ที่ช่องเอง) */
function TaxPreview({ base, unit }) {
  const preview = exciseTaxPreview(base);
  if (!preview) return null;
  return (
    <div className="col-span-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text-2)] flex flex-wrap gap-x-4 gap-y-1 items-baseline">
      <span>ภาษีสรรพสามิตต่อ{unit}</span>
      <strong className="font-mono tabular-nums text-[var(--text)]">{fmtMoney(preview.taxPerUnit)}</strong>
      <span className="text-xs text-[var(--text-3)]">{`ถอด VAT ${pct(EXCISE_VAT_RATE)} = ${fmtMoney(preview.retailPriceExVat)} × ${pct(EXCISE_TOTAL_RATE)} (สรรพสามิต + ท้องถิ่น) · ตัวเลขจริงคิดตอนบันทึก`}</span>
    </div>
  );
}

export default function ProductRetailExcise({
  form,
  onForm,
  productTypes = [],
  formulas = [],
  categoryCode = "",
  giftSet = false,
  // ธงรายตัวของ RA บนสินค้า (แก้เท่านั้น · สร้าง = null) — ไม่ได้แก้ที่ฟอร์มนี้ แค่อ่านมาบอกสถานะ
  taxableOverride = null,
  // ช่องราคาขายปลีกโผล่ไหม (กติกาเดิม: กลุ่ม 01 / หมวดสรรพสามิต / มีค่าค้าง / ธงเสียภาษีที่บันทึกไว้ — L16c)
  showRetail = false,
  inRetailCategory = false,
  saleUnitLabel = "หน่วย",
  disabled = false,
}) {
  const rows = Array.isArray(form.formulaComponents) ? form.formulaComponents : [];
  const status = productExciseStatus({
    categoryCode, productTypes, giftSetRows: rows, priceMode: form.exciseTaxBase, taxableOverride,
  });
  // ชุดที่ RA ตั้งเสียภาษีรายตัวแต่ไม่มีสูตรน้ำหอม = คิดจากราคาขายปลีกเหมือนสินค้าทั่วไป (ตรงกับ giftSetExciseFields ฝั่งบันทึก)
  const gift = giftSet && status.taxable && status.gift?.taxable ? status.gift : null;
  const mode = gift?.mode || null;
  const unit = saleUnitLabel || "หน่วย";
  const retail = form.retailPriceIncVat ?? "";
  const setRetail = (v) => onForm({ retailPriceIncVat: v ?? "" });
  const setPiecePrice = (index, v) => onForm({
    formulaComponents: rows.map((row, i) => (i === index ? { ...row, retailPriceIncVat: v ?? "" } : row)),
  });
  const formulaById = new Map(formulas.map((f) => [f.id, f]));

  const statusBox = (
    <div className="col-span-2">
      <StatusNotice tone={status.taxable ? "accent" : "neutral"}>
        <strong>{status.taxable ? "เสียสรรพสามิต" : "ไม่เสียสรรพสามิต"}</strong>
        {` — ${status.reason}`}
      </StatusNotice>
    </div>
  );

  /* ยังไม่เลือกหมวด (โมดัลเพิ่ม) — ยังตัดสินอะไรไม่ได้ บอกตรง ๆ แทนประโยค "ไม่เสีย…" ที่ยังไม่จริง */
  if (!String(categoryCode || "").trim()) {
    return (
      <div className="form-grid cols-2">
        <div className="col-span-2">
          <StatusNotice tone="neutral">เลือกหมวดสินค้าก่อน — สถานะสรรพสามิตและช่องราคาขายปลีกจะขึ้นตามหมวด</StatusNotice>
        </div>
      </div>
    );
  }

  /* F5: ไม่ใช้ราคาขายปลีกและไม่เสียภาษี = บรรทัดเดียว (เดิมหัวข้อหายทั้งก้อน) */
  if (!showRetail && !status.taxable && !giftSet) {
    return (
      <div className="form-grid cols-2">
        <div className="col-span-2">
          <StatusNotice tone="neutral">
            <strong>ไม่เสียสรรพสามิต · ไม่ใช้ราคาขายปลีก</strong>
            {` — ${status.reason}${inRetailCategory ? "" : ` และไม่ใช่สินค้ากลุ่ม ${RETAIL_PRICE_MAIN_CATEGORY}`}`}
          </StatusNotice>
        </div>
      </div>
    );
  }

  const retailField = ({ label, hint, required = false }) => (
    <div className="form-group">
      <label>{label}{required ? <span className="text-[var(--red)]"> *</span> : null}</label>
      <MoneyInput name="retailPriceIncVat" value={retail} onChange={setRetail} className="w-full" disabled={disabled} />
      <span className="text-xs text-[var(--text-3)] mt-1">{hint}</span>
    </div>
  );

  /* ── ชุดของขวัญที่มีน้ำหอม: รวมชุด / รายชิ้น ── */
  if (gift) {
    const taxableIndexes = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isExciseCategory(String(row.categoryCode || "").trim(), productTypes));
    return (
      <div className="form-grid cols-2">
        {statusBox}
        <div className="form-group col-span-2">
          <label>แจ้งราคาขายปลีกเพื่อคิดสรรพสามิต <span className="text-[var(--red)]">*</span></label>
          <OptionTiles
            ariaLabel="วิธีแจ้งราคาขายปลีกของชุดของขวัญ"
            value={mode || ""}
            onChange={(next) => onForm({ exciseTaxBase: next })}
            options={GIFT_SET_PRICE_MODE_OPTIONS}
            invalid={!mode}
            disabled={disabled}
          />
          <span className="text-xs text-[var(--text-3)] mt-1">ไม่มีค่าเลือกไว้ก่อน — ต้องเลือกก่อนบันทึก (มติ 11/11)</span>
        </div>
        {!mode && (
          <div className="col-span-2">
            <StatusNotice tone="warning">เลือกวิธีแจ้งราคาก่อน — ช่องราคาจะโผล่ตรงนี้ · ยังไม่เลือก = ภาษีคิดออกมา 0</StatusNotice>
          </div>
        )}
        {mode === EXCISE_TAX_BASE.set && (
          <>
            {retailField({ label: "ราคาขายปลีกทั้งชุด (รวม VAT)", hint: "ราคาหน้าร้านของทั้งชุด = ฐานคิดภาษีสรรพสามิต", required: true })}
            <TaxPreview base={retail} unit={unit} />
          </>
        )}
        {mode === EXCISE_TAX_BASE.pieces && (
          <>
            <div className="col-span-2 min-w-0">
              <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--text-3)] border-b border-[var(--border)]">
                    <th className="text-left font-semibold py-1 pr-2">ชิ้นที่เสียภาษี</th>
                    <th className="text-right font-semibold py-1 px-2">ราคา/ชิ้น (รวม VAT)</th>
                    <th className="text-right font-semibold py-1 px-2">จำนวน</th>
                    <th className="text-right font-semibold py-1 pl-2">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {taxableIndexes.map(({ row, index }) => {
                    const formula = formulaById.get(row.formulaId);
                    const price = giftSetPiecePrice(row.retailPriceIncVat);
                    const qty = giftSetPieceQty(row.pieceQty);
                    return (
                      <tr key={row.key || row.id || index} className="border-b border-[var(--border)]">
                        <td className="py-1.5 pr-2 align-middle">
                          {categoryName(categoryRow(row.categoryCode, productTypes)) || row.categoryCode}
                          <span className="block text-xs text-[var(--text-3)]">{formula ? formula.code || formula.name : "— ยังไม่เลือกสูตร —"}</span>
                        </td>
                        <td className="py-1.5 px-2 align-middle min-w-32">
                          <MoneyInput
                            aria-label={`ราคาขายปลีกต่อชิ้นของสูตรแถวที่ ${index + 1}`}
                            value={row.retailPriceIncVat ?? ""}
                            onChange={(v) => setPiecePrice(index, v)}
                            className="w-full"
                            disabled={disabled}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums align-middle">× {qty}</td>
                        <td className="py-1.5 pl-2 text-right font-mono tabular-nums align-middle">{price > 0 ? fmtMoney(price * qty) : NA}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-2 font-semibold" colSpan={3}>ฐานภาษีของชุด</td>
                    <td className="pt-2 pl-2 text-right font-mono tabular-nums font-semibold">{gift.basePriceIncVat ? fmtMoney(gift.basePriceIncVat) : NA}</td>
                  </tr>
                </tfoot>
              </table>
              </TableScroll>
              <span className="text-xs text-[var(--text-3)] mt-1 block">จำนวนชิ้นแก้ที่หัวข้อ 2 · ชิ้นที่ไม่เสียภาษีไม่อยู่ในตาราง</span>
            </div>
            {gift.missingPriceRows.length ? (
              <div className="col-span-2">
                <StatusNotice tone="warning">{`ยังไม่ได้กรอกราคาต่อชิ้น ${gift.missingPriceRows.length} แถว — ภาษีคิดออกมา 0 จนกว่าจะกรอกครบ`}</StatusNotice>
              </div>
            ) : (
              <TaxPreview base={gift.basePriceIncVat} unit={unit} />
            )}
            {retailField({ label: "ราคาขายปลีกทั้งชุด (รวม VAT)", hint: "ไม่ใช้คิดภาษีเมื่อแจ้งรายชิ้น · เก็บไว้อ้างอิง" })}
          </>
        )}
      </div>
    );
  }

  /* ── สินค้าทั่วไป / ชุดที่ไม่มีน้ำหอม / ของที่ RA ตั้งรายตัว ── */
  const label = giftSet ? "ราคาขายปลีกทั้งชุด (รวม VAT)" : "ราคาขายปลีก (รวม VAT)";
  return (
    <div className="form-grid cols-2">
      {statusBox}
      {showRetail && retailField({
        label,
        hint: status.taxable
          ? "ราคาที่ลูกค้าตั้งขายหน้าร้าน = ฐานคิดภาษีสรรพสามิต · ไม่มีราคา = ภาษีคิดออกมา 0 และยื่นขึ้นทะเบียนไม่ได้"
          : inRetailCategory
            ? "ราคาที่ลูกค้าตั้งขายหน้าร้าน (ไม่เสียสรรพสามิต — เก็บไว้อ้างอิง)"
            : `หมวดนี้ไม่ได้ใช้ราคาขายปลีก (ไม่ใช่กลุ่ม ${RETAIL_PRICE_MAIN_CATEGORY}) แต่สินค้าตัวนี้มีราคาค้างอยู่ — โชว์ไว้ให้เห็นและลบได้`,
      })}
      {status.taxable && <TaxPreview base={retail} unit={unit} />}
    </div>
  );
}
