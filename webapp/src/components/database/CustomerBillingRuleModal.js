"use client";
// ── โมดัล "ตั้ง/แก้การวางบิลและกำหนดชำระ" ของลูกค้า (รุ่นสี่ · mig 0393 · แบบ A "ประโยคนโยบาย" · มติเจ้าของ 29/09) ─────
//
// ม็อก: mockups/billing-cycle/rework-v4/recommended.html (`?view=cust&cust=b&modal=setup`) — โมดัลเดิมของ prod + ข้อ ① ไว้หน้าสุด
//   ① ต้องวางบิลไหม [ต้องวางบิล | ไม่ต้องวางบิล | ยังไม่ระบุ] — **ไม่มีค่าตั้งต้น** (รูปเดิม { credit:false } เปิดมา = ยังไม่ตอบ)
//   ② วางบิลได้เมื่อไร [ทุกวัน | ทุกวันที่… 1–4 รอบ + สิ้นเดือน | ตามปฏิทินลูกค้า] — ข้ามได้ = "ต้องวางบิล · ยังไม่ตั้งรอบ"
//      ⭐ ตามปฏิทินลูกค้า (รุ่นห้า · มติ 29/09 · ม็อก calendar-v3/recommended.html + rework-v4 `modal=setup` ของ AR-281):
//         เวลาตัดรอบ (ไม่บังคับ) + ตารางรอบจ่ายรายปี `billingCalendar/CalendarEditor` (แท็บปี · ร่างจากรอบประจำ · ตรงกับรูป ·
//         ปฏิทินเล็ก อา–ส · รูปของลูกค้าข้างตาราง) — โมดัลกว้างขึ้น ผลก่อนบันทึกย้ายลงใต้ข้อ ③ (ข้างตารางเป็นที่ของรูป)
//   ③ กำหนดชำระเมื่อไร [ชำระวันวางบิล | เครดิต N วัน | ตามรอบจ่าย/วันจ่ายประจำ (รายเดือน)]
//      ปฏิทิน: "วันจ่ายตามปฏิทิน" [วันจ่ายของรอบเดียวกัน | ครบเครดิต N วันแล้วเข้ารอบจ่าย] — **ไม่มีค่าตั้งต้น** (Q1 มีเมตตา 0 หรือ 30 ยังเปิด)
//   ขวา: ผลก่อนบันทึก 3 รอบ (`policyPreview` ตัวเดียวกับการ์ด) + การเตือนที่จะได้ · ท้าย: ใครแก้ล่าสุด + ตัวล็อก
//   ⚠️ ปฏิทินหมดก่อนครบ 3 รอบ = บรรทัด "ยังไม่มีปฏิทิน YYYY · ใส่วันเองได้" (Q3 หยุดรอ) — ไม่มีแถว "ประมาณการ"
// ⭐ ด่านบันทึก = `evaluateForm` → `normalizeRule(…, { allowLegacy:false })` **ตัวเดียวกับที่ API ใช้ปฏิเสธ** — ปุ่มกับด่านพูดเรื่องเดียวกัน
// ⭐ ตัวล็อก (§7.1): ส่ง `baseUpdatedAt` = สตริงดิบของ `billingRuleUpdatedAt` ตอนเปิด · 409 = **ไม่ทิ้งที่กรอก** —
//    บอกว่าใครบันทึกอะไรไว้ แล้วให้เลือก "ใช้ค่าที่เขาบันทึก" หรือ "บันทึกของฉันทับ" (ส่งซ้ำด้วยตัวล็อกใหม่)
// ⭐ บันทึกแล้ว **ระบบไม่ย้ายวันของงวดเอง** — API คืน `ruleChange` (planRuleChange ของงวดเปิดทุกใบ) ⇒ ผู้เรียก (การ์ด)
//    เปิดจอ "งวดที่วันจะเปลี่ยน" (`CustomerBillingRuleRedate`) ให้คนเลือกยืนยัน
// ⚠️ แก้ส่วนนี้ **ไม่ส่งลูกค้ากลับไปรออนุมัติ** — บันทึกผ่านเส้นแยก `/billing-rule` ไม่ใช่ PATCH ของลูกค้า · SA ทีมที่ดูแล + FN
// ⚠️ ฐานยังไม่รัน 0393 (`customer.billingSkipReady === false`) = กติการุ่นสี่บันทึกไม่ได้ (CHECK รุ่นสองตีกลับ) ⇒ บอกเหตุที่ปุ่ม
//    ล้างเป็น "ยังไม่ระบุ" ยังบันทึกได้ (null ผ่าน CHECK ทุกรุ่น)
// ⚠️ ผู้เรียก **mount ตอนเปิดเท่านั้น** — ฟอร์มตั้งต้นจากค่าที่บันทึกไว้ทุกครั้งที่เปิด (กดยกเลิกแล้วเปิดใหม่ = เริ่มใหม่)
import { useEffect, useRef, useState } from "react";
import {
  AlarmClock, BellRing, CalendarX2, CircleAlert, CircleCheck, CircleDashed, History, Info, MousePointerClick, ShieldCheck, TriangleAlert,
} from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import OptionTiles from "@/components/ui/OptionTiles";
import Segmented from "@/components/ui/Segmented";
import Textarea from "@/components/ui/Textarea";
import { apiJson } from "@/lib/apiFetch";
import { RESPONSE_WARNING_TOAST } from "@/lib/apiWarnings";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { customerNameIn } from "@/lib/master/customerName";
import {
  CREDIT_MAX, NOTE_MAX, NO_CREDIT_TEXT, NO_TIMING_TEXT, ROUNDS_MAX, UNKNOWN_TEXT, calendarStatus, describeRule, fmtDate, hasTiming,
  policyPreview, ruleOf, sourceLabel,
} from "@/lib/sales/billingRule";
import {
  CREDIT_CHIPS, calendarCountOf, calendarUpcomingRuns, chooseBill, chooseCalPay, chooseNeed, choosePay, clearTiming, conflictOf,
  creditNumber, cutoffBellPreviewOf, dayWord, evaluateForm, formFromStored, formWordsOf, nextRoundNeedingDay, payDayStateOf,
  policyWordsOf, reminderChipsOf, roundName, sameMonthBlocked, saveBlockOf, savePayloadOf, setCalCreditDays, setCreditDays, setCutoffTime,
  setRoundDay, setRoundOff, stampTextOf, toggleBillDay, togglePayDay, updateCalendar,
} from "./CustomerBillingRuleState";
import { PairList, PolicySentence, ReminderChips } from "./CustomerBillingRuleRounds";
import DayGrid from "./CustomerBillingRuleDayGrid";
import CalendarEditor from "./billingCalendar/CalendarEditor";
import CutoffTimeField from "./billingCalendar/CutoffTimeField";
import useHolidayMap from "@/lib/useHolidayMap";
import styles from "./CustomerBillingRule.module.css";

