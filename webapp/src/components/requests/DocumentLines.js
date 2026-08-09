"use client";
// ── ตารางบรรทัดของ "ขอเอกสาร" (P5) ───────────────────────────────────────
//
// ⭐ 1 บรรทัด = 1 ชนิดเอกสาร — ขอหลายอย่างในใบเดียวได้ และแต่ละอย่างเดินคนละจังหวะ
// (IFRA มาก่อน COA ได้) ⇒ สถานะอยู่ที่แถว เหมือนทุกสายในระบบนี้
//
// ⭐ **รางข้างสองชั้น** (มติผู้ใช้ 2026-08-09) — รายการที่ขอเป็นรางซ้าย เนื้อของ
// รายการที่เลือกอยู่ขวา · ผังเดียวกับแบบฟอร์ม PDR (`ui/SectionRail`) ⇒ ฟอร์มคำร้อง
// พูดภาษาเดียวทั้งใบ · ของเดิมกางทุกบรรทัดพร้อมกัน แค่ 3 รายการก็สูง ~900px เกินจอ
//
// ⚠️ **รางต้องบอกให้ครบว่าแต่ละใบขออะไร** — ต่างจาก PDR ที่หมวดตายตัวรู้อยู่แล้ว
// รายการเอกสารเป็นของที่ผู้ใช้สร้างเอง ถ้ารางโชว์แค่ "รายการที่ 2" คนจะไม่รู้ว่า
// ขออะไรไปแล้วบ้างจนกว่าจะกดเข้าไปดูทีละใบ ⇒ ป้ายในรางใช้ **ชื่อชนิดที่เลือกแล้ว**
// และจุดสีบอกว่าใบนั้นครบหรือยัง
//
// ⚠️ **ไม่มีช่อง "ต้องใช้ภายใน" รายแถว** — `dueAt` ของ 0204 เป็นคำสัญญาของ *ผู้ตอบ*
// ("รับปากว่าจะส่งวันไหน") ยัดความหมายของผู้ขอลงช่องเดียวกันแล้วสองฝ่ายจะเขียนทับกัน
// วันที่ต้องการคำตอบระดับใบมีอยู่แล้ว
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import SectionRail from "@/components/ui/SectionRail";
import Textarea from "@/components/ui/Textarea";
import { REQUEST_DOC_VOCABULARY } from "@/lib/requests/docTypes";
import styles from "./scentDelivery.module.css";

export const emptyDocumentRow = () => ({ docType: "", spec: "" });

/* ป้ายของแถวในราง — ชนิดที่เลือกแล้วคือคำตอบที่ดีที่สุด · ยังไม่เลือก = บอกเลขที่
   ⚠️ ต้องสั้น รางกว้าง 13rem (ดู `.section-rail`) */
function railLabel(row, index, vocabulary) {
  const type = vocabulary.types.find((t) => t.value === row.docType);
  if (!type) return `รายการที่ ${index + 1}`;
  return type.short || type.label;
}

