"use client";
// ── ชิ้นรอบตารางของวันงวด: ปุ่ม "เติมวันงวดที่ว่าง…" บนการ์ด · แถบบันทึกตรึงล่าง ──
//
// ⭐ บันทึกมีที่เดียว = ปุ่ม navy "บันทึก N งวด" บนแถบล่าง — คำขอเดียว `schedule-many` · ยกเลิก = ทิ้งร่างทั้งหมด + toast "เอาคืน"
// ⭐ แถบขึ้นเมื่อมีร่าง (หรือแผงเติมเปิด) เท่านั้น — รุ่นสองช่องแยก (มติ 02/11) ไม่มีโหมดให้เข้า ช่องวันในตารางแก้ได้เลย
// ⭐ แถบบอกผลก่อนกด (กติกา #1223): เปลี่ยนกี่งวด · ดูเดิม → ใหม่ · แทนกำหนดชำระเดิมกี่งวด (ป้ายแดง/ด่านนัดช่างนับจากวันใหม่) ·
//   งวดที่ถูกแก้จากอีกหน้าต่างระหว่างร่าง (หลัง 409) · ร่างที่ถูกทิ้งเพราะงวดล็อกแล้ว
// ⚠️ แถบนี้อยู่ชั้นเดียวกับแถบบันทึกช่วงครอบ (coverBar) — สองชุดร่างไม่ค้างพร้อมกัน (ผู้เรียกกันไว้ทั้งสองทาง)
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

function ChangePair({ label, from, to }) {
  if (from === to) return null;
  return (
    <span className={styles.pair}>
      {label} <s>{from}</s> → <b>{to}</b>
    </span>
  );
}

/* แถบบันทึก (ติดขอบล่างของจอ) — ขึ้นเมื่อมีร่าง หรือแผงเติมเปิดอยู่ · หน้าสร้าง SO ไม่มีแถบนี้ (ร่างไปกับใบ) */
export function InstallmentDateBar({ mode, error = "", savingLabel = "กำลังบันทึก…" }) {
  if (mode.create || !(mode.dirty || mode.fill)) return null;
  const { changes, dropped, replaced } = mode;
  const n = changes.length;
  const stale = changes.filter((change) => change.stale);
  const warnCount = changes.reduce((sum, change) => sum
    + (mode.warnings[change.row.id] || []).filter((w) => w.tone === "warn").length, 0);
  const seqs = (list) => list.map((item) => item.row?.seq).filter((seq) => seq != null).join(", ");
  return (
    /* `data-toast-top` = toast ขึ้นบนจอระหว่างที่แถบอยู่ (toast ที่ขอบล่างทับปุ่มบันทึก 3.6 วินาที — กติกาของ Toast.module.css) */
    <div className={styles.bar} role="region" aria-label="บันทึกวันงวด" data-toast-top="">
      {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
      <div className={styles.barRow}>
        <div className={styles.barInfo}>
          <p className={styles.barCount} aria-live="polite">
            {n ? <>เปลี่ยน <span className={styles.n}>{n}</span> งวด</> : "ยังไม่ได้แก้ — เลือกตัวเลือกในแผงเติม หรือแก้ช่องวันในตาราง"}
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
              งวดที่ {seqs(stale)} ถูกแก้จากอีกหน้าต่างระหว่างที่ร่างอยู่ — ตรวจวันในตารางแล้วกดบันทึกอีกครั้ง
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
          <Button size="sm" tone="neutral" variant="outline" icon={<CalendarRange size={13} aria-hidden="true" />}
            aria-expanded={Boolean(mode.fill)} disabled={mode.busy}
            onClick={() => (mode.fill ? mode.closeFill() : mode.openFill())}>
            เติมวันงวดที่ว่าง…
          </Button>
          <Button variant="ghost" disabled={mode.busy} onClick={mode.cancel}>ยกเลิก</Button>
          <Button tone="primary" disabled={mode.busy || Boolean(mode.saveBlocker)} onClick={mode.save}>
            {mode.busy ? savingLabel : n ? `บันทึก ${n} งวด` : "บันทึก"}
          </Button>
        </div>
      </div>
      {n && mode.summaryOpen ? (
        <ul className={styles.summary} aria-label="วันงวด เดิม → ใหม่">
          {changes.map(({ row, from, to, stale: moved }) => (
            <li key={row.id}>
              <b>งวด {row.seq}</b>
              <ChangePair label="วันวางบิล" from={billText(from)} to={billText(to)} />
              <ChangePair label="กำหนดชำระ" from={dueText(from)} to={dueText(to)} />
              {/* ติ๊ก "งวดนี้ไม่ต้องวางบิล" (mig 0393) — ข้อยกเว้นรายงวด ลงประวัติของใบ */}
              {Boolean(from.billingSkip) !== Boolean(to.billingSkip) ? (
                <span className={styles.pair}>{to.billingSkip ? `ติ๊ก “${SKIP_TEXT}”` : `เอาติ๊ก “${SKIP_TEXT}” ออก`}</span>
              ) : null}
              {moved ? <span className={styles.stale}>ถูกแก้จากอีกหน้าต่าง</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
