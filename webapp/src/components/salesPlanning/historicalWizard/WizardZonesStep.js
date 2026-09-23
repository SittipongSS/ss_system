"use client";
// ── ขั้น ② ไซต์ โซน และรายการ (ม็อก Step2) ─────────────────────────────────────────
//
// ⭐ **มติเจ้าของ 23/09: บรรทัดของโซน = บรรทัดของใบเสนอราคา** — "3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควร
//   แตกต่างจาก form ใบเสนอราคา เพื่อไม่ให้ USER สับสน" ⇒ แถวโซนที่ติ๊กวาดด้วยเซลล์ชุดเดียวกับตาราง
//   รายการของใบเสนอราคา (`QuoteLineCells`): รายการ · จำนวน (+หน่วย) · ราคา/หน่วย · ส่วนลดรายการ · จำนวนเงิน
//   · ราคา/หน่วยมาจากทะเบียนและล็อกทันทีที่เลือกแพ็คเกจ · หน่วยมาจากสินค้า · ยอดคิดด้วย `quoteLineNet`
//   · 1 ชุด × 12 เดือน = จำนวน 12 (แพ็คเกจ) × 3,500 = 42,000 — แบบเดียวกับที่ใบเสนอราคาคีย์
//   · ของที่เพิ่มจากใบเสนอราคามีสองอย่างเท่านั้น: **โซนที่ผูก** และ **รอบบริการที่ขายไว้** — ทั้งคู่เป็นบรรทัด
//     ใต้คำอธิบายในเซลล์ "รายการ" (ตรงเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย)
//   🚫 ถอดแล้ว: "แพ็ค" · ยอดที่พิมพ์เอง · ปุ่มลัด "ราคาแพ็คเกจ × แพ็ค × เดือน" (มันคูณเดือนซ้ำ = 504,000) ·
//      ช่องระยะสัญญา (ยอดไม่คิดจากเดือนแล้ว — แถบสรุปข้างฟอร์มยังบอกช่วงสัญญาอยู่)
// ⭐ **ตารางรายการแยกจากการ์ดไซต์** (รีวิว/UAT 23/09) — การ์ดไซต์เหลือหน้าที่เดียวคือ "เลือกโซน" (ติ๊ก = เพิ่มบรรทัด)
//   แล้วบรรทัดของใบทั้งหมดอยู่ในตารางเดียวใต้การ์ด: # · รายการ · จำนวน · ราคา/หน่วย · ส่วนลดรายการ · จำนวนเงิน · ปุ่มลบ
//   = คอลัมน์ของใบเสนอราคาเป๊ะ · กล่องสรุปท้ายตารางก็เป็นกล่องเดียวกับท้ายตารางใบเสนอราคา (`QuoteLineTotals`)
//   🐞 ของเดิมซ้อนตารางไว้ในการ์ดไซต์ แล้วเอาคอลัมน์ "โซน" (176px) มาแทน "#" ⇒ กล่องตารางกว้างแค่ 726px ที่จอ 1440
//      และ 766px ที่จอ 1920/2560 (วัดด้วย puppeteer) — ต่ำกว่าจุดพับ 900 ตลอด ⇒ **การ์ดต่อบรรทัดเสมอบนเดสก์ท็อป**
//      ขณะที่ใบเสนอราคาที่จอเดียวกันเป็นตาราง (964px) = ฟอร์มหน้าตาคนละแบบ ซึ่งคือสิ่งที่มติ 23/09 ห้าม
//      (คอมเมนต์เดิมที่เขียนว่า "ราว 1270 ที่จอ 1920 (ตาราง)" ผิด · พื้น `ZONE_LINES_MIN_WIDTH` 1040 ไม่เคยมีผล)
//   ⇒ ขั้นนี้กับขั้น ④ ยุบแถบสรุปข้างขวาออกด้วย (`historicalStepShowsAside`) ⇒ ตารางได้ความกว้างเต็มคอลัมน์เนื้อหา
//      และใช้พื้น 900 ของใบเสนอราคาเอง (`QuoteLinesTable` ค่าตั้งต้น) เพราะคอลัมน์เท่ากันเป๊ะ
// ⚠️ ข้อยกเว้นจากตารางใบเสนอราคา (เหตุผลด้านข้อมูล — **รอเจ้าของรับรอง**, รายการเต็มใน docs/historical-sales-orders.md §8A):
//   ไม่มีหมายเหตุรายบรรทัด (หมายเหตุพิมพ์ลงใบเสนอราคาเท่านั้น — ใบย้อนหลังไม่พิมพ์ และ body ไม่มีช่องนี้) ·
//   จำนวนเริ่มที่ว่าง (ใบเสนอราคาเริ่มที่ 1 — ว่าง = ตีกลับ ไม่ใช่นับเป็น 1) · จำนวนต้องเป็นจำนวนเต็ม (RPC 0379 +
//   service_zone_terms.packageQty) · ราคา/หน่วยปิดตั้งแต่ยังไม่เลือกแพ็คเกจ (`registryPriceOnly` — ใบนี้ไม่ส่งราคาขึ้นไป
//   ⇒ ช่องที่เปิดไว้คือช่องที่พิมพ์แล้วหาย) · ยังไม่ตั้งราคา = ตีกลับ ไม่ใช่คงราคาเดิม · ไม่มีส่วนลดท้ายใบ (แผน/RPC
//   ไม่มีช่องนี้) · VAT เลือกที่ขั้น ① (ไม่มีค่าตั้งต้น) · เพิ่มบรรทัดด้วยการติ๊กโซน (ไม่มีปุ่ม "เพิ่มสินค้า") ·
//   ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" (ลูกค้าจริงมี 43 โซน — เลือกทีละแถวคือ 43 ครั้ง)
//
// ⭐ **โซนเลือกจากทะเบียน ไม่ใช่พิมพ์ชื่อเอง** (มติ 22/09 แทนข้อ 17 ของ 0360) — หนึ่งโซนที่ติ๊ก
//   = หนึ่งบรรทัดของใบ = หนึ่งรอบขายของโซน (service_zone_terms) ที่เกิดตอน AE Sup อนุมัติ
//   ⇒ TS ไม่ต้องผูกโซนอีก · ทะเบียนไซต์เป็นของฝ่าย TS ⇒ ไม่เจอไซต์/โซน = แจ้ง TS เพิ่มก่อน
//
// ⚠️ ขอเฉพาะไซต์ที่ยังใช้งาน (`includeInactive=0` — เส้นนี้ตั้งต้นเป็น true) แต่ **โซนที่ปิดใช้งาน
//   ยังไหลมากับไซต์** (loadZones คืนทุกโซน) ⇒ ต้องโชว์แบบกดไม่ได้พร้อมเหตุ ไม่ใช่ซ่อนทิ้ง
//   (กฎบ้าน: ตัวเลือกที่ไม่มีสิทธิ์ต้องเห็นว่ามีอยู่ · ด่านจริงคือ bindTargetError ฝั่ง server)
// ⚠️ **ไม่มีตัวเลข "N จุด"** — payload ของโซนไม่มี `spots` มาด้วย ⇒ โชว์รหัสโซนแทน
//   (เดาเลขจุดเองแล้วผิด = ผู้คีย์เลือกโซนผิดโดยที่ไม่มีอะไรบนจอฟ้อง)
//
// 🔴 **ของจริงบนฐานใหญ่กว่าม็อกมาก (UAT 23/09)** — AR-374 บริษัท เซ็นทรัล ฟู้ด รีเทล
//   มี **26 ไซต์ 43 โซน** · ม็อกวาดไว้ 2 ไซต์ ⇒ ของเดิมพังสามทางพร้อมกัน:
//     ① `Promise.all` ก้อนเดียว: ไซต์เดียวโหลดโซนไม่สำเร็จ = **ลิสต์ว่างทั้งจอ**
//        ⇒ โหลดทีละไซต์แบบพังทีละใบ (`loadSiteZones` ไม่เคย reject) แล้วไซต์ที่พัง
//          ได้บรรทัด "ลองอีกครั้ง" ของตัวเอง · ไซต์ที่เหลือใช้งานได้ตามปกติ
//     ② ไม่มีช่องค้น ⇒ หาไซต์ในกอง 26 ใบด้วยตาอย่างเดียว
//     ③ กางการ์ดทั้ง 26 ใบรวด ⇒ เลื่อนหาของไม่เจอ
//   ⇒ ตัวตัดสินของ ② และ ③ อยู่ที่ `historicalZoneBrowser` (ทดสอบได้โดยไม่ต้องเรนเดอร์)
//
// 🪤 **ทำไมยังยิงรายไซต์ ไม่ใช่คำขอเดียว**: เส้นที่คืนโซนทั้งลูกค้าในคำขอเดียวมีอยู่จริง
//   (`/api/service/customers/[customerId]/zones`) แต่ด่านของมันคือ `canPickServiceSite`
//   ซึ่ง = `canViewService || canCreateServiceSite` ⇒ **ae_supervisor ตกด่าน** (ไม่ใช่คนใน
//   ฝ่ายบริการ และไม่อยู่ใน TEAM_ROLES) ทั้งที่เป็นหนึ่งในคนที่คีย์ใบย้อนหลังได้
//   · เส้นไซต์ที่ใช้อยู่นี้ใช้ `canViewServiceRegistry` ซึ่งกว้างกว่าโดยกติกา
//   ⇒ ย้ายมาเส้นเดียวได้ต่อเมื่อเจ้าของโมดูลบริการเปิดด่านให้ก่อน — ห้ามแอบขยายสิทธิ์ที่นี่
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronsDownUp, ChevronsUpDown, MapPin, RefreshCw } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import CollapsibleCard from "@/components/ui/CollapsibleCard";
import Input from "@/components/ui/Input";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";
import { productSelectOptions } from "@/components/master/productOption";
import {
  QuoteLineActionsHead, QuoteLineFgInfo, QuoteLineHeadCells, QuoteLineIndexCell, QuoteLineIndexHead,
  QuoteLineInstallationPoint, QuoteLineItemCell, QuoteLineMoneyCells, QuoteLineProductPicker, QuoteLineRemoveCell,
  QuoteLineServiceRounds, QuoteLineTotals, QuoteLinesEmptyRow, QuoteLinesTable,
} from "@/components/salesPlanning/QuoteLineCells";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { lineIsServicePackage } from "@/lib/sales/serviceOrders";
import { quoteLineFromProduct } from "@/lib/sales/quoteLines";
import {
  HISTORICAL_NEXT_BUTTON_LABEL, REGISTRY_LOAD_FAILED, emptyHistoricalZone,
  historicalMoneyView, historicalTotalsView, historicalZoneBrowser, historicalZoneLineAmount, historicalZoneLines,
} from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

