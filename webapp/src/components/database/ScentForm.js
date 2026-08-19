"use client";
// ── ฟอร์มกลิ่นในทะเบียน (mig 0171) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มกลิ่น" และ "แก้ข้อมูลกลิ่น" (กฎ AGENTS.md) —
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → กรอกได้ครบทุกช่อง (รหัส · วันที่ · สถานะ)
//   mode="edit"   → ลูกค้าล็อก (ตัวตนของกลิ่นผูกกับลูกค้า — มติ 9) และไม่มีโซน
//                   ของเดิม/สถานะ เพราะวันที่ส่งกับสถานะมี action ของตัวเอง
//
// ⭐ **ช่องเปิดตามคนกรอก ไม่ใช่ตามฝ่าย** (มติผู้ใช้ 2026-08-19) — ฝ่ายขายถือข้อมูล
// กลิ่นเก่าจากระบบเดิม (รหัสจริง วันผลิต วันส่ง และรู้ว่าตัวไหนลูกค้าอนุมัติแล้ว)
// เดิมกรอกได้แค่ชื่อ+ลูกค้า แล้วต้องส่งที่เหลือให้ RD นอกระบบ ⇒ ย้ายข้อมูลไม่ไหว
//   canSetCode   = เห็นช่องรหัส (`canSetScentCode` — เจ้าของร่าง หรือ RD)
//   canSetLegacy = เห็นโซน "ของเดิมก่อนมีระบบ" (วันที่ + สถานะ)
//   proposal     = คนกรอกไม่ใช่ RD ⇒ ที่กรอกเป็น **คำขอ** รอ RD ยืนยัน
//                  (คำอธิบายใต้ช่องต้องพูดตรงนี้ ไม่งั้นเข้าใจว่าใช้ได้เลย)
//
// จัดระเบียบรอบ 2026-08-12 ตาม docs/form-design-rules.md:
//   ลำดับ = ตามที่คนคิด: **ลูกค้า (ตัวกำหนดบริบท) มาก่อนชื่อ** — กลิ่นเป็นของ
//   ลูกค้าเสมอ (มติ 9) และช่องอื่น (แก้มาจากกลิ่น) กรองด้วยลูกค้า
//   · แบ่งสามโซนด้วย FormZone · คู่ที่อ่านคู่กันอยู่แถวเดียวกัน
//   · สถานะเริ่มต้น 2 ตัวเลือกตายตัว = OptionTiles ไม่ใช่ dropdown
//     (มติผู้ใช้ 2026-08-08: ชุดเล็กต้องกางให้เห็นแล้วจิ้มทีเดียวจบ)
import SearchableSelect from "@/components/ui/SearchableSelect";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import DateInput from "@/components/ui/DateInput";
import FormZone from "@/components/ui/FormZone";
import { SCENT_STATUS_LABELS } from "@/lib/master/scents";
import styles from "./registryForm.module.css";
import Textarea from "@/components/ui/Textarea";

export const emptyScentForm = () => ({
  name: "",
  code: "",
  customerId: "",
  customerTradeName: "",
  derivedFromScentId: "",
  note: "",
  // กลิ่นเก่าที่เพิ่มเข้าทะเบียนเอง — วันที่เกิดไปแล้วในอดีต ไม่มีค่าตั้งต้นให้เดา
  producedAt: "",
  sentAt: "",
  status: "developing",
});

export function scentToForm(scent) {
  return {
    name: scent.name || "",
    code: scent.code || "",
    customerId: scent.customerId || "",
    customerTradeName: scent.customerTradeName || "",
    derivedFromScentId: scent.derivedFromScentId || "",
    note: scent.note || "",
    // ⚠️ โหมดแก้ไม่มีช่องพวกนี้ (วันที่/สถานะแก้ผ่าน action ของตัวเอง) — ส่งค่าเดิม
    // กลับไปเพื่อไม่ให้ payload ของฟอร์มขาดช่องแล้ว server ตีความว่าถูกล้าง
    producedAt: scent.producedAt || "",
    sentAt: scent.sentAt || "",
    status: scent.status || "developing",
  };
}

