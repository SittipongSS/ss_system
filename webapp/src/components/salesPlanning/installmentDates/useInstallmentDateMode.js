"use client";
// ── วันวางบิล / กำหนดชำระ ของงวดในตาราง — สถานะร่างทั้งหมดอยู่ที่นี่ที่เดียว ──
//
// ⭐ รุ่นสองช่องแยก (มติเจ้าของ 02/11 · ม็อก mockups/billing-cycle/split-v6): ทุกงวดที่แก้ได้มีช่องวันสองช่องในตารางตลอด
//   (`InstallmentDateCell` — DateInput ตัวเดียวกับทั้งระบบ) · ไม่มีโหมดให้เข้า ไม่มีป๊อปโอเวอร์ตัวแก้รายงวด ไม่มี "ไปงวดถัดไปเอง"
//   แทนแบบ C (28/09) ที่แตะเซลล์แล้วเปิดตัวแก้ [ตามรอบ | วันอื่น | รอเหตุการณ์] แล้วเด้งไปงวดถัดไปที่ว่าง (ข้ามวันวางบิล)
// ⭐ แก้ช่อง = **ร่าง** (ไม่ลงฐาน) · แถบบันทึกขึ้นเมื่อมีร่าง · บันทึกครั้งเดียว (`schedule-many`) · ตัวเติมหลายงวดเขียนร่างอย่างเดียว
// ⭐ ใครแก้ได้ = ด่าน `schedule` ตัวเดียวกับ route (ผู้เรียกส่ง `lockOf` ที่ถาม installmentActionError มาแล้ว) —
//   ไม่มีสิทธิ์ = ไม่มีช่องให้แก้ (`available` เป็นเท็จ) · งวดที่ล็อกอ่านอย่างเดียวพร้อมเหตุ (`canEdit(row)`)
// ⭐ ร่างช่วงครอบบริการอยู่ที่นี่ด้วย (ม็อก split-v6 ข้อ 6 · 03/11) — ร่างชุดเดียวกับวันงวด แถบบันทึกเดียว คำขอเดียว
//   (`schedule-many` พาช่วงครอบไปกับแถวของงวด) ⇒ เลิกล็อกกันเอง (เดิมสองฝั่งยิงคนละคำขอที่ล็อก updatedAt ของงวดเดียวกัน)
//   · ใครแก้ช่วงครอบได้/ค่าผ่านไหม = ด่าน `coverage` ของผู้เรียก (`coverGate`) — ไม่ผูกกับ `available` ของวันงวด
//     (บัญชีแก้ช่วงครอบของงวดที่รับรองแล้วได้ ทั้งที่วันงวดทุกงวดล็อก)
// ⭐ รุ่นสี่ (มติเจ้าของ 29/09 แบบ A): ช่องของแต่ละงวดอ่านชนิดจาก `rowMode(row)` (dateModeOf ของ billingRule.js) —
//   ข้อยกเว้นรายงวดสองทางเป็นร่างของที่นี่: "งวดนี้ต้องวางบิล…" (`requireBilling` · ธง `exceptionIds` ส่งเป็น
//   `billingException` กับวันวางบิลใหม่) · "งวดนี้ไม่ต้องวางบิล" (`toggleSkip` · ร่าง `billingSkip` · เฉพาะเมื่อฐานรัน 0393 แล้ว)
//   ทั้งสองทางอยู่เมนู ⋯ ของแถว (มติ 02/11 ข้อ 2)
// ⭐ หน้าสร้าง SO ใช้ฮุกนี้ด้วย (`create`) — ไม่มีบันทึก/ยกเลิก (ร่างไปกับคำขอสร้างใบ) · ช่องตัวเดียวกับใบ SO (AGENTS.md: สร้าง/แก้ใช้ตัวเดียว)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyToast } from "@/lib/feedback";
import { SCHEDULE_MANY_MAX } from "@/lib/sales/installmentScheduleMany";
import { needExceptionActions, ruleOf } from "@/lib/sales/billingRule";
import useHolidayMap from "@/lib/useHolidayMap";
import {
  applyFillPlan, coverChanges, creditDaysOf, currentCovers, currentDates, dateModeKind, dateRuleShape, dateWarnings, datesEmpty,
  draftChanges, fillKindOf, replacesSavedDue, rowDateMode, scheduleManyRows, withCoverDraft, withDraft,
} from "@/lib/sales/installmentDateDrafts";

