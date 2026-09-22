"use client";
// ── การ์ดหนึ่งงานในแผง "รายการงาน" ของหน้าจัดคิวเจ้าหน้าที่ (มติผู้ใช้ 2026-09-22) ──
//
// ⭐ แผงนี้วางคู่ตารางสัปดาห์ (คอลัมน์ซ้ายกว้าง ~24rem) ⇒ หนึ่งงานเป็นการ์ด ไม่ใช่แถวตาราง
//    ข้อมูลเรียงชุดเดียวกันทุกถัง: รหัส · ไซต์ · วัน · เจ้าหน้าที่ · ภาระ · ด่าน/สิ่งที่ต้องทำ · ปุ่ม
//    (คนจัดคิวสลับถังทั้งวัน — ตำแหน่งของข้อมูลต้องไม่ย้ายตามถัง)
// ⚠️ การ์ด **ไม่ใช่ปุ่มทั้งใบ** — ในการ์ดมีหลายการกระทำ (เปิดนัด · ปล่อย · ปฏิทิน · แก้ด่าน)
//    ปุ่มซ้อนปุ่มผิดกติกา hard-zero ของ audit-ui
import Link from "next/link";
import { AlertTriangle, CalendarCheck, CalendarSearch, Check, FileText } from "lucide-react";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import StatusBadge from "@/components/ui/StatusBadge";
import { gateBlocker } from "@/lib/service/visitGate";
import { naText } from "@/lib/format";
import styles from "./ScheduleQueueCard.module.css";

const TONE_CLASS = { warn: "warn", bad: "bad", ok: "ok" };

export default function ScheduleQueueCard({
  row,
  canEdit = false,
  releasing = false,
  onOpen,
  onRelease,
  onCalendar,
}) {
  /* ป้ายหัวการ์ด (เฉพาะรอจัด) กับบรรทัดผ่านด่านประกอบมาจาก scheduleQueueView — ให้คำค้นเห็นคำเดียวกัน */
  const tag = row.tag;
  const toneOf = (tone) => (TONE_CLASS[tone] ? styles[TONE_CLASS[tone]] : "");
  const fixLabel = (fix) => (fix === "assignee" ? "เลือกเจ้าหน้าที่" : "แก้วัน/เวลา");
  const fixField = (fix) => (fix === "assignee" ? "assignee" : "scheduledDate");

  return (
    <li className={styles.card} id={`queue-row-${row.id}`} data-stale={row.stale ? "yes" : undefined}>
      <div className={styles.top}>
        <button
          type="button"
          className={`text-action ${styles.code}`}
          onClick={() => onOpen?.(row.visit)}
          data-queue-code={row.id}
        >
          {row.code}
        </button>
        <span className={`${styles.kind} ${styles[`kind_${row.kind}`] || ""}`}>{row.kindLabel}</span>
        {tag && <StatusBadge size="sm" tone={tag.tone} label={tag.label} className={styles.tag} />}
      </div>

      <p className={styles.site}>
        <span className="mono">{row.siteCode || naText(null)}</span>
        <span className={styles.sub}>{row.siteName}{row.customer ? ` · ${row.customer}` : ""}</span>
      </p>

      <p className={styles.line}>
        <span>{row.dateLine}{row.timeLine ? ` · ${row.timeLine}` : ""}</span>
        {row.rel.text && <span className={toneOf(row.rel.tone)}> · {row.rel.text}</span>}
      </p>

      <p className={styles.line}>
        {row.who.linkId ? (
          /* ชื่อที่กดได้ = งานวันนี้ของคนนั้น (มติ 2026-08-02 ข้อ 2) — เฉพาะนัดที่ขึ้นตารางแล้ว */
          <Link href={`/service/today?user=${encodeURIComponent(row.who.linkId)}`} className="linklike">{row.who.text}</Link>
        ) : (
          <span className={toneOf(row.who.tone)}>{row.who.text}</span>
        )}
        {row.who.sub && <span className={styles.muted}> · {row.who.sub}</span>}
      </p>

      <p className={styles.line}>
        <span>{row.siteLoadText || naText(null)}</span>
        {row.dayLoad && <span className={toneOf(row.dayLoad.tone)}> · {row.dayLoad.text}</span>}
      </p>

      <div className={styles.todo}>
        {row.ready && (
          <p className={`${styles.gate} ${styles.ok}`}>
            <Check size={13} aria-hidden="true" />
            <span>{row.readyText}</span>
          </p>
        )}
        {row.gateItems.map((item) => (
          <p key={item.key} className={styles.gate}>
            <StatusBadge size="sm" tone={item.ownerTone} label={item.owner || naText(null)} className={styles.owner} />
            <span>
              {item.reason}
              {canEdit && item.fix && (
                <>
                  {" — "}
                  <button type="button" className="text-action" onClick={() => onOpen?.(row.visit, fixField(item.fix))}>
                    {fixLabel(item.fix)}
                  </button>
                </>
              )}
            </span>
          </p>
        ))}
        {row.status && (
          <p className={styles.gate}>
            <StatusBadge size="sm" tone={row.status.tone} label={row.status.label} />
            {row.status.text && <span>{row.status.text}</span>}
          </p>
        )}
        {row.warns.map((warn) => (
          <p key={warn} className={`${styles.gate} ${styles.warn}`}>
            <AlertTriangle size={13} aria-hidden="true" />
            <span>{warn}</span>
          </p>
        ))}
        <p className={styles.origin}>{row.origin}</p>
      </div>

      <div className={styles.actions}>
        {canEdit && row.actions.release && (
          /* ⭐ โชว์เสมอแม้ติดด่าน — บอกเหตุตอนกด ไม่ใช่ปุ่มหาย (GatedAction · มติ 2026-08-22)
             เหตุมาจาก gateBlocker ตัวเดียวกับที่ server ใช้ปฏิเสธ */
          <GatedAction
            tone="neutral" size="sm"
            blocker={row.ready ? "" : gateBlocker(row.gate)}
            onClick={() => onRelease?.(row)}
            disabled={releasing}
            icon={<CalendarCheck size={14} aria-hidden="true" />}
          >
            {releasing ? "กำลังปล่อย…" : "ปล่อยขึ้นตาราง"}
          </GatedAction>
        )}
        {canEdit && row.actions.open && (
          <Button tone="neutral" size="sm" onClick={() => onOpen?.(row.visit)}>เปิดนัด</Button>
        )}
        {canEdit && row.actions.assign && (
          <Button tone="warning" variant="outline" size="sm" onClick={() => onOpen?.(row.visit, "assignee")}>มอบหมาย</Button>
        )}
        {row.actions.report && (
          <Button as={Link} href={`/service/visits/${encodeURIComponent(row.id)}`} tone="neutral" size="sm"
            icon={<FileText size={14} aria-hidden="true" />}>
            ใบรายงาน
          </Button>
        )}
        <Button
          tone="neutral" variant="quiet" size="sm"
          onClick={() => onCalendar?.(row)}
          aria-label={`ดู ${row.code} ในปฏิทิน`}
          icon={<CalendarSearch size={14} aria-hidden="true" />}
        >
          ปฏิทิน
        </Button>
      </div>
    </li>
  );
}
