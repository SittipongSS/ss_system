"use client";
// ── เวลาตัดรอบของปฏิทินลูกค้า (ไม่บังคับ · มติเจ้าของ 29/09 "เตือนดีกว่า") ──────────────────────────────────────
//
// ⭐ เวลาเป็น "ช่อง + กระดิ่ง" — ไม่ใช่ตัวคิดวัน: วางบิลเลยเวลาของวันตัดรอบไม่ได้ย้ายงวดไปรอบถัดไปเอง (ระบบไม่รู้ว่าส่งกี่โมง)
//    มีเวลาแล้วกระดิ่งเช้า 08:30 (จ.–ศ.) วันก่อนและวันตัดรอบพูด "ส่งเอกสารก่อน 16:00 น." ·
//    ลูกค้ามีเครดิต = กระดิ่งพูด "วันสุดท้ายที่วางบิลแล้วทันรอบจ่าย" **ไม่พูดเวลา** (system-design §6) — เวลาเก็บเป็นข้อมูล
// ⭐ ตัวเลือกน้อย = ชิปให้เห็นครบ (กติกา direct controls) + ช่องพิมพ์เวลาอื่น · ว่าง = ไม่มีเวลา (ค่าที่เก็บจริง ไม่ใช่ค่าเดา)
import { AlarmClock, Info } from "lucide-react";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import { CUTOFF_TIME_CHIPS, cutoffTimeOf } from "../CustomerBillingRuleState";
import styles from "./CalendarEditor.module.css";

export default function CutoffTimeField({ value = "", onChange, credit = false }) {
  const parsed = cutoffTimeOf(value);
  /* ชิปติดเมื่อค่าตรงชิปเป๊ะ · พิมพ์เอง (เช่น "1600") = ช่องพิมพ์ถือค่าไว้ ไม่เปลี่ยนรูปให้ระหว่างพิมพ์ */
  const onChip = !value || CUTOFF_TIME_CHIPS.includes(value);
  const chipValue = onChip ? value : null;
  return (
    <div className={styles.cutField}>
      <div className={styles.cutHead}>
        <AlarmClock size={14} aria-hidden="true" />
        <b>เวลาตัดรอบ</b>
        <small>ไม่บังคับ · มีแล้วกระดิ่งเช้า 08:30 (จ.–ศ.) เตือนวันก่อนและวันตัดรอบ</small>
      </div>
      <div className={styles.cutRow}>
        <ChoiceChips
          ariaLabel="เวลาตัดรอบ"
          options={[{ value: "", label: "ไม่มีเวลา", ghost: true }, ...CUTOFF_TIME_CHIPS.map((t) => ({ value: t, label: `${t} น.` }))]}
          value={chipValue}
          onChange={(t) => onChange?.(t)}
        />
        <label className={styles.cutOther} htmlFor="billing-rule-cutoff-time">
          <span>หรือพิมพ์</span>
          <Input
            id="billing-rule-cutoff-time"
            className={styles.cutNum}
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            placeholder="15:30"
            invalid={Boolean(parsed.error)}
            value={onChip ? "" : value}
            onChange={(event) => onChange?.(event.target.value)}
          />
          <span>น.</span>
        </label>
      </div>
      {parsed.error ? <p className={styles.cutHint} data-tone="warn" role="status"><Info size={13} aria-hidden="true" /><span>{parsed.error}</span></p> : null}
      {credit && parsed.value ? (
        <p className={styles.cutHint}><Info size={13} aria-hidden="true" /><span>ลูกค้ามีเครดิต — กระดิ่งพูดว่า &quot;วันสุดท้ายที่วางบิลแล้วทันรอบจ่าย&quot; ไม่พูดเวลา · เวลาเก็บไว้เป็นข้อมูล</span></p>
      ) : null}
    </div>
  );
}
