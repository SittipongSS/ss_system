"use client";
// ── ชิ้นรอบตารางของวันงวด: ปุ่ม "เติมวันงวดที่ว่าง…" บนการ์ด · แถบบันทึกตรึงล่าง ──
//
// ⭐ บันทึกมีที่เดียว = ปุ่ม navy "บันทึก N งวด" บนแถบล่าง — คำขอเดียว `schedule-many` · ยกเลิก = ทิ้งร่างทั้งหมด + toast "เอาคืน"
// ⭐ แถบขึ้นเมื่อมีร่าง (หรือแผงเติมเปิด) เท่านั้น — รุ่นสองช่องแยก (มติ 02/11) ไม่มีโหมดให้เข้า ช่องวันในตารางแก้ได้เลย
// ⭐ แถบบอกผลก่อนกด (กติกา #1223): เปลี่ยนกี่งวด · ดูเดิม → ใหม่ · แทนกำหนดชำระเดิมกี่งวด (ป้ายแดง/ด่านนัดช่างนับจากวันใหม่) ·
//   งวดที่ถูกแก้จากอีกหน้าต่างระหว่างร่าง (หลัง 409) · ร่างที่ถูกทิ้งเพราะงวดล็อกแล้ว
// ⭐ ช่วงครอบบริการที่แก้ไปกับแถบนี้ด้วย (ม็อก split-v6 ข้อ 6 · 03/11) — นับ/สรุปรายงวดจาก `mode.edits` (วันงวด และ/หรือ ช่วงครอบ) ·
//   ร่างช่วงครอบที่ด่าน coverage ตีกลับ = `blocker` จากผู้เรียก (ปุ่มบันทึกดับ พร้อมเหตุบนแถบ)
import { CalendarRange, ChevronDown, ChevronUp, History, Info, Lock, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import StatusNotice from "@/components/ui/StatusNotice";
import { SKIP_TEXT, formatBillingDate } from "@/lib/sales/billingRule";
import styles from "./InstallmentDates.module.css";

/* ปุ่ม "เติมวันงวดที่ว่าง…" บนหัวการ์ด — ไม่มีสิทธิ์/แผงเปิดอยู่แล้ว = ไม่วาด · ร่างช่วงครอบค้าง/ล็อกทั้งใบ = วาดแล้วบอกเหตุตอนกด
   (ช่องวันในตารางแก้ทีละงวดได้เลย — ปุ่มนี้สำหรับเติมหลายงวดตามรอบ/ตามเดือน) */
export function InstallmentDateFillButton({ mode, disabled = false }) {
  if (!mode.available || mode.fill) return null;
  return (
    <GatedAction size="sm" variant="ghost" icon={<CalendarRange size={13} aria-hidden="true" />}
      blocker={mode.blocker} disabled={disabled} onClick={() => mode.openFill()}>
      เติมวันงวดที่ว่าง…
      {mode.emptyCount ? <span className={styles.entryCount}> · ว่าง {mode.emptyCount}</span> : null}
    </GatedAction>
  );
}

/* ค่าของงวดหนึ่งช่องในรายการ เดิม → ใหม่ */
const billText = (v) => (v.billingDate ? formatBillingDate(v.billingDate) : v.billingEvent ? `รอ “${v.billingEvent}”` : "ยังไม่มีวัน");
const dueText = (v) => (v.dueDate ? formatBillingDate(v.dueDate) : "ยังไม่มีวัน");
const coverText = (v) => (v.coversFrom || v.coversTo
  ? `${v.coversFrom ? formatBillingDate(v.coversFrom) : "…"} – ${v.coversTo ? formatBillingDate(v.coversTo) : "…"}`
  : "ยังไม่ระบุ");

function ChangePair({ label, from, to }) {
  if (from === to) return null;
  return (
    <span className={styles.pair}>
      {label} <s>{from}</s> → <b>{to}</b>
    </span>
  );
}

/* แถบบันทึก (ติดขอบล่างของจอ) — ขึ้นเมื่อมีร่าง หรือแผงเติมเปิดอยู่ · หน้าสร้าง SO ไม่มีแถบนี้ (ร่างไปกับใบ) */
export function InstallmentDateBar({ mode, error = "", blocker = "", savingLabel = "กำลังบันทึก…" }) {
  if (mode.create || !(mode.dirty || mode.fill)) return null;
  const { changes, dropped, replaced, edits } = mode;
  const n = edits.length;
  const stale = edits.filter((edit) => edit.stale);
  const warnCount = changes.reduce((sum, change) => sum
    + (mode.warnings[change.row.id] || []).filter((w) => w.tone === "warn").length, 0);
  const seqs = (list) => list.map((item) => item.row?.seq).filter((seq) => seq != null).join(", ");
  return (
    /* `data-toast-top` = toast ขึ้นบนจอระหว่างที่แถบอยู่ (toast ที่ขอบล่างทับปุ่มบันทึก 3.6 วินาที — กติกาของ Toast.module.css) */
    <div className={styles.bar} role="region" aria-label="บันทึกงวดที่แก้" data-toast-top="">
      {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
      <div className={styles.barRow}>
        <div className={styles.barInfo}>
          <p className={styles.barCount} aria-live="polite">
            {n ? <>เปลี่ยน <span className={styles.n}>{n}</span> งวด</> : "ยังไม่ได้แก้ — เลือกตัวเลือกในแผงเติม หรือแก้ช่องในตาราง"}
            {n ? (
              <Button size="sm" variant="quiet" aria-expanded={mode.summaryOpen}
                icon={mode.summaryOpen ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                onClick={() => mode.setSummaryOpen(!mode.summaryOpen)}>
                ดูเดิม → ใหม่
              </Button>
            ) : null}
          </p>
          {replaced ? (
            <p className={styles.barNote} data-tone="warn">
              <TriangleAlert size={13} aria-hidden="true" />
              แทนกำหนดชำระเดิม {replaced} งวด — ป้ายเลยกำหนดและด่านนัดช่างนับจากวันใหม่ทันทีที่บันทึก
            </p>
          ) : null}
          {stale.length ? (
            <p className={styles.barNote} data-tone="warn">
              <History size={13} aria-hidden="true" />
              งวดที่ {seqs(stale)} ถูกแก้จากอีกหน้าต่างระหว่างที่ร่างอยู่ — ตรวจค่าในตารางแล้วกดบันทึกอีกครั้ง
            </p>
          ) : null}
          {blocker ? (
            <p className={styles.barNote} data-tone="warn" role="alert">
              <TriangleAlert size={13} aria-hidden="true" />
              {blocker}
            </p>
          ) : null}
          {mode.saveBlocker ? (
            <p className={styles.barNote} data-tone="warn" role="alert">
              <TriangleAlert size={13} aria-hidden="true" />
              {mode.saveBlocker}
            </p>
          ) : null}
          {dropped.length ? (
            <p className={styles.barNote} data-tone="warn">
              <Lock size={13} aria-hidden="true" />
              ร่างของ{seqs(dropped) ? `งวดที่ ${seqs(dropped)}` : "งวดที่ไม่อยู่ในใบแล้ว"} ไม่ถูกบันทึก — {dropped[0].reason}
            </p>
          ) : null}
          {warnCount ? (
            <p className={styles.barNote}>
              <Info size={13} aria-hidden="true" />
              มี {warnCount} จุดให้ตรวจ (วันผ่านแล้ว/ลำดับวัน) — บันทึกได้ ระบบไม่เลื่อนวันให้
            </p>
          ) : (
            <p className={styles.barNote}><Info size={13} aria-hidden="true" />บันทึกครั้งเดียว · ลงประวัติของใบ</p>
          )}
        </div>
        <div className={styles.barActions}>
          {/* ไม่มีสิทธิ์ตั้งวันงวด (แก้แค่ช่วงครอบ เช่น บัญชีบนงวดที่รับรองแล้วทุกงวด) = ไม่มีปุ่มเติม */}
          {mode.available ? (
            <Button size="sm" tone="neutral" variant="outline" icon={<CalendarRange size={13} aria-hidden="true" />}
              aria-expanded={Boolean(mode.fill)} disabled={mode.busy}
              onClick={() => (mode.fill ? mode.closeFill() : mode.openFill())}>
              เติมวันงวดที่ว่าง…
            </Button>
          ) : null}
          <Button variant="ghost" disabled={mode.busy} onClick={mode.cancel}>ยกเลิก</Button>
          <Button tone="primary" disabled={mode.busy || Boolean(mode.saveBlocker) || Boolean(blocker)} onClick={mode.save}>
            {mode.busy ? savingLabel : n ? `บันทึก ${n} งวด` : "บันทึก"}
          </Button>
        </div>
      </div>
      {n && mode.summaryOpen ? (
        <ul className={styles.summary} aria-label="งวดที่แก้ เดิม → ใหม่">
          {edits.map(({ row, dates, cover, stale: moved }) => (
            <li key={row.id}>
              <b>งวด {row.seq}</b>
              {dates ? <ChangePair label="วันวางบิล" from={billText(dates.from)} to={billText(dates.to)} /> : null}
              {dates ? <ChangePair label="กำหนดชำระ" from={dueText(dates.from)} to={dueText(dates.to)} /> : null}
              {/* ติ๊ก "งวดนี้ไม่ต้องวางบิล" (mig 0393) — ข้อยกเว้นรายงวด ลงประวัติของใบ */}
              {dates && Boolean(dates.from.billingSkip) !== Boolean(dates.to.billingSkip) ? (
                <span className={styles.pair}>{dates.to.billingSkip ? `ติ๊ก “${SKIP_TEXT}”` : `เอาติ๊ก “${SKIP_TEXT}” ออก`}</span>
              ) : null}
              {cover ? <ChangePair label="ครอบคลุมบริการ" from={coverText(cover.from)} to={coverText(cover.to)} /> : null}
              {moved ? <span className={styles.stale}>ถูกแก้จากอีกหน้าต่าง</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
