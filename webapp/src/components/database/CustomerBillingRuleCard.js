"use client";
// ── การ์ด "วางบิลและกำหนดชำระ" บนหน้าลูกค้า (รุ่นสี่ · mig 0393 · แบบ A "ประโยคนโยบาย" · มติเจ้าของ 29/09) ──────────
//
// ม็อก: mockups/billing-cycle/rework-v4/recommended.html (`?view=cust&cust=b|d|f|g|k`)
//   ประโยคบรรทัดเดียว ① ต้องวางบิลไหม → ② วางบิลได้เมื่อไร → ③ กำหนดชำระเมื่อไร (ลำดับ วันวางบิล → กำหนดชำระ เสมอ · เจ้าของ 28/09)
//   ตามด้วยสิ่งที่เกิดบนใบ SO ของแต่ละคำตอบ · 3 รอบถัดไป (`policyPreview` ตัวเดียวกับโมดัล) · การเตือนของลูกค้านี้ · หมายเหตุ · ใครแก้ล่าสุด
// ⭐ หลักของเจ้าของ (28/09): กำหนดชำระเป็นช่องหลัก ตั้งเดี่ยวได้เสมอ · วันวางบิลมีเฉพาะลูกค้าที่ต้องวางบิล
//    ⇒ ลูกค้าไม่ต้องวางบิล = ไม่มีกระดิ่งวางบิล ไม่ชวนขอใบวางบิล (เดิมการ์ดพูด "กระดิ่งเตือนก่อนถึงวันวางบิลเหมือนลูกค้าทุกราย" — ไม่จริงแล้ว)
// ⭐ บันทึกกติกาแล้วระบบไม่ย้ายวันของงวดเอง — API คืน `ruleChange` ⇒ การ์ดเปิดจอ "งวดที่วันจะเปลี่ยน" ให้คนเลือกยืนยัน
// ⚠️ ข้อความ "เงื่อนไขเครดิต" เดิม (customers.creditTerms) โชว์ **เฉพาะตอนยังไม่ระบุ/รูปเดิม** — ตอบแล้ว = ค่าในระบบคือความจริง
// ⚠️ ปุ่มตั้ง/แก้ = `canEdit` จากผู้เรียก (ตัวตัดสิน `canEditCustomerBillingRule` ตัวเดียวกับ API · SA ทีมที่ดูแล + FN)
//    ไม่มีสิทธิ์ = ไม่วาดปุ่ม (UI visibility rule) · ฝ่ายบัญชีเห็นปุ่มนี้ทั้งที่ไม่เห็นปุ่มแก้ลูกค้าส่วนอื่น
// ⚠️ id="billing-rule" คือหมุดที่หน้าสร้างใบสั่งขาย/แผงงวดลิงก์มา — ห้ามเปลี่ยน
import { useState } from "react";
import { CalendarClock, CalendarPlus, History, Pencil, ShieldCheck, StickyNote, TextQuote } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { NO_BILLING_TEXT, NO_CREDIT_TEXT, fmtDate, policyPreview, ruleOf, sourceLabel } from "@/lib/sales/billingRule";
import CustomerBillingRuleModal from "./CustomerBillingRuleModal";
import CustomerBillingRuleRedate from "./CustomerBillingRuleRedate";
import { hasRuleChange, policyWordsOf, reminderChipsOf, stampTextOf } from "./CustomerBillingRuleState";
import { PairList, PolicySentence, ReminderChips } from "./CustomerBillingRuleRounds";
import styles from "./CustomerBillingRule.module.css";

