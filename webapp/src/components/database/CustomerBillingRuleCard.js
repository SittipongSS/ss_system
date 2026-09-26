"use client";
// ── การ์ด "เครดิตและรอบวางบิล" บนหน้าลูกค้า (รุ่นสอง · mig 0390 · ม็อก A mockups/billing-cycle) ──────────
//
// มติเจ้าของ 25–26/09:
//   · ตั้งรอบวางบิล **ครั้งเดียวที่ทะเบียนลูกค้า** → งวดของใบสั่งขายแตะเลือกรอบ ระบบคิดวันวางบิล + กำหนดชำระให้
//   · แก้ได้ทั้งฝ่ายขายทีมที่ดูแลและฝ่ายบัญชี · **ไม่ต้องอนุมัติใหม่** · ลงประวัติว่าใครแก้ (ข้อ 4)
//   · ตรงเสาร์/อาทิตย์ = เตือนอย่างเดียว ไม่เลื่อนวัน (รอบสาม ข้อ 1)
//   · (26/09 รุ่นสอง) **เครดิตเป็นสวิตช์ที่นี่ที่เดียว** — ไม่มีเครดิต / มีเครดิต (+รอบ) · ช่อง "เงื่อนไขเครดิต"
//     แบบพิมพ์อิสระของฟอร์มลูกค้าถูกถอด ⇒ การ์ดนี้บอก **สถานะเครดิตก่อน** แล้วค่อยรอบ
//   · วางบิลได้หลายรอบต่อเดือน (≤4) — ตารางรอบบอกว่าแต่ละแถวเป็นรอบไหน
// ⚠️ ข้อความ "เงื่อนไขเครดิต" เดิม (customers.creditTerms) ยังอยู่ในฐาน — mig 0390 แปลงข้อความที่ชัดเป็นรอบแล้ว
//    ที่เหลือโชว์ "ข้อความเดิม: …" **เฉพาะตอนยังไม่ระบุ** (ตั้งแล้ว = ค่าในระบบคือความจริง ข้อความเก่าไม่ต้องแข่ง)
// ⚠️ ปุ่มแก้ = `canEdit` จากผู้เรียก (ตัวตัดสิน `canEditCustomerBillingRule` ตัวเดียวกับ API)
//    ไม่มีสิทธิ์ = ไม่วาดปุ่ม (UI visibility rule) · ฝ่ายบัญชีเห็นปุ่มนี้ทั้งที่ไม่เห็นปุ่มแก้ลูกค้าส่วนอื่น
// ⚠️ id="billing-rule" คือหมุดที่หน้าสร้างใบสั่งขาย/แผงงวดลิงก์มา — ห้ามเปลี่ยน
import { useState } from "react";
import { Ban, CalendarCheck2, CalendarClock, CalendarPlus, CalendarRange, CalendarX, History, Pencil, ShieldCheck, TextQuote } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import { businessDate } from "@/lib/businessDate";
import { fmtTime, NA } from "@/lib/format";
import {
  MONTH_END_DAY, billingRoundLabels, billingRuleOf, describeBillingRule, describeBillingRuleDetail, formatBillingDate,
} from "@/lib/sales/billingRule";
import CustomerBillingRuleModal from "./CustomerBillingRuleModal";
import { BillingRoundsTable, billingPreviewOf } from "./CustomerBillingRuleRounds";
import styles from "./CustomerBillingRule.module.css";

const dayLabel = (day) => (day === MONTH_END_DAY ? "สิ้นเดือน" : `วันที่ ${day}`);
const monthLabel = (offset) => (offset === 1 ? "เดือนถัดไป" : "เดือนเดียวกัน");

/* ส่วนย่อยของรอบ (แถวในรายการบนการ์ด) — ประโยคเต็มมาจาก describeBillingRule ตัวเดียวกับทุกจอ
   ⚠️ อ่านรูปรุ่นสอง (billing.days / payment.rounds) จาก billingRuleOf เท่านั้น — รูปรุ่นแรกถูกแปลงให้แล้ว */
