"use client";
// ── แถบงานของช่างที่ขอบล่างจอประเมิน (มติผู้ใช้ 2026-09-21) ──────────────────
//
// ⭐ flow ของช่างอยู่จบในจอเดียว: **รับงาน (= เริ่มงาน) → ใส่รายละเอียด → รูป → ส่งงาน**
//   🐞 เดิมจอประเมินไม่มีปุ่มส่งงานเลย — ช่างต้องย้อนกลับไป "งานวันนี้" แล้วกด "ปิดงาน"
//   ซึ่งเปิดแผ่นปิดงานของงานบริการ (ของที่ใช้ · ลายเซ็นลูกค้า · รูปหน้างานอีกชุด) และเตือน
//   "ยังไม่มีรูป" ทั้งที่แนบรูปรายพื้นที่ไปแล้ว
//
// ⚠️ **ปุ่มเดียวต่อจังหวะ** — ยังไม่เริ่ม = "เริ่มงาน" · กำลังทำ = "ส่งงาน" · ส่งแล้ว = บอกผล
//   ไม่มีปุ่ม · ของหัวหน้า (เคาะแพ็คเกจ · ส่งผล) ไม่อยู่ที่นี่ — อยู่การ์ดจัดการผลประเมิน
// ⚠️ **ติดขอบล่างเหนือแถบเมนูมือถือ** (`--mobile-nav-h` = 0 บนจอใหญ่) — ช่างเลื่อนไล่
//   วัดทีละพื้นที่ ปุ่มส่งงานต้องอยู่ใต้นิ้วตลอด ไม่ใช่ท้ายหน้าที่ต้องเลื่อนหา
import { CheckCheck, CheckCircle2, Play, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import { isClosedVisit } from "@/lib/service/visitStatus";
import styles from "./SurveyFieldBar.module.css";

const hhmm = (value) => String(value || "").slice(0, 5);

/**
 * @param visit     นัดของใบ (ต้องมี · ไม่มี = ไม่วาด)
 * @param progress  `view.progress` — `{ done, total, cut }`
 * @param starting  กำลังยิงเริ่มงานอยู่
 * @param sendBack  `surveySendBackState` จาก server — หัวหน้าส่งกลับให้แก้ค้างอยู่ไหม (มติ 2026-09-22)
 * @param onReportFixed  เปิดโมดัล "แจ้งหัวหน้าว่าแก้แล้ว"
 */
export default function SurveyFieldBar({ visit, progress, starting = false, sendBack = null, onStart, onSubmit, onReportFixed }) {
  if (!visit) return null;
  const status = visit.status;

  let tone = "plain";
  let head;
  let sub;
  let action = null;

  const askedFix = sendBack?.pending === true;
  const askedNote = sendBack?.sentBack?.note || null;

  if (askedFix && isClosedVisit(visit) && status !== "unable") {
    /* ⭐ **หัวหน้าส่งกลับให้แก้ = งานของช่างกลับมาอีกรอบ** (มติผู้ใช้ 2026-09-22) — แถบกลับมามีปุ่ม
       และติดขอบล่างอีกครั้ง (โทน todo) · 🐞 เดิมแก้เสร็จแล้วไม่มีทางบอก หัวหน้าต้องคอยเปิดดูเอง
       ⚠️ นัดไม่ถูกเปิดใหม่ — การส่งกลับไม่ใช่รอบวัดใหม่ (ดู `surveySendBackError`) */
    tone = "todo";
    head = "หัวหน้าให้กลับไปแก้";
    sub = askedNote || "แก้ตามที่หัวหน้าแจ้งให้ครบ แล้วกดแจ้งหัวหน้า";
    action = (
      <Button tone="primary" icon={<CheckCheck size={16} aria-hidden="true" />} onClick={onReportFixed}>
        แจ้งหัวหน้าว่าแก้แล้ว
      </Button>
    );
  } else if (isClosedVisit(visit)) {
    tone = status === "unable" ? "warn" : "ok";
    head = status === "unable" ? "ปิดว่าไปแล้วเข้าไม่ได้" : "ส่งงานแล้ว";
    sub = status === "unable"
      ? "ใบกลับไปขั้นลงคิว — TS จะลงวันใหม่"
      /* ⚠️ ไม่พูดสถานะของหัวหน้า ("รอหัวหน้าเคาะ") — รางขวาบอกอยู่แล้วและเป็นคนรู้ว่าเคาะหรือยัง
         🐞 เคยเขียนตายตัว ⇒ ซ้ำพาดหัวของราง และเถียงกับรางทันทีที่หัวหน้าเคาะครบ ("พร้อมส่งผล") */
      /* ไม่ระบุว่า "หัวหน้า" เป็นคนส่ง — Senior ที่ออกหน้างานเองอ่านแถบนี้ด้วย และเขาคือคนส่งเอง */
      : `${hhmm(visit.actualEndTime) ? `เมื่อ ${hhmm(visit.actualEndTime)} น. · ` : ""}ยังแก้ผลวัดได้จนกว่าจะส่งผลให้ฝ่ายขาย`;
  } else if (status === "in_progress") {
    head = progress?.total ? `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่` : "ยังไม่มีพื้นที่ให้วัด";
    /* หัวหน้าส่งกลับระหว่างที่นัดยังเปิด — ส่งงานทีเดียวจบ (server ปิดเรื่องที่ค้างให้เอง) */
    sub = askedFix
      ? `หัวหน้าให้แก้: ${askedNote || "ดูข้อที่ยังขาดในแต่ละพื้นที่"} · แก้ครบแล้วกดส่งงาน`
      : hhmm(visit.actualStartTime)
        ? `เริ่มงาน ${hhmm(visit.actualStartTime)} น. · ครบแล้วกดส่งงาน`
        : "ครบแล้วกดส่งงาน";
    action = (
      <Button tone="primary" icon={<Send size={16} aria-hidden="true" />} onClick={onSubmit}>
        ส่งงาน
      </Button>
    );
  } else if (status === "scheduled") {
    head = "ยังไม่ได้เริ่มงาน";
    sub = "ถึงหน้างานแล้วกดเริ่มงาน — ระบบจับเวลาให้";
    action = (
      <Button tone="primary" icon={<Play size={16} aria-hidden="true" />} disabled={starting} onClick={onStart}>
        {starting ? "กำลังเริ่ม…" : "เริ่มงาน"}
      </Button>
    );
  } else {
    // ร่าง · ยกเลิก · เลื่อน — ไม่ใช่งานที่ช่างลงมือได้ ⇒ ไม่มีแถบ
    return null;
  }

  return (
    <div className={styles.bar} data-tone={tone} role="region" aria-label={`งานของนัด ${visit.code || ""}`.trim()}>
      <div className={styles.copy}>
        <p className={styles.head}>
          {tone === "ok" ? <CheckCircle2 size={16} aria-hidden="true" /> : null}
          {head}
        </p>
        <p className={styles.sub}>{sub}</p>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
