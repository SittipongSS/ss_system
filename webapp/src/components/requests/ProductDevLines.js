"use client";
// ── ตารางบรรทัดของ "พัฒนาผลิตภัณฑ์" (P4) ─────────────────────────────────
//
// ⭐ **1 บรรทัด = หมวดสินค้า × กลิ่น** — ซึ่งเป็นตัวตนของสูตรที่จะเกิดพอดี
// (`formulas_identity_uk` ของ 0207) ⇒ ขอของชิ้นเดียวกันซ้ำในใบเดียวเป็นไปไม่ได้
//
// ⚠️ หมวดใช้ **ตัวเลือกกลาง** ตัวเดียวกับฟอร์มดีล/โครงการ/ทะเบียนสูตร (P2c) —
// ช่องเดียว หมวดหลักเป็นหัวกลุ่ม ⇒ ลงเซลล์ตารางได้ · นี่คือเหตุผลที่ยุบมันตั้งแต่ P2c
//
// ⭐ **รางข้างสองชั้น** (มติผู้ใช้ 2026-08-09) — ผังเดียวกับรายการเอกสารและแบบฟอร์ม
// PDR · แต่ละแถวมี 5 ช่อง กางพร้อมกันหลายแถวแล้วยาวเกินจอทันทีตั้งแต่แถวที่สอง
// ⚠️ ป้ายในรางต้องบอกว่า **แถวนั้นคือของชิ้นไหน** (หมวด × กลิ่น = ตัวตนของสูตร)
// ไม่ใช่ "รายการที่ 2" — และแถวที่ซ้ำกับแถวก่อนต้องเห็นได้จากราง ไม่ต้องกดเข้าไปดู
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import SectionRail from "@/components/ui/SectionRail";
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

/* ป้ายของแถวในราง — "หมวด × กลิ่น" คือตัวตนของสูตรที่จะเกิด จึงเป็นคำตอบที่ดีที่สุด
   ⚠️ เลือกยังไม่ครบ = บอกเท่าที่มี (หมวดอย่างเดียว/กลิ่นอย่างเดียว) ดีกว่าเลขลำดับล้วน */
function rowLabel(row, index, categories, scents) {
  const cat = categories.find((c) => c.typeCode === row.categoryCode || String(c.id) === row.categoryCode);
  const scent = scents.find((s) => s.id === row.scentId);
  const parts = [cat?.nameTh || cat?.nameEn || cat?.typeCode, scent?.code || scent?.name].filter(Boolean);
  return parts.length ? parts.join(" × ") : `รายการที่ ${index + 1}`;
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
      <SectionRail
        ariaLabel="รายการที่ขอ"
        value={String(at)}
        onChange={(key) => setActive(Number(key))}
        sections={rows.map((r, i) => ({
          key: String(i),
          label: rowLabel(r, i, categories, scents),
          // ครบ = มีทั้งหมวดและกลิ่น (สองอย่างนี้คือตัวตนของสูตรที่จะเกิด)
          count: { total: 2, filled: (r.categoryCode ? 1 : 0) + (r.scentId ? 1 : 0) },
        }))}
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
            <Input
              id={`pd-unit-${at}`} value={row.unit} disabled={disabled}
              placeholder="เช่น ชิ้น · ขวด"
              onChange={(e) => patchAt({ unit: e.target.value })}
            />
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
      </SectionRail>

      <Button
        size="sm" disabled={disabled}
        icon={<Plus size={14} aria-hidden="true" />}
        onClick={addRow}
      >
        เพิ่มรายการ
      </Button>
    </div>
  );
}
