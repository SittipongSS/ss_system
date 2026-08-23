"use client";
// ── รายการของ "ขอเอกสาร" — รางซ้าย/เนื้อขวา (P5) ─────────────────────────
//
// ⭐ 1 บรรทัด = 1 ชนิดเอกสาร — ขอหลายอย่างในใบเดียวได้ และแต่ละอย่างเดินคนละจังหวะ
// (IFRA มาก่อน COA ได้) ⇒ สถานะอยู่ที่แถว เหมือนทุกสายในระบบนี้
//
// ⭐ **ราง ไม่ใช่แถวยุบ** (มติผู้ใช้ 2026-08-24: *"แท็บรายละเอียด เอกสาร ปรับเป็น
// แท็ปซ้ายขวาได้มั้ย ซ้ายคือชื่อเอกสารและเพิ่มเอกสาร ขวาคือรายละเอียดเอกสาร
// คล้ายๆแบบ PDR"*) — **ทับมติ 2026-08-09** ที่เลือก `ui/EditableLineList`
//
// เหตุผลของมติเดิมคือ "แถวสรุปกินเต็มความกว้าง ⇒ โชว์ได้ทั้งชนิดและรายละเอียด
// ส่วนราง 13rem ใส่ได้แค่ชื่อชนิด" · สิ่งที่เปลี่ยนไปคือ **บริบทที่มันอยู่**:
// ตอนนี้ฟอร์มเปิดใบกับฟอร์มแก้เป็นตัวเดียวกันแล้ว และแท็บ "รายละเอียด" ของ
// หัวข้อที่มีแบบฟอร์ม PDR ก็เป็นรางอยู่แล้ว ⇒ คนที่สลับไปมาระหว่างสองหัวข้อเจอ
// สองผังในแท็บชื่อเดียวกัน · ความคงเส้นคงวาชนะรายละเอียดบนแถวสรุป
// ⚠️ **ห้ามถอยกลับไปเป็นแถวยุบโดยไม่ถามเจ้าของงานก่อน** — มันคือมติที่ถูกทับไปแล้ว
// ไม่ใช่ของที่ยังไม่เคยพิจารณา
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

/* ชื่อของแถวบนราง — ชนิดที่เลือกแล้วคือคำตอบที่ดีที่สุด · ยังไม่เลือก = บอกเลขที่
   ⚠️ ชื่อสั้น (`short`) ไม่ใช่ชื่อเต็ม — ราง 13rem ใส่ "COA — Certificate of Analysis"
   ไม่ลง และชื่อเต็มอยู่บนแผ่นเลือกฝั่งขวาให้อ่านอยู่แล้ว */
function rowTitle(row, index, vocabulary) {
  const type = vocabulary.types.find((t) => t.value === row.docType);
  if (!type) return `รายการที่ ${index + 1}`;
  return type.short || type.label;
}

// ⭐ `vocabulary` ทำให้ตารางนี้ใช้ได้ทั้งเอกสารเทคนิคของ RD และเอกสารการเงินของ
// ฝ่ายบัญชี — กฎของบรรทัดเหมือนกันทุกข้อ ต่างแค่ลิสต์ชนิด
export default function DocumentLines({
  rows, onChange, disabled = false, vocabulary = REQUEST_DOC_VOCABULARY,
  /* เนื้อเพิ่มของหัวข้อที่ครอบอยู่ — วางระหว่าง "ชนิดเอกสาร" กับ "รายละเอียด"
     ⚠️ ตารางนี้ไม่รู้ว่ามันคืออะไร (ดูเหตุผลที่ `RequestLineFields`) */
  detailExtra = null,
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

  const rowReady = (r) => Boolean(r.docType) && (!vocabulary.needsDetail(r.docType) || r.spec.trim());

  return (
    <div className={styles.wrap}>
      <SectionRail
        ariaLabel="รายการเอกสารที่ขอ"
        /* ⚠️ คีย์เป็น **ตำแหน่ง** ด้วยเหตุผลเดียวกับ `active` — แถวยังไม่มี id
           จนกว่าจะบันทึก · ลบแถวกลางแล้วคีย์ของตัวที่เหลือขยับตามซึ่งถูกต้อง
           เพราะเนื้อของมันก็มาจาก `rows[at]` ตำแหน่งใหม่เหมือนกัน */
        sections={rows.map((r, i) => ({
          key: `row-${i}`,
          label: rowTitle(r, i, vocabulary),
          // เขียว = แถวนี้กรอกครบพอที่จะส่งได้ · เทา = ยังขาด (ตัวเดียวกับด่านส่ง)
          tone: rowReady(r) ? "full" : "none",
        }))}
        value={`row-${at}`}
        onChange={(key) => setActive(Number(key.replace("row-", "")))}
        emptyText="ยังไม่มีรายการ — กดปุ่มข้างซ้ายเพื่อเพิ่มรายการแรก"
        navFooter={(
          /* ⭐ **terracotta = "เริ่มของใหม่"** (กติกาโทนปุ่ม) — ตรงความหมายของปุ่มนี้พอดี
             🐞 ปุ่มพื้นฐาน (`btn` เปล่า) **มองไม่เห็นในราง**: พื้นปุ่มเป็น `--panel`
             ซึ่ง *เข้มกว่า* พื้นราง (`--panel-2`) + ขอบจาง + ตัวอักษรสี `--text-2`
             ⇒ อ่านเป็นช่องยุบ ๆ ไม่ใช่ปุ่ม (ผู้ใช้ทัก 2026-08-24)
             ⚠️ กติกา "accent หน้าละปุ่มเดียว" ยังถือ — ตรวจแล้วทั้งหน้าเปิดคำร้องและ
             หน้ารายละเอียดไม่มีปุ่ม accent ตัวอื่น (ปุ่มหลักของหน้าเป็น navy) */
          <Button
            size="sm" tone="accent" disabled={disabled}
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={addRow}
          >
            เพิ่มเอกสาร
          </Button>
        )}
      >
        {rows.length > 0 && (
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
                ariaLabel={`ชนิดเอกสารของ${rowTitle(row, at, vocabulary)}`}
                options={vocabulary.types.map((t) => ({
                  value: t.value,
                  label: t.short || t.label,
                  description: t.summary || undefined,
                }))}
              />
            </div>

            {detailExtra}

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
        )}
      </SectionRail>
    </div>
  );
}
