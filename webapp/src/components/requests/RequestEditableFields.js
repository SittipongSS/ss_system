"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Textarea from "@/components/ui/Textarea";
import DocumentLines from "@/components/requests/DocumentLines";
import ProductDevLines from "@/components/requests/ProductDevLines";
import { BILLING_DOC_VOCABULARY } from "@/lib/requests/kinds/fn/billingDocTypes";
import { lineShapeForKind, requestHasPdr, requestKindMeta } from "@/lib/master/requestTypes";
import { billAmountFor, billFieldInit } from "@/lib/requests/billingQuotations";
import { fmtNumber, fmtPercent } from "@/lib/format";
import styles from "./requestForm.module.css";

/* ── ช่องที่ "แก้ได้" ของคำร้อง — เขียนที่เดียว สองทางเรียกใช้ ──────────────
 *
 * ⭐ กฎของรีโป (`webapp/AGENTS.md`): **ปุ่ม "แก้ไข" ต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง**
 * ห้ามเขียนฟอร์มแก้แยกอีกชุด
 *
 * 🐞 ของจริงที่เกิดขึ้น (ตรวจ 2026-08-09): โมดัล "แก้ข้อมูลคำร้อง" บนหน้ารายละเอียด
 * วาง `Input`/`Textarea`/`DateInput`/`.ui-switch` เองครบทุกช่อง ไม่เรียก `RequestForm`
 * เลย · เพี้ยนจากฝั่งสร้าง **6 จุดตั้งแต่คอมมิตแรก**:
 *
 *   | จุด                     | ฝั่งสร้าง                        | ฝั่งแก้ (เดิม)              |
 *   |-------------------------|----------------------------------|-----------------------------|
 *   | ป้ายช่องรายละเอียด      | `copy.bodyLabel` ("บรีฟกลิ่น")   | hardcode "รายละเอียด"       |
 *   | หัวข้อที่มี PDR         | **ไม่มีช่อง body เลย**           | โชว์เสมอ                    |
 *   | สวิตช์ด่วน              | มีไอคอน Flame                    | ไม่มี                       |
 *   | hint "วาง URL…"         | มี                               | หายไป                       |
 *   | ป้ายวันที่              | "วันที่ต้องการรับงาน (บังคับ)"    | "… *"                       |
 *   | ป้าย "ความเร่งด่วน"     | `styles.fieldLabel` (ครบ 3 ค่า)  | `.form-field-label` (ว่าง)  |
 *
 * จุดที่ 2 หนักที่สุด — กติกา "หัวข้อที่ใช้ PDR ไม่มีช่อง body" ฝังอยู่สองที่
 * (`RequestForm` และ `formTabs` ที่ไม่นับ body ลงเกจ) ⇒ ข้อความที่พิมพ์ในโมดัลแก้
 * ของใบ scent_dev เป็นข้อมูลที่ **ระบบทั้งระบบสมมติว่าไม่มี**
 *
 * ⚠️ ชุดเจ้าหน้าที่ที่นี่ต้องเท่ากับ `REQUEST_EDITABLE_FIELDS` (`lib/requests/requestEdit.js`)
 * ซึ่งเป็นด่านของ API ด้วย — เพิ่มช่องที่นี่โดยไม่เพิ่มในลิสต์นั้น = พิมพ์แล้วหายเงียบ
 *
 * ⚠️ แยกเป็นสองก้อนเพราะฝั่งสร้างวางคนละแท็บ (ชื่อเรื่อง/รายละเอียด อยู่แท็บ
 * "รายละเอียด" · วันที่/ด่วน อยู่แท็บ "กำหนดและไฟล์") — ฝั่งแก้เรียงต่อกันได้เลย
 */

