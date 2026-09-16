"use client";
// ── ตัวเลขบนเมนูหลัก (ฝั่งจอ) ─────────────────────────────────────────────
//
// อยู่บนทุกหน้าเหมือนกระดิ่ง ⇒ กติกาเดียวกัน: **พังที่นี่ต้องไม่ทำ header พัง**
// API ตอบพัง/ยังไม่มีสิทธิ์ = ไม่มีป้ายเฉย ๆ ไม่ใช่ throw ขึ้นไปทั้งเปลือก
//
// จังหวะดึง: ตอน mount · ทุก 2 นาที (เท่ากระดิ่ง) · และ **ตอนเปลี่ยนหน้า** —
// ข้อสุดท้ายจำเป็นเพราะคนตอบคำร้องเสร็จแล้วกดออกจากหน้า ป้ายต้องลดทันที
// ไม่ใช่ค้างอีกสองนาที (ป้ายที่ค้างคือป้ายที่คนเลิกเชื่อ)
// ⚠️ มีคอกกั้น MIN_GAP_MS — หน้าที่เด้ง redirect ต่อกันสองสามทีจะได้ไม่ยิงรัว
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { readCountStatus } from "@/lib/nav/navCounts";

const POLL_MS = 120_000;
const MIN_GAP_MS = 10_000;

// href ของเมนู → คีย์ที่ API ส่งมา · เมนูที่ไม่อยู่ในนี้ไม่มีป้าย
export const NAV_COUNT_KEYS = {
  "/requests": "requests",
  "/sa/tasks": "tasks",
  "/sa/leads": "leads",
  /* คิวคำร้องของฝ่ายที่มีบ้านของตัวเอง — **หนึ่งฝ่ายหนึ่งคีย์** และต้องขยับพร้อม
     `DEPT_MODULE_QUEUE` เสมอ (ฝ่ายที่มีหน้าคิวแต่ไม่มีคีย์ = คิวที่ไม่มีป้ายตลอดกาล
     ซึ่งเคยเกิดจริงกับ FN/TS · เทสต์ `navCounts.test.mjs` ล็อกคู่นี้ไว้แล้ว) */
  "/rd/requests": "rdRequests",
  "/finance/requests": "financeRequests",
  "/service/requests": "serviceRequests",
  // เฟส 1 — ขาย
  "/sa/quotations": "quotations",
  "/sa/sales-orders": "salesOrders",
  "/sa/contracts": "contracts",
  "/sa/projects": "projectCloses",
  /* คิวตรวจที่มาของ FC (mig 0337) — ดีลที่มีใบอนุมัติแล้วแต่ FC ยังไม่เดินตามใบ
     ป้ายนี้จะหดลงเรื่อย ๆ ตามที่ AE กดรับ แล้วเหลือเฉพาะดีลที่มีใบหลายฉบับจริง ๆ */
  "/sa/forecast-review": "forecastReview",
  // เฟส 1 — ฐานข้อมูล
  "/database/scents": "scents",
  "/database/formulas": "formulas",
  "/database/customers": "customers",
  "/database/products": "products",
  // เฟส 2 — บริการ + งานบริหาร (F-1: /service/my-visits เปลี่ยนเส้นทางเป็น /service/today)
  "/service/today": "visits",
  "/service/intake": "serviceIntake",
  "/mgmt/tasks": "mgmtTasks",
  // เฟส 3 — ภาษีสรรพสามิต
  "/tax/registrations": "taxRegistrations",
  "/tax/filings": "taxFilings",
  // เฟส 4 — แจ้งปัญหาระบบ + วางแผนผลิต
  "/support": "issues",
  "/production/jobs": "productionJobs",
  // เฟส 5 — บัญชีและการเงิน (งวดที่ฝ่ายขายแจ้งแล้ว รอบัญชีตรวจหลักฐาน)
  "/finance/payments": "payments",
};

