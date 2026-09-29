"use client";
// ── แผงแดงหลังกด "ยื่นอนุมัติ" / "ยื่นตรวจงานบริการ" (ม็อก SoSubmitBlocked · ภาคผนวก A.1) ─────────────────────────
//
// ⭐ ขึ้น **หลังกดเท่านั้น** (หน้าเป็นคนเมานต์เมื่อมี `submitIssues`) — ไม่มีสีแดงก่อนกด (กฎ 3)
// ⭐ ข้อความ/หัว/หัวกลุ่ม/ป้าย มาจาก `SERVICE_SETUP_PANEL_TEXT` ของ serviceSetup.js ที่เดียว — ห้ามพิมพ์ซ้ำที่นี่
// ⭐ จัดกลุ่มตามแท็บที่ต้องไปแก้ (รายการ = แท็บภาพรวม · งวดชำระ = แท็บการชำระ) · "n ข้อ" นับเฉพาะข้อที่บล็อก
//   · คำเตือนของฝ่ายขาย (ครอบซ้อน) = เทา + "เตือน · ไม่บล็อกการยื่น" + ไปแก้ได้
//   · คำเตือนของบัญชี (งวดที่รับรองแล้วไม่มีช่วงครอบ) = ป้าย "รอฝ่ายบัญชี" **ไม่มี "ไปแก้"** (ฝ่ายขายแก้ไม่ได้)
//   · กลุ่มที่มีแต่คำเตือน = "เตือน n ข้อ" สีกลาง (ไม่ใช่ "0 ข้อ" สีแดง)
// ⭐ ปุ่ม "ไปแก้" ทุกปุ่มชื่อเดียวกันบนจอ ⇒ อ้างข้อความของแถวตัวเองด้วย aria-describedby (โปรแกรมอ่านจอรู้ว่าไปแก้อะไร ·
//   ชื่อปุ่มยังเป็นคำที่ตาเห็น "ไปแก้" ตาม WCAG 2.5.3)
import { useId } from "react";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import { fmtDateTime } from "@/lib/format";
import { SERVICE_SETUP_PANEL_TEXT } from "@/lib/sales/serviceSetup";
import { issueHeadTail, submitGateGroups } from "./serviceSetupDraft";
import styles from "./SubmitGateNotice.module.css";

/**
 * @param issues ข้อที่บล็อก (Issue[]) · @param warnings คำเตือน (Warning[]) · @param flow 'pipeline' | 'backfill'
 * @param checkedAt เวลาที่ตรวจ (ISO) · @param onJump `(issueOrWarning) => void` — หน้าสลับแท็บแล้วโฟกัสช่อง
 *   (`revealServiceSetupField(serviceSetupFieldId(issue))`)
 */
export default function SubmitGateNotice({ issues = [], warnings = [], flow = "pipeline", checkedAt = null, onJump }) {
  const list = Array.isArray(issues) ? issues : [];
  const groups = submitGateGroups(list, warnings);
  const baseId = useId();
  return (
    <StatusNotice tone="error" title={SERVICE_SETUP_PANEL_TEXT.title(flow, list.length)}>
      <p className={styles.subtitle}>{SERVICE_SETUP_PANEL_TEXT.subtitle(flow)}</p>
      {checkedAt ? <p className={styles.checkedAt}>{SERVICE_SETUP_PANEL_TEXT.checkedAt(fmtDateTime(checkedAt))}</p> : null}
      <div className={styles.groups}>
        {groups.map((group) => (
          <section key={group.key} className={styles.group} aria-label={group.title}>
            <h4 className={styles.groupHead}>
              {group.title}
              {group.count ? <span className={styles.groupCount}>{SERVICE_SETUP_PANEL_TEXT.count(group.count)}</span>
                : <span className={styles.groupWarnCount}>{SERVICE_SETUP_PANEL_TEXT.warnCount(group.warnCount)}</span>}
            </h4>
            <ul className={styles.items}>
              {group.items.map((item, index) => {
                const { head, rest } = issueHeadTail(item.entry?.message);
                const textId = `${baseId}-${group.key}-${index}`;
                return (
                  <li key={`${item.kind}-${item.entry?.key}-${item.entry?.lineId || item.entry?.installmentId || ""}-${item.entry?.zoneId || ""}-${index}`}
                    className={styles.item} data-kind={item.kind}>
                    <span id={textId} className={styles.itemText}>{head ? <b>{head}</b> : null}{rest}</span>
                    {item.tag ? <Tag tone={item.entry?.owner === "FN" ? "info" : "neutral"}>{item.tag}</Tag> : null}
                    {item.jump ? (
                      <Button size="sm" variant="quiet" aria-describedby={textId} onClick={() => onJump?.(item.entry)}>
                        {SERVICE_SETUP_PANEL_TEXT.jump}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </StatusNotice>
  );
}