/** ชื่อเรื่อง + รายละเอียด — ช่องรายละเอียดหายไปเองเมื่อหัวข้อนั้นใช้ PDR */
export function RequestTitleBodyFields({ value = {}, onChange, disabled = false, idPrefix = "req" }) {
  const kind = value.kind || "";
  const copy = requestKindMeta(kind)?.form || {};
  const hasPdr = requestHasPdr(kind);
  const set = (patch) => onChange?.({ ...value, ...patch });

  return (
    <>
      <div className="form-group col-span-2">
        <label htmlFor={`${idPrefix}-title`}>{copy.titleLabel || "ชื่อเรื่อง"}</label>
        <Input
          id={`${idPrefix}-title`} maxLength={200}
          value={value.title || ""} disabled={disabled}
          placeholder={copy.titlePlaceholder}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      {!hasPdr && (
        <div className="form-group col-span-2">
          <label htmlFor={`${idPrefix}-body`}>{copy.bodyLabel}</label>
          <Textarea
            id={`${idPrefix}-body`} rows={4} maxLength={4000}
            value={value.body || ""} disabled={disabled}
            placeholder={copy.bodyPlaceholder}
            onChange={(e) => set({ body: e.target.value })}
          />
          {/* วางลิงก์หรือรหัสเอกสารในรายละเอียดได้เลย — เธรดเรนเดอร์เป็นลิงก์ให้เอง
              ผ่าน RichText (/go/<รหัส>) ไม่ต้องมีช่อง "ลิงก์" แยก */}
          <small className={styles.hint}>
            วาง URL หรือรหัสเอกสาร (เช่น QT-26080001) ลงไปได้ — ระบบทำเป็นลิงก์ให้เอง
          </small>
        </div>
      )}
    </>
  );
}

