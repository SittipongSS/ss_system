"use client";
// ── แถบงานของช่างที่ขอบล่างจอประเมิน (มติผู้ใช้ 2026-09-21 · รูปแบบ A §10.5 S8) ──────────────────
//
// ⭐ flow ของช่างอยู่จบในจอเดียว: **รับงาน (= เริ่มงาน) → ใส่รายละเอียด → รูป → ส่งงาน**
//   🐞 เดิมจอประเมินไม่มีปุ่มส่งงานเลย — ช่างต้องย้อนกลับไป "งานวันนี้" แล้วกด "ปิดงาน"
//   ซึ่งเปิดแผ่นปิดงานของงานบริการ (ของที่ใช้ · ลายเซ็นลูกค้า · รูปหน้างานอีกชุด) และเตือน
//   "ยังไม่มีรูป" ทั้งที่แนบรูปรายพื้นที่ไปแล้ว
//
// 🔑 **วาดอย่างเดียว** — ทุกคำ/โทน/ปุ่ม/เหตุมาจาก `surveyFieldBarView` (เทสต์ด้วยข้อมูลล้วน)
//   🐞 แถบเดิมหน้าตาเท่ากันตั้งแต่ 0/3 ถึง 3/3 และกดส่งงานได้ทั้งที่ยังไม่ได้วัดสักพื้นที่ (pain B7) ⇒ ตอนนี้แถบบอก
//   ว่ากดได้ไหมตั้งแต่ก่อนกด ("ยังส่งไม่ได้ · ยังขาด ห้อง Treatment") และปุ่มถอยเป็นปุ่มเงียบ
// ⚠️ **ปุ่มเดียวต่อจังหวะ · ปุ่มกรมท่าปุ่มเดียวต่อจอ** — ตัวตัดสินเลือก `emphasis` ให้ (ติดด่าน หรือสองบานที่
//   "บันทึกพื้นที่นี้" กดได้อยู่ = ปุ่มเงียบ) · ของหัวหน้า (เคาะแพ็คเกจ · ส่งผล) ไม่อยู่ที่นี่ — อยู่การ์ดจัดการผลประเมิน
// ⚠️ **ปุ่มส่งงานไม่ติดด่าน** (`gated: false`) — กดได้เสมอแล้วเปิดกล่องส่งงานที่บอกรายพื้นที่พร้อม "ไปแก้" และทาง
//   "ไปแล้วเข้าไม่ได้" · ปุ่มอื่น (แจ้งหัวหน้าว่าแก้แล้ว) ยิงตรงจากแถบ ⇒ ติดด่าน = กดแล้วบอกเหตุ ไม่ยิง (`GatedAction`)
// ⚠️ **ติดขอบล่างเหนือแถบเมนูมือถือ · หลบตอนแป้นพิมพ์บนจอขึ้น** (`data-osk-hide`) — แถบที่ค้างอยู่เหนือแป้น
//   บีบช่องที่กำลังพิมพ์ (บทเรียน "field stepper" ที่ถูกตีกลับ 16/09)
import { useId } from "react";
import { CheckCheck, CheckCircle2, Lock, Play, Send } from "lucide-react";
import GatedAction from "@/components/ui/GatedAction";
import styles from "./SurveyFieldBar.module.css";

/* ไอคอน/ป้ายระหว่างยิงของแต่ละจังหวะ — ของวาด ไม่ใช่กติกา (ปุ่มไหนขึ้นเมื่อไรมาจากตัวตัดสิน) */
const ACTION_ICONS = { start: Play, submit: Send, "report-fixed": CheckCheck };

/* ชื่อปุ่มในเครื่องหมายคำพูดเป็นก้อนเดียว — 🐞 UAT 25/09 จอ 1024: "หรือเลือก “ไป" / "แล้วเข้าไม่ได้”"
   (ICU ตัดคำไทยในวงคำพูดได้ทุกที่) · ตัดบรรทัดได้แค่ก่อน “ ⇒ ชื่อปุ่มอ่านตรงกับปุ่มจริงเสมอ */
function KeepQuoted({ text }) {
  return String(text).split(/(“[^”]*”)/).map((part, index) => (
    index % 2 ? <span key={index} className={styles.keep}>{part}</span> : part
  ));
}
const BUSY_LABELS = { start: "กำลังเริ่ม…", "report-fixed": "กำลังแจ้ง…" };

/**
 * @param view    `surveyFieldBarView(...)` — `null` = ไม่มีแถบ
 * @param layout  "page" (หน้าเดียว <1000 · แถบเต็มความกว้างชนขอบจอ ม็อก A-1/AO-2) | "pane" (สองบาน · การ์ดท้ายบานรายการ AT-4/AW-1)
 * @param busy    กำลังยิงงานของปุ่มนี้อยู่ (เริ่มงาน · แจ้งแก้แล้ว)
 * @param onAction `(key) => void` — `start` | `submit` | `report-fixed`
 */
export default function SurveyFieldBar({ view, layout = "page", busy = false, onAction }) {
  const copyId = useId();
  if (!view) return null;
  const { action } = view;
  const blocked = !!action?.blocker;
  const Icon = action ? ACTION_ICONS[action.key] || Send : null;
  const primary = action?.emphasis === "primary";

  return (
    <div
      className={styles.bar}
      data-tone={view.tone}
      data-layout={layout}
      data-sticky={view.sticky ? "" : undefined}
      data-osk-hide=""
      data-survey-bar=""
      data-toast-top=""
      role="region"
      aria-label={view.label}
    >
      <div className={styles.copy} id={copyId}>
        <p className={styles.head} data-late={view.late ? "" : undefined} data-blocked={blocked ? "" : undefined}>
          {blocked ? <Lock size={14} className={styles.headIcon} aria-hidden="true" />
            : view.tone === "ok" ? <CheckCircle2 size={16} className={styles.headIcon} aria-hidden="true" /> : null}
          {view.head}
        </p>
        {view.sub ? <p className={styles.sub}><KeepQuoted text={view.sub} /></p> : null}
      </div>
      {action ? (
        <div className={styles.action}>
          <GatedAction
            tone={primary ? "primary" : "neutral"}
            blocker={action.gated ? action.blocker || "" : ""}
            disabled={busy}
            aria-busy={busy || undefined}
            /* เหตุที่ยังทำไม่ได้อยู่บนแถบข้าง ๆ ปุ่ม — ผูกให้โปรแกรมอ่านจออ่านคู่กัน */
            aria-describedby={blocked ? copyId : undefined}
            icon={<Icon size={16} aria-hidden="true" />}
            className={styles.actionBtn}
            onClick={() => onAction?.(action.key)}
          >
            {busy && BUSY_LABELS[action.key] ? BUSY_LABELS[action.key] : action.label}
          </GatedAction>
        </div>
      ) : null}
    </div>
  );
}