const SITES_PATH = (customerId) => `/api/service/sites?customerId=${encodeURIComponent(customerId)}&includeInactive=0`;
const ZONES_PATH = (siteId) => `/api/service/sites/${encodeURIComponent(siteId)}/zones`;

export default function WizardZonesStep({
  state, onChange, issues = [], plan = null, money = null, products = [], productsError = "", busy = false,
}) {
  const [sites, setSites] = useState([]);
  const [zonesBySite, setZonesBySite] = useState({});
  const [siteErrors, setSiteErrors] = useState({});
  const [retrying, setRetrying] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [openSites, setOpenSites] = useState({});
  const customerId = state.customerId;

  /* โซนของไซต์เดียว — **ไม่ throw** คืนผลเป็นข้อมูลเสมอ (ไซต์ที่พังต้องไม่ลากไซต์อื่นลงไปด้วย) */
  const loadSiteZones = useCallback(async (site) => {
    try {
      const zones = await apiJson(ZONES_PATH(site.id), {
        fallbackError: `โหลดโซนของไซต์ ${site.code || site.id} ไม่สำเร็จ`,
      });
      return { id: site.id, zones: Array.isArray(zones) ? zones : [], error: null };
    } catch (error) {
      return { id: site.id, zones: [], error: error?.message || "โหลดโซนของไซต์นี้ไม่สำเร็จ" };
    }
  }, []);

  /* ทะเบียนไซต์/โซนของลูกค้ารายนี้ — โหลดครั้งเดียวต่อการเปลี่ยนลูกค้า (ลูกค้าล็อกหลังบันทึกครั้งแรก) */
  useEffect(() => {
    if (!customerId) { setSites([]); setZonesBySite({}); setSiteErrors({}); return undefined; }
    let alive = true;
    setLoading(true);
    setLoadError("");
    setSiteErrors({});
    (async () => {
      try {
        const rows = await apiJson(SITES_PATH(customerId), { fallbackError: "โหลดทะเบียนไซต์ไม่สำเร็จ" });
        const siteRows = Array.isArray(rows) ? rows : [];
        if (!alive) return;
        /* ⚠️ ตั้งไซต์กับโซนพร้อมกัน — ตั้งไซต์ก่อนแล้วรอโซนคือจอที่ขึ้นการ์ด 26 ใบพร้อมคำว่า
           "ไซต์นี้ยังไม่มีโซนในทะเบียน" อยู่ครู่หนึ่ง ซึ่งอ่านเป็นคำตอบที่ผิด */
        const results = await Promise.all(siteRows.map(loadSiteZones));
        if (!alive) return;
        setSites(siteRows);
        setZonesBySite(Object.fromEntries(results.map((row) => [row.id, row.zones])));
        setSiteErrors(Object.fromEntries(results.filter((row) => row.error).map((row) => [row.id, row.error])));
      } catch (error) {
        /* ตกที่นี่ = **เส้นทะเบียนไซต์เอง**พัง (สิทธิ์/เน็ต) ไม่ใช่ไซต์ใดไซต์หนึ่ง */
        if (alive) { setSites([]); setZonesBySite({}); setLoadError(error?.message || "โหลดทะเบียนไซต์ไม่สำเร็จ"); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [customerId, loadSiteZones]);

  const retrySite = useCallback(async (site) => {
    setRetrying((current) => ({ ...current, [site.id]: true }));
    const result = await loadSiteZones(site);
    setZonesBySite((current) => ({ ...current, [site.id]: result.zones }));
    setSiteErrors((current) => ({ ...current, [site.id]: result.error || undefined }));
    setRetrying((current) => ({ ...current, [site.id]: false }));
  }, [loadSiteZones]);

  // แพ็คเกจบริการเท่านั้น (หมวด 02-001) — ตัวตัดสินตัวเดียวกับที่ฐานตรวจใน RPC
  const packageOptions = useMemo(
    () => productSelectOptions((products || []).filter(lineIsServicePackage), undefined, { withCategory: true }),
    [products],
  );
  const productsById = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  const rows = useMemo(() => state.zones || [], [state.zones]);
  const rowByZone = useMemo(() => new Map(rows.map((row, index) => [row.zoneId, { row, index }])), [rows]);
  const liveTermByZone = useMemo(() => {
    const map = new Map();
    for (const term of plan?.liveTerms || []) if (!map.has(term.zoneId)) map.set(term.zoneId, term);
    return map;
  }, [plan]);
  /* ข้อที่พรีวิวตีกลับรายแถว (`zones.<ลำดับ>…`) — ลำดับเดียวกับบรรทัดของตาราง (body ส่ง `state.zones` ตามลำดับนี้)
     ⇒ ข้อความขึ้นใต้บรรทัดของมันเอง · ข้อที่ไม่ชี้แถว (`zones`) อยู่ในก้อนรวมหัวขั้นอย่างเดียว */
  const issueByIndex = useMemo(() => {
    const map = new Map();
    for (const issue of issues) {
      const index = Number(String(issue.field || "").split(".")[1]);
      if (Number.isInteger(index) && !map.has(index)) map.set(index, issue.message);
    }
    return map;
  }, [issues]);
  const issueByZone = useMemo(() => new Map(
    [...issueByIndex].map(([index, message]) => [rows[index]?.zoneId, message]).filter(([zoneId]) => zoneId),
  ), [issueByIndex, rows]);

  /* ค้น · ซ่อน · กาง · โซนกำพร้า — ตัวตัดสินอยู่ที่ lib (ดูหัวไฟล์ ③) จอแค่วาดตามที่มันตอบ
     ⚠️ `ready` เท็จระหว่างโหลด/โหลดพัง — ไม่งั้นทุกโซนที่ใบผูกไว้ถูกอ่านว่า "กำพร้า" ชั่วครู่ */
  const browser = useMemo(() => historicalZoneBrowser({
    sites, zonesBySite, siteErrors, query, pickedZoneIds: rows.map((row) => row.zoneId),
    ready: !loading && !loadError,
  }), [sites, zonesBySite, siteErrors, query, rows, loading, loadError]);
  /* บรรทัดของตาราง (ชื่อจุด "ไซต์ · โซน" · ชื่อบรรทัด · ปุ่มลบกดได้ไหม) — ตัวตัดสินตัวเดียวกับที่ตรึงด้วยเทสต์
     ⚠️ ไม่ขึ้นกับคำค้น: คำค้นซ่อนแค่การ์ดไซต์ บรรทัดของใบยังอยู่ครบ (ยอดท้ายตารางนับทุกบรรทัด) */
  const lines = useMemo(() => historicalZoneLines({
    zones: rows, sites, zonesBySite, siteErrors, ready: !loading && !loadError,
  }), [rows, sites, zonesBySite, siteErrors, loading, loadError]);
  /* ยอดใบ: มีแผนใช้แผน ไม่มีก็คิดจากบรรทัดโซน + VAT ด้วยสูตรใบเสนอราคาตัวเดียวกับ server (รีวิว R7) */
  const moneyView = useMemo(() => money || historicalMoneyView(state, plan), [money, state, plan]);
  const totals = historicalTotalsView(moneyView, state.vatRate);

  const setRows = (next) => onChange({ zones: next });
  const patchRow = (zoneId, patch) => setRows(rows.map((row) => (row.zoneId === zoneId ? { ...row, ...patch } : row)));
  const removeRow = (zoneId) => setRows(rows.filter((row) => row.zoneId !== zoneId));
  /* ⭐ ทุกทางที่ใส่แพ็คเกจให้แถว (ติ๊กโซน · ช่องรายแถว · "ใช้แพ็คเกจเดียวกันทุกโซน") ผ่าน `quoteLineFromProduct`
     ตัวเดียวกับช่องเลือกสินค้าของใบเสนอราคา ⇒ หน่วย · ราคา/หน่วย (ล็อก) · ข้อมูล FG มาจากทะเบียนแบบเดียวกัน
     ⚠️ ทะเบียนสินค้าโหลดไม่ขึ้น = ไม่รู้จักสินค้า ⇒ ผูกรหัสไว้เฉย ๆ (แผนอ่านราคาจากทะเบียนเองตอนตรวจอยู่แล้ว) */
  const withPackage = (row, productId) => {
    const product = productId ? productsById.get(productId) || null : null;
    return product ? quoteLineFromProduct(row, product) : { ...row, productId: productId || "" };
  };
  const toggleZone = (zone, site) => {
    if (rowByZone.has(zone.id)) { removeRow(zone.id); return; }
    setRows([...rows, withPackage(emptyHistoricalZone({ zoneId: zone.id, siteId: site.id }), state.packageProductId)]);
  };
  const pickRowPackage = (zoneId, productId) => setRows(rows.map((row) => (
    row.zoneId === zoneId ? withPackage(row, productId) : row
  )));
  const applyPackage = (productId) => onChange({
    packageProductId: productId,
    zones: rows.map((row) => withPackage(row, productId)),
  });
  /* 🚫 ปุ่มลัด "ใช้ราคาแพ็คเกจ × แพ็ค × เดือน" ถูกถอดตามมติเจ้าของ 23/09 — มันคูณเดือนซ้ำบนจำนวนที่นับเดือน
     ไปแล้ว (3,500 × 12 × 12 = 504,000) · ยอดของแถวคือสูตรของใบเสนอราคา ไม่มีปุ่มเสนอยอดอีก */

  const anySiteError = Object.values(siteErrors).some(Boolean);
  const retryingAny = Object.values(retrying).some(Boolean);
  /* 🔴 N1: ทางออกเดียวของกอง "ยังอ่านทะเบียนไม่ได้" = อ่านไซต์ที่พังใหม่ทั้งหมด (ไม่รู้ว่าโซนอยู่ใบไหน)
     — `retrySite` ตั้ง state ด้วยตัวอัปเดตแบบฟังก์ชัน ⇒ ยิงพร้อมกันหลายใบไม่ทับกัน */
  const retryFailedSites = () => {
    for (const row of browser.rows) if (row.error) retrySite(row.site);
  };
  const allOpen = browser.rows.length > 0
    && browser.rows.every((row) => openSites[row.site.id] ?? row.defaultOpen);
  const toggleAll = () => setOpenSites(
    Object.fromEntries(browser.rows.map((row) => [row.site.id, !allOpen])),
  );

  return (
    <>
      {issues.length > 0 && (
        <StatusNotice tone="error" title={`โซนยังไม่ผ่าน ${issues.length} ข้อ`} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}
          </ul>
        </StatusNotice>
      )}
      {loadError ? <StatusNotice tone="error" title="โหลดทะเบียนไซต์ไม่สำเร็จ">{loadError}</StatusNotice> : null}

      {/* ⭐ ช่องค้นหนึ่งช่องกินทั้ง **รหัสไซต์ · ชื่อไซต์ · ชื่อโซน · รหัสโซน** = ทุกอย่างที่ตาเห็น
          บนแถว (กฎบ้าน search haystack) · autoComplete ปิดตามกฎช่องค้นทั้งระบบ */}
      <div className={styles.grid2}>
        <div className={styles.field}>
          <span>ใช้แพ็คเกจเดียวกันทุกโซน</span>
          <SearchableSelect
            entity="product"
            ariaLabel="แพ็คเกจบริการที่ใช้กับทุกโซน"
            options={packageOptions}
            value={state.packageProductId}
            onChange={applyPackage}
            disabled={busy}
            placeholder="เลือกแพ็คเกจบริการ (หมวด 02-001)"
            searchPlaceholder="ค้นหารหัส FG หรือชื่อแพ็คเกจ"
            /* 🐞 รีวิว R9: ข้อความนี้เป็น **คำตอบ** ⇒ ตอนทะเบียนสินค้าโหลดไม่ขึ้นมันโกหก
               แล้วผู้คีย์ไปไล่ทีมทะเบียนให้สร้างแพ็คเกจที่มีอยู่แล้ว */
            emptyText={productsError
              ? REGISTRY_LOAD_FAILED
              : "ลูกค้ารายนี้ยังไม่มีสินค้าหมวด 02-001 ในทะเบียน — ใบย้อนหลังคีย์ได้เฉพาะแพ็คเกจบริการ"}
          />
          <small>เลือกแล้วใส่ให้ทุกบรรทัดในตารางรายการ (ราคา/หน่วยและหน่วยมาจากทะเบียนสินค้า) · แต่ละบรรทัดเปลี่ยนเองได้</small>
        </div>
        <div className={styles.field}>
          <span>ค้นหาไซต์หรือโซน</span>
          <Input
            autoComplete="off"
            value={query}
            disabled={busy || (!sites.length && !loading)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="รหัสไซต์ ชื่อไซต์ ชื่อโซน หรือรหัสโซน"
            aria-label="ค้นหาไซต์หรือโซนของลูกค้ารายนี้"
          />
          <small>
            {query
              ? `แสดง ${fmtNumber(browser.rows.length)} จาก ${fmtNumber(browser.siteTotal)} ไซต์ · ${fmtNumber(browser.shownZones)} โซนที่ตรงคำค้น`
              : `ลูกค้ารายนี้มี ${fmtNumber(browser.siteTotal)} ไซต์ · ${fmtNumber(browser.zoneTotal)} โซนในทะเบียน`}
          </small>
        </div>
      </div>

      <div className={`${styles.field} ${styles.browseField}`}>
        <span>การแสดงผล</span>
        <div className={styles.browseRow}>
          <Button
            size="sm" variant="quiet"
            disabled={busy || !browser.rows.length}
            onClick={toggleAll}
            icon={allOpen ? <ChevronsDownUp size={14} aria-hidden="true" /> : <ChevronsUpDown size={14} aria-hidden="true" />}
          >
            {allOpen ? "ย่อทุกไซต์" : "ขยายทุกไซต์"}
          </Button>
          {query ? (
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => setQuery("")}>ล้างคำค้น</Button>
          ) : null}
        </div>
        <small>
          ไซต์ที่เลือกโซนไว้แล้ว ไซต์ที่ตรงคำค้น และไซต์ที่โหลดไม่สำเร็จ กางให้เอง · ที่เหลือพับไว้
        </small>
      </div>

      {/* คำค้นซ่อนแค่การ์ดไซต์ — บรรทัดของโซนที่ติ๊กไว้ยังอยู่ในตารางรายการครบ (ไม่บอก = ผู้คีย์คิดว่าโซนหายไป) */}
      {browser.hiddenPicked > 0 ? (
        <p className={styles.hint}>
          คำค้นนี้ซ่อนโซนที่เลือกไว้แล้ว {fmtNumber(browser.hiddenPicked)} โซน — บรรทัดของโซนพวกนั้นยังอยู่ในตารางรายการด้านล่าง
        </p>
      ) : null}

      {loading ? <p className={styles.hint}>กำลังโหลดทะเบียนไซต์…</p> : null}
      {!loading && !sites.length && customerId && !loadError ? (
        <p className={styles.hint}>ลูกค้ารายนี้ยังไม่มีไซต์ที่ใช้งานอยู่ในทะเบียน — แจ้งฝ่าย TS เพิ่มไซต์ก่อน</p>
      ) : null}
      {!loading && sites.length > 0 && !browser.rows.length ? (
        <p className={styles.hint}>ไม่มีไซต์หรือโซนที่ตรงคำค้น “{query}” — ล้างคำค้นเพื่อดูทั้งหมด</p>
      ) : null}

      {browser.rows.map(({ site, zones, picked, total, error, defaultOpen }) => {
        const open = openSites[site.id] ?? defaultOpen;
        /* ยอดของไซต์ = Σ จำนวนเงินของบรรทัดที่เห็นในไซต์นี้ (ตัวเดียวกับเซลล์ "จำนวนเงิน") —
           บรรทัดที่ยังคิดไม่ได้ (จำนวนว่าง/ยังไม่เลือกแพ็คเกจ) ไม่ถูกนับเป็น 0 เงียบ ๆ แต่บอกว่ายังขาดกี่โซน */
        const siteAmounts = rows
          .filter((row) => zones.some((zone) => zone.id === row.zoneId))
          .map(historicalZoneLineAmount);
        const siteTotal = siteAmounts.reduce((sum, amount) => sum + (amount.known ? amount.lineTotal : 0), 0);
        const sitePending = siteAmounts.filter((amount) => !amount.known).length;
        return (
          <CollapsibleCard
            key={site.id}
            id={`historical-site-${site.id}`}
            open={open}
            onToggle={(next) => setOpenSites((current) => ({ ...current, [site.id]: next }))}
            lead={<Building2 size={15} aria-hidden="true" />}
            eyebrow={site.code}
            title={site.name}
            tone={error ? "danger" : (picked ? "success" : "neutral")}
            alert={Boolean(error)}
            summary={(
              <>
                <span>{fmtNumber(total)} โซน</span>
                <span>
                  {picked
                    ? `${fmtMoney(siteTotal)}${sitePending ? ` · ยังคิดยอดไม่ได้ ${fmtNumber(sitePending)} โซน` : ""}`
                    : "ยังไม่เลือกโซนในไซต์นี้"}
                </span>
              </>
            )}
            badges={(
              <StatusBadge
                tone={error ? "danger" : (picked ? "success" : "neutral")}
                size="sm"
                label={error ? "โหลดโซนไม่สำเร็จ" : `เลือก ${fmtNumber(picked)}/${fmtNumber(total)} โซน`}
              />
            )}
          >
            {error ? (
              /* ไซต์ที่พังมีทางออกของตัวเอง — ไม่ต้องรีโหลดทั้งหน้าและไม่เสียงานที่คีย์ไว้ */
              <div className={styles.browseRow}>
                <span className={styles.muted}>{error}</span>
                <Button
                  size="sm" variant="quiet"
                  disabled={busy || Boolean(retrying[site.id])}
                  onClick={() => retrySite(site)}
                  icon={<RefreshCw size={14} aria-hidden="true" />}
                >
                  {retrying[site.id] ? "กำลังโหลด…" : "ลองอีกครั้ง"}
                </Button>
              </div>
            ) : (
              /* การ์ดไซต์ = ที่เลือกโซนอย่างเดียว (ติ๊ก = เพิ่มบรรทัดในตารางรายการข้างล่าง) — ไม่มีช่องกรอกในการ์ด */
              <ul className={styles.zonePicks}>
                {zones.map((zone) => {
                  const row = rowByZone.get(zone.id)?.row || null;
                  const inactive = zone.isActive === false;
                  const warn = liveTermByZone.get(zone.id) || null;
                  const problem = issueByZone.get(zone.id) || null;
                  return (
                    <li key={zone.id}>
                      <label className={styles.zonePick}>
                        {/* 🐞 รีวิว R10: `disabled={busy || inactive}` ปิด **การถอนติ๊ก** ของแถว
                            ที่ใบผูกไว้อยู่แล้วด้วย · ระหว่างนั้น `bindTargetError` ฝั่ง server
                            ตีกลับโซนที่ปิดใช้งานเสมอ และตัวติ๊กคือทางเดียวที่ถอดแถวออกจากใบได้
                            ⇒ ใบที่ถูกตีกลับแล้ว TS ปิดโซนระหว่างนั้น แก้ต่อไม่ได้เลย และ
                              ข้อความ "หรือเลือกโซนอื่น" ทำตามไม่ได้เพราะสลับโซนต้องถอนติ๊กก่อน
                            ⇒ **ถอนติ๊กได้เสมอ · ติ๊กใหม่ไม่ได้** (จอบริการ IntakeWizard ทำแบบนี้อยู่แล้ว)
                            (ปุ่มลบท้ายบรรทัดในตารางรายการก็ถอดได้อีกทาง) */}
                        <input
                          type="checkbox"
                          checked={Boolean(row)}
                          disabled={busy || (inactive && !row)}
                          onChange={() => toggleZone(zone, site)}
                          aria-label={`เลือกโซน ${zone.name}`}
                        />
                        <span className={styles.zonePickText}>
                          <span>{zone.name}</span>
                          <span className={styles.cellSub}>{zone.code}</span>
                          {inactive ? (
                            <span className={styles.cellSub}>
                              {row
                                ? "ปิดใช้งานในทะเบียน — ถอนติ๊กออกได้ หรือให้ TS เปิดใช้งานคืน"
                                : "ปิดใช้งานในทะเบียน — เลือกไม่ได้"}
                            </span>
                          ) : null}
                          {warn ? (
                            <span className={styles.cellSub}>
                              ⚠️ มีรอบขายของ {warn.orderNumber} อยู่แล้ว{warn.endDate ? ` (ถึง ${warn.endDate})` : ""}
                            </span>
                          ) : null}
                          {problem ? <span className={styles.cellBad}>{problem}</span> : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {zones.length === 0 && (
                  <li className={styles.muted}>
                    {query ? "ไม่มีโซนที่ตรงคำค้นในไซต์นี้" : "ไซต์นี้ยังไม่มีโซนในทะเบียน"}
                  </li>
                )}
              </ul>
            )}
          </CollapsibleCard>
        );
      })}

      {anySiteError ? (
        <StatusNotice tone="warning" title="บางไซต์ยังโหลดโซนไม่สำเร็จ" className={styles.notice}>
          ไซต์ที่ขึ้นป้ายแดงมีปุ่ม “ลองอีกครั้ง” ของตัวเอง — ไซต์ที่เหลือเลือกต่อได้ตามปกติ
          และของที่คีย์ไว้ไม่หาย
        </StatusNotice>
      ) : null}

      {/* 🔴 **N1** — ยังมีไซต์ที่อ่านโซนไม่สำเร็จ ⇒ โซนที่ใบผูกไว้แต่หาไม่เจอ **ยังตัดสินไม่ได้**
          ว่าหายจากทะเบียนจริงหรือแค่อยู่ในไซต์ที่อ่านไม่ถึง ⇒ ก้อนนี้มีแต่ปุ่มลองอ่านใหม่
          **ห้ามมีปุ่มถอด** (ของเดิมโชว์ปุ่มถอด ⇒ ผู้คีย์ลบบรรทัดจริงเพราะเน็ตกระตุก) — ปุ่มลบท้ายบรรทัด
          ของโซนพวกนี้ในตารางรายการก็ปิดด้วยเหตุเดียวกัน (`historicalZoneLines().removable`) */}
      {browser.unresolved.length > 0 ? (
        <StatusNotice
          tone="warning"
          title={`ยังอ่านทะเบียนไม่ได้ ${fmtNumber(browser.unresolved.length)} โซนที่ใบผูกไว้`}
          className={styles.notice}
          action={(
            <Button
              size="sm" variant="ghost"
              disabled={busy || retryingAny}
              onClick={retryFailedSites}
              icon={<RefreshCw size={14} aria-hidden="true" />}
            >
              {retryingAny ? "กำลังโหลด…" : "ลองอ่านไซต์ที่พังอีกครั้ง"}
            </Button>
          )}
        >
          <p className={styles.hint}>
            ไซต์ที่ขึ้นป้ายแดงยังอ่านโซนไม่สำเร็จ ⇒ ยังบอกไม่ได้ว่าโซนพวกนี้หายไปจากทะเบียนจริง
            หรือแค่อยู่ในไซต์ที่อ่านไม่ถึง — อ่านทะเบียนได้ครบก่อนจึงจะมีปุ่มถอดออกจากใบให้
            (ยอดรวมท้ายตารางยังนับโซนพวกนี้อยู่)
          </p>
          <ul className={styles.warnList}>
            {browser.unresolved.map((zoneId) => (
              <li key={zoneId}>
                <span className={styles.muted}>{zoneId}</span>
                {issueByZone.get(zoneId) ? ` — ${issueByZone.get(zoneId)}` : ""}
              </li>
            ))}
          </ul>
        </StatusNotice>
      ) : null}

      {/* 🔴 รีวิว R10: โซนที่ใบผูกไว้แต่ไม่มีอยู่ในทะเบียนที่โหลดมาเลย (ไซต์ถูกปิดใช้งาน · ไซต์ถูก
          โอนไปลูกค้ารายอื่น · โซนถูกลบ) ไม่มีการ์ดไซต์ให้ถอนติ๊ก แต่ยังถูกนับในยอดรวมและยังทำให้
          พรีวิวตีกลับ ⇒ ต้องบอกเหตุพร้อมปุ่มถอดของตัวเอง (บรรทัดในตารางรายการก็มีปุ่มลบเช่นกัน) */}
      {browser.orphans.length > 0 ? (
        <StatusNotice
          tone="error"
          title={`มี ${fmtNumber(browser.orphans.length)} โซนที่ใบผูกไว้แต่ไม่อยู่ในทะเบียนที่โหลดมา`}
          className={styles.notice}
        >
          <p className={styles.hint}>
            อาจถูกปิดใช้งาน ถูกย้ายไปลูกค้ารายอื่น หรือถูกลบ — ให้ฝ่าย TS เปิด/คืนโซนให้
            หรือถอดออกจากใบนี้ (ยอดรวมท้ายตารางยังนับโซนพวกนี้อยู่)
          </p>
          <ul className={styles.warnList}>
            {browser.orphans.map((zoneId) => (
              <li key={zoneId}>
                <span className={styles.muted}>{zoneId}</span>
                {issueByZone.get(zoneId) ? ` — ${issueByZone.get(zoneId)}` : ""}
                <Button
                  size="sm" variant="quiet" disabled={busy}
                  onClick={() => setRows(rows.filter((row) => row.zoneId !== zoneId))}
                >
                  ถอดโซนนี้ออกจากใบ
                </Button>
              </li>
            ))}
          </ul>
        </StatusNotice>
      ) : null}

      {/* ⭐ ตารางรายการของใบ = ตารางของใบเสนอราคา (มติเจ้าของ 23/09): กล่อง · หัวคอลัมน์ · เซลล์ · ปุ่มลบ
          · กล่องสรุปท้ายตาราง มาจาก QuoteLineCells ทั้งหมด · หนึ่งโซนที่ติ๊ก = หนึ่งบรรทัด
          ⚠️ อยู่นอกการ์ดไซต์โดยเจตนา — ซ้อนในการ์ดแล้วกล่องแคบกว่า 900 ทุกจอ = พับเป็นการ์ดต่อบรรทัด (หัวไฟล์) */}
      <h4 className={styles.section}>
        รายการ
        <span className={styles.sectionKind}>{fmtNumber(rows.length)} โซน · หนึ่งโซนหนึ่งบรรทัด</span>
      </h4>
      <QuoteLinesTable>
        <thead>
          <tr>
            <QuoteLineIndexHead />
            <QuoteLineHeadCells />
            <QuoteLineActionsHead />
          </tr>
        </thead>
        <tbody>
          {lines.map(({ row, index, point, note, name, removable, removeTitle }) => {
            const product = row.productId ? productsById.get(row.productId) || null : null;
            const amount = historicalZoneLineAmount(row);
            const warn = liveTermByZone.get(row.zoneId) || null;
            const problem = issueByIndex.get(index) || null;
            return (
              <tr key={row.key || row.zoneId} className="premium-row">
                <QuoteLineIndexCell index={index} />
                <QuoteLineItemCell>
                  <QuoteLineProductPicker
                    value={row.productId}
                    onChange={(value) => pickRowPackage(row.zoneId, value)}
                    name={name}
                    options={packageOptions}
                    disabled={busy}
                    /* 🐞 รีวิว R9: ช่องนี้ไม่มี emptyText ⇒ ตกไปที่ "ไม่พบรายการ" ของตัวห่อ
                       ซึ่งอ่านเป็นคำตอบ · และเมื่อทะเบียนโหลดไม่ขึ้น ค่าที่แถวถืออยู่จะเด้ง
                       กลับเป็น placeholder ทั้งที่ใบยังผูกแพ็คเกจนั้นอยู่ ⇒ บอกทั้งสองอย่าง
                       ⭐ placeholder/ช่องค้นเป็นค่าตั้งต้นของใบเสนอราคา (“เลือก FG / สินค้า...”) — รีวิว 23/09 */
                    emptyText={productsError ? REGISTRY_LOAD_FAILED : undefined}
                  />
                  {row.productId || row.fgCode ? (
                    <QuoteLineFgInfo line={row} product={product} />
                  ) : null}
                  {productsError && row.productId && !product ? (
                    <span className={styles.cellSub}>
                      บรรทัดนี้ผูกแพ็คเกจไว้แล้ว ({row.productId}) — ชื่อไม่ขึ้นเพราะทะเบียนสินค้าโหลดไม่สำเร็จ
                    </span>
                  ) : null}
                  {/* ของเพิ่มสองอย่างของใบย้อนหลัง ใต้คำอธิบาย (ตรงเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย):
                      ① โซนที่ผูก ② รอบบริการที่ขายไว้ (ช่องของบรรทัดใบสั่งขาย — ใบเสนอราคาไม่มี) */}
                  <QuoteLineInstallationPoint point={point} note={note} />
                  <QuoteLineServiceRounds
                    value={row.rounds}
                    onChange={(value) => patchRow(row.zoneId, { rounds: value })}
                    disabled={busy}
                    name={name}
                    note="เว้นว่างได้ · TS ตั้งวันนัดเอง"
                  />
                  {warn ? (
                    <span className={styles.cellSub}>
                      ⚠️ โซนนี้มีรอบขายของ {warn.orderNumber} อยู่แล้ว{warn.endDate ? ` (ถึง ${warn.endDate})` : ""}
                    </span>
                  ) : null}
                  {problem ? <span className={styles.cellBad}>{problem}</span> : null}
                </QuoteLineItemCell>
                <QuoteLineMoneyCells
                  line={row}
                  product={product}
                  editable={!busy}
                  onPatch={(patch) => patchRow(row.zoneId, patch)}
                  name={name}
                  driftNote={`ระบบคิดด้วยราคานี้ตอนกด “${HISTORICAL_NEXT_BUTTON_LABEL}”`}
                  amountPending={!amount.known}
                  registryPriceOnly
                  qtyNote={amount.qtyNote}
                />
                {/* ปุ่มลบ = ถอนติ๊กโซน · โซนที่ยังตัดสินไม่ได้ (ทะเบียนอ่านไม่ครบ/กำลังโหลด) ลบไม่ได้ พร้อมเหตุใน title */}
                <QuoteLineRemoveCell
                  name={name}
                  onRemove={() => removeRow(row.zoneId)}
                  disabled={busy || !removable}
                  title={removeTitle}
                />
              </tr>
            );
          })}
          {!lines.length && (
            <QuoteLinesEmptyRow colSpan={7}>ยังไม่มีรายการ — ติ๊กโซนในการ์ดไซต์ด้านบน (หนึ่งโซนหนึ่งบรรทัด)</QuoteLinesEmptyRow>
          )}
        </tbody>
      </QuoteLinesTable>

      {/* ⭐ กล่องสรุปท้ายตาราง = กล่องของใบเสนอราคา · ป้ายมาจาก `historicalTotalsView` ตัวเดียวกับขั้น ④
          ⚠️ ไม่มีแถว "หัก ส่วนลด" (ใบย้อนหลังไม่มีส่วนลดท้ายใบ) และ VAT เป็นป้ายของตัวเลือกที่ขั้น ① ไม่ใช่ดรอปดาวน์
          ⭐ ยอดเคยขึ้นขีดตลอดรอบคีย์ (แผนคืนมาเฉพาะตอนไม่มี error) — รีวิว R7 ⇒ คิดจากบรรทัดตั้งแต่ก่อนมีแผน */}
      <QuoteLineTotals rows={totals.rows} grandTotal={totals.grandTotal} />
      {moneyView.ok ? null : <p className={styles.hint}>{moneyView.reason}</p>}

      <StatusNotice
        tone="info"
        title="ไม่เจอไซต์/โซน?"
        icon={MapPin}
        className={styles.notice}
        action={<Button as={Link} href="/database/sites" size="sm" variant="ghost">เปิดทะเบียนไซต์</Button>}
      >
        ทะเบียนไซต์เป็นของฝ่าย TS — แจ้ง TS เพิ่มไซต์/โซนก่อน แล้วกลับมาเลือก (ห้ามพิมพ์ชื่อจุดเอง)
      </StatusNotice>
    </>
  );
}
