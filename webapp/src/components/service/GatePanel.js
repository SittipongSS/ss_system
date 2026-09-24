"use client";
// ── แผง "ด่านก่อนขึ้นตาราง" ของโมดัลจัดคิว (แบบ A · มติเจ้าของ 24/09) ─────────────────────
//
// ⭐ สี่ข้อเห็นครบ **ก่อน** ลงมือ (pain 5: เดิมอยู่ใต้รายชื่อเจ้าหน้าที่ · เหตุมาเป็น toast หลังกด)
//    แถวละข้อ: สถานะ (ผ่าน · ไม่ผ่าน · เตือน · ไม่ต้องตรวจ · ยังไม่รู้) · ป้ายเจ้าของ (SA · SA → FN · TS)
//    · เหตุ · ลิงก์แก้ของข้อที่ TS แก้เองได้ (③ → เลือกเจ้าหน้าที่ · ④ → แก้วัน/เวลา)
// ⚠️ วาดอย่างเดียว — ทุกอย่างมาจาก `gatePanelView` (lib/service/scheduleModal.js) ซึ่งอ่านผลของ
//    `evaluateVisitGate` ตัวเดียวกับที่ server ใช้ปฏิเสธ · **ห้ามตัดสินผ่าน/ไม่ผ่านที่นี่**
// ⚠️ สถานะไม่พึ่งสีอย่างเดียว — ไอคอนต่างรูป + คำอ่านออกเสียงต่อแถว (WCAG 1.4.1)
// `children` = ช่องของแผ่นข้ามด่าน (แอดมิน) ต่อท้ายรายการ — เหตุที่จะข้ามอยู่ติดกับรายการที่ติด
import { useId } from "react";
import { AlertTriangle, Check, CircleHelp, Minus, ShieldCheck, X } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { KeepTogether } from "./ScheduleModalParts";
import styles from "./GatePanel.module.css";

/* `warn` = ข้อที่ไม่ผ่านแต่ไม่บล็อก (ข้อ ④ ของลงคิวเข้าพื้นที่ — server ไม่ได้ตรวจ · รีวิว UAT 24/09) */
const STATE_ICONS = { pass: Check, fail: X, warn: AlertTriangle, exempt: Minus, unknown: CircleHelp, parked: Minus };
const STATE_WORDS = { pass: "ผ่าน", fail: "ไม่ผ่าน", warn: "เตือน", exempt: "ไม่ต้องตรวจ", unknown: "ยังไม่รู้", parked: "รอระบบ" };

/**
 * @param view   ผลของ `gatePanelView(items, …)` — null = ไม่มีแผง
 * @param onFix  `(field) => void` — ลิงก์แก้พาโฟกัสไปช่อง ('assignee' | 'scheduledDate') · ไม่ส่ง = ไม่มีลิงก์
 */
export default function GatePanel({ view, onFix = null, children = null }) {
  const titleId = useId();
  if (!view) return null;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h4 className={styles.title} id={titleId}>
        <ShieldCheck size={15} aria-hidden="true" className={styles.titleIcon} />
        <span>ด่านก่อนขึ้นตาราง</span>
        <StatusBadge size="sm" tone={view.tone} label={view.summary} className={styles.count} />
        <span className={styles.srOnly}> — {view.verdict}</span>
      </h4>
      <p className={styles.caption}>{view.caption}</p>
      <ol className={styles.list}>
        {view.rows.map((row) => {
          const Icon = STATE_ICONS[row.state] || Minus;
          return (
            <li key={row.key} className={styles.row} data-state={row.state}>
              <span className={styles.mark}>
                <Icon size={13} aria-hidden="true" />
                <span className={styles.srOnly}>{STATE_WORDS[row.state] || row.state}</span>
              </span>
              <div className={styles.text}>
                <p className={styles.label}>{row.n} {row.label}</p>
                <p className={styles.detail}>
                  <StatusBadge size="sm" tone={row.ownerTone} label={row.owner} className={styles.owner} />
                  {/* เหตุ + ลิงก์แก้เป็นก้อนเดียว — ตัดบรรทัดข้างในก้อน ไม่ตกลงไปใต้ป้ายเจ้าของ */}
                  {row.detail || (row.fix && onFix) ? (
                    <span className={styles.reason}>
                      <KeepTogether text={row.detail} />
                      {row.fix && onFix ? (
                        <>
                          {row.detail ? " — " : null}
                          <button type="button" className={`text-action ${styles.fix}`} onClick={() => onFix(row.fix.field)}>
                            {row.fix.label}
                          </button>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {children}
    </section>
  );
}
