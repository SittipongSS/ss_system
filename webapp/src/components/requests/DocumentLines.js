"use client";
// ── ตารางบรรทัดของ "ขอเอกสาร" (P5) ───────────────────────────────────────
//
// ⭐ 1 บรรทัด = 1 ชนิดเอกสาร — ขอหลายอย่างในใบเดียวได้ และแต่ละอย่างเดินคนละจังหวะ
// (IFRA มาก่อน COA ได้) ⇒ สถานะอยู่ที่แถว เหมือนทุกสายในระบบนี้
//
// ⚠️ **ไม่มีช่อง "ต้องใช้ภายใน" รายแถว** — `dueAt` ของ 0204 เป็นคำสัญญาของ *ผู้ตอบ*
// ("รับปากว่าจะส่งวันไหน") ยัดความหมายของผู้ขอลงช่องเดียวกันแล้วสองฝ่ายจะเขียนทับกัน
// วันที่ต้องการคำตอบระดับใบมีอยู่แล้ว
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import Textarea from "@/components/ui/Textarea";
import { REQUEST_DOC_VOCABULARY } from "@/lib/requests/docTypes";
import styles from "./scentDelivery.module.css";

export const emptyDocumentRow = () => ({ docType: "", spec: "" });

// ⭐ `vocabulary` ทำให้ตารางนี้ใช้ได้ทั้งเอกสารเทคนิคของ RD และเอกสารการเงินของ
// ฝ่ายบัญชี — กฎของบรรทัดเหมือนกันทุกข้อ ต่างแค่ลิสต์ชนิด
export default function DocumentLines({
  rows, onChange, disabled = false, vocabulary = REQUEST_DOC_VOCABULARY,
}) {
  const patch = (i, next) => onChange(rows.map((r, j) => (i === j ? { ...r, ...next } : r)));

  return (
    <div className={styles.wrap}>
      {rows.map((row, i) => {
        const needsDetail = vocabulary.needsDetail(row.docType);
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
              <div className="form-group col-span-2">
                <span className="form-field-label">ชนิดเอกสาร</span>
                {/* ⭐ **แผ่นเลือก ไม่ใช่ดรอปดาวน์** (มติผู้ใช้ 2026-08-09) — ชุดตายตัว
                    4–5 ตัว เข้ากติกาคอนโทรล v2 ("≤6 กางให้เห็น") เหมือนหัวข้อคำร้อง
                    · คนขอเอกสารส่วนใหญ่ไม่ได้จำว่า COA ต่างจาก MSDS ยังไง ⇒ คำขยาย
                    ใต้ชื่อทำให้เลือกถูกตั้งแต่ครั้งแรก แทนที่จะเปิดดรอปดาวน์อ่านทีละอัน
                    ⚠️ ไม่มีตัวเลือก "— เลือกชนิดเอกสาร —" อีกแล้ว: แผ่นที่ยังไม่เลือก
                    คือทุกใบไม่มีขอบ accent ซึ่งอ่านออกอยู่แล้วว่ายังไม่ได้เลือก */}
                <OptionTiles
                  value={row.docType}
                  onChange={(v) => patch(i, { docType: v })}
                  disabled={disabled}
                  ariaLabel={`ชนิดเอกสารของรายการที่ ${i + 1}`}
                  options={vocabulary.types.map((t) => ({
                    value: t.value,
                    label: t.short || t.label,
                    description: t.summary || undefined,
                  }))}
                />
              </div>
              <div className="form-group col-span-2">
                <label htmlFor={`doc-spec-${i}`}>
                  รายละเอียด
                  {needsDetail
                    ? null
                    : <span className={styles.hint}> (ไม่บังคับ)</span>}
                </label>
                <Textarea
                  id={`doc-spec-${i}`} rows={2} maxLength={2000}
                  value={row.spec} disabled={disabled}
                  placeholder={needsDetail
                    ? "ขอเอกสารอะไร — ต้องระบุเพราะเลือก \"อื่น ๆ\" ไว้"
                    : "เช่น ของล็อตไหน / ภาษาอะไร / ต้องมีลายเซ็นไหม"}
                  onChange={(e) => patch(i, { spec: e.target.value })}
                />
                {/* ⚠️ "อื่น ๆ" ที่ไม่มีรายละเอียด = แถวที่ไม่ได้บอกอะไรเลยว่าขออะไร
                    ฝ่ายปลายทางจะต้องเดาหรือถามกลับ ซึ่งเสียรอบไปหนึ่งรอบเปล่า ๆ */}
                {needsDetail && !row.spec.trim() && (
                  <p className={styles.error}>เลือก &quot;อื่น ๆ&quot; ต้องระบุว่าขอเอกสารอะไร</p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Button
        size="sm" disabled={disabled}
        icon={<Plus size={14} aria-hidden="true" />}
        onClick={() => onChange([...rows, emptyDocumentRow()])}
      >
        เพิ่มเอกสาร
      </Button>
    </div>
  );
}
