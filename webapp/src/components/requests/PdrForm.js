"use client";
// ── แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR · FM-RD-01 Rev.02) ──────────────────
//
// ⭐ **พับเป็นส่วน ๆ ในหน้าเปิดคำร้อง** (มติผู้ใช้ 2026-08-06) — ฟอร์มกระดาษมี ~48 ช่อง
// กางหมดพร้อมกันคือหน้าที่เลื่อนไม่จบ · แต่แยกไปอีกหน้าก็ทำให้คนกรอกครึ่งเดียวแล้วลืม
//
// ⚠️ ใช้ `<details>` ของเบราว์เซอร์ ไม่ใช่ state ของตัวเอง — เปิด/ปิดได้ด้วยคีย์บอร์ด
// และ Ctrl+F ของเบราว์เซอร์หาเจอในส่วนที่ปิดอยู่ ซึ่ง accordion ที่เขียนเองมักทำไม่ได้
//
// ⚠️ ครึ่งหนึ่งของฟอร์มกระดาษ **ระบบรู้อยู่แล้ว** (ลูกค้า · ดีล · ผู้ร้องขอ · มูลค่าโปรเจกต์
// · จำนวนกลิ่น) ⇒ ขึ้นเป็นช่องเส้นประ ไม่ให้พิมพ์ซ้ำแล้วขัดกับของจริง
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
/* ⚠️ **ช่องเงินใช้ `MoneyInput` เสมอ ห้ามใช้ `Input` ธรรมดา** (กติกาที่หัว `ui/Input.js`)
   🐞 ผู้ใช้เจอเอง 2026-08-10 — สามช่องนี้เคยเป็นช่องข้อความอิสระ ทั้งที่คอลัมน์เป็น
   `numeric` (0214) ⇒ พิมพ์ "1,200.-" / "300-400" / "ไม่เกิน 500" ลงไปได้ แล้วไปตายที่
   ด่าน server ตอนกดบันทึก · ช่องเงินอยู่คนละหมวดกันสองหมวด ⇒ ตกด่านแล้วหาไม่เจอ
   ว่าผิดช่องไหน (ข้อความตีกลับบอกชื่อช่องแล้วเป็นด่านสุดท้าย ไม่ใช่ด่านแรก) */
import MoneyInput from "@/components/ui/MoneyInput";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import DateInput from "@/components/ui/DateInput";
import { useState } from "react";
import { FlaskConical, Image as ImageIcon, Plus, X } from "lucide-react";
import ProductCategorySelect from "@/components/ui/ProductCategorySelect";
import { categoryLabel } from "@/lib/master/categoryOf";
import EmptyState from "@/components/ui/EmptyState";
import EditableLineList from "@/components/ui/EditableLineList";
import {
  PDR_TARGET_KINDS, emptyPdrTarget, pdrTargetFilled, pdrTargetsProgress,
} from "@/lib/requests/pdrTargets";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { SCENTOTYPES, SCENT_PERFORMANCE } from "@/lib/requests/kinds/rd/scentBriefTypes";
import { briefsDroppedByMerge, switchBriefMode } from "@/lib/requests/scentBriefs";
import {
  PDR_ARTWORK, PDR_CUSTOMER_KINDS, PDR_DOCUMENTS, PDR_FIELDS, PDR_PACKAGING_FORMS,
  PDR_REQUEST_TYPES, PDR_SECTIONS, PDR_TEXTURES, pdrFieldVisible, pdrFormProgress,
} from "@/lib/requests/pdrFields";
import styles from "./requestForm.module.css";


// ⭐ **ป้ายชื่อและหัวข้อมาจากทะเบียนกลาง** (`lib/requests/pdrFields.js`) — ฟอร์มยัง
// เป็นเจ้าของ *ชนิดช่องกรอก* และช่องเส้นประที่ระบบเติมให้ แต่ **ไม่เป็นเจ้าของคำ**
// อีกต่อไป · เดิมทั้งสามจอเขียนคำเอง ⇒ ผู้ใช้ทักว่า "ฟอร์มกรอก ตอนโชว์ ตอนแก้
// มันไม่เหมือนกันเลย" ซึ่งจริงทุกมิติ: ชื่อหัวข้อ ลำดับ และคำในวงเล็บ
const FIELD = Object.fromEntries(PDR_FIELDS.map((f) => [f.key, f]));
const SECTION = Object.fromEntries(PDR_SECTIONS.map((x) => [x.key, x]));

// ป้ายเต็มของฟอร์ม = ป้ายกลาง + คำขยายในวงเล็บ (จอแสดง/เอกสารไม่เอาวงเล็บ กินที่)
const label = (key) => (FIELD[key].hint
  ? `${FIELD[key].label} (${FIELD[key].hint})`
  : FIELD[key].label);

const withBlank = (options) => [{ value: "", label: "— เลือก —" }, ...options];

// ⭐ ติ๊กได้หลายอัน — chip ที่กดสลับได้ ชุดเดียวกับ Scentotype/Performance ในบรีฟ
// ⚠️ **ไม่ติ๊กไว้ล่วงหน้า** (มติผู้ใช้เรื่องหมวดเอกสาร) — ค่าเริ่มต้นที่ติ๊กไว้ให้
// แปลว่าไม่มีใครตัดสินใจ แล้วเสียงลืมติ๊กของที่ควรมีจริงจะกลืนหายไปกับค่าเริ่มต้น
function ChipPicker({ label, options, value, onChange, disabled, hint }) {
  const list = Array.isArray(value) ? value : [];
  const toggle = (v) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="form-group col-span-2">
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.mentionPicker}>
        {options.map((o) => {
          const on = list.includes(o.value);
          return (
            <button
              key={o.value} type="button" disabled={disabled} aria-pressed={on}
              className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
              onClick={() => toggle(o.value)}
            >
              {on ? "✓ " : ""}{o.label}
            </button>
          );
        })}
      </div>
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  );
}

// ช่องที่ระบบเติมให้ — เส้นประ อ่านอย่างเดียว (แพตเทิร์นเดียวกับ "เติมจาก SO")
function Derived({ label, value, from, wide = false }) {
  return (
    <div className={wide ? "form-group col-span-2" : "form-group"}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.derived} data-empty={value ? undefined : "1"}>{value || from}</div>
    </div>
  );
}

/* ── ส่วนพับของ PDR — หัวส่วนบอกด้วยว่ามีกี่ช่องและกรอกไปแล้วเท่าไร ──────
   ⭐ มติผู้ใช้ 2026-08-09: ของเดิมโชว์แค่ชื่อส่วน ⇒ ต้องกางทั้ง 5 ลิ้นชักถึงจะรู้
   ว่ายังขาดตรงไหน · ตอนนี้เห็นตั้งแต่ยังพับอยู่
   ⚠️ นับจาก `pdrFormProgress` ที่เดียว (ไม่นับช่องที่ระบบเติมและช่องที่ซ่อน
   ตามประเภทคำขอ) — ตัวเลขบนหัวกับของที่กางออกมาต้องเป็นชุดเดียวกัน */
