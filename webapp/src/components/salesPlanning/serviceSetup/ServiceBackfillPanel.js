"use client";
// ── งานบริการย้อนหลังของใบที่อนุมัติไปแล้ว (D11 · r3 B4 · ม็อก BackfillApprovedSo) ────────────────────────────────
//
// ⭐ `ServiceBackfillBanner` — แถบบนสุดของคอลัมน์หลัก: บอกว่าใบนี้ต้องตั้งงานบริการย้อนหลัง + สถานะ (ตีกลับ = เหตุผล)
// ⭐ `ServiceBackfillRailCard` — การ์ดราง "งานบริการ (ใบเดิม)": ขั้น ตั้งค่า → ผู้จัดการตรวจ → ส่ง TS · แถวตรวจ · ปุ่มตามสิทธิ์
//   · ปุ่มมาจาก `setup.data.backfill` ที่ server คิด (ยื่น = คนแก้ใบนี้ได้ · อนุมัติ/ตีกลับ = ผู้จัดการฝ่ายขาย) — จอไม่คิดสิทธิ์เอง
//   · **หน้าเป็นเจ้าของโมดัล** (ยืนยันยื่น · อนุมัติ + เหตุผล Admin Override · ตีกลับ) — การ์ดแค่เรียก callback
// 🔴 ทั้งสองชิ้นขึ้นเฉพาะขั้น 'backfill' ของก้อน GET (D25: ใบที่อนุมัติแล้วแต่ไม่มีอะไรให้ตั้ง = ไม่ขึ้นที่ไหนเลย)
// 🔴 แถวตรวจ **เป็นกลางก่อนกด** (ตัวเลข x/n เฉย ๆ ไม่มีแดง ไม่มี ✗ — กฎ 3) · แดงเมื่อ `pressed` (กดยื่นแล้วไม่ผ่าน) เท่านั้น
import { Repeat } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import StepTrack from "@/components/ui/StepTrack";
import Tag from "@/components/ui/Tag";
import { fmtDate, fmtNumber } from "@/lib/format";
import { SERVICE_BACKFILL_STATE_LABELS } from "@/lib/sales/serviceSetup";
import { backfillBannerText, backfillRailChecks, backfillStateOfView } from "./serviceSetupDraft";
import styles from "./ServiceBackfillPanel.module.css";

const STATE_TONE = Object.freeze({ not_started: "neutral", editing: "info", submitted: "warning", rejected: "danger" });

function rejectedLine(state) {
  const who = state?.rejectedByName || "ผู้จัดการฝ่ายขาย";
  const when = state?.rejectedAt ? ` ${fmtDate(state.rejectedAt)}` : "";
  return `ตีกลับโดย ${who}${when} · ${state?.rejectedReason || "ไม่ระบุเหตุผล"}`;
}

/** แถบบนสุดของคอลัมน์หลัก — ขึ้นเฉพาะ `data.flow === 'backfill'` · ยื่นตรวจแล้ว = บอกว่ารอผู้จัดการ (ไม่สั่งให้ตั้งแล้วยื่นซ้ำ) */
export function ServiceBackfillBanner({ setup }) {
  const view = setup?.data || null;
  const state = backfillStateOfView(view);
  if (!state) return null;
  const rejected = state === "rejected";
  return (
    <StatusNotice
      tone={rejected ? "warning" : "info"}
      title="ใบนี้อนุมัติก่อนมีการตั้งงานบริการ"
      action={<Tag tone={STATE_TONE[state]}>{SERVICE_BACKFILL_STATE_LABELS[state]}</Tag>}
    >
      <span className={styles.bannerLine}>{backfillBannerText(view)}</span>
      {rejected ? <span className={styles.bannerReject}>{rejectedLine(view.state)}</span> : null}
    </StatusNotice>
  );
}

