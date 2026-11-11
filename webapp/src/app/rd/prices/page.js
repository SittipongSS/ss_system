"use client";
// ── ราคา + Ingredient List — ขั้นท้ายของสายพัฒนาของ RD (ม-153 · ม-159 · มติเจ้าของ 09/11/2026) ──
//
// ⭐ **สามแท็บ** (เจ้าของ 09/11: *"สองแท็บ และอยาก แยก แท็บ กลิ่น กับ สูตร เพื่อให้ง่ายต่อการจัดการ"*)
//   · งานค้างในคำร้อง — หน่วย = **รายการ** (แถวคำร้องของใบที่ยังเปิด) · ขั้นราคาอยู่ที่แถว (`rowStage` → `awaiting_price`)
//     ⇒ คิวที่นับเป็นใบตอบไม่ได้ว่าเหลืออะไรให้ใส่ราคา · จัดกลุ่มตามใบเป็นค่าตั้งต้น ใบที่รอนานสุดขึ้นก่อน
//   · กลิ่น · สูตร — หน่วย = **ตัวในทะเบียน** ที่มาจากคำร้องที่ลูกค้าคอนเฟิร์ม (ใบทุกสถานะ · `lib/rd/priceRegistry.js`)
//     ⇒ เห็นของที่ขาดราคา/Ingredient List แม้ใบจะปิดไปแล้ว (วัด prod 09/11: สูตร 27 ตัวขาด Ingredient List ครบทั้ง 27)
// ⭐ ชื่อหน้า (เจ้าของ 09/11: "ให้สอดคล้อง") — เดิม "รอใส่ราคา" ทั้งที่หน้ามีสองก้าวตั้งแต่ ม-159 และแท็บทะเบียนไม่ใช่คิว
// ⭐ ค้นหา · ตัวกรอง · จัดกลุ่ม · เรียง ทุกแท็บ (เจ้าของ 09/11: “เหมือนตารางอื่นๆ ในระบบ”) — ตัวเดียว `priceViewOf`
//
// ⭐ **"ใช้ราคานี้"** — แถวที่สูตร/กลิ่นมีราคาในทะเบียนอยู่แล้ว (RD ใส่ที่หน้าทะเบียนก่อนลูกค้าคอนเฟิร์ม) ผูกราคาเดิม
// เข้าแถวได้ทันที ไม่ต้องพิมพ์เลขเดิมซ้ำ (ซึ่งได้ rev ซ้ำในประวัติราคา) · ราคาหมดอายุ = โชว์ปุ่มแล้วบอกเหตุตอนกด
// ⭐ ปุ่มนี้มีไว้ยืนยัน **ราคาเก่าที่ค้างอยู่** เท่านั้น (เจ้าของ 11/11/2026) — ราคาที่เพิ่งใส่จากแท็บกลิ่น/สูตรหรือหน้าทะเบียน
//   ผูกเข้าแถวที่รอราคาให้เองที่ตัวเขียนราคาทะเบียน (`lib/requests/registryPriceLink.js`) ไม่ต้องกดซ้ำ
//
// ⚠️ **ไม่เขียนกลไกราคาใหม่** — "ใส่ราคา" เปิด `RegistryPriceModal` ตัวเดียวกับหน้าใบ/หน้าทะเบียน ยิง endpoint เดิม ·
// ช่องราคาและราคาปัจจุบันมาจาก server (ตัวคิดเดียวกับ POST) ⇒ จอเปิดช่องที่ API ตีกลับไม่ได้
// ⚠️ ด่านปุ่มแท็บแรก = `canAnswerRequest` ตัวเดียวกับที่ API ใช้ปฏิเสธ · แท็บทะเบียน = `canQuoteMaterial` (ราคา) +
//    `isFormulaRegistrar` (Ingredient List) ตัวเดียวกับหน้าทะเบียน/API ทะเบียน (ไม่มีสิทธิ์ = ไม่เห็นปุ่ม · กฎ UI ของระบบ)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Coins, Inbox, ListChecks, Search } from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import Segmented from "@/components/ui/Segmented";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import GatedAction from "@/components/ui/GatedAction";
import StatusBadge from "@/components/ui/StatusBadge";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import RegistryPrice from "@/components/database/RegistryPrice";
import RegistryPriceModal from "@/components/database/RegistryPriceModal";
import IngredientListModal from "@/components/database/IngredientListModal";
import PriceRegistryTable from "@/components/rd/PriceRegistryTable";
import { apiJson } from "@/lib/apiFetch";
import { cachedFetchJson } from "@/lib/apiCache";
import { businessDate } from "@/lib/businessDate";
import { NA, fmtDate, fmtNumber, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { useCapUser, useDepartment } from "@/lib/roleContext";
import { canAnswerRequest } from "@/lib/deptRequests";
import { canQuoteMaterial } from "@/lib/materialPrices";
import { isFormulaRegistrar } from "@/lib/master/formulas";
import { categoryNameBoth, findCategoryByCode } from "@/lib/master/productCategoryOptions";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import useStickyState from "@/lib/ui/useStickyState";
import { allBucketsCollapsed, toggleBucketKey } from "@/lib/listGrouping";
import { priceBoardTotals, usablePriceNote, waitingDays } from "@/lib/rd/priceBoard";
import { priceRegistryTotals } from "@/lib/rd/priceRegistry";
import {
  DEFAULT_PRICE_VIEWS, PRICE_GROUP_OPTIONS, PRICE_PROGRESS_OPTIONS, PRICE_SORT_DEFAULT, PRICE_SORT_DIR, PRICE_SORT_OPTIONS,
  PRICE_TABS, emptyPriceFilters, isPriceTab, priceFilterCount, priceFilterDimensions, priceFilterOptions, priceViewOf,
  priceViewState,
} from "@/lib/rd/priceBoardView";
import styles from "./page.module.css";

// ⭐ จัดตารางใหม่ (ผู้ใช้ 03/11/2026: "ปรับ layout สี ตำแหน่ง ป้ายต่างๆ ของตารางหน่อย มันดูยาก") — สี่คอลัมน์:
//   รายการ (รหัสบน·ชื่อล่าง) · ลูกค้าคอนเฟิร์ม (+ รอกี่วัน) · ราคา · Ingredient List
//   สองคอลัมน์ท้าย = **สองก้าวที่ต้องครบ** (ม-159) ทรงเดียวกัน: ป้ายสถานะสีบนสุด → รายละเอียด → ปุ่ม
//   ⇒ กวาดตาแนวนอนเห็นทันทีว่ารายการไหนเหลืออะไร (เดิมหกคอลัมน์ ปุ่มลอยห่างจากราคาที่มันใช้ และ "—" ไม่บอกว่าแปลว่าอะไร)
const COLS = 4;
const PRICE_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const SEARCH_PLACEHOLDER = {
  requests: "เลขที่คำร้อง / ลูกค้า / รหัส / ชื่อรายการ",
  scents: "รหัส / ชื่อกลิ่น / ลูกค้า / ชื่อที่ลูกค้าเรียก / เลขที่คำร้อง",
  formulas: "รหัส / ชื่อสูตร / หมวด / กลิ่น / ลูกค้า / ชื่อสาร / เลขที่คำร้อง",
};

export default function RdPricesPage() {
  const me = useCapUser();
  const department = useDepartment();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // แท็บทะเบียน (กลิ่น · สูตร) — โหลดแยกเส้น แยกตัวนับรอบ (ก้อนอิสระ พังก้อนเดียวอีกก้อนยังขึ้น)
  const [registry, setRegistry] = useState({ scents: [], formulas: [] });
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState("");
  const [categories, setCategories] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [linking, setLinking] = useState(null);
  // แถวที่กด "ใส่ Ingredient List" (ม-159) — เปิด `IngredientListModal` ตัวเดียวกับหน้าคำร้อง/หน้าสูตร
  const [ingredientRow, setIngredientRow] = useState(null);
  // แท็บทะเบียน — ราคา/Ingredient List ลงทะเบียนตรง (endpoint ของหน้าทะเบียน) · ล็อกปุ่มของแถวจนตารางใหม่มาถึง
  const [entityPricing, setEntityPricing] = useState(null);
  const [entityIngredients, setEntityIngredients] = useState(null);
  const [entityBusy, setEntityBusy] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  /* มุมมองจำไว้ตอนกดย้อนกลับมา (useStickyState) — แยกต่อแท็บ: ตัวกรองของแท็บสูตร (หมวด · Ingredient List) ไม่มีในแท็บอื่น */
  const [rawTab, setTab] = useStickyState("tab", "requests");
  const [views, setViews] = useStickyState("views", DEFAULT_PRICE_VIEWS);
  const tab = isPriceTab(rawTab) ? rawTab : "requests";
  const view = useMemo(() => priceViewState(tab, views?.[tab]), [tab, views]);
  const setView = (patch) => setViews((prev) => ({ ...DEFAULT_PRICE_VIEWS, ...prev, [tab]: { ...view, ...patch } }));
  const startRun = useLatestRun();
  const startRegistryRun = useLatestRun();

  /* ⚠️ ด่านของจอต้องเป็น **ฟังก์ชันตัวเดียวกับที่ API ใช้ปฏิเสธ** (`canAnswerRequest` ใน price/route.js) ·
     หน้านี้ตรึงฝ่ายเป็น RD อยู่แล้ว (เส้น API ก็ตรึง) จึงถามด้วยใบสมมติที่มีแค่ `dept` พอ */
  const canPrice = useMemo(
    () => canAnswerRequest({ ...me, department }, { dept: "RD" }),
    [me, department],
  );
  // แท็บทะเบียน — ด่านเดียวกับปุ่มราคาหน้าทะเบียนกลิ่น/สูตร (`canQuoteMaterial`) และ action `ingredients` ของ API สูตร
  const canPriceEntity = useMemo(() => canQuoteMaterial({ ...me, department }, "RM_FB"), [me, department]);
  const canEditIngredients = useMemo(() => isFormulaRegistrar(me), [me]);

  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    if (!opts?.background) setLoadError("");
    try {
      const data = await apiJson("/api/rd/price-board", { cache: "no-store" });
      if (!isLatest()) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (!isLatest()) return;
      if (!opts?.background) setLoadError(e.message);
    }
    if (isLatest()) setLoading(false);
  }, [startRun]);

  const loadRegistry = useCallback(async (opts) => {
    const isLatest = startRegistryRun();
    if (!opts?.background) { setRegistryLoading(true); setRegistryError(""); }
    try {
      const data = await apiJson("/api/rd/price-board/registry", { cache: "no-store" });
      if (!isLatest()) return;
      setRegistry({
        scents: Array.isArray(data?.scents) ? data.scents : [],
        formulas: Array.isArray(data?.formulas) ? data.formulas : [],
      });
    } catch (e) {
      if (!isLatest()) return;
      if (!opts?.background) setRegistryError(e.message);
    }
    if (isLatest()) setRegistryLoading(false);
  }, [startRegistryRun]);

  /* ใส่ที่แท็บไหนก็กระทบอีกแท็บ (Ingredient List ของสูตรปิดแถวคำร้องที่รออยู่ · ราคาทะเบียนที่เพิ่งใส่ผูกเข้าแถวที่รอราคาเอง — 11/11)
     ⇒ หลังบันทึก/กลับมามองหน้า โหลดทั้งสองก้อน */
  const loadAll = useCallback((opts) => Promise.all([load(opts), loadRegistry(opts)]), [load, loadRegistry]);
  useEffect(() => { loadAll(); }, [loadAll]);
  useRevalidateOnFocus(loadAll);

  // หมวดสินค้า = master ที่แทบไม่เปลี่ยน — โหลดผ่านแคชครั้งเดียว (ตัวเดียวกับหน้าทะเบียนสูตร) ไว้ตั้งชื่อหมวด
  useEffect(() => {
    cachedFetchJson("/api/master/product-types")
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  const categoryLabel = useCallback(
    (code) => categoryNameBoth(findCategoryByCode(categories, code)) || "", [categories],
  );

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า `toISOString()` ยังให้เมื่อวาน แล้ว "รอมาแล้ว" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  const totals = useMemo(() => priceBoardTotals(rows, { todayIso: today }), [rows, today]);
  const scentTotals = useMemo(() => priceRegistryTotals(registry.scents), [registry.scents]);
  const formulaTotals = useMemo(() => priceRegistryTotals(registry.formulas), [registry.formulas]);

  const tabRows = tab === "scents" ? registry.scents : tab === "formulas" ? registry.formulas : rows;
  const tabLoading = tab === "requests" ? loading : registryLoading;
  const tabError = tab === "requests" ? loadError : registryError;
  const viewOpts = useMemo(() => ({ categoryLabel }), [categoryLabel]);
  const { rows: shown, groups } = useMemo(() => priceViewOf(tab, tabRows, view, viewOpts), [tab, tabRows, view, viewOpts]);
  const filterOptions = useMemo(() => priceFilterOptions(tab, tabRows, viewOpts), [tab, tabRows, viewOpts]);
  const filterCount = priceFilterCount(tab, view.filters);
  const narrowed = Boolean(view.q.trim()) || filterCount > 0;
  const tabTotals = tab === "scents" ? scentTotals : tab === "formulas" ? formulaTotals : null;

  /* ใช้ราคาในทะเบียน — กล่องยืนยันบอกผลก่อนกด (กติกาของระบบ: ทุกก้าวที่ปิดงานต้องบอกว่าจะเกิดอะไร)
     ⚠️ ส่ง rev ที่จอเห็นไปด้วย — มีคนออกราคาใหม่ระหว่างที่หน้าเปิดค้าง server ตีกลับ 409 แทนการผูกเลขที่ไม่เคยเห็น */
  /* ⭐ ม-159 — ผลของการกดต่างกันตามว่าสูตรมี Ingredient List แล้วหรือยัง (ครบสองอย่างถึงจบ) ⇒ ประโยคบอกผลตามแถว */
  const applyCurrentPrice = async (row) => {
    const use = row.useCurrent;
    const ok = await confirmAction({
      title: "ใช้ราคาในทะเบียน",
      description: `ผูก${use.text} ${fmtNumber(use.unitPrice, PRICE_DIGITS)} ฿/กก.`
        + `${use.revisionNo != null ? ` (rev ${use.revisionNo})` : ""} เข้ารายการ "${row.name}" ของ ${naText(row.docNo)}`,
      detail: "ไม่ออกราคารุ่นใหม่ — ทะเบียนวัสดุไม่เปลี่ยน · "
        + (row.ingredient?.missing
          ? "รายการนี้ยังรอ Ingredient List ของสูตร — ใส่ครบแล้วถึงหายจากหน้านี้"
          : "รายการนี้ถือว่าใส่ราคาแล้วและหายจากหน้านี้ · ใบที่ครบทุกรายการจะขึ้นว่า RD ตอบแล้ว"),
      confirmLabel: "ใช้ราคานี้",
    });
    if (!ok) return;
    setLinking(row.itemId);
    try {
      await apiJson(`/api/sa/requests/${row.requestId}/items/${row.itemId}/price`, {
        method: "POST",
        json: { useCurrent: { revisionId: use.revisionId } },
        fallbackError: "ใช้ราคาในทะเบียนไม่สำเร็จ",
      });
      notifyToast(`ใช้ราคา ${use.short} แล้ว`);
    } catch (e) {
      notifyToast.error(e.message || "ใช้ราคาในทะเบียนไม่สำเร็จ");
    } finally {
      // ตีกลับ 4xx = จอไม่ตรงกับของจริง ⇒ ดึงใหม่ทั้งสองทาง (เบื้องหลัง — ตารางไม่หายทั้งก้อน)
      // ⚠️ ล็อกปุ่มของแถวจนตารางใหม่มาถึง — ปลดก่อน = แถวที่เพิ่งปิดยังกดซ้ำได้แล้วได้ 409 งง ๆ (กับดักเดียวกับหน้าใบ)
      try { await loadAll({ background: true }); } finally { setLinking(null); }
    }
  };

  /* บันทึกจากแท็บทะเบียนเสร็จ — ล็อกปุ่มของแถวจนตารางใหม่มาถึง (เหตุผลเดียวกับ "ใช้ราคานี้") */
  const afterEntitySave = async (key, msg) => {
    notifyToast(msg);
    setEntityBusy(key);
    try { await loadAll({ background: true }); } finally { setEntityBusy(null); }
  };

  const changeTab = (next) => { setTab(next); setCollapsed(new Set()); };
  const setFilter = (key, values) => setView({ filters: { ...emptyPriceFilters(tab), ...view.filters, [key]: values } });
  const sortOptions = PRICE_SORT_OPTIONS[tab];
  const tabCount = (key) => {
    if (key === "requests") return loading || loadError ? null : totals.rows;
    if (registryLoading || registryError) return null;
    return (key === "scents" ? scentTotals : formulaTotals).incomplete;
  };

  return (
    <Workspace
      icon={<Coins size={22} />}
      title="ราคา + Ingredient List"
      subtitle="กลิ่น/สูตรที่ลูกค้าคอนเฟิร์มแล้ว — RD ใส่ราคา F · B · FB และ Ingredient List ของสูตร · งานในคำร้องครบสองอย่างแล้วหายจากแท็บแรกเอง"
    >
      <div className="flex flex-col gap-4">
        {/* ⚠️ 0 ก็เป็นข้อมูล — "รอใส่ราคา 0" คือคำตอบที่ RD เปิดหน้ามาเพื่อจะรู้ · ซ่อนตอนว่างแยกไม่ออกจาก "ยังโหลดไม่เสร็จ" */}
        {tab === "requests" && !loading && !loadError ? (
          <MetricStrip aria-label="ยอดงานค้างในคำร้องของฝ่าย">
            {/* ม-159 — สองก้าวแยกกัน (มาไม่พร้อมกัน) แต่รายการจบเมื่อครบ ⇒ นับแยก · แถวเดียวอาจอยู่ทั้งสองการ์ด */}
            <Metric
              label="รอใส่ราคา" value={`${totals.awaitingPrice} รายการ`}
              tone={totals.awaitingPrice > 0 ? "warning" : undefined}
            />
            <Metric
              label="รอ Ingredient List" value={`${totals.missingIngredients} รายการ`}
              tone={totals.missingIngredients > 0 ? "warning" : undefined}
              note="สูตรหมวด 01/02 (ยกเว้น 02-020)"
            />
            <Metric label="ใบคำร้อง" value={`${totals.requests} ใบ`} note="ใส่ครบใบ = RD ตอบใบนั้นแล้ว" />
            <Metric
              label="รอนานสุด" value={totals.maxDays != null ? `${totals.maxDays} วัน` : NA}
              note="นับจากวันที่ลูกค้าคอนเฟิร์ม"
            />
            {/* ⭐ นับเฉพาะแถวที่ปุ่ม "ใช้ราคา … นี้" กดแล้วผ่าน (`usable`) · แถวที่มีปุ่มแต่ราคาใช้ไม่ได้ (`blocked`)
                บอกไว้ในหมายเหตุ ⇒ สองเลขรวมกัน = แถวที่เห็นปุ่ม (ตรวจตัวเลข 26/10 · L15)
                🐞 เดิม "มีราคาในทะเบียนแล้ว" ไม่นับราคาหมดอายุ ทั้งที่มันมีราคาในทะเบียนและมีปุ่ม
                ⚠️ หมายเหตุเลือกตาม `canPrice` — คนที่ไม่มีปุ่ม (ช่องจัดการเป็น "—") ต้องไม่ได้ยินคำว่า "ปุ่ม"/"กด" */}
            <Metric
              label="ใช้ราคาในทะเบียนได้เลย" value={`${totals.usable} รายการ`}
              note={usablePriceNote(totals, { canPrice })}
            />
          </MetricStrip>
        ) : null}
        {/* แท็บทะเบียน — นับเป็น "ตัว" (หน่วยของแท็บ) · ราคาหมดอายุนับว่ามีราคา (ป้ายบอกแยก) */}
        {tabTotals && !registryLoading && !registryError ? (
          <MetricStrip aria-label={tab === "scents" ? "ยอดกลิ่นจากคำร้องที่คอนเฟิร์ม" : "ยอดสูตรจากคำร้องที่คอนเฟิร์ม"}>
            <Metric
              label="ยังไม่มีราคา" value={`${tabTotals.missingPrice} ตัว`}
              tone={tabTotals.missingPrice > 0 ? "warning" : undefined}
            />
            {tab === "formulas" ? (
              <Metric
                label="ยังไม่มี Ingredient List" value={`${tabTotals.missingIngredient} ตัว`}
                tone={tabTotals.missingIngredient > 0 ? "warning" : undefined}
                note="สูตรหมวด 01/02 (ยกเว้น 02-020)"
              />
            ) : null}
            <Metric label="ราคาหมดอายุ" value={`${tabTotals.expiredPrice} ตัว`} note="มีราคาแล้ว แต่ใบขอราคาผลิตจะเตือน" />
            <Metric label="ครบแล้ว" value={`${tabTotals.complete} / ${tabTotals.all} ตัว`} note="ทุกตัวที่มาจากคำร้องที่ลูกค้าคอนเฟิร์ม" />
          </MetricStrip>
        ) : null}

        <ListPanel
          icon={<Coins size={17} aria-hidden="true" />}
          title={tab === "requests" ? "งานค้างในคำร้อง" : tab === "scents" ? "กลิ่นจากคำร้องที่คอนเฟิร์ม" : "สูตรจากคำร้องที่คอนเฟิร์ม"}
          subtitle={tab === "requests"
            ? "ใบที่ยังเปิด · ราคาลงทะเบียนวัสดุ · Ingredient List ลงทะเบียนสูตร · ครบสองอย่างแล้วรายการหายเอง"
            : "ใบทุกสถานะ (รวมใบที่ปิดแล้ว) · ใส่ที่นี่ลงทะเบียนตรง — ตัวเดียวกับหน้าทะเบียน"}
          count={tabLoading || tabError ? null : `${shown.length} รายการ`}
          loading={tabLoading}
          toolbar={(
            /* แท็บก่อน แล้วตามลำดับกลางของ ViewMenus: ค้นหา · ตัวกรอง · จัดกลุ่ม · spacer · เรียง */
            <>
              <Segmented
                ariaLabel="แท็บของหน้า"
                value={tab}
                onChange={changeTab}
                // โหลดพัง = ไม่รู้ยอด ⇒ ไม่มีป้าย · แท็บทะเบียนนับเฉพาะตัวที่ยังไม่ครบ (ของที่ต้องทำ)
                options={PRICE_TABS.map((t) => ({ value: t.key, label: t.label, count: tabCount(t.key) }))}
              />
              {tab !== "requests" ? (
                <Segmented
                  ariaLabel="ความครบของกลิ่น/สูตร"
                  value={view.progress}
                  onChange={(progress) => setView({ progress })}
                  options={PRICE_PROGRESS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                    count: !tabTotals || registryLoading || registryError ? null
                      : o.value === "todo" ? tabTotals.incomplete : o.value === "done" ? tabTotals.complete : tabTotals.all,
                  }))}
                />
              ) : null}
              <div className="search-glass">
                <Search size={16} color="var(--text-3)" aria-hidden="true" />
                <input
                  autoComplete="off"
                  value={view.q}
                  onChange={(e) => setView({ q: e.target.value })}
                  placeholder={SEARCH_PLACEHOLDER[tab]}
                  aria-label="ค้นหารายการ"
                />
              </div>
              <FilterPopover
                count={filterCount}
                onClear={() => setView({ filters: emptyPriceFilters(tab) })}
                groups={priceFilterDimensions(tab).map((dim) => ({
                  key: dim.key,
                  label: dim.label,
                  searchable: dim.searchable,
                  options: filterOptions[dim.key] || [],
                  selected: view.filters?.[dim.key] || [],
                  onChange: (values) => setFilter(dim.key, values),
                }))}
              />
              <GroupMenu
                title="จัดกลุ่มรายการ"
                value={view.groupBy}
                onChange={(groupBy) => { setView({ groupBy }); setCollapsed(new Set()); }}
                options={PRICE_GROUP_OPTIONS[tab]}
              />
              {groups && groups.length > 0 ? (
                <CollapseAllButton
                  collapsed={allBucketsCollapsed(groups, collapsed)}
                  onToggle={() => setCollapsed(allBucketsCollapsed(groups, collapsed) ? new Set() : new Set(groups.map((g) => g.key)))}
                />
              ) : null}
              <span className="spacer" />
              {/* เปลี่ยนแบบเรียง = ตั้งทิศตั้งต้นของแบบนั้นให้ด้วย (กติกาเดียวกับรายงานยอดขาย/คิวลง BOM) */}
              <SortMenu
                title="เรียงลำดับรายการ"
                value={view.sortKey}
                defaultValue={PRICE_SORT_DEFAULT}
                onChange={(sortKey) => setView({ sortKey, sortDir: PRICE_SORT_DIR[sortKey] || "asc" })}
                options={sortOptions}
              />
              <SortDirButton dir={view.sortDir} onToggle={() => setView({ sortDir: view.sortDir === "asc" ? "desc" : "asc" })} />
            </>
          )}
        >
          {tabError ? (
            <StatusNotice
              tone="error" className="mb-4"
              action={<Button size="sm" variant="ghost" onClick={() => (tab === "requests" ? load() : loadRegistry())}>ลองใหม่</Button>}
            >
              {tabError}
            </StatusNotice>
          ) : null}
          {!shown.length ? (
            tabError || tabLoading ? null : (
              <EmptyState plain icon={narrowed ? Inbox : Coins}>
                {narrowed ? "ไม่มีรายการที่ตรงกับคำค้น/ตัวกรอง"
                  : tab === "requests" ? "ไม่มีงานค้างในคำร้องตอนนี้"
                    : view.progress === "todo" ? `${tab === "scents" ? "กลิ่น" : "สูตร"}จากคำร้องที่คอนเฟิร์มครบทุกตัวแล้ว`
                      : "ไม่มีรายการในมุมมองนี้"}
              </EmptyState>
            )
          ) : tab === "requests" ? (
            <TableScroll cells="stacked">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={styles.colItem}>รายการ</th>
                    <th className={styles.colConfirm}>ลูกค้าคอนเฟิร์ม</th>
                    <th className={styles.colStep}>ราคา (บาท/กก.)</th>
                    <th className={styles.colStep}>Ingredient List</th>
                  </tr>
                </thead>
                {/* ไม่จัดกลุ่ม = ถังเดียวไม่มีหัว · จัดกลุ่ม = หนึ่ง <tbody> ต่อถัง หัวถังเป็น TableGroupRow (markup กลาง) */}
                {(groups || [{ key: "__all", label: null, items: shown }]).map((group) => (
                  <RowGroup
                    key={group.key}
                    group={group}
                    byRequest={view.groupBy === "request"}
                    today={today}
                    canPrice={canPrice}
                    linking={linking}
                    collapsed={Boolean(group.label) && collapsed.has(group.key)}
                    onToggle={() => setCollapsed((prev) => toggleBucketKey(prev, group.key))}
                    onPrice={setPricing}
                    onUseCurrent={applyCurrentPrice}
                    onIngredients={setIngredientRow}
                  />
                ))}
              </table>
            </TableScroll>
          ) : (
            <PriceRegistryTable
              kind={tab === "scents" ? "scent" : "formula"}
              rows={shown}
              groups={groups}
              collapsed={collapsed}
              onToggleGroup={(key) => setCollapsed((prev) => toggleBucketKey(prev, key))}
              categoryLabel={categoryLabel}
              canPrice={canPriceEntity}
              canEditIngredients={canEditIngredients}
              busyKey={entityBusy}
              onPrice={setEntityPricing}
              onIngredients={setEntityIngredients}
            />
          )}
        </ListPanel>
      </div>

      {/* โมดัลกลางตัวเดียวกับหน้าใบ/หน้าทะเบียน — ช่องมาจาก server (ตัวคิดเดียวกับ POST) */}
      <RegistryPriceModal
        open={!!pricing}
        onClose={() => setPricing(null)}
        title={pricing ? `ใส่ราคา — ${pricing.name}` : ""}
        endpoint={pricing ? `/api/sa/requests/${pricing.requestId}/items/${pricing.itemId}/price` : ""}
        slots={pricing ? pricing.slots : null}
        blocker={pricing ? pricing.priceBlocker : ""}
        hint={pricing ? `ราคาเข้าทะเบียนวัสดุเป็นรุ่นใหม่ของกลิ่น/สูตรของรายการนี้${pricing.customerName ? ` (ราคาเฉพาะ ${pricing.customerName})` : ""}`
          + " — อ่านได้จากใบขอราคาผลิตและหน้าทะเบียนตามปกติ · ใส่อย่างน้อยหนึ่งช่อง" : null}
        onSaved={async (msg) => {
          const itemId = pricing?.itemId || null;
          setPricing(null);
          notifyToast(msg);
          // ⚠️ ล็อกปุ่มของแถวที่เพิ่งใส่จนตารางใหม่มาถึง (เหตุผลเดียวกับ "ใช้ราคานี้")
          setLinking(itemId);
          try { await loadAll({ background: true }); } finally { setLinking(null); }
        }}
        onError={() => loadAll({ background: true })}
      />

      {/* ม-159 — ก้าวแยกจากราคา · โมดัลตัวเดียวกับหน้าคำร้อง/หน้าสูตร · บันทึกแล้วแถวที่ใส่ราคาไว้จบเอง */}
      <IngredientListModal
        open={!!ingredientRow}
        onClose={() => setIngredientRow(null)}
        subtitle={ingredientRow ? `${ingredientRow.name} · ${naText(ingredientRow.docNo)}` : ""}
        current={ingredientRow?.ingredient?.current || null}
        endpoint={ingredientRow ? `/api/sa/requests/${ingredientRow.requestId}/items/${ingredientRow.itemId}/ingredients` : ""}
        hint={ingredientRow
          ? (ingredientRow.stage === "awaiting_ingredients"
            ? "ราคาใส่แล้ว — บันทึกแล้วรายการนี้ครบและหายจากหน้านี้ · ลงทะเบียนสูตร (FG และคำร้องอื่นที่ใช้สูตรนี้อ่านตัวเดียวกัน)"
            : "ลงทะเบียนสูตร — รายการยังรอราคาอยู่ ครบทั้งสองอย่างแล้วถึงจบ · ชื่อสาร INCI เรียงจากมากไปน้อย คั่นด้วยจุลภาค")
          : null}
        onSaved={async (msg) => {
          const itemId = ingredientRow?.itemId || null;
          setIngredientRow(null);
          notifyToast(msg);
          setLinking(itemId);
          try { await loadAll({ background: true }); } finally { setLinking(null); }
        }}
        onError={() => loadAll({ background: true })}
      />

      {/* ── แท็บทะเบียน — โมดัลกลางตัวเดียวกับหน้าทะเบียนกลิ่น/สูตร ยิง endpoint ของทะเบียน ──────────────────────
          ⚠️ สูตร = ช่อง F · B · FB จาก server (`formulaPriceSlots` ตัวเดียวกับ API ราคาสูตร) · กลิ่น = ช่องเดียวของตัวมัน
          (โหมดเดียวกับหน้าทะเบียนกลิ่น — `slots` ไม่ส่ง) */}
      <RegistryPriceModal
        open={!!entityPricing}
        onClose={() => setEntityPricing(null)}
        title={entityPricing ? `${entityPricing.needsPrice ? "ใส่ราคา" : "ออกราคาใหม่"} — ${[entityPricing.code, entityPricing.name].filter(Boolean).join(" ")}` : ""}
        endpoint={entityPricing
          ? `/api/master/${entityPricing.kind === "formula" ? "formulas" : "scents"}/${entityPricing.id}/price` : ""}
        slots={entityPricing?.kind === "formula" ? entityPricing.slots : null}
        blocker={entityPricing ? entityPricing.priceBlocker : ""}
        hint={entityPricing ? "ราคาเข้าทะเบียนวัสดุเป็นรุ่นใหม่ — ตัวเดียวกับปุ่มราคาหน้าทะเบียน · รายการในคำร้องที่รอราคาของตัวนี้จะผูกราคานี้ให้เอง ไม่ต้องกดยืนยันซ้ำ" : null}
        onSaved={async (msg) => {
          const key = entityPricing?.key || null;
          setEntityPricing(null);
          await afterEntitySave(key, msg);
        }}
        onError={() => loadAll({ background: true })}
      />
      <IngredientListModal
        open={!!entityIngredients}
        onClose={() => setEntityIngredients(null)}
        subtitle={entityIngredients ? [entityIngredients.code, entityIngredients.name].filter(Boolean).join(" · ") : ""}
        current={entityIngredients?.ingredient?.current || null}
        required={!!entityIngredients?.ingredient?.required}
        endpoint={entityIngredients ? `/api/master/formulas/${entityIngredients.id}` : ""}
        method="PATCH"
        extraBody={{ action: "ingredients" }}
        hint="ลงทะเบียนสูตร — หน้า FG และคำร้องที่ใช้สูตรนี้อ่านตัวเดียวกัน · รายการในคำร้องที่ใส่ราคาไว้แล้วจบเมื่อบันทึก · ชื่อสาร INCI เรียงจากมากไปน้อย คั่นด้วยจุลภาค"
        onSaved={async (msg, data) => {
          const key = entityIngredients?.key || null;
          setEntityIngredients(null);
          const settled = data?.settledRows?.length || 0;
          await afterEntitySave(key, settled ? `${msg} · ${settled} รายการในคำร้องครบแล้ว` : msg);
        }}
        onError={() => loadAll({ background: true })}
      />
    </Workspace>
  );
}

