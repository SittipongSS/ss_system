"use client";
// ── โมดัล "ตั้ง/แก้รอบวางบิล" ของลูกค้า (mig 0389 · ม็อก A `m-cycle`) ────────────────────────────
//
// สองคำถาม + หมายเหตุ · **ไม่มีค่าตั้งต้นให้การตัดสินใจ** (ยังไม่ตั้ง = ว่าง ไม่ใช่ "ทุกวัน")
//   1. วางบิล      — ได้ทุกวัน | ทุกเดือนวันที่ n (1–31 · ชิป "สิ้นเดือน" = 31)
//   2. เงินเข้า    — เครดิต n วันนับจากวันวางบิล | ทุกเดือนวันที่ n + เดือนเดียวกับวางบิล/เดือนถัดไป
//   3. หมายเหตุการวางบิล (ข้อความยาว ทรงเดียวของระบบ)
// ตัวอย่างรอบถัดไปคิดสดใต้ฟอร์ม + ปักบรรทัด "รอบถัดไป" เหนือปุ่ม (เห็นผลก่อนกด — form-design-rules §2)
// ⚠️ ด่านปุ่มบันทึก = `normalizeBillingRule` **ตัวเดียวกับที่ API ใช้ปฏิเสธ** — ปุ่มกับด่านพูดเรื่องเดียวกัน
//    ปุ่มกดไม่ได้ต้องบอกเหตุติดปุ่ม ไม่ใช่จางเฉย ๆ
// ⚠️ ตัดช่อง "ผู้ดูแลการวางบิล (FN)" ของม็อกออก (มติ 26/09 ข้อ 5: กระดิ่งฝั่งบัญชีแจ้งทั้งฝ่าย)
// ⚠️ แก้ส่วนนี้ **ไม่ส่งลูกค้ากลับไปรออนุมัติ** — บันทึกผ่านเส้นแยก `/billing-rule` ไม่ใช่ PATCH ของลูกค้า
import { useState } from "react";
import { CalendarRange, CalendarSearch, Check, Eraser, ShieldCheck, TriangleAlert } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import Textarea from "@/components/ui/Textarea";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { RESPONSE_WARNING_TOAST } from "@/lib/apiWarnings";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { NA, naText } from "@/lib/format";
import { customerNameIn } from "@/lib/master/customerName";
import {
  BILLING_CREDIT_MAX, BILLING_NOTE_MAX, MONTH_END_DAY, billingRuleOf, describeBillingRule, formatBillingDate,
  normalizeBillingRule,
} from "@/lib/sales/billingRule";
import { BillingRoundsList, billingPreviewOf } from "./CustomerBillingRuleRounds";
import styles from "./CustomerBillingRule.module.css";

const BILL_OPTIONS = [
  { value: "anyday", label: "วางบิลได้ทุกวัน", description: "ไม่มีรอบ · ลูกค้ารับใบวางบิลได้ทุกวันทำการ" },
  { value: "monthly", label: "ทุกเดือน ตามวันที่", description: "ลูกค้ารับวางบิลเดือนละครั้ง ตามวันที่กำหนด" },
];
const PAY_OPTIONS = [
  { value: "credit", label: "เครดิต N วัน", description: "นับจากวันวางบิล · 0 = ชำระวันเดียวกับวางบิล" },
  { value: "monthly", label: "ทุกเดือน ตามวันที่", description: "ลูกค้าจ่ายเงินเป็นรอบ เดือนละครั้ง" },
];
const MONTH_OPTIONS = [
  { value: 0, label: "เดือนเดียวกับวางบิล" },
  { value: 1, label: "เดือนถัดไป" },
];
/* ชิป "สิ้นเดือน" = วันที่ 31 (เดือนที่ไม่มีวันนั้นใช้วันสุดท้าย) · เลือกแล้วช่องตัวเลขขึ้นขีด
   คำว่า "สิ้นเดือน" อยู่บนชิปที่เดียว · กดซ้ำ = ถอด (กลับไปพิมพ์วันที่) */
