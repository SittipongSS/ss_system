"use client";
// ── ตารางบรรทัดของ "พัฒนาผลิตภัณฑ์" (P4) ─────────────────────────────────
//
// ⭐ **1 บรรทัด = หมวดสินค้า × กลิ่น** — ซึ่งเป็นตัวตนของสูตรที่จะเกิดพอดี
// (`formulas_identity_uk` ของ 0207) ⇒ ขอของชิ้นเดียวกันซ้ำในใบเดียวเป็นไปไม่ได้
//
// ⚠️ หมวดใช้ **ตัวเลือกกลาง** ตัวเดียวกับฟอร์มดีล/โครงการ/ทะเบียนสูตร (P2c) —
// ช่องเดียว หมวดหลักเป็นหัวกลุ่ม ⇒ ลงเซลล์ตารางได้ · นี่คือเหตุผลที่ยุบมันตั้งแต่ P2c
//
// ⭐ **ยุบบรรทัดที่กรอกแล้ว** (มติผู้ใช้ 2026-08-09 · `ui/EditableLineList`) —
// แต่ละแถวมี 5 ช่อง กางพร้อมกันหลายแถวแล้วยาวเกินจอตั้งแต่แถวที่สอง
// ⚠️ **เลือกแบบนี้แทนรางข้าง** เพราะแถวสรุปกินเต็มความกว้าง ⇒ ใส่ได้ครบทั้ง
// รหัส+ชื่อหมวด · รหัส+ชื่อกลิ่น · วันที่ของกลิ่น (มติผู้ใช้) ซึ่งรางกว้าง 13rem ใส่ไม่ลง
import { useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import EditableLineList from "@/components/ui/EditableLineList";
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
  const removeRow = () => {
    onChange(rows.filter((_, j) => j !== at));
    setActive(Math.max(at - 1, 0));
  };

  return (
    <div className={styles.wrap}>
      <EditableLineList
        count={rows.length}
        active={at}
        onActiveChange={setActive}
        onAdd={addRow}
        addLabel="เพิ่มรายการ"
        disabled={disabled}
        renderSummary={(i) => {
          const r = rows[i];
          const { main, sub } = productDevRowText(r, i, { categories, scents });
          // ครบ = มีทั้งหมวดและกลิ่น (สองอย่างนี้คือตัวตนของสูตรที่จะเกิด)
          const ready = Boolean(r.categoryCode && r.scentId) && !duplicatePair(r, i, rows);
          return (
            <>
              <span className="line-summary-dot" data-ok={ready ? "1" : undefined} />
              <span className="line-summary-main">{main}</span>
              {sub && <span className="line-summary-sub">{sub}</span>}
              <span className="line-summary-open">แก้ไข</span>
            </>
          );
        }}
      >
        <div className="form-grid cols-2">
          <div className="form-group col-span-2">
            <span className="form-field-label split">
              ของที่ขอ
              {rows.length > 1 && (
                <Button
                  size="sm" variant="ghost" tone="danger" disabled={disabled}
                  title="ลบรายการนี้"
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  onClick={removeRow}
                >
                  ลบรายการนี้
                </Button>
              )}
            </span>
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
      </EditableLineList>
    </div>
  );
}