function Section({ title, note, children, open = false, progress = null, flat = false }) {
  const done = progress && progress.total > 0 && progress.filled >= progress.total;
  // โหมดแบน — ใช้ตอนอยู่ในรางเลือกส่วน (`ui/SectionRail`) ซึ่งทำหน้าที่เลือกส่วน
  // ให้แล้ว · ลิ้นชักซ้อนในรางคือการกดสองครั้งเพื่อเห็นของชิ้นเดียว
  if (flat) {
    return (
      <div className={styles.pdrFlat}>
        <h5 className={styles.pdrFlatTitle}>{title}</h5>
        {note && <small className={styles.hint}>{note}</small>}
        {children}
      </div>
    );
  }
  return (
    <details className={styles.pdrSection} open={open}>
      <summary className={styles.pdrSummary}>
        <span>{title}</span>
        {progress && progress.total > 0 && (
          <span className={styles.pdrCount} data-done={done ? "1" : undefined}>
            {progress.filled}/{progress.total} ช่อง
          </span>
        )}
      </summary>
      <div className={styles.pdrBody}>
        {note && <small className={styles.hint}>{note}</small>}
        {children}
      </div>
    </details>
  );
}

// เปิดแล้วเขียนต่อ — กลุ่มลูกค้าเป้าหมาย / Value Proposition (มติผู้ใช้)
//
// ⭐ **สวิตช์ ไม่ใช่ checkbox** (มติผู้ใช้ 2026-08-09) — มันคือธง "ข้อนี้เกี่ยวไหม"
// ซึ่งกติกาคอนโทรล v2 บอกให้ใช้สวิตช์ · และเปิดแล้วมีช่องพิมพ์งอกออกมา ซึ่งอ่านเป็น
// เหตุ-ผลชัดกว่ากล่องติ๊กเล็ก ๆ
// ⚠️ ค่าที่เก็บยังเป็น string เหมือนเดิม (" " = เปิดแต่ยังไม่พิมพ์) — เอกสารกับจอสรุป
// อ่านค่าเดิมอยู่ ห้ามเปลี่ยนเป็น boolean
function TickAndWrite({ label, value, onChange, disabled }) {
  const on = value != null && value !== "";
  return (
    <div className="form-group">
      <div className="flex flex-wrap gap-[14px] min-h-[36px] items-center">
        <button
          type="button" className="ui-switch" disabled={disabled}
          data-on={on ? "1" : undefined} aria-pressed={on}
          onClick={() => onChange(on ? "" : " ")}
        >
          <i aria-hidden="true" />{label}
        </button>
      </div>
      {on && (
        <Input
          value={value.trim()} disabled={disabled} aria-label={label}
          onChange={(e) => onChange(e.target.value || " ")}
        />
      )}
    </div>
  );
}

/* ── ข้อ 2.2 + 2.3 · ต้นทุนและราคาขายเป้าหมาย "รายสินค้า" (mig 0229) ──────
 *
 * ⭐ **ตารางเดียวจบทั้งสองข้อ** (มติผู้ใช้ 2026-08-10) — เดิมเป็นช่องเงินสองช่อง
 * ตัวเลขเดียวทั้งใบ ⇒ ใบที่ขอ Room Spray + Reed Diffuser + Sachet พร้อมกันกรอกได้
 * แค่ราคาเดียว · ตอนนี้หนึ่งแถว = สินค้าหนึ่งตัว ถือทั้งต้นทุน F/FB ต่อกิโล และ
 * ราคาขายต่อชิ้น ⇒ เปิดสินค้าตัวไหนก็คิดกำไรของตัวนั้นได้ในที่เดียว
 * (เอกสาร FM-RD-01 ยังพิมพ์แยก 2.2/2.3 ตามกระดาษ — คนละเรื่องกับตอนกรอก)
 *
 * ⚠️ **หมวดมาจากข้อ 1.11 ของใบเดียวกัน** ไม่ใช่ทะเบียนทั้งหมด — ใบประกาศไว้แล้วว่า
 * ขอพัฒนาหมวดอะไร · เลือกนอกนั้นได้เมื่อไร 1.11 กับ 2.2 จะขัดกันเองเงียบ ๆ
 * ⚠️ **เลือกซ้ำหมวดได้** — Room Spray 50ml กับ 100ml คนละต้นทุน (มติผู้ใช้)
 */