const MONTH_END_CHIP = [{ value: "end", label: "สิ้นเดือน" }];

/* ฟอร์มว่าง = ยังไม่ได้ตัดสินอะไรเลย (ไม่มีค่าตั้งต้น) · ช่องตัวเลขเก็บเป็นสตริงที่พิมพ์ไว้ */
const BLANK = {
  billMode: null, billDay: "", billEnd: false,
  payMode: null, creditDays: "", payDay: "", payEnd: false, monthOffset: null,
  note: "",
};

/* รอบที่บันทึกไว้ → ค่าในฟอร์ม · วันที่ 31 = ชิป "สิ้นเดือน" (ความหมายเดียวกัน) */
function formOf(value) {
  const rule = billingRuleOf(value);
  if (!rule) return BLANK;
  const billMonthly = rule.billing.mode === "monthly";
  const payMonthly = rule.payment.mode === "monthly";
  return {
    billMode: rule.billing.mode,
    billDay: billMonthly && rule.billing.day !== MONTH_END_DAY ? String(rule.billing.day) : "",
    billEnd: billMonthly && rule.billing.day === MONTH_END_DAY,
    payMode: rule.payment.mode,
    creditDays: rule.payment.mode === "credit" ? String(rule.payment.days) : "",
    payDay: payMonthly && rule.payment.day !== MONTH_END_DAY ? String(rule.payment.day) : "",
    payEnd: payMonthly && rule.payment.day === MONTH_END_DAY,
    monthOffset: payMonthly ? rule.payment.monthOffset : null,
    note: rule.note || "",
  };
}

/* ค่าในฟอร์ม → ก้อนที่ส่งเข้า normalizeBillingRule (ตัวตรวจตัวเดียวกับ API) — ไม่ตรวจเองที่นี่ */
function ruleInputOf(form) {
  const billing = form.billMode === "anyday"
    ? { mode: "anyday" }
    : form.billMode === "monthly" ? { mode: "monthly", day: form.billEnd ? MONTH_END_DAY : form.billDay } : null;
  const payment = form.payMode === "credit"
    ? { mode: "credit", days: form.creditDays }
    : form.payMode === "monthly"
      ? { mode: "monthly", day: form.payEnd ? MONTH_END_DAY : form.payDay, monthOffset: form.monthOffset }
      : null;
  return { billing, payment, note: form.note };
}

/* ช่องที่ยังไม่ได้ตอบ **ทั้งหมด** — ใช้แค่ "เขียนข้อความ" ของด่าน ไม่ใช่ตัวตัดสิน
   ⚠️ ด่านจริงยังเป็น `normalizeBillingRule` (ตัวเดียวกับ API) · ตัวนี้เกิดขึ้นเพราะตัวนั้นคืน error แรกตัวเดียว
      ⇒ ฟอร์มว่างบอกแค่ข้อ 1 แล้วค่อยเปลี่ยนเป็นข้อ 2 ทีหลัง = ผิดกฎ "ด่านตรวจรวมข้อความเดียว บอกทุกช่องที่ขาด
      ในครั้งเดียว" (form-design-rules §ช่องบังคับ) · ทุกช่องที่ลิสต์นี้นับ ตัวตรวจตัวนั้นก็ปฏิเสธเสมอ
      (ค่าว่าง = ไม่ผ่าน) จึงไม่มีทางที่ข้อความบอกว่าขาดแต่ปุ่มกดได้
   ชื่อช่องเรียกตามที่ตาเห็นบนจอ (หัวข้อ "1. วางบิล" / "2. เงินเข้า" + ช่องย่อยใต้หัวข้อนั้น) */