/* หนึ่งถัง — หัวถังพับได้ · ยอดบนหัวเป็นยอดทั้งถัง · จัดกลุ่มตามใบ = ลิงก์ไปใบอยู่ท้ายหัว + "รอนานสุด" (ไม่ใช่ทั้งแถวคลิกได้)
   ไม่จัดกลุ่ม = ถังเดียวไม่มีหัว (`group.label` ว่าง) */
function RowGroup({ group, byRequest, today, canPrice, linking, collapsed, onToggle, onPrice, onUseCurrent, onIngredients }) {
  const items = group.items || [];
  const days = items.map((r) => waitingDays(r, today)).filter((d) => d != null);
  const maxDays = days.length ? Math.max(...days) : null;
  const requestId = byRequest ? items[0]?.requestId : null;
  return (
    <tbody>
      {group.label ? (
        <TableGroupRow
          colSpan={COLS}
          label={group.label}
          sub={group.sub || null}
          badge={maxDays != null ? `รอนานสุด ${maxDays} วัน` : null}
          total={`${items.length} รายการ`}
          totalTitle={byRequest ? "จำนวนรายการที่รอราคาในใบนี้" : "จำนวนรายการในกลุ่มนี้"}
          collapsed={collapsed}
          onToggle={onToggle}
          actions={requestId ? <Link className="linklike" href={`/requests/${requestId}`}>เปิดใบคำร้อง</Link> : null}
        />
      ) : null}
      {collapsed ? null : items.map((row) => (
        <tr key={row.itemId}>
          <td><ItemCell row={row} showRequest={!byRequest} /></td>
          <td>
            <div>{row.confirmedAt ? fmtDate(row.confirmedAt) : NA}</div>
            <div className={styles.sub}>
              {[
                row.confirmedQty != null ? `${fmtNumber(row.confirmedQty)}${row.unit ? ` ${row.unit}` : ""}` : null,
                (() => { const d = waitingDays(row, today); return d == null ? null : `รอมา ${d} วัน`; })(),
              ].filter(Boolean).join(" · ") || NA}
            </div>
          </td>
          <td>
            <PriceCell
              row={row} canPrice={canPrice} busy={linking === row.itemId}
              onPrice={onPrice} onUseCurrent={onUseCurrent}
            />
          </td>
          <td><IngredientCell row={row} canEdit={canPrice} busy={linking === row.itemId} onOpen={onIngredients} /></td>
        </tr>
      ))}
    </tbody>
  );
}