/* เมนูของแต่ละระบบ (คีย์เดียวกับ `SYSTEM_CATALOG`) — ยอดรวมของระบบใช้บน **แถวระบบ**
   กับ **เมนูสลับระบบ** บนหัว สองที่ที่คนตัดสินใจว่า "จะเข้าไปทำอะไรก่อน"
   ⚠️ **หน้าแรกไม่ใช้ตัวนี้** (ADR 0016) — แผงของแต่ละระบบบวกจากแถวที่วาดจริง
   เพราะยอดตรงนี้นับเอกสารร่วมไว้ใต้ `salesplan` เสมอ ⇒ ไม่เท่ากับป้ายในแผงของ FN/RD/TS
   ⭐ เดิมสองที่นั้นไม่มีตัวเลขเลย ⇒ คนที่ทำงานหลายระบบต้องเข้าไปดูทีละระบบเพื่อรู้ว่า
   มีของค้างไหม · เมนูในระบบมีป้ายอยู่แล้ว แต่กว่าจะเห็นก็ต้องเข้าไปอยู่ในระบบนั้นก่อน
   ⚠️ ประกาศติดกับ `NAV_COUNT_KEYS` โดยตั้งใจ — เพิ่มเมนูใหม่ที่มีป้ายแล้วลืมมาใส่
   ที่นี่ = ป้ายขึ้นบนเมนูแต่ยอดรวมของระบบยังโล่ง แล้วคนสรุปว่าระบบนั้นว่าง
   (เทสต์ล็อกไว้ว่า **ทุก href ใน NAV_COUNT_KEYS ต้องอยู่ในระบบใดระบบหนึ่งเสมอ**) */
export const SYSTEM_COUNT_HREFS = {
  salesplan: [
    "/sa/leads", "/sa/tasks", "/requests",
    "/sa/quotations", "/sa/sales-orders", "/sa/contracts", "/sa/projects",
    "/sa/forecast-review",
  ],
  rd: ["/rd/requests"],
  /* ⚠️ เอกสารร่วม (ใบเสนอราคา · ใบสั่งขาย · สัญญา) นับที่ `salesplan` ที่เดียว
     แม้เมนูจะไปโผล่ในเปลือกของ FN/RD/TS ด้วย — ยอดรวมของระบบเป็นของ **กลุ่มเมนู**
     ไม่ใช่ของคนดู · ระบบบัญชีนับเฉพาะของที่เป็นของบ้านตัวเองจริง ๆ */
  finance: ["/finance/requests", "/finance/payments"],
  master: [
    "/database/scents", "/database/formulas", "/database/customers", "/database/products",
  ],
  service: ["/service/today", "/service/intake", "/service/requests"],
  mgmt: ["/mgmt/tasks"],
  tax: ["/tax/registrations", "/tax/filings"],
  support: ["/support"],
  production: ["/production/jobs"],
};

/* สถานะของตัวเลขทั้งก้อน — ป้ายบนหัวเว็บใช้แค่ `counts` เหมือนเดิม ส่วนหน้าแรก (ADR 0016)
   ต้องแยก "ยังไม่รู้" (loading) · "นับไม่สำเร็จ" (failed / status 'error') · "ศูนย์" ออกจากกัน
   `stale` = เคยได้ตัวเลขแล้ว แต่รอบล่าสุดพัง ⇒ เลขที่เห็นอยู่เป็นของรอบก่อน */
const EMPTY_STATE = { counts: {}, attempted: null, failed: new Set(), status: "loading", stale: false };

