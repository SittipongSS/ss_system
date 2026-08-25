"use client";
// ── ตารางบรรทัดของ "พัฒนาผลิตภัณฑ์" (P4) ─────────────────────────────────
//
// ⭐ **1 บรรทัด = หมวดสินค้า × กลิ่น** — ซึ่งเป็นตัวตนของสูตรที่จะเกิดพอดี
// (`formulas_identity_uk` ของ 0207) ⇒ ขอของชิ้นเดียวกันซ้ำในใบเดียวเป็นไปไม่ได้
//
// ⚠️ หมวดใช้ **ตัวเลือกกลาง** ตัวเดียวกับฟอร์มดีล/โครงการ/ทะเบียนสูตร (P2c) —
// ช่องเดียว หมวดหลักเป็นหัวกลุ่ม ⇒ ลงเซลล์ตารางได้ · นี่คือเหตุผลที่ยุบมันตั้งแต่ P2c
//
// ⭐ **ราง ไม่ใช่แถวยุบ** (มติผู้ใช้ 2026-08-25: *"สองชั้น ซ้ายขวา ใช้กับพัฒนาสูตร
// ด้วยได้มั้ย"*) — **ทับมติ 2026-08-09** ที่เลือก `ui/EditableLineList`
//
// เหตุผลของมติเดิมคือ "แถวสรุปกินเต็มความกว้าง ⇒ ใส่ได้ครบทั้งรหัส+ชื่อหมวด ·
// รหัส+ชื่อกลิ่น · วันที่ของกลิ่น ซึ่งรางกว้าง 13rem ใส่ไม่ลง" · สิ่งที่เปลี่ยนไปคือ
// **แท็บ "รายละเอียด" ของหัวข้ออื่นเป็นรางหมดแล้ว** (ขอเอกสาร · ขอใบวางบิล · PDR)
// ⇒ พัฒนาสูตรเป็นหัวข้อเดียวที่เหลือเป็นแถวยุบ · คนที่สลับหัวข้อเจอสองผังในแท็บ
// ชื่อเดียวกัน ⇒ ความคงเส้นคงวาชนะรายละเอียดบนแถวสรุป
//
// ⚠️ **`sub` (วันที่กลิ่น · จำนวน+หน่วย) ไม่ขึ้นบนราง** — มันมีไว้ตอนแถว *ยุบ* เท่านั้น
// พอเป็นรางแล้วแถวที่เลือกอยู่กางอยู่ฝั่งขวาเสมอ ⇒ ทั้งวันที่กลิ่นและจำนวนอ่านได้จาก
// ช่องจริงของมันอยู่แล้ว · และ `main` ไม่ซ้ำกันโดยโครงสร้างอยู่แล้ว (หมวด × กลิ่น
// ซ้ำกันไม่ได้ — `duplicatePair`) ⇒ ไม่ต้องมีบรรทัดรองมาช่วยแยก
// ⚠️ **ห้ามถอยกลับไปเป็นแถวยุบโดยไม่ถามเจ้าของงานก่อน** — เป็นมติที่ถูกทับไปแล้ว
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import SectionRail from "@/components/ui/SectionRail";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import { isScentUsable } from "@/lib/master/scents";
import { productDevRowText } from "@/lib/requests/productDevLabel";
import { ALL_UNITS, unitOptions } from "@/lib/master/units";
import styles from "./scentDelivery.module.css";

export const emptyProductDevRow = () => ({
  categoryCode: "", scentId: "", qty: "", unit: "", spec: "",
});

// หมวด × กลิ่น ซ้ำ = ขอของชิ้นเดียวกันสองรอบ · ปล่อยผ่านแล้ว RD จะสร้างสูตรได้
// ตัวเดียว แถวที่สองค้างตลอดกาลเพราะชนตัวตนของสูตร
export function duplicatePair(row, index, rows) {
  if (!row.categoryCode || !row.scentId) return false;
  return rows.some((r, i) => i < index
    && r.categoryCode === row.categoryCode && r.scentId === row.scentId);
}