const NEED_OPTIONS = [
  { value: "required", label: "ต้องวางบิล", description: "ส่งใบวางบิลก่อนได้เงิน · มีวันวางบิล → กำหนดชำระ" },
  { value: "none", label: "ไม่ต้องวางบิล", description: "โอนตามงวด / จ่ายหน้างาน · ติดตามแค่กำหนดชำระ" },
  { value: "unknown", label: "ยังไม่ระบุ", description: "ถามตอนตั้งวันงวดครั้งแรก · กรอกได้ทั้งสองช่อง" },
];

const segLabel = (main, sub) => (
  <span className={styles.segText}>
    <span className={styles.segMain}>{main}</span>
    {sub ? <span className={styles.segSub}>{sub}</span> : null}
  </span>
);

/* หัวข้อของข้อ — เลขในวง (ตอบแล้ว = ✓) · ข้อที่ไม่ต้องตอบ = จาง พร้อมเหตุ */
function StepHead({ n, title, sub, done, id }) {
  return (
    <header className={styles.qHead}>
      <span className={styles.qNo} data-done={done ? "1" : undefined} aria-hidden="true">{done ? "✓" : n}</span>
      <div>
        <h3 id={id}>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </div>
    </header>
  );
}

export default function CustomerBillingRuleModal({ open = true, onClose, customer, onSaved, onSynced, calendarYear = null }) {
  const [form, setForm] = useState(() => formFromStored(customer?.billingRule));
  /* วันหยุดในระบบ — เครื่องหมายบนปฏิทินเล็ก · ชิปวันทำงานของร่าง · ตัวอย่างกระดิ่ง (เตือนอย่างเดียว ไม่เลื่อนวัน) */
  const holidays = useHolidayMap();
  /* ค่าที่เชื่อว่าเก็บอยู่ + ตัวล็อก — เปลี่ยนเมื่อ 409 บอกค่าล่าสุดมา (ฟอร์มไม่ถูกแตะ) */
  const [stored, setStored] = useState(() => customer?.billingRule ?? null);
  const [base, setBase] = useState(() => ({
    at: customer?.billingRuleUpdatedAt ?? null,
    by: customer?.billingRuleUpdatedByName ?? "",
  }));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(null);
  const [limitHit, setLimitHit] = useState("");
  const [activeRound, setActiveRound] = useState(0);
  const [rowWhy, setRowWhy] = useState(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [legacyClamped, setLegacyClamped] = useState(false);
  const legacyRef = useRef(null);
  const q1Ref = useRef(null);
  const q2Ref = useRef(null);
  const q3Ref = useRef(null);

  const today = businessDate();
  const legacyTerms = String(customer?.creditTerms ?? "").trim();
  const result = evaluateForm(form);
  const block = saveBlockOf(result, customer?.billingSkipReady);
  const ready = result.rule !== undefined;
  const words = ready ? policyWordsOf(result.clear ? null : result.rule) : formWordsOf(form);
  const storedRule = ruleOf(stored);
  const firstSet = !storedRule || storedRule.legacyNoCredit;
  const rounds = form.days.map((_, i) => form.rounds[i] || { day: null, off: null });
  const active = Math.max(0, Math.min(activeRound, rounds.length - 1));
  const subject = [customer?.arCode, customer ? customerNameIn(customer) : ""].filter(Boolean).join(" · ");

  /* ข้อความเครดิตเดิม: "ดูทั้งหมด" เฉพาะตอนยาวเกินสองบรรทัด */
  useEffect(() => {
    const el = legacyRef.current;
    if (!el) return undefined;
    const check = () => setLegacyClamped(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [legacyTerms, legacyOpen]);

  /* เลื่อนให้เห็นข้อนั้น — เลื่อนอย่างเดียว ไม่ยกโฟกัส (คีย์บอร์ดมือถือไม่เด้งบังตาราง) */
  const goto = (n) => {
    const ref = n === 3 ? q3Ref : n === 2 ? q2Ref : q1Ref;
    requestAnimationFrame(() => ref.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  };

  const act = (next) => {
    setForm(next);
    setLimitHit("");
    setRowWhy(null);
    setSaveError("");
  };
  /* ตารางปฏิทิน — ตัวแก้ส่งตัวปรับ (prev → next) มา ⇒ ปรับบนฟอร์มล่าสุดเสมอ (พิมพ์เร็ว/แตะวันติดกันไม่ทับกันเอง) */
  const editCalendar = (fn) => {
    setForm((prev) => updateCalendar(prev, fn));
    setSaveError("");
  };

  /* การ์ด "ใส่ปฏิทิน 2027" เปิดโมดัลมาที่แท็บปีนั้น — เลื่อนไปข้อ ② ครั้งเดียวตอนเปิด */
  useEffect(() => {
    if (!calendarYear) return;
    requestAnimationFrame(() => q2Ref.current?.scrollIntoView?.({ block: "start" }));
  }, [calendarYear]);

  const tapBillDay = (day) => {
    const { form: next, limited } = toggleBillDay(form, day);
    if (limited) { setLimitHit("bill"); return; }
    act(next);
    const waiting = nextRoundNeedingDay(next);
    setActiveRound(waiting >= 0 ? waiting : Math.min(active, Math.max(0, next.days.length - 1)));
  };
  const tapPayDay = (day) => {
    const { form: next, limited } = togglePayDay(form, day);
    if (limited) { setLimitHit("pay"); return; }
    act(next);
  };
  const tapRoundDay = (day) => {
    const next = setRoundDay(form, active, day);
    act(next);
    const waiting = nextRoundNeedingDay(next, active);
    if (waiting >= 0 && waiting !== active) setActiveRound(waiting);
  };
  const tapRoundOff = (index, off) => {
    setActiveRound(index);
    const { form: next, blocked } = setRoundOff(form, index, off);
    if (blocked) { setRowWhy(index); return; }
    act(next);
  };

  /* ── บันทึก ─────────────────────────────────────────────────────────── */
  const send = async (payload) => {
    setSaving(true);
    setSaveError("");
    try {
      const saved = await apiJson(`/api/master/customers/${encodeURIComponent(customer.id)}/billing-rule`, {
        method: "PATCH",
        json: payload,
        fallbackError: "บันทึกกำหนดวางบิลไม่สำเร็จ",
      });
      /* `activityLogged` / `ruleChange` เป็นผลของการกดครั้งนี้ ไม่ใช่ช่องของลูกค้า — ตัดออกก่อนส่งให้หน้าแม่เติมลงแถว */
      const { activityLogged, ruleChange, ruleChangeError, ...fields } = saved || {};
      const cleared = payload.billingRule === null;
      if (fields.unchanged) notifyToast.info("ไม่มีอะไรเปลี่ยน · ไม่ได้ลงประวัติ");
      /* ⚠️ route ลงแถว "ความเคลื่อนไหว" ไม่สำเร็จ (ค่าบันทึกแล้ว) ⇒ ห้ามบอกว่าลงแล้ว — ทางเดียวที่เหลือให้คนกดเห็นค่าเดิม
         คือทักนี้ ⇒ พิมพ์ค่าเดิมลงไปเลย และค้างนานพอให้จดทัน
         ⛔ อย่าชี้ไป "บันทึกการแก้ไขของระบบ" — นั่นคือ audit_logs ที่ฝ่ายขาย/บัญชีเปิดไม่ได้ */
      else if (activityLogged === false) {
        const oldRule = describeRule(stored);
        notifyToast.warning(
          `${cleared ? "ล้างกำหนดวางบิลแล้ว" : "บันทึกกำหนดวางบิลแล้ว"} · แต่ลงความเคลื่อนไหวของลูกค้าไม่สำเร็จ — ${oldRule ? `ค่าเดิมคือ "${oldRule}" (จดไว้ หรือแจ้งผู้ดูแลระบบ)` : "แจ้งผู้ดูแลระบบ"}`,
          RESPONSE_WARNING_TOAST,
        );
      } else if (cleared) {
        notifyToast.success("ล้างเป็น \"ยังไม่ระบุ\" แล้ว · ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหว");
      } else {
        notifyToast.success(`บันทึกแล้ว: ${describeRule(payload.billingRule)} · ไม่ต้องขออนุมัติใหม่`);
      }
      /* บันทึกแล้วแต่อ่านงวดเปิดไม่สำเร็จ (ruleChange null + เหตุ) — การบันทึกไม่พัง แต่ต้องบอกว่าไม่มีใครเช็กงวดให้ */
      if (ruleChangeError) notifyToast.warning(ruleChangeError, RESPONSE_WARNING_TOAST);
      onSaved?.(fields, { ruleChange: ruleChange || null, before: stored, after: fields.billingRule ?? payload.billingRule });
    } catch (err) {
      const hit = conflictOf(err);
      if (hit) setConflict(hit);
      else setSaveError(err?.message || "บันทึกกำหนดวางบิลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (saving) return;
    setTried(true);
    setConflict(null);
    if (!ready) { goto(result.step || 1); return; }
    if (block) return;
    send(savePayloadOf(result, base.at));
  };

  /* 409 — ค่าล่าสุดของคนอื่นกลายเป็นฐานใหม่ · หน้าแม่เติมค่านั้นลงการ์ดทันที (โมดัลยังเปิด) */
  const adopt = (current) => {
    setStored(current.billingRule);
    setBase({ at: current.billingRuleUpdatedAt, by: current.billingRuleUpdatedByName || "" });
    setConflict(null);
    onSynced?.(current);
  };
  const keepMine = () => {
    const { current } = conflict;
    if (!current) return;
    adopt(current);
    send(savePayloadOf(result, current.billingRuleUpdatedAt));
  };
  const takeTheirs = () => {
    const { current } = conflict;
    if (!current) return;
    adopt(current);
    setForm(formFromStored(current.billingRule));
    setTried(false);
  };

  /* ── ผลก่อนบันทึก (กล่องขวา · คิดสดจาก lib ไม่ใช่ช่องกรอก) ─────────────────── */
  const isCalendar = form.need === "required" && form.bill === "calendar";
  const customerName = customer ? customerNameIn(customer) : "ลูกค้า";
  let preview;
  if (!ready && isCalendar && result.step === 3) {
    /* ตารางผ่านแล้ว เหลือข้อ ③ — โชว์รอบถัดไปในตาราง (ตัดรอบ → วันจ่าย) แบบกลาง ๆ ไม่สมมติเครดิต (Q1 ยังเปิด · ไม่มีค่าตั้งต้น) */
    const upcoming = calendarUpcomingRuns(form.calendar, today, 3);
    preview = (
      <>
        <h4 className={styles.pvHead}>รอบถัดไปในปฏิทิน<small>ตัดรอบ → วันจ่าย · กำหนดชำระขึ้นหลังตอบข้อ 3</small></h4>
        {upcoming.length ? (
          <ul className={styles.facts}>
            {upcoming.map((run) => <li key={run.cutoff}>ตัด {fmtDate(run.cutoff)} → จ่าย {fmtDate(run.pay)}</li>)}
          </ul>
        ) : <p className={styles.pvText}><CalendarX2 size={14} aria-hidden="true" /><span>ไม่มีรอบหลังวันนี้ในตาราง</span></p>}
        <p className={styles.pvText}><CircleDashed size={14} aria-hidden="true" /><span>{result.why}</span></p>
      </>
    );
  } else if (!ready) {
    preview = (
      <div className={styles.pvEmpty}>
        <CircleDashed size={18} aria-hidden="true" />
        <p><b>ยังบันทึกไม่ได้</b>{result.why}</p>
      </div>
    );
  } else if (result.clear) {
    preview = (
      <>
        <h4 className={styles.pvHead}>ผลก่อนบันทึก</h4>
        <p className={styles.pvText}><CircleDashed size={14} aria-hidden="true" /><span>{UNKNOWN_TEXT} — งวดกรอกได้ทั้งสองช่อง ไม่มีอะไรคิดให้ · ถามบนใบ SO ตอนตั้งวันงวดครั้งแรก</span></p>
        {storedRule ? <p className={styles.pvText}><History size={14} aria-hidden="true" /><span>ค่าเดิมยังดูย้อนได้ในความเคลื่อนไหวของลูกค้า</span></p> : null}
      </>
    );
  } else if (words.need === "none") {
    preview = (
      <>
        <h4 className={styles.pvHead}>ผลก่อนบันทึก<small>ไม่มีรอบให้คิด — กำหนดชำระของแต่ละงวดตั้งบนใบ SO</small></h4>
        <ul className={styles.facts}>
          <li>ช่องวันวางบิลของทุกงวดขึ้น &quot;ไม่ต้องวางบิล&quot; · ไม่ชวนขอใบวางบิล</li>
          <li>ลูกค้าขอใบวางบิลงวดเดียว = &quot;งวดนี้ต้องวางบิล…&quot; บนใบ SO</li>
          {hasTiming(stored) ? <li>งวดที่มีวันวางบิลอยู่แล้วไม่ถูกซ่อนเงียบ ๆ — หลังบันทึก ระบบเสนอล้างให้เลือกยืนยัน</li> : null}
        </ul>
      </>
    );
  } else if (words.noTiming) {
    preview = (
      <>
        <h4 className={styles.pvHead}>ผลก่อนบันทึก</h4>
        <p className={styles.pvText}><Info size={14} aria-hidden="true" /><span>{NO_TIMING_TEXT} — วันวางบิลตั้งรายงวดบนใบ SO · ทะเบียนการชำระชวนเติมวันวางบิลของงวดที่ยังไม่มี</span></p>
      </>
    );
  } else {
    const pv = policyPreview(result.rule, today, { count: 3, holidays });
    /* ปฏิทินเท่านั้น: ครอบถึงเมื่อไร + วันแรกของกระดิ่งขอปีหน้า · ตัวอย่างกระดิ่งวันตัดรอบ (ข้อความจาก cutoffBell ตัวเดียวกับ cron) */
    const status = isCalendar ? calendarStatus(result.rule, today, { holidays }) : null;
    const bell = result.rule?.runs ? cutoffBellPreviewOf(result.rule, today, { holidays, customer: customerName }) : null;
    preview = (
      <>
        <h4 className={styles.pvHead}>
          ผลก่อนบันทึก
          <small>{pv.kind !== "rounds" ? "ตัวอย่างถ้าวางบิลวันต่อไปนี้" : `${pv.rows.length ? `${pv.rows.length} รอบถัดไป · ` : ""}คิดจาก ${fmtDate(today)}`}</small>
        </h4>
        {pv.rows.length ? (
          <PairList
            rows={pv.rows.map((row) => ({ ...row, key: row.billingDate }))}
            sourceText={(source) => sourceLabel(source, { creditDays: result.rule.creditDays })}
            compact
          />
        ) : null}
        {/* ⭐ Q3 หยุดรอปฏิทินใหม่ — ปฏิทินหมดก่อนครบ 3 รอบ = บอกตรง ๆ แทนแถวเดา */}
        {pv.missing ? <p className={styles.pvGap}><CalendarX2 size={14} aria-hidden="true" /><span>{pv.missing.text}</span></p> : null}
        <p className={styles.pvFoot}>ตรงเสาร์/อาทิตย์ไม่เลื่อนวัน เตือนอย่างเดียว</p>
        {status ? (
          <p className={styles.pvText}>
            <BellRing size={14} aria-hidden="true" />
            <span>ปฏิทินใช้ได้ถึง {status.coveredThroughText} · {status.requestText} — กระดิ่งถึงฝ่ายขายทีมที่ดูแลและฝ่ายบัญชีทุกสัปดาห์ตั้งแต่ {fmtDate(status.firstDigest)} จนกว่าจะใส่</span>
          </p>
        ) : null}
        {bell ? (
          <div className={styles.bellPv}>
            <span className={styles.bellAt}><AlarmClock size={13} aria-hidden="true" />{fmtDate(bell.fireOn, { withYear: false })} 08:30</span>
            <p>{bell.text}</p>
            <small>ถึงเจ้าของดีล · เจ้าของใบ SO · ฝ่ายบัญชี — เฉพาะรอบที่มีงวดรอวางบิล</small>
          </div>
        ) : null}
      </>
    );
  }

  /* ── ท้าย: เหตุ (หลังกดบันทึก) · 409 · ใครแก้ล่าสุด + ตัวล็อก ─────────────────── */
  const stamp = stampTextOf(base.at);
  const lockLine = `${stamp ? `แก้ล่าสุด ${stamp}${base.by ? ` โดย ${base.by}` : ""} · ` : ""}ถ้ามีคนบันทึกระหว่างนี้ ระบบถามก่อน ไม่ทับกันเงียบ ๆ · SA และ FN แก้ได้ ไม่ต้องอนุมัติ`;
  let notice = null;
  if (conflict && !conflict.current) {
    /* 409 แต่ API อ่านค่าล่าสุดซ้ำไม่ได้ — ไม่มีฐานใหม่ให้บันทึกทับ · ทางเดียวคือโหลดหน้าใหม่ (บอกตรง ๆ ว่าที่กรอกจะหาย) */
    notice = (
      <p className={styles.status} role="alert" data-tone="danger">
        <CircleAlert size={14} aria-hidden="true" />
        <span>{conflict.message} · อ่านค่าล่าสุดไม่ได้ — จดค่าที่เลือกไว้ แล้วโหลดหน้าใหม่</span>
      </p>
    );
  } else if (conflict) {
    const cur = conflict.current;
    const curStamp = stampTextOf(cur.billingRuleUpdatedAt);
    notice = (
      <div className={styles.conflict} role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        <div className={styles.conflictText}>
          <b>{conflict.message}</b>
          <p>
            ตอนนี้บันทึกไว้เป็น &quot;{describeRule(cur.billingRule) || UNKNOWN_TEXT}&quot;
            {cur.billingRuleUpdatedByName ? ` โดย ${cur.billingRuleUpdatedByName}` : ""}{curStamp ? ` · ${curStamp}` : ""} · ที่คุณเลือกยังอยู่ครบ
          </p>
        </div>
        <div className={styles.conflictActions}>
          <Button size="sm" tone="neutral" disabled={saving} onClick={takeTheirs}>ใช้ค่าที่เขาบันทึก</Button>
          <Button size="sm" tone="primary" disabled={saving} onClick={keepMine}>บันทึกของฉันทับ</Button>
        </div>
      </div>
    );
  } else if (saveError || block || (tried && !ready)) {
    const text = saveError ? (/ไม่สำเร็จ/.test(saveError) ? saveError : `บันทึกไม่สำเร็จ — ${saveError}`) : block || `ยังบันทึกไม่ได้ — ${result.why}`;
    notice = (
      <p className={styles.status} role="status" data-tone={saveError || block ? "danger" : "warn"}>
        {saveError || block ? <CircleAlert size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
        <span>{text}</span>
      </p>
    );
  }
  const summary = ready
    ? <><CircleCheck size={14} aria-hidden="true" /><span>{result.clear ? `บันทึกเป็น: ${UNKNOWN_TEXT}` : `บันทึกเป็น: ${describeRule(result.rule)}`}</span></>
    : <><CircleDashed size={14} aria-hidden="true" /><span>{result.why}</span></>;

  const footer = (
    <div className={styles.foot}>
      {notice}
      <div className={styles.footRow}>
        <div className={styles.footInfo}>
          {notice ? null : <p className={styles.footSum} data-tone={ready ? undefined : "muted"} aria-live="polite">{summary}</p>}
          <p className={styles.shield}><ShieldCheck size={14} aria-hidden="true" /><span>{lockLine}</span></p>
        </div>
        <div className={styles.footActions}>
          <Button tone="neutral" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" className={styles.saveBtn} disabled={saving} onClick={save}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </div>
    </div>
  );

  const toolbar = legacyTerms ? (
    <div className={styles.legacy}>
      <span className={styles.legacyKey}>เงื่อนไขเครดิตเดิม</span>
      <p
        ref={legacyRef}
        id="billing-rule-legacy"
        className={styles.legacyText}
        data-open={legacyOpen ? "1" : undefined}
        title="ข้อความเดิม · อ่านอย่างเดียว · ระบบไม่แปลงเป็นกติกาให้"
      >
        {legacyTerms}
      </p>
      {legacyClamped || legacyOpen ? (
        <Button variant="quiet" size="sm" className={styles.legacyMore} aria-expanded={legacyOpen} aria-controls="billing-rule-legacy" onClick={() => setLegacyOpen((v) => !v)}>
          {legacyOpen ? "ย่อ" : "ดูทั้งหมด"}
        </Button>
      ) : null}
    </div>
  ) : null;

  /* ── ข้อ ② ③ ─────────────────────────────────────────────────────────── */
  const need = form.need;
  const skipWhy = (step) => {
    if (need === "none") return step === 2 ? "ไม่ต้องตอบ — ลูกค้าไม่ต้องวางบิล" : "ไม่ต้องตอบ — กำหนดชำระตั้งรายงวดบนใบ SO";
    if (need === "unknown") return "ไม่ต้องตอบ — ยังไม่ระบุ";
    if (need === "required" && step === 3 && !form.bill) return "ไม่ต้องตอบ — ยังไม่ตั้งรอบ";
    if (need === "required" && step === 3 && form.bill === "calendar") return "กรอกปฏิทินในข้อ 2 อย่างน้อยหนึ่งรอบก่อน";
    return step === 2 ? "ตอบข้อ 1 ก่อน" : "ตอบข้อ 2 ก่อน";
  };
  /* ปฏิทิน: ข้อ ② "ตอบแล้ว" เมื่อมีรอบที่อ่านได้อย่างน้อยหนึ่งรอบ — ข้อ ③ ตอบได้ระหว่างกรอกตาราง (ตาราง 12 เดือนยาว ไม่ต้องรอครบ) */
  const calendarCount = form.bill === "calendar" ? calendarCountOf(form.calendar).count : 0;
  const billDone = form.bill === "anyday" || (form.bill === "monthly" && form.days.length > 0) || calendarCount > 0;
  const payReady = need === "required" && billDone;
  const payDone = ready && payReady;
  const flag = (step) => tried && !ready && result.step === step;

  const runsLabel = form.bill === "monthly" ? segLabel("ตามรอบจ่าย", "แต่ละวันวางบิลมีวันจ่ายของมัน") : segLabel("วันจ่ายประจำ", "เช่น ทุกวันที่ 25");
  const creditValue = creditNumber(form.creditDays);
  const creditInvalid = form.pay === "credit" && form.creditDays !== "" && creditValue === null;
  const calCreditInvalid = form.calPay === "credit" && form.creditDays !== "" && !creditValue;
  const activeRow = rounds[active];

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="xl"
      sheetOnPhone
      className={isCalendar ? styles.calModal : ""}
      title={firstSet ? "ตั้งการวางบิลและกำหนดชำระ" : "แก้การวางบิลและกำหนดชำระ"}
      subtitle={subject}
      toolbar={toolbar}
      footer={footer}
    >
      <div className={styles.sentBar}>
        <PolicySentence words={words} onGoto={goto} lead={customer?.arCode || ""} />
      </div>
      <div className={styles.layout} data-wide={isCalendar ? "1" : undefined}>
        <div className={styles.qs}>
          {/* ① ต้องวางบิลไหม — ตัวกำหนดบริบทอยู่บนสุด (form-design-rules §1) · ไม่มีค่าตั้งต้น */}
          <section ref={q1Ref} className={styles.q} data-flag={flag(1) ? "1" : undefined} aria-labelledby="billing-rule-q1">
            <StepHead n={1} id="billing-rule-q1" title="ต้องวางบิลไหม" sub="ฝ่ายบัญชีของลูกค้าเป็นคนกำหนด · ตอบครั้งเดียว ใช้กับทุกใบ SO · งวดยกเว้นได้บนใบ" done={Boolean(need)} />
            <OptionTiles ariaLabel="ต้องวางบิลไหม" options={NEED_OPTIONS} value={need} invalid={flag(1)} onChange={(value) => act(chooseNeed(form, value))} />
            {form.legacyNoCredit ? (
              <p className={styles.clue}><Info size={14} aria-hidden="true" /><span>ตอนนี้เป็นรูปเดิม &quot;{NO_CREDIT_TEXT}&quot; (ย้ายข้อมูล 0390) — ระบบไม่เลือกให้</span></p>
            ) : null}
            {form.unsupported ? (
              <p className={styles.clue}><Info size={14} aria-hidden="true" /><span>กติกาที่บันทึกไว้: &quot;{form.unsupported}&quot; — แบบนี้แก้ในหน้าจอนี้ยังไม่ได้ · ตอบใหม่แล้วบันทึกจะแทนที่</span></p>
            ) : null}
          </section>

          {/* ② วางบิลได้เมื่อไร — ข้ามได้ = ยังไม่ตั้งรอบ */}
          <section ref={q2Ref} className={`${styles.q} ${styles.qBill}`} data-skip={need === "required" ? undefined : "1"} data-flag={flag(2) ? "1" : undefined} aria-labelledby="billing-rule-q2">
            <StepHead n={2} id="billing-rule-q2" title="วางบิลได้เมื่อไร" sub={need === "required" ? "วันที่ลูกค้ารับใบวางบิล" : skipWhy(2)} done={need === "required" && billDone} />
            {need === "required" ? (
              <>
                <Segmented
                  ariaLabel="วางบิลได้เมื่อไร"
                  className={`${styles.seg} ${styles.seg3}`}
                  options={[
                    { value: "anyday", label: segLabel("ทุกวัน", "ไม่มีรอบ") },
                    { value: "monthly", label: segLabel("ทุกวันที่…", `1–${ROUNDS_MAX} รอบต่อเดือน · สิ้นเดือน`) },
                    { value: "calendar", label: segLabel("ตามปฏิทินลูกค้า", "รายปี · ลูกค้าประกาศวันตัดรอบ/วันจ่าย") },
                  ]}
                  value={form.bill}
                  onChange={(bill) => act(chooseBill(form, bill, { todayIso: today }))}
                />
                {form.bill === "calendar" ? (
                  <>
                    <CutoffTimeField value={form.cutoffTime} credit={form.calPay === "credit"} onChange={(text) => act(setCutoffTime(form, text))} />
                    <CalendarEditor
                      state={form.calendar}
                      onUpdate={editCalendar}
                      todayIso={today}
                      holidays={holidays}
                      customerId={customer?.id}
                      initialYear={calendarYear}
                      flagged={flag(2)}
                    />
                  </>
                ) : null}
                {form.bill === "monthly" ? (
                  <>
                    <DayGrid ariaLabel="วันที่รับวางบิลของทุกเดือน (แตะได้หลายวัน)" multiple value={form.days} onPick={tapBillDay} />
                    <p className={styles.hint} data-tone={limitHit === "bill" ? "warn" : undefined} role={limitHit === "bill" ? "status" : undefined}>
                      {limitHit === "bill" ? <TriangleAlert size={13} aria-hidden="true" /> : <MousePointerClick size={13} aria-hidden="true" />}
                      <span>
                        {limitHit === "bill"
                          ? `วางบิลได้ไม่เกิน ${ROUNDS_MAX} รอบต่อเดือน — แตะวันที่เลือกไว้เพื่อเอาออกก่อน`
                          : `แตะได้ถึง ${ROUNDS_MAX} วันต่อเดือน · แตะซ้ำเพื่อเอาออก · วางบิลเลยวันของรอบ = ไปรอบถัดไป`}
                      </span>
                    </p>
                  </>
                ) : null}
                {form.bill === "anyday" ? (
                  <p className={styles.hint}><Info size={13} aria-hidden="true" /><span>ไม่มีรอบ · ช่วงเวลารับเอกสาร (เช่น 13.00–15.00 น.) ใส่ในหมายเหตุ</span></p>
                ) : null}
                {form.bill ? (
                  <Button variant="quiet" size="sm" className={styles.skipBtn} onClick={() => act(clearTiming(form))}>ยังไม่รู้รอบ — ข้ามข้อ 2–3</Button>
                ) : (
                  <p className={styles.hint}><Info size={13} aria-hidden="true" /><span>ยังไม่รู้รอบ — ข้ามข้อ 2–3 ได้ บันทึกเป็น &quot;{NO_TIMING_TEXT}&quot; · ทะเบียนการชำระจะชวนเติมวันวางบิลรายงวด</span></p>
                )}
              </>
            ) : null}
          </section>

          {/* ③ กำหนดชำระเมื่อไร */}
          <section ref={q3Ref} className={`${styles.q} ${styles.qPay}`} data-skip={payReady ? undefined : "1"} data-flag={flag(3) ? "1" : undefined} aria-labelledby="billing-rule-q3">
            <StepHead
              n={3}
              id="billing-rule-q3"
              title="กำหนดชำระเมื่อไร"
              sub={!payReady ? skipWhy(3) : isCalendar ? "วันจ่ายตามปฏิทินของลูกค้า · เครดิตไม่บังคับ" : "ลูกค้าจ่ายวันไหน = กำหนดชำระของงวด"}
              done={payDone}
            />
            {/* ⭐ ③ ของปฏิทิน (มติ 29/09) — วันจ่ายมาจากตารางเสมอ · คำถามเหลือแค่ "มีเครดิตไหม" · ไม่มีค่าตั้งต้น (Q1 ยังเปิด)
                เครดิต N = วันจ่ายของรอบแรกที่วันตัดรอบไม่ก่อน วันวางบิล + N (ตัวคิดของ lib — ไม่ใช่ "วันวางบิล + N") */}
            {payReady && isCalendar ? (
              <>
                <Segmented
                  ariaLabel="วันจ่ายตามปฏิทิน — มีเครดิตไหม"
                  className={styles.seg}
                  options={[
                    { value: "same", label: segLabel("วันจ่ายของรอบเดียวกัน", "ไม่มีเครดิต · วางบิลถึงวันตัดรอบ → ได้เงินวันจ่ายรอบนั้น") },
                    { value: "credit", label: segLabel("ครบเครดิต N วันแล้วเข้ารอบจ่าย", "มีเครดิต · เข้ารอบจ่ายแรกที่ตัดรอบหลังวันครบเครดิต") },
                  ]}
                  value={form.calPay}
                  onChange={(calPay) => act(chooseCalPay(form, calPay))}
                />
                {form.calPay === "credit" ? (
                  <div className={styles.creditPay}>
                    <ChoiceChips
                      ariaLabel="จำนวนวันเครดิต"
                      options={CREDIT_CHIPS.map((n) => ({ value: n, label: `${n} วัน` }))}
                      value={CREDIT_CHIPS.includes(creditValue) ? creditValue : null}
                      onChange={(n) => act(setCalCreditDays(form, String(n)))}
                    />
                    <div className={styles.creditRow}>
                      <label htmlFor="billing-rule-cal-credit">หรือพิมพ์</label>
                      <Input
                        id="billing-rule-cal-credit"
                        className={styles.num}
                        inputMode="numeric"
                        maxLength={3}
                        autoComplete="off"
                        placeholder={`1–${CREDIT_MAX}`}
                        invalid={calCreditInvalid}
                        value={form.creditDays}
                        onChange={(event) => act(setCalCreditDays(form, event.target.value))}
                      />
                      <span>วัน · นับจากวันวางบิล</span>
                    </div>
                  </div>
                ) : null}
                {form.calPay === "same" ? (
                  <p className={styles.hint}><Info size={13} aria-hidden="true" /><span>วางบิลเลยวันตัดรอบ = ตกไปรอบถัดไป · เวลาตัดรอบ (ถ้ามี) ใช้เตือน ไม่ได้ย้ายงวดเอง</span></p>
                ) : null}
              </>
            ) : null}
            {payReady && !isCalendar ? (
              <>
                <Segmented
                  ariaLabel="กำหนดชำระเมื่อไร"
                  className={`${styles.seg} ${styles.seg3}`}
                  options={[
                    { value: "same", label: segLabel("ชำระวันวางบิล", "กำหนดชำระ = วันวางบิล") },
                    { value: "credit", label: segLabel("เครดิต N วัน", "นับจากวันวางบิล") },
                    { value: "runs", label: runsLabel },
                  ]}
                  value={form.pay}
                  onChange={(pay) => {
                    act(choosePay(form, pay));
                    if (pay === "runs" && form.bill === "monthly") setActiveRound(Math.max(0, nextRoundNeedingDay(form)));
                  }}
                />

                {form.pay === "credit" ? (
                  <div className={styles.creditPay}>
                    <ChoiceChips
                      ariaLabel="จำนวนวันเครดิต"
                      options={CREDIT_CHIPS.map((n) => ({ value: n, label: `${n} วัน` }))}
                      value={CREDIT_CHIPS.includes(creditValue) ? creditValue : null}
                      onChange={(n) => act(setCreditDays(form, String(n)))}
                    />
                    <div className={styles.creditRow}>
                      <label htmlFor="billing-rule-credit-days">หรือพิมพ์</label>
                      <Input
                        id="billing-rule-credit-days"
                        className={styles.num}
                        inputMode="numeric"
                        maxLength={3}
                        autoComplete="off"
                        placeholder={`0–${CREDIT_MAX}`}
                        invalid={creditInvalid}
                        value={form.creditDays}
                        onChange={(event) => act(setCreditDays(form, event.target.value))}
                      />
                      <span>วัน · 0 = ชำระวันวางบิล</span>
                    </div>
                  </div>
                ) : null}

                {form.pay === "runs" && form.bill === "monthly" ? (
                  <>
                    <ol className={styles.runRows} aria-label="วันจ่ายรายรอบ">
                      {rounds.map((round, index) => {
                        const billDay = form.days[index];
                        const m0Blocked = sameMonthBlocked(billDay, round.day);
                        return (
                          <li key={billDay} data-active={index === active ? "1" : undefined}>
                            <span className={styles.runName}><i className={styles.dotBill} aria-hidden="true" />วางบิล{dayWord(billDay)}</span>
                            <span className={styles.runArrow} aria-hidden="true">→</span>
                            <button
                              type="button"
                              className={`choice-chip ${styles.runDay}`}
                              data-on={index === active ? "1" : undefined}
                              aria-pressed={index === active}
                              aria-label={`เลือกวันจ่ายของ${roundName(billDay)}${round.day != null ? ` (ตอนนี้ ${dayWord(round.day)})` : ""}`}
                              onClick={() => setActiveRound(index)}
                            >
                              <i className={styles.dotDue} aria-hidden="true" />{round.day != null ? dayWord(round.day) : "วันจ่าย?"}
                            </button>
                            <Segmented
                              ariaLabel={`เดือนของวันจ่ายของ${roundName(billDay)}`}
                              className={styles.miniSeg}
                              options={[
                                {
                                  value: 0,
                                  label: "เดือนเดียวกัน",
                                  ariaLabel: m0Blocked ? "เดือนเดียวกัน — ใช้ไม่ได้ วันจ่ายไม่อยู่หลังวันวางบิล" : undefined,
                                  title: m0Blocked ? "วันจ่ายไม่อยู่หลังวันวางบิล — ใช้เดือนเดียวกันไม่ได้" : undefined,
                                },
                                { value: 1, label: "เดือนถัดไป" },
                              ]}
                              value={round.off}
                              onChange={(off) => tapRoundOff(index, off)}
                            />
                            {/* ⭐ "เดือนเดียวกัน" ที่ใช้ไม่ได้ = กดได้แล้วบอกเหตุใต้แถว (กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด") */}
                            {m0Blocked && rowWhy === index ? (
                              <p className={styles.runWhy} role="status">
                                <Info size={13} aria-hidden="true" />
                                <span>วันจ่าย{dayWord(round.day)} ไม่อยู่หลังวางบิล{dayWord(billDay)} — เดือนเดียวกันใช้ไม่ได้ · ถ้าจ่ายเดือนเดียวกันจริง แตะวันจ่ายใหม่ที่ตารางด้านล่างก่อน</span>
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                    {activeRow ? <p className={styles.gridCaption}>วันจ่ายของ <b>{roundName(form.days[active])}</b></p> : null}
                    <DayGrid
                      ariaLabel={activeRow ? `วันจ่ายของ${roundName(form.days[active])}` : "วันจ่าย"}
                      value={activeRow?.day ?? null}
                      stateOf={(day) => {
                        const state = payDayStateOf(form, active, day);
                        return { ...state, title: state.blocked ? "ไม่อยู่หลังวันวางบิล — เลือก \"เดือนถัดไป\" ถ้าจ่ายช่วงนี้" : undefined };
                      }}
                      onPick={tapRoundDay}
                    />
                    <p className={styles.hint}><Info size={13} aria-hidden="true" /><span>วันจ่าย ≤ วันวางบิล = เดือนถัดไปเท่านั้น · มากกว่า = เลือกเอง ไม่มีค่าตั้งต้น</span></p>
                  </>
                ) : null}

                {form.pay === "runs" && form.bill === "anyday" ? (
                  <>
                    <DayGrid ariaLabel="วันจ่ายของลูกค้าทุกเดือน (แตะได้หลายวัน)" multiple value={form.payDays} onPick={tapPayDay} />
                    <p className={styles.hint} data-tone={limitHit === "pay" ? "warn" : undefined} role={limitHit === "pay" ? "status" : undefined}>
                      {limitHit === "pay" ? <TriangleAlert size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
                      <span>
                        {limitHit === "pay"
                          ? `วันจ่ายได้ไม่เกิน ${ROUNDS_MAX} วันต่อเดือน — แตะวันที่เลือกไว้เพื่อเอาออกก่อน`
                          : "แตะวันที่ลูกค้าจ่ายทุกเดือน · วางบิลวันไหน กำหนดชำระ = วันจ่ายถัดไป"}
                      </span>
                    </p>
                  </>
                ) : null}

                {form.legacyShape && form.pay === "runs" ? (
                  <p className={styles.clue}><Info size={14} aria-hidden="true" /><span>กติกานี้ตั้งจากรุ่นเดิม — บันทึกแล้วเก็บเป็นคู่ &quot;วางบิลวันที่ → วันจ่าย&quot; · วันที่ระบบคิดให้เท่าเดิมเมื่อวางบิลตามรอบ</span></p>
                ) : null}
              </>
            ) : null}
          </section>

        </div>

        {/* ผลของสิ่งที่เลือก — คิดสด ไม่ใช่ช่องกรอก · จอกว้างตรึงข้างขวา · จอแคบต่อใต้ข้อ ③
            ⚠️ ไม่ใส่ aria-live ที่กล่องนี้ (อ่านทั้งกล่องซ้ำทุกแตะ) — live region มีที่เดียวคือบรรทัดสรุปท้ายโมดัล */}
        <aside className={styles.aside} aria-label="ผลก่อนบันทึก">
          {preview}
          {ready ? (
            <>
              <div className={styles.pvBlock}>
                <h5><Info size={13} aria-hidden="true" />งวดที่เปิดอยู่ของลูกค้านี้</h5>
                <p>ระบบไม่ย้ายวันเอง — ถ้ามีงวดที่วันจะเปลี่ยน หลังบันทึกจะเปิดจอให้เลือกยืนยันทีละงวด</p>
              </div>
              <div className={styles.pvBlock}>
                <h5>การเตือนที่จะได้</h5>
                <ReminderChips chips={reminderChipsOf(result.clear ? null : result.rule, { todayIso: today, holidays })} />
              </div>
            </>
          ) : null}
        </aside>
        <div className={styles.extra}>
          {need === "unknown" ? (
            <p className={styles.hint}><Info size={13} aria-hidden="true" /><span>ยังไม่ระบุ = ไม่มีกติกาให้เก็บ (หมายเหตุไม่ถูกบันทึก)</span></p>
          ) : (
            <div className={styles.noteField}>
              <label className={styles.noteKey} htmlFor="billing-rule-note">หมายเหตุ <span className={styles.opt}>ไม่บังคับ</span></label>
              <Textarea
                id="billing-rule-note"
                rows={3}
                maxLength={NOTE_MAX}
                placeholder="เช่น นับเครดิตหลังจัดส่งสินค้า · ส่งเอกสาร 13.00–15.00 น."
                value={form.note}
                onChange={(event) => { const note = event.target.value; setForm((prev) => ({ ...prev, note })); }}
              />
            </div>
          )}
          <p className={`${styles.shield} ${styles.shieldBody}`}><ShieldCheck size={14} aria-hidden="true" /><span>{lockLine}</span></p>
        </div>
      </div>
    </Modal>
  );
}
