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
import SearchableSelect from "@/components/ui/SearchableSelect";
import SectionRail from "@/components/ui/SectionRail";
import Textarea from "@/components/ui/Textarea";
import { REQUEST_DOC_VOCABULARY } from "@/lib/requests/docTypes";
import { isScentUsable } from "@/lib/master/scents";
import { scentUsableByCustomer } from "@/lib/master/registryShares";
import styles from "./scentDelivery.module.css";

export const emptyDocumentRow = () => ({ docType: "", productId: "", scentId: "", spec: "" });

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
  /* ⭐ บรรทัดชนิดที่เก็บที่ FG (MSDS · Spec Sheet — ศูนย์กลางเอกสารของสินค้า P2b · มติเจ้าของ 09/11/2026 "บังคับเลือก")
     เลือก FG ได้จากทะเบียนสินค้าของลูกค้าของใบ (`customerId` · ยังไม่รู้ลูกค้า = ทั้งทะเบียน — server ตรวจซ้ำเสมอ) */
  products = [], customerId = null,
  /* ⭐ บรรทัดชนิดที่เก็บที่กลิ่น (IFRA · P3 · มติเจ้าของ 09/11/2026) — เลือกกลิ่นของลูกค้าของใบ (เจ้าของหรือได้รับแชร์ · ม-150)
     ตัวกรองเดียวกับบรรทัดพัฒนาสูตร (`ProductDevLines`) · server ตรวจซ้ำที่ resolveLineLabels */
  scents = [],
}) {
  // ⚠️ จำเป็น **ตำแหน่ง** ไม่ใช่ id — บรรทัดยังไม่มี id จนกว่าจะบันทึก · ลบแถวแล้ว
  // ต้องเลื่อนตัวที่เลือกอยู่ให้ไม่ชี้ช่องว่าง (กันด้วย `Math.min` ตอนเรนเดอร์)
  const [active, setActive] = useState(0);
  const at = Math.min(active, Math.max(rows.length - 1, 0));
  const row = rows[at] || emptyDocumentRow();
  const needsDetail = vocabulary.needsDetail(row.docType);
  const wantsProduct = Boolean(vocabulary.productTarget?.(row.docType));
  /* ⚠️ บังคับเฉพาะบรรทัดใหม่ (ยังไม่มี id) — ตัวตรวจของ server (`normalizeDocLines`) กติกาเดียวกัน · บรรทัดเก่าใส่เพิ่มได้ ไม่บังคับ */
  const productMissing = (r) => Boolean(vocabulary.productTarget?.(r.docType)) && !r.productId && !r.id;
  const wantsScent = Boolean(vocabulary.scentTarget?.(row.docType));
  const scentMissing = (r) => Boolean(vocabulary.scentTarget?.(r.docType)) && !r.scentId && !r.id;
  const scentOptions = scents
    .filter((s) => s.id === row.scentId || (isScentUsable(s) && (!customerId || scentUsableByCustomer(s, customerId))))
    .map((s) => ({
      value: s.id,
      label: `${s.code ? `${s.code} · ` : ""}${s.name}`,
      search: [s.code, s.name, s.customerTradeName].filter(Boolean).join(" "),
    }));
  const productOptions = products
    .filter((fg) => !customerId || !fg.customerId || fg.customerId === customerId || fg.id === row.productId)
    .map((fg) => ({
      value: fg.id,
      label: [fg.fgCode, fg.productDescription].filter(Boolean).join(" · ") || fg.id,
      search: `${fg.fgCode || ""} ${fg.productDescription || ""}`,
    }));

  const patch = (next) => onChange(rows.map((r, j) => (at === j ? { ...r, ...next } : r)));
  const addRow = () => {
    onChange([...rows, emptyDocumentRow()]);
    setActive(rows.length);   // เปิดใบใหม่ให้เลย — เพิ่มแล้วต้องได้กรอกต่อทันที
  };
  /* ⚠️ ลบ **แถวที่ระบุ** ไม่ใช่แถวที่เปิดอยู่ — ปุ่มอยู่ที่แต่ละแถวในรางแล้ว
     ⚠️ ตัวที่เปิดอยู่ต้องขยับตามด้วยเมื่อลบตัวที่อยู่ก่อนหน้า ไม่งั้นเนื้อฝั่งขวา
     จะกระโดดไปเป็นของอีกแถวโดยที่คนกดไม่ได้สั่ง */
  const removeRow = (index) => {
    onChange(rows.filter((_, j) => j !== index));
    setActive((cur) => (index < cur ? cur - 1 : Math.min(cur, rows.length - 2)));
  };

  const rowReady = (r) => Boolean(r.docType) && (!vocabulary.needsDetail(r.docType) || r.spec.trim())
    && !productMissing(r) && !scentMissing(r);

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
          /* ⭐ **ถังขยะอยู่ที่แถวของมันเอง ชิดขวา** (มติผู้ใช้ 2026-08-24) — เดิมเป็น
             ปุ่ม "ลบรายการนี้" บนหัวของเนื้อฝั่งขวา ซึ่งอ่านเหมือนปุ่มของ *ช่องที่
             กำลังเปิด* ไม่ใช่ของ *รายการ* · ที่แถวแล้วเป้าหมายชัดในตัวเอง
             ⚠️ **ลบแถวไหนก็ได้ ไม่ต้องเปิดมันก่อน** — ต่างจากของเดิมที่ลบได้เฉพาะ
             แถวที่เปิดอยู่ ⇒ ต้องกดสองครั้ง (เปิด แล้วค่อยลบ)
             ⚠️ ใบต้องมีอย่างน้อย 1 รายการ (ด่านส่ง) ⇒ เหลือแถวเดียวไม่มีปุ่ม */
          action: rows.length > 1 ? {
            icon: <Trash2 size={14} aria-hidden="true" />,
            // เว้นวรรคก่อนชื่อ — ชนิดเอกสารเป็นตัวย่อโรมัน ("ลบCOA" อ่านติดกันจนสะดุด)
            title: `ลบ ${rowTitle(r, i, vocabulary)}`,
            disabled,
            onClick: () => removeRow(i),
          } : null,
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
              {/* ⚠️ ไม่มีปุ่มลบตรงนี้แล้ว — ย้ายไปเป็นถังขยะที่แถวในราง (ดูเหตุผลข้างบน) */}
              <span className="form-field-label">ชนิดเอกสาร</span>
              {/* ⭐ **แผ่นเลือก ไม่ใช่ดรอปดาวน์** (มติผู้ใช้ 2026-08-09) — ชุดตายตัว
                  4–5 ตัว เข้ากติกาคอนโทรล v2 ("≤6 กางให้เห็น") เหมือนหัวข้อคำร้อง
                  · คนขอเอกสารส่วนใหญ่ไม่ได้จำว่า COA ต่างจาก MSDS ยังไง ⇒ คำขยาย
                  ใต้ชื่อทำให้เลือกถูกตั้งแต่ครั้งแรก แทนที่จะเปิดดรอปดาวน์อ่านทีละอัน */}
              <OptionTiles
                value={row.docType}
                onChange={(v) => patch({
                  docType: v,
                  /* เปลี่ยนชนิดแล้วล้างเป้าที่ไม่ใช่ของชนิดใหม่ — FG ค้างไปกับ IFRA หรือกลิ่นค้างไปกับ MSDS ไม่ได้ */
                  ...(vocabulary.productTarget?.(v) ? {} : { productId: "" }),
                  ...(vocabulary.scentTarget?.(v) ? {} : { scentId: "" }),
                })}
                disabled={disabled}
                ariaLabel={`ชนิดเอกสารของ${rowTitle(row, at, vocabulary)}`}
                options={vocabulary.types.map((t) => ({
                  value: t.value,
                  label: t.short || t.label,
                  description: t.summary || undefined,
                }))}
              />
            </div>

            {wantsProduct && (
              <div className="form-group col-span-2">
                <span className="form-field-label">
                  สินค้า (FG) ที่ขอ{row.id ? <span className={styles.hint}> (บรรทัดเดิม · ไม่บังคับ)</span> : null}
                </span>
                {/* ⭐ RD ส่งงานแล้วไฟล์ลงที่ FG นี้ (แท็บเอกสารของสินค้า · แผง "เอกสารจาก RD") — ฝ่ายขายเปิดส่งลูกค้าได้จากหน้าสินค้าครั้งหน้า */}
                <SearchableSelect
                  value={row.productId || ""}
                  disabled={disabled}
                  onChange={(v) => patch({ productId: v || "" })}
                  options={productOptions}
                  placeholder="— เลือกสินค้า —"
                  emptyText={customerId ? "ลูกค้ารายนี้ยังไม่มีสินค้าในทะเบียน" : "ยังไม่มีสินค้าในทะเบียน"}
                />
                <p className={styles.hint}>ไฟล์ที่ RD ส่งจะเก็บที่สินค้านี้ — ขึ้นที่แท็บเอกสารของสินค้าด้วย</p>
                {productMissing(row) && <p className={styles.error}>เลือก FG ที่ขอ {vocabulary.label(row.docType)}</p>}
              </div>
            )}

            {wantsScent && (
              <div className="form-group col-span-2">
                <span className="form-field-label">
                  กลิ่นที่ขอ{row.id ? <span className={styles.hint}> (บรรทัดเดิม · ไม่บังคับ)</span> : null}
                </span>
                {/* ⭐ IFRA เก็บที่กลิ่น — RD ส่งงานแล้วไฟล์ลงที่กลิ่นนี้ ขึ้นที่หน้ากลิ่นและแท็บเอกสารของ FG ทุกตัวที่ใช้กลิ่นนี้ */}
                <SearchableSelect
                  value={row.scentId || ""}
                  disabled={disabled}
                  onChange={(v) => patch({ scentId: v || "" })}
                  options={scentOptions}
                  placeholder="— เลือกกลิ่น —"
                  emptyText={customerId ? "ลูกค้ารายนี้ยังไม่มีกลิ่นในทะเบียน" : "ยังไม่มีกลิ่นในทะเบียน"}
                />
                <p className={styles.hint}>ไฟล์ที่ RD ส่งจะเก็บที่กลิ่นนี้ — ขึ้นที่หน้ากลิ่นและแท็บเอกสารของ FG ที่ใช้กลิ่นนี้</p>
                {scentMissing(row) && <p className={styles.error}>เลือกกลิ่นที่ขอ {vocabulary.label(row.docType)}</p>}
              </div>
            )}

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
