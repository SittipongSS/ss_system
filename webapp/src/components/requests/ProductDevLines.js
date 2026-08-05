"use client";
// ── ตารางบรรทัดของ "พัฒนาผลิตภัณฑ์" (P4) ─────────────────────────────────
//
// ⭐ **1 บรรทัด = หมวดสินค้า × กลิ่น** — ซึ่งเป็นตัวตนของสูตรที่จะเกิดพอดี
// (`formulas_identity_uk` ของ 0207) ⇒ ขอของชิ้นเดียวกันซ้ำในใบเดียวเป็นไปไม่ได้
//
// ⚠️ หมวดใช้ **ตัวเลือกกลาง** ตัวเดียวกับฟอร์มดีล/โครงการ/ทะเบียนสูตร (P2c) —
// ช่องเดียว หมวดหลักเป็นหัวกลุ่ม ⇒ ลงเซลล์ตารางได้ · นี่คือเหตุผลที่ยุบมันตั้งแต่ P2c
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import { isScentUsable } from "@/lib/master/scents";
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

  return (
    <div className={styles.wrap}>
      {rows.map((row, i) => {
        const dup = duplicatePair(row, i, rows);
        return (
          <div key={i} className={styles.row}>
            <div className={styles.rowHead}>
              <span className={styles.rowNo}>รายการที่ {i + 1}</span>
              {rows.length > 1 && (
                <Button
                  size="sm" variant="ghost" tone="danger" disabled={disabled}
                  title="ลบรายการนี้"
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                />
              )}
            </div>

            <div className="form-grid">
              <ProductCategorySelect
                categories={categories}
                value={row.categoryCode}
                disabled={disabled}
                required
                onChange={(categoryCode) => patch(i, { categoryCode })}
              />

              <div className="form-group col-span-2">
                <label htmlFor={`pd-scent-${i}`}>กลิ่น</label>
                <SearchableSelect
                  id={`pd-scent-${i}`} value={row.scentId} disabled={disabled}
                  onChange={(v) => patch(i, { scentId: v })}
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
                <label htmlFor={`pd-qty-${i}`}>
                  จำนวน <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <Input
                  id={`pd-qty-${i}`} type="number" min="0" step="any" mono
                  value={row.qty} disabled={disabled}
                  onChange={(e) => patch(i, { qty: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor={`pd-unit-${i}`}>
                  หน่วย <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <Input
                  id={`pd-unit-${i}`} value={row.unit} disabled={disabled}
                  placeholder="เช่น ชิ้น · ขวด"
                  onChange={(e) => patch(i, { unit: e.target.value })}
                />
              </div>

              <div className="form-group col-span-2">
                <label htmlFor={`pd-spec-${i}`}>
                  รายละเอียด <span className={styles.hint}>(ไม่บังคับ)</span>
                </label>
                <Textarea
                  id={`pd-spec-${i}`} rows={2} maxLength={2000}
                  value={row.spec} disabled={disabled}
                  placeholder="สิ่งที่อยากได้จากตัวอย่างนี้ เช่น ขนาด · สี · ความเข้มข้น"
                  onChange={(e) => patch(i, { spec: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}

      <Button
        size="sm" disabled={disabled}
        icon={<Plus size={14} aria-hidden="true" />}
        onClick={() => onChange([...rows, emptyProductDevRow()])}
      >
        เพิ่มรายการ
      </Button>
    </div>
  );
}
