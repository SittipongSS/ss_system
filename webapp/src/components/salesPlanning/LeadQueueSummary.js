"use client";

// การ์ด "ค้างคิว" บนหน้าลีด — อะไรค้าง ค้างมากี่วันทำการ และใครถืออยู่
//
// ทำไมต้องมีทั้งที่มีการ์ดสรุปเช้าแล้ว: การ์ดเช้าเป็น **เหตุการณ์** (ยิงวันละครั้ง เข้าห้อง
// แชท ต้องเปิด webhook ก่อน) ส่วนอันนี้เป็น **สถานะ** — เปิดหน้าคิวลีดเมื่อไรก็เห็น
// ⇒ ครอบของที่ค้างมาก่อนหน้าด้วย ไม่ใช่แค่ของที่เพิ่งเกิด (แจ้งเตือนตอนส่งมอบครอบ
// เฉพาะจังหวะที่กดปุ่ม ของที่ค้างอยู่แล้วเงียบต่อไป)
//
// ⚠️ ตัวเลขมาจาก `summarizeLeadQueue` ตัวเดียวกับการ์ดสรุปเช้า — ห้ามนับเองที่นี่
// ไม่งั้นหน้าจอกับแชทจะรายงานคนละเลขโดยไม่มีอะไรฟ้อง

import { useMemo } from "react";
import { Filter, PhoneCall, Users } from "lucide-react";
import { summarizeLeadQueue } from "@/lib/sales/leadDigest";
import { TEAM_LABELS } from "@/lib/permissions";
import styles from "./LeadQueueSummary.module.css";

/* SLA ของทุกขั้นคือ 1 วันทำการ — เกินเมื่อไรถือว่าเลยกำหนด (กติกาเดียวกับ agedAtLeast) */
const SLA_DAYS = 1;

export default function LeadQueueSummary({
  leads = [],
  directory = [],
  holidays,
  scopeLabel,
  /* ขอบเขต "ของฉัน" ไม่ต้องขึ้นชื่อเจ้าของ — ทุกใบเป็นของคนที่กำลังดูอยู่แล้ว
     ป้ายชื่อตัวเองซ้ำทุกแถวคือ noise ที่กลบตัวเลขวันที่ค้าง ซึ่งเป็นสิ่งที่ต้องอ่านจริง */
  showOwners = true,
  onPickStatus,
  onPickOwner,
}) {
  const nameOf = useMemo(() => {
    const map = new Map((directory || []).map((u) => [u.id, u.name || u.email]));
    return (id) => map.get(id) || null;
  }, [directory]);

  const summary = useMemo(() => summarizeLeadQueue(leads, {
    asOf: new Date().toISOString(),
    holidays: holidays || new Set(),
    nameOf,
  }), [leads, holidays, nameOf]);

  // ไม่มีอะไรค้าง = ไม่ต้องมีการ์ด (พื้นที่บนสุดของหน้าแพงเกินกว่าจะใช้บอกว่า "ไม่มี")
  if (!summary.total) return null;

  const late = (days) => days > SLA_DAYS;
  const rowClass = (days) => `${styles.row} ${late(days) ? styles.rowLate : ""}`.trim();

  return (
    <section className={styles.card} aria-label="สรุปลีดที่ค้างคิว">
      <header className={styles.head}>
        <h3 className={styles.title}>ค้างคิว {summary.total} ใบ</h3>
        {scopeLabel && <span className={styles.scope}>{scopeLabel}</span>}
        <span className={styles.sla}>SLA 1 วันทำการทุกขั้น</span>
      </header>

      <ul className={styles.rows}>
        {summary.screen.count > 0 && (
          <li className={rowClass(summary.screen.oldest)}>
            <button type="button" className={styles.stage} onClick={() => onPickStatus?.("new")}>
              <Filter size={14} aria-hidden="true" /> รอคัดกรอง
              <span className={styles.count}>{summary.screen.count}</span>
            </button>
            <span className={styles.detail}>
              คิวกลางของหัวหน้าฝ่ายขาย
              <Age days={summary.screen.oldest} late={late(summary.screen.oldest)} />
            </span>
          </li>
        )}

        {summary.spread.count > 0 && (
          <li className={rowClass(summary.spread.oldest)}>
            <button type="button" className={styles.stage} onClick={() => onPickStatus?.("screened")}>
              <Users size={14} aria-hidden="true" /> รอกระจาย
              <span className={styles.count}>{summary.spread.count}</span>
            </button>
            <span className={styles.detail}>
              {/* กองอยู่ทีมไหนคือคำถามแรกของขั้นนี้ — เจ้าของงานคือ Senior AE ของทีมนั้น */}
              {summary.spread.teams.map((t) => (
                <span key={t.key} className={styles.pill}>
                  {TEAM_LABELS[t.label] || t.label} {t.count}
                </span>
              ))}
              <Age days={summary.spread.oldest} late={late(summary.spread.oldest)} />
            </span>
          </li>
        )}

        {summary.contact.count > 0 && (
          <li className={rowClass(summary.contact.oldest)}>
            <button type="button" className={styles.stage} onClick={() => onPickStatus?.("assigned")}>
              <PhoneCall size={14} aria-hidden="true" /> รอติดต่อกลับ
              <span className={styles.count}>{summary.contact.count}</span>
            </button>
            <span className={styles.detail}>
              {!showOwners && <Age days={summary.contact.oldest} late={late(summary.contact.oldest)} />}
              {/* กดชื่อแล้วกรองตารางเหลือของคนนั้น — เห็นว่าใครดองแล้วต้องกดต่อได้เลย
                  ไม่ใช่ต้องไปเปิดตัวกรองแล้วหาชื่อเองอีกรอบ */}
              {showOwners && summary.contact.owners.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`${styles.pill} ${styles.pillAction} ${late(o.oldest) ? styles.pillLate : ""}`.trim()}
                  onClick={() => onPickOwner?.(o.key)}
                  title={`ดูเฉพาะลีดของ ${o.label} · ค้างนานสุด ${o.oldest} วันทำการ`}
                >
                  {o.label} {o.count}
                  {late(o.oldest) ? ` · ${o.oldest} วัน` : ""}
                </button>
              ))}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

function Age({ days, late }) {
  if (!days) return null;
  return (
    <span className={`${styles.age} ${late ? styles.ageLate : ""}`.trim()}>
      ค้างนานสุด {days} วันทำการ
    </span>
  );
}
