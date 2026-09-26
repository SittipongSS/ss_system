"use client";
// ── โมดัล "ตั้ง/แก้เครดิตและรอบวางบิล" ของลูกค้า (รุ่นสอง · mig 0390 · ม็อก modal-v2/recommended.html) ─────
//
// มติเจ้าของ 26/09 (หลังเห็นโมดัลรุ่นแรกบน prod: "ยังใช้ยาก และยังไม่สวย"):
//   1. แบบแนะนำของม็อก — แตะวันที่จากตาราง 1–30 + "31 · สิ้นเดือน" (ไม่พิมพ์) · เงินเข้าเลือกทีเดียว
//      [เครดิต | เดือนเดียวกัน | เดือนถัดไป] พร้อมบอกวันผลลัพธ์ก่อนกด · วันที่จะผิดกติกากดไม่ได้ ·
//      กล่องผล (ประโยคกติกา + เส้นเวลา + รอบถัดไป) เห็นตลอด · ข้อความเครดิตเดิมสองบรรทัด · หมายเหตุพับไว้ ·
//      เตือนหลังกดบันทึกเท่านั้น · ท้ายโมดัลตรึง
//   2. **เครดิตเป็นสวิตช์ในโมดัลนี้** [ไม่มีเครดิต | มีเครดิต] (ลูกค้าที่ยังไม่ตั้ง = ไม่ติดทั้งสองฝั่ง)
//      ไม่มีเครดิต = `{ credit:false }` ที่เหลือซ่อน · ช่อง "เงื่อนไขเครดิต" แบบพิมพ์อิสระของฟอร์มลูกค้าถูกถอดแล้ว
//      (ข้อความเดิมยังอยู่ในฐาน — โชว์อ่านอย่างเดียวที่แถบบน)
//   3. **วางบิลได้หลายรอบต่อเดือน (≤4)** — แตะวันที่ในข้อ ① = เพิ่ม/ถอดรอบ · ข้อ ② รายเดือนแตกเป็นแถวรายรอบ
//      (รอบเดียวยังเป็นทาง 3 แตะของม็อก: 5 → เดือนเดียวกัน → 25)
// ⭐ สถานะฟอร์ม/ผลของการกดอยู่ที่ `CustomerBillingRuleState.js` (เทสต์ได้) · ด่านบันทึก = `normalizeBillingRule`
//    **ตัวเดียวกับที่ API ใช้ปฏิเสธ** — ปุ่มกับด่านพูดเรื่องเดียวกัน
// ⭐ ปุ่มบันทึกกดได้เสมอ (ม็อก) — กดตอนยังไม่ครบ = ขึ้นเหตุ "ขาดอะไร" ทุกช่องในครั้งเดียวที่ท้ายโมดัล + ธงที่หัวข้อ
// ⚠️ แก้ส่วนนี้ **ไม่ส่งลูกค้ากลับไปรออนุมัติ** — บันทึกผ่านเส้นแยก `/billing-rule` ไม่ใช่ PATCH ของลูกค้า
// ⚠️ ตัดช่อง "ผู้ดูแลการวางบิล (FN)" ของม็อกแรกออก (มติ 26/09 ข้อ 5: กระดิ่งฝั่งบัญชีแจ้งทั้งฝ่าย)
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Ban, CalendarRange, Check, ChevronDown, CircleAlert, CircleDashed, Eraser, Info, MousePointerClick, Plus,
  ShieldCheck, TextQuote, TriangleAlert, Wallet, Zap,
} from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import Textarea from "@/components/ui/Textarea";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { RESPONSE_WARNING_TOAST } from "@/lib/apiWarnings";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { NA } from "@/lib/format";
import { customerNameIn } from "@/lib/master/customerName";
import {
  BILLING_CREDIT_MAX, BILLING_NOTE_MAX, BILLING_ROUNDS_MAX, MONTH_END_DAY, billingRounds, billingRuleOf,
  describeBillingRule, dueDateForBilling, formatBillingDate, formatRoundChip,
} from "@/lib/sales/billingRule";
import { daysBetween } from "@/lib/sales/paymentCoverage";
import {
  activeRoundAfterToggle, applyQuickCredit, chooseBillMode, chooseCredit, choosePay, dayWord, evaluateForm, fixCrossError, formOf,
  gateMessageOf, isMultiRound, nextRoundNeedingDay, payChoiceOf, payDayState, quickCreditOn, roundName,
  roundSameMonthBlocked, roundsOf, sameMonthBlocked, setCreditDays, setPayDay, setRoundMonth, toggleBillDay,
} from "./CustomerBillingRuleState";
import { BillingRoundsList, BillingTimeline, billingPreviewOf } from "./CustomerBillingRuleRounds";
import DayGrid from "./CustomerBillingRuleDayGrid";
import styles from "./CustomerBillingRule.module.css";

/* ทางลัดที่พบบ่อยบน prod (brief ม็อก) — แตะเดียว = มีเครดิต + วางบิลได้ทุกวัน + เครดิต n วัน */
const QUICK_CREDITS = [30, 14];
const CREDIT_CHIPS = [7, 14, 30, 45, 60].map((n) => ({ value: n, label: `${n} วัน` }));