/** วันที่ต้องการรับงาน + ธงด่วน (+ เหตุผลที่งอกมาเมื่อติดธง) */
export function RequestDueUrgentFields({
  value = {}, onChange, disabled = false, idPrefix = "req",
  /* ป้ายวันที่มาจาก **ทะเบียนหัวข้อ** (`copy.dueLabel`) — "วันที่ต้องการรับงาน" ยังเป็น
     ค่ากลางของทุกหัวข้อ แต่งานที่ฝ่ายต้องเดินทางไปทำเองไม่ได้ "รับงาน" ที่ไหน
     (ประเมินพื้นที่ = "วันที่ต้องการให้เข้าพื้นที่") */
  dueLabel = "วันที่ต้องการรับงาน",
  /* ⭐ **เวลามีเฉพาะหัวข้อที่ต้องนัดเข้าไปหาลูกค้า** (mig 0314) — วันเดียวกันแต่คนละ
     ช่วงคือคนละงานสำหรับเจ้าหน้าที่ที่ต้องวิ่งข้ามเมือง · หัวข้ออื่นไม่มีความหมาย จึงไม่ใช่
     ช่องกลางที่ทุกใบต้องมองข้าม */
  showTime = false,
  dueHint = 'เป็นความคาดหวัง — ฝ่ายปลายทางจะรับปากวันจริงตอนกด "แจ้งกำหนดส่ง"',
}) {
  const set = (patch) => onChange?.({ ...value, ...patch });

  return (
    <>
      <div className="form-group">
        {/* ⭐ บังคับทุกหัวข้อ (มติผู้ใช้ 2026-08-08) — ด่านจริงอยู่ `requestShapeError`
            ตัวเดียวกับ server · ป้ายแค่บอกล่วงหน้าว่าช่องนี้ข้ามไม่ได้ */}
        {/* ⚠️ **คำที่ล็อกไว้: "วันที่ต้องการรับงาน"** (มติผู้ใช้ 2026-08-19) — ของเดิม
            เขียนว่า "อยากได้คำตอบภายใน" ซึ่งจริงเฉพาะหัวข้อสอบถาม · หัวข้อที่ฝ่ายต้อง
            ส่งของ (กลิ่น · สูตร · เอกสาร) ไม่ได้รอคำตอบ แต่รองาน */}
        <label htmlFor={`${idPrefix}-due`}>{dueLabel} (บังคับ)</label>
        <DateInput
          id={`${idPrefix}-due`} value={value.requestedDueDate || ""} disabled={disabled}
          onChange={(v) => set({ requestedDueDate: v })}
        />
        {/* ⚠️ เวลา **ไม่บังคับ** — "วันไหนก็ได้ทั้งวัน" เป็นคำตอบที่ถูกต้องของงานจริง
            บังคับเมื่อไรคนก็กรอกเวลามั่ว ๆ ให้ผ่านด่าน แล้วเจ้าหน้าที่วางแผนจากตัวเลขที่ไม่จริง */}
        {showTime && (
          <div className={styles.dueTime}>
            <span className={styles.fieldLabel}>ช่วงเวลาที่ต้องการ (ไม่บังคับ)</span>
            <TimeInput
              value={value.requestedDueTime || ""} disabled={disabled}
              ariaLabel="เวลาที่ต้องการให้เข้าพื้นที่"
              onChange={(v) => set({ requestedDueTime: v })}
            />
          </div>
        )}
        <small className={styles.hint}>{dueHint}</small>
      </div>
      <div className="form-group">
        <span className={styles.fieldLabel}>ความเร่งด่วน</span>
        {/* ⭐ **สวิตช์ ไม่ใช่ checkbox** (มติผู้ใช้ 2026-08-09 · กติกาคอนโทรล v2
            "ธง/โหมดพิเศษ = สวิตช์") — ทรงเดียวกับธง ด่วน/สำคัญ ของโมดัลงาน
            ⚠️ ติ๊กแล้วมีช่องเหตุผลงอกข้างล่าง (บังคับ) — สวิตช์ทำให้ "ติดหรือไม่ติด"
            อ่านออกจากระยะไกลกว่ากล่องติ๊กเล็ก ๆ ซึ่งสำคัญกับธงที่มีผลต่อคิวของฝ่ายอื่น */}
        <div className="flex flex-wrap gap-[14px] min-h-[var(--ctl-h)] items-center">
          <button
            type="button" className="ui-switch" disabled={disabled}
            data-on={value.urgent ? "1" : undefined} aria-pressed={!!value.urgent}
            onClick={() => set({ urgent: !value.urgent })}
          >
            <i aria-hidden="true" /><Flame size={13} aria-hidden="true" /> ด่วน
          </button>
        </div>
      </div>
      {/* ⭐ **ด่วนแล้วต้องบอกว่าทำไม** (mig 0222) — ฟอร์มกระดาษ FM-RD-01 เขียนบนหัวว่า
          "หากเป็นงานด่วน กรุณาระบุคำว่าด่วน และวันที่ต้องการ พร้อมแจ้งเหตุผล"
          ⚠️ ติ๊กด่วนได้ฟรีเมื่อไร ทุกใบก็ด่วนภายในสองเดือน แล้วธงนั้นเลิกมีความหมาย */}
      {value.urgent && (
        <div className="form-group col-span-2">
          <label htmlFor={`${idPrefix}-urgent-why`}>เหตุผลที่เป็นงานด่วน *</label>
          <Textarea
            id={`${idPrefix}-urgent-why`} rows={2} maxLength={500}
            value={value.urgentReason || ""} disabled={disabled}
            placeholder="เช่น ลูกค้าต้องใช้ในงานแสดงสินค้าวันที่ 20 · ล็อตผลิตปิดสิ้นเดือน"
            onChange={(e) => set({ urgentReason: e.target.value })}
          />
        </div>
      )}
    </>
  );
}

