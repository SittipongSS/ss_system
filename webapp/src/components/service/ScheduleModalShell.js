"use client";
// ── เปลือกเดียวของโมดัลจัดคิว — แบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) ──────────────────────
//
// ⭐ สองงานบนหน้าจัดคิว (แก้นัด/ปล่อยร่าง = `ServiceVisitModal` · ลงคิวเข้าพื้นที่ = `CommitDueDialog`)
//    เคยเป็นสองเปลือกคนละหน้าตา (กว้าง 820 vs 600 · ปุ่มท้ายลอยกลางเนื้อ vs แถบจริง · pain 1 · 13)
//    ⇒ ทั้งสองวาด **เปลือกนี้ตัวเดียว** แล้วเติมแค่ของในช่อง (กติกา AGENTS.md: ฟอร์มเดียวกัน = component เดียว)
//
// โครง (แบบ A):
//   หัว    — ชื่องาน · ชิปชนิดงาน · ชิปสถานะ (ร่าง = เส้นประ) · ที่มา / บรรทัดไซต์ "รหัส · ชื่อ · ลูกค้า"
//   เนื้อ   — ซ้าย (`aside` "งานนี้" + ด่าน · `tail` หมายเหตุ + ประวัติ) · ขวา (`main` วัน เวลา คน)
//            `layout="single"` = คอลัมน์เดียว (แจ้งกำหนดส่งของหัวข้ออื่น) · มือถือ = คอลัมน์เดียวเสมอ
//   ท้าย   — ปุ่มรองชิดซ้าย · **ปุ่มหลักปุ่มเดียว** ชิดขวา · บรรทัดผลลัพธ์ใต้ปุ่ม ("จะขึ้นช่อง …" / เหตุที่ติด)
//
// ⚠️ **`tone="primary"` มีที่นี่ที่เดียว** — ผู้เรียกส่งแค่ป้าย/เหตุ/ตัวกด (pain 6: ร่างเคยมีปุ่มสีหลักสองปุ่ม)
// ⚠️ ปุ่มหลักเป็น `GatedAction` เสมอ — ติดด่านข้อมูล = กดได้แล้วบอกเหตุ ไม่ใช่ปุ่มจาง (มติ 2026-08-22)
//    · `disabled` ใช้แค่ "กำลังส่ง" กับเงื่อนไขที่ไม่มีเหตุให้อธิบาย (เหตุผลข้ามด่านยังไม่ครบ 10 ตัว)
// ⚠️ **ทุกปุ่มท้ายดับพร้อมกันตอน `busy`** — ระหว่างบันทึก/ลบ ปุ่มที่เขียนใบเดียวกันต้องกดไม่ได้ทุกตัว
// ⚠️ error ขึ้นที่บรรทัดผลลัพธ์ (`role="alert"`) ซึ่งอยู่ในแถบท้ายที่ไม่เลื่อน ⇒ ไม่จมใต้เนื้อที่เลื่อนอยู่
// ⭐ เนื้อยังมีต่อข้างล่าง ⇒ เงาที่ขอบบนของแถบท้าย (`more`) — 🐞 รีวิว UAT 24/09: แถวสุดท้ายถูกขอบแถบท้ายตัด
//    โดยไม่มีอะไรบอกว่าเลื่อนได้ · พื้นเปลือกทึบ (`--panel-solid`) ไม่ให้ตารางข้างหลังทะลุช่องว่างของคอลัมน์ขวา
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Check, Info, XCircle } from "lucide-react";
import Modal from "@/components/Modal";
import GatedAction from "@/components/ui/GatedAction";
import { KeepTogether } from "./ScheduleModalParts";
import styles from "./ScheduleModalShell.module.css";

const OUTCOME_ICONS = { ok: Check, warn: AlertTriangle, info: Info, error: XCircle };

/**
 * @param layout     'split' (สองคอลัมน์ · Modal xl) | 'single' (คอลัมน์เดียว · Modal sm)
 * @param kind       `{ key, label }` ชิปชนิดงาน (สีตามชนิด) · null = ไม่มีชิป
 * @param status     `{ label, draft }` ชิปสถานะ · draft = เส้นประ · null = ไม่มีชิป (สร้างใหม่)
 * @param origin     ที่มา ("จากรอบบริการ" · "RQ-… · ผู้ขอ …")
 * @param context    `{ code, name, customer }` บรรทัดไซต์ใต้ชื่อ · null = ไม่มี
 * @param aside/main/tail  ของในช่อง — ซ้ายบน / ขวา / ซ้ายล่าง
 * @param secondary  `[{ key, label, onClick, blocker?, tone?, variant?, icon? }]` ปุ่มรองชิดซ้าย (ตามลำดับ)
 * @param primary    `{ label, busyLabel, onClick, blocker?, disabled?, icon? }` ปุ่มหลักปุ่มเดียว
 * @param outcome    `{ tone: 'ok'|'warn'|'info'|'error', text }` บรรทัดใต้ปุ่มหลัก — กดแล้วจะเกิดอะไร
 * @param error      ข้อความผิดพลาด — ทับ `outcome` เสมอ
 * @param busy       กำลังส่ง/ลบ — ล็อกทุกช่อง (fieldset) และทุกปุ่มท้าย · ปิดด้วย Esc/กากบาทไม่ได้
 */