export default function ScentForm({
  mode = "create", value, onChange, customers = [], scents = [],
  editingId = null, canSetCode = false, canSetLegacy = false, proposal = false,
  disabled = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });

  // ⚠️ กรองที่ต้นทางเลย ไม่ปล่อยให้เลือกผิดแล้วค่อยให้ server ตีกลับ — กลิ่นข้าม
  // ลูกค้าเป็นข้อห้ามระดับโมเดล (มติ 9) ไม่ใช่ค่าที่แค่ "ไม่แนะนำ"
  // (ด่านจริงยังอยู่ที่ server — ตัวกรองนี้กันคนกดผิด ไม่ได้กันคนยิง API ตรง)
  const lineageOptions = scents
    .filter((s) => s.customerId === value.customerId && s.id !== editingId)
    .map((s) => ({
      value: s.id,
      // รหัสมาก่อนชื่อ — คนหาด้วยรหัสเป็นหลัก · ร่างที่ยังไม่มีรหัสต้องไม่ขึ้นบรรทัดว่าง
      label: `${s.code ? `${s.code} · ` : ""}${s.name}`,
      search: [s.code, s.name, s.customerTradeName].filter(Boolean).join(" "),
    }));

  return (
    <div className="form-grid cols-2">
      {/* ── โซน 1: ตัวตนกลิ่น — ลูกค้ามาก่อน (ตัวกำหนดบริบท) แล้วค่อยชื่อ/รหัส ── */}
      <FormZone title="ตัวตนกลิ่น" className="col-span-2" />

      <div className="form-group col-span-2">
        <label htmlFor="scent-customer">ลูกค้าเจ้าของกลิ่น</label>
        <SearchableSelect
          id="scent-customer"
          value={value.customerId}
          disabled={disabled || mode === "edit"}
          onChange={(v) => set({ customerId: v })}
          options={customers.map((c) => ({ value: c.id, label: c.name || c.id }))}
          placeholder="เลือกลูกค้า"
        />
        <small className={styles.hint}>
          {mode === "edit"
            ? "เปลี่ยนลูกค้าไม่ได้ — ตัวตนของกลิ่นผูกกับลูกค้า"
            : "กลิ่นที่ออกแบบให้ลูกค้ารายหนึ่ง ใช้กับอีกรายไม่ได้"}
        </small>
      </div>

      <div className={`form-group ${canSetCode ? "" : "col-span-2"}`.trim()}>
        <label htmlFor="scent-name">ชื่อกลิ่น</label>
        <Input
          id="scent-name" value={value.name} disabled={disabled}
          placeholder="เช่น Forest night, Walk on beach 01"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      {canSetCode && (
        <div className="form-group">
          <label htmlFor="scent-code">รหัสกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span></label>
          <Input
            id="scent-code" value={value.code} disabled={disabled}
            placeholder="เช่น SC-2026-001"
            onChange={(e) => set({ code: e.target.value })}
          />
          {/* ⚠️ **คำอธิบายรหัสต่างกันตามคนกรอก** — ประโยคเดียวใช้ไม่ได้:
              RD ใส่รหัส = เข้าทะเบียนทันที · ฝ่ายขายใส่รหัสยังเป็นร่างอยู่ดี
              บอกผิดคือหลอกให้คิดว่าใช้กลิ่นนี้ต่อได้แล้ว */}
          <small className={styles.hint}>
            {proposal
              ? "รหัสจริงจากระบบเก่า — RD ตรวจก่อนถึงใช้งานได้"
              : "ใส่รหัสตอนนี้ = เข้าทะเบียนเลย · เว้นว่าง = เก็บเป็นร่างไว้ก่อน"}
          </small>
        </div>
      )}

      {/* ── โซน 2: กลิ่นเดิมที่เคยออกแบบไว้ก่อนมีระบบ (มติผู้ใช้ 2026-08-08) ────
          ⭐ ทางเพิ่มตรงมีไว้ลงของเก่า ⇒ วันผลิต/วันส่ง/สถานะ เกิดไปแล้วในอดีต
          ⚠️ ขึ้นเฉพาะตอน RD สร้างพร้อมรหัส — ร่างที่ฝ่ายขายเสนอยังไม่ใช่ของจริง */}
      {canSetLegacy && mode === "create" && (
        <>
          <FormZone
            title="ของเดิมก่อนมีระบบ"
            note="กลิ่นเก่าที่ลงย้อนหลัง — เว้นว่างได้ทั้งโซน"
            className="col-span-2"
          />
          <div className="form-group">
            <label htmlFor="scent-produced">
              วันที่ผลิตกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            <DateInput
              id="scent-produced" value={value.producedAt} disabled={disabled}
              onChange={(v) => set({ producedAt: v })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="scent-sent">
              วันที่ส่งลูกค้า <span className={styles.hint}>(ไม่บังคับ)</span>
            </label>
            <DateInput
              id="scent-sent" value={value.sentAt} disabled={disabled}
              onChange={(v) => set({ sentAt: v })}
            />
          </div>
          <div className="form-group col-span-2">
            {/* ⭐ ฝ่ายขายเลือกได้แต่เป็น **สถานะที่ขอ** ไม่ใช่สถานะจริง (mig 0269) —
                ป้ายต้องพูดตรงนั้น ไม่งั้นกดบันทึกแล้วเห็นแถวขึ้น "รอเข้าทะเบียน"
                ทั้งที่เพิ่งเลือก "ใช้งานได้" = อ่านเหมือนระบบไม่บันทึกให้ */}
            <label id="scent-status-label">
              {proposal ? "สถานะที่ขอ" : "สถานะเริ่มต้น"}
            </label>
            {/* ชุดตายตัว 2 ตัวเลือก = แผ่นเลือก ไม่ใช่ dropdown (กติกาคอนโทรล
                design v2) — เห็นทั้งคู่พร้อมคำอธิบายก่อนจิ้ม */}
            <OptionTiles
              ariaLabel={proposal ? "สถานะที่ขอ" : "สถานะเริ่มต้น"}
              value={value.status}
              disabled={disabled}
              onChange={(status) => set({ status })}
              options={[
                {
                  value: "developing",
                  label: SCENT_STATUS_LABELS.developing,
                  description: "ยังปรับกลิ่นกับลูกค้าอยู่",
                },
                {
                  value: "active",
                  label: SCENT_STATUS_LABELS.active,
                  tone: "teal",
                  description: "ลูกค้าอนุมัติแล้ว ใช้ผลิตได้เลย",
                },
              ]}
            />
            {proposal && (
              <small className={styles.hint}>
                บันทึกแล้วแถวจะขึ้นเป็น &ldquo;รอเข้าทะเบียน&rdquo; — RD ตรวจข้อมูลแล้วกดรับ
                กลิ่นถึงใช้ต่อได้ (ใส่ราคา · ผูกสูตร · อ้างในคำร้อง)
              </small>
            )}
          </div>
        </>
      )}

      {/* ── โซน 3: ข้อมูลเสริม ─────────────────────────────────────────────── */}
      <FormZone title="ข้อมูลเสริม" className="col-span-2" />

      {/* ⭐ ชื่อที่ลูกค้าตั้งเอง — เป็นวิธีที่ลูกค้าโทรมาถามจริง
          ⚠️ ป้ายและ hint ต้องย้ำว่ามัน "เพิ่ม" ไม่ใช่ "แทน" ชื่อของเรา ปล่อยให้แทนกัน
          เมื่อไรจะเข้าโรคเดิมที่ 0171 บันทึกไว้ (ชื่อกลิ่นไปโผล่ในช่องชื่อสูตร) */}
      <div className="form-group">
        <label htmlFor="scent-trade-name">
          ชื่อที่ลูกค้าเรียก <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <Input
          id="scent-trade-name" value={value.customerTradeName}
          disabled={disabled} placeholder="ชื่อทางการค้าที่ลูกค้าตั้งเอง"
          onChange={(e) => set({ customerTradeName: e.target.value })}
        />
        <small className={styles.hint}>
          ใช้ค้นหาได้ และแสดงคู่กับรหัส/ชื่อของเราเสมอ — ไม่ได้ใช้แทนกัน
        </small>
      </div>

      {/* สายพันธุ์ — มาแทน Rev. เพราะ Rev. บังคับให้เป็นเส้นตรง แต่งานจริงแตกกิ่งได้ */}
      <div className="form-group">
        <label htmlFor="scent-derived-from">
          แก้มาจากกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        <SearchableSelect
          id="scent-derived-from"
          value={value.derivedFromScentId}
          disabled={disabled || !value.customerId || !lineageOptions.length}
          onChange={(v) => set({ derivedFromScentId: v })}
          options={[{ value: "", label: "— ไม่ได้แก้มาจากตัวไหน —" }, ...lineageOptions]}
          placeholder={value.customerId ? "ค้นด้วยรหัสหรือชื่อกลิ่น" : "เลือกลูกค้าก่อน"}
        />
        <small className={styles.hint}>
          {!value.customerId
            ? "เลือกลูกค้าก่อน แล้วจะเห็นเฉพาะกลิ่นของลูกค้ารายนั้น"
            : lineageOptions.length
              ? "ลูกค้าขอให้แก้ตัวไหน เลือกตัวนั้น — ทะเบียนจะโยงสายให้อ่านย้อนได้"
              : "ลูกค้ารายนี้ยังไม่มีกลิ่นอื่นในทะเบียน"}
        </small>
      </div>

      <div className="form-group col-span-2">
        <label htmlFor="scent-note">หมายเหตุ</label>
        <Textarea
          id="scent-note" rows={3} value={value.note} disabled={disabled}
          placeholder="โน้ตกลิ่น / ที่มา / ข้อจำกัด"
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </div>
  );
}