export default function ProductDevLines({
  rows, onChange, categories = [], scents = [], customerId = null, disabled = false,
}) {
  // ⚠️ จำตำแหน่ง ไม่ใช่ id — แถวยังไม่มี id จนกว่าจะบันทึก (เหตุผลเดียวกับ DocumentLines)
  const [active, setActive] = useState(0);
  const patch = (i, next) => onChange(rows.map((r, j) => (i === j ? { ...r, ...next } : r)));

  // ⚠️ กลิ่นข้ามลูกค้าไม่ได้ (มติ 9) — กรองที่ต้นทาง ไม่ปล่อยให้เลือกผิดแล้วให้
  // server ตีกลับ · ร่างยังไม่ใช่ของจริงจึงเลือกไม่ได้ (isScentUsable)
  const scentOptions = scents
    .filter((s) => isScentUsable(s) && (!customerId || s.customerId === customerId))
    .map((s) => ({
      value: s.id,
      label: `${s.code ? `${s.code} · ` : ""}${s.name}`,
      search: [s.code, s.name, s.customerTradeName].filter(Boolean).join(" "),
    }));

  const at = Math.min(active, Math.max(rows.length - 1, 0));
  const row = rows[at] || emptyProductDevRow();
  const dup = duplicatePair(row, at, rows);
  const patchAt = (next) => patch(at, next);
  const addRow = () => {
    onChange([...rows, emptyProductDevRow()]);
    setActive(rows.length);
  };
  /* ⚠️ ลบ **แถวที่ระบุ** ไม่ใช่แถวที่เปิดอยู่ — ปุ่มอยู่ที่แต่ละแถวในรางแล้ว
     ⚠️ ตัวที่เปิดอยู่ต้องขยับตามเมื่อลบตัวที่อยู่ก่อนหน้า ไม่งั้นเนื้อฝั่งขวาจะกระโดด
     ไปเป็นของอีกแถวโดยที่คนกดไม่ได้สั่ง (กติกาเดียวกับ DocumentLines) */
  const removeRow = (index) => {
    onChange(rows.filter((_, j) => j !== index));
    setActive((cur) => (index < cur ? cur - 1 : Math.min(cur, rows.length - 2)));
  };

  return (
    <div className={styles.wrap}>
      <SectionRail
        ariaLabel="รายการที่ขอ"
        /* ⚠️ คีย์เป็น **ตำแหน่ง** ด้วยเหตุผลเดียวกับ `active` — แถวยังไม่มี id
           จนกว่าจะบันทึก · ลบแถวกลางแล้วคีย์ของตัวที่เหลือขยับตามซึ่งถูกต้อง
           เพราะเนื้อของมันก็มาจาก `rows[at]` ตำแหน่งใหม่เหมือนกัน */
        sections={rows.map((r, i) => {
          const text = productDevRowText(r, i, { categories, scents });
          return {
          key: `row-${i}`,
          /* ⚠️ **`short` ไม่ใช่ `main`** — ป้ายเต็มตัดคำลงราง 208px ได้แถวละ 100px
             (วัดจริง) ⇒ 5 รายการก็เป็นรางสูง 500px ของป้ายล้วน · ชื่อเต็มยังอยู่ที่
             tooltip และที่เนื้อฝั่งขวาซึ่งกางอยู่แล้วของแถวที่เลือก */
          label: text.short,
          title: text.main,
          // เขียว = ครบพอที่จะส่งได้ (มีทั้งหมวดและกลิ่น และไม่ซ้ำ) · ตัวเดียวกับด่านส่ง
          tone: Boolean(r.categoryCode && r.scentId) && !duplicatePair(r, i, rows)
            ? "full" : "none",
          /* ⭐ ถังขยะอยู่ที่แถวของมันเอง ชิดขวา (กติกาเดียวกับ DocumentLines) —
             ลบแถวไหนก็ได้โดยไม่ต้องเปิดมันก่อน · ใบต้องมีอย่างน้อย 1 รายการ
             (ด่านส่ง) ⇒ เหลือแถวเดียวไม่มีปุ่ม */
          action: rows.length > 1 ? {
            icon: <Trash2 size={14} aria-hidden="true" />,
            title: `ลบ ${text.short}`,
            disabled,
            onClick: () => removeRow(i),
          } : null,
          };
        })}
        value={`row-${at}`}
        onChange={(key) => setActive(Number(key.replace("row-", "")))}
        emptyText="ยังไม่มีรายการ — กดปุ่มข้างซ้ายเพื่อเพิ่มรายการแรก"
        navFooter={(
          /* terracotta = "เริ่มของใหม่" · ปุ่มพื้นฐานมองไม่เห็นในราง (พื้น `--panel`
             เข้มกว่าพื้นราง `--panel-2`) — เหตุผลเต็มอยู่ที่ DocumentLines */
          <Button
            size="sm" tone="accent" disabled={disabled}
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={addRow}
          >
            เพิ่มรายการ
          </Button>
        )}
      >
        {rows.length > 0 && (
        <div className="form-grid cols-2">
          {/* ⚠️ ไม่มีปุ่มลบตรงนี้แล้ว — ย้ายไปเป็นถังขยะที่แถวในราง */}
          <div className="form-group col-span-2">
            <span className="form-field-label">ของที่ขอ</span>
          </div>

          <ProductCategorySelect
            categories={categories}
            value={row.categoryCode}
            disabled={disabled}
            required
            onChange={(categoryCode) => patchAt({ categoryCode })}
          />

          <div className="form-group col-span-2">
            <label htmlFor={`pd-scent-${at}`}>กลิ่น</label>
            <SearchableSelect
              id={`pd-scent-${at}`} value={row.scentId} disabled={disabled}
              onChange={(v) => patchAt({ scentId: v })}
              options={scentOptions}
              placeholder="เลือกกลิ่นจากทะเบียน"
              emptyText={customerId
                ? "ลูกค้ารายนี้ยังไม่มีกลิ่นที่ใช้ได้ — ต้องผ่านสายพัฒนากลิ่นก่อน"
                : "เลือกดีลก่อน แล้วจะเห็นกลิ่นของลูกค้ารายนั้น"}
            />
            {dup && (
              <p className={styles.error}>
                หมวดกับกลิ่นคู่นี้ซ้ำกับรายการก่อนหน้า — เป็นของชิ้นเดียวกัน
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor={`pd-qty-${at}`}>
              จำนวน <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            <Input
              id={`pd-qty-${at}`} type="number" min="0" step="any" mono
              value={row.qty} disabled={disabled}
              onChange={(e) => patchAt({ qty: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`pd-unit-${at}`}>
              หน่วย <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            {/* ⚠️ เดิมเป็นช่องพิมพ์อิสระ (≤50 ตัว) ที่มี placeholder ว่า "เช่น ชิ้น · ขวด"
                — คำใบ้พาคนกรอกคำที่ระบบไม่รู้จัก แล้วหน่วยบนคำร้องกับบนใบเสนอราคาหลุดกัน
                ใช้ ALL_UNITS (หน่วยขาย ∪ หน่วยบรรจุ) เพราะช่องนี้ถามว่า "ขอเท่าไร" — ของจริง
                ในฐานมีทั้ง 'ชิ้น' และ 'ml' · ยังไม่บังคับ (เว้นว่างได้เหมือนเดิม)
                · unitOptions พ่วงค่าเดิมของแถวเก่าไว้ ไม่ให้เด้งเป็นค่าอื่นตอนเปิดมาแก้ */}
            <Select
              id={`pd-unit-${at}`} value={row.unit || ""} disabled={disabled}
              onChange={(e) => patchAt({ unit: e.target.value })}
              aria-label={`หน่วย รายการ ${at}`}
              fullWidth
            >
              <option value="">ไม่ระบุ</option>
              {unitOptions(ALL_UNITS, row.unit).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>

          <div className="form-group col-span-2">
            <label htmlFor={`pd-spec-${at}`}>
              รายละเอียด <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            <Textarea
              id={`pd-spec-${at}`} rows={2} maxLength={2000}
              value={row.spec} disabled={disabled}
              placeholder="สิ่งที่อยากได้จากตัวอย่างนี้ เช่น ขนาด · สี · ความเข้มข้น"
              onChange={(e) => patchAt({ spec: e.target.value })}
            />
          </div>
        </div>
        )}
      </SectionRail>
    </div>
  );
}
