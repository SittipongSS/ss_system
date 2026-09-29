"use client";
// ── แถบนโยบายการวางบิลของลูกค้าบนแผงงวด (รุ่นสี่ · มติเจ้าของ 29/09 แบบ A "ประโยคนโยบาย") ──
//
// ⭐ แทนบรรทัด "กำหนดวางบิล: …" เดิม — ม็อก `mockups/billing-cycle/rework-v4/recommended.js` (`policyStrip` · `askModal`)
//   · ตอบแล้ว = "นโยบายของ AR-xxx" + ประโยคเดียว (`describeRule`) + งวดยกเว้นบนใบนี้ ("ยกเว้นบนใบนี้: งวด 2 ต้องวางบิล") +
//     ต้องวางบิลแต่ยังไม่ตั้งรอบ = บอกว่าทะเบียนการชำระชวนเติมวันวางบิล · ลิงก์ทะเบียนลูกค้า (แท็บใหม่ — ร่างวันงวดไม่หาย)
//   · ยังไม่ระบุ / รูปเดิม { credit:false } (`asksNeed`) = แถบถาม **"ลูกค้ารายนี้ต้องวางบิลไหม?"** — ตอบครั้งเดียว เก็บที่ทะเบียนลูกค้า
//     ปุ่มเปิด **โมดัลยืนยันที่บอกขอบเขต** (ข้อติของกรรมการ #14 — ไม่ใช่แตะเดียวเขียนลูกค้า) · ทางเลือก: ไม่ต้องวางบิล /
//     ต้องวางบิล · ยังไม่รู้รอบ / ต้องวางบิล · ไปตั้งรอบที่ลูกค้า — **ไม่มีค่าตั้งต้น** (ปุ่มที่แตะเลือกให้เฉพาะ "ไม่ต้องวางบิล…")
// ⭐ ใครตอบได้ = `canEditBillingRule` ของ GET ใบ (ตัวเดียวกับ API · SA ทีมที่ดูแล + FN · ไม่ต้องอนุมัติ) · คนอื่นเห็นแถบ
//   **อ่านอย่างเดียว** พร้อมบอกว่าใครตอบได้ (ข้อติ #9 — ไม่ใช่ซ่อนแล้วงง)
// ⭐ บันทึก = PATCH เส้นเดียวกับโมดัลทะเบียนลูกค้า (`/api/master/customers/[id]/billing-rule` · ตัวล็อก `baseUpdatedAt` ดิบจาก GET)
//   · 409 (มีคนแก้หลังเปิด) = บอกเหตุในโมดัล + ดึงใบสด (ตัวล็อกใหม่) · ค่าที่เลือกค้างอยู่ให้กดใหม่
//   · ฐานยังไม่รัน 0393 (`v4Ready` เท็จ) = ปุ่มไม่ขึ้น บอก "รอรัน migration 0393" แทน (เขียนรุ่นสี่ไม่ได้ก่อนนั้น)
// ⚠️ ไม่ย้ายวันของงวดเอง — คำตอบที่ทำให้งวดที่เปิดอยู่ของลูกค้ามีวันเปลี่ยน (เช่น "ไม่ต้องวางบิล" ของลูกค้าที่มีวันวางบิลค้าง)
//   = เปิดจอ "งวดที่วันจะเปลี่ยน" **ตัวเดียวกับการ์ดทะเบียนลูกค้า** (`CustomerBillingRuleRedate` · `ruleChange` ของคำตอบ API) ให้คนยืนยันทันที
//   🐞 review 29/09: เดิมแค่ toast ชี้ไปทะเบียนลูกค้า — ที่นั่นเปิดจอนี้ได้เฉพาะหลังบันทึกที่เปลี่ยนค่า (บันทึกซ้ำ = unchanged ⇒ รายการว่าง)
//      ⇒ ข้อเสนอ "ล้างวันวางบิล" หายถาวร วันวางบิลค้างบนลูกค้าไม่ต้องวางบิลแล้วเตือนวางบิลต่อ (§9 ความเสี่ยง 3)
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, CircleHelp, HandCoins, Lock, Receipt, Split, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import OptionTiles from "@/components/ui/OptionTiles";
import StatusNotice from "@/components/ui/StatusNotice";
import Modal from "@/components/Modal";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import {
  NO_CREDIT_TEXT, asksNeed, billingNeed, describeRule, hasTiming, needOverrideOf, ruleOf,
} from "@/lib/sales/billingRule";
import { BILLING_V4_SCHEMA_MISSING } from "@/lib/sales/billingPolicySchema";
import CustomerBillingRuleRedate from "@/components/database/CustomerBillingRuleRedate";
import { hasRuleChange } from "@/components/database/CustomerBillingRuleState";
import styles from "./InstallmentDates.module.css";

