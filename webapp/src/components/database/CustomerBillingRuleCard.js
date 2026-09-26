"use client";
// ── การ์ด "รอบวางบิลและชำระเงิน" บนหน้าลูกค้า (mig 0389 · ม็อก A mockups/billing-cycle) ─────────────
//
// มติเจ้าของ 25–26/09:
//   · ตั้งรอบวางบิล **ครั้งเดียวที่ทะเบียนลูกค้า** → งวดของใบสั่งขายแตะเลือกรอบ ระบบคิดวันวางบิล + กำหนดชำระให้
//   · แก้ได้ทั้งฝ่ายขายทีมที่ดูแลและฝ่ายบัญชี · **ไม่ต้องอนุมัติใหม่** · ลงประวัติว่าใครแก้ (ข้อ 4)
//   · ตรงเสาร์/อาทิตย์ = เตือนอย่างเดียว ไม่เลื่อนวัน (รอบสาม ข้อ 1)
//   · ตัดช่อง "ผู้ดูแลการวางบิล (FN)" ของม็อกออกแล้ว — กระดิ่งฝั่งบัญชีแจ้งทั้งฝ่าย (รอบสาม ข้อ 5)
// ⚠️ "เงื่อนไขเครดิต" (ข้อความอิสระเดิม) คงไว้ข้างกัน ระบบไม่แปลงเป็นรอบให้ — ข้อมูลเดิมแปลงไม่ได้
// ⚠️ ปุ่มแก้ = `canEdit` จากผู้เรียก (ตัวตัดสิน `canEditCustomerBillingRule` ตัวเดียวกับ API)
//    ไม่มีสิทธิ์ = ไม่วาดปุ่ม (UI visibility rule) · ฝ่ายบัญชีเห็นปุ่มนี้ทั้งที่ไม่เห็นปุ่มแก้ลูกค้าส่วนอื่น
import { useState } from "react";
import { CalendarCheck2, CalendarClock, CalendarPlus, CalendarRange, CalendarX, History, Pencil, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import { businessDate } from "@/lib/businessDate";
import { fmtTime, NA } from "@/lib/format";
import {
  MONTH_END_DAY, billingRuleOf, describeBillingRule, describeBillingRuleDetail, formatBillingDate,
} from "@/lib/sales/billingRule";
import CustomerBillingRuleModal from "./CustomerBillingRuleModal";
import { BillingRoundsTable, billingPreviewOf } from "./CustomerBillingRuleRounds";
import styles from "./CustomerBillingRule.module.css";

/* ส่วนย่อยของรอบ (แถวในรายการบนการ์ด) — ประโยคเต็มมาจาก describeBillingRule ตัวเดียวกับทุกจอ */
function billingPart(rule) {
  if (rule.billing.mode !== "monthly") return { main: "ได้ทุกวัน", sub: "ไม่มีรอบ — ลูกค้ารับใบวางบิลได้ทุกวันทำการ" };
  return { main: rule.billing.day === MONTH_END_DAY ? "ทุกเดือน สิ้นเดือน" : `ทุกเดือน วันที่ ${rule.billing.day}`, sub: "" };
}
function paymentPart(rule) {
  const sub = describeBillingRuleDetail(rule);
  if (rule.payment.mode === "credit") return { main: `เครดิต ${rule.payment.days} วัน`, sub };
  const day = rule.payment.day === MONTH_END_DAY ? "สิ้นเดือน" : `วันที่ ${rule.payment.day}`;
  return { main: `ทุกเดือน ${day}`, sub };
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
  const today = businessDate();
  const preview = billingPreviewOf(rule, today);
  const verb = rule ? "แก้" : "ตั้ง";

  const editButton = canEdit ? (
    <Button tone="neutral" icon={rule ? <Pencil size={15} aria-hidden="true" /> : <CalendarPlus size={15} aria-hidden="true" />} onClick={() => setEditing(true)}>
      {verb}รอบวางบิล
    </Button>
  ) : null;

  const stamp = stampOf(customer?.billingRuleUpdatedAt);
  const by = customer?.billingRuleUpdatedByName || "";
  /* บรรทัด "ใครแก้ล่าสุด" — ใช้ทั้งตอนมีรอบและตอนถูกล้าง (มติข้อ 4 "ลงประวัติว่าใครแก้")
     ⚠️ ไม่มีรอบ + มีตราเวลา = **ถูกล้าง** (route ประทับ 3 ช่องนี้ทุกครั้งที่ตั้ง/แก้/ล้าง และตั้ง/แก้ทิ้งรอบไว้เสมอ)
        ถ้าไม่โชว์ตรงนี้ รอบที่ถูกล้างจะหน้าตาเหมือน "ไม่เคยตั้ง" ตรงที่คนมองหามันก่อน
        (ค่าเดิม → ใหม่ทุกครั้งอยู่ในแถว "ความเคลื่อนไหว" ของลูกค้า · ทั้งแถวอยู่ใน audit_logs ที่เปิดได้เฉพาะแอดมิน)
     `tail` = ท้ายบรรทัดชี้ทางต่อ — ตอนถูกล้าง การ์ดไม่เหลืออะไรบอกว่ารอบเดิมคืออะไร ทั้งที่ป้ายยืนยันการล้าง
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

  return (
    <>
      <DetailCard
        id="billing-rule"
        icon={CalendarClock}
        eyebrow="Billing & payment"
        title="รอบวางบิลและชำระเงิน"
        meta="ตั้งครั้งเดียวที่นี่ · งวดของใบสั่งขายแตะเลือกรอบ แล้วระบบคิดวันวางบิลและกำหนดชำระให้"
        actions={rule ? editButton : null}
      >
        {rule ? (
          <>
            <div className={styles.ruleBox}>
              <CalendarCheck2 size={18} aria-hidden="true" />
              <div>
                <strong>{describeBillingRule(rule)}</strong>
                <small>ใช้คิดวันให้งวดที่ยังไม่มีวัน · งวดที่มีวันแล้วไม่เปลี่ยนตาม · ใบเก่าไม่เติมย้อนหลัง</small>
              </div>
            </div>

            <div className={styles.split}>
              <dl className={styles.facts}>
                {[
                  { label: "วางบิล", ...billingPart(rule) },
                  { label: "เงินเข้า / กำหนดชำระ", ...paymentPart(rule) },
                  { label: "หมายเหตุการวางบิล", main: rule.note || NA, sub: "", muted: !rule.note },
                ].map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd data-muted={fact.muted ? "1" : undefined}>
                      {fact.main}
                      {fact.sub ? <span className={styles.factSub}>{fact.sub}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className={styles.next}>
                <h3>
                  <CalendarRange size={14} aria-hidden="true" />
                  {preview.anyday ? "ตัวอย่างถ้าวางบิลวันนี้" : `${preview.rows.length} รอบถัดไป`}
                </h3>
                {preview.anyday ? (
                  <p className={styles.nextLead}>วางบิลได้ทุกวัน — ไม่มีรอบให้คิดล่วงหน้า · งวดของใบสั่งขายกรอกวันวางบิลเอง แล้วระบบคิดกำหนดชำระให้</p>
                ) : null}
                <BillingRoundsTable rows={preview.rows} />
                <p className={styles.nextFoot}>คิดจากวันนี้ {formatBillingDate(today)} · ตรงเสาร์/อาทิตย์ ไม่เลื่อนวัน เตือนอย่างเดียว</p>
              </div>
            </div>

            <div className={styles.meta}>
              {stampLine("แก้ล่าสุด")}
              <span className={styles.metaOk}><ShieldCheck size={13} aria-hidden="true" />ไม่ต้องอนุมัติใหม่</span>
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><CalendarX size={20} aria-hidden="true" /></span>
            <strong>ยังไม่ตั้งรอบวางบิล</strong>
            <p>
              ใบสั่งขายของลูกค้ารายนี้ยังพิมพ์กำหนดชำระเองทีละงวด
              {canEdit ? "" : " · ตั้งรอบได้โดยฝ่ายขายทีมที่ดูแลลูกค้าหรือฝ่ายบัญชี"}
            </p>
            {editButton}
          </div>
        )}
        {!rule && stamp ? <div className={styles.meta}>{stampLine("ล้างรอบล่าสุด", "รอบเดิมดูได้ในความเคลื่อนไหว")}</div> : null}
      </DetailCard>

      {/* mount ตอนเปิดเท่านั้น — ฟอร์มตั้งต้นจากรอบที่บันทึกไว้ทุกครั้งที่เปิด (ดูหัวโมดัล) */}
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