const segLabel = (main, sub) => (
  <span className={styles.segText}>
    <span className={styles.segMain}>{main}</span>
    {sub ? <span className={styles.segSub}>{sub}</span> : null}
  </span>
);
const monthNameOf = (iso) => formatRoundChip(iso).split(" ")[1] || "";
const creditNumber = (text) => {
  if (String(text ?? "") === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= BILLING_CREDIT_MAX ? n : null;
};

/* "วันที่ 5, 15 และสิ้นเดือน" — ชุดวันวางบิลในประโยคเดียว */
function daysPhrase(days) {
  const nums = days.filter((d) => d !== MONTH_END_DAY).map(String);
  const items = days.includes(MONTH_END_DAY) ? [...nums, "สิ้นเดือน"] : nums;
  const text = items.length > 1 ? `${items.slice(0, -1).join(", ")} และ ${items[items.length - 1]}` : items[0] || "";
  return nums.length ? `วันที่ ${text}` : text;
}
const monthWord = (offset) => (offset === 1 ? "เดือนถัดไป" : offset === 0 ? "เดือนเดียวกัน" : "");

/* วันวางบิลของรอบแรกของชุดวัน (ไม่ต้องรู้เงินเข้า) — ตัวคิดของ lib ผ่านรอบลอง "เครดิต 0 วัน" */
const probeRounds = (days, today, count, options) => billingRounds(
  { billing: { mode: "monthly", days }, payment: { mode: "credit", days: 0 } }, today, count, options,
);
/* วันที่ `day` ของเดือนเดียวกับวันวางบิล (ก่อนวันวางบิลได้) — เส้นแดงย้อนหลังของเหตุข้ามช่อง
   ใช้ตัวคิดของ lib: วางบิลได้ทุกวันที่วันที่ 1 ของเดือน ⇒ เงินเข้าวันที่ n ของเดือนนั้นเสมอ (ไม่เลื่อนเดือน) */
const sameMonthDate = (billIso, day) => dueDateForBilling(
  { billing: { mode: "anyday" }, payment: { mode: "monthly", rounds: [{ day, monthOffset: 0 }] } }, `${billIso.slice(0, 8)}01`,
);

/* ป้ายรองของ [เดือนเดียวกัน | เดือนถัดไป] บอกผลก่อนกด (จากม็อก A) — รอบเดียวที่รู้วันวางบิลแล้วเท่านั้น */
function monthSubs(form, round, today) {
  /* หลายรอบ: ใช้กับทุกรอบ (แก้รายรอบต่อที่แถว) — ป้ายสั้น ช่องสามช่องแคบ
     ⭐ "เดือนเดียวกัน" ปิดอยู่ (บางรอบเงินเข้าก่อนวันวางบิล) = ป้ายรองต้องบอกเหตุ — กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุ"
        ป้าย "ทุกรอบ" บนปุ่มที่กดไม่ได้ไม่บอกอะไรเลย (รอบเดียวบอก "ก่อนวันวางบิล" ที่ทางล่างอยู่แล้ว) */
  if (isMultiRound(form)) return { m0: sameMonthBlocked(form) ? "บางรอบเงินเข้าก่อนวันวางบิล" : "ทุกรอบ", m1: "ทุกรอบ" };
  if (round.billDay == null) return { m0: "เดือนที่วางบิล", m1: "เดือนหลังวางบิล" };
  const [first] = probeRounds([round.billDay], today, 1);
  if (!first) return { m0: "เดือนที่วางบิล", m1: "เดือนหลังวางบิล" };
  const due = (day, monthOffset) => dueDateForBilling(
    { billing: { mode: "monthly", days: [round.billDay] }, payment: { mode: "monthly", rounds: [{ day, monthOffset }] } },
    first.billingDate,
  );
  if (round.day == null) {
    return { m0: `เงินเข้าใน ${monthNameOf(first.billingDate)}`, m1: `เงินเข้าใน ${monthNameOf(due(1, 1))}` };
  }
  return {
    m0: round.day < round.billDay ? "ก่อนวันวางบิล" : `เงินเข้า ${formatRoundChip(due(round.day, 0))}`,
    m1: `เงินเข้า ${formatRoundChip(due(round.day, 1))}`,
  };
}

/* หัวข้อขั้น: ✓ ที่ตอบแล้ว · ○ ที่ยังขาด (เทา) · หลังกดบันทึกเป็นสีเตือน */
function StepState({ spec }) {
  if (!spec) return null;
  const [tone, text] = spec;
  const Icon = tone === "ok" ? Check : tone === "muted" ? CircleDashed : CircleAlert;
  return (
    <span className={styles.stepState} data-tone={tone === "ok" ? undefined : tone}>
      <Icon size={14} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

/* ⚠️ ผู้เรียก **mount ตอนเปิดเท่านั้น** (การ์ดวาดเมื่อกดปุ่ม) — ฟอร์มตั้งต้นจากค่าที่บันทึกไว้จริงตั้งแต่เฟรมแรก
   และเปิดใหม่ = เริ่มใหม่เสมอ: ของที่แตะค้างรอบก่อนแล้วกดยกเลิก ไม่ใช่คำตอบของรอบนี้ */
export default function CustomerBillingRuleModal({ open = true, onClose, customer, onSaved }) {
  const [form, setForm] = useState(() => formOf(customer?.billingRule));
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [activeRound, setActiveRound] = useState(0);
  const [noteOpen, setNoteOpen] = useState(() => Boolean(formOf(customer?.billingRule).note));
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyClamped, setLegacyClamped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  /* แถวรายรอบที่เพิ่งกด "เดือนเดียวกัน" ทั้งที่ใช้ไม่ได้ (เก็บเป็นวันวางบิล — ตำแหน่งเลื่อนเมื่อถอดรอบ) */
  const [rowWhy, setRowWhy] = useState(null);
  const legacyRef = useRef(null);
  const creditRef = useRef(null);
  const billRef = useRef(null);
  const payRef = useRef(null);
  const crossRef = useRef(null);
  const asideRef = useRef(null);
  const noteRef = useRef(null);

  const hasRule = Boolean(billingRuleOf(customer?.billingRule));
  const legacy = String(customer?.creditTerms ?? "").trim();
  const today = businessDate();
  const result = evaluateForm(form);
  const gateMessage = tried ? gateMessageOf(result) : "";
  const none = form.credit === "none";
  const multi = isMultiRound(form);
  const rounds = roundsOf(form);
  const active = Math.min(activeRound, rounds.length - 1);
  const activeRoundRow = rounds[active];
  const payChoice = payChoiceOf(form);
  const cross = result.cross;

  /* ข้อความเครดิตเดิม: "ดูทั้งหมด" เฉพาะตอนยาวเกินสองบรรทัด */
  useEffect(() => {
    const el = legacyRef.current;
    if (!el) return undefined;
    const check = () => setLegacyClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [legacy, legacyOpen]);

  /* เลื่อนให้เห็นส่วนที่เพิ่งเปิด — เลื่อนอย่างเดียว ไม่ยกโฟกัส (คีย์บอร์ดมือถือไม่เด้งบังตาราง) */
  const reveal = (ref) => requestAnimationFrame(() => ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }));
  const phone = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;

  const act = (next) => {
    setForm(next);
    setTouched(true);
    setLimitHit(false);
    setRowWhy(null);
  };

  const tapBillDay = (day) => {
    const { form: next, limited } = toggleBillDay(form, day);
    if (limited) {
      setLimitHit(true);
      return;
    }
    act(next);
    /* ตารางวันเงินเข้าชี้รอบด้วยตำแหน่ง — ถอดรอบที่อยู่ก่อนต้องเลื่อนตาม ไม่งั้นแตะวันถัดไปลงรอบผิดเงียบ ๆ */
    setActiveRound(activeRoundAfterToggle(form, next, day, active));
    if (evaluateForm(next).cross) reveal(crossRef);
    else if (!next.payMode && phone()) reveal(payRef);
  };

  const tapPayDay = (day) => {
    const next = setPayDay(form, active, day);
    act(next);
    if (multi) {
      const waiting = nextRoundNeedingDay(next, active);
      if (waiting >= 0) setActiveRound(waiting);
    }
  };

  const send = async (billingRule, { cleared = false } = {}) => {
    setSaving(true);
    setSaveError("");
    try {
      const saved = await apiJson(`/api/master/customers/${encodeURIComponent(customer.id)}/billing-rule`, {
        method: "PATCH",
        json: { billingRule },
        fallbackError: "บันทึกเครดิตและรอบวางบิลไม่สำเร็จ",
      });
      /* `activityLogged` เป็นผลของการกดครั้งนี้ ไม่ใช่ช่องของลูกค้า — ตัดออกก่อนส่งให้หน้าแม่เติมลงแถว */
      const { activityLogged, ...fields } = saved || {};
      if (fields.unchanged) notifyToast.info("ไม่มีช่องไหนเปลี่ยน · ไม่ได้ลงประวัติ");
      /* ⚠️ route ลงแถว "ความเคลื่อนไหว" ไม่สำเร็จ (ค่าบันทึกแล้ว) ⇒ ห้ามบอกว่าลงแล้ว — ป้ายยืนยันการล้างเพิ่งสัญญา
         ไว้ว่า "ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหว" · ทางเดียวที่เหลือให้คนกดเห็นค่าเดิมคือทักนี้ ⇒ พิมพ์ค่าเดิมลงไปเลย
         (`customer` ยังเป็นแถวก่อนบันทึก — หน้าแม่เติมค่าใหม่ตอน onSaved ข้างล่าง) และค้างนานพอให้จดทัน
         ⛔ อย่าชี้ไป "บันทึกการแก้ไขของระบบ" — นั่นคือ audit_logs ที่ฝ่ายขาย/บัญชีเปิดไม่ได้ (ดูหัว `clear` ข้างล่าง) */
      else if (activityLogged === false) {
        const oldRule = describeBillingRule(customer?.billingRule);
        notifyToast.warning(
          `${cleared ? "ล้างเครดิตและรอบวางบิลแล้ว" : "บันทึกเครดิตและรอบวางบิลแล้ว"} · แต่ลงความเคลื่อนไหวของลูกค้าไม่สำเร็จ — ${oldRule ? `ค่าเดิมคือ "${oldRule}" (จดไว้ หรือแจ้งผู้ดูแลระบบ)` : "แจ้งผู้ดูแลระบบ"}`,
          RESPONSE_WARNING_TOAST,
        );
      } else if (cleared) {
        notifyToast.success("ล้างเครดิตและรอบวางบิลแล้ว · ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหว");
      } else {
        notifyToast.success(`${billingRule?.credit === false ? "บันทึกว่า \"ไม่มีเครดิต\" แล้ว" : "บันทึกเครดิตและรอบวางบิลแล้ว"} · ลงความเคลื่อนไหวแล้ว ไม่ต้องขออนุมัติใหม่`);
      }
      onSaved?.(fields);
    } catch (err) {
      setSaveError(err?.message || "บันทึกเครดิตและรอบวางบิลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (saving) return;
    setSaveError("");
    if (!result.rule) {
      setTried(true);
      const billMissing = !form.billMode || (form.billMode === "monthly" && !form.billDays.length);
      reveal(!form.credit ? creditRef : cross ? crossRef : billMissing ? billRef : payRef);
      return;
    }
    send(result.rule);
  };

  /* ล้าง = กลับเป็น "ยังไม่ระบุ" · บอกผลก่อนกด (วันของงวดที่มีอยู่แล้วไม่ขยับ — รอบใช้ตอนเลือกรอบเท่านั้น)
     ⭐ "ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหว" เป็นคำสัญญาที่ระบบทำจริงแล้ว (มติเจ้าของ 26/09 ข้อ 7) — route ลงแถว
        `billing_rule` เดิม → ใหม่ ในเธรดของลูกค้า ซึ่งทุกคนที่เปิดหน้าลูกค้าได้อ่านได้
     ⚠️ อย่าย้อนไปอ้าง "ประวัติการแก้ไข" — นั่นคือ `audit_logs` ที่เปิดได้เฉพาะแอดมิน (/audit · `audit:view`)
        ฝ่ายขาย/บัญชีที่กดปุ่มนี้ดูไม่ได้ ⇒ ป้ายสัญญาสิ่งที่คนกดทำไม่ได้ (form-design-rules §ช่องบังคับ)
     ⚠️ ถ้าวันหนึ่งเลิกลงเธรด ต้องแก้ประโยคนี้ในคอมมิตเดียวกัน (โมดัลเตือนเองเมื่อ route บอกว่าลงไม่สำเร็จ) */
  const clear = async () => {
    const accepted = await confirmAction({
      title: "ล้างเครดิตและรอบวางบิลของลูกค้ารายนี้?",
      description: "กลับเป็น \"ยังไม่ระบุ\" · ใบสั่งขายใหม่จะกลับไปพิมพ์กำหนดชำระเองทีละงวด",
      detail: "· วันวางบิลและกำหนดชำระของงวดที่มีอยู่แล้วไม่เปลี่ยน\n· ค่าเดิมยังดูย้อนได้ในการ์ด \"ความเคลื่อนไหว\" ของลูกค้ารายนี้",
      confirmLabel: "ล้างเป็นยังไม่ระบุ",
      danger: true,
    });
    if (accepted) send(null, { cleared: true });
  };

  /* ── ผลของสิ่งที่เลือก (กล่องขวา · คิดสดจาก lib ไม่ใช่ช่องกรอก) ────────────────────────────── */
  let view = { kind: "ghost", rows: [], strip: null, fix: null };
  if (none) view = { kind: "none", rows: [], strip: null, fix: null };
  else if (result.rule) {
    const preview = billingPreviewOf(result.rule, today);
    view = {
      kind: preview.kind,
      rows: preview.rows,
      strip: preview.rows[0] ? { billingDate: preview.rows[0].billingDate, dueDate: preview.rows[0].dueDate, sample: preview.kind === "anyday" } : null,
      fix: null,
    };
  } else if (form.billMode === "monthly" && form.billDays.length) {
    /* ยังไม่ครบ — วันวางบิลรู้แล้ว เงินเข้าเป็นขีด */
    const rows = probeRounds(form.billDays, today, Math.max(3, form.billDays.length))
      .map((row) => ({ ...row, dueDate: "", gap: null }));
    let strip = rows[0] ? { billingDate: rows[0].billingDate, dueDate: "" } : null;
    let fix = null;
    if (cross) {
      const [bad] = probeRounds(form.billDays, today, 1, { roundIndex: cross.index });
      if (bad) {
        strip = { billingDate: bad.billingDate, dueDate: sameMonthDate(bad.billingDate, cross.payDay), back: true };
        const fixed = evaluateForm(fixCrossError(form)).rule;
        const [good] = fixed ? billingRounds(fixed, today, 1, { roundIndex: cross.index }) : [];
        if (good) fix = good;
      }
    }
    view = { kind: "monthly", rows, strip, fix };
  } else if (form.billMode === "anyday") {
    view = { kind: "anyday", rows: [{ billingDate: today, dueDate: "", gap: null }], strip: { billingDate: today, dueDate: "", sample: true }, fix: null };
  }

  /* ── ประโยคกติกา ○ วางบิล … / ● เงินเข้า … ─────────────────────────────────────────────── */
  const pend = (text) => <><span className={styles.dash}>{NA}</span> <small>{text}</small></>;
  let billText;
  if (form.credit !== "yes" || !form.billMode) billText = pend("เลือกที่ข้อ 1");
  else if (form.billMode === "anyday") billText = <>ได้ทุกวัน <small>ไม่มีรอบ</small></>;
  else if (!form.billDays.length) billText = pend("แตะวันที่ที่ข้อ 1");
  else billText = <>ทุก{daysPhrase(form.billDays)}{multi ? <small> {form.billDays.length} รอบต่อเดือน</small> : null}</>;

  let payText;
  if (form.credit !== "yes" || !form.payMode) payText = pend("เลือกที่ข้อ 2");
  else if (form.payMode === "credit") {
    const n = creditNumber(form.creditDays);
    payText = n === null ? pend("แตะจำนวนวันที่ข้อ 2")
      : n === 0 ? "วันเดียวกับวันวางบิล"
        : <>เครดิต {n} วัน <small>นับจากวันวางบิล{multi ? " · ทุกรอบ" : ""}</small></>;
  } else {
    const same = rounds.every((r) => r.day === rounds[0].day && r.monthOffset === rounds[0].monthOffset);
    const one = (r) => {
      const mo = monthWord(r.monthOffset);
      if (r.day == null) return pend(`แตะวันที่${mo ? ` · ของ${mo}` : ""}`);
      if (r.monthOffset == null) return <>{r.day === MONTH_END_DAY ? "สิ้นเดือน" : `ทุกวันที่ ${r.day}`} <small>เลือกเดือน</small></>;
      return r.day === MONTH_END_DAY ? `สิ้น${mo}` : `ทุกวันที่ ${r.day} ของ${mo}`;
    };
    payText = same || !multi ? one(rounds[0]) : (
      <span className={styles.sentRounds}>
        {rounds.map((r) => (
          <span key={r.billDay}>
            <small>{roundName(r.billDay)} →</small> {r.day == null ? <span className={styles.dash}>{NA}</span> : dayWord(r.day)}{r.monthOffset != null ? <small> {monthWord(r.monthOffset)}</small> : null}
          </span>
        ))}
      </span>
    );
  }

  /* ── หัวข้อขั้น ─────────────────────────────────────────────────────────────────────────── */
  const warnOr = (text) => [tried ? "warn" : "muted", text];
  const creditState = form.credit === "none" ? ["ok", "ไม่มีเครดิต"] : form.credit === "yes" ? ["ok", "มีเครดิต"] : tried ? ["warn", "ยังไม่ได้เลือก"] : null;
  const billState = form.billMode === "anyday" ? ["ok", "ได้ทุกวัน"]
    : form.billMode === "monthly" && form.billDays.length
      ? ["ok", multi ? `${form.billDays.length} รอบต่อเดือน` : `ทุก${dayWord(form.billDays[0])}`]
      : form.billMode === "monthly" ? warnOr("แตะวันที่") : tried ? ["warn", "ยังไม่ได้เลือก"] : null;
  const creditDaysNumber = creditNumber(form.creditDays);
  const creditInvalid = form.payMode === "credit" && form.creditDays !== "" && creditDaysNumber === null;
  const payDone = form.payMode === "credit" ? creditDaysNumber !== null
    : form.payMode === "monthly" && rounds.every((r) => r.day != null && r.monthOffset != null);
  let payState = null;
  if (cross) payState = null;
  else if (payDone) {
    payState = ["ok", form.payMode === "credit" ? `เครดิต ${creditDaysNumber} วัน`
      : multi ? "ครบทุกรอบ" : `${dayWord(rounds[0].day)} ${monthWord(rounds[0].monthOffset)}`];
  } else if (form.payMode === "credit") payState = creditInvalid ? ["danger", `0–${BILLING_CREDIT_MAX} วัน`] : warnOr("แตะจำนวนวัน");
  else if (form.payMode === "monthly") payState = warnOr(multi ? "แตะวันที่ให้ครบทุกรอบ" : "แตะวันที่");
  else if (tried) payState = ["warn", "ยังไม่ได้เลือก"];

  /* ── คำใบ้ใต้ตาราง ─────────────────────────────────────────────────────────────────────── */
  let billHint = null;
  if (limitHit) billHint = { tone: "warn", icon: TriangleAlert, text: `วางบิลได้ไม่เกิน ${BILLING_ROUNDS_MAX} รอบต่อเดือน — แตะวันที่เลือกไว้เพื่อเอาออกก่อน` };
  else if (form.billMode === "anyday") billHint = { icon: Info, text: "ไม่มีรอบ · แตะวันที่ถ้าลูกค้ารับวางบิลเป็นรอบรายเดือน" };
  else if (form.billMode === "monthly" && !form.billDays.length) billHint = { icon: MousePointerClick, text: "แตะวันที่ที่ลูกค้ารับวางบิลทุกเดือน" };
  else if (form.billMode === "monthly") {
    const tail = form.billDays.some((d) => d >= 29) ? " · เดือนที่ไม่มีวันนั้น (เช่น ก.พ.) ใช้วันสุดท้ายของเดือน" : "";
    billHint = {
      icon: Info,
      text: form.billDays.length < BILLING_ROUNDS_MAX
        ? `มีหลายรอบต่อเดือน แตะเพิ่มได้ถึง ${BILLING_ROUNDS_MAX} วัน · แตะซ้ำเพื่อเอาออก${tail}`
        : `ครบ ${BILLING_ROUNDS_MAX} รอบแล้ว · แตะซ้ำเพื่อเอาออก${tail}`,
    };
  }
  let payHint = null;
  if (form.payMode === "monthly" && !cross && activeRoundRow) {
    const parts = [];
    if (activeRoundRow.monthOffset === 0 && activeRoundRow.billDay > 1) {
      parts.push(`ก่อน${dayWord(activeRoundRow.billDay)} ใช้ไม่ได้ในเดือนเดียวกัน (ขีดใต้ = วันวางบิล) — ใช้ "เดือนถัดไป"`);
    } else if (activeRoundRow.day == null) parts.push("แตะวันที่ที่เงินเข้า");
    if (activeRoundRow.day >= 29) parts.push("เดือนที่ไม่มีวันนั้น ใช้วันสุดท้ายของเดือน");
    if (parts.length) payHint = parts.join(" · ");
  }

  const subs = monthSubs(form, rounds[0], today);
  const blockM0 = sameMonthBlocked(form);
  const badM0 = Boolean(cross) && payChoice === "m0";
  const payStateOf = (round) => (day) => {
    const state = payDayState(round, day);
    return { ...state, title: state.blocked ? "ก่อนวันวางบิล — เลือก \"เดือนถัดไป\" ถ้าเงินเข้าช่วงนี้" : undefined };
  };

  /* ── ท้าย: ไม่มีเตือนจนกว่าจะกดบันทึก · ระหว่างกรอกบอก "เหลือ" แบบเรียบ ──────────────────────── */
  const pending = !gateMessage && touched && !none && result.missing.length ? `เหลือ ${result.missing.join(" · ")}` : "";
  const first = view.rows[0];
  const subject = [customer?.arCode, customer ? customerNameIn(customer) : ""].filter(Boolean).join(" · ");

  const toolbar = legacy ? (
    <div className={styles.legacy}>
      <span className={styles.legacyKey}><TextQuote size={14} aria-hidden="true" />เงื่อนไขเครดิตเดิม</span>
      <p
        ref={legacyRef}
        id="billing-rule-legacy"
        className={styles.legacyText}
        data-open={legacyOpen ? "1" : undefined}
        title="ข้อความเดิม · อ่านอย่างเดียว · ระบบไม่แปลงเป็นรอบให้"
      >
        {legacy}
      </p>
      {legacyClamped || legacyOpen ? (
        <Button
          variant="quiet"
          size="sm"
          className={styles.legacyMore}
          aria-expanded={legacyOpen}
          aria-controls="billing-rule-legacy"
          onClick={() => setLegacyOpen((v) => !v)}
        >
          {legacyOpen ? "ย่อ" : "ดูทั้งหมด"}
        </Button>
      ) : null}
    </div>
  ) : null;

  /* ⭐ บันทึกไม่สำเร็จ = ขึ้นที่ท้ายโมดัล (ตรึงอยู่ใต้นิ้วเสมอ) ไม่ใช่หัวคอลัมน์ขั้น — มือถือ (แผ่นเต็มจอ) คนกดอยู่ที่ปุ่ม
        ข้อความบนสุดของรายการเลื่อนไม่เห็น ⇒ ปุ่มแค่กลับจาก "กำลังบันทึก…" เป็น "บันทึก" เงียบ ๆ
        (เคสแรกที่น่าจะเจอ: ดีพลอยก่อนรัน 0390 = 503 ทุกครั้ง) · จอกว้างขึ้นที่บรรทัดเหตุ · จอแคบขึ้นในแถบสรุป */
  const saveErrorText = saveError ? (/ไม่สำเร็จ/.test(saveError) ? saveError : `บันทึกไม่สำเร็จ — ${saveError}`) : "";
  const footer = (
    <div className={styles.foot}>
      {/* จอแคบ: แถบสรุปบรรทัดเดียว (กล่องผลอยู่ใต้ข้อ ②) · live region เดียวของโมดัล — สั้น ไม่อ่านทั้งกล่องผลซ้ำทุกแตะ */}
      <div
        className={styles.sum}
        data-tone={saveErrorText ? "danger" : gateMessage ? "warn" : (view.kind === "ghost" || (!result.rule && !none)) ? "muted" : undefined}
        aria-live="polite"
      >
        {saveErrorText ? (
          <><CircleAlert size={14} aria-hidden="true" /><span className={styles.sumText}>{saveErrorText}</span></>
        ) : gateMessage ? (
          <><TriangleAlert size={14} aria-hidden="true" /><span className={styles.sumText}>{gateMessage}</span></>
        ) : none ? (
          <><Ban size={14} aria-hidden="true" /><span className={styles.sumText}>ไม่มีเครดิต · ชำระก่อนหรือพร้อมสั่ง</span></>
        ) : result.rule && first ? (
          <>
            <span className={styles.sumKey}>{view.kind === "anyday" ? "เช่น" : "รอบถัดไป"}</span>
            <span className={styles.sumValue}>
              <span className={styles.node} aria-hidden="true" />{formatBillingDate(first.billingDate, { withYear: false })}
              <span className={styles.sumTo}>→</span>
              <span className={`${styles.node} ${styles.nodeFill}`} aria-hidden="true" />{first.dueDate ? formatBillingDate(first.dueDate, { withYear: false }) : NA}
            </span>
            <button type="button" className={styles.sumGo} onClick={() => asideRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}>
              {view.kind === "anyday" ? "ดูภาพ" : `ดู ${view.rows.length} รอบ`}<ChevronDown size={14} aria-hidden="true" />
            </button>
          </>
        ) : (
          <><CalendarRange size={14} aria-hidden="true" /><span className={styles.sumText}>{pending || "เลือกเครดิต วางบิล และเงินเข้า แล้วรอบถัดไปจะขึ้นตรงนี้"}</span></>
        )}
      </div>
      <div className={styles.footInfo}>
        {saveErrorText ? (
          <p className={styles.status} role="status" data-tone="danger">
            <CircleAlert size={14} aria-hidden="true" /><span>{saveErrorText}</span>
          </p>
        ) : gateMessage || pending ? (
          <p className={styles.status} role="status" data-tone={gateMessage ? "warn" : "muted"}>
            {gateMessage ? <TriangleAlert size={14} aria-hidden="true" /> : <CircleDashed size={14} aria-hidden="true" />}
            <span>{gateMessage || pending}</span>
          </p>
        ) : null}
        <p className={styles.shield}><ShieldCheck size={14} aria-hidden="true" />แก้ส่วนนี้ไม่ต้องขออนุมัติใหม่ · ลงความเคลื่อนไหวของลูกค้า</p>
      </div>
      <div className={styles.footActions}>
        {hasRule ? (
          <Button tone="neutral" variant="quiet" icon={<Eraser size={15} aria-hidden="true" />} disabled={saving} onClick={clear}>
            <span className={styles.clearLong}>ล้างเป็นยังไม่ระบุ</span><span className={styles.clearShort}>ล้างค่า</span>
          </Button>
        ) : null}
        <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button tone="primary" className={styles.saveBtn} icon={<Check size={15} aria-hidden="true" />} disabled={saving} onClick={save}>
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      sheetOnPhone
      title={hasRule ? "แก้เครดิตและรอบวางบิล" : "ตั้งเครดิตและรอบวางบิล"}
      subtitle={subject}
      toolbar={toolbar}
      footer={footer}
    >
      <div className={styles.layout} data-none={none ? "1" : undefined}>
        <div className={styles.steps}>
          {/* เครดิต — สวิตช์บนสุด (มติ 26/09 ข้อ 2) · ยังไม่ตั้ง = ไม่ติดทั้งสองฝั่ง */}
          <section ref={creditRef} className={`${styles.step} ${styles.stepCredit}`} aria-labelledby="billing-rule-credit-h">
            <div className={styles.stepHead}>
              <span className={styles.stepIcon} aria-hidden="true"><Wallet size={13} /></span>
              <h4 id="billing-rule-credit-h">เครดิต</h4>
              <StepState spec={creditState} />
            </div>
            <Segmented
              ariaLabel="เครดิต"
              className={`${styles.seg} ${tried && !form.credit ? styles.segFlag : ""}`}
              options={[
                { value: "none", label: segLabel("ไม่มีเครดิต", "ชำระก่อนหรือพร้อมสั่ง") },
                { value: "yes", label: segLabel("มีเครดิต", "วางบิลแล้วรอเงินเข้า") },
              ]}
              value={form.credit}
              onChange={(credit) => act(chooseCredit(form, credit))}
            />
          </section>

          {none ? null : (
            <>
              {/* ทางลัด (ม็อก B): เครดิตที่พบบ่อยบน prod · แตะเดียวได้ทั้งสองข้อ — คนแตะเอง ไม่ใช่ค่าตั้งต้น */}
              <div className={styles.quick} role="group" aria-label="ทางลัด">
                <span className={styles.quickKey}><Zap size={13} aria-hidden="true" />ทางลัด</span>
                <div className="choice-chips">
                  {QUICK_CREDITS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={`choice-chip ${styles.quickChip}`}
                      data-ghost="1"
                      data-on={quickCreditOn(form, days) ? "1" : undefined}
                      aria-pressed={quickCreditOn(form, days)}
                      onClick={() => act(applyQuickCredit(form, days))}
                    >
                      เครดิต {days} วัน
                    </button>
                  ))}
                </div>
                <span className={styles.quickNote}>+ วางบิลได้ทุกวัน</span>
              </div>

              {/* ① วางบิล */}
              <section ref={billRef} className={styles.step} aria-labelledby="billing-rule-bill-h">
                <div className={styles.stepHead}>
                  <span className={styles.stepNo} aria-hidden="true">1</span>
                  <h4 id="billing-rule-bill-h">วางบิล</h4>
                  <StepState spec={billState} />
                </div>
                <Segmented
                  ariaLabel="วางบิล"
                  className={`${styles.seg} ${tried && !form.billMode ? styles.segFlag : ""}`}
                  options={[
                    { value: "anyday", label: segLabel("ได้ทุกวัน", "ไม่มีรอบ") },
                    { value: "monthly", label: segLabel("ทุกเดือน", `แตะวันที่ด้านล่าง · ได้ถึง ${BILLING_ROUNDS_MAX} รอบ`) },
                  ]}
                  value={form.billMode}
                  onChange={(mode) => act(chooseBillMode(form, mode))}
                />
                <DayGrid
                  ariaLabel="วันที่วางบิลของทุกเดือน (แตะได้หลายวัน)"
                  multiple
                  value={form.billDays}
                  dim={form.billMode === "anyday"}
                  onPick={tapBillDay}
                />
                {billHint ? (
                  <p className={styles.hint} data-tone={billHint.tone} role={billHint.tone ? "status" : undefined}>
                    <billHint.icon size={13} aria-hidden="true" /><span>{billHint.text}</span>
                  </p>
                ) : null}
              </section>

              {/* ② เงินเข้า */}
              <section ref={payRef} className={`${styles.step} ${styles.stepPay}`} aria-labelledby="billing-rule-pay-h">
                <div className={styles.stepHead}>
                  <span className={styles.stepNo} aria-hidden="true">2</span>
                  <h4 id="billing-rule-pay-h">เงินเข้า</h4>
                  <StepState spec={payState} />
                </div>
                <Segmented
                  ariaLabel="เงินเข้า"
                  className={`${styles.seg} ${styles.seg3} ${tried && !form.payMode ? styles.segFlag : ""} ${badM0 ? styles.segBadM0 : ""}`}
                  options={[
                    { value: "credit", label: segLabel("เครดิต", "นับจากวันวางบิล") },
                    { value: "m0", label: segLabel("เดือนเดียวกัน", subs.m0), disabled: blockM0 },
                    { value: "m1", label: segLabel("เดือนถัดไป", subs.m1) },
                  ]}
                  value={payChoice}
                  onChange={(choice) => {
                    act(choosePay(form, choice));
                    if (choice !== "credit" && multi) setActiveRound(Math.max(0, nextRoundNeedingDay(form)));
                  }}
                />

                {cross ? (
                  <div ref={crossRef} className={styles.crossError} role="alert">
                    <TriangleAlert size={16} aria-hidden="true" />
                    <p>
                      <b>เงินเข้า{dayWord(cross.payDay)} มาก่อนวางบิล{dayWord(cross.billDay)}</b> ถ้าเป็นเดือนเดียวกัน
                      {multi ? ` (${roundName(cross.billDay)})` : ""}
                    </p>
                    <Button size="sm" tone="neutral" icon={<ArrowRight size={14} aria-hidden="true" />} onClick={() => act(fixCrossError(form))}>
                      เปลี่ยนเป็นเดือนถัดไป
                    </Button>
                  </div>
                ) : null}

                {form.payMode === "credit" ? (
                  <div className={styles.creditPay}>
                    <div className={styles.creditChips}>
                      <ChoiceChips
                        ariaLabel="จำนวนวันเครดิต"
                        options={CREDIT_CHIPS}
                        value={creditDaysNumber}
                        onChange={(days) => act(setCreditDays(form, String(days)))}
                      />
                    </div>
                    <div className={styles.creditRow}>
                      <label htmlFor="billing-rule-credit-days">หรือพิมพ์</label>
                      <Input
                        id="billing-rule-credit-days"
                        className={styles.num}
                        inputMode="numeric"
                        maxLength={3}
                        autoComplete="off"
                        placeholder={`0–${BILLING_CREDIT_MAX}`}
                        invalid={creditInvalid}
                        value={form.creditDays}
                        onChange={(event) => act(setCreditDays(form, event.target.value))}
                      />
                      <span>วัน · 0 = ชำระวันเดียวกับวันวางบิล{multi ? " · ใช้กับทุกรอบ" : ""}</span>
                    </div>
                  </div>
                ) : null}

                {form.payMode === "monthly" ? (
                  <>
                    {multi ? (
                      <ol className={styles.payRows} aria-label="เงินเข้ารายรอบ">
                        {rounds.map((round, index) => {
                          /* ⭐ "เดือนเดียวกัน" ของแถวที่ใช้ไม่ได้ = โชว์จาง แต่กดได้ แล้วบอกเหตุใต้แถว (กติกา "ปุ่มกดไม่ได้ =
                                โชว์เสมอ บอกเหตุตอนกด") — `disabled` จริงกดแล้วเงียบ และเหตุใน title มือถือไม่เห็น */
                          const m0Blocked = roundSameMonthBlocked(round);
                          return (
                            <li
                              key={round.billDay}
                              data-active={index === active ? "1" : undefined}
                              data-bad={cross?.index === index ? "1" : undefined}
                              data-m0-blocked={m0Blocked ? "1" : undefined}
                            >
                              <span className={styles.payRowName}><span className={styles.node} aria-hidden="true" />{roundName(round.billDay)}</span>
                              <ArrowRight size={13} className={styles.payRowArrow} aria-hidden="true" />
                              <span>เงินเข้า</span>
                              <button
                                type="button"
                                className={`choice-chip ${styles.payRowDay}`}
                                data-on={index === active ? "1" : undefined}
                                aria-pressed={index === active}
                                aria-label={`เลือกวันเงินเข้าของ${roundName(round.billDay)}${round.day != null ? ` (ตอนนี้ ${dayWord(round.day)})` : ""}`}
                                onClick={() => setActiveRound(index)}
                              >
                                {round.day != null ? dayWord(round.day) : "เลือกวัน"}
                              </button>
                              <Segmented
                                ariaLabel={`เดือนที่เงินเข้าของ${roundName(round.billDay)}`}
                                className={styles.miniSeg}
                                options={[
                                  {
                                    value: 0,
                                    label: "เดือนเดียวกัน",
                                    ariaLabel: m0Blocked ? "เดือนเดียวกัน — ใช้ไม่ได้ เงินเข้าก่อนวันวางบิล" : undefined,
                                    title: m0Blocked ? "เงินเข้าก่อนวันวางบิล — ใช้เดือนเดียวกันไม่ได้" : undefined,
                                  },
                                  { value: 1, label: "ถัดไป" },
                                ]}
                                value={round.monthOffset}
                                onChange={(offset) => {
                                  setActiveRound(index);
                                  if (offset === 0 && m0Blocked) {
                                    setRowWhy(round.billDay);
                                    return;
                                  }
                                  act(setRoundMonth(form, index, offset));
                                }}
                              />
                              {m0Blocked && rowWhy === round.billDay ? (
                                <p className={styles.payRowWhy} role="status">
                                  <Info size={13} aria-hidden="true" />
                                  <span>
                                    เงินเข้า{dayWord(round.day)} มาก่อนวางบิล{dayWord(round.billDay)} — เดือนเดียวกันใช้ไม่ได้ ·
                                    ถ้าเงินเข้าเดือนเดียวกันจริง แตะวันเงินเข้าใหม่ที่ตารางด้านล่างก่อน
                                  </span>
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                    {multi && activeRoundRow ? (
                      <p className={styles.gridCaption}>วันเงินเข้าของ <b>{roundName(activeRoundRow.billDay)}</b></p>
                    ) : null}
                    <DayGrid
                      ariaLabel={multi && activeRoundRow ? `วันที่เงินเข้าของ${roundName(activeRoundRow.billDay)}` : "วันที่เงินเข้า"}
                      value={activeRoundRow?.day ?? null}
                      stateOf={payStateOf(activeRoundRow)}
                      onPick={tapPayDay}
                    />
                    {payHint ? <p className={styles.hint}><Info size={13} aria-hidden="true" /><span>{payHint}</span></p> : null}
                  </>
                ) : null}
              </section>
            </>
          )}
        </div>

        {/* ผลของสิ่งที่เลือก — คิดสด ไม่ใช่ช่องกรอก · จอกว้างตรึงข้างขวา · จอแคบต่อใต้ข้อ ②
            ⚠️ ไม่ใส่ aria-live ที่กล่องนี้ — ประโยค + เส้นเวลา (aria-label ยาว) + รายการรอบ = อ่านเกือบทั้งกล่องซ้ำทุกแตะ
               ซ้อนกับแถบสรุปท้ายโมดัลอีกชั้น · live region มีที่เดียวคือท้ายโมดัล */}
        <aside ref={asideRef} className={styles.aside} aria-label="ผลของสิ่งที่เลือก">
          {view.kind === "none" ? (
            <div className={styles.noneBox}>
              <p className={styles.noneTitle}><Ban size={18} aria-hidden="true" />ไม่มีเครดิต</p>
              <ul>
                <li>ลูกค้าชำระก่อนหรือพร้อมสั่ง</li>
                <li>ใบสั่งขายกรอกกำหนดชำระเองทีละงวด — ไม่มีวันวางบิลและปุ่มเติมตามรอบ</li>
                <li>ไม่มีกระดิ่งเตือนก่อนถึงรอบวางบิล</li>
              </ul>
              <p className={styles.visFoot}>ลูกค้าเริ่มให้เครดิตเมื่อไร เปลี่ยนเป็น &quot;มีเครดิต&quot; ได้ทุกเมื่อ · ไม่ต้องขออนุมัติใหม่</p>
            </div>
          ) : (
            <>
              <div className={styles.sent}>
                <div className={`${styles.sentLine} ${styles.sentBill}`}>
                  <span className={styles.node} aria-hidden="true" />
                  <span className={styles.sentKey}>วางบิล</span>
                  <span className={styles.sentValue}>{billText}</span>
                </div>
                <div className={styles.sentLine}>
                  <span className={`${styles.node} ${styles.nodeFill}`} aria-hidden="true" />
                  <span className={styles.sentKey}>เงินเข้า</span>
                  <span className={styles.sentValue}>{payText}</span>
                </div>
              </div>
              <div className={styles.rhead}>
                <h4><CalendarRange size={15} aria-hidden="true" />{view.kind === "anyday" ? "ตัวอย่างการคิดวัน" : `${view.kind === "ghost" ? 3 : view.rows.length} รอบถัดไป`}</h4>
                <span className={styles.today}>คิดจากวันนี้ {formatBillingDate(today)}</span>
              </div>
              {view.kind === "anyday" ? (
                <p className={styles.lead}>
                  ไม่มีรอบ — {result.rule?.payment?.mode === "credit"
                    ? <>วางบิลวันไหน เงินเข้าอีก <b>{result.rule.payment.days} วัน</b> เช่น</>
                    : "วางบิลวันไหน ระบบคิดวันเงินเข้าจากวันนั้น เช่น"}
                </p>
              ) : null}
              {view.kind === "ghost" || !view.strip ? <BillingTimeline ghost /> : <BillingTimeline {...view.strip} />}
              {view.kind === "ghost" ? <BillingRoundsList ghost /> : <BillingRoundsList rows={view.rows} />}
              {view.fix ? (
                <p className={styles.fix}>
                  ถ้าเปลี่ยนเป็น <b>เดือนถัดไป</b> — รอบแรก{" "}
                  <span className={styles.nowrap}>วางบิล <b>{formatBillingDate(view.fix.billingDate, { withYear: false })}</b></span>{" → "}
                  <span className={styles.nowrap}>เงินเข้า <b>{formatBillingDate(view.fix.dueDate, { withYear: false })}</b></span>{" · "}
                  <span className={styles.nowrap}>ห่าง {daysBetween(view.fix.billingDate, view.fix.dueDate)} วัน</span>
                </p>
              ) : null}
              <p className={styles.visFoot}>
                {result.rule
                  ? "ตรงเสาร์/อาทิตย์ไม่เลื่อนวัน เตือนอย่างเดียว · ใช้เติมวันให้งวดของใบสั่งขายที่ยังไม่มีวัน · ใบเก่าไม่เติมย้อนหลัง"
                  : "วันจริงขึ้นตรงนี้ทันทีที่เลือกข้อ 1 และ 2"}
              </p>
            </>
          )}
        </aside>

        <div className={styles.extra}>
          {noteOpen ? (
            <div className={styles.noteField}>
              <label className={styles.noteKey} htmlFor="billing-rule-note">หมายเหตุการวางบิล <span className={styles.opt}>ไม่บังคับ</span></label>
              <Textarea
                ref={noteRef}
                id="billing-rule-note"
                rows={3}
                maxLength={BILLING_NOTE_MAX}
                placeholder="เช่น แนบสำเนา PO + ใบส่งของ · วางบิลที่แผนกบัญชี ชั้น 3"
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
          ) : (
            <Button
              variant="quiet"
              size="sm"
              className={styles.noteAdd}
              icon={<Plus size={14} aria-hidden="true" />}
              onClick={() => { setNoteOpen(true); requestAnimationFrame(() => noteRef.current?.focus()); }}
            >
              หมายเหตุการวางบิล <span className={styles.opt}>ไม่บังคับ</span>
            </Button>
          )}
          <p className={`${styles.shield} ${styles.shieldBody}`}><ShieldCheck size={14} aria-hidden="true" />แก้ส่วนนี้ไม่ต้องขออนุมัติใหม่ · ลงความเคลื่อนไหวของลูกค้า</p>
        </div>
      </div>
    </Modal>
  );
}
