"use client";
// ── ตัวต่อสาย "หน้าพื้นที่ ↔ ประวัติของเบราว์เซอร์" ของจอหน้างาน (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.3) ─────────────
//
// ⭐ **กติกาทั้งหมดอยู่ที่ตัวตัดสินล้วน `surveyZoneRouteStep`** (`lib/service/surveyZoneRoute.js` — เทสต์ทุกแถวของตาราง §3.3)
//   และตัวทำตามลำดับ `createSurveyZoneRouteRunner` (`lib/service/surveyZoneRouteRunner.js` — เทสต์ด้วยประวัติปลอม)
//   ที่นี่แค่ ① ป้อนเหตุการณ์ (กดแถว · ‹ › · ถัดไป · ปุ่มย้อนของเครื่อง · สลับแท็บ · หมุนจอ · รายการพื้นที่เปลี่ยน)
//   ② ต่อของจริงให้ตัวทำ (ประวัติของเบราว์เซอร์ · นาฬิกา) ③ เลื่อน/โฟกัสหลังวาด
//   ⇒ ปุ่ม "← พื้นที่ทั้งหมด" กับปุ่มย้อนของมือถือ/ปัดขอบจอ iOS พาไปที่เดียวกันเสมอ และทุกทางออกจากพื้นที่ที่มีค่าค้างถูกถาม
//
// ⚠️ **ประวัติเขียนด้วย `history.pushState/replaceState` ตรง ๆ** — Next (app router) หุ้มสองตัวนี้ไว้ให้ `useSearchParams`
//   เห็น URL ใหม่ และคัดลอกสถานะภายในของมันไปกับรายการใหม่ (`node_modules/next/dist/client/components/app-router.js`)
//   ⇒ path เดิม = หน้าไม่ถูกสร้างใหม่ · ถ้าใช้ `router.push` ทุกการเปิดพื้นที่คือการนำทางที่ commit ช้ากว่าเรา (เขียนทับ URL)
// ⚠️ **ค่าที่หน้าถือคือความจริง** — `?zone=` อ่านครั้งเดียวตอนเริ่ม (ลิงก์ตรง) หลังจากนั้นสถานะในหน้าคือตัวจริง
//   ปุ่มย้อน/ไปหน้าอ่าน `?zone=` ของรายการที่ไปถึง แล้วส่งให้ตัวตัดสิน · เหตุการณ์ของ path อื่นไม่ใช่ของหน้านี้
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { surveySheetHref } from "@/lib/service/surveyFieldView";
import { createSurveyZoneRouteRunner } from "@/lib/service/surveyZoneRouteRunner";
import { cssLengthPx } from "@/lib/ui/cssLength";
import { SURVEY_ZONE_PANE_ID } from "@/components/service/SurveyFieldWorkspace";
import { SURVEY_ZONE_LIST_TITLE_ID, surveyZoneRowId } from "@/components/service/SurveyZoneList";

/** id ของ h2 ชื่อพื้นที่ — หน้าพื้นที่วาง id นี้ และตัวต่อสายย้ายโฟกัสมาที่นี่เมื่อเปิดพื้นที่ (หน้าเต็มจอ) */
export const surveyZoneHeadingId = (zoneId) => `survey-zone-title-${zoneId}`;

const idOf = (value) => (value === null || value === undefined || value === "" ? null : String(value));
/* กุญแจชั้นพื้นที่บนรายการประวัติที่เปิดอยู่ (`surveyZone` — ตัวทำเขียนตอนดัน/แทนที่ · Next คงกุญแจของเราไว้ตอนรีเฟรช
   และตอนย้อนกลับมาจากหน้าอื่น) — มี = รายการนี้คือชั้นพื้นที่ที่ดันบนชั้นใบของหน้านี้แล้ว */
const layerHere = () => idOf(window.history.state?.surveyZone);
/* รายการที่เปิดอยู่คือชั้นของเราเอง (พื้นที่หรือชั้นเปล่า) — ตัวตัดสินใช้ตอนหมุนจอ (ไม่เขียนชั้นใบทับชั้นเราแล้วดันซ้อน) */
const onOurLayer = () => window.history.state?.surveyZone != null || window.history.state?.surveyLayer === true;