const bySeq = (a, b) => Number(a.seq) - Number(b.seq);
/* ไม่รู้กติกา/ฐานยังไม่รัน 0389 (หน้าสร้าง SO `billingOff`) — กำหนดชำระอย่างเดียวแบบเดิม · ไม่มีช่องวันวางบิล/รอเหตุการณ์
   (ค่าที่ลงฐานไม่ได้ หรืออาจชนกติกาจริงของลูกค้า ต้องไม่มีทางกรอก) */
const DUE_ONLY_OFF = Object.freeze({
  kind: "dueOnly", views: Object.freeze(["due"]), start: "due", lead: "due", billingColumn: "off", askNeed: false, override: null,
});

/**
 * @param rows        งวดจริงของใบ (แถวล่าสุดของตาราง — หลัง 409 หน้าโหลดสดแล้วแผงส่งชุดใหม่มา)
 * @param ruleValue   รอบวางบิลของลูกค้า (ดิบจากฐานได้ — อ่านผ่าน effectiveBillingRule: ไม่มีเครดิต = ทุกวัน + ชำระวันวางบิล ·
 *                    null = ยังไม่ตั้ง → กรอกได้ทั้งสองช่อง ไม่มีอะไรคิดให้)
 * @param available   ผู้ใช้มีสิทธิ์ตั้งวันและใบยังเดินอยู่ — เท็จ = ไม่มีช่องให้แก้เลย
 * @param blocker     เหตุที่ยังแก้วันงวดไม่ได้ (ล็อกทั้งใบ) — ช่องอ่านอย่างเดียว · ปุ่มเติม/เมนูแถวกดแล้วบอกเหตุ
 * @param coverGate   (row, { coversFrom, coversTo }) => ข้อความ | null — ด่าน `coverage` ของผู้เรียกด้วยค่าที่จะส่งจริง
 *                    (ร่างที่ไม่ผ่าน = บันทึกไม่ได้ · เหตุอยู่ใต้เซลล์และบนแถบ)
 * @param lockOf      (row) => { reason, hint } | null — installmentDateLock ที่ผู้เรียกประกอบด่าน schedule ให้แล้ว
 * @param onSave      async (rows) => boolean — ยิง schedule-many ผ่าน onAction ของหน้า (409 = หน้าโหลดใบสดทั้งใบ
 *                    รวมคำร้องขอเอกสาร ⇒ งวดที่ล็อกระหว่างร่างล็อกบนจอด้วย ร่างของมันถูกทิ้งพร้อมเหตุ)
 * @param busy        คำขอบันทึกกำลังวิ่ง — ทุกทางที่แก้ร่างเงียบ (เซลล์/ตัวแก้ปิดไว้ด้วย) · แก้ตอนนี้แล้วบันทึกสำเร็จ = ถูกล้างทิ้ง
 * @param onClearError ล้าง error ของหน้า ตอนเริ่มร่างแรก/เปิดแผงเติม — error เก่าที่ไม่เกี่ยว (แจ้งชำระไม่ผ่าน ฯลฯ)
 *                    ไม่ขึ้นค้างในแถบบันทึกใหม่
 * @param skipReady   ฐานรัน 0393 แล้ว (`billingSkipReady` ของ GET) — เท็จ = ไม่มีติ๊ก "งวดนี้ไม่ต้องวางบิล" (คีย์นี้ลงฐานไม่ได้)
 * @param onAskRequireBilling (row) => void — เปิดโมดัลขอบเขต "งวดนี้ต้องวางบิล…" ของผู้เรียก (ไม่ส่ง = ไม่มีปุ่มนี้ในตัวแก้ ·
 *                    หน้าสร้าง SO: ลูกค้าไม่ต้องวางบิลตั้งได้แค่กำหนดชำระ)
 * @param create      หน้าสร้าง SO — ไม่มีบันทึก (ผู้เรียกอ่าน `current(row)` ไปกับคำขอสร้างใบ)
 * @param billingOff  ไม่รู้กติกาของลูกค้า / ฐานยังไม่รัน 0389 — ตัวแก้เหลือกำหนดชำระอย่างเดียว (`DUE_ONLY_OFF`)
 */