function billingPart(rule) {
  if (rule.billing.mode !== "monthly") return { main: "ได้ทุกวัน", sub: "ไม่มีรอบ — ลูกค้ารับใบวางบิลได้ทุกวันทำการ" };
  const labels = billingRoundLabels(rule);
  return labels.length > 1
    ? { main: `ทุกเดือน ${labels.join(" · ")}`, sub: `${labels.length} รอบต่อเดือน` }
    : { main: `ทุกเดือน ${labels[0]}`, sub: "" };
}
function paymentPart(rule) {
  const sub = describeBillingRuleDetail(rule);
  if (rule.payment.mode === "credit") {
    return { main: `เครดิต ${rule.payment.days} วัน`, sub: rule.billing.mode === "monthly" && rule.billing.days.length > 1 ? `${sub} · ทุกรอบ` : sub };
  }
  const { rounds } = rule.payment;
  const same = rounds.every((r) => r.day === rounds[0].day && r.monthOffset === rounds[0].monthOffset);
  if (same) return { main: `ทุกเดือน ${dayLabel(rounds[0].day)}`, sub };
  /* หลายรอบเงินเข้าไม่เหมือนกัน — บรรทัดละรอบ "รอบวันที่ 10 → วันที่ 25 เดือนเดียวกัน" */
  return {
    main: "แยกตามรอบ",
    lines: rule.billing.days.map((day, i) => `รอบ${dayLabel(day)} → ${dayLabel(rounds[i].day)} ${monthLabel(rounds[i].monthOffset)}`),
  };
}

