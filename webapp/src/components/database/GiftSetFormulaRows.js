"use client";
// ── สูตรในชุดของขวัญ (หมวด 01-037) — แถวละ (หมวด → สูตร · จำนวนชิ้น) · ส่วนหนึ่งของ ProductForm หัวข้อ ② "ข้างในมีอะไร" ─────
//
// ⭐ มติผู้ใช้ 2026-10-05 (mig 0403): ชุดของขวัญผูกได้หลายสูตร และต้องบอกว่าแต่ละสูตรเป็นสินค้าหมวดไหน
//   · **เลือกหมวดก่อน แล้วลิสต์สูตรกรองตามหมวด** (กฎลำดับคำถามข้อ 1 — ตัวกำหนดชุดตัวเลือกอยู่ก่อน) ·
//     สูตรที่ทะเบียนยังไม่ระบุหมวดเลือกได้ทุกหมวด
//   · หมวดที่เลือกได้ = กลุ่ม 01 ยกเว้น 01-037 (ตัวกรองอยู่ที่ giftSetFormulas.js ตัวเดียวกับ API)
//   · ลำดับแถว = ลำดับที่ใบสเปค FM-SA-04 พิมพ์ ("สูตร 1 · …", "สูตร 2 · …")
// ⭐ มติเจ้าของ 11/11/2026 (docs/product-form-rework.md F3): **จำนวนชิ้นกรอกทุกแถว** (ว่าง = 1 · mig 0430 `pieceQty`)
//    — ตารางราคารายชิ้นในหัวข้อ ④ อ่านจำนวนจากตรงนี้ · แถวหมวดที่เสียสรรพสามิตมีป้ายบอกใต้ช่องหมวด
//    · ปุ่ม "รวมชุด / รายชิ้น" + ช่องราคาต่อชิ้น **ย้ายไปหัวข้อ ④** (ProductRetailExcise) — ที่นี่ไม่พูดเรื่องราคาแล้ว
// ⚠️ แถวที่สร้างบนจอมี `key` ของตัวเอง (แถวจากฐานใช้ `id`) — ใช้ index เป็น key แล้วลบแถวกลาง
//    ตัวเลือกของแถวล่างจะค้างค่าของแถวที่ถูกลบ
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { giftSetComponentCategories, giftSetFormulaChoices } from "@/lib/master/giftSetFormulas";
import { isExciseCategory } from "@/lib/master/categoryOf";
import { fmtDate } from "@/lib/format";

let draftSeq = 0;
const newRow = () => ({ key: `draft-${Date.now()}-${(draftSeq += 1)}`, categoryCode: "", formulaId: "", retailPriceIncVat: "", pieceQty: "" });
const rowKey = (row, index) => row.key || row.id || `row-${index}`;

export default function GiftSetFormulaRows({ rows = [], onRows, formulas = [], productTypes = [] }) {
  const categories = giftSetComponentCategories(productTypes);
  const formulaById = new Map(formulas.map((f) => [f.id, f]));

  const setRow = (index, patch) => onRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeRow = (index) => onRows(rows.filter((_, i) => i !== index));

  // เปลี่ยนหมวดของแถว — สูตรที่เลือกไว้เป็นของหมวดอื่น (ตามทะเบียน) ต้องหลุด ไม่งั้นได้ "น้ำหอม" ที่ชี้สูตรก้านหอม
  // ราคาต่อชิ้นเป็นของ "น้ำหอมในชุด" (กรอกที่หัวข้อ ④) — เปลี่ยนหมวดแล้วล้าง ไม่งั้นค่าที่ซ่อนอยู่ติดไปกับแถวก้านหอม · จำนวนชิ้นคงไว้
  const changeCategory = (index, code) => {
    const picked = formulaById.get(rows[index]?.formulaId);
    const own = String(picked?.categoryCode || "");
    setRow(index, { categoryCode: code || "", retailPriceIncVat: "", ...(own && own !== code ? { formulaId: "" } : {}) });
  };

  return (
    <div className="form-group col-span-2">
      <label>สูตรในชุด</label>
      <span className="text-xs text-[var(--text-3)] mb-2">
        ชุดของขวัญผูกได้หลายสูตร — แต่ละแถวเลือกหมวดก่อนว่าเป็นสินค้าอะไร แล้วเลือกสูตรของหมวดนั้น และบอกจำนวนชิ้นในชุด (ว่าง = 1)
      </span>
      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const picked = formulaById.get(row.formulaId) || null;
            const excise = isExciseCategory(String(row.categoryCode || "").trim(), productTypes);
            const options = giftSetFormulaChoices(formulas, row.categoryCode, row.formulaId).map((f) => ({
              value: f.id,
              label: `${f.code ? `${f.code} · ` : ""}${f.name}`
                + (f.customerName ? ` · ${f.customerName}` : "")
                + (f.status === "archived" ? " (เก็บเข้ากรุแล้ว)" : ""),
            }));
            return (
              <div key={rowKey(row, index)} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                {/* ⚠️ ห่อ div — `.ui-product-category-select` ตั้ง `grid-column: 1 / -1` ไว้ (globals.css) วางตรง ๆ ในกริดแถว
                    มันกินเต็มแถวแล้วดันช่องสูตรลงบรรทัดล่าง */}
                <div className="min-w-0">
                  <ProductCategorySelect
                    label={null}
                    ariaLabel={`หมวดของสูตรแถวที่ ${index + 1}`}
                    categories={categories}
                    value={row.categoryCode || ""}
                    onChange={(code) => changeCategory(index, code)}
                  />
                  {excise && (
                    <span className="text-xs font-semibold text-[var(--accent)] mt-1 block">เสียสรรพสามิต — แจ้งราคาที่หัวข้อ 4</span>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      className="w-full"
                      ariaLabel={`สูตรแถวที่ ${index + 1}`}
                      value={row.formulaId || ""}
                      onChange={(v) => setRow(index, { formulaId: v })}
                      disabled={!row.categoryCode}
                      placeholder={row.categoryCode ? "— เลือกสูตรจากทะเบียน —" : "เลือกหมวดก่อน"}
                      emptyText="ยังไม่มีสูตรของหมวดนี้ในทะเบียน"
                      options={options}
                    />
                    {picked && (
                      <span className="text-xs text-[var(--text-3)] mt-1 block">
                        {`กลิ่น: ${picked.scentName || "— สูตรยังไม่ผูกกลิ่น —"} · วันที่สูตร ${picked.formulaDate ? fmtDate(picked.formulaDate) : "— ยังไม่ระบุ —"}`}
                      </span>
                    )}
                  </div>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      mono
                      aria-label={`จำนวนชิ้นของสูตรแถวที่ ${index + 1}`}
                      title="จำนวนชิ้นในชุด"
                      value={row.pieceQty ?? ""}
                      onChange={(e) => setRow(index, { pieceQty: e.target.value })}
                      min="1"
                      step="1"
                      placeholder="1 ชิ้น"
                    />
                  </div>
                  <Button
                    iconOnly
                    tone="danger"
                    variant="ghost"
                    size="sm"
                    aria-label={`ลบสูตรแถวที่ ${index + 1}`}
                    onClick={() => removeRow(index)}
                    icon={<Trash2 size={14} />}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2">
        <Button size="sm" variant="ghost" onClick={() => onRows([...rows, newRow()])} icon={<Plus size={13} />}>
          เพิ่มสูตร
        </Button>
      </div>
    </div>
  );
}
