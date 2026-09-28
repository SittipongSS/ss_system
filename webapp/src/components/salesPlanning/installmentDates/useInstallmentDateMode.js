"use client";
// ── โหมดตั้งวันงวดในตาราง (แบบ C · มติเจ้าของ 28/09) — สถานะทั้งหมดของโหมดอยู่ที่นี่ที่เดียว ──
//
// ⭐ ทางเข้าเดียว: ปุ่ม "ตั้งวันงวด" บนการ์ด · แตะเซลล์วันวางบิล/กำหนดชำระในตาราง · เมนูแถว "ตั้งวันงวด" — ทั้งสามทาง
//   เข้าโหมดเดียวกัน (เปิดตัวแก้ของแถวนั้นไว้) · แทนโมดัลรายงวด + ปุ่ม "เติมตามรอบ"/"จัดวันใหม่ตามรอบปัจจุบัน" เดิมทั้งหมด
// ⭐ แตะวัน = **ร่าง** (ไม่ลงฐาน) · บันทึกครั้งเดียวที่แถบล่าง (`schedule-many`) · ตัวเติมหลายงวดเขียนร่างอย่างเดียว
// ⭐ ใครแก้ได้ = ด่าน `schedule` ตัวเดียวกับ route (ผู้เรียกส่ง `lockOf` ที่ถาม installmentActionError มาแล้ว) —
//   ไม่มีสิทธิ์ = ไม่มีปุ่ม ไม่มีเซลล์ให้แตะ (`available` เป็นเท็จ) · งวดที่ล็อกอ่านอย่างเดียวพร้อมเหตุ
// ⭐ ร่างของโหมดนี้กับร่างช่วงครอบบริการ (coverDrafts) เปิดพร้อมกันไม่ได้ — ผู้เรียกส่ง `blocker` (เหตุ) มา
// ⚠️ สามที่วาง (ตัดสินด้วยความกว้างจอ ไม่ใช่ user agent): ≥1000px = ป๊อปโอเวอร์ข้างแถว (ไม่บังหัวใบ/ปุ่มของการ์ด) ·
//    641–999px = กางใต้แถว · ≤640px = แผ่นเต็มจอที่ท้ายตรึงมีปุ่มบันทึก navy ปุ่มเดียว (ไม่มี "เสร็จ" แล้วบันทึกอีกชั้น)
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { notifyToast } from "@/lib/feedback";
import { SCHEDULE_MANY_MAX } from "@/lib/sales/installmentScheduleMany";
import {
  DATE_VIEWS, applyFillPlan, creditDaysOf, currentDates, dateCellTapCloses, dateRuleKind, dateRuleShape, dateViewOf, dateWarnings,
  datesEmpty, draftChanges, fillKindOf, nextEmptyRow, noneOpenView, replacesSavedDue, scheduleManyRows, withDraft,
} from "@/lib/sales/installmentDateDrafts";

/* ความกว้างจอ → ที่วางตัวแก้ · ค่าเดียวกับจุดตัดจอที่มีอยู่แล้วของระบบ (640 · 1000 — เพดานจุดตัดจอของ audit:ui) */
const PHONE = "(max-width: 640px)";
const WIDE = "(min-width: 1000px)";
function subscribeMedia(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const lists = [window.matchMedia(PHONE), window.matchMedia(WIDE)];
  lists.forEach((list) => list.addEventListener?.("change", onChange));
  return () => lists.forEach((list) => list.removeEventListener?.("change", onChange));
}
const placementNow = () => {
  if (typeof window === "undefined" || !window.matchMedia) return "popover";
  if (window.matchMedia(PHONE).matches) return "sheet";
  return window.matchMedia(WIDE).matches ? "popover" : "inline";
};
export function useDatePlacement() {
  return useSyncExternalStore(subscribeMedia, placementNow, () => "popover");
}

const bySeq = (a, b) => Number(a.seq) - Number(b.seq);