/* รายการ — รหัสบน·ชื่อล่าง (กติกาแสดง entity ของตาราง) · บรรทัดรองบอกชนิดของในทะเบียน และของที่ขอมาถ้าชื่อไม่ตรงกัน
   ไม่ได้จัดกลุ่มตามใบ = หัวถังไม่บอกใบ ⇒ บรรทัดรองบอกเลขที่คำร้อง + ลูกค้า (ลิงก์ไปใบ) แทน */
function ItemCell({ row, showRequest = false }) {
  const reg = row.registry;
  const kind = reg?.kind === "formula"
    ? `สูตร${reg.categoryCode ? ` ${reg.categoryCode}` : ""}`
    : reg?.kind === "scent" ? "กลิ่น (หัวน้ำหอม)" : "ยังไม่ผูกทะเบียน";
  const name = reg?.name || row.label || null;
  return (
    <>
      {reg?.code ? <div className={styles.code}>{reg.code}</div> : null}
      <div className={styles.name}>{naText(name)}</div>
      <div className={styles.sub}>
        {kind}
        {row.label && row.label !== name ? ` · ขอ: ${row.label}` : ""}
      </div>
      {showRequest ? (
        <div className={styles.sub}>
          <Link className="linklike" href={`/requests/${row.requestId}`}>{row.docNo || "คำร้อง"}</Link>
          {row.customerName ? ` · ${row.customerName}` : ""}
        </div>
      ) : null}
    </>
  );
}