/* สิ่งที่เกิดบนใบ SO ของแต่ละคำตอบ — ประโยคสั้นที่คนอ่านแล้วรู้ว่าจอตั้งวันงวดจะพาไปทางไหน */
function factsOf(words) {
  if (words.need === "legacy") {
    return [
      "ตัวตั้งวันบนใบ SO เปิดที่กำหนดชำระ · วันวางบิลไม่บังคับ — ไม่ต้องใส่วันวางบิลปลอม",
      "ทะเบียนการชำระไม่ชวนเติมวันวางบิล · ใส่วันวางบิลเมื่อไร กำหนดชำระ = วันเดียวกัน",
      "ข้อ 1 (ต้องวางบิลไหม) ยังไม่ได้ตอบ — ตอบได้ที่นี่ หรือบนใบ SO",
    ];
  }
  if (words.need === "unknown") {
    return ["งวดของลูกค้านี้กรอกได้ทั้งสองช่อง ไม่มีอะไรคิดให้ · ถามข้อ 1 บนใบ SO ตอนตั้งวันงวดครั้งแรก (คนที่ตั้งค่าลูกค้าได้เท่านั้น)"];
  }
  if (words.need === "none") {
    return [
      "กำหนดชำระตั้งรายงวดบนใบ SO (หรือรอเหตุการณ์) — ไม่ต้องมีวันวางบิล",
      `ช่องวันวางบิลของทุกงวดขึ้น "${NO_BILLING_TEXT}" · ไม่ชวนขอใบวางบิล · ลูกค้าขอใบวางบิลงวดเดียว = "งวดนี้ต้องวางบิล…" บนใบ`,
    ];
  }
  if (words.noTiming) {
    return [
      "รู้ว่าต้องวางบิล แต่ยังไม่รู้รอบ — วันวางบิลตั้งรายงวดบนใบ SO ไม่มีอะไรคิดให้",
      "ทะเบียนการชำระชวน \"ยังไม่มีวันวางบิล\" จนกว่าจะตั้งรอบหรือใส่วัน",
    ];
  }
  return [];
}