function PdrTargetList({ targets, onChange, productKinds, categories, disabled }) {
  const rows = Array.isArray(targets) ? targets : [];
  const kinds = Array.isArray(productKinds) ? productKinds : [];
  const [pick, setPick] = useState("");
  const [active, setActive] = useState(0);

  const nameOf = (code) => categoryLabel(code, categories) || code;
  const patch = (i, next) => onChange(rows.map((r, j) => (i === j ? { ...r, ...next } : r)));
  const add = () => {
    if (!pick) return;
    onChange([...rows, emptyPdrTarget(pick)]);
    setActive(rows.length);
  };

  const row = rows[active];
  return (
    <div className="form-group col-span-2">
      <span className={styles.fieldLabel}>{label("targets")}</span>
      {/* ⚠️ ยังไม่ติ๊ก 1.11 = **บอกว่าต้องไปทำอะไรก่อน** ไม่ใช่ปล่อยตัวเลือกว่างให้งง
          (กติกาเดียวกับ `emptyText` ของลิสต์อื่นในระบบ) */}
      {!kinds.length && (
        <small className={styles.hint}>ติ๊กประเภทสินค้าในข้อ 1.11 ก่อน แล้วจึงเพิ่มรายการที่นี่ได้</small>
      )}
      <EditableLineList
        count={rows.length}
        active={active}
        onActiveChange={setActive}
        disabled={disabled}
        addLabel="เพิ่มรายการ"
        emptyText="ยังไม่มีรายการ — เลือกประเภทสินค้าแล้วกดเพิ่ม"
        onAdd={add}
        addControl={(
          <Select
            value={pick}
            disabled={disabled || !kinds.length}
            ariaLabel="เลือกประเภทสินค้าที่จะเพิ่ม"
            onChange={(e) => setPick(e.target.value)}
            options={[
              { value: "", label: kinds.length ? "— เลือกประเภทสินค้า —" : "ยังไม่ได้ติ๊กในข้อ 1.11" },
              ...kinds.map((code) => ({ value: code, label: nameOf(code) })),
            ]}
          />
        )}
        renderSummary={(i) => {
          const r = rows[i];
          const bits = [];
          for (const kind of PDR_TARGET_KINDS) {
            if (!r[kind.onField]) continue;
            const price = r[kind.priceField];
            bits.push(`${kind.label}${price === "" || price == null ? "" : ` ${price} บาท/Kg`}`);
          }
          if (r.pricePerUnit !== "" && r.pricePerUnit != null) bits.push(`ขาย ${r.pricePerUnit} บาท/ชิ้น`);
          return (
            <>
              <span className="line-summary-dot" data-ok={pdrTargetFilled(r) ? "1" : undefined} />
              <span className="line-summary-main">{nameOf(r.categoryCode)}</span>
              <span className="line-summary-sub">{bits.join(" · ") || "ยังไม่กรอกราคา"}</span>
            </>
          );
        }}
      >
        {row && (
          <>
            <div className={styles.pdrTargetHead}>
              <span className={styles.fieldLabel}>{nameOf(row.categoryCode)}</span>
              <Button
                iconOnly icon={<X size={13} />} disabled={disabled}
                aria-label={`เอา ${nameOf(row.categoryCode)} ออกจากรายการ`}
                onClick={() => {
                  onChange(rows.filter((_, j) => j !== active));
                  setActive((a) => Math.max(0, a - 1));
                }}
              />
            </div>
            {/* สวิตช์ F/FB — เปิดแล้วค่อยงอกช่องรายละเอียดกับราคา (ท่าเดียวกับ
                `TickAndWrite` ของข้อ 1.10/2.9) · เปิดพร้อมกันทั้งคู่ได้ */}
            {PDR_TARGET_KINDS.map((kind) => {
              const on = !!row[kind.onField];
              return (
                <div className="form-group" key={kind.key}>
                  <div className="flex flex-wrap gap-[14px] min-h-[36px] items-center">
                    <button
                      type="button" className="ui-switch" disabled={disabled}
                      data-on={on ? "1" : undefined} aria-pressed={on}
                      onClick={() => patch(active, { [kind.onField]: !on })}
                    >
                      <i aria-hidden="true" />{kind.label}
                    </button>
                  </div>
                  {on && (
                    <div className="form-grid cols-2">
                      <div className="form-group">
                        <label htmlFor={`pdr-target-note-${kind.key}`}>รายละเอียด</label>
                        <Input
                          id={`pdr-target-note-${kind.key}`} value={row[kind.noteField] || ""}
                          disabled={disabled}
                          onChange={(e) => patch(active, { [kind.noteField]: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`pdr-target-kg-${kind.key}`}>ราคา (บาท/Kg)</label>
                        <MoneyInput
                          id={`pdr-target-kg-${kind.key}`} value={row[kind.priceField]}
                          disabled={disabled}
                          onChange={(v) => patch(active, { [kind.priceField]: v ?? "" })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* ⭐ ข้อ 2.3 — **ราคาต่อแถว ไม่ใช่ต่อ F/FB** (มติผู้ใช้): ชิ้นที่ขายมีชิ้นเดียว
                ไม่ได้แยกตามว่าข้างในเป็นหัวน้ำหอมหรือเนื้อสาร */}
            <div className="form-group">
              <label htmlFor="pdr-target-unit">ราคาขาย (บาท/ชิ้น) — ข้อ 2.3</label>
              <MoneyInput
                id="pdr-target-unit" value={row.pricePerUnit} disabled={disabled}
                onChange={(v) => patch(active, { pricePerUnit: v ?? "" })}
              />
            </div>
          </>
        )}
      </EditableLineList>
    </div>
  );
}

/* รายการส่วนสำหรับรางเลือกส่วน — ลำดับตรงกับที่ฟอร์มเรนเดอร์เป๊ะ
   ⚠️ "บรีฟกลิ่น" ไม่ได้อยู่ใน `PDR_SECTIONS` (มันไม่ใช่ช่องบนกระดาษ FM-RD-01
   แต่เป็นก้อนของระบบ) จึงต้องแทรกด้วยมือตรงตำแหน่งเดิม — ระหว่างลูกค้ากับสเปก */
export function pdrRailSections(value = {}, briefs = [], targets = []) {
  const of = (key) => PDR_SECTIONS.find((s) => s.key === key);
  const count = (key) => pdrFormProgress(of(key), value);
  // ⚠️ หมวดสเปกมีทั้งช่องธรรมดาและ **แถวรายสินค้า** (ข้อ 2.2/2.3 · mig 0229) ที่อยู่
  // คนละตาราง ⇒ บวกสองตัวนับเข้าด้วยกัน ไม่งั้นเลข "กรอกแล้ว/ทั้งหมด" บนหัวหมวด
  // จะไม่รวมของที่ผู้ใช้เพิ่งกรอกไป
  const specCount = () => {
    const base = count("spec");
    const rows = pdrTargetsProgress(targets);
    return { total: base.total + rows.total, filled: base.filled + rows.filled };
  };
  return [
    { key: "request", label: of("request").title, count: count("request") },
    { key: "customer", label: of("customer").title, count: count("customer") },
    {
      key: "briefs",
      label: "บรีฟกลิ่น",
      // ⚠️ นับ **ก้อนที่มีเนื้อบรีฟ** ไม่ใช่ก้อนที่มีชื่อ — ชื่อเรียกที่เว้นว่างไว้จะถูก
      // เติม "กลิ่นที่ N" ให้ตอนบันทึก (scentBriefs.js) ⇒ ถ้านับชื่อ เกจจะเด้งเป็น
      // เต็มทันทีที่กดบันทึกครั้งแรก ทั้งที่ยังไม่ได้เขียนบรีฟสักตัว
      count: { total: briefs.length, filled: briefs.filter((b) => String(b?.brief || "").trim()).length },
    },
    { key: "spec", label: of("spec").title, count: specCount() },
    { key: "regulatory", label: of("regulatory").title, count: count("regulatory") },
    { key: "signers", label: of("signers").title, count: count("signers") },
  ];
}

export default function PdrForm({
  value = {}, onChange, briefs = [], onBriefsChange, disabled = false,
  /* แถวข้อ 2.2/2.3 — อยู่คนละตารางกับหัวใบ (mig 0229) จึงเดินสายแยกเหมือนบรีฟ
     ⚠️ ผู้เรียกที่ลืมส่ง `onTargetsChange` จะได้ลิสต์ที่กดเพิ่มแล้วไม่มีอะไรเกิดขึ้น —
     ค่าตั้งต้นเป็น no-op ที่ปลอดภัย แต่เทสต์ฝั่งหน้าจอ (`pdrFields.test.mjs`) บังคับว่า
     ทั้งสองที่ที่เรียก `PdrForm` ต้องส่งมาครบ */
  targets = [], onTargetsChange = () => {},
  /* ⭐ **ค่าที่ระบบเติมให้มาเป็นก้อนเดียว** — ผลลัพธ์ของ `pdrContext()` ตรง ๆ
     🐞 เดิมแตกเป็น 8 พร็อพแยก (scentCount · customer · deal · requester ·
     coordinator · contactName · contactPhone · sampleDue) ⇒ หน้าแก้ PDR
     (`ScentDevDetail`) ส่งมาไม่ครบสักตัว โดยไม่มีอะไรฟ้อง ผลคือ:
       · ช่อง "เติมจาก…" ทุกช่องกลายเป็นเส้นประ ทั้งที่ข้อมูลมีอยู่ในใบแล้ว
       · `scentCount` ว่าง ⇒ `canMerge` เป็นเท็จ ⇒ **ปุ่ม "รวบเป็นบรีฟเดียว /
         แยกบรีฟรายกลิ่น" ไม่เรนเดอร์เลย** และใบที่บันทึกแบบรวบไว้จะโชว์
         "กลิ่นที่ 1" แทน "บรีฟรวมทุกกลิ่น"
     รับเป็นก้อนเดียวแล้วผู้เรียกลืมทีละตัวไม่ได้อีก — ลืมทั้งก้อนยังเห็นทันที */
  context = {},
  // ทะเบียนหมวดสินค้า — ผู้เรียกส่งมา (ชุดเดียวกับที่ฟอร์มคำร้องใช้กับบรรทัด)
  categories = [],
  // โหมดราง (มติผู้ใช้ 2026-08-09 "แบบ A") — ผู้เรียกวางรางเลือกส่วนเอง แล้วบอกว่า
  // ตอนนี้อยู่ส่วนไหน · ไม่ส่ง = ลิ้นชักครบทุกส่วนเหมือนเดิม (ฝั่งอ่านยังใช้แบบนั้น)
  section = null,
}) {
  // ⚠️ อ่านจาก `context` ก้อนเดียว — ชื่อคีย์ตรงกับที่ `pdrContext()` คืนมาเป๊ะ
  // ห้ามรับเป็นพร็อพแยกอีก (ดูเหตุผลที่หัวพร็อพ)
  const {
    scentCount = null, customer = null, deal = null, requester = null,
    coordinator = null, contactName = null, contactPhone = null,
  } = context;
  const rail = section != null;
  // ตัวที่เลือกค้างไว้ก่อนกด "เพิ่ม" — ยังไม่ใช่ข้อมูลของใบ (ท่าเดียวกับ FG)
  const [kindPick, setKindPick] = useState("");
  const show = (key) => !rail || section === key;
  // ⭐ ลูกค้าซื้อหลายกลิ่นแต่บอกมาแนวเดียวเป็นเรื่องปกติ (มติผู้ใช้) — รวบเป็นก้อนเดียว
  // แล้ว RD ส่งหลาย direction จากก้อนนั้น ซึ่งระบบรองรับอยู่แล้ว · จำนวนกลิ่นที่ขาย
  // เป็น **เพดาน** ไม่ใช่จำนวนที่ต้องเท่ากัน
  const merged = scentCount != null && scentCount > 1 && briefs.length === 1;
  const canMerge = scentCount != null && scentCount > 1;
  // ⚠️ **สลับโหมดต้องไม่ทิ้งของที่พิมพ์ไปแล้ว** (มติผู้ใช้ 2026-08-08) — ของเดิมล้าง
  // ทุกก้อนทุกครั้ง แม้แต่ตอนแยก 1 → N ซึ่งไม่มีเหตุผลให้ทิ้งอะไรเลย
  // · รวบแล้วก้อนที่มีเนื้อจะหายจริง ⇒ **ถามก่อน** ด้วยโมดัลของบ้าน ไม่ใช่ `confirm()`
  //   ของเบราว์เซอร์ (ratchet ห้าม native feedback)
  const switchMode = async (merge) => {
    if (merge) {
      const dropped = briefsDroppedByMerge(briefs);
      if (dropped) {
        const ok = await confirmAction({
          title: "รวบเป็นบรีฟเดียว",
          description: `บรีฟอีก ${dropped} ก้อนที่กรอกไว้จะถูกลบ เหลือเฉพาะก้อนแรก — ยืนยันไหม`,
          confirmLabel: "รวบเป็นก้อนเดียว",
          tone: "danger",
        });
        if (!ok) return;
      }
    }
    onBriefsChange(switchBriefMode(briefs, { merge, scentCount }));
  };
  const set = (patch) => onChange({ ...value, ...patch });
  const setBrief = (i, patch) => onBriefsChange(
    briefs.map((b, j) => (i === j ? { ...b, ...patch } : b)),
  );
  const toggle = (i, field, key) => {
    const list = briefs[i]?.[field] || [];
    setBrief(i, { [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
  };

  // ⚠️ ในโหมดราง **ไม่มีกรอบการ์ดของตัวเอง** (มติผู้ใช้ 2026-08-09: "หน้าตาคนละส่วน
  // กันแปลก ๆ") — ตัวรางเป็นการ์ดอยู่แล้ว ซ้อนอีกชั้นได้การ์ดในการ์ด · ส่วนที่มีของน้อย
  // (บรีฟกลิ่นตอนยังไม่เลือก SO) จะเหลือกล่องลอยที่อ่านเหมือนคนละของกับราง
  return (
    <div className={rail ? styles.pdrPlain : styles.pdr}>
      {!rail && (
        <div className={styles.pdrHead}>
          <strong>แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์ (PDR)</strong>
          <span className={styles.pdrCode}>FM-RD-01</span>
        </div>
      )}

      {show("request") && (

      <Section flat={rail} title={SECTION.request.title} open note={SECTION.request.note} progress={pdrFormProgress(SECTION.request, value)}>
        <div className="form-grid cols-2">
          {/* ⚠️ **ไม่มีแถว "วันที่ร้องขอ" ที่ฟอร์มกรอก** (มติผู้ใช้ 2026-08-09) — ระบบ
              ออกให้เองตอนกดส่ง (`submittedAt`) คนกรอกทำอะไรกับมันไม่ได้ ⇒ วางไว้ก็เป็น
              แถวเส้นประที่กินที่เปล่า ๆ · ฝั่งอ่าน (PdrSummary/เอกสาร) ยังโชว์ตามเดิม */}
          <Derived label={label("requester")} value={requester} from={FIELD.requester.from} />
          <Derived label={label("coordinator")} value={coordinator} from={FIELD.coordinator.from} />
          <Derived label={label("department")} value="การขายและบริการ" from={FIELD.department.from} />
          {/* ⚠️ **ไม่มีแถว "วันที่คาดหวังกำหนดส่งตัวอย่าง" ที่ฟอร์มกรอก** (มติผู้ใช้
              2026-08-09) — มันคือช่อง "ต้องการคำตอบ" ของคำร้องที่กรอกในแท็บ
              "กำหนดและไฟล์" อยู่แล้ว · โชว์ซ้ำที่นี่เป็นแถวอ่านอย่างเดียวที่ไม่ได้
              เพิ่มข้อมูลอะไร · ฝั่งอ่าน (PdrSummary/เอกสาร) ยังพิมพ์ตามเดิม */}
          <div className="form-group">
            <label htmlFor="pdr-type">{label("requestType")}</label>
            <Select
              id="pdr-type" value={value.requestType} disabled={disabled}
              onChange={(e) => set({ requestType: e.target.value })}
              options={withBlank(PDR_REQUEST_TYPES)}
            />
          </div>
          {/* ⭐ ขึ้นเฉพาะประเภทที่กระดาษมีช่องกรอกต่อ — ซ่อนเฉย ๆ ไม่ล้างค่า
              (สลับประเภทไปมาแล้วของที่พิมพ์ไว้ต้องไม่หาย) */}
          {pdrFieldVisible(FIELD.prevProductCode, value) && (
            <div className="form-group">
              <label htmlFor="pdr-prev">{label("prevProductCode")}</label>
              <Input id="pdr-prev" mono value={value.prevProductCode || ""} disabled={disabled}
                onChange={(e) => set({ prevProductCode: e.target.value })} />
            </div>
          )}
        </div>
      </Section>

      )}

      {show("customer") && (

      <Section flat={rail} title={SECTION.customer.title} progress={pdrFormProgress(SECTION.customer, value)}>
        <div className="form-grid cols-2">
          {/* ⚠️ นำหน้าผู้ติดต่อ (มติผู้ใช้) — "งานนี้คืองานไหน" ต้องรู้ก่อนรายละเอียดคน */}
          <Derived label={label("deal")} value={deal} from={FIELD.deal.from} />
          <Derived label={label("contactName")} value={contactName} from={FIELD.contactName.from} />
          <Derived label={label("contactPhone")} value={contactPhone} from={FIELD.contactPhone.from} />
          <Derived label={label("customer")} value={customer} from={FIELD.customer.from} />
          <div className="form-group">
            <label htmlFor="pdr-brand">{label("customerBrand")}</label>
            <Input id="pdr-brand" value={value.customerBrand} disabled={disabled}
              onChange={(e) => set({ customerBrand: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-mood">{label("moodTone")}</label>
            <Input id="pdr-mood" value={value.moodTone} disabled={disabled}
              onChange={(e) => set({ moodTone: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-dir">{label("brandDirection")}</label>
            <Input id="pdr-dir" value={value.brandDirection} disabled={disabled}
              onChange={(e) => set({ brandDirection: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-ship">{label("shipTo")}</label>
            <Input id="pdr-ship" value={value.shipTo} disabled={disabled}
              onChange={(e) => set({ shipTo: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-ckind">{label("customerKind")}</label>
            <Select id="pdr-ckind" value={value.customerKind} disabled={disabled}
              onChange={(e) => set({ customerKind: e.target.value })} options={withBlank(PDR_CUSTOMER_KINDS)} />
          </div>
          {/* ⚠️ **ไม่ derive จากดีล** — ฟอร์มถาม "มูลค่าโปรเจกต์ทั้งหมด" ซึ่งเป็นทั้ง
              โครงการ ไม่ใช่แค่ค่าออกแบบกลิ่นที่อยู่ในดีล/SO ใบนี้ · ลูกค้าอาจจ่ายค่า
              ออกแบบเก้าหมื่น แต่โครงการรวมทั้งปีเป็นล้าน (ผู้ใช้ทักมาเอง) */}
          <div className="form-group">
            <label htmlFor="pdr-value">{label("projectValue")}</label>
            <MoneyInput id="pdr-value" value={value.projectValue} disabled={disabled}
              placeholder={FIELD.projectValue.placeholder}
              onChange={(v) => set({ projectValue: v ?? "" })} />
          </div>
        </div>
        {/* ⭐ ข้อ 1.10 บนกระดาษ — อยู่ระหว่าง 1.9 กับ 1.11 ตามลำดับกระดาษ ไม่ใช่ท้ายสุด
            (AE กรอกโดยวางกระดาษไว้ข้าง ๆ ลำดับที่ไม่ตรงทำให้ต้องกระโดดหาไปมา) */}
        <span className={styles.fieldLabel}>{FIELD.targetDemographic.group} — ติ๊กแล้วเขียนต่อ</span>
        <TickAndWrite label={label("targetDemographic")} disabled={disabled}
          value={value.targetDemographic} onChange={(v) => set({ targetDemographic: v })} />
        <TickAndWrite label={label("targetPsychographic")} disabled={disabled}
          value={value.targetPsychographic} onChange={(v) => set({ targetPsychographic: v })} />
        <TickAndWrite label={label("targetPainpoint")} disabled={disabled}
          value={value.targetPainpoint} onChange={(v) => set({ targetPainpoint: v })} />
        {/* ⚠️ `.form-grid` เปล่า = คอลัมน์เดียว — ต้องมี `cols-2` สองวันที่ถึงจะอยู่
            บรรทัดเดียวกันซ้ายขวาตามที่ผู้ใช้ขอ (2026-08-09) */}
        <div className="form-grid cols-2">
          {/* ⭐ **หมวดสินค้าหลายรายการ** (มติผู้ใช้ 2026-08-09) — ตัวเลือกกลางตัวเดียว
              กับฟอร์มดีล/บรรทัดคำร้อง แล้วยืนยันด้วยปุ่ม "เพิ่ม" (ท่าเดียวกับ FG ใน
              ฟอร์มคำร้อง) · ที่เลือกแล้วขึ้นเป็นป้ายถอดได้
              ⚠️ ค่าที่เก็บคือ `typeCode` ชุดเดียวกับ `dept_request_items.categoryCode`
              ⇒ เทียบกันได้ตรง ๆ ว่าที่ขอไว้กับที่ทำจริงตรงกันไหม
              ⚠️ ช่องข้อความเดิม (`productKind`) ไม่แสดงในฟอร์มแล้ว — เก็บไว้ให้จอสรุป/
              เอกสารอ่านใบเก่าเท่านั้น (ดูธง `legacy` ในทะเบียน) */}
          <div className="form-group col-span-2">
            <span className={styles.fieldLabel}>
              {label("productKinds")}
            </span>
            <div className={styles.pickAdd}>
              <ProductCategorySelect
                categories={categories}
                value={kindPick}
                disabled={disabled}
                onChange={setKindPick}
                // ป้ายอยู่ข้างบนแล้ว — ป้ายในตัวจะซ้อนสองชั้นและดันตัวเลือกให้เตี้ยกว่า
                // ปุ่ม "เพิ่ม" คนละแนว (ท่าเดียวกับช่องเลือก FG ในฟอร์มคำร้อง)
                label={null}
                ariaLabel="เลือกหมวดสินค้าที่จะเพิ่ม"
              />
              <Button
                size="sm" icon={<Plus size={14} aria-hidden="true" />}
                disabled={disabled || !kindPick}
                title={kindPick ? undefined : "เลือกหมวดสินค้าก่อน"}
                onClick={() => {
                  const list = Array.isArray(value.productKinds) ? value.productKinds : [];
                  if (!kindPick || list.includes(kindPick)) return;
                  set({ productKinds: [...list, kindPick] });
                  setKindPick("");
                }}
              >
                เพิ่ม
              </Button>
            </div>
            {!!(value.productKinds || []).length && (
              <ul className={styles.fileList}>
                {(value.productKinds || []).map((code) => {
                  const text = categoryLabel(code, categories);
                  return (
                    <li key={code} className={styles.fileRow}>
                      <span className={styles.fileName}>{text}</span>
                      <Button
                        iconOnly icon={<X size={13} />} disabled={disabled}
                        aria-label={`เอา ${text} ออก`}
                        onClick={() => set({
                          productKinds: (value.productKinds || []).filter((c) => c !== code),
                        })}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {/* ⭐ เลือก "หัวน้ำหอม" แล้วต้องบอกปลายทาง (มติผู้ใช้ 2026-08-09 · mig 0228)
              — หัวน้ำหอมเป็นวัตถุดิบ ไม่ใช่ปลายทาง · RD ตั้งความเข้มข้นกับเบสไม่ได้
              ถ้าไม่รู้ว่าเอาไปลงน้ำหอมหรือน้ำยาปรับผ้านุ่ม (โน้ตสีแดงข้อ 1.11) */}
          {pdrFieldVisible(FIELD.fragranceUse, value) && (
            <div className="form-group col-span-2">
              {/* ป้ายล้วน — คำขยายไปอยู่ที่ placeholder แล้ว ไม่ต้องซ้ำสองที่ */}
              <label htmlFor="pdr-fragrance-use">{FIELD.fragranceUse.label}</label>
              <Input
                id="pdr-fragrance-use" value={value.fragranceUse || ""} disabled={disabled}
                placeholder={FIELD.fragranceUse.hint}
                onChange={(e) => set({ fragranceUse: e.target.value })}
              />
            </div>
          )}
          {/* ⚠️ เต็มแถวเพื่อ **ดันสองวันที่ให้อยู่บรรทัดเดียวกัน** (มติผู้ใช้ 2026-08-09) —
              ช่องหมวดสินค้าด้านบนกินเต็มแถว ทำให้ parity พลิก ถ้าปล่อยตัวนี้ครึ่งแถว
              "วันที่ต้องการสินค้า" จะไปจับคู่กับมันแทน แล้ว "วันที่ต้องการจำหน่าย" เหลือเดี่ยว */}
          <Derived
            label={label("scentCount")}
            value={scentCount != null ? `${scentCount} กลิ่น` : ""}
            from={FIELD.scentCount.from}
            wide
          />
          <div className="form-group">
            <label htmlFor="pdr-want">{label("wantedAt")}</label>
            <DateInput id="pdr-want" value={value.wantedAt} disabled={disabled}
              onChange={(v) => set({ wantedAt: v })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-sell">{label("sellFrom")}</label>
            <DateInput id="pdr-sell" value={value.sellFrom} disabled={disabled}
              onChange={(v) => set({ sellFrom: v })} />
          </div>
        </div>
      </Section>

      )}

      {/* ⭐ ชั้นกลางของโครงสามชั้น — จำนวนก้อนมาจากใบสั่งขาย ไม่มีปุ่มเพิ่ม/ลบ */}
      {show("briefs") && (
      <Section
        flat={rail}
        title={`บรีฟกลิ่น${briefs.length ? ` — ${briefs.length} ก้อน` : ""}`}
        open={briefs.length > 0}
        note="กรอกทีละก้อนได้ ไม่ต้องครบถึงจะบันทึก"
      >
        {canMerge && (
          <div className={styles.topicAction}>
            {/* ⭐ แยก 1 → N ไม่ถามอะไร — ก้อนแรกอยู่ที่เดิม ที่เพิ่มมาเป็นก้อนว่าง
                ⚠️ รวบ N → 1 ถามก่อนเฉพาะตอนที่มีก้อนที่กรอกไว้จริงจะหาย */}
            <Button
              variant="quiet" size="sm" disabled={disabled}
              title={merged
                ? "ก้อนที่กรอกไว้อยู่ที่เดิม ที่เพิ่มมาเป็นก้อนว่าง"
                : "บรีฟก้อนที่ 2 เป็นต้นไปจะถูกลบ (ถามก่อน)"}
              onClick={() => switchMode(!merged)}
            >
              {merged ? `แยกบรีฟรายกลิ่น (${scentCount} ก้อน)` : "รวบเป็นบรีฟเดียว"}
            </Button>
          </div>
        )}
        {merged && (
          <small className={styles.hint}>
            บรีฟก้อนนี้ครอบทั้ง {scentCount} กลิ่น — RD ส่งได้หลาย direction จากก้อนเดียว
          </small>
        )}
        {!merged && canMerge && (
          <small className={styles.hint}>
            ลูกค้าบอกมาแนวเดียวสำหรับทุกกลิ่น? กด &ldquo;รวบเป็นบรีฟเดียว&rdquo; จะได้ไม่ต้องพิมพ์ซ้ำ
          </small>
        )}
        {!briefs.length ? (
          // ⚠️ บรรทัดจางลอย ๆ ในพื้นที่ว่าง ๆ อ่านเหมือนหน้าโหลดไม่ครบ — ส่วนนี้จะว่าง
          // ทุกครั้งจนกว่าจะเลือกใบสั่งขาย จึงต้องเป็นสถานะว่างที่บอกทางออก
          <EmptyState icon={FlaskConical}>
            ยังไม่มีบล็อกบรีฟ
            <small>เลือกใบสั่งขายในแท็บ &ldquo;งาน&rdquo; ก่อน — บล็อกจะขึ้นตามจำนวนกลิ่นที่ขายในใบนั้น</small>
          </EmptyState>
        ) : briefs.map((brief, i) => (
          <div key={i} className={styles.briefCard}>
            {/* ป้ายเลขมุมซ้ายแทนแถบสีซ้าย (มติผู้ใช้ 2026-08-09) — ทรงเดียวกับฝั่งอ่าน
                ⚠️ โหมดรวบบรีฟเดียวไม่มีเลข: ก้อนเดียวครอบทุกกลิ่น เลข "1" จะอ่านเหมือน
                ยังมีก้อนที่ 2 ตามมา */}
            <div className={styles.briefHead}>
              {!merged && <span className={styles.briefNo}>{i + 1}</span>}
              <span className={styles.briefTitle}>
                {merged ? "บรีฟรวมทุกกลิ่น" : (brief.label || `กลิ่นที่ ${i + 1}`)}
              </span>
            </div>
            {/* ⭐ **บังคับก่อนกดส่ง ไม่ใช่ก่อนบันทึกร่าง** (มติผู้ใช้ 2026-08-10) — ป้ายบอก
                ล่วงหน้าว่าช่องนี้ข้ามไม่ได้ตอนส่ง ส่วนด่านจริงอยู่ที่ API ตัวเดียวกับที่
                หน้าจอถาม (`scentBriefNameError`) · ร่างยังบันทึกได้ทั้งที่ยังว่าง
                ⚠️ ไม่ใส่ `required` บน input — จะบล็อกการบันทึกร่างซึ่งขัดกับมติเดิม */}
            <div className="form-group">
              <label htmlFor={`brief-label-${i}`}>ชื่อเรียก <b>*</b></label>
              <Input
                id={`brief-label-${i}`} value={brief.label || ""} disabled={disabled}
                placeholder="เช่น แนวสดชื่น"
                onChange={(e) => setBrief(i, { label: e.target.value })}
              />
              <small className={styles.hint}>
                ตั้งชื่อให้ต่างกันแต่ละก้อน — RD ใช้ชื่อนี้บอกว่ากลิ่นที่ส่งกลับมาตอบก้อนไหน
              </small>
            </div>
            <div className="form-group">
              <label htmlFor={`brief-body-${i}`}>บรีฟกลิ่น</label>
              <Textarea
                variant="data" id={`brief-body-${i}`} rows={3} maxLength={4000}
                value={brief.brief || ""} disabled={disabled}
                placeholder="โทนกลิ่นที่ต้องการ · ตัวอย่างอ้างอิง · ข้อจำกัด"
                onChange={(e) => setBrief(i, { brief: e.target.value })}
              />
            </div>
            <div className="form-grid cols-2">
              <div className="form-group">
                <label htmlFor={`brief-insp-${i}`}>แรงบันดาลใจ</label>
                <Input id={`brief-insp-${i}`} value={brief.inspiration || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { inspiration: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`brief-like-${i}`}>ช่วงกลิ่นที่ชื่นชอบ</label>
                <Input id={`brief-like-${i}`} value={brief.likedNotes || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { likedNotes: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`brief-dis-${i}`}>กลิ่นที่ End-user ไม่ชอบ</label>
                <Input id={`brief-dis-${i}`} value={brief.dislikedNotes || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { dislikedNotes: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`brief-res-${i}`}>ให้ทำวิจัยเรื่อง</label>
                <Input id={`brief-res-${i}`} value={brief.researchTopic || ""} disabled={disabled}
                  onChange={(e) => setBrief(i, { researchTopic: e.target.value })} />
              </div>
            </div>
            {/* เลือกได้หลายอย่างทั้งคู่ (มติผู้ใช้) — chip ที่กดสลับได้ ไม่ใช่ดรอปดาวน์
                ⭐ **Scentotype มีเส้นให้เขียนต่อหลังทุกตัวบนกระดาษ** (ข้อ 2.1.4) ⇒ ติ๊ก
                แล้วมีช่องข้อความโผล่ตามตัวที่ติ๊ก (mig 0222) · ไม่ติ๊ก = ไม่มีช่อง
                ⚠️ ข้อความของตัวที่ถูกติ๊กออกจะถูกทิ้งตอนบันทึก (ดู scentBriefs.js) */}
            <div className="form-group">
              <span className={styles.fieldLabel}>Scentotype</span>
              <div className={styles.mentionPicker}>
                {SCENTOTYPES.map((t) => {
                  const on = (brief.scentotypes || []).includes(t.value);
                  return (
                    <button
                      key={t.value} type="button" disabled={disabled} aria-pressed={on}
                      className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
                      onClick={() => toggle(i, "scentotypes", t.value)}
                    >
                      {on ? "✓ " : ""}{t.label}
                    </button>
                  );
                })}
              </div>
              {SCENTOTYPES.filter((t) => (brief.scentotypes || []).includes(t.value)).map((t) => (
                <div key={t.value} className={styles.scentotypeNote}>
                  <label htmlFor={`brief-${i}-st-${t.value}`}>{t.label}</label>
                  <Input
                    id={`brief-${i}-st-${t.value}`} disabled={disabled}
                    value={(brief.scentotypeNotes || {})[t.value] || ""}
                    placeholder="เขียนต่อได้ (เว้นว่างได้)"
                    onChange={(e) => setBrief(i, {
                      scentotypeNotes: { ...(brief.scentotypeNotes || {}), [t.value]: e.target.value },
                    })}
                  />
                </div>
              ))}
            </div>
            <div className="form-group">
              <span className={styles.fieldLabel}>Performance ของกลิ่น</span>
              <div className={styles.mentionPicker}>
                {SCENT_PERFORMANCE.map((t) => {
                  const on = (brief.performance || []).includes(t.value);
                  return (
                    <button
                      key={t.value} type="button" disabled={disabled} aria-pressed={on}
                      className={`chip ${on ? styles.tierChipOn : styles.tierChip}`}
                      onClick={() => toggle(i, "performance", t.value)}
                    >
                      {on ? "✓ " : ""}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </Section>
      )}

      {show("spec") && (

      <Section flat={rail} title={SECTION.spec.title} progress={pdrFormProgress(SECTION.spec, value)}>
        <div className="form-grid cols-2">
          <PdrTargetList
            targets={targets}
            onChange={onTargetsChange}
            productKinds={value.productKinds}
            categories={categories}
            disabled={disabled}
          />
          <div className="form-group">
            <label htmlFor="pdr-moq">{label("moq")}</label>
            <Input id="pdr-moq" value={value.moq} disabled={disabled}
              onChange={(e) => set({ moq: e.target.value })} />
          </div>
          {/* ⭐ ขนาดบรรจุอยู่ติด MOQ (มติผู้ใช้ 2026-08-09) — สองข้อนี้ตอบคำถาม
              เดียวกันของฝ่ายผลิต ("สั่งขั้นต่ำเท่าไร บรรจุขนาดไหน") จึงต้องอ่านคู่กัน */}
          <div className="form-group">
            <label htmlFor="pdr-pack">{label("packSize")}</label>
            <Input id="pdr-pack" value={value.packSize} disabled={disabled}
              onChange={(e) => set({ packSize: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-tex">{label("texture")}</label>
            <Select id="pdr-tex" value={value.texture} disabled={disabled}
              onChange={(e) => set({ texture: e.target.value })} options={withBlank(PDR_TEXTURES)} />
          </div>
          <div className="form-group">
            <label htmlFor="pdr-color">{label("color")}</label>
            <Input id="pdr-color" value={value.color} disabled={disabled}
              onChange={(e) => set({ color: e.target.value })} />
          </div>
          <ChipPicker
            label={label("packagingForms")} options={PDR_PACKAGING_FORMS} disabled={disabled}
            value={value.packagingForms} onChange={(v) => set({ packagingForms: v })}
          />
          {/* เงื่อนไขการโผล่มาจากทะเบียน (`showForMulti`) เหมือนชุดเอกสาร */}
          {pdrFieldVisible(FIELD.packagingFormsOther, value) && (
            <div className="form-group col-span-2">
              <label htmlFor="pdr-pack-other">{label("packagingFormsOther")}</label>
              <Input id="pdr-pack-other" value={value.packagingFormsOther || ""} disabled={disabled}
                placeholder={FIELD.packagingFormsOther.placeholder}
                onChange={(e) => set({ packagingFormsOther: e.target.value })} />
            </div>
          )}
          <div className="form-group">
            <span className={styles.fieldLabel}>{label("packagingArtwork")}</span>
            {/* ⭐ **สวิตช์ ไม่ใช่ดรอปดาวน์** (มติผู้ใช้ 2026-08-09) — มันคือธง "มี/ไม่มี"
                ซึ่งกติกาคอนโทรล v2 บอกให้ใช้สวิตช์ · และเปิดแล้ว **บังคับแนบไฟล์**
                ⚠️ ค่าที่เก็บยังเป็น 'has'/'none' เหมือนเดิม — เอกสารกับจอสรุปอ่าน
                ค่าเดิมอยู่ ห้ามเปลี่ยนเป็น boolean เพราะแถวเก่าจะอ่านไม่ออก */}
            <div className="flex flex-wrap gap-[14px] min-h-[36px] items-center">
              <button
                type="button" className="ui-switch" disabled={disabled}
                data-on={value.packagingArtwork === "has" ? "1" : undefined}
                aria-pressed={value.packagingArtwork === "has"}
                onClick={() => set({ packagingArtwork: value.packagingArtwork === "has" ? "none" : "has" })}
              >
                <i aria-hidden="true" /><ImageIcon size={13} aria-hidden="true" /> ภาพประกอบ
              </button>
            </div>
            {/* ⚠️ มติผู้ใช้: บอกว่ามี = ต้องแนบจริง · บังคับตอนกดส่ง ไม่ใช่ตอนเปิดใบ
                (หน้าเปิดคำร้องยังแนบไฟล์ไม่ได้ ต้องมี id ของใบก่อน — ด่านจริงอยู่ที่
                `pdrArtworkError` ซึ่งผู้เรียกส่ง stage: 'submit' เข้าไป) */}
            {value.packagingArtwork === "has" && (
              <small className={styles.hint}>ต้องแนบไฟล์ภาพก่อนกดส่ง</small>
            )}
          </div>
          {/* 2.9 Value Proposition — ของทั้งใบ ไม่ใช่รายกลิ่น (มติผู้ใช้)
              ⚠️ **ติ๊กแล้วเขียนต่อ ไม่ใช่ช่องข้อความเปล่า** — กระดาษ FM-RD-01 มีช่องติ๊ก
              หน้าทั้งสามคำ เหมือนข้อ 1.10 · ทำเป็นช่องเปล่าแล้วเสียข้อมูลว่า "ข้อไหน
              ลูกค้าสนใจ" ตอนที่ยังไม่ได้เขียนรายละเอียด */}
          <div className="form-group col-span-2">
            <span className={styles.fieldLabel}>{FIELD.vpAttribute.group} — ติ๊กแล้วเขียนต่อ</span>
            {["vpAttribute", "vpBenefit", "vpValue"].map((key) => (
              <TickAndWrite
                key={key} label={label(key)} disabled={disabled}
                value={value[key]} onChange={(v) => set({ [key]: v })}
              />
            ))}
          </div>
          <div className="form-group col-span-2">
            <label htmlFor="pdr-sample">{label("brandSample")}</label>
            {/* ⭐ ข้อความยาว (มติผู้ใช้ 2026-08-09) — ลูกค้ามักยกตัวอย่างหลายแบรนด์
                พร้อมเหตุผล ช่องบรรทัดเดียวทำให้พิมพ์แล้วอ่านย้อนไม่ได้ */}
            <Textarea
              id="pdr-sample" rows={3} maxLength={2000}
              value={value.brandSample} disabled={disabled}
              placeholder="เช่น Jo Malone Wood Sage & Sea Salt — ชอบความสดโปร่ง · Diptyque Baies — ชอบกลิ่นผลไม้"
              onChange={(e) => set({ brandSample: e.target.value })}
            />
          </div>
        </div>
      </Section>

      )}

      {show("regulatory") && (

      <Section flat={rail} title={SECTION.regulatory.title} note={SECTION.regulatory.note} progress={pdrFormProgress(SECTION.regulatory, value)}>
        <ChipPicker
          label={label("documents")} options={PDR_DOCUMENTS} disabled={disabled}
          value={value.documents} onChange={(v) => set({ documents: v })}
          hint="COA · MSDS · IFRA · อย. มีให้เป็นพื้นฐานอยู่แล้ว — ติ๊กเพื่อยืนยันว่าใบนี้ต้องการ"
        />
        {/* ⭐ ติ๊ก "อื่น ๆ" แล้วมีช่องพิมพ์ต่อ (มติผู้ใช้ 2026-08-09) — เงื่อนไขการโผล่
            มาจากทะเบียน (`showForDocument`) ไม่ใช่ if เขียนตายตัวที่นี่ */}
        {pdrFieldVisible(FIELD.documentsOther, value) && (
          <div className="form-group col-span-2">
            <label htmlFor="pdr-doc-other">{label("documentsOther")}</label>
            <Input id="pdr-doc-other" value={value.documentsOther || ""} disabled={disabled}
              placeholder={FIELD.documentsOther.placeholder}
              onChange={(e) => set({ documentsOther: e.target.value })} />
          </div>
        )}
        {pdrFieldVisible(FIELD.exportDocNote, value) && (
          <div className="form-group col-span-2">
            <label htmlFor="pdr-export">{label("exportDocNote")}</label>
            <Input id="pdr-export" value={value.exportDocNote || ""} disabled={disabled}
              placeholder={FIELD.exportDocNote.placeholder}
              onChange={(e) => set({ exportDocNote: e.target.value })} />
          </div>
        )}
        <div className="form-group col-span-2">
          <label htmlFor="pdr-special">{label("specialRequirements")}</label>
          <Textarea
            variant="data" id="pdr-special" rows={2} maxLength={2000}
            value={value.specialRequirements} disabled={disabled}
            placeholder={FIELD.specialRequirements.placeholder}
            onChange={(e) => set({ specialRequirements: e.target.value })}
          />
        </div>
      </Section>

      )}

      {/* ── ผู้เซ็นบนเอกสาร (ม-45 · mig 0221) ─────────────────────────────
          ⭐ **ชื่อบนกระดาษ ไม่ใช่ role ในระบบ** — ระบบยังไม่มีตำแหน่ง Perfumer /
          PD Chemist / Project Coordinator · กรอกชื่อไว้เพื่อให้พิมพ์ลงตารางลายเซ็น
          แทนที่จะเป็นเส้นว่างทุกใบ
          ⚠️ ช่องวนจากทะเบียนโดยตั้งใจ — ป้ายตำแหน่งต้องตรงกับที่กระดาษพิมพ์เป๊ะ
          ไล่เขียนมือเมื่อไรก็เพี้ยนจากกระดาษเมื่อนั้น */}
      {show("signers") && (
      <Section flat={rail} title={SECTION.signers.title} note={SECTION.signers.note} progress={pdrFormProgress(SECTION.signers, value)}>
        {SECTION.signers.fields.map((f) => (
          <div className="form-group" key={f.key}>
            <label htmlFor={`pdr-${f.key}`}>{f.label}</label>
            <Input
              id={`pdr-${f.key}`} value={value[f.key] || ""} disabled={disabled}
              placeholder="ชื่อผู้เซ็น (เว้นว่างได้)"
              onChange={(e) => set({ [f.key]: e.target.value })}
            />
          </div>
        ))}
      </Section>
      )}
    </div>
  );
}