/* "แก้ล่าสุด ศ. 25 ก.ย. 2026 · 10:42" — วันไทย (businessDate) + เวลาไทย (fmtTime) ของจุดเวลาเดียวกัน */
function stampOf(at) {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatBillingDate(businessDate(date))} · ${fmtTime(at)}`;
}

export default function CustomerBillingRuleCard({ customer, canEdit = false, onSaved }) {
  const [editing, setEditing] = useState(false);
  const rule = billingRuleOf(customer?.billingRule);
  const noCredit = rule?.credit === false;
  const today = businessDate();
  const preview = billingPreviewOf(rule, today);
  const legacy = String(customer?.creditTerms ?? "").trim();
  const verb = rule ? "แก้" : "ตั้ง";

  const editButton = canEdit ? (
    <Button tone="neutral" icon={rule ? <Pencil size={15} aria-hidden="true" /> : <CalendarPlus size={15} aria-hidden="true" />} onClick={() => setEditing(true)}>
      {verb}เครดิตและรอบวางบิล
    </Button>
  ) : null;

  const stamp = stampOf(customer?.billingRuleUpdatedAt);
  const by = customer?.billingRuleUpdatedByName || "";
  /* บรรทัด "ใครแก้ล่าสุด" — ใช้ทั้งตอนมีค่าและตอนถูกล้าง (มติข้อ 4 "ลงประวัติว่าใครแก้")
     ⚠️ ไม่มีค่า + มีตราเวลา = **ถูกล้าง** (route ประทับ 3 ช่องนี้ทุกครั้งที่ตั้ง/แก้/ล้าง)
        ถ้าไม่โชว์ตรงนี้ ค่าที่ถูกล้างจะหน้าตาเหมือน "ไม่เคยตั้ง" ตรงที่คนมองหามันก่อน
        (ค่าเดิม → ใหม่ทุกครั้งอยู่ในแถว "ความเคลื่อนไหว" ของลูกค้า · ทั้งแถวอยู่ใน audit_logs ที่เปิดได้เฉพาะแอดมิน)
     ⭐ mig 0390 ประทับชื่อผู้แก้ว่า "ระบบ · แปลงจากเงื่อนไขเครดิตเดิม (0390)" ⇒ บรรทัดนี้บอกเองว่าค่ามาจากการแปลง
     `tail` = ท้ายบรรทัดชี้ทางต่อ — ตอนถูกล้าง การ์ดไม่เหลืออะไรบอกว่าค่าเดิมคืออะไร ทั้งที่ป้ายยืนยันการล้าง
     สัญญาไว้ว่าดูย้อนได้ ⇒ ชี้ไปการ์ด "ความเคลื่อนไหว" ตรงที่คนมองก่อน (การ์ดนั้นไม่มี anchor ให้ลิงก์ — เป็นข้อความ) */
  const stampLine = (lead, tail = "") => (stamp ? (
    <span className={styles.metaItem}>
      <History size={14} aria-hidden="true" />
      <span>
        {lead} <span className={styles.nowrap}>{stamp}</span>{by ? <> โดย <b>{by}</b></> : null}
        {tail ? <> · <span className={styles.nowrap}>{tail}</span></> : null}
      </span>
    </span>
  ) : null);
  const meta = (
    <div className={styles.meta}>
      {stampLine("แก้ล่าสุด")}
      <span className={styles.metaOk}><ShieldCheck size={13} aria-hidden="true" />ไม่ต้องอนุมัติใหม่</span>
    </div>
  );

  let body;
  if (noCredit) {
    body = (
      <>
        <div className={styles.ruleBox} data-tone="none">
          <Ban size={18} aria-hidden="true" />
          <div>
            <strong>ไม่มีเครดิต</strong>
            <small>ชำระก่อนหรือพร้อมสั่ง · ใบสั่งขายกรอกกำหนดชำระเองทีละงวด ไม่มีวันวางบิลและกระดิ่งเตือนวางบิล</small>
          </div>
        </div>
        {rule.note ? (
          <dl className={styles.facts}>
            <div><dt>หมายเหตุ</dt><dd>{rule.note}</dd></div>
          </dl>
        ) : null}
        {meta}
      </>
    );
  } else if (rule) {
    const pay = paymentPart(rule);
    body = (
      <>
        <div className={styles.ruleBox}>
          <CalendarCheck2 size={18} aria-hidden="true" />
          <div>
            <span className={styles.ruleKicker}>มีเครดิต</span>
            <strong>{describeBillingRule(rule)}</strong>
            <small>ใช้คิดวันให้งวดที่ยังไม่มีวัน · งวดที่มีวันแล้วไม่เปลี่ยนตาม · ใบเก่าไม่เติมย้อนหลัง</small>
          </div>
        </div>

        <div className={styles.split}>
          <dl className={styles.facts}>
            {[
              { label: "วางบิล", ...billingPart(rule) },
              { label: "เงินเข้า / กำหนดชำระ", ...pay },
              { label: "หมายเหตุการวางบิล", main: rule.note || NA, sub: "", muted: !rule.note },
            ].map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd data-muted={fact.muted ? "1" : undefined}>
                  {fact.main}
                  {fact.lines ? fact.lines.map((line) => <span key={line} className={styles.factLine}>{line}</span>) : null}
                  {fact.sub ? <span className={styles.factSub}>{fact.sub}</span> : null}
                </dd>
              </div>
            ))}
          </dl>

          <div className={styles.next}>
            <h3>
              <CalendarRange size={14} aria-hidden="true" />
              {preview.kind === "anyday" ? "ตัวอย่างถ้าวางบิลวันนี้" : `${preview.rows.length} รอบถัดไป`}
            </h3>
            {preview.kind === "anyday" ? (
              <p className={styles.nextLead}>วางบิลได้ทุกวัน — ไม่มีรอบให้คิดล่วงหน้า · งวดของใบสั่งขายกรอกวันวางบิลเอง แล้วระบบคิดกำหนดชำระให้</p>
            ) : null}
            <BillingRoundsTable rows={preview.rows} rule={rule} />
            <p className={styles.nextFoot}>คิดจากวันนี้ {formatBillingDate(today)} · ตรงเสาร์/อาทิตย์ ไม่เลื่อนวัน เตือนอย่างเดียว</p>
          </div>
        </div>
        {meta}
      </>
    );
  } else {
    body = (
      <>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}><CalendarX size={20} aria-hidden="true" /></span>
          <strong>ยังไม่ระบุเครดิต</strong>
          <p>
            ใบสั่งขายของลูกค้ารายนี้ยังพิมพ์กำหนดชำระเองทีละงวด
            {canEdit ? "" : " · ตั้งได้โดยฝ่ายขายทีมที่ดูแลลูกค้าหรือฝ่ายบัญชี"}
          </p>
          {/* ข้อความเดิมที่ระบบแปลงเองไม่ได้ (mig 0390 แปลงเฉพาะที่ชัด) — ให้คนอ่านแล้วตั้งเองในโมดัล */}
          {legacy ? (
            <p className={styles.legacyNote}>
              <TextQuote size={14} aria-hidden="true" />
              <span><b>ข้อความเดิม:</b> {legacy}</span>
            </p>
          ) : null}
          {editButton}
        </div>
        {stamp ? <div className={styles.meta}>{stampLine("ล้างล่าสุด", "ค่าเดิมดูได้ในความเคลื่อนไหว")}</div> : null}
      </>
    );
  }

  return (
    <>
      <DetailCard
        id="billing-rule"
        icon={CalendarClock}
        eyebrow="Credit & billing"
        title="เครดิตและรอบวางบิล"
        meta="เครดิตของลูกค้าตั้งที่นี่ที่เดียว · มีเครดิต = งวดของใบสั่งขายแตะเลือกรอบ แล้วระบบคิดวันวางบิลและกำหนดชำระให้"
        actions={rule ? editButton : null}
      >
        {body}
      </DetailCard>

      {/* mount ตอนเปิดเท่านั้น — ฟอร์มตั้งต้นจากค่าที่บันทึกไว้ทุกครั้งที่เปิด (ดูหัวโมดัล) */}
      {canEdit && editing ? (
        <CustomerBillingRuleModal
          open
          onClose={() => setEditing(false)}
          customer={customer}
          onSaved={(fields) => { setEditing(false); onSaved?.(fields); }}
        />
      ) : null}
    </>
  );
}