export default function CustomerBillingRuleCard({ customer, canEdit = false, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [redate, setRedate] = useState(null);
  const value = customer?.billingRule ?? null;
  const rule = ruleOf(value);
  const words = policyWordsOf(value);
  const asking = words.need === "unknown" || words.need === "legacy";
  const today = businessDate();
  const legacyTerms = String(customer?.creditTerms ?? "").trim();
  const stamp = stampTextOf(customer?.billingRuleUpdatedAt);
  const by = customer?.billingRuleUpdatedByName || "";
  const facts = factsOf(words);
  const preview = words.need === "required" && !words.noTiming ? policyPreview(value, today, { count: 3 }) : null;

  const editButton = canEdit ? (
    <Button
      tone="neutral"
      icon={asking ? <CalendarPlus size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
      aria-label={asking ? "ตั้งการวางบิลและกำหนดชำระ" : "แก้การวางบิลและกำหนดชำระ"}
      onClick={() => setEditing(true)}
    >
      {asking ? "ตั้ง" : "แก้"}
    </Button>
  ) : null;

  /* บันทึกแล้ว: หน้าแม่เติมช่องกติกาลงแถวที่มีอยู่ (ไม่โหลดทั้งหน้า) → มีงวดที่วันจะเปลี่ยน = เปิดจอยืนยัน ไม่งั้นจบ */
  const handleSaved = (fields, { ruleChange, before, after } = {}) => {
    onSaved?.(fields);
    setEditing(false);
    if (fields?.unchanged) return;
    if (hasRuleChange(ruleChange)) setRedate({ change: ruleChange, before, after });
    else if (Number(ruleChange?.hiddenOrders) > 0) {
      notifyToast.info(`ลูกค้านี้มีอีก ${ruleChange.hiddenOrders} ใบที่คุณมองไม่เห็น — ไม่ได้ตรวจงวดของใบเหล่านั้น`);
    }
  };
  /* 409 ในโมดัล: ค่าล่าสุดของคนอื่นลงการ์ดทันที (โมดัลยังเปิด · ฟอร์มที่กรอกไม่ถูกแตะ) · เธรดโหลดใหม่ให้เห็นแถวของเขา */
  const handleSynced = (current) => onSaved?.({ id: customer?.id, ...current, unchanged: false });

  return (
    <>
      <DetailCard
        id="billing-rule"
        icon={CalendarClock}
        eyebrow="Billing & due"
        title="วางบิลและกำหนดชำระ"
        meta="ตั้งที่นี่ที่เดียว · ใบ SO ทุกใบของลูกค้านี้ใช้นโยบายนี้ · งวดยกเว้นได้บนใบ"
        actions={editButton}
      >
        <div className={styles.card}>
          <PolicySentence words={words} />

          {asking && legacyTerms ? (
            <p className={styles.legacyNote}>
              <TextQuote size={14} aria-hidden="true" />
              <span>
                <b>เงื่อนไขเครดิตเดิม:</b> &quot;{legacyTerms}&quot;
                {words.need === "legacy" ? <> · ย้ายข้อมูล 0390 แปลงเป็น &quot;{NO_CREDIT_TEXT}&quot;</> : null}
              </span>
            </p>
          ) : null}

          {facts.length ? (
            <ul className={styles.facts} data-tone={words.noTiming ? "warn" : undefined}>
              {facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          ) : null}
          {asking && !canEdit ? <p className={styles.cardHint}>ตั้งได้โดยฝ่ายขายทีมที่ดูแลลูกค้าหรือฝ่ายบัญชี</p> : null}

          {preview ? (
            <div className={styles.cardRounds}>
              <h3>
                {preview.kind === "rounds" ? `${preview.rows.length} รอบถัดไป` : "ตัวอย่าง ถ้าวางบิลวันต่อไปนี้"}
                <small>คิดจากวันนี้ {fmtDate(today)} · ตรงเสาร์/อาทิตย์ไม่เลื่อนวัน</small>
              </h3>
              <PairList
                rows={preview.rows.map((row) => ({ ...row, key: row.billingDate }))}
                sourceText={(source) => sourceLabel(source, { creditDays: rule?.creditDays || 0 })}
              />
            </div>
          ) : null}

          <div className={styles.cardRemind}>
            <small>การเตือนของลูกค้านี้</small>
            <ReminderChips chips={reminderChipsOf(value)} />
          </div>

          {words.note ? (
            <p className={styles.cardNote}><StickyNote size={14} aria-hidden="true" /><span>หมายเหตุ: {words.note}</span></p>
          ) : null}

          {/* บรรทัด "ใครแก้ล่าสุด" — ใช้ทั้งตอนมีค่าและตอนถูกล้าง (ยังไม่ระบุ + มีตราเวลา = **ถูกล้าง**)
              ⭐ mig 0390 / backfill ประทับชื่อผู้แก้เป็น "ระบบ · …" ⇒ บรรทัดนี้บอกเองว่าค่ามาจากการแปลง
              ค่าเดิม → ใหม่ทุกครั้งอยู่ในแถว "ความเคลื่อนไหว" ของลูกค้า (audit_logs เปิดได้เฉพาะแอดมิน — ไม่ชี้ไปที่นั่น) */}
          {stamp ? (
            <div className={styles.meta}>
              <span className={styles.metaItem}>
                <History size={14} aria-hidden="true" />
                <span>
                  {rule ? "แก้ล่าสุด" : "ล้างล่าสุด"} <span className={styles.nowrap}>{stamp}</span>{by ? <> โดย <b>{by}</b></> : null}
                  {rule ? null : <> · <span className={styles.nowrap}>ค่าเดิมดูได้ในความเคลื่อนไหว</span></>}
                </span>
              </span>
              <span className={styles.metaOk}><ShieldCheck size={13} aria-hidden="true" />ไม่ต้องอนุมัติใหม่</span>
            </div>
          ) : null}
        </div>
      </DetailCard>

      {/* mount ตอนเปิดเท่านั้น — ฟอร์มตั้งต้นจากค่าที่บันทึกไว้ทุกครั้งที่เปิด (ดูหัวโมดัล) */}
      {canEdit && editing ? (
        <CustomerBillingRuleModal
          open
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
          onSynced={handleSynced}
        />
      ) : null}
      {canEdit && redate ? (
        <CustomerBillingRuleRedate
          open
          customer={customer}
          change={redate.change}
          after={redate.after}
          onClose={() => setRedate(null)}
        />
      ) : null}
    </>
  );
}
