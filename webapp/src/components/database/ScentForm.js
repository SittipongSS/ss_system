"use client";
// ── ฟอร์มกลิ่นในทะเบียน (mig 0171) ─────────────────────────────────────
// ⚠️ ฟอร์มเดียวใช้ทั้ง "เพิ่มกลิ่น" และ "แก้ข้อมูลกลิ่น" (กฎ AGENTS.md) —
// ต่างกันแค่โหมดผ่าน props:
//   mode="create" → RD ใส่รหัสได้เลย (= เข้าทะเบียนทันที) · ฝ่ายขายไม่มีช่องรหัส
//   mode="edit"   → ไม่มีช่องรหัส เพราะ "ใส่รหัส = รับเข้าทะเบียน" เป็นคนละ action
//                   และลูกค้าล็อก (ตัวตนของกลิ่นผูกกับลูกค้า — มติ 9)
import SearchableSelect from "@/components/ui/SearchableSelect";
import Input from "@/components/ui/Input";
import styles from "./registryForm.module.css";
import Textarea from "@/components/ui/Textarea";

export const emptyScentForm = () => ({
  name: "",
  code: "",
  customerId: "",
  customerTradeName: "",
  derivedFromScentId: "",
  note: "",
});

export function scentToForm(scent) {
  return {
    name: scent.name || "",
    code: scent.code || "",
    customerId: scent.customerId || "",
    customerTradeName: scent.customerTradeName || "",
    derivedFromScentId: scent.derivedFromScentId || "",
    note: scent.note || "",
  };
}

export default function ScentForm({
  mode = "create", value, onChange, customers = [], scents = [],
  editingId = null, canSetCode = false, disabled = false,
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
    <div className="form-grid">
      <div className="form-group col-span-2">
        <label htmlFor="scent-name">ชื่อกลิ่น</label>
        <input
          id="scent-name" className="premium-input" value={value.name} disabled={disabled}
          placeholder="เช่น Forest night, Walk on beach 01"
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

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

      {canSetCode && mode === "create" && (
        <div className="form-group col-span-2">
          <label htmlFor="scent-code">รหัสกลิ่น <span className={styles.hint}>(ไม่บังคับ)</span></label>
          <input
            id="scent-code" className="premium-input" value={value.code} disabled={disabled}
            placeholder="เช่น SC-2026-001"
            onChange={(e) => set({ code: e.target.value })}
          />
          <small className={styles.hint}>
            ใส่รหัสตอนนี้ = เข้าทะเบียนเลย · เว้นว่าง = เก็บเป็นร่างไว้ก่อน
          </small>
        </div>
      )}

      {/* ⭐ ชื่อที่ลูกค้าตั้งเอง — เป็นวิธีที่ลูกค้าโทรมาถามจริง
          ⚠️ ป้ายและ hint ต้องย้ำว่ามัน "เพิ่ม" ไม่ใช่ "แทน" ชื่อของเรา ปล่อยให้แทนกัน
          เมื่อไรจะเข้าโรคเดิมที่ 0171 บันทึกไว้ (ชื่อกลิ่นไปโผล่ในช่องชื่อสูตร) */}
      <div className="form-group col-span-2">
        <label htmlFor="scent-trade-name">
          ชื่อที่ลูกค้าเรียก <span className={styles.hint}>(ไม่บังคับ)</span>
        </label>
        {/* ใช้ primitive กลาง ไม่เขียนคลาสดิบเพิ่ม — ช่องเดิมสองช่องบนฟอร์มนี้ยัง
            เป็นคลาสดิบอยู่ (หนี้เก่าที่ ratchet คุมยอดไว้) ช่องใหม่ไม่ควรไปเพิ่มยอดนั้น */}
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
      <div className="form-group col-span-2">
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