/* คำตอบที่เขียนจากใบ SO ได้ตรง ๆ — "ต้องวางบิล · ตั้งรอบเลย" ไม่มีรูปที่นี่ (ไปตัวตั้งค่าของลูกค้า) */
const ANSWERS = Object.freeze({
  none: { v: 4, need: "none" },
  notiming: { v: 4, need: "required", billing: null },
});
const ANSWER_FACTS = Object.freeze({
  none: [
    "ทุกใบ SO ของลูกค้านี้ตั้งแค่กำหนดชำระ · ช่องวันวางบิลขึ้น “—”",
    "ไม่มีเตือนวางบิล · มีเตือนครบกำหนดชำระ 0–3 วัน",
    "งวดไหนลูกค้าขอใบวางบิล = “งวดนี้ต้องวางบิล…” รายงวด",
  ],
  notiming: [
    "ทุกงวดตั้งวันวางบิลเองรายงวด (ยังไม่มีรอบให้คิด)",
    "ทะเบียนการชำระชวน “ยังไม่มีวันวางบิล” ของงวดที่ยังไม่มีวัน",
    "ตั้งรอบภายหลังที่ทะเบียนลูกค้า",
  ],
  rule: [
    "ไปตัวตั้งค่าของลูกค้า (แท็บใหม่) ตอบรอบวางบิล/กำหนดชำระให้ครบ",
    "กลับมาใบนี้แล้วตัวตั้งวันเป็นแบบตามรอบเอง",
  ],
});

/**
 * @param ruleValue   `customers."billingRule"` ดิบของลูกค้าของใบ
 * @param customer    `{ id, arCode, billingRuleUpdatedAt }` จาก GET ใบ (ตัวล็อกดิบ — ห้ามแปลงผ่าน Date)
 * @param canEdit     `order.canEditBillingRule === true`
 * @param v4Ready     ฐานรัน 0393 แล้ว (`order.billingSkipReady === true`)
 * @param mode        โหมดตั้งวัน (อ่านค่าปัจจุบันของงวด + งวดที่ยืนยันข้อยกเว้นในร่าง) — บอก "ยกเว้นบนใบนี้"
 * @param openCount   งวดที่ยังเปิดของใบนี้ (บอกขอบเขตในโมดัล)
 * @param customerHref · onRegistryOpened (กลับมาจากแท็บทะเบียน = ดึงใบสด) · onSaved (ดึงใบสดหลังตอบ) · ownerName (เจ้าของดีล)
 */