/**
 * @param requestId     รหัสใบ (ประกอบ URL `?zone=`)
 * @param ready         ข้อมูลโหลดแล้ว — เริ่มทำงานครั้งแรกเมื่อเป็นจริง **ทั้งสองแท็บ** (ตัวตัดสินเขียนคง `?tab=result` เอง)
 *                      · แท็บหน้างาน (`tab !== 'result'`) คือตัวกั้นการตามทัน (รายการพื้นที่ · พื้นที่ที่จองไว้) ไม่ใช่ตัวกั้นการเริ่ม
 * @param initialZoneId `?zone=` ตอนเปิดหน้า
 * @param zoneIds       id ของทุกแถวในใบ (รวมที่ตัดออก)
 * @param defaultZoneId `surveyDefaultZoneId(...)` — บานขวาเมื่อไม่มีใครเลือก
 * @param split         สองบาน (≥1000)
 * @param dirtyZoneIds  พื้นที่ที่มีค่าพิมพ์ค้าง (หน้าพื้นที่รายงานขึ้นมา) — ตัวตัดสินถามเฉพาะพื้นที่ที่เปิดอยู่
 * @param pageDirty     ของค้างระดับหน้า (การเคาะ · ข้อความถึงหัวหน้า · รูปที่ยังส่ง) — ถามตอนย้อนออกจากหน้า (สองบาน)
 * @param tab           แท็บที่เปิดอยู่ — กดแท็บเดิมซ้ำ = ไม่ทำอะไร · ย้อนออกจากแท็บสรุปดันรายการแท็บสรุปกลับ
 * @param snapshot      ตัวนับรอบโหลดที่จบ (เปลี่ยนค่า = โหลดจบหนึ่งรอบ **ทั้งได้ใบและพัง**) — พื้นที่ที่จองเปิดไว้แต่ไม่มาถึง = ทิ้งคำขอ
 * @param onAsk         `({ from, to, via }) => Promise<boolean>` — กล่อง "ทิ้งค่าที่ยังไม่บันทึก?"
 *                      (`via:'leave'` = ออกจากหน้า → ผู้เรียกใช้กล่องของการออกจากหน้า)
 * @param onResetDraft  ทิ้งร่างของพื้นที่ที่เปิดอยู่ (หน้าเปลี่ยน key ของหน้าพื้นที่)
 * @param onTab         `(tab, zoneId|null, layer) => void` — สลับแท็บจริง (`zoneId` = ชั้นพื้นที่ของรายการนี้ · `layer` = ชั้นเปล่า)
 * @returns `{ shown, open(zoneId), toList(), goTab(tab) }`
 */