function missingAnswersOf(form) {
  const missing = [];
  if (!form.billMode) missing.push("1. วางบิล");
  else if (form.billMode === "monthly" && !form.billEnd && !form.billDay) missing.push("วันที่วางบิล");
  if (!form.payMode) missing.push("2. เงินเข้า");
  else if (form.payMode === "credit" && !form.creditDays) missing.push("จำนวนวันเครดิต");
  else if (form.payMode === "monthly") {
    if (!form.payEnd && !form.payDay) missing.push("วันที่เงินเข้า");
    if (form.monthOffset === null || form.monthOffset === undefined) missing.push("เดือนที่เงินเข้า");
  }
  return missing;
}

const digits = (value, max) => String(value || "").replace(/\D/g, "").slice(0, max);

/* ⚠️ ผู้เรียก **mount ตอนเปิดเท่านั้น** (การ์ดวาดเมื่อกดปุ่ม) — ฟอร์มตั้งต้นจากค่าที่บันทึกไว้จริงตั้งแต่เฟรมแรก
   (ไม่มีจังหวะฟอร์มว่างวาบก่อน effect) และเปิดใหม่ = เริ่มใหม่เสมอ: ของที่พิมพ์ค้างรอบก่อนแล้วกดยกเลิก
   ไม่ใช่คำตอบของรอบนี้ */
