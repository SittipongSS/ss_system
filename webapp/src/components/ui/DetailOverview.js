import { Children } from "react";
import styles from "./DetailOverview.module.css";

export function DetailStateBadge({ label, color = "var(--accent)" }) {
  if (!label) return null;
  return <span className={styles.stateBadge} style={{ "--state-color": color }}>{label}</span>;
}

export default function DetailOverview({
  eyebrow,
  title,
  description,
  badges,
  actions,
  facts = [],
  children,
  className = "",
}) {
  const extra = Children.toArray(children);
  return (
    <section className={`${styles.overviewCard} ${className}`.trim()}>
      <div className={styles.overviewHeading}>
        <div className={styles.titleBlock}>
          {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
          <h1>{title || "-"}</h1>
          {description ? <div className={styles.description}>{description}</div> : null}
        </div>
        {(badges || actions) ? (
          <div className={styles.headingActions}>
            {badges ? <div className={styles.badgeRow}>{badges}</div> : null}
            {actions ? <div className={styles.actionRow}>{actions}</div> : null}
          </div>
        ) : null}
      </div>
      {facts.length ? (
        <div className={styles.quickFacts}>
          {facts.map((fact, index) => {
            const Icon = fact.icon;
            return (
              <div key={fact.key || `${fact.label}-${index}`}>
                {Icon ? <Icon size={17} aria-hidden="true" /> : null}
                <span>
                  <small>{fact.label}</small>
                  <strong title={typeof fact.value === "string" ? fact.value : undefined}>
                    {fact.value ?? "-"}
                  </strong>
                  {/* บรรทัดรอง — ของที่อ่านคู่กับค่าหลักเสมอ (รหัสลูกค้าใต้ชื่อลูกค้า ·
                      เบอร์ใต้ชื่อผู้ติดต่อ) · ไม่ใช่ที่เก็บของที่ไม่มีช่องว่าง
                      กริดขึ้นแถวสองได้แล้ว ช่องใหม่จึงไม่ต้องเบียดมาอยู่ตรงนี้ */}
                  {fact.sub ? (
                    <small
                      className={styles.factSub}
                      title={typeof fact.sub === "string" ? fact.sub : undefined}
                    >
                      {fact.sub}
                    </small>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {/* 🐞 `children ? …` ไม่พอ — ผู้เรียกส่งลูกหลายตัวที่เป็นเงื่อนไข
          (`{cond && <X/>}`) ⇒ ได้อาเรย์ของ `false` ซึ่ง truthy ⇒ โซนนี้ยังถูกวาด
          เป็น **แถบว่างพร้อมเส้นคั่น** ใต้หัวใบ (ผู้ใช้เห็นบนจอ tablet 2026-08-09)
          · `Children.toArray` ทิ้ง null/undefined/boolean ให้แล้ว */}
      {extra.length ? <div className={styles.extra}>{extra}</div> : null}
    </section>
  );
}
