"use client";
// ── ฟอร์มรอบบริการ (mig 0188) — ตัวเดียวใช้ทั้ง "สร้างรอบ" และ "แก้รอบ" ─────
// กฎ AGENTS.md: ห้ามเขียนฟอร์มแก้แยกอีกชุด · ต่างกันได้แค่ "โหมด" ผ่าน props
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Select from "@/components/ui/Select";
import { PLAN_KINDS, VISIT_KIND_LABELS, estimateVisitCount, normalizePlanInput } from "@/lib/service/rounds";
import styles from "./ServiceSiteModal.module.css";

// ตัวเลือกรอบที่ใช้จริง — พิมพ์เองก็ยังได้ แต่ 4 ค่านี้ครอบเกือบทุกสัญญา
const EVERY_PRESETS = [
  { days: 7, label: 'ทุกสัปดาห์' },
  { days: 14, label: 'ทุก 2 สัปดาห์' },
  { days: 30, label: 'ทุกเดือน' },
  { days: 90, label: 'ทุกไตรมาส' },
];

const EMPTY = {
  kind: "refill", everyDays: 30, startDate: "", endDate: "",
  assigneeId: "", assigneeName: "", isActive: true, note: "",
  salesOrderId: "",
};

/* `roundsSold` = จำนวนรอบที่ฝ่ายขายระบุไว้ในใบเสนอราคา (mig 0326) — null/ไม่ส่ง
   = ยังไม่ระบุ ⇒ กล่องเทียบไม่ขึ้นเลย ไม่ใช่ขึ้นแล้วบอก 0 */
/* `salesOrderId` = ใบสั่งขายที่ครอบรอบนี้ (mig 0188 มีคอลัมน์นี้มาตั้งแต่แรก)
   🔴 **ก่อนหน้านี้ไม่มีใครส่งค่านี้เลยทั้งระบบ** ⇒ คอลัมน์ "รอบที่เดิน n/N" บนทะเบียน
      ใบสั่งขายซึ่งนับผ่าน `service_plans."salesOrderId"` ตอบ 0 ให้ทุกใบมาตลอด
   ⭐ **ตอนนี้เป็นช่องจริงในฟอร์ม ส่งทั้งตอนสร้างและตอนแก้** (2026-09-02)
      เดิมส่งเฉพาะตอนสร้าง เพราะ PATCH ผสม `{...before, ...body}` แล้ว `undefined`
      ใน spread ทับค่าเดิม ⇒ ส่งทุกครั้งตอนที่ยังไม่มีช่อง = ล้างค่าเดิมทิ้ง
      พอมีช่องแล้ว ค่าที่ส่งคือสิ่งที่คนเลือกไว้เสมอ จึงส่งได้ทุกครั้งอย่างปลอดภัย
   🪤 เคสที่ต้องใช้ช่องนี้บ่อยที่สุดคือ **ออก Rev.** — ไม่มีโค้ดไหนย้าย `salesOrderId`
      ไปใบใหม่ให้ ⇒ รอบชี้ใบที่ตายแล้วจนกว่าจะมีคนย้ายเอง */
