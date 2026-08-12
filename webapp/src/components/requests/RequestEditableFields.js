"use client";

import { Flame } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { requestHasPdr, requestKindMeta } from "@/lib/master/requestTypes";
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
 *   | ป้ายวันที่              | "อยากได้คำตอบภายใน (บังคับ)"     | "… *"                       |
 *   | ป้าย "ความเร่งด่วน"     | `styles.fieldLabel` (ครบ 3 ค่า)  | `.form-field-label` (ว่าง)  |
 *
 * จุดที่ 2 หนักที่สุด — กติกา "หัวข้อที่ใช้ PDR ไม่มีช่อง body" ฝังอยู่สองที่
 * (`RequestForm` และ `formTabs` ที่ไม่นับ body ลงเกจ) ⇒ ข้อความที่พิมพ์ในโมดัลแก้
 * ของใบ scent_dev เป็นข้อมูลที่ **ระบบทั้งระบบสมมติว่าไม่มี**
 *
 * ⚠️ ชุดช่างที่นี่ต้องเท่ากับ `REQUEST_EDITABLE_FIELDS` (`lib/requests/requestEdit.js`)
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

/** วันที่อยากได้คำตอบ + ธงด่วน (+ เหตุผลที่งอกมาเมื่อติดธง) */
export function RequestDueUrgentFields({ value = {}, onChange, disabled = false, idPrefix = "req" }) {
  const set = (patch) => onChange?.({ ...value, ...patch });

  return (
    <>
      <div className="form-group">
        {/* ⭐ บังคับทุกหัวข้อ (มติผู้ใช้ 2026-08-08) — ด่านจริงอยู่ `requestShapeError`
            ตัวเดียวกับ server · ป้ายแค่บอกล่วงหน้าว่าช่องนี้ข้ามไม่ได้ */}
        <label htmlFor={`${idPrefix}-due`}>อยากได้คำตอบภายใน (บังคับ)</label>
        <DateInput
          id={`${idPrefix}-due`} value={value.requestedDueDate || ""} disabled={disabled}
          onChange={(v) => set({ requestedDueDate: v })}
        />
        <small className={styles.hint}>
          เป็นความคาดหวัง — ฝ่ายปลายทางจะรับปากวันจริงตอนกดรับเรื่อง
        </small>
      </div>
      <div className="form-group">
        <span className={styles.fieldLabel}>ความเร่งด่วน</span>
        {/* ⭐ **สวิตช์ ไม่ใช่ checkbox** (มติผู้ใช้ 2026-08-09 · กติกาคอนโทรล v2
            "ธง/โหมดพิเศษ = สวิตช์") — ทรงเดียวกับธง ด่วน/สำคัญ ของโมดัลงาน
            ⚠️ ติ๊กแล้วมีช่องเหตุผลงอกข้างล่าง (บังคับ) — สวิตช์ทำให้ "ติดหรือไม่ติด"
            อ่านออกจากระยะไกลกว่ากล่องติ๊กเล็ก ๆ ซึ่งสำคัญกับธงที่มีผลต่อคิวของฝ่ายอื่น */}
        <div className="flex flex-wrap gap-[14px] min-h-[36px] items-center">
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