/**
 * @param rows        งวดจริงของใบ (แถวล่าสุดของตาราง — หลัง 409 หน้าโหลดสดแล้วแผงส่งชุดใหม่มา)
 * @param ruleValue   รอบวางบิลของลูกค้า (ดิบจากฐานได้ — อ่านผ่าน effectiveBillingRule: ไม่มีเครดิต = ทุกวัน + ชำระวันวางบิล ·
 *                    null = ยังไม่ตั้ง → กรอกได้ทั้งสองช่อง ไม่มีอะไรคิดให้)
 * @param available   ผู้ใช้มีสิทธิ์ตั้งวันและใบยังเดินอยู่ — เท็จ = ไม่มีทางเข้าโหมดเลย
 * @param blocker     เหตุที่ยังเข้าโหมดไม่ได้ (ร่างช่วงครอบค้าง · ล็อกทั้งใบ) — ปุ่มยังอยู่ กดแล้วบอกเหตุ
 * @param lockOf      (row) => { reason, hint } | null — installmentDateLock ที่ผู้เรียกประกอบด่าน schedule ให้แล้ว
 * @param onSave      async (rows) => boolean — ยิง schedule-many ผ่าน onAction ของหน้า (409 = หน้าโหลดใบสดทั้งใบ
 *                    รวมคำร้องขอเอกสาร ⇒ งวดที่ล็อกระหว่างร่างล็อกบนจอด้วย ร่างของมันถูกทิ้งพร้อมเหตุ)
 * @param busy        คำขอบันทึกกำลังวิ่ง — ทุกทางที่แก้ร่างเงียบ (เซลล์/ตัวแก้ปิดไว้ด้วย) · แก้ตอนนี้แล้วบันทึกสำเร็จ = ถูกล้างทิ้ง
 * @param onClearError ล้าง error ของหน้า ตอนเข้าโหมด/เปิดแผงเติม — error เก่าที่ไม่เกี่ยว (แจ้งชำระไม่ผ่าน ฯลฯ)
 *                    ไม่ขึ้นค้างในแถบบันทึกใหม่ (ทุกทางเข้า — ปุ่มการ์ด · เซลล์ · เมนูแถว — ผ่าน `enter` ตัวเดียว)
 */