/**
 * การ์ดราง "งานบริการ (ใบเดิม)"
 * @param setup ผลของ `useServiceSetup` · @param pressed กด "ยื่นตรวจงานบริการ" แล้วไม่ผ่าน (แถวที่ยังไม่ครบเป็นแดง)
 * @param busy กำลังยิงคำสั่ง (ปุ่มดับ) · @param onSubmit / onApprove / onReject — หน้าเปิดโมดัลของตัวเอง
 */
export function ServiceBackfillRailCard({ setup, pressed = false, busy = false, onSubmit, onApprove, onReject }) {
  const view = setup?.data || null;
  const state = backfillStateOfView(view);
  if (!state) return null;
  const submitted = state === "submitted";
  const rights = view.backfill || {};
  const setupState = view.state || {};
  const totals = view.totals || {};
  const steps = [
    { key: "setup", label: "ตั้งค่า", state: submitted ? "done" : "now", note: state === "rejected" ? "ตีกลับ — แก้แล้วยื่นใหม่" : null },
    { key: "review", label: "ผู้จัดการตรวจ", state: submitted ? "now" : "todo" },
    { key: "ts", label: "ส่ง TS", state: "todo" },
  ];
  const checks = submitted ? [] : backfillRailChecks(view);

  return (
    <DetailCard
      icon={Repeat}
      eyebrow="Service setup · ใบเดิม"
      title="งานบริการ (ใบเดิม)"
      meta="ตั้งย้อนหลังบนใบที่อนุมัติแล้ว — ผู้จัดการฝ่ายขายตรวจก่อนส่งให้ TS"
      actions={<Tag tone={STATE_TONE[state]}>{SERVICE_BACKFILL_STATE_LABELS[state]}</Tag>}
    >
      <div className={styles.rail}>
        <StepTrack steps={steps} ariaLabel="ขั้นของงานบริการย้อนหลัง" />
        {state === "rejected" ? <p className={styles.railReject}>{rejectedLine(setupState)}</p> : null}

        {submitted ? (
          <p className={styles.railNote}>
            {`ยื่นตรวจงานบริการ ${fmtDate(setupState.submittedAt)} · ${fmtNumber(totals.zones || 0)} โซนใน ${fmtNumber(totals.sites || 0)} ไซต์ · รอตั้งรอบ`}
            {setupState.submittedByName ? ` · ยื่นโดย ${setupState.submittedByName}` : ""}
          </p>
        ) : (
          <>
            <p className={styles.checksTitle}>สิ่งที่ตรวจตอนยื่น</p>
            <dl className={styles.checks}>
              {checks.map((row) => (
                /* บรรทัดรองอยู่ใต้ป้าย (ซ้าย) ตามม็อก — ช่องขวา (auto) มีแต่ค่าสั้น ⇒ ข้อความยาวไม่ดันป้ายจนหดเหลือคำละบรรทัด */
                <div key={row.key} className={styles.check} data-bad={pressed && !row.ok ? "" : undefined}>
                  <dt>
                    {row.label}
                    {row.sub ? <span className={styles.checkSub}>{row.sub}</span> : null}
                  </dt>
                  <dd><span className={styles.checkValue}>{row.value}</span></dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {(rights.canSubmit && !submitted) || rights.canReview ? (
          <div className={styles.railActions}>
            {rights.canSubmit && !submitted ? (
              <Button tone="primary" disabled={busy} onClick={() => onSubmit?.()}>ยื่นตรวจงานบริการ</Button>
            ) : null}
            {rights.canReview ? (
              <>
                <Button tone="primary" disabled={busy || !!rights.reviewBlockedReason} onClick={() => onApprove?.()}>อนุมัติงานบริการ</Button>
                <Button tone="neutral" disabled={busy} onClick={() => onReject?.()}>ตีกลับให้แก้ไข</Button>
                {rights.reviewBlockedReason ? <span className={styles.railReason}>{rights.reviewBlockedReason}</span> : null}
              </>
            ) : null}
          </div>
        ) : null}

        <p className={styles.railFoot}>ยอดใบ · Actual · เอกสาร ไม่เปลี่ยนไม่ว่ากดทางไหน</p>
      </div>
    </DetailCard>
  );
}
