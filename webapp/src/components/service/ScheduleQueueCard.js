"use client";
// ── การ์ดหนึ่งงานในแผง "รายการงาน" ของหน้าจัดคิวเจ้าหน้าที่ (มติผู้ใช้ 2026-09-22) ──
//
// ⭐ แผงนี้วางคู่ตารางสัปดาห์ (คอลัมน์ซ้ายกว้าง ~24rem) ⇒ หนึ่งงานเป็นการ์ด ไม่ใช่แถวตาราง
//    ข้อมูลเรียงชุดเดียวกันทุกถัง: รหัส · ไซต์ · วัน · เจ้าหน้าที่ · ภาระ · ด่าน/สิ่งที่ต้องทำ · ปุ่ม
//    (คนจัดคิวสลับถังทั้งวัน — ตำแหน่งของข้อมูลต้องไม่ย้ายตามถัง)
// ⚠️ การ์ด **ไม่ใช่ปุ่มทั้งใบ** — ในการ์ดมีหลายการกระทำ (เปิดนัด · ปล่อย · ปฏิทิน · แก้ด่าน)
//    ปุ่มซ้อนปุ่มผิดกติกา hard-zero ของ audit-ui
// ⭐ **การ์ดคำร้องรอลงคิว** (`row.type === 'request'` · มติเจ้าของ 23/09) ใช้การ์ดตัวนี้ตัวเดียว —
//    ลำดับช่องเดิมทุกช่อง (รหัส · ไซต์ · วัน · คน · ภาระ · สิ่งที่ต้องทำ · ปุ่ม) ⇒ คนจัดคิวไม่ต้อง
//    เรียนหน้าตาการ์ดชุดที่สอง · ต่างกันแค่:
//    · รหัสเป็น **ลิงก์ไปหน้าใบ** (ยังไม่มีนัดให้เปิด) · ตีกลับ/อ่านรายละเอียดเต็มอยู่ที่หน้าใบ
//    · ปุ่ม "รับเรื่อง" (ใบรอรับเรื่อง) หรือ "ลงคิวเข้าพื้นที่"/"ลงคิวใหม่" — **ไม่มีคลิกเดียวที่ข้ามสองก้าว**
//    · ไม่มีปุ่ม "ปฏิทิน" — ปุ่มนั้นพาไปหานัดบนตาราง ซึ่งการ์ดคำร้องยังไม่มี
//    · ปุ่มโผล่เฉพาะคนที่ตอบคำร้องของ TS ได้ (`canAnswer` · ไม่มีสิทธิ์ = ไม่โชว์)
// ⭐ **ปุ่ม "ลบนัด"** (มติเจ้าของ 24/09 "ไม่มีปุ่มลบรอบนอกรอบด้วย") — เฉพาะงานนอกรอบที่ยังไม่ปิด
//    (`row.actions.delete` จาก `visitDeleteButton`) · เหตุที่ลบไม่ได้บอกตอนกด (`row.deleteBlocker` =
//    ด่านตัวเดียวกับที่ API ตีกลับ) · สีแดงแบบเส้นขอบ = การกระทำรอง ไม่ใช่ปุ่มหลักของการ์ด · วางท้ายสุด
import Link from "next/link";
import { AlertTriangle, CalendarCheck, CalendarPlus, CalendarSearch, Check, FileText, Inbox, Trash2 } from "lucide-react";
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
  /* ตอบคำร้องของ TS ได้ (รับเรื่อง/ลงคิว) — ชุดเดียวกับที่ API ใช้ตัดสินว่าจะส่งการ์ดคำร้องมาไหม */
  canAnswer = false,
  releasing = false,
  /* กำลังยิงลบใบนี้อยู่ — กันกดซ้ำ (กล่องยืนยันปิดไปแล้ว คำขอยังไม่กลับ) */
  deleting = false,
  onOpen,
  onRelease,
  onCalendar,
  onAcknowledge,
  onCommitDue,
  onDelete,
}) {
  const isRequest = row.type === "request";
  /* ป้ายหัวการ์ด (เฉพาะรอจัด) กับบรรทัดผ่านด่านประกอบมาจาก scheduleQueueView — ให้คำค้นเห็นคำเดียวกัน */
  const tag = row.tag;
  const toneOf = (tone) => (TONE_CLASS[tone] ? styles[TONE_CLASS[tone]] : "");
  const fixLabel = (fix) => (fix === "assignee" ? "เลือกเจ้าหน้าที่" : "แก้วัน/เวลา");
  const fixField = (fix) => (fix === "assignee" ? "assignee" : "scheduledDate");

  return (
    <li className={styles.card} id={`queue-row-${row.id}`} data-stale={row.stale ? "yes" : undefined}>
      <div className={styles.top}>
        {isRequest ? (
          /* ใบยังไม่มีนัด ⇒ รหัสพาไปหน้าใบ (อ่านเต็ม · ตีกลับ · เธรด) ไม่ใช่เปิดโมดัลนัด */
          <Link href={row.href} className={`linklike ${styles.code}`} data-queue-code={row.id}>
            {row.code}
          </Link>
        ) : (
          <button
            type="button"
            className={`text-action ${styles.code}`}
            onClick={() => onOpen?.(row.visit)}
            data-queue-code={row.id}
          >
            {row.code}
          </button>
        )}
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
        {/* เรื่องที่ขอ (หัวใบ) — สองบรรทัดพอให้รู้ว่าเรื่องอะไร อ่านเต็มที่หน้าใบ */}
        {row.title && <p className={styles.title}>{row.title}</p>}
        {row.warns.map((warn) => (
          <p key={warn} className={`${styles.gate} ${styles.warn}`}>
            <AlertTriangle size={13} aria-hidden="true" />
            <span>{warn}</span>
          </p>
        ))}
        <p className={styles.origin}>{row.origin}</p>
      </div>

      <div className={styles.actions}>
        {isRequest && canAnswer && row.actions.acknowledge && (
          /* ⭐ โชว์เสมอ บอกเหตุตอนกด — ด่านตัวเดียวกับที่ server ตีกลับ (`acknowledgeRequestError`) */
          <GatedAction
            tone="neutral" size="sm"
            blocker={row.ackBlocker}
            onClick={() => onAcknowledge?.(row)}
            icon={<Inbox size={14} aria-hidden="true" />}
          >
            {row.actionLabel}
          </GatedAction>
        )}
        {isRequest && canAnswer && row.actions.commitDue && (
          <Button tone="neutral" size="sm" onClick={() => onCommitDue?.(row)}
            icon={<CalendarPlus size={14} aria-hidden="true" />}>
            {row.actionLabel}
          </Button>
        )}
        {isRequest && canAnswer && row.actionHint && (
          <span className={styles.actionHint}>{row.actionHint}</span>
        )}
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
        {/* ปฏิทินพาไปหานัดบนตาราง — การ์ดที่ยังไม่มีนัด (คำร้องรอลงคิว) ไม่มีอะไรให้พาไป */}
        {row.visit && (
          <Button
            tone="neutral" variant="quiet" size="sm"
            onClick={() => onCalendar?.(row)}
            aria-label={`ดู ${row.code} ในปฏิทิน`}
            icon={<CalendarSearch size={14} aria-hidden="true" />}
          >
            ปฏิทิน
          </Button>
        )}
        {/* ⚠️ สิทธิ์ = `canEdit` (canEditService ชุดเดียวกับที่ API ยอมให้ลบ) · ไม่มีสิทธิ์ = ไม่โชว์ */}
        {canEdit && row.actions.delete && (
          <GatedAction
            tone="danger" variant="outline" size="sm"
            blocker={row.deleteBlocker}
            onClick={() => onDelete?.(row.visit)}
            disabled={deleting}
            aria-label={`ลบนัด ${row.code}`}
            icon={<Trash2 size={14} aria-hidden="true" />}
          >
            {deleting ? "กำลังลบ…" : "ลบนัด"}
          </GatedAction>
        )}
      </div>
    </li>
  );
}