export default function useInstallmentDateMode({
  rows = [], ruleValue = null, todayIso = "", available = false, blocker = "", lockOf = () => null, onSave,
  busy = false, onDirtyChange, onClearError,
}) {
  const placement = useDatePlacement();
  const [active, setActive] = useState(false);
  const [openId, setOpenId] = useState(null);
  /* เซลล์ที่พาเข้ามา ("bill" | "due" | null) — ลูกค้าที่ยังไม่ตั้งกำหนดวางบิลแตะเซลล์วันวางบิล = ตัวแก้เปิดปฏิทินวันวางบิล
     (ช่องหลักของลูกค้ากลุ่มนี้คือกำหนดชำระ · วันวางบิลไม่บังคับ แต่แตะช่องนั้นแล้วต้องได้ช่องนั้น) */
  const [openField, setOpenField] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [views, setViews] = useState({});
  const [fill, setFill] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* แถวที่เพิ่งถูกเลื่อนมาหลังเลือก ("ไปงวดถัดไปที่ว่างเอง") — ตัวแก้ย้ายโฟกัสไปหัวของงวดใหม่ */
  const [focusTick, setFocusTick] = useState(0);

  const sorted = useMemo(() => [...(rows || [])].sort(bySeq), [rows]);
  const kind = dateRuleKind(ruleValue);
  const fillKind = fillKindOf(ruleValue);
  const creditDays = creditDaysOf(ruleValue);
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
  const dirty = active && changes.length > 0;
  /* route รับครั้งละไม่เกิน SCHEDULE_MANY_MAX งวด (400) — บอกก่อนกด ไม่ปล่อยให้ตีกลับแล้วไม่มีทางแบ่ง
     (เติมแบบ "จัดใหม่งวดที่มีวันแล้วด้วย" บนสัญญาเกิน 60 งวด) */
  const saveBlocker = changes.length > SCHEDULE_MANY_MAX
    ? `บันทึกได้ครั้งละไม่เกิน ${SCHEDULE_MANY_MAX} งวด (ตอนนี้ ${changes.length} งวด) — คืนค่าบางงวดแล้วบันทึกเป็นสองรอบ`
    : "";
  const openRow = openId ? sorted.find((row) => row.id === openId) || null : null;

  /* ── กติกาของลูกค้าเปลี่ยนระหว่างอยู่ในโหมด — รีเซ็ต **สถานะการมอง** เท่านั้น ร่างอยู่ครบ ──
     ทางที่เกิดจริง: ลูกค้ายังไม่ตั้ง → แตะลิงก์ "ตั้งกำหนดวางบิล" (แท็บใหม่) → ตั้ง → กลับมา = หน้าดึงใบสด (`refreshOrder` แค่ setOrder
     โหมดนี้ไม่ถูก unmount) · หรือกติกาถูกล้างแล้วหน้าโหลดใหม่ (409) ระหว่างตัวแก้เปิดอยู่
     · วิธีที่จำไว้รายงวด (`views`) — ของชนิดเก่าไม่มีในชุดใหม่ ⇒ ล้าง (ยังไม่ตั้ง = จำช่องของงวดที่เปิดอยู่ใหม่ ดู `seedView`)
     · แผงเติม — ตัวเลือก/วันที่ที่แตะคิดจากกติกาเก่า ⇒ ตั้งต้นใหม่เหมือนเพิ่งเปิดแผง (ฐาน = ร่าง ณ ตอนนี้ · ร่างที่เติมไปแล้วอยู่ต่อ)
     · ร่างไม่ถูกแตะ — ร่างที่ผิดกติกาใหม่ขึ้นคำเตือนเดิมเอง (แก้ทับ · ยังไม่มีกำหนดชำระ · ลำดับวัน)
     ⚠️ ปรับ state ระหว่าง render (แพตเทิร์น "เก็บค่าก่อนหน้า" ของ React) ไม่ใช่ effect — ไม่มีเฟรมที่ตัวแก้วาดด้วยวิธีของกติกาเก่า
     ⚠️ ผู้เรียกทุกที่ผูก key ของตัวแก้ด้วย `${row.id}:${mode.kind}` ⇒ วิธีที่ตัวแก้ตัดสินตอนเปิด (openedView) คิดใหม่ตามชนิดใหม่
     🐞 review 28/09 (MAJOR): เดิมไม่มีอะไรรีเซ็ต — ตัวแก้วาดสาขา "ยังไม่ตั้ง" ต่อหลังตั้งกติกา: เลือกวันวางบิลแล้วกำหนดชำระไม่ตาม
        ⇒ ไม่มีเครดิตบันทึกได้ทั้งที่วันวางบิล ≠ กำหนดชำระ / ไม่มีกำหนดชำระ · ขากลับ (กติกาถูกล้าง) `pickBillingDate(null, …)`
        คืนกำหนดชำระว่าง = ล้างกำหนดชำระที่บันทึกไว้เงียบ ๆ · แผงเติมค้างตัวเลือกของชนิดเก่า */
  const ruleShape = dateRuleShape(ruleValue);
  const [shapeSeen, setShapeSeen] = useState(ruleShape);
  if (shapeSeen !== ruleShape) {
    setShapeSeen(ruleShape);
    setViews(kind === "none" && openRow ? { [openRow.id]: noneOpenView(openField, currentDates(openRow, drafts)) } : {});
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

  /* แถวที่เปิดอยู่หายไป/ล็อกหลังหน้าโหลดงวดสด = ปิดตัวแก้ (ร่างของมันถูกทิ้งพร้อมเหตุใน `dropped`) */
  useEffect(() => {
    if (openId && (!openRow || isLocked(openRow))) setOpenId(null);
  }, [openId, openRow, isLocked]);

  const firstTarget = () => editable.find((row) => datesEmpty(current(row))) || editable[0] || null;

  /* ลูกค้าที่ยังไม่ตั้ง: ตัวแก้เปิดทีละช่อง (วันวางบิล | กำหนดชำระ | รอเหตุการณ์) — **จำช่องที่เปิดไว้ที่ `views` ตั้งแต่ตอนเปิด**
     (ไม่ใช่แค่ตอนแตะ Segmented) ⇒ เซลล์รู้ว่าตัวแก้อยู่ช่องไหน (`tap`: แตะอีกช่องของงวดที่เปิดอยู่ = สลับ ไม่ใช่ปิด)
     · มาจากเซลล์ = ช่องนั้นเสมอ (แทนวิธีที่จำไว้) · ทางอื่น (ปุ่มการ์ด · แถบงวด · ลูกศร · ไปงวดถัดไปเอง) = ที่จำไว้ ไม่มี = ค่าตั้งต้น
     · ตั้งแล้ว = ไม่ต้องจำ (ตัวแก้เดียวแก้ทั้งสองช่อง — ตัวแก้ตัดสินวิธีเองตอนเปิด) */
  const seedView = (row, field, value) => {
    if (kind !== "none" || !row) return;
    setViews((v) => (field || !DATE_VIEWS.none.includes(v[row.id])
      ? { ...v, [row.id]: noneOpenView(field, value ?? currentDates(row, drafts)) }
      : v));
  };

  const enter = useCallback((rowId = null, { field = null } = {}) => {
    if (!available || busy) return;
    if (blocker) { notifyToast.error(blocker); return; }
    clearErrorRef.current?.();
    setActive(true);
    setSummaryOpen(false);
    const row = rowId ? sorted.find((r) => r.id === rowId) : null;
    if (row && isLocked(row)) {
      const l = lock(row);
      notifyToast.info(`งวดที่ ${row.seq}: ${l.reason} — แก้วันไม่ได้${l.hint ? ` · ${l.hint}` : ""}`);
    }
    const target = row && !isLocked(row) ? row : (rowId || placement === "sheet" ? firstTarget() : null);
    setOpenId(target?.id || null);
    setOpenField(target && target === row ? field : null);
    seedView(target, target && target === row ? field : null);
    setFocusTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, busy, blocker, sorted, isLocked, lock, placement, drafts, kind]);

  const reset = () => {
    setActive(false);
    setOpenId(null);
    setOpenField(null);
    setDrafts({});
    setViews({});
    setFill(null);
    setSummaryOpen(false);
  };

  /* ยกเลิก = ทิ้งร่างทั้งหมดแล้วออกจากโหมด · มี toast "เอาคืน" (ยืมจากแบบ C) — ไม่ต้องถามก่อน เพราะเอาคืนได้
     ⚠️ "เอาคืน" ถามด่านล่าสุดก่อน (gateRef) — ระหว่าง toast ค้าง คนอาจเริ่มแก้ช่วงครอบแล้ว ⇒ คืนร่าง = สองชุดร่างเปิดพร้อมกัน
       (review R-UI) · ติดด่าน = บอกเหตุแทนการคืน */
  const cancel = () => {
    if (busy) return;
    const kept = drafts;
    const count = changes.length;
    reset();
    if (!count) return;
    notifyToast.info(`ทิ้งวันที่แก้ ${count} งวด`, {
      action: {
        label: "เอาคืน",
        onClick: () => {
          const gate = gateRef.current;
          if (!gate.available) return;
          if (gate.blocker) { notifyToast.error(gate.blocker); return; }
          setDrafts(kept);
          setActive(true);
        },
      },
    });
  };

  const save = async () => {
    if (busy) return;
    if (!changes.length) {
      notifyToast.info("ยังไม่ได้แก้วันงวดไหน — แตะช่องวันเพื่อเริ่ม");
      return;
    }
    if (saveBlocker) { notifyToast.error(saveBlocker); return; }
    const ok = await onSave?.(scheduleManyRows(changes));
    if (ok) reset();
  };

  const open = (rowId, { field = null } = {}) => {
    const row = sorted.find((r) => r.id === rowId);
    if (!row || busy) return;
    if (isLocked(row)) {
      const l = lock(row);
      notifyToast.info(`งวดที่ ${row.seq}: ${l.reason} — แก้วันไม่ได้${l.hint ? ` · ${l.hint}` : ""}`);
      return;
    }
    setActive(true);
    setOpenId(row.id);
    setOpenField(field);
    seedView(row, field);
    setFocusTick((t) => t + 1);
  };
  const close = () => setOpenId(null);
  /* แตะเซลล์วันในโหมด — งวดอื่น = เปิดงวดนั้นที่ช่องที่แตะ · งวดที่เปิดอยู่ = ปิด **เว้นแต่** ลูกค้ายังไม่ตั้งแล้วแตะอีกช่อง
     (สลับไปช่องนั้น — `dateCellTapCloses` · review 28/09) */
  const tap = (rowId, field) => {
    if (openId === rowId && dateCellTapCloses(kind, field, views[rowId])) close();
    else open(rowId, { field });
  };

  /* เลือกวันของงวด — ถ้าแผงเติมเปิดอยู่ แถวนี้หลุดจากการเติม (ค่าที่แก้เองเป็นฐานใหม่ · ยืมจากแบบแนะนำ) */
  const setValue = (row, value) => {
    if (busy) return;
    setDrafts((d) => withDraft(d, row, value));
    setFill((f) => (f ? { ...f, base: withDraft(f.base, row, value), excluded: [...new Set([...(f.excluded || []), row.id])] } : f));
  };
  /* เลือกแล้วไปงวดถัดไปที่ว่างเอง — ใบงวดเดียว/ไม่มีงวดว่างเหลือ = ปิดตัวแก้ (แผ่นมือถือคงงวดเดิมไว้ให้เห็นผล) */
  const choose = (row, value, { advance = true } = {}) => {
    if (busy) return;
    setValue(row, value);
    if (!advance) return;
    const nextDrafts = withDraft(drafts, row, value);
    const next = nextEmptyRow(sorted, (r) => currentDates(r, nextDrafts), row.seq, isLocked);
    if (next) {
      setOpenId(next.id);
      setOpenField(null);
      seedView(next, null, currentDates(next, nextDrafts));
      setFocusTick((t) => t + 1);
    } else if (placement !== "sheet") setOpenId(null);
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

  /* วิธีที่ตัวแก้วาด — ที่จำไว้ของงวด > ที่ตัวแก้ตัดสินตอนเปิด (`opened`) > ค่าตั้งต้นตามชนิดตอนนี้ (`fallback`)
     ⚠️ ค่าที่ไม่อยู่ในชุดวิธีของชนิดตอนนี้ถูกข้ามเสมอ (`dateViewOf`) — กติกาเปลี่ยนระหว่างอยู่ในโหมดแล้วยังค้างวิธีเก่า
       = วาดสาขาของกติกาเก่า (review 28/09 · ดู `ruleShape` ข้างบน) */
  const view = (row, opened, fallback) => dateViewOf(kind, views[row?.id], opened, fallback);
  const setView = (row, next) => setViews((v) => ({ ...v, [row.id]: next }));

  /* ── แผงเติม — ฐาน = ร่าง ณ ตอนเปิด · เลือกตัวเลือกใหม่ = เริ่มจากฐานเดิม (ไม่ซ้อนผลรอบก่อน) ──
     `choice` = ตัวเลือกที่ลงตารางอยู่ (null = ยังไม่ได้แตะ — ไม่มีค่าตั้งต้น) · `day` = วันที่ที่แตะในตารางวันที่ 1–31
     `excluded` = งวดที่คนแก้เองระหว่างแผงเปิด (ค่าที่แก้เองเป็นฐานใหม่ ตัวเติมไม่แตะอีก) */
  const openFill = () => {
    if (!available || busy) return;
    if (blocker) { notifyToast.error(blocker); return; }
    clearErrorRef.current?.();
    setActive(true);
    setFill({ base: drafts, includeDated: false, choice: null, day: null, excluded: [] });
    setOpenId(null);
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
    available, active, blocker, placement, kind, fillKind, ruleValue, creditDays, todayIso, busy,
    rows: sorted, editable, drafts, current, lock, isLocked, changes, dropped, changedIds, warnings, replaced, saveBlocker,
    emptyCount, dirty, openId, openRow, openField, focusTick,
    enter, cancel, save, open, close, tap, choose, setValue, revert, view, setView,
    summaryOpen, setSummaryOpen,
    fill, openFill, closeFill, fillCurrent, fillLocked, patchFill, applyFill,
  };
}