export default function CustomerBillingRuleModal({ open = true, onClose, customer, onSaved }) {
  const [form, setForm] = useState(() => formOf(customer?.billingRule));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const hasRule = Boolean(billingRuleOf(customer?.billingRule));

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const { rule, error } = normalizeBillingRule(ruleInputOf(form));
  /* ด่าน = `error` ตัวเดียว · ข้อความ = ทุกช่องที่ขาดก่อน แล้วค่อยเหตุของตัวตรวจเมื่อตอบครบแล้ว (ดู missingAnswersOf) */
  const missing = error ? missingAnswersOf(form) : [];
  const gateMessage = error ? `ยังบันทึกไม่ได้ — ${missing.length ? `ขาด ${missing.join(" · ")}` : error}` : "";
  const today = businessDate();
  const preview = rule ? billingPreviewOf(rule, today) : { anyday: false, rows: [] };
  const first = preview.rows[0] || null;

  const send = async (billingRule, { cleared = false } = {}) => {
    setSaving(true);
    setSaveError("");
    try {
      const saved = await apiJson(`/api/master/customers/${encodeURIComponent(customer.id)}/billing-rule`, {
        method: "PATCH",
        json: { billingRule },
        fallbackError: "บันทึกรอบวางบิลไม่สำเร็จ",
      });
      /* `activityLogged` เป็นผลของการกดครั้งนี้ ไม่ใช่ช่องของลูกค้า — ตัดออกก่อนส่งให้หน้าแม่เติมลงแถว */
      const { activityLogged, ...fields } = saved || {};
      if (fields.unchanged) notifyToast.info("ไม่มีช่องไหนเปลี่ยน · ไม่ได้ลงประวัติ");
      /* ⚠️ route ลงแถว "ความเคลื่อนไหว" ไม่สำเร็จ (รอบบันทึกแล้ว) ⇒ ห้ามบอกว่าลงแล้ว — ป้ายยืนยันการล้างเพิ่งสัญญา
         ไว้ว่า "รอบเดิมยังดูย้อนได้ในความเคลื่อนไหว" · ทางเดียวที่เหลือให้คนกดเห็นรอบเดิมคือทักนี้ ⇒ พิมพ์รอบเดิมลงไปเลย
         (`customer` ยังเป็นแถวก่อนบันทึก — หน้าแม่เติมค่าใหม่ตอน onSaved ข้างล่าง) และค้างนานพอให้จดทัน
         ⛔ อย่าชี้ไป "บันทึกการแก้ไขของระบบ" — นั่นคือ audit_logs ที่ฝ่ายขาย/บัญชีเปิดไม่ได้ (ดูหัว `clear` ข้างล่าง) */
      else if (activityLogged === false) {
        const oldRule = describeBillingRule(customer?.billingRule);
        notifyToast.warning(
          `${cleared ? "ล้างรอบวางบิลแล้ว" : "บันทึกรอบวางบิลแล้ว"} · แต่ลงความเคลื่อนไหวของลูกค้าไม่สำเร็จ — ${oldRule ? `รอบเดิมคือ "${oldRule}" (จดไว้ หรือแจ้งผู้ดูแลระบบ)` : "แจ้งผู้ดูแลระบบ"}`,
          RESPONSE_WARNING_TOAST,
        );
      } else {
        notifyToast.success(cleared ? "ล้างรอบวางบิลแล้ว · รอบเดิมยังดูย้อนได้ในความเคลื่อนไหว" : "บันทึกรอบวางบิลแล้ว · ลงความเคลื่อนไหวแล้ว ไม่ต้องขออนุมัติใหม่");
      }
      onSaved?.(fields);
    } catch (err) {
      setSaveError(err?.message || "บันทึกรอบวางบิลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (error || saving) return;
    send(rule);
  };

  /* ล้างรอบ = กลับเป็น "ยังไม่ตั้ง" · บอกผลก่อนกด (วันของงวดที่มีอยู่แล้วไม่ขยับ — รอบใช้ตอนเลือกรอบเท่านั้น)
     ⭐ "รอบเดิมยังดูย้อนได้ในความเคลื่อนไหว" เป็นคำสัญญาที่ระบบทำจริงแล้ว (มติเจ้าของ 26/09 ข้อ 7) — route ลงแถว
        `billing_rule` เดิม → ใหม่ ในเธรดของลูกค้า ซึ่งทุกคนที่เปิดหน้าลูกค้าได้อ่านได้
     ⚠️ อย่าย้อนไปอ้าง "ประวัติการแก้ไข" — นั่นคือ `audit_logs` ที่เปิดได้เฉพาะแอดมิน (/audit · `audit:view`)
        ฝ่ายขาย/บัญชีที่กดปุ่มนี้ดูไม่ได้ ⇒ ป้ายสัญญาสิ่งที่คนกดทำไม่ได้ (form-design-rules §ช่องบังคับ)
     ⚠️ ถ้าวันหนึ่งเลิกลงเธรด ต้องแก้ประโยคนี้ในคอมมิตเดียวกัน (โมดัลเตือนเองเมื่อ route บอกว่าลงไม่สำเร็จ) */
  const clear = async () => {
    const accepted = await confirmAction({
      title: "ล้างรอบวางบิลของลูกค้ารายนี้?",
      description: "ใบสั่งขายใหม่จะกลับไปพิมพ์กำหนดชำระเองทีละงวด",
      detail: "· วันวางบิลและกำหนดชำระของงวดที่มีอยู่แล้วไม่เปลี่ยน\n· รอบเดิมยังดูย้อนได้ในการ์ด \"ความเคลื่อนไหว\" ของลูกค้ารายนี้",
      confirmLabel: "ล้างรอบวางบิล",
      danger: true,
    });
    if (accepted) send(null, { cleared: true });
  };

  const subtitle = [customer?.arCode, customer ? customerNameIn(customer) : ""].filter(Boolean).join(" · ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="md"
      sheetOnPhone
      title={hasRule ? "แก้รอบวางบิล" : "ตั้งรอบวางบิล"}
      subtitle={subtitle}
      footer={(
        <div className={styles.foot}>
          {error ? (
            <p className={styles.gate} role="status">
              <TriangleAlert size={14} aria-hidden="true" />
              <span>{gateMessage}</span>
            </p>
          ) : first ? (
            <p className={styles.pin} aria-live="polite">
              <CalendarRange size={14} aria-hidden="true" />
              <span>
                {preview.anyday ? "ถ้าวางบิลวันนี้" : "รอบถัดไป"}{" "}
                <span className={styles.nowrap}>วางบิล <b>{formatBillingDate(first.billingDate, { withYear: false })}</b></span>
                {" → "}
                <span className={styles.nowrap}>เงินเข้า <b>{formatBillingDate(first.dueDate, { withYear: false })}</b></span>
              </span>
            </p>
          ) : null}
          <span className={styles.footNote}><ShieldCheck size={14} aria-hidden="true" />แก้ส่วนนี้ไม่ต้องขออนุมัติใหม่ · ลงความเคลื่อนไหวของลูกค้า</span>
          <div className={styles.footActions}>
            {hasRule ? (
              <Button tone="neutral" variant="quiet" icon={<Eraser size={15} aria-hidden="true" />} disabled={saving} onClick={clear}>
                ล้างรอบวางบิล
              </Button>
            ) : null}
            <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
            <Button
              tone="primary"
              icon={<Check size={15} aria-hidden="true" />}
              disabled={Boolean(error) || saving}
              title={gateMessage || undefined}
              onClick={save}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกรอบวางบิล"}
            </Button>
          </div>
        </div>
      )}
    >
      <div className={styles.modalBody}>
        {saveError ? <StatusNotice tone="error" title="บันทึกไม่สำเร็จ">{saveError}</StatusNotice> : null}

        {/* ค่าที่ระบบรู้แล้ว = ช่องเส้นประอ่านอย่างเดียว (ข้อความเดิม ระบบไม่แปลงเป็นรอบให้) */}
        <div className={styles.field}>
          <span className={styles.label}>เงื่อนไขเครดิตที่บันทึกไว้ <span className={styles.opt}>ข้อความเดิม · อ่านอย่างเดียว · ระบบไม่แปลงเป็นรอบให้</span></span>
          <p className={styles.derived}>{naText(customer?.creditTerms)}</p>
        </div>

        {/* 1 · วางบิล */}
        <div className={styles.field}>
          <span className={styles.label}>1. วางบิล <b className={styles.req}>*</b></span>
          <OptionTiles
            ariaLabel="วางบิล"
            options={BILL_OPTIONS}
            value={form.billMode}
            onChange={(billMode) => set({ billMode })}
          />
          {form.billMode === "monthly" ? (
            <div className={styles.sub}>
              <div className={styles.subRow}>
                <label htmlFor="billing-rule-bill-day">วันที่</label>
                <Input
                  id="billing-rule-bill-day"
                  className={styles.num}
                  inputMode="numeric"
                  maxLength={2}
                  autoComplete="off"
                  placeholder={form.billEnd ? NA : "1–31"}
                  value={form.billDay}
                  onChange={(event) => set({ billDay: digits(event.target.value, 2), billEnd: false })}
                />
                <span>ของทุกเดือน</span>
                <span className={styles.or}>หรือ</span>
                <ChoiceChips
                  ariaLabel="วางบิลสิ้นเดือน"
                  options={MONTH_END_CHIP}
                  value={form.billEnd ? "end" : null}
                  onChange={() => set({ billEnd: !form.billEnd, billDay: "" })}
                />
              </div>
              <small>เดือนที่ไม่มีวันนั้น (เช่น 31 ในเดือน ก.พ.) ใช้วันสุดท้ายของเดือน</small>
            </div>
          ) : null}
        </div>

        {/* 2 · เงินเข้า / กำหนดชำระ */}
        <div className={styles.field}>
          <span className={styles.label}>2. เงินเข้า / กำหนดชำระ <b className={styles.req}>*</b></span>
          <OptionTiles
            ariaLabel="เงินเข้า / กำหนดชำระ"
            options={PAY_OPTIONS}
            value={form.payMode}
            onChange={(payMode) => set({ payMode })}
          />
          {form.payMode === "credit" ? (
            <div className={styles.sub}>
              <div className={styles.subRow}>
                <label htmlFor="billing-rule-credit">เครดิต</label>
                <Input
                  id="billing-rule-credit"
                  className={styles.num}
                  inputMode="numeric"
                  maxLength={3}
                  autoComplete="off"
                  placeholder={`0–${BILLING_CREDIT_MAX}`}
                  value={form.creditDays}
                  onChange={(event) => set({ creditDays: digits(event.target.value, 3) })}
                />
                <span>วัน นับจากวันวางบิล</span>
              </div>
            </div>
          ) : null}
          {form.payMode === "monthly" ? (
            <div className={styles.sub}>
              <div className={styles.subRow}>
                <label htmlFor="billing-rule-pay-day">วันที่</label>
                <Input
                  id="billing-rule-pay-day"
                  className={styles.num}
                  inputMode="numeric"
                  maxLength={2}
                  autoComplete="off"
                  placeholder={form.payEnd ? NA : "1–31"}
                  value={form.payDay}
                  onChange={(event) => set({ payDay: digits(event.target.value, 2), payEnd: false })}
                />
                <span className={styles.or}>หรือ</span>
                <ChoiceChips
                  ariaLabel="เงินเข้าสิ้นเดือน"
                  options={MONTH_END_CHIP}
                  value={form.payEnd ? "end" : null}
                  onChange={() => set({ payEnd: !form.payEnd, payDay: "" })}
                />
              </div>
              <div className={styles.subRow}>
                <span>ของ</span>
                <Segmented
                  ariaLabel="เดือนที่เงินเข้า"
                  options={MONTH_OPTIONS}
                  value={form.monthOffset}
                  onChange={(monthOffset) => set({ monthOffset })}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* 3 · หมายเหตุ */}
        <div className={styles.field}>
          <label htmlFor="billing-rule-note" className={styles.label}>3. หมายเหตุการวางบิล <span className={styles.opt}>ไม่บังคับ</span></label>
          <Textarea
            id="billing-rule-note"
            rows={3}
            maxLength={BILLING_NOTE_MAX}
            placeholder="เช่น แนบสำเนา PO + ใบส่งของ · วางบิลที่แผนกบัญชี ชั้น 3"
            value={form.note}
            onChange={(event) => set({ note: event.target.value })}
          />
        </div>

        {/* ตัวอย่างรอบถัดไป — คิดสด ไม่ใช่ช่องกรอก */}
        <section className={styles.preview} aria-labelledby="billing-rule-preview">
          <div className={styles.previewHead}>
            <CalendarRange size={16} aria-hidden="true" />
            <div>
              <h3 id="billing-rule-preview">{preview.anyday ? "ตัวอย่างการคิดวัน" : "ตัวอย่าง 3 รอบถัดไป"}</h3>
              <p>คิดจากวันนี้ {formatBillingDate(today)} · เปลี่ยนตามที่เลือกด้านบนทันที</p>
            </div>
          </div>
          {rule ? (
            <>
              {preview.anyday ? (
                <p className={styles.previewLead}>วางบิลได้ทุกวัน — ไม่มีรอบให้คิดล่วงหน้า · ถ้าวางบิลวันนี้ ระบบคิดกำหนดชำระแบบนี้</p>
              ) : null}
              <BillingRoundsList rows={preview.rows} />
            </>
          ) : (
            <p className={styles.previewEmpty}>
              <CalendarSearch size={15} aria-hidden="true" />
              <span>เลือก <b>1. วางบิล</b> และ <b>2. เงินเข้า</b> ให้ครบ แล้วรอบถัดไปจะขึ้นตรงนี้</span>
            </p>
          )}
          <p className={styles.previewFoot}>
            ใช้คิดวันให้งวดที่ยังไม่มีวันของใบสั่งขาย · งวดที่ผูกเหตุการณ์ (หลังส่งของ · หลังติดตั้ง · งวดสุดท้าย) ระบบไม่เดาวันให้ · ใบเก่าไม่เติมวันย้อนหลัง · ตรงเสาร์/อาทิตย์ ไม่เลื่อนวัน เตือนอย่างเดียว
          </p>
        </section>
      </div>
    </Modal>
  );
}