/* ── ก้าวราคา (F · B · FB) — ป้ายสถานะ → ราคาที่มีในทะเบียน → ปุ่ม ─────────────────────────────────────────
   ⚠️ ปุ่มวางตาม `canPrice` (ด่านเดียวกับ API) · ไม่มีราคาในทะเบียนสักช่อง = ไม่มีปุ่ม "ใช้ราคานี้" · หมดอายุ = มีปุ่มแล้วบอกเหตุ */
function PriceCell({ row, canPrice, busy, onPrice, onUseCurrent }) {
  const priced = row.stage === "awaiting_ingredients";
  return (
    <div className={styles.step}>
      <StatusBadge size="sm" tone={priced ? "success" : "warning"} label={priced ? "ใส่ราคาแล้ว" : "รอใส่ราคา"} />
      <CurrentPrices row={row} />
      {!priced && canPrice ? (
        <div className={styles.actions}>
          {row.useCurrent ? (
            <GatedAction
              blocker={row.useCurrentBlocker}
              size="sm" tone="primary" icon={<Check size={14} />}
              disabled={busy}
              onClick={() => onUseCurrent(row)}
            >
              ใช้ราคา {row.useCurrent.short} นี้
            </GatedAction>
          ) : null}
          <GatedAction
            blocker={row.priceBlocker}
            size="sm" tone={row.useCurrent ? undefined : "primary"} variant={row.useCurrent ? "quiet" : "filled"}
            icon={<Coins size={14} />}
            disabled={busy}
            onClick={() => onPrice(row)}
          >
            {row.useCurrent ? "ใส่ราคาใหม่" : "ใส่ราคา"}
          </GatedAction>
        </div>
      ) : null}
    </div>
  );
}

