"use client";
// ── ชิ้นรอบตารางของโหมดตั้งวัน: ปุ่มเข้าโหมดบนการ์ด · บรรทัดบอกโหมด · แถบบันทึกตรึงล่าง · แผ่นเต็มจอบนมือถือ ──
//
// ⭐ บันทึกมีที่เดียว = ปุ่ม navy "บันทึก N งวด" (แถบล่าง · หรือท้ายแผ่นบนมือถือ) — คำขอเดียว `schedule-many`
//   ไม่มี "เสร็จ" แล้วต้องบันทึกอีกชั้น (ข้อ 2 ของกรรมการ) · ยกเลิก = ทิ้งร่างทั้งหมด + toast "เอาคืน"
// ⭐ แถบบอกผลก่อนกด (กติกา #1223): เปลี่ยนกี่งวด · ดูเดิม → ใหม่ · แทนกำหนดชำระเดิมกี่งวด (ป้ายแดง/ด่านนัดช่างนับจากวันใหม่) ·
//   งวดที่ถูกแก้จากอีกหน้าต่างระหว่างร่าง (หลัง 409) · ร่างที่ถูกทิ้งเพราะงวดล็อกแล้ว
// ⚠️ แถบนี้อยู่ชั้นเดียวกับแถบบันทึกช่วงครอบ (coverBar) — สองชุดร่างเปิดพร้อมกันไม่ได้ (ผู้เรียกกันไว้ทั้งสองทาง)
import { CalendarClock, CalendarRange, ChevronDown, ChevronUp, History, Info, Lock, PencilLine, TriangleAlert } from "lucide-react";
import Button from "@/components/ui/Button";
import GatedAction from "@/components/ui/GatedAction";
import StatusNotice from "@/components/ui/StatusNotice";
import Modal from "@/components/Modal";
import { formatBillingDate } from "@/lib/sales/billingRule";
import InstallmentDateEditor from "./InstallmentDateEditor";
import styles from "./InstallmentDates.module.css";

/* ปุ่ม "ตั้งวันงวด" บนหัวการ์ด — ไม่มีสิทธิ์/ไม่มีงวดที่แก้ได้ = ไม่วาด · ร่างช่วงครอบค้าง = วาดแล้วบอกเหตุตอนกด */
export function InstallmentDateButton({ mode, disabled = false }) {
  if (!mode.available || mode.active) return null;
  return (
    <GatedAction size="sm" variant="ghost" icon={<CalendarClock size={13} aria-hidden="true" />}
      blocker={mode.blocker} disabled={disabled} onClick={() => mode.enter()}>
      ตั้งวันงวด
      {mode.emptyCount ? <span className={styles.entryCount}> · ว่าง {mode.emptyCount}</span> : null}
    </GatedAction>
  );
}

/* บรรทัดใต้หัวการ์ดตอนอยู่ในโหมด — บอกวิธีใช้ครั้งเดียว (คำอธิบายยาวไม่ซ้ำในตัวแก้ · บรีฟ "คำน้อยกว่าเดิม") */
export function InstallmentDateHint({ mode }) {
  if (!mode.active) return null;
  return (
    <p className={styles.modeHint}>
      <PencilLine size={15} aria-hidden="true" />
      <span>
        <b>โหมดตั้งวันงวด</b> — แตะช่องวันของงวดไหนก็ได้
        {mode.rows.length > 1 ? " · เลือกแล้วไปงวดถัดไปที่ว่างเอง" : ""} · บันทึกครั้งเดียวที่แถบล่าง
      </span>
    </p>
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

/* แถบบันทึก (ติดขอบล่างของจอ) — ขึ้นตลอดที่อยู่ในโหมด · ยังไม่ได้แก้ = บอกวิธีเริ่ม */
export function InstallmentDateBar({ mode, error = "", savingLabel = "กำลังบันทึก…" }) {
  if (!mode.active) return null;
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
            {n ? <>เปลี่ยน <span className={styles.n}>{n}</span> งวด</> : "ยังไม่ได้แก้ — แตะช่องวันเพื่อเริ่ม"}
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
              {moved ? <span className={styles.stale}>ถูกแก้จากอีกหน้าต่าง</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* มือถือ (≤640px): ตัวแก้เป็นแผ่นเต็มจอ ท้ายตรึงมีปุ่ม navy ปุ่มเดียว "บันทึก N งวด" (ข้อ 2 ของกรรมการ)
   · ปิดแผ่น (X) = กลับตาราง ร่างยังอยู่ (แถบล่างยังพาบันทึก) · error ของ API ขึ้นในแผ่น (แถบของหน้าอยู่ใต้แผ่น) */
export function InstallmentDateSheet({ mode, error = "", subtitle = "", savingLabel = "กำลังบันทึก…" }) {
  const row = mode.active && mode.placement === "sheet" ? mode.openRow : null;
  if (!row) return null;
  const n = mode.changes.length;
  return (
    <Modal open onClose={mode.close} sheetOnPhone size="md" dismissible={!mode.busy} title="ตั้งวันงวด" subtitle={subtitle}
      footer={(
        <div className={styles.sheetFoot}>
          <p className={styles.barNote} data-tone={mode.replaced || mode.saveBlocker ? "warn" : undefined}>
            {mode.replaced || mode.saveBlocker ? <TriangleAlert size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
            {mode.saveBlocker || (n
              ? `เปลี่ยน ${n} งวด${mode.replaced ? ` · แทนกำหนดชำระเดิม ${mode.replaced} งวด` : ""}`
              : "ยังไม่ได้แก้ — เลือกวันของงวดนี้")}
          </p>
          <Button tone="primary" className={styles.sheetSave} disabled={mode.busy || Boolean(mode.saveBlocker)} onClick={mode.save}>
            {mode.busy ? savingLabel : n ? `บันทึก ${n} งวด` : "บันทึก"}
          </Button>
        </div>
      )}>
      <div className={styles.sheetBody}>
        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}
        {/* key = งวด + ชนิดของกติกา (ตัวเดียวกับป๊อปโอเวอร์ · review 28/09) */}
        <InstallmentDateEditor key={`${row.id}:${mode.kind}`} mode={mode} row={row} variant="sheet" />
      </div>
    </Modal>
  );
}