export default function BillingPolicyStrip({
  ruleValue = null, customer = null, canEdit = false, v4Ready = false, mode = null, openCount = 0,
  customerHref = "", onRegistryOpened, onSaved, ownerName = "",
}) {
  const [ask, setAsk] = useState(null);
  /* จอ "งวดที่วันจะเปลี่ยน" หลังตอบ — `{ change, after }` จากคำตอบ PATCH · ปิดแล้วใช้วันใหม่ = ดึงใบสดอีกรอบ (งวดของใบนี้อาจขยับ) */
  const [redate, setRedate] = useState(null);
  const rule = ruleOf(ruleValue);
  const redateModal = redate ? (
    <CustomerBillingRuleRedate open customer={customer} change={redate.change} after={redate.after}
      onClose={(result) => { setRedate(null); if (Number(result?.saved) > 0) onSaved?.(); }} />
  ) : null;
  const code = String(customer?.arCode || "").trim();
  const legacy = Boolean(rule?.legacyNoCredit);

  /* งวดยกเว้นบนใบนี้ (ข้อติ #11 — ข้อยกเว้นถูกใช้เกินต้องเห็นทุกครั้ง) · อ่านค่าปัจจุบัน (ร่างด้วย) */
  const exceptions = (mode?.rows || []).map((row) => {
    const now = { ...row, ...mode.current(row) };
    const over = needOverrideOf(now, ruleValue) || (mode.exceptionIds?.has(row.id) ? "billing" : null);
    return over ? `งวด ${row.seq} ${over === "billing" ? "ต้องวางบิล" : "ไม่ต้องวางบิล"}` : "";
  }).filter(Boolean);

  const registryLink = customerHref ? (
    /* แท็บใหม่ — ร่างวันงวดในโหมดตั้งวันไม่หาย · กลับมาที่แท็บนี้ = ดึงใบสด (ผู้เรียกฟัง focus/visibilitychange) */
    <Link className={`linklike ${styles.policyLink}`} href={`${customerHref}#billing-rule`} prefetch={false}
      target="_blank" rel="noopener noreferrer" onClick={onRegistryOpened} onAuxClick={onRegistryOpened}
      aria-label={`${canEdit ? "แก้ที่ทะเบียนลูกค้า" : "ดูที่ทะเบียนลูกค้า"} (เปิดแท็บใหม่)`}>
      {canEdit ? "แก้ที่ทะเบียนลูกค้า" : "ดูที่ทะเบียนลูกค้า"}<ArrowUpRight size={13} aria-hidden="true" />
    </Link>
  ) : null;

  if (asksNeed(ruleValue)) {
    return (
      <div className={styles.policy} data-tone="ask">
        <CircleHelp size={18} aria-hidden="true" className={styles.policyIcon} />
        <div className={styles.policyText}>
          <small>
            {code ? <span className="nowrap">{code} </span> : null}
            {legacy ? `ยังเป็นรูปเดิม “${NO_CREDIT_TEXT}”` : "ยังไม่ระบุการวางบิล"}
          </small>
          <p><b>ลูกค้ารายนี้ต้องวางบิลไหม?</b> ตอบครั้งเดียว เก็บที่ทะเบียนลูกค้า มีผลกับทุกใบของลูกค้า</p>
          {!canEdit ? (
            <p className={styles.policySub}>
              <Lock size={13} aria-hidden="true" />
              {`ตอบได้เฉพาะฝ่ายขายทีมที่ดูแลลูกค้า${code ? ` ${code}` : ""} และฝ่ายบัญชี${ownerName ? ` — แจ้ง ${ownerName} (เจ้าของดีล)` : ""}`}
            </p>
          ) : !v4Ready ? (
            <p className={styles.policySub}><TriangleAlert size={13} aria-hidden="true" />{BILLING_V4_SCHEMA_MISSING}</p>
          ) : null}
          <p className={styles.policySub}>
            {`ยังไม่ตอบก็ตั้งวันได้ — ตัวตั้งวันเปิดที่กำหนดชำระ วันวางบิลไม่บังคับ${legacy ? " (ใส่วันวางบิลเมื่อไร กำหนดชำระ = วันเดียวกันถ้ายังว่าง)" : ""}`}
          </p>
        </div>
        {canEdit && v4Ready && customer?.id ? (
          <div className={styles.policyActions}>
            <Button size="sm" tone="neutral" variant="outline" icon={<HandCoins size={14} aria-hidden="true" />}
              onClick={() => setAsk({ choice: "none", error: "", busy: false })}>
              ไม่ต้องวางบิล…
            </Button>
            <Button size="sm" tone="neutral" variant="outline" icon={<Receipt size={14} aria-hidden="true" />}
              onClick={() => setAsk({ choice: null, error: "", busy: false })}>
              ต้องวางบิล…
            </Button>
          </div>
        ) : null}
        {ask ? (
          <NeedAskModal ask={ask} setAsk={setAsk} customer={customer} code={code} openCount={openCount}
            customerHref={customerHref} onRegistryOpened={onRegistryOpened} onSaved={onSaved} onRuleChange={setRedate} />
        ) : null}
        {redateModal}
      </div>
    );
  }

  const need = billingNeed(ruleValue);
  const noTiming = need === "required" && !hasTiming(ruleValue);
  return (
    <div className={styles.policy}>
      {need === "none"
        ? <HandCoins size={18} aria-hidden="true" className={styles.policyIcon} />
        : <CalendarClock size={18} aria-hidden="true" className={styles.policyIcon} />}
      <div className={styles.policyText}>
        <small>นโยบายของ{code ? <span className="nowrap"> {code}</span> : "ลูกค้า"}</small>
        <p>
          <b>{describeRule(ruleValue)}</b>
          {need === "none" ? " · กำหนดชำระตั้งรายงวดบนใบ SO · เตือนก่อนครบกำหนดชำระ" : ""}
        </p>
        {rule?.note ? <p className={styles.policySub}>{rule.note}</p> : null}
        {exceptions.length ? (
          <p className={styles.policyExc}><Split size={13} aria-hidden="true" />{`ยกเว้นบนใบนี้: ${exceptions.join(" · ")}`}</p>
        ) : null}
        {noTiming ? (
          <p className={styles.policyExc}>
            <TriangleAlert size={13} aria-hidden="true" />ต้องวางบิลแต่ยังไม่ตั้งรอบ — ทะเบียนการชำระชวนเติมวันวางบิล
          </p>
        ) : null}
      </div>
      {registryLink ? <div className={styles.policyActions}>{registryLink}</div> : null}
      {redateModal}
    </div>
  );
}