/* ── ก้าว Ingredient List ของสูตรที่แถวผูก (ม-159) — ทรงเดียวกับก้าวราคา ──────────────────────────────────
   ไม่ต้องมี (กลิ่นล้วน · 02-020) = บอกเป็นคำ ไม่ใช่ขีดลอย ๆ · มีแล้ว = ป้ายเขียว · ยังไม่มี = ป้ายส้ม + ปุ่ม
   ⭐ **ปุ่มหลักทุกแถว** (ผู้ใช้ 03/11/2026 "ปุ่ม ใส่ ingredient ให้เด่นกว่านี้") — เดิมเป็นปุ่มจางตอนยังรอราคา จนอ่านเหมือนลิงก์
   ทั้งที่เป็นก้าวบังคับเท่ากับราคา (ครบสองอย่างถึงจบ) ⇒ น้ำหนักเท่าปุ่ม "ใส่ราคา" · ปุ่มเฉพาะคนที่ตอบฝ่ายนี้ได้ (ด่านเดียวกับ API) */
function IngredientCell({ row, canEdit, busy, onOpen }) {
  const plan = row.ingredient || {};
  if (!plan.required) {
    return (
      <span className={styles.dim} title="ไม่ผูกสูตร หรือเป็นสูตรหัวน้ำหอม 02-020">ไม่ต้องใส่</span>
    );
  }
  if (!plan.missing) return <StatusBadge size="sm" tone="success" label="มีแล้ว" />;
  return (
    <div className={styles.step}>
      <StatusBadge size="sm" tone="warning" label="ยังไม่มี" />
      {canEdit ? (
        <div className={styles.actions}>
          <Button
            size="sm" tone="primary" icon={<ListChecks size={14} aria-hidden="true" />}
            disabled={busy} onClick={() => onOpen(row)}
          >
            ใส่ Ingredient List
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ราคาที่มีอยู่แล้วในทะเบียน ทุกช่องที่แถวนี้ใส่ได้ — ช่องที่ยังไม่มีราคาบอกตรง ๆ (ไม่ซ่อน) เพราะคือช่องที่ RD ต้องใส่
   ⚠️ ชิ้นแสดงราคาตัวเดียวกับหน้าทะเบียน (`RegistryPrice`) — สามสถานะ (ยังไม่ผูก · รอราคา · หมดอายุ) อ่านเหมือนกันทุกจอ */
function CurrentPrices({ row }) {
  if (!row.current?.length) return <span className={styles.dim}>{NA}</span>;
  return (
    <ul className={styles.prices}>
      {row.current.map((c) => (
        <li key={c.key}>
          <span className={styles.slot}>{c.short}</span>{" "}
          {c.price?.unitPrice != null ? (
            <>
              <RegistryPrice price={{ ...c.price, validUntil: c.price.validThrough }} />
              {c.price.state === "ready" && c.price.validThrough ? (
                <span className={styles.sub}> · ถึง {fmtDate(c.price.validThrough)}</span>
              ) : null}
            </>
          ) : <span className={styles.dim}>ยังไม่มีราคา</span>}
        </li>
      ))}
    </ul>
  );
}