// ⭐ `vocabulary` ทำให้ตารางนี้ใช้ได้ทั้งเอกสารเทคนิคของ RD และเอกสารการเงินของ
// ฝ่ายบัญชี — กฎของบรรทัดเหมือนกันทุกข้อ ต่างแค่ลิสต์ชนิด
export default function DocumentLines({
  rows, onChange, disabled = false, vocabulary = REQUEST_DOC_VOCABULARY,
}) {
  // ⚠️ จำเป็น **ตำแหน่ง** ไม่ใช่ id — บรรทัดยังไม่มี id จนกว่าจะบันทึก · ลบแถวแล้ว
  // ต้องเลื่อนตัวที่เลือกอยู่ให้ไม่ชี้ช่องว่าง (กันด้วย `Math.min` ตอนเรนเดอร์)
  const [active, setActive] = useState(0);
  const at = Math.min(active, Math.max(rows.length - 1, 0));
  const row = rows[at] || emptyDocumentRow();
  const needsDetail = vocabulary.needsDetail(row.docType);

  const patch = (next) => onChange(rows.map((r, j) => (at === j ? { ...r, ...next } : r)));
  const addRow = () => {
    onChange([...rows, emptyDocumentRow()]);
    setActive(rows.length);   // เปิดใบใหม่ให้เลย — เพิ่มแล้วต้องได้กรอกต่อทันที
  };
  const removeRow = () => {
    onChange(rows.filter((_, j) => j !== at));
    setActive(Math.max(at - 1, 0));
  };

  return (
    <div className={styles.wrap}>
      <SectionRail
        ariaLabel="รายการเอกสารที่ขอ"
        value={String(at)}
        onChange={(key) => setActive(Number(key))}
        sections={rows.map((r, i) => ({
          key: String(i),
          label: railLabel(r, i, vocabulary),
          // จุดสี: เขียว = ใบนี้ครบแล้ว · เทา = ยังไม่ได้เลือกชนิด
          count: {
            total: 1,
            filled: r.docType && (!vocabulary.needsDetail(r.docType) || r.spec.trim()) ? 1 : 0,
          },
        }))}
      >
        <div className="form-grid cols-2">
          <div className="form-group col-span-2">
            <span className="form-field-label split">
              ชนิดเอกสาร
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
            {/* ⭐ **แผ่นเลือก ไม่ใช่ดรอปดาวน์** (มติผู้ใช้ 2026-08-09) — ชุดตายตัว
                4–5 ตัว เข้ากติกาคอนโทรล v2 ("≤6 กางให้เห็น") เหมือนหัวข้อคำร้อง
                · คนขอเอกสารส่วนใหญ่ไม่ได้จำว่า COA ต่างจาก MSDS ยังไง ⇒ คำขยาย
                ใต้ชื่อทำให้เลือกถูกตั้งแต่ครั้งแรก แทนที่จะเปิดดรอปดาวน์อ่านทีละอัน */}
            <OptionTiles
              value={row.docType}
              onChange={(v) => patch({ docType: v })}
              disabled={disabled}
              ariaLabel={`ชนิดเอกสารของ${railLabel(row, at, vocabulary)}`}
              options={vocabulary.types.map((t) => ({
                value: t.value,
                label: t.short || t.label,
                description: t.summary || undefined,
              }))}
            />
          </div>

          <div className="form-group col-span-2">
            <label htmlFor={`doc-spec-${at}`}>
              รายละเอียด
              {needsDetail ? null : <span className={styles.hint}> (ไม่บังคับ)</span>}
            </label>
            <Textarea
              id={`doc-spec-${at}`} rows={2} maxLength={2000}
              value={row.spec} disabled={disabled}
              placeholder={needsDetail
                ? "ขอเอกสารอะไร — ต้องระบุเพราะเลือก \"อื่น ๆ\" ไว้"
                : "เช่น ของล็อตไหน / ภาษาอะไร / ต้องมีลายเซ็นไหม"}
              onChange={(e) => patch({ spec: e.target.value })}
            />
            {/* ⚠️ "อื่น ๆ" ที่ไม่มีรายละเอียด = แถวที่ไม่ได้บอกอะไรเลยว่าขออะไร
                ฝ่ายปลายทางจะต้องเดาหรือถามกลับ ซึ่งเสียรอบไปหนึ่งรอบเปล่า ๆ */}
            {needsDetail && !row.spec.trim() && (
              <p className={styles.error}>เลือก &quot;อื่น ๆ&quot; ต้องระบุว่าขอเอกสารอะไร</p>
            )}
          </div>
        </div>
      </SectionRail>

      <Button
        size="sm" disabled={disabled}
        icon={<Plus size={14} aria-hidden="true" />}
        onClick={addRow}
      >
        เพิ่มเอกสาร
      </Button>
    </div>
  );
}