export default function useNavCounts(pathname) {
  const [state, setState] = useState(EMPTY_STATE);
  const lastAt = useRef(0);

  const load = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = now;
    /* ⚠️ พังแล้ว **คงเลขเดิมไว้** ถ้าเคยสำเร็จ (พฤติกรรมเดิมของหัวเว็บ) แล้วติดธง stale
       — ป้ายที่หายวูบทุกครั้งที่เน็ตสะดุดคือป้ายที่คนเลิกเชื่อ */
    const failure = () => setState((prev) => (prev.status === "ready" || prev.stale
      ? { ...prev, stale: true }
      : { ...EMPTY_STATE, status: "error" }));
    try {
      const res = await apiFetch("/api/nav/counts", { cache: "no-store" });
      if (!res.ok) { failure(); return; }
      const data = await res.json().catch(() => null);
      // ⚠️ แทนที่ทั้งก้อน ไม่ merge — คีย์ที่หายไปแปลว่า "ไม่เหลืออะไรให้ทำแล้ว"
      // การ merge จะทำให้ป้ายเก่าค้างอยู่ตลอดกาล
      const { counts, attempted, failed } = readCountStatus(data);
      setState({ counts, attempted, failed, status: "ready", stale: false });
    } catch { failure(); /* ป้ายพังต้องไม่ทำ header พัง */ }
  }, []);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => { load(); }, [pathname, load]);
  /* ⚠️ **ไม่ยิงตอนแท็บซ่อน** (กติกาเดียวกับกระดิ่ง) — ป้ายที่ไม่มีใครมองไม่ต้องสด
     กลับมามองเมื่อไรค่อยดึง · ทางนี้ไม่ force เพราะคอกกั้น MIN_GAP_MS ต้องมีผล
     (`visibilitychange` เด้งได้ถี่กว่ารอบโพลมาก) */
  useEffect(() => {
    const tick = (force) => {
      if (document.visibilityState !== "visible") return;
      load(force === true);
    };
    const timer = setInterval(() => tick(true), POLL_MS);
    const onVisible = () => tick(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return useMemo(() => ({ ...state, reload: () => load(true) }), [state, load]);
}

/* ⭐ ตัวเลขชุดเดียวต่อหน้า — เปลือกดึงแล้วแจกต่อ ห้ามให้หน้าไหนยิงรอบที่สองของตัวเอง
   (ยังไม่มี Provider จนกว่าจะถึง PR3 ของ ADR 0016 · ค่าตั้งต้นคือสถานะกำลังโหลด) */
export const NavCountsContext = createContext(EMPTY_STATE);

export function useNavCountsState() {
  return useContext(NavCountsContext);
}

/** จำนวนของเมนูหนึ่งตัว — ไม่มี/ศูนย์ = null (ผู้เรียกไม่ต้องเรนเดอร์ป้าย) */
export function navCountFor(counts, href) {
  const value = counts?.[NAV_COUNT_KEYS[href]];
  return Number(value) > 0 ? Number(value) : null;
}

/** ปลายทางของเมนู — เมนูที่ **มีป้ายอยู่** พาไปหน้าที่กรองไว้แล้ว
 *
 *  ⭐ กติกาข้อแรกของป้ายคือ "กดเข้าไปแล้วต้องเจอของเท่าที่เมนูบอก" · สี่คีย์แรก
 *  ผ่านข้อนี้ได้ฟรีเพราะแท็บตั้งต้นของหน้าปลายทางเท่ากับสิ่งที่ป้ายนับพอดี
 *  (คำร้อง = แท็บ "รอฉันตอบ") · คีย์เฟส 1 ไม่มีมุมมองแบบนั้น — ป้ายบอก 1 แต่กดเข้าไป
 *  เจอทะเบียนลูกค้า 121 ราย ⇒ ผูกตัวกรองไว้กับลิงก์แทน (`?count=<key>`)
 *  ⚠️ **เฉพาะตอนมีป้ายเท่านั้น** — ไม่มีของค้างแล้วยังพาไปหน้าที่กรองว่างเปล่า
 *  คือการตอบคำถามที่ไม่มีใครถาม · ไม่มีป้าย = ลิงก์ปกติ เห็นทั้งทะเบียนตามเดิม
 */
export function navHrefFor(item, count) {
  return count && item?.countHref ? item.countHref : item?.href;
}

/** ยอดรวมของทั้งระบบ — ไม่มี/ศูนย์ = null (กติกาเดียวกับป้ายบนเมนู)
 *
 *  ⚠️ **บวกจาก `counts` ที่ API ส่งมาแล้วเท่านั้น** ไม่ยิงคำขอเพิ่ม — คีย์ที่ผู้ใช้
 *  ไม่มีสิทธิ์เห็นไม่ถูกส่งมาตั้งแต่ต้น (ดู api/nav/counts) ⇒ ยอดรวมของแต่ละคน
 *  นับเฉพาะเมนูที่ตัวเองเปิดได้อยู่แล้วโดยอัตโนมัติ */
export function navCountForSystem(counts, systemKey) {
  const total = (SYSTEM_COUNT_HREFS[systemKey] || [])
    .reduce((sum, href) => sum + (navCountFor(counts, href) || 0), 0);
  return total > 0 ? total : null;
}
