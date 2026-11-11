"use client";
// ── หัวข้อ ④ ของฟอร์มสินค้า: ราคาขายปลีกและสรรพสามิต (มติเจ้าของ 11/11/2026 · docs/product-form-rework.md F1–F5 · R1–R4) ─────
//
// ⭐ ที่เดียวของฟอร์มที่พูดเรื่องสรรพสามิต (เดิมสองที่ไม่ตรงกัน: กล่องหมวดด้านบนดูแค่ธงหมวด · ป้ายใต้รายการสูตรของชุดของขวัญ)
//   · กล่องสถานะ "เสีย / ไม่เสียสรรพสามิต" + เหตุ (`productExciseStatus` — กติกาเดียวกับตอนบันทึก)
//   · F4 ภาษีต่อหน่วยคิดให้ทันทีตอนพิมพ์ (`exciseTaxPreview` — ตัวคิดเดียวกับระบบ)
//   · F5 สินค้าที่ไม่ใช้ราคาขายปลีกและไม่เสียภาษี = บรรทัดเดียว (หัวข้อยังอยู่ ทุกสินค้ามี 4 หัวข้อเหมือนกัน)
// ⭐ รอบสอง (มติเจ้าของ 11/11 · mig 0433):
//   R1 · ราคาขายปลีก **ไม่บังคับตอนบันทึก** ทุกสินค้า — ป้าย "ไม่บังคับตอนบันทึก" + กล่อง "ต้องมีก่อนยื่นขึ้นทะเบียน RA"
//        (`exciseFilingChecklist` · กติกาเดียวกับด่านยื่น) · ชุดของขวัญเลือก "รวมชุด / รายชิ้น" ตอนไหนก็ได้ก่อนยื่น
//   R3 · **ชุดของขวัญทุกชุด** เลือก "รวมชุด / รายชิ้น" ได้ (เดิมเฉพาะชุดที่มีน้ำหอม) — ช่องราคาโผล่ **ใต้ปุ่ม**
//          รวมชุด  = ราคาขายปลีกทั้งชุด
//          รายชิ้น = ตารางของทุกชิ้นในชุด (ราคา/ชิ้น × จำนวนจากหัวข้อ ② — F3) · ราคาทั้งชุด = ผลรวม (ฝั่งบันทึกคิดเอง)
//                    แถวหมวดที่เสียภาษีติดป้าย "ฐานภาษี" · ท้ายตารางแยกฐานภาษีออกมา
// ⚠️ ช่องที่ส่งให้ API: `retailPriceIncVat` · `giftSetPriceMode` · `formulaComponents[].retailPriceIncVat/pieceQty`
import MoneyInput from "@/components/ui/MoneyInput";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { RETAIL_PRICE_MAIN_CATEGORY, categoryRow, isExciseCategory } from "@/lib/master/categoryOf";
import { categoryName } from "@/lib/master/productCategoryOptions";
import { EXCISE_TOTAL_RATE, EXCISE_VAT_RATE } from "@/lib/tax/exciseBilling";
import {
  EXCISE_TAX_BASE, GIFT_SET_PRICE_MODE_OPTIONS, giftSetPiecePrice, giftSetPieceQty, giftSetPiecesTotal, giftSetPriceMode,
} from "@/lib/excise/giftSetExcise";
import { exciseFilingChecklist, exciseTaxPreview, formTaxBase, productExciseStatus } from "@/lib/excise/productExciseStatus";
import { NA, fmtMoney } from "@/lib/format";

const pct = (rate) => `${Math.round(rate * 1000) / 10}%`;
const OPTIONAL = <StatusBadge size="sm" tone="neutral" label="ไม่บังคับตอนบันทึก" />;

/* บรรทัดภาษีต่อหน่วย (F4) — ฐานว่าง = บอกว่ากรอกแล้วจะคิดให้ */
function TaxPreview({ base, unit }) {
  const preview = exciseTaxPreview(base);
  return (
    <div className="col-span-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[var(--text-2)] flex flex-wrap gap-x-4 gap-y-1 items-baseline">
      <span>ภาษีสรรพสามิตต่อ{unit}</span>
      <strong className="font-mono tabular-nums text-[var(--text)]">{preview ? fmtMoney(preview.taxPerUnit) : NA}</strong>
      <span className="text-xs text-[var(--text-3)]">
        {preview
          ? `ถอด VAT ${pct(EXCISE_VAT_RATE)} = ${fmtMoney(preview.retailPriceExVat)} × ${pct(EXCISE_TOTAL_RATE)} (สรรพสามิต + ท้องถิ่น) · ตัวเลขจริงคิดตอนบันทึก`
          : "กรอกราคาครบแล้วจะคิดให้ทันที"}
      </span>
    </div>
  );
}