export default function ServicePlanModal({
  open, siteId, plan = null, technicians = [], roundsSold = null, salesOrderId = null,
  salesOrders = null, onClose, onSave,
}) {
  const editing = !!plan;
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(plan
      ? {
        kind: plan.kind || "refill",
        everyDays: plan.everyDays ?? 30,
        startDate: plan.startDate || "",
        endDate: plan.endDate || "",
        assigneeId: plan.assigneeId || "",
        assigneeName: plan.assigneeName || "",
        isActive: plan.isActive !== false,
        note: plan.note || "",
        salesOrderId: plan.salesOrderId || "",
      }
      : { ...EMPTY, salesOrderId: salesOrderId || "" });
  }, [open, plan, salesOrderId]);

  const change = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ⭐ **ตัวประมาณ ไม่ใช่ตัวบังคับ** (มติผู้ใช้) — ระบบไม่บล็อกเมื่อจำนวนไม่ตรงกับที่ขาย
     รอบจริงเลื่อน/งด/แถมได้ตามหน้างาน · กล่องนี้มีไว้ให้คนตั้งความถี่เห็นผลทันที
     ⚠️ ไม่มีวันสิ้นสุด = ประมาณไม่ได้ ⇒ บอกตรง ๆ ว่าต้องใส่วันสิ้นสุดก่อน */
  const estimate = estimateVisitCount({
    startDate: form.startDate, endDate: form.endDate, everyDays: Number(form.everyDays),
  });

  const submit = async () => {
    /* 🔴 **ส่ง `salesOrderId` ทั้งตอนสร้างและตอนแก้** (เปลี่ยนจากเดิมที่ส่งเฉพาะตอนสร้าง)
       ของเดิมกันไว้เพราะยังไม่มีช่องให้แก้ ⇒ ส่งทุกครั้งจะล้างค่าเดิมทิ้งเมื่อแก้จาก
       หน้าไซต์ · ตอนนี้มีช่องจริงแล้ว ค่าที่ส่งจึงเป็นสิ่งที่คนเลือกไว้เสมอ
       ⚠️ ค่าว่าง = "ไม่ผูกใบ" ซึ่งเป็นคำตอบที่ถูกต้องคำตอบหนึ่ง ไม่ใช่ "ไม่ได้กรอก"
          ⇒ ส่ง null ไปตรง ๆ ไม่ใช่ตัดคีย์ทิ้ง (ตัดทิ้ง = ค่าเดิมค้างเพราะ PATCH ผสม) */
    const payload = {
      ...form,
      siteId,
      everyDays: Number(form.everyDays),
      salesOrderId: form.salesOrderId || null,
    };
    const { error: invalid } = normalizePlanInput(payload);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "แก้รอบบริการ" : "สร้างรอบบริการ"} size="md">
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>ชนิดงาน *</span>
          <Select value={form.kind} onChange={change("kind")}>
            {PLAN_KINDS.map((kind) => (
              <option key={kind} value={kind}>{VISIT_KIND_LABELS[kind]}</option>
            ))}
          </Select>
        </label>

        {/* ⭐ **รอบเป็นข้อผูกพันของใบสั่งขาย ไม่ใช่ของไซต์** — ช่องนี้คือทางเดียวที่
            ผูก/ย้ายใบให้รอบที่มีอยู่แล้วได้ · ก่อนหน้านี้ไม่มีเลย ⇒ รอบที่สร้างจาก
            หน้าไซต์ได้ `salesOrderId = null` ถาวร แล้วคอลัมน์ "รอบที่เดิน n/N"
            ของทุกใบไม่นับมันเลยตลอดกาล
            🪤 เคสที่ต้องใช้บ่อยที่สุดคือ **ออก Rev.** — ไม่มีโค้ดไหนย้าย salesOrderId
               ไปใบใหม่ให้ ⇒ ต้องมีคนย้ายเอง ที่นี่
            ⚠️ ขึ้นเฉพาะเมื่อผู้เรียกส่งตัวเลือกมา — หน้าที่ไม่รู้จักใบ (ถ้ามีในอนาคต)
               ต้องไม่ได้ช่องเปล่าที่เลือกอะไรไม่ได้ */}
        {Array.isArray(salesOrders) && (
          <label className={styles.field}>
            <span>ใบสั่งขายที่ครอบรอบนี้</span>
            <Select
              value={form.salesOrderId || ""}
              onChange={change("salesOrderId")}
            >
              <option value="">ไม่ผูกใบ</option>
              {salesOrders.map((o) => (
                <option key={o.id} value={o.id}>{o.orderNumber || o.id}</option>
              ))}
            </Select>
            <small className={styles.hint}>
              {form.salesOrderId
                ? "รอบนี้จะถูกนับเป็น “รอบที่เดิน” ของใบนี้"
                : "ไม่ผูกใบ = ไม่ถูกนับเป็นรอบตามข้อผูกพันของใบไหนเลย"}
            </small>
          </label>
        )}

        <label className={styles.field}>
          <span>รอบ (วัน) *</span>
          <Input type="number" min="1" max="365" value={form.everyDays} onChange={change("everyDays")} />
          <div className={styles.dayRow}>
            {EVERY_PRESETS.map((preset) => (
              <Button key={preset.days} tone="neutral" variant="quiet" size="sm"
                onClick={() => setForm((prev) => ({ ...prev, everyDays: preset.days }))}>
                {preset.label}
              </Button>
            ))}
          </div>
        </label>

        <label className={styles.field}>
          <span>เริ่มรอบ *</span>
          <DateInput value={form.startDate} onChange={(iso) => setForm((prev) => ({ ...prev, startDate: iso }))} />
        </label>

        <label className={styles.field}>
          <span>สิ้นสุดรอบ</span>
          <DateInput value={form.endDate} onChange={(iso) => setForm((prev) => ({ ...prev, endDate: iso }))} />
          <small>เว้นว่าง = ไม่มีกำหนดสิ้นสุด</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>เจ้าหน้าที่ประจำรอบ</span>
          <SearchableSelect
            value={form.assigneeId}
            onChange={(id) => {
              const tech = technicians.find((t) => t.id === id);
              setForm((prev) => ({ ...prev, assigneeId: id, assigneeName: tech?.name || "" }));
            }}
            options={technicians.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="ยังไม่กำหนด"
            ariaLabel="เจ้าหน้าที่ประจำรอบ"
          />
          <small>เป็นค่าตั้งต้นของนัดที่ระบบสร้างให้ · ย้ายคนรายนัดได้ที่ตาราง</small>
        </label>

        <label className={`${styles.field} ${styles.wide}`}>
          <span>หมายเหตุ</span>
          <Input as="textarea" rows={2} value={form.note} onChange={change("note")} maxLength={1000} />
        </label>

        {/* โหมดสร้างไม่มีช่องสถานะ — รอบใหม่เริ่มที่ "เปิดใช้งาน" เสมอ (กฎ AGENTS.md) */}
        {editing && (
          <label className={`${styles.field} ${styles.wide} ${styles.check}`}>
            <input type="checkbox" checked={form.isActive} onChange={change("isActive")} />
            <span>เปิดใช้งาน</span>
            <small>ปิดรอบ = หยุดสร้างนัดใหม่ · นัดที่สร้างไว้แล้วยังอยู่บนตาราง</small>
          </label>
        )}
      </div>

      {(roundsSold || estimate) && (
        <p className={styles.hint}>
          {/* เปิดจากหน้าใบสั่งขาย = ตัวเลขของ *ใบนั้น* · เปิดจากหน้าไซต์ = ของทั้งไซต์
              ⇒ ต้องบอกให้ตรง ไม่งั้นฟอร์มหน้าตาเดียวกันโชว์ N คนละตัวโดยไม่มีใครรู้ */}
          {roundsSold
            ? <>{salesOrderId ? "ใบนี้ระบุไว้ " : "ฝ่ายขายระบุไว้ "}<strong>{roundsSold} รอบ</strong>{" · "}</>
            : null}
          {estimate
            ? <>ความถี่นี้จะได้ราว <strong>{estimate} นัด</strong> ในช่วงที่ตั้งไว้</>
            : <>ใส่วันสิ้นสุดรอบด้วย จึงจะประมาณจำนวนนัดให้ได้</>}
          {roundsSold && estimate && estimate !== roundsSold
            ? <> — ต่างจากที่ขายไว้ {Math.abs(estimate - roundsSold)} นัด (ตั้งต่อได้ ไม่ใช่ข้อห้าม)</>
            : null}
        </p>
      )}

      <p className={styles.hint}>
        ระบบสร้างนัดล่วงหน้า <strong>90 วัน</strong> เท่านั้น แล้วต่อรอบให้เมื่อปิดงานจริง —
        นัดที่สร้างไว้ทั้งปีคือแถวที่จะถูกเลื่อนทุกเดือนแล้วไม่มีใครกล้าลบ
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" onClick={submit} disabled={saving}>
          {saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "สร้างรอบ + นัด"}
        </Button>
      </div>
    </Modal>
  );
}