export default function useSurveyZoneRoute({
  requestId, ready = false, initialZoneId = null, zoneIds = [], defaultZoneId = null, split = false,
  dirtyZoneIds = [], pageDirty = false, tab = null, snapshot = null, onAsk, onResetDraft, onTab,
}) {
  /* แท็บหน้างานเปิดอยู่ (และข้อมูลมาแล้ว) — ตามทันได้ · เปิดพื้นที่ได้ทันที (แท็บสรุป = จองไว้ก่อน) */
  const active = ready && tab !== "result";
  const [shown, setShown] = useState(null);
  const [domTick, setDomTick] = useState(0);

  /* ค่าล่าสุดของทุกอย่างที่ตัวตัดสิน/ผลที่ต้องทำอ่าน — ตัวต่อสายสร้างครั้งเดียว (ตัวฟัง popstate ไม่ถูกถอด/ผูกใหม่) */
  const latest = useRef(null);
  latest.current = {
    requestId, zoneIds: (zoneIds || []).map(String), defaultZoneId, split, active, tab,
    dirtyZoneIds: (dirtyZoneIds || []).map(String), pageDirty: pageDirty === true, onAsk, onResetDraft, onTab,
  };

  const startedRef = useRef(false);
  const pendingOpenRef = useRef(null);
  const domQueueRef = useRef([]);

  /* ตัวทำตามลำดับ — สร้างครั้งเดียว อ่านค่าล่าสุดผ่าน `latest` (ตัวฟัง popstate ไม่ถูกถอด/ผูกใหม่ทุกรอบวาด) */
  const engine = useMemo(() => createSurveyZoneRouteRunner({
    read: () => latest.current,
    history: {
      /* Next หุ้มสองตัวนี้ไว้ ⇒ `useSearchParams` เห็น URL ใหม่ และหน้าไม่ถูกสร้างใหม่ (path เดิม) */
      push: (data, url) => window.history.pushState(data, "", url),
      replace: (data, url) => window.history.replaceState(data, "", url),
      go: (delta) => window.history.go(delta),
      /* กุญแจชั้นเปล่า (`surveyLayer`) บนรายการที่เปิดอยู่ — ตัวทำอ่านเองตอนเริ่ม (รีเฟรชบนชั้นเปล่าไม่ดันซ้ำ) */
      entry: () => window.history.state,
    },
    onAsk: (effect) => latest.current.onAsk?.(effect),
    onResetDraft: () => latest.current.onResetDraft?.(),
    onTab: (next, zoneId, layer) => latest.current.onTab?.(next, zoneId, layer),
    onShown: (zoneId) => setShown(zoneId),
    queueDom: (effect) => {
      /* เลื่อน/โฟกัสต้องรอให้บานที่เพิ่งเปิดวาดเสร็จก่อน */
      domQueueRef.current.push(effect);
      setDomTick((n) => n + 1);
    },
    scrollY: () => window.scrollY,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (timer) => window.clearTimeout(timer),
  }), []);
  useEffect(() => () => engine.dispose(), [engine]);

  /* ── เริ่มครั้งแรก — ลิงก์ตรง `?zone=` (หรือพื้นที่ที่ถูกขอเปิดไว้ก่อนเริ่ม) ปูชั้นใบไว้ก่อน ⇒ ย้อนครั้งแรกยังอยู่ในใบ ──
     ⚠️ ระหว่างอยู่แท็บสรุป (ไม่ active) **ไม่ตามทัน** รายการพื้นที่/พื้นที่ที่จองไว้ — เปิด/ย้ายพื้นที่ตอนนั้นเขียน `?zone=`
        = ลบ `?tab=result` ทิ้ง แล้วแท็บเด้งกลับหน้างานเอง ⇒ ตามทันตอนกลับมาหน้างาน
        (เริ่ม · หมุนจอ · ปุ่มย้อน ทำงานทุกแท็บ — ตัวตัดสินเขียนคง `?tab=result` เอง) */
  const catchUp = useCallback(() => {
    engine.dispatch({ type: "mode", ours: onOurLayer() });
    engine.dispatch({ type: "zones" });
    const pending = pendingOpenRef.current;
    if (pending && latest.current.zoneIds.includes(pending)) {
      pendingOpenRef.current = null;
      engine.dispatch({ type: "open", zoneId: pending });
    }
  }, [engine]);

  useEffect(() => {
    /* 🐞 review 26/09 เริ่มทันทีที่ข้อมูลมา **ไม่ว่าแท็บไหน** — เดิมรอแท็บหน้างาน ⇒ หัวหน้าเปิดจากกระดิ่ง (`?tab=result`) บนจอกว้าง
       ตั้งการเคาะแล้วกดย้อน = ออกหน้า การเคาะหายไม่ถาม (ตัวฟังปุ่มย้อนทิ้งทุกเหตุการณ์ก่อนเริ่ม · ไม่มีชั้นให้ย้อนลง) */
    if (!ready) return;
    if (startedRef.current) {
      if (active) catchUp();
      return;
    }
    startedRef.current = true;
    /* 🐞 UAT 25/09 พื้นที่ที่จองไว้แต่ยังไม่มาถึง (เพิ่งเพิ่ม · ใบกำลังโหลดใหม่) — เดิมล้างคำขอทิ้งตรงนี้แล้วเริ่มด้วย id
       ที่ตัวตัดสินไม่รู้จัก ⇒ หน้าเดียวได้รายการ สองบานได้พื้นที่อื่น และพอใบมาถึงก็ไม่มีใครเปิดพื้นที่ใหม่
       ⇒ ล้างเฉพาะเมื่อรู้จักแล้ว · ยังไม่รู้จัก = คงคำขอไว้ให้ `catchUp` เปิดเมื่อพื้นที่มาถึง */
    const pending = pendingOpenRef.current;
    /* เริ่มบนแท็บสรุป = คำขอเปิดพื้นที่รอ `catchUp` ตอนกลับหน้างาน (ตัวกั้นเดียวกับการตามทัน — เปิดพื้นที่เป็นเรื่องของแท็บหน้างาน) */
    const pendingKnown = active && pending !== null && latest.current.zoneIds.includes(pending);
    if (pendingKnown) pendingOpenRef.current = null;
    engine.dispatch({ type: "init", zoneId: pendingKnown ? pending : idOf(initialZoneId), here: layerHere() });
  }, [ready, active, initialZoneId, engine, catchUp]);

  /* ── โหลดเสร็จหนึ่งรอบแล้วพื้นที่ที่จองไว้ยังไม่มา = ทิ้งคำขอ ──
     🐞 UAT 25/09 คำขอค้างไม่มีวันหมดอายุ ⇒ รายการพื้นที่เปลี่ยนครั้งหน้า (กลับมาที่แท็บ = โหลดใหม่) พาไปพื้นที่นั้นกลางคัน */
  useEffect(() => {
    const pending = pendingOpenRef.current;
    if (snapshot && pending !== null && !latest.current.zoneIds.includes(pending)) pendingOpenRef.current = null;
  }, [snapshot]);

  /* ── ปุ่มย้อน/ไปหน้าของเบราว์เซอร์ (รวมปัดขอบจอของ iOS) ── */
  useEffect(() => {
    const onPop = () => {
      if (!startedRef.current) return;
      /* รายการประวัติของ path อื่น = ไม่ใช่เรื่องของหน้านี้ (หน้ากำลังถูกเปลี่ยน) */
      if (window.location.pathname !== surveySheetHref(latest.current.requestId)) return;
      const zoneId = idOf(new URLSearchParams(window.location.search).get("zone"));
      engine.dispatch({ type: "pop", zoneId });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [engine]);

  /* ── หมุนจอข้ามเส้น 1000 — ทุกแท็บ ──
     🐞 review 26/09 เดิมส่งเฉพาะแท็บหน้างาน ⇒ หมุนตอนอยู่แท็บสรุปแล้วกดย้อน ตัวตัดสินใช้โหมดเก่า (สองบานเก่าพาออกทั้งหน้า
        แทนกลับรายการ · หน้าเดียวเก่าไม่มีชั้นให้ด่านออกจากหน้า) · ตัวตัดสินเขียนคง `?tab=result` เอง */
  useEffect(() => {
    if (startedRef.current) engine.dispatch({ type: "mode", ours: onOurLayer() });
  }, [split, engine]);

  /* ── รายการพื้นที่เปลี่ยน (ลบพื้นที่ที่เพิ่ม · โหลดใหม่) + เปิดพื้นที่ที่เพิ่งเพิ่มเมื่อมันมาถึง ── */
  const zoneKey = (zoneIds || []).map(String).join("|");
  useEffect(() => {
    if (startedRef.current && latest.current.active) catchUp();
  }, [zoneKey, catchUp]);

  /* ── เลื่อน/โฟกัสหลังวาด — เลื่อนก่อนจอวาด (ไม่กะพริบ) · โฟกัสเฟรมถัดไป (หลังโมดัลที่เพิ่งปิดคืนโฟกัสของมันแล้ว) ── */
  useLayoutEffect(() => {
    const queue = domQueueRef.current;
    if (!queue.length) return;
    domQueueRef.current = [];
    const focusLater = [];
    for (const effect of queue) {
      if (effect.kind === "scroll") {
        if (effect.to === "top") window.scrollTo(0, 0);
        else if (effect.to === "restore") window.scrollTo(0, engine.savedScroll());
        else if (effect.to === "pane") {
          const pane = document.getElementById(SURVEY_ZONE_PANE_ID);
          /* ต้นบานจมใต้แถบบน (เลื่อนลงมาอ่านท้ายพื้นที่ก่อน) = พากลับขึ้นไปที่ต้นพื้นที่ใหม่ · เห็นอยู่แล้ว = ไม่ขยับ
             ⚠️ เส้นวัดคือ `--scroll-anchor-top` ไม่ใช่ขอบจอ — แถบบนของแอปทับส่วนบนของหน้าอยู่เสมอ */
          if (pane && pane.getBoundingClientRect().top < cssLengthPx("--scroll-anchor-top", 106)) {
            pane.scrollIntoView({ block: "start" });
          }
        }
      } else {
        focusLater.push(effect);
      }
    }
    if (!focusLater.length) return;
    requestAnimationFrame(() => {
      for (const effect of focusLater) {
        const id = effect.target === "heading" ? surveyZoneHeadingId(engine.state().shown)
          : effect.target === "row" ? surveyZoneRowId(effect.zoneId)
            : SURVEY_ZONE_LIST_TITLE_ID;
        document.getElementById(id)?.focus({ preventScroll: true });
      }
    });
  }, [domTick, engine]);

  /* ── ทางเข้าของหน้า ── */
  const open = useCallback((zoneId) => {
    const id = idOf(zoneId);
    if (!id) return;
    /* ยังไม่เริ่ม · อยู่แท็บสรุป (กำลังสลับกลับ) · พื้นที่ยังไม่มาถึง (เพิ่งเพิ่ม · รอโหลดใหม่) = จองไว้ เปิดเมื่อพร้อม */
    if (!startedRef.current || !latest.current.active || !latest.current.zoneIds.includes(id)) {
      pendingOpenRef.current = id;
      return;
    }
    /* เปิดพื้นที่ที่พร้อมแล้ว = คำขอที่จองไว้ก่อนหน้าตกไป (ผู้ใช้ไปที่อื่นเองแล้ว) */
    pendingOpenRef.current = null;
    engine.dispatch({ type: "open", zoneId: id });
  }, [engine]);
  const toList = useCallback(() => {
    pendingOpenRef.current = null;
    engine.dispatch({ type: "list" });
  }, [engine]);
  const goTab = useCallback((next) => {
    /* 🐞 UAT 25/09 กดแท็บที่เลือกอยู่แล้ว = ไม่ทำอะไร (ตัวตัดสินกันซ้ำอีกชั้น — ที่นี่กันทางที่ยังไม่เริ่ม) */
    if (next === latest.current.tab) return;
    /* สลับแท็บเอง = คำขอเปิดพื้นที่ที่ค้างอยู่ตกไป ("เปิด X" สลับแท็บก่อนแล้วค่อยจอง — ลำดับนี้ไม่โดนล้าง) */
    pendingOpenRef.current = null;
    /* ยังไม่เริ่ม = ไม่มีหน้าพื้นที่ให้ถาม ⇒ สลับเลย · พกชั้นพื้นที่ของรายการนี้ไปด้วย (รีเฟรชบนแท็บสรุปที่เคยเป็น
       ชั้นพื้นที่ → กลับหน้างาน = `?zone=` เดิม ไม่ใช่ใบเปล่าที่ทำให้ตอนเริ่มดันชั้นซ้อน) */
    if (!startedRef.current) {
      latest.current.onTab?.(next, layerHere(), window.history.state?.surveyLayer === true);
      return;
    }
    engine.dispatch({ type: "tab", tab: next });
  }, [engine]);

  return { shown, open, toList, goTab };
}