/* ── บรรทัดของใบ (มติผู้ใช้ 2026-08-24) ────────────────────────────────────
 *
 * ⭐ **หัวข้อที่เนื้องานอยู่ในบรรทัด ต้องแก้บรรทัดได้ด้วยฟอร์มเดียวกับตอนสร้าง**
 * 🐞 ของจริงที่ผู้ใช้แจ้ง: ใบ "ขอเอกสาร" กด "แก้ไข" แล้วได้แต่ชื่อเรื่อง/รายละเอียด/
 * วันที่/ด่วน — **ชนิดเอกสารกับรายละเอียดรายบรรทัดแก้ไม่ได้เลย** ทางเดียวคือลบทั้งใบ
 * เปิดใหม่ (ทำได้เฉพาะร่าง) · อาการเดียวกันกับ "ขอใบวางบิล" และ "พัฒนาสูตร"
 *
 * ⚠️ เลือกตารางจาก **รูปร่างบรรทัด** (`lineShapeForKind`) ไม่ใช่ `kind === "..."`
 * — กติกาเดิมของฟอร์ม (มี ratchet ห้ามไว้) · หัวข้อใหม่ที่ใช้รูปร่างเดิมได้ตารางฟรี
 * ⚠️ `scent_dev` ไม่มีตารางตรงนี้โดยตั้งใจ — แถวของมันเกิดตอน RD กดส่งงาน
 * ไม่ได้กรอกตอนเปิดใบ (ดู `rd/lineShapes.js`)
 */
export function RequestLineFields({
  kind, value = [], onChange, disabled = false,
  categories = [], scents = [], customerId = null,
  /* ⭐ **บรรทัดหยุดแก้ก่อนหัวใบหนึ่งขั้น** (มติผู้ใช้ 2026-09-01) — ใบที่รับเรื่องแล้ว
     ยังแก้หัวใบได้ แต่แถวเดินก้าวไปแล้วทั้งใบ ⇒ ตารางต้อง **เทาพร้อมบอกเหตุ**
     ไม่ใช่ปล่อยให้พิมพ์แล้วโดน 409 ตอนกดบันทึก (กฎเดียวกับ `pdrDisabled` ของฟอร์ม)
     ⚠️ ค่าตั้งต้น `null` = ตามทั้งฟอร์ม ⇒ ฝั่งสร้างไม่ต้องรู้จักพร็อพนี้ */
  linesDisabled = null,
  linesNote = null,
  /* ⭐ เนื้อเพิ่มในแผงรายละเอียดของบรรทัด (มติผู้ใช้ 2026-08-24) — ตอนนี้มีผู้ใช้
     รายเดียวคือ "ยอดที่ขอวางบิล" ของ FN ที่ย้ายมาจากแท็บ "งาน"
     ⚠️ รับเป็น **node ทึบ** ไม่ใช่ธง `showBillAmount` — ตารางบรรทัดไม่ควรรู้ว่ามัน
     คือยอดหรืออะไร ไม่งั้นทุกครั้งที่มีของใหม่มาแปะ ต้องมาแก้ตารางกลางอีกรอบ */
  detailExtra = null,
}) {
  const lineShape = lineShapeForKind(kind);
  const copy = requestKindMeta(kind)?.form || {};
  if (!lineShape || lineShape === "scent_dev") return null;

  const lock = linesDisabled == null ? disabled : linesDisabled;

  return (
    <div className="form-group col-span-2">
      <span className={styles.fieldLabel}>{copy.itemsLabel}</span>
      {lock && linesNote ? <small className={styles.hint}>{linesNote}</small> : null}
      {lineShape === "product_dev" ? (
        <ProductDevLines
          rows={value}
          onChange={onChange}
          categories={categories}
          scents={scents}
          customerId={customerId}
          disabled={lock}
        />
      ) : (
        /* ⚠️ ตารางตัวเดียวกัน **คนละชุดคำศัพท์** — เอาสองชุดมารวมลิสต์เดียวเมื่อไร
           คำร้องขอเอกสารของ RD จะมีตัวเลือก "ใบกำกับภาษี" ซึ่ง RD ออกให้ไม่ได้ */
        <DocumentLines
          rows={value}
          onChange={onChange}
          vocabulary={lineShape === "billing_doc" ? BILLING_DOC_VOCABULARY : undefined}
          disabled={lock}
          detailExtra={detailExtra}
        />
      )}
    </div>
  );
}