export default function useInstallmentDateMode({
  rows = [], ruleValue: rawRule = null, todayIso = "", available = false, blocker = "", lockOf = () => null, onSave,
  busy = false, onDirtyChange, onClearError, skipReady = false, onAskRequireBilling = null, create = false, billingOff = false,
  coverGate = () => null,
}) {
  /* ⭐ ผลการอ่านรุ่นสี่ตัวเดียว (`ruleOf`) — ตัวแก้/แผงเติม/ป้ายที่มาเดินตัวคิดเดียวกับที่ `dateModeOf` ตัดสินชนิด
     (รุ่นสองที่มีรอบจ่ายได้ชิปรอบของรุ่นสี่ · รูปเดิม { credit:false } = ผลการอ่าน legacyNoCredit — ห้ามส่งกลับไปบันทึก) */
  const ruleValue = useMemo(() => ruleOf(rawRule), [rawRule]);
  /* วันหยุดในระบบ — ชิปรอบ/แผงเติม/แถบนโยบายเห็นชุดเดียวกับการ์ดลูกค้า · กระดิ่ง · ทะเบียน FN (โหลดพลาด = Map ว่าง เสาร์/อาทิตย์ยังถูก) */
  const holidays = useHolidayMap();
  const [drafts, setDrafts] = useState({});
  const [coverDrafts, setCoverDrafts] = useState({});
  const [fill, setFill] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* งวดที่ยืนยัน "งวดนี้ต้องวางบิล…" แล้ว (ลูกค้าไม่ต้องวางบิล) — ยังไม่มีคอลัมน์ (วันวางบิลที่ยืนยันคือตัวยกเว้น · §2.3)
     ⇒ อยู่ในร่างจนบันทึก · ส่งเป็น `billingException` เฉพาะงวดที่ได้วันวางบิลใหม่ (scheduleManyRows) · ทิ้งพร้อมร่าง */
  const [exceptionIds, setExceptionIds] = useState(() => new Set());

  const sorted = useMemo(() => [...(rows || [])].sort(bySeq), [rows]);
  const kind = billingOff ? "dueOnly" : dateModeKind(ruleValue);
  const fillKind = fillKindOf(ruleValue);
  const creditDays = creditDaysOf(ruleValue);
  /* ตัวแก้ของงวดนั้น — อ่านค่าปัจจุบันบนจอ (ฐาน + ร่าง) ⇒ ติ๊ก/ล้างวันวางบิลในร่างเปลี่ยนวิธีของงวดทันที */
  const rowModeWith = (row, draftsNow, exceptionsNow) => {
    if (billingOff) return DUE_ONLY_OFF;
    return row
      ? rowDateMode(ruleValue, { ...row, ...currentDates(row, draftsNow) }, { exception: exceptionsNow.has(row.id) })
      : rowDateMode(ruleValue, null);
  };
  const rowMode = (row) => rowModeWith(row, drafts, exceptionIds);
  const lockCache = useMemo(() => new Map(sorted.map((row) => [row.id, lockOf(row)])), [sorted, lockOf]);
  const lock = useCallback((row) => (row ? lockCache.get(row.id) ?? lockOf(row) : null), [lockCache, lockOf]);
  const isLocked = useCallback((row) => Boolean(lock(row)), [lock]);
  const current = useCallback((row) => currentDates(row, drafts), [drafts]);
  const editable = sorted.filter((row) => !isLocked(row));
  const { changes, dropped } = draftChanges(sorted, drafts, lock);
  const changedIds = new Set(changes.map((c) => c.row.id));
  const warnings = dateWarnings(sorted, current, { todayIso, changedIds, isLocked });
  const replaced = changes.filter(replacesSavedDue).length;
  const emptyCount = editable.filter((row) => datesEmpty(current(row))).length;
  /* ช่วงครอบที่แก้ — ถามด่าน coverage ด้วยค่าที่จะส่งจริง (`|| null` เหมือนตัวส่ง) ที่นี่ที่เดียว ไม่ใช่ตอนวาดเซลล์
     (ถามตอนวาด = พิมพ์ผิดกลางคันแล้วช่องหายทั้งเซลล์ คนแก้ค่าผิดของตัวเองไม่ได้) */
  const { changes: covers, dropped: coversDropped } = coverChanges(sorted, coverDrafts);
  const coverErrors = {};
  for (const { row, to } of covers) {
    const why = coverGate(row, { coversFrom: to.coversFrom || null, coversTo: to.coversTo || null });
    if (why) coverErrors[row.id] = why;
  }
  const coverEdited = (row) => Boolean(row?.id && coverDrafts[row.id]);
  /* งวดที่เปลี่ยน (วันงวด และ/หรือ ช่วงครอบ) รวมเป็นรายการเดียว — แถบนับ/สรุป/เตือน "ถูกแก้จากอีกหน้าต่าง" จากชุดนี้ */
  const edits = (() => {
    const byId = new Map();
    for (const change of changes) byId.set(change.row.id, { row: change.row, dates: change, cover: null, stale: change.stale });
    for (const change of covers) {
      const edit = byId.get(change.row.id) || { row: change.row, dates: null, cover: null, stale: false };
      byId.set(change.row.id, { ...edit, cover: change, stale: edit.stale || change.stale });
    }
    return [...byId.values()].sort((a, b) => bySeq(a.row, b.row));
  })();
  const dirty = edits.length > 0;
  /* แถบบันทึก/คำบนการ์ดขึ้นเมื่อมีร่าง หรือแผงเติมเปิด (ไม่มีโหมดให้เข้าแล้ว — รุ่นสองช่องแยก) · หน้าสร้างเปิดตลอด */
  const active = create || dirty || Boolean(fill);
  /* ช่องของงวดนี้แก้ได้ไหม — ไม่มีสิทธิ์ / ร่างช่วงครอบค้าง (`blocker`) / งวดล็อก = ตัวหนังสือเดิม */
  const canEdit = useCallback((row) => Boolean(row) && available && !blocker && !isLocked(row), [available, blocker, isLocked]);
  /* route รับครั้งละไม่เกิน SCHEDULE_MANY_MAX งวด (400) — บอกก่อนกด ไม่ปล่อยให้ตีกลับแล้วไม่มีทางแบ่ง
     (เติมแบบ "จัดใหม่งวดที่มีวันแล้วด้วย" บนสัญญาเกิน 60 งวด) */
  const saveBlocker = edits.length > SCHEDULE_MANY_MAX
    ? `บันทึกได้ครั้งละไม่เกิน ${SCHEDULE_MANY_MAX} งวด (ตอนนี้ ${edits.length} งวด) — คืนค่าบางงวดแล้วบันทึกเป็นสองรอบ`
    : "";

  /* ── กติกาของลูกค้าเปลี่ยนระหว่างอยู่ในโหมด — รีเซ็ต **สถานะการมอง** เท่านั้น ร่างอยู่ครบ ──
     ทางที่เกิดจริง: ลูกค้ายังไม่ตั้ง → แตะลิงก์ "ตั้งกำหนดวางบิล" (แท็บใหม่) → ตั้ง → กลับมา = หน้าดึงใบสด (`refreshOrder` แค่ setOrder
     โหมดนี้ไม่ถูก unmount) · หรือกติกาถูกล้างแล้วหน้าโหลดใหม่ (409) ระหว่างตัวแก้เปิดอยู่
     · แผงเติม — ตัวเลือก/วันที่ที่แตะคิดจากกติกาเก่า ⇒ ตั้งต้นใหม่เหมือนเพิ่งเปิดแผง (ฐาน = ร่าง ณ ตอนนี้ · ร่างที่เติมไปแล้วอยู่ต่อ)
     · ร่างไม่ถูกแตะ — ร่างที่ผิดกติกาใหม่ขึ้นคำเตือนเดิมเอง (แก้ทับ · ยังไม่มีกำหนดชำระ · ลำดับวัน)
       หน้าสร้าง + ลูกค้าเพิ่งเป็นไม่ต้องวางบิล: วันวางบิลที่ร่างไว้ติดด่านสร้างพร้อมทางที่ทำได้บนหน้านั้น (ปุ่ม "ล้างวันวางบิล" ·
       `CREATE_NO_BILLING_ERROR` · review 29/09) — ไม่ล้างให้เงียบ ๆ
     ⚠️ ปรับ state ระหว่าง render (แพตเทิร์น "เก็บค่าก่อนหน้า" ของ React) ไม่ใช่ effect — ไม่มีเฟรมที่แผงเติมวาดด้วยกติกาเก่า
     🐞 review 28/09 (MAJOR): เดิมไม่มีอะไรรีเซ็ต — ตัวแก้วาดสาขา "ยังไม่ตั้ง" ต่อหลังตั้งกติกา: เลือกวันวางบิลแล้วกำหนดชำระไม่ตาม
        ⇒ ไม่มีเครดิตบันทึกได้ทั้งที่วันวางบิล ≠ กำหนดชำระ / ไม่มีกำหนดชำระ · ขากลับ (กติกาถูกล้าง) `pickBillingDate(null, …)`
        คืนกำหนดชำระว่าง = ล้างกำหนดชำระที่บันทึกไว้เงียบ ๆ · แผงเติมค้างตัวเลือกของชนิดเก่า */
  const ruleShape = dateRuleShape(ruleValue);
  const [shapeSeen, setShapeSeen] = useState(ruleShape);
  if (shapeSeen !== ruleShape) {
    setShapeSeen(ruleShape);
    /* ข้อยกเว้น "งวดนี้ต้องวางบิล…" ผูกกับกติกาเก่า (ลูกค้าไม่ต้องวางบิล) — กติกาเปลี่ยน = ถามใหม่ (วันวางบิลที่ร่างไว้อยู่ในร่างครบ) */
    setExceptionIds(new Set());
    setFill((f) => (f ? { base: drafts, includeDated: false, choice: null, day: null, excluded: [] } : f));
  }

  /* หน้าต้องรู้ว่ามีร่างค้าง — ถามก่อนออกจากหน้า/สลับแท็บ (useUnsavedChanges ของหน้า) */
  const dirtyRef = useRef(onDirtyChange);
  dirtyRef.current = onDirtyChange;
  useEffect(() => { dirtyRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => dirtyRef.current?.(false), []);
  /* ค่าล่าสุดของด่าน — toast "เอาคืน" ถูกกดหลังจากนี้หลายวินาที (ระหว่างนั้นอาจเริ่มแก้ช่วงครอบแล้ว) */
  const gateRef = useRef({ available, blocker });
  gateRef.current = { available, blocker };
  const clearErrorRef = useRef(onClearError);
  clearErrorRef.current = onClearError;
  /* โฟกัสช่องวันของงวด — หลังยืนยัน "งวดนี้ต้องวางบิล…" ช่องวันวางบิลเพิ่งโผล่ (รอวาดสองเฟรม) · หา DOM ด้วย `data-date-field`
     ของ InstallmentDateCell (ไม่ใช่ ref — เซลล์อยู่คนละตาราง/หน้ากับฮุก) */
  const focusField = (rowId, field) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) return;
    const key = `${rowId}:${field}`.replace(/["\\]/g, "\\$&");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelector(`[data-date-field="${key}"] input`)?.focus();
    }));
  };

  const reset = () => {
    setDrafts({});
    setCoverDrafts({});
    setFill(null);
    setSummaryOpen(false);
    setExceptionIds(new Set());
  };

  /* ยกเลิก = ทิ้งร่างทั้งหมด · มี toast "เอาคืน" (ยืมจากแบบ C) — ไม่ต้องถามก่อน เพราะเอาคืนได้
     ⚠️ "เอาคืน" ถามด่านล่าสุดก่อน (gateRef) — ระหว่าง toast ค้าง คนอาจเริ่มแก้ช่วงครอบแล้ว ⇒ คืนร่าง = สองชุดร่างเปิดพร้อมกัน
       (review R-UI) · ติดด่าน = บอกเหตุแทนการคืน */
  const cancel = () => {
    if (busy) return;
    const kept = drafts;
    const keptCovers = coverDrafts;
    const keptExceptions = exceptionIds;
    const count = edits.length;
    reset();
    if (!count) return;
    notifyToast.info(`ทิ้งที่แก้ ${count} งวด`, {
      action: {
        label: "เอาคืน",
        onClick: () => {
          const gate = gateRef.current;
          /* ช่วงครอบคืนได้เสมอ (ด่านของมันตัดสินตอนบันทึก) · วันงวดคืนเมื่อยังแก้ได้ */
          setCoverDrafts(keptCovers);
          if (!gate.available) return;
          if (gate.blocker) { notifyToast.error(gate.blocker); return; }
          setDrafts(kept);
          setExceptionIds(keptExceptions);
        },
      },
    });
  };

  const save = async () => {
    if (busy) return;
    if (!edits.length) {
      notifyToast.info("ยังไม่ได้แก้งวดไหน");
      return;
    }
    if (saveBlocker) { notifyToast.error(saveBlocker); return; }
    const coverError = Object.values(coverErrors)[0];
    if (coverError) { notifyToast.error(coverError); return; }
    const ok = await onSave?.(scheduleManyRows(changes, { exceptionIds, rule: ruleValue, covers }));
    if (ok) reset();
  };

  /* แก้ช่องของงวด (ร่าง) — ถ้าแผงเติมเปิดอยู่ แถวนี้หลุดจากการเติม (ค่าที่แก้เองเป็นฐานใหม่ · ยืมจากแบบแนะนำ)
     ⚠️ ไม่มีการไปงวดถัดไปเอง (มติ 02/11) · ร่างแรก = ล้าง error เก่าของหน้า (แทน `enter` ของโหมดเดิม) */
  const setValue = (row, value) => {
    if (busy || !row) return;
    if (blocker) { notifyToast.error(blocker); return; }
    if (!edits.length && !fill) clearErrorRef.current?.();
    setDrafts((d) => withDraft(d, row, value));
    setFill((f) => (f ? { ...f, base: withDraft(f.base, row, value), excluded: [...new Set([...(f.excluded || []), row.id])] } : f));
  };
  /* คืนค่าที่บันทึกไว้ — แผงเติมเปิดอยู่ = ฐานของแผงทิ้งร่างงวดนี้ด้วย + งวดนี้หลุดจากการเติม (เหมือน setValue)
     🐞 review R-UI: เดิมแก้แค่ร่าง ⇒ เลือกตัวเลือกเติมอื่นต่อ = ร่างที่เพิ่งคืนค่ากลับมาจากฐานเดิมของแผง */
  const revert = (row) => {
    if (busy) return;
    const without = (d) => {
      const next = { ...(d || {}) };
      delete next[row.id];
      return next;
    };
    setDrafts(without);
    setFill((f) => (f ? { ...f, base: without(f.base), excluded: [...new Set([...(f.excluded || []), row.id])] } : f));
  };

  /* แก้ช่วงครอบของงวด (ร่าง) — `patch` = { coversFrom } หรือ { coversTo } · ด่านอยู่ที่ `coverGate` (บอกใต้เซลล์ · กันตอนบันทึก) */
  const setCover = (row, patch) => {
    if (busy || !row) return;
    if (!edits.length && !fill) clearErrorRef.current?.();
    setCoverDrafts((d) => withCoverDraft(d, row, patch));
  };
  const cover = useCallback((row) => currentCovers(row, coverDrafts), [coverDrafts]);

  /* ── ข้อยกเว้นรายงวด (รอบกรรมการ 29/09 · §2.3) — ด่านเขียนจริงคือ validateInstallmentDates ของ route ──────────────────
     "งวดนี้ต้องวางบิล…" ยืนยันในโมดัลขอบเขตของผู้เรียกแล้ว: `scope` 'one' = งวดนี้ · 'so' = ทุกงวดที่ยังเปิดของใบ
     (ไม่ล็อก · ยังไม่มีวันวางบิล · ไม่ติ๊ก — ทางลัด ไม่มีธงระดับใบ) ⇒ ช่องวันวางบิลของงวดโผล่ แล้วโฟกัสให้ (`focusField`) */
  const requireBilling = (rowId, scope = "one") => {
    if (!available || busy) return;
    if (blocker) { notifyToast.error(blocker); return; }
    const row = sorted.find((r) => r.id === rowId);
    if (!row || isLocked(row)) return;
    const targets = scope === "so"
      ? editable.filter((r) => r.id === row.id || needExceptionActions({ ...r, ...current(r) }, ruleValue).requireBilling)
      : [row];
    const next = new Set([...exceptionIds, ...targets.map((r) => r.id)]);
    clearErrorRef.current?.();
    setExceptionIds(next);
    focusField(row.id, "bill");
  };
  /* "งวดนี้ไม่ต้องวางบิล" (ติ๊ก) / "เอาติ๊กออก" จากเมนูแถว — ลงร่าง (เซลล์วันวางบิลบอกผล · บันทึกครั้งเดียวที่แถบล่าง)
     ⚠️ ฐานยังไม่รัน 0393 = ไม่มีทางนี้ (`skipReady`) — ปุ่มไม่ขึ้นตั้งแต่ต้น */
  const toggleSkip = (rowId) => {
    if (!available || busy || !skipReady) return;
    if (blocker) { notifyToast.error(blocker); return; }
    const row = sorted.find((r) => r.id === rowId);
    if (!row || isLocked(row)) return;
    const v = current(row);
    setValue(row, { ...v, billingSkip: !v.billingSkip });
  };

  /* ── แผงเติม — ฐาน = ร่าง ณ ตอนเปิด · เลือกตัวเลือกใหม่ = เริ่มจากฐานเดิม (ไม่ซ้อนผลรอบก่อน) ──
     `choice` = ตัวเลือกที่ลงตารางอยู่ (null = ยังไม่ได้แตะ — ไม่มีค่าตั้งต้น) · `day` = วันที่ที่แตะในตารางวันที่ 1–31
     `excluded` = งวดที่คนแก้เองระหว่างแผงเปิด (ค่าที่แก้เองเป็นฐานใหม่ ตัวเติมไม่แตะอีก)
     `includeDated` (ไม่บังคับ) = เปิดแผงพร้อมสวิตช์ "จัดใหม่งวดที่มีวันแล้วด้วย" — ทางเดียวที่ใช้คือ "ไปแก้" ของแผงแดงงานบริการ
       เมื่อทุกงวดของข้อแตะได้ด้วยการจัดใหม่เท่านั้น (backfill ลูกค้าเครดิต: มีกำหนดชำระแล้ว ขาดวันวางบิล) · ยังไม่มีตัวเลือกไหนถูกเลือก —
       คนเลือกเองแล้วตรวจในตารางก่อนบันทึก · ปุ่มการ์ดเรียก `openFill()` = สวิตช์ปิดเหมือนเดิม · รับเฉพาะ true จริง (อีเวนต์/ค่าอื่น = ปิด) */
  const openFill = ({ includeDated = false } = {}) => {
    if (!available || busy) return;
    if (blocker) { notifyToast.error(blocker); return; }
    clearErrorRef.current?.();
    setFill({ base: drafts, includeDated: includeDated === true, choice: null, day: null, excluded: [] });
  };
  const closeFill = () => setFill(null);
  const fillCurrent = (row) => currentDates(row, fill?.base || {});
  const fillLocked = (row) => isLocked(row) || Boolean(fill?.excluded?.includes(row.id));
  /* ค่าของแผงที่ไม่แตะร่าง (วันที่ที่แตะ ยังไม่ได้เลือกเดือน) */
  const patchFill = (patch) => { if (!busy) setFill((f) => (f ? { ...f, ...patch } : f)); };
  /* ใช้แผน (หรือ null = ย้อนการเติมกลับเป็นฐาน) · `patch` = ตัวเลือกของแผงที่เปลี่ยน */
  const applyFill = (patch, plan) => {
    if (!fill || busy) return;
    setFill((f) => (f ? { ...f, ...patch } : f));
    setDrafts(plan && !plan.error ? applyFillPlan(fill.base, sorted, plan.rows) : fill.base);
  };

  return {
    available, active, blocker, kind, fillKind, ruleValue, creditDays, todayIso, holidays, busy, create,
    rows: sorted, editable, drafts, current, lock, isLocked, canEdit, changes, dropped: [...dropped, ...coversDropped], changedIds,
    warnings, replaced, saveBlocker, emptyCount, dirty, edits,
    cover, setCover, coverEdited, covers, coverErrors,
    cancel, save, setValue, revert, rowMode, focusField,
    skipReady: skipReady && !billingOff, exceptionIds, requireBilling, toggleSkip, billingOff,
    askRequireBilling: typeof onAskRequireBilling === "function" && !create ? onAskRequireBilling : null,
    summaryOpen, setSummaryOpen,
    fill, openFill, closeFill, fillCurrent, fillLocked, patchFill, applyFill,
  };
}