/* R1: กล่อง "ต้องมีก่อนยื่นขึ้นทะเบียน RA" — ติ๊กตามค่าบนฟอร์ม (กติกาเดียวกับด่านยื่น) */
function FilingChecklist({ items }) {
  if (!items.length) return null;
  const missing = items.filter((item) => !item.ok).length;
  return (
    <div className="col-span-2">
      <StatusNotice tone={missing ? "warning" : "success"} title={missing ? `ต้องมีก่อนยื่นขึ้นทะเบียน RA · ขาด ${missing} อย่าง` : "ต้องมีก่อนยื่นขึ้นทะเบียน RA · ครบแล้ว"}>
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key}>{`${item.ok ? "✓" : "○"} ${item.text}${item.ok ? "" : " · ยังไม่มี"}`}</li>
          ))}
        </ul>
      </StatusNotice>
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
  const mode = giftSet ? giftSetPriceMode(form.giftSetPriceMode) : null;
  const status = productExciseStatus({
    categoryCode, productTypes, giftSetRows: rows, priceMode: mode, taxableOverride,
  });
  const unit = saleUnitLabel || "หน่วย";
  const retail = form.retailPriceIncVat ?? "";
  const setRetail = (v) => onForm({ retailPriceIncVat: v ?? "" });
  const setPiecePrice = (index, v) => onForm({
    formulaComponents: rows.map((row, i) => (i === index ? { ...row, retailPriceIncVat: v ?? "" } : row)),
  });
  const formulaById = new Map(formulas.map((f) => [f.id, f]));
  const pricing = { status, giftSet, retailPriceIncVat: retail, giftSetRows: rows, priceMode: mode };
  const checklist = exciseFilingChecklist(pricing);
  const taxBase = formTaxBase(pricing);

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

  const retailField = ({ label, hint }) => (
    <div className="form-group">
      <label className="flex flex-wrap items-center gap-2">{label}{OPTIONAL}</label>
      <MoneyInput name="retailPriceIncVat" value={retail} onChange={setRetail} className="w-full" disabled={disabled} />
      <span className="text-xs text-[var(--text-3)] mt-1">{hint}</span>
    </div>
  );

  /* ── ชุดของขวัญ (ทุกชุด · R3): รวมชุด / รายชิ้น ── */
  if (giftSet) {
    // ป้าย "ฐานภาษี" เฉพาะเมื่อชุดเสียภาษีเพราะของในชุด (RA ตั้งรายตัวโดยไม่มีของเสียภาษี = ฐานคือราคาทั้งชุด)
    const exciseRows = status.taxable && status.gift?.taxable;
    const total = giftSetPiecesTotal(rows);
    const unpriced = rows.filter((row) => String(row.categoryCode || "").trim() && giftSetPiecePrice(row.retailPriceIncVat) == null).length;
    return (
      <div className="form-grid cols-2">
        {statusBox}
        <div className="form-group col-span-2">
          <label className="flex flex-wrap items-center gap-2">แจ้งราคาขายปลีกแบบ{OPTIONAL}</label>
          <OptionTiles
            ariaLabel="วิธีแจ้งราคาขายปลีกของชุดของขวัญ"
            value={mode || ""}
            onChange={(next) => onForm({ giftSetPriceMode: next })}
            options={GIFT_SET_PRICE_MODE_OPTIONS}
            disabled={disabled}
          />
          <span className="text-xs text-[var(--text-3)] mt-1">
            {exciseRows
              ? "ไม่มีค่าเลือกไว้ก่อน · บันทึกไปก่อนได้ ต้องเลือกก่อนยื่นขึ้นทะเบียน · รวมชุด = ภาษีคิดจากราคาทั้งชุด · รายชิ้น = ภาษีคิดเฉพาะแถวที่เสียภาษี"
              : "ไม่มีค่าเลือกไว้ก่อน · ไม่บังคับ"}
          </span>
        </div>
        {!mode && (
          <div className="col-span-2">
            <StatusNotice tone="neutral">เลือกแล้วช่องราคาจะโผล่ตรงนี้</StatusNotice>
          </div>
        )}
        {mode === EXCISE_TAX_BASE.set && retailField({
          label: "ราคาขายปลีกทั้งชุด (รวม VAT)",
          hint: status.taxable ? "ราคาหน้าร้านของทั้งชุด = ฐานคิดภาษีสรรพสามิต" : "ราคาหน้าร้านของทั้งชุด",
        })}
        {mode === EXCISE_TAX_BASE.pieces && (
          <div className="col-span-2 min-w-0">
            <TableScroll>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--text-3)] border-b border-[var(--border)]">
                    <th className="text-left font-semibold py-1 pr-2">ของในชุด</th>
                    <th className="text-right font-semibold py-1 px-2">ราคา/ชิ้น (รวม VAT)</th>
                    <th className="text-right font-semibold py-1 px-2">จำนวน</th>
                    <th className="text-right font-semibold py-1 pl-2">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const code = String(row.categoryCode || "").trim();
                    if (!code) return null;
                    const formula = formulaById.get(row.formulaId);
                    const price = giftSetPiecePrice(row.retailPriceIncVat);
                    const qty = giftSetPieceQty(row.pieceQty);
                    return (
                      <tr key={row.key || row.id || index} className="border-b border-[var(--border)]">
                        <td className="py-1.5 pr-2 align-middle">
                          <span className="flex flex-wrap items-center gap-2">
                            {categoryName(categoryRow(code, productTypes)) || code}
                            {exciseRows && isExciseCategory(code, productTypes) && <StatusBadge size="sm" tone="accent" label="ฐานภาษี" />}
                          </span>
                          <span className="block text-xs text-[var(--text-3)]">{formula ? formula.code || formula.name : "ยังไม่เลือกสูตร"}</span>
                        </td>
                        <td className="py-1.5 px-2 align-middle min-w-32">
                          <MoneyInput
                            aria-label={`ราคาขายปลีกต่อชิ้นของแถวที่ ${index + 1}`}
                            value={row.retailPriceIncVat ?? ""}
                            onChange={(v) => setPiecePrice(index, v)}
                            className="w-full"
                            disabled={disabled}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono tabular-nums align-middle">× {qty}</td>
                        <td className="py-1.5 pl-2 text-right font-mono tabular-nums align-middle">{price != null ? fmtMoney(price * qty) : NA}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-2 font-semibold" colSpan={3}>
                      ราคาขายปลีกทั้งชุด (ผลรวมทุกชิ้น)
                      {unpriced > 0 && <span className="text-xs font-normal text-[var(--text-3)]">{` · ยังกรอกไม่ครบ ${unpriced} แถว`}</span>}
                    </td>
                    <td className="pt-2 pl-2 text-right font-mono tabular-nums font-semibold">{total != null ? fmtMoney(total) : NA}</td>
                  </tr>
                  {exciseRows && (
                    <tr>
                      <td className="pt-1 font-semibold" colSpan={3}>ฐานภาษี (เฉพาะแถวที่เสียภาษี)</td>
                      <td className="pt-1 pl-2 text-right font-mono tabular-nums font-semibold">{status.gift.basePriceIncVat ? fmtMoney(status.gift.basePriceIncVat) : NA}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </TableScroll>
            <span className="text-xs text-[var(--text-3)] mt-1 block">จำนวนชิ้นแก้ที่หัวข้อ 2</span>
          </div>
        )}
        {status.taxable && mode && <TaxPreview base={taxBase} unit={unit} />}
        <FilingChecklist items={checklist} />
      </div>
    );
  }

  /* ── สินค้าทั่วไป / ของที่ RA ตั้งรายตัว ── */
  return (
    <div className="form-grid cols-2">
      {statusBox}
      {showRetail && retailField({
        label: "ราคาขายปลีก (รวม VAT)",
        hint: status.taxable
          ? "ราคาที่ลูกค้าตั้งขายหน้าร้าน = ฐานคิดภาษีสรรพสามิต · เว้นว่างแล้วบันทึกได้ ต้องกรอกก่อนยื่นขึ้นทะเบียน"
          : inRetailCategory
            ? "ราคาที่ลูกค้าตั้งขายหน้าร้าน · ถ้าวันหน้าสินค้านี้ต้องเสียสรรพสามิต ราคานี้จะเป็นฐานภาษี"
            : `หมวดนี้ไม่ได้ใช้ราคาขายปลีก (ไม่ใช่กลุ่ม ${RETAIL_PRICE_MAIN_CATEGORY}) แต่สินค้าตัวนี้มีราคาค้างอยู่ — โชว์ไว้ให้เห็นและลบได้`,
      })}
      {status.taxable && <TaxPreview base={taxBase} unit={unit} />}
      <FilingChecklist items={checklist} />
    </div>
  );
}