/* ── ยอดที่ขอวางบิล (B-2 · ม-ค) ────────────────────────────────────────────
 *
 * ⭐ ยกออกมาเป็นของกลาง 2026-08-24 พร้อมเหตุผลเดียวกับบรรทัด — เป็นช่อง **บังคับ**
 * ของแท็บ "งาน" แต่แก้ไม่ได้หลังบันทึก ⇒ พิมพ์ยอดผิดหลักเดียวต้องเปิดใบใหม่
 *
 * ⚠️ `baseAmount` มาจากผู้เรียก ไม่ใช่โหลดเอง — ฝั่งสร้างได้จากใบที่เพิ่งเลือกในฟอร์ม
 * ฝั่งแก้ได้จาก `billBaseAmount` ที่ประทับบนใบ · ทั้งสองทาง server คิดใหม่จากยอดจริง
 * ของใบเสมอ (`resolveBillAmount`) ค่าที่นี่มีไว้ให้คนกดเห็นว่า "50% ของอะไร"
 */
export function RequestBillAmountFields({
  value = {}, onChange, baseAmount = 0, disabled = false, ready = true,
}) {
  /* ⚠️ โหมดเป็น **วิธีกรอก** ไม่ใช่ข้อมูล — ค่าที่เก็บคือ `billPercent`/`billAmount`
     ทั้งคู่เสมอ ไม่ว่าจะพิมพ์ช่องไหน
     ⭐ มาจากปุ่ม "ขอใบวางบิลงวดนี้" (B-5) = รู้ **จำนวนเงินของงวด** มาแล้ว ไม่ใช่ %
     ⇒ เปิดมาที่โหมดจำนวนเงินพร้อมตัวเลขในช่อง · ตั้งครั้งเดียวตอน mount
     🐞 **โหมดกับตัวเลขต้องมาจากการตัดสินครั้งเดียวกัน** — เดิมแยกกันสองบรรทัด
     (โหมดดู `billPercent` · ตัวเลขดู `billAmount`) ⇒ ใบที่เก็บทั้งคู่ (ทุกใบที่บันทึก
     แล้ว) เปิดโหมดแก้ได้ยอดบาทไปนั่งในช่อง % · ตอนนี้อยู่ที่ `billFieldInit` ที่เดียว
     พร้อมเทสต์ */
  const [init] = useState(() => billFieldInit(value));
  const [mode, setMode] = useState(init.mode);
  /* 🐞 **ตัวเลขที่พิมพ์ต้องค้างอยู่แม้ค่าไม่ผ่านด่าน** — รอบแรกช่องนี้อ่านค่าจาก
     `value.billAmount` ตรง ๆ ⇒ พิมพ์ยอดที่เกินยอดใบแล้วตัวเลขหายไปทั้งช่องพร้อมกับ
     ข้อความอธิบาย (เพราะ error คิดจากค่าที่ถูกล้างเป็น null ไปแล้ว) ⇒ ผู้ใช้เห็นแค่
     ช่องว่างกับปุ่มจาง · เก็บ "สิ่งที่พิมพ์" แยกจาก "ค่าที่ผ่านแล้ว" */
  const [input, setInput] = useState(init.input);
  const base = Number(baseAmount) || 0;

  // คิดจาก **สิ่งที่พิมพ์** ไม่ใช่ค่าที่ผ่านด่านแล้ว — ไม่งั้นค่าที่ไม่ผ่านจะไม่มี
  // ทั้งตัวเลขและเหตุผลเหลืออยู่บนจอ
  const bill = billAmountFor({
    mode,
    percent: mode === "percent" ? input : null,
    amount: mode === "amount" ? input : null,
    baseAmount: base,
  });
  /* ⚠️ ทศนิยม 3 ตำแหน่ง ไม่ใช่ 2 — ยอดจริงที่ทีมส่งกันคือ 90,508.125
     ปัดเหลือสองตำแหน่งบนจอแปลว่าเลขที่ผู้ใช้เห็นไม่ตรงกับที่คุยกับลูกค้า
     ⚠️ ใช้กับ **ยอดบาท** เท่านั้น — เปอร์เซ็นต์เดินคนละตัวจัดรูปแบบ (`fmtPercent`
     = 2 ตำแหน่งตามกติกากลาง) เอา fmtPercent มาครอบ money เมื่อไร ยอดบาทพังไปด้วย */
  const money = (n) => fmtNumber(n, { maximumFractionDigits: 3 });

  /* เขียนค่าคู่เสมอ — ช่องที่ผู้ใช้ไม่ได้พิมพ์ก็ต้องมีค่า ไม่งั้น payload ส่งไป
     ครึ่งเดียวแล้ว server คิดกลับได้ไม่ตรงกับที่จอโชว์ */
  const setBill = (raw) => {
    setInput(raw);
    const out = billAmountFor({
      mode,
      percent: mode === "percent" ? raw : null,
      amount: mode === "amount" ? raw : null,
      baseAmount: base,
    });
    onChange?.({ ...value, billPercent: out.percent ?? null, billAmount: out.amount ?? null });
  };
  /* สลับโหมด = เริ่มพิมพ์ใหม่จากค่าที่ผ่านแล้วของโหมดนั้น — ไม่ใช่ล้างทิ้ง
     (พิมพ์ 50% แล้วอยากดูเป็นบาท ต้องเห็นยอดที่คิดได้ ไม่ใช่ช่องว่าง) */
  const switchMode = (next) => {
    setMode(next);
    const carried = next === "percent" ? value.billPercent : value.billAmount;
    setInput(carried == null ? "" : String(carried));
  };

  return (
    <div className="form-group col-span-2">
      <span className={styles.fieldLabel}>ยอดที่ขอวางบิล</span>
      <OptionTiles
        value={mode} disabled={disabled || !ready}
        onChange={switchMode}
        ariaLabel="วิธีระบุยอดที่ขอ"
        options={[
          { value: "percent", label: "คิดเป็น %", description: "เช่น 50% ก่อนผลิต" },
          { value: "amount", label: "ระบุจำนวนเงิน", description: "พิมพ์ยอดตรง ๆ" },
        ]}
      />
      {/* 🐞 **เคยเป็น `<input className="form-control">` ซึ่งเป็นคลาสที่ไม่มีอยู่จริง
          ในระบบนี้** ⇒ ช่องไม่มีกรอบ ไม่มีความสูงมาตรฐาน หลุดธีมทั้งช่อง ·
          ช่องกรอกของระบบมี primitive เดียวคือ `Input` (`.premium-input`) */}
      <div className={styles.amountField}>
        <Input
          type="number" step="any" min="0" mono
          disabled={disabled || !ready}
          value={input}
          onChange={(e) => setBill(e.target.value)}
          placeholder={mode === "percent" ? "50" : "90508.125"}
          aria-label={mode === "percent" ? "สัดส่วนที่ขอ (%)" : "ยอดที่ขอ (บาท)"}
        />
        <span className={styles.amountUnit} aria-hidden="true">
          {mode === "percent" ? "%" : "บาท"}
        </span>
      </div>
      {/* ⭐ โชว์ทั้งฐานและผลลัพธ์ — คนกดต้องเห็นว่า 50% ของอะไร ก่อนส่งให้บัญชี */}
      {ready && (
        <small className={styles.hint}>
          ยอดเต็มตามใบ {money(base)} บาท
          {bill.amount != null && ` · ขอ ${fmtPercent(bill.percent)} = ${money(bill.amount)} บาท`}
        </small>
      )}
      {/* 🐞 **เงียบจนกว่าจะเลือกใบ** — ฐานเป็น 0 ตอนยังไม่เลือก ⇒ ตัวคำนวณคืน
          "ไม่มียอดให้วางบิล" ตั้งแต่เปิดฟอร์ม ซึ่งอ่านเหมือนใบที่ยังไม่ได้เลือกมีปัญหา */}
      {ready && bill.error && <small className={styles.hint}>{bill.error}</small>}
    </div>
  );
}
