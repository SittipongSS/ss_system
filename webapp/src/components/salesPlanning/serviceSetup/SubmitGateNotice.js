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
// ⭐ ท้ายแผง "ยื่นโดยยังไม่ตั้งงานบริการ" (mig 0404 · มติเจ้าของ 01/10 "ผูกรอบบริการให้ข้ามได้ มาใส่ทีหลัง Actual ได้" → ทาง "ฝ่ายขายกดข้ามเอง")
//   · ขึ้นเมื่อหน้าส่ง `skip` (ก้อน `view.skip` ของ GET — ใบร่าง/ถูกตีกลับที่ยังมีข้อของการตั้งงานบริการ) เท่านั้น · ไม่ส่ง = แผงเดิมทุกตัวอักษร
//   · บรรทัดท้ายแผง = `skip.lead` ที่ **server เลือก** (ข้ามได้ / ยังเหลือข้อที่ข้ามไม่ได้ / ใบเดิมของ Rev. ยังเดินรอบ) — ที่นี่พิมพ์อย่างเดียว ไม่ตัดสิน
//   · 🔴 ปุ่ม **กดได้เสมอ** (ดับเฉพาะตอนหน้ากำลังยิงคำสั่ง) — ติดด่าน = โชว์แล้วบอกเหตุตอนกด: หน้าโหลดก้อน GET สดแล้วบอกเหตุ/เปิดโมดัลยืนยัน
//     ⚠️ "ดับ" = `aria-disabled` + ไม่รับการกดซ้ำ **ไม่ใช่ `disabled` ของเบราว์เซอร์**: หน้าตั้ง busy ระหว่างโหลดก้อนสดทุกครั้งที่กดปุ่มนี้ —
//        ปุ่มที่ถือโฟกัสอยู่แล้วถูก `disabled` = โฟกัสตกไป <body> (โมดัลที่เปิดตามมาจำ <body> ไว้คืนโฟกัส · คนใช้คีย์บอร์ด/โปรแกรมอ่านจอ
//        หลุดตำแหน่งทุกครั้งที่กด — ตรวจทานรอบสุดท้าย) ⇒ ปุ่มต้องอยู่ในลำดับโฟกัสตลอด (ท่าเดียวกับ DocumentControlPanel)
//   · พื้นกลาง ไม่ใช่แดง — เป็นทางเลือก ไม่ใช่ข้อผิด · ไม่ใช่ปุ่มหลัก (ทางหลักยังเป็น "แก้ให้ครบแล้วกดยื่นอนุมัติ")
//   · แถวที่การข้ามเลื่อนออกไปได้ติดป้าย 'ข้ามได้' (`skipTagsShown` — ใบที่ข้ามไม่ได้ทั้งใบไม่มีป้าย) · ข้อของบัญชีไม่มีป้ายนี้
import { useId } from "react";
import thaiText from "@/components/ThaiText";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import { fmtDateTime } from "@/lib/format";
import { SERVICE_DEFER_TEXT, SERVICE_SETUP_PANEL_TEXT, serviceSetupDeferSplit, serviceSetupIssueGroup } from "@/lib/sales/serviceSetup";
import { issueHeadTail, skipTagsShown, submitGateGroups } from "./serviceSetupDraft";
import styles from "./SubmitGateNotice.module.css";

/**
 * @param issues ข้อที่บล็อก (Issue[]) · @param warnings คำเตือน (Warning[]) · @param flow 'pipeline' | 'backfill'
 * @param checkedAt เวลาที่ตรวจ (ISO) · @param onJump `(issueOrWarning) => void` — หน้าสลับแท็บแล้วโฟกัสช่อง
 *   (`revealServiceSetupField(serviceSetupFieldId(issue))`)
 * @param skip ก้อน `view.skip` ของ GET เมื่อใบนี้กด 'ยื่นโดยยังไม่ตั้งงานบริการ' ได้/ติดด่าน (`visible`) — null = ไม่มีท้ายแผง
 * @param onSkip หน้าเป็นเจ้าของทั้งเส้น (ก้อนสด → บอกเหตุ/โมดัลยืนยัน → ยิง) · @param skipBusy หน้ากำลังยิงคำสั่ง (ปุ่มไม่รับการกด · ยังถือโฟกัสได้)
 */
export default function SubmitGateNotice({
  issues = [], warnings = [], flow = "pipeline", checkedAt = null, onJump, skip = null, onSkip, skipBusy = false,
}) {
  const list = Array.isArray(issues) ? issues : [];
  const skipRow = skip?.visible ? skip : null;
  /* ป้าย 'ข้ามได้' คิดจากข้อของแผงเอง (ภาพ ณ ตอนกด) ด้วยตัวตัดสินกลาง — ไม่มีข้อของการตั้งงานบริการ = ไม่มีอะไรเลื่อนได้ */
  const split = skipTagsShown(skipRow) ? serviceSetupDeferSplit(list) : null;
  const groups = submitGateGroups(list, warnings, {
    deferrable: split?.deferrable ? (entry) => serviceSetupIssueGroup(entry) !== "blocking" : null,
  });
  const baseId = useId();
  const skipTextId = `${baseId}-skip`;
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
                    className={styles.item} data-kind={item.kind} data-deferrable={item.deferrable ? "" : undefined}>
                    <span id={textId} className={styles.itemText}>{head ? <b>{head}</b> : null}{rest}</span>
                    {item.tag ? <Tag tone={item.entry?.owner === "FN" ? "info" : "neutral"}>{item.tag}</Tag> : null}
                    {item.deferrable ? <Tag tone="neutral">{SERVICE_DEFER_TEXT.deferTag}</Tag> : null}
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
      {skipRow ? (
        <div className={styles.skip}>
          <p id={skipTextId} className={styles.skipText}>{thaiText(skipRow.lead)}</p>
          <Button
            size="sm"
            variant="outline"
            className={styles.skipButton}
            aria-disabled={skipBusy || undefined}
            aria-busy={skipBusy || undefined}
            title={skipRow.blockedReason || undefined}
            aria-describedby={skipTextId}
            onClick={() => { if (!skipBusy) onSkip?.(); }}
          >
            {SERVICE_DEFER_TEXT.button}
          </Button>
        </div>
      ) : null}
    </StatusNotice>
  );
}