export default function ScheduleModalShell({
  open,
  onClose,
  busy = false,
  layout = "split",
  title,
  kind = null,
  status = null,
  origin = "",
  context = null,
  aside = null,
  main = null,
  tail = null,
  secondary = [],
  primary,
  outcome = null,
  error = "",
  initialFocusRef,
}) {
  const outcomeId = useId();
  const bodyRef = useRef(null);
  const [more, setMore] = useState(false);
  const split = layout === "split";

  /* เนื้อเลื่อนได้อีกไหม — ฟังการเลื่อนของ `.drawer-body` (ตัวที่เลื่อนจริง = แม่ของ fieldset) และขนาดที่เปลี่ยน
     (ส่วนพับกาง · ตัวเลือกคนเปลี่ยนทรง) · เป็นแค่เงาบอกทาง ไม่ใช่ข้อมูล */
  useEffect(() => {
    const body = bodyRef.current;
    const scroller = body?.parentElement;
    if (!open || !scroller || typeof ResizeObserver === "undefined") return undefined;
    const update = () => setMore(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1);
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(body);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [open]);
  const shown = error ? { tone: "error", text: error } : outcome;
  const OutcomeIcon = shown?.text ? OUTCOME_ICONS[shown.tone] || Info : null;

  const titleAside = kind || status || origin ? (
    <>
      {kind ? <span className={styles.chip} data-kind={kind.key}>{kind.label}</span> : null}
      {status ? <span className={styles.chip} data-draft={status.draft ? "yes" : undefined}>{status.label}</span> : null}
      {origin ? <span className={styles.origin}>{origin}</span> : null}
    </>
  ) : null;
  const siteName = context ? [context.code, context.name].filter(Boolean).join(" · ") : "";
  const subtitle = context && (siteName || context.customer) ? (
    <span className={styles.context}>
      {siteName ? <b>{siteName}</b> : null}
      {siteName && context.customer ? " · " : null}
      {context.customer || null}
    </span>
  ) : null;

  const footer = (
    <div className={styles.footer}>
      <div className={styles.secondary}>
        {secondary.map((action) => (
          <GatedAction
            key={action.key}
            tone={action.tone || "neutral"}
            variant={action.variant || "filled"}
            blocker={action.blocker || ""}
            onClick={action.onClick}
            disabled={busy || action.disabled}
            icon={action.icon}
            className={styles.touch}
          >
            {action.label}
          </GatedAction>
        ))}
      </div>
      {primary ? (
        <GatedAction
          tone="primary"
          blocker={primary.blocker || ""}
          onClick={primary.onClick}
          disabled={busy || primary.disabled}
          icon={primary.icon}
          aria-describedby={outcomeId}
          className={`${styles.touch} ${styles.primary}`}
        >
          {busy && primary.busyLabel ? primary.busyLabel : primary.label}
        </GatedAction>
      ) : null}
      <p
        id={outcomeId}
        className={styles.outcome}
        data-tone={shown?.tone || undefined}
        role={shown?.tone === "error" ? "alert" : "status"}
      >
        {OutcomeIcon ? <OutcomeIcon size={14} aria-hidden="true" className={styles.outcomeIcon} /> : null}
        {shown?.text ? <span><KeepTogether text={shown.text} /></span> : null}
      </p>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleAside={titleAside}
      subtitle={subtitle}
      size={split ? "xl" : "sm"}
      sheetOnPhone
      className={more ? `${styles.shell} ${styles.more}` : styles.shell}
      dismissible={!busy}
      footer={footer}
      initialFocusRef={initialFocusRef}
    >
      {/* ⭐ fieldset ที่ disabled ล็อกทุกช่องข้างในพร้อมกันระหว่างส่ง — ไม่ต้องไล่ส่ง disabled ทีละช่องแล้วลืมสักช่อง */}
      <fieldset ref={bodyRef} className={styles.body} data-layout={split ? "split" : "single"} disabled={busy}>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
        <div className={styles.main}>{main}</div>
        {tail ? <div className={styles.tail}>{tail}</div> : null}
      </fieldset>
    </Modal>
  );
}