/* โมดัลยืนยัน "ต้องวางบิลไหม" (ข้อติ #14) — บอกขอบเขต · ไม่มีค่าตั้งต้น · บันทึกที่ทะเบียนลูกค้า */
function NeedAskModal({ ask, setAsk, customer, code, openCount, customerHref, onRegistryOpened, onSaved, onRuleChange }) {
  const choice = ask.choice;
  const close = () => { if (!ask.busy) setAsk(null); };
  const save = async () => {
    if (!choice || ask.busy) return;
    if (choice === "rule") {
      /* รอบวางบิลตอบที่ตัวตั้งค่าของลูกค้าเท่านั้น (ตัวเดียวกับการ์ดลูกค้า) — แท็บใหม่ · กลับมา = ดึงใบสด */
      onRegistryOpened?.();
      if (typeof window !== "undefined" && customerHref) window.open(`${customerHref}#billing-rule`, "_blank", "noopener,noreferrer");
      setAsk(null);
      return;
    }
    setAsk((a) => ({ ...a, busy: true, error: "" }));
    try {
      const saved = await apiJson(`/api/master/customers/${encodeURIComponent(customer.id)}/billing-rule`, {
        method: "PATCH",
        /* ตัวล็อกดิบจาก GET (null = ยังไม่เคยตั้ง ⇒ route ใช้ .is(null)) — ห้ามแปลงผ่าน Date */
        json: { billingRule: ANSWERS[choice], baseUpdatedAt: customer.billingRuleUpdatedAt ?? null },
        fallbackError: "บันทึกคำตอบไม่สำเร็จ",
      });
      notifyToast.success(`บันทึกที่ทะเบียนลูกค้าแล้ว · มีผลกับทุกใบของลูกค้า${code ? ` ${code}` : ""}`);
      /* งวดที่วันจะเปลี่ยน = เปิดจอยืนยันตัวเดียวกับทะเบียนลูกค้าเลย (ระบบเสนอ คนยืนยัน) · อ่านงวดไม่ขึ้น = บอก ไม่ใช่เงียบ */
      if (!saved?.unchanged && hasRuleChange(saved?.ruleChange)) onRuleChange?.({ change: saved.ruleChange, after: saved.billingRule ?? ANSWERS[choice] });
      else if (saved?.ruleChangeError) notifyToast.warning(saved.ruleChangeError);
      else if (Number(saved?.ruleChange?.hiddenOrders) > 0) {
        notifyToast.info(`ลูกค้านี้มีอีก ${saved.ruleChange.hiddenOrders} ใบที่คุณมองไม่เห็น — ไม่ได้ตรวจงวดของใบเหล่านั้น`);
      }
      setAsk(null);
      await onSaved?.();
    } catch (error) {
      /* 409 = มีคนแก้หลังเปิด — ดึงใบสด (ตัวล็อกใหม่) · ค่าที่เลือกค้างอยู่ให้กดใหม่หลังอ่านค่าล่าสุด */
      setAsk((a) => (a ? { ...a, busy: false, error: error?.message || "บันทึกคำตอบไม่สำเร็จ" } : a));
      if (error?.status === 409) await onSaved?.();
    }
  };
  return (
    <Modal open onClose={close} size="sm" dismissible={!ask.busy}
      title={`${code || "ลูกค้า"} ต้องวางบิลไหม`}
      subtitle={`บันทึกที่ทะเบียนลูกค้า · มีผลกับทุกใบของลูกค้า (ใบนี้มีงวดที่ยังเปิด ${openCount} งวด)`}
      footer={(
        <>
          <Button variant="ghost" disabled={ask.busy} onClick={close}>ยกเลิก</Button>
          <Button tone="primary" disabled={!choice || ask.busy} onClick={save}>
            {ask.busy ? "กำลังบันทึก…" : choice === "rule" ? "ไปตั้งที่ลูกค้า" : "บันทึกที่ทะเบียนลูกค้า"}
          </Button>
        </>
      )}>
      <div className={styles.askBody}>
        {ask.error ? <StatusNotice tone="error" role="alert">{ask.error}</StatusNotice> : null}
        <OptionTiles ariaLabel="ลูกค้าต้องวางบิลไหม" value={choice}
          onChange={(next) => setAsk((a) => ({ ...a, choice: next, error: "" }))}
          disabled={ask.busy}
          options={[
            { value: "none", label: "ไม่ต้องวางบิล", description: "โอนตามงวด / จ่ายหน้างาน" },
            { value: "notiming", label: "ต้องวางบิล · ยังไม่รู้รอบ", description: "บันทึกว่าต้องวาง ตั้งรอบทีหลัง" },
            { value: "rule", label: "ต้องวางบิล · ตั้งรอบเลย", description: "ไปตัวตั้งค่าของลูกค้า", disabled: !customerHref },
          ]} />
        {choice ? (
          <ul className={styles.askFacts}>
            {ANSWER_FACTS[choice].map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        ) : (
          <p className={styles.hint}>เลือกก่อน — ไม่มีค่าตั้งต้น</p>
        )}
        <p className={styles.hint}>ฝ่ายขายทีมที่ดูแล และฝ่ายบัญชีแก้ได้ ไม่ต้องอนุมัติ · ลงความเคลื่อนไหวของลูกค้า</p>
      </div>
    </Modal>
  );
}
