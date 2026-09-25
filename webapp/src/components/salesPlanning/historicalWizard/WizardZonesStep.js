"use client";
// ── ขั้น ② ไซต์ โซน และรายการ ─────────────────────────────────────────────────────────
//
// ⭐ **มติเจ้าของ 25/09 — ขั้นนี้คือตารางรายการของใบเสนอราคา + ช่อง "ไซต์ · โซน" ในบรรทัด**
//   ("หน้า SO ย้อนหลัง ใช้แล้ว สับสนยาก มันควรจะหน้าตาเหมือนใบเสนอราคา แต่เพิ่มการเชื่อม ไซท์ โซน รายรายการเข้าไป"
//    · "ส่วนลด รายบรรทัด รายใบก็ควรครบ" · ม็อก https://claude.ai/artifact/Tu6RVhUfoQb9kTNooknhoH)
//   · บรรทัดเกิดจากปุ่ม **"เพิ่มรายการ"** หัวตาราง (แบบใบเสนอราคา) — แพ็คเกจ · ไซต์ · โซน · รอบ เลือกในบรรทัดเอง
//   · ลูกค้าโซนเยอะ (เซ็นทรัล ฟู้ด 26 ไซต์ 43 โซน · AWC 247 โซน) ใช้ **"เพิ่มหลายโซน"** — ค้น → ติ๊ก → แพ็คเกจ/จำนวน
//     ครั้งเดียว → หนึ่งบรรทัดต่อโซน (`HistoricalBulkZonesModal`) · แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ที่ถอดแล้ว
//   · กล่องสรุปท้ายตาราง = กล่องแบบแก้ได้ของใบเสนอราคา (`QuoteLineTotalsEditor`): **หัก ส่วนลด** ท้ายใบ + **ภาษีมูลค่าเพิ่ม**
//     (ย้ายมาจากขั้น ① · ไม่มีค่าตั้งต้น — ใบเก่ามีทั้งแบบรวม VAT และบวก 7% เดาผิด = ยอดไม่ตรงเงินที่เก็บจริง)
//   · error **ขึ้นที่เดียว**: ก้อนบนลิสต์ทุกข้อ + ข้อความใต้ช่องที่ผิดช่องเดียว (`historicalLineIssues` — ผูกกับ `key`
//     ของแถว ไม่ใช่ลำดับ ⇒ ลบบรรทัดแล้วข้อความไม่เลื่อนไปเกาะบรรทัดอื่น · แก้ช่องไหนข้อความช่องนั้นหาย)
//   🐞 ของเดิม (ถอดแล้ว): การ์ดไซต์ + ติ๊กโซนนอกตาราง (ติ๊กก่อนบรรทัดถึงเกิด = กลับหัวกับใบเสนอราคา) · โซนในบรรทัด
//      เป็นตัวหนังสือเปลี่ยนไม่ได้ · ถอนติ๊ก = บรรทัดหายพร้อมจำนวน/ส่วนลดไม่ถาม · error ข้อเดียวขึ้น 3–5 ที่ ·
//      ช่องค้น + ปุ่มย่อ/ขยาย ("การแสดงผล") · ช่องแพ็คเกจทุกโซนที่เททับทุกบรรทัดเงียบ ๆ และไม่บันทึกอะไร
//
// ⭐ ของที่เพิ่มจากใบเสนอราคามีสองอย่างเท่านั้น (มติ 23/09): **ไซต์ · โซน** และ **รอบบริการที่ขายไว้**
// ⚠️ ข้อยกเว้นจากตารางใบเสนอราคา (เหตุผลด้านข้อมูล — เจ้าของรับรองแล้ว 25/09):
//   จำนวนเริ่มที่ว่าง (1 ชุด × 12 เดือน = 12 · ใส่ 1 ให้ = เดาผิดเกือบทุกใบ) · ไม่มีหมายเหตุรายบรรทัด (ใบย้อนหลังไม่พิมพ์) ·
//   ไม่มีบรรทัดพิมพ์เอง (ทุกบรรทัดต้องเป็นแพ็คเกจ 02-001 ที่ผูกโซน) · ราคา/หน่วยปิดตั้งแต่ยังไม่เลือกแพ็คเกจ (ใบนี้ไม่ส่งราคา)
//
// ⭐ **โซนเลือกจากทะเบียน ไม่ใช่พิมพ์ชื่อเอง** (มติ 22/09 แทนข้อ 17 ของ 0360) — หนึ่งบรรทัด = หนึ่งโซน
//   = หนึ่งรอบขายของโซน (service_zone_terms) ที่เกิดตอน AE Sup อนุมัติ ⇒ TS ไม่ต้องผูกโซนอีก
//   ⇒ ทะเบียนไซต์เป็นของฝ่าย TS · ไม่เจอไซต์/โซน = แจ้ง TS เพิ่มก่อน
//
// ⚠️ ขอเฉพาะไซต์ที่ยังใช้งาน (`includeInactive=0`) แต่ **โซนที่ปิดใช้งานยังไหลมากับไซต์** ⇒ ในช่องเลือกขึ้นแบบกดไม่ได้
//   พร้อมเหตุ ไม่ใช่ซ่อนทิ้ง · R10: บรรทัดที่ผูกโซนนั้นอยู่แล้ว **เปลี่ยนโซน/ลบบรรทัดได้เสมอ** (ด่านจริงคือ bindTargetError)
// ⚠️ **ไม่มีตัวเลข "N จุด"** — payload ของโซนไม่มี `spots` มาด้วย ⇒ โชว์รหัสโซนแทน
//
// 🔴 **ของจริงบนฐานใหญ่กว่าม็อกมาก (UAT 23/09)** — โหลดโซน **ทีละไซต์แบบพังทีละใบ** (`loadSiteZones` ไม่เคย reject)
//   ไซต์เดียวโหลดไม่สำเร็จต้องไม่ทำให้ทั้งทะเบียนว่าง · ไซต์ที่พังมีปุ่มลองอีกครั้ง · โซนที่ใบผูกไว้ในไซต์ที่อ่านไม่ได้
//   **ลบไม่ได้** จนกว่าจะอ่านครบ (N1 — ลบเพราะเน็ตกระตุก = ลบบรรทัดจริง)
//
// 🪤 **ทำไมยังยิงรายไซต์ ไม่ใช่คำขอเดียว**: เส้นที่คืนโซนทั้งลูกค้าในคำขอเดียว (`/api/service/customers/[customerId]/zones`)
//   พก survey/term/order/request มาด้วยทั้งก้อน และคืนไซต์ที่ปิดใช้งานด้วย · เส้นไซต์ + โซนรายไซต์ที่ใช้อยู่เบากว่าและ
//   ผ่านด่าน `canViewServiceRegistry` ตัวเดียวกัน ⇒ ยังไม่มีเหตุให้ย้าย
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListPlus, MapPin, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusNotice from "@/components/ui/StatusNotice";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { apiJson } from "@/lib/apiFetch";
import { productSelectOptions } from "@/components/master/productOption";
import {
  QuoteLineActionsHead, QuoteLineFgInfo, QuoteLineHeadCells, QuoteLineIndexCell, QuoteLineIndexHead,
  QuoteLineItemCell, QuoteLineMoneyCells, QuoteLineProductPicker, QuoteLineRemoveCell,
  QuoteLineServiceRounds, QuoteLineTotalsEditor, QuoteLinesEmptyRow, QuoteLinesTable,
} from "@/components/salesPlanning/QuoteLineCells";
import { fmtNumber } from "@/lib/format";
import { lineIsServicePackage } from "@/lib/sales/serviceOrders";
import { quoteLineFromProduct } from "@/lib/sales/quoteLines";
import {
  HISTORICAL_NEXT_BUTTON_LABEL, HISTORICAL_VAT_RATES, REGISTRY_LOAD_FAILED, emptyHistoricalZone,
  historicalDownstreamReset, historicalFieldAnchorId, historicalIssueText, historicalLineIssues, historicalLinesSummary,
  historicalMoneyView, historicalStepIssueNotice, historicalTotalsView, historicalZoneBrowser,
  historicalZoneLineAmount, historicalZoneLines, historicalZonePickerOptions,
} from "@/lib/sales/historicalIntakeForm";
import HistoricalBulkZonesModal from "./HistoricalBulkZonesModal";
import styles from "./HistoricalOrderWizard.module.css";

const SITES_PATH = (customerId) => `/api/service/sites?customerId=${encodeURIComponent(customerId)}&includeInactive=0`;
const ZONES_PATH = (siteId) => `/api/service/sites/${encodeURIComponent(siteId)}/zones`;

/* ตัวเลือกของช่อง "ไซต์ · โซน" (ข้อมูลจาก `historicalZonePickerOptions`) → แถวที่วาดในดรอปดาวน์
   ⭐ ชื่อโซนเด่น · เหตุที่เลือกไม่ได้ (อยู่ในรายการอื่นแล้ว / ปิดใช้งาน) · รหัสโซนชิดขวา — ป้ายบนช่องที่ปิดอยู่
   ยังเป็นชื่อจุดเต็ม ("รหัสไซต์ ชื่อไซต์ · ชื่อโซน") คำเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย */
const zoneSelectOption = (option) => (option.group ? option : {
  ...option,
  title: option.why || undefined,
  render: (
    <span className={styles.zoneOption}>
      <span className={styles.zoneOptionName}>{option.missing ? option.label : option.zoneName}</span>
      {option.why ? <small className={styles.zoneOptionWhy}>{option.why}</small> : null}
      {option.zoneCode ? <small className={styles.zoneOptionCode}>{option.zoneCode}</small> : null}
    </span>
  ),
});

export default function WizardZonesStep({
  state, onChange, issues = [], summary = true, plan = null, money = null, products = [], productsError = "", busy = false,
}) {
  const [sites, setSites] = useState([]);
  const [zonesBySite, setZonesBySite] = useState({});
  const [siteErrors, setSiteErrors] = useState({});
  const [retrying, setRetrying] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  /* 🐞 รีวิว 25/09: เส้นทะเบียนไซต์พังแล้วไม่มีทางยิงใหม่ (เอฟเฟกต์ยิงเฉพาะตอนเปลี่ยนลูกค้า ซึ่งล้างทุกบรรทัด)
     ⇒ ทางออกเดียวคือรีโหลดหน้า = ชนยาม useUnsavedChanges (ทางตันแบบ N4) · ตัวนับรอบนี้คือปุ่ม "ลองโหลดใหม่" */
  const [sitesRound, setSitesRound] = useState(0);
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
        /* ⚠️ ตั้งไซต์กับโซนพร้อมกัน — ตั้งไซต์ก่อนแล้วรอโซน = ช่องเลือกขึ้นไซต์ที่ "ไม่มีโซน" อยู่ครู่หนึ่ง
           ซึ่งอ่านเป็นคำตอบที่ผิด */
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
  }, [customerId, loadSiteZones, sitesRound]);

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
  const ready = !loading && !loadError;
  const liveTermByZone = useMemo(() => {
    const map = new Map();
    for (const term of plan?.liveTerms || []) if (!map.has(term.zoneId)) map.set(term.zoneId, term);
    return map;
  }, [plan]);
  /* ⭐ ข้อความรายช่องของแต่ละแถว — ผูกกับ `key` ของแถว (ผู้เรียกผูกตอนได้คำตอบ · ดูหัว `historicalIssuesWithRowKeys`) */
  const lineIssues = useMemo(() => historicalLineIssues(issues), [issues]);
  const issueOf = (field) => issues.find((issue) => issue.field === field)?.message || null;

  /* กำพร้า/อ่านไม่ได้ (R10 · N1) — ตัวตัดสินอยู่ที่ lib · ⚠️ `ready` เท็จระหว่างโหลด = ยังตัดสินไม่ได้ */
  const registry = useMemo(() => historicalZoneBrowser({
    sites, zonesBySite, siteErrors, pickedZoneIds: rows.map((row) => row.zoneId), ready,
  }), [sites, zonesBySite, siteErrors, rows, ready]);
  const lines = useMemo(() => historicalZoneLines({
    zones: rows, sites, zonesBySite, siteErrors, ready, failed: Boolean(loadError),
  }), [rows, sites, zonesBySite, siteErrors, ready, loadError]);
  /* ตัวเลือกของช่อง "ไซต์ · โซน" ต่อแถว — คิดใหม่เฉพาะตอน **การผูกโซน** ของใบเปลี่ยน (ไม่ใช่ทุกครั้งที่พิมพ์จำนวน)
     ลูกค้า AWC มี 247 โซน × บรรทัดละช่อง = คิดทุกการกดแป้นคือหน่วงที่ไม่จำเป็น */
  const zoneAssign = rows.map((row) => `${row.key}:${row.zoneId}`).join("|");
  const zoneOptionsByRow = useMemo(() => {
    const noteOf = new Map(lines.map((line) => [line.row.key, line.note]));
    return new Map(rows.map((row) => [row.key, historicalZonePickerOptions({
      sites, zonesBySite, rows, rowKey: row.key, missingNote: noteOf.get(row.key),
    }).map(zoneSelectOption)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rows`/`lines` อ่านผ่าน zoneAssign (ส่วนที่ตัวเลือกใช้จริง)
  }, [zoneAssign, sites, zonesBySite, siteErrors, ready]);
  const siteOfZone = useMemo(() => {
    const map = new Map();
    for (const site of sites) for (const zone of zonesBySite[site.id] || []) map.set(zone.id, site);
    return map;
  }, [sites, zonesBySite]);

  /* ยอดใบ: มีแผนใช้แผน ไม่มีก็คิดจากบรรทัด + ส่วนลดท้ายใบ + VAT ด้วยสูตรใบเสนอราคาตัวเดียวกับ server (รีวิว R7) */
  const moneyView = useMemo(() => money || historicalMoneyView(state, plan), [money, state, plan]);
  const totals = historicalTotalsView(moneyView, state.vatRate);

  const setRows = (next) => onChange({ zones: next });
  const patchRow = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const removeRow = (key) => setRows(rows.filter((row) => row.key !== key));
  /* ⭐ ทุกทางที่ใส่แพ็คเกจให้แถว (ช่องในบรรทัด · หน้าต่างเพิ่มหลายโซน) ผ่าน `quoteLineFromProduct` ตัวเดียวกับช่องเลือก
     สินค้าของใบเสนอราคา ⇒ หน่วย · ราคา/หน่วย (ล็อก) · ข้อมูล FG มาจากทะเบียนแบบเดียวกัน
     ⚠️ ทะเบียนสินค้าโหลดไม่ขึ้น = ไม่รู้จักสินค้า ⇒ ผูกรหัสไว้เฉย ๆ (แผนอ่านราคาจากทะเบียนเองตอนตรวจอยู่แล้ว) */
  const withPackage = (row, productId) => {
    const product = productId ? productsById.get(productId) || null : null;
    return product ? quoteLineFromProduct(row, product) : { ...row, productId: productId || "" };
  };
  const pickRowPackage = (key, productId) => setRows(rows.map((row) => (row.key === key ? withPackage(row, productId) : row)));
  /* เปลี่ยนโซนในบรรทัด = ย้ายการผูก **ไม่แตะแพ็คเกจ/จำนวน/ส่วนลด** (ของเดิมต้องถอนติ๊กแล้วคีย์บรรทัดใหม่ทั้งบรรทัด) */
  const pickRowZone = (key, zoneId) => patchRow(key, { zoneId: zoneId || "", siteId: siteOfZone.get(zoneId)?.id || "" });
  /* บรรทัดใหม่แบบใบเสนอราคา — ว่างทุกช่อง (ไม่มีค่าตั้งต้นให้การตัดสินใจ: แพ็คเกจ · โซน · จำนวน) */
  const addLine = () => setRows([...rows, emptyHistoricalZone()]);
  const addBulk = (newRows, productId) => setRows([...rows, ...newRows.map((row) => withPackage(row, productId))]);

  /* VAT เปลี่ยน = ยอดใบคิดใหม่ ⇒ งวดที่คีย์ไว้ไม่ตรงยอดอีก — ถามแล้วล้างเป็นชุดเดียว (ตัวตัดสินเดียวกับตอนอยู่ขั้น ①) */
  const changeVat = async (value) => {
    if (!HISTORICAL_VAT_RATES.includes(value) || value === state.vatRate) return;
    const reset = historicalDownstreamReset(state, "vat");
    if (reset.ask) {
      const go = await confirmAction({
        title: reset.title,
        description: reset.description,
        detail: reset.detail,
        confirmLabel: reset.confirmLabel,
        tone: "danger",
      });
      if (!go) return;
    }
    onChange({ vatRate: value, ...reset.patch });
  };
  const changeDiscount = ({ type, value }) => onChange({ discountType: type || null, discountValue: type ? value ?? "" : "" });

  const failedSites = sites.filter((site) => siteErrors[site.id]);
  const retryingAny = Object.values(retrying).some(Boolean);
  /* 🔴 N1: ทางออกเดียวของกอง "ยังอ่านทะเบียนไม่ได้" = อ่านไซต์ที่พังใหม่ทั้งหมด (ไม่รู้ว่าโซนอยู่ใบไหน)
     — `retrySite` ตั้ง state ด้วยตัวอัปเดตแบบฟังก์ชัน ⇒ ยิงพร้อมกันหลายใบไม่ทับกัน */
  const retryFailedSites = () => { for (const site of failedSites) retrySite(site); };
  /* ⭐ ป้ายบรรทัดในก้อนรวมพูด **เลขบรรทัดปัจจุบัน** (ลบบรรทัดบนแล้วเลขเลื่อน) — ตัวตัดสินอยู่ที่ lib */
  const issueText = (issue) => historicalIssueText(issue, lines);
  const vatIssue = issueOf("vatRate");
  const discountIssue = issueOf("discount");
  const notice = historicalStepIssueNotice(issues.length);

  return (
    <>
      {summary && issues.length > 0 && (
        /* ⭐ ก้อนเดียวบอกทุกข้อ (หัวเดียวกับขั้น ①) · ข้อความใต้ช่องมีอีกที่เดียว — ไม่มีหัวการ์ด/ช่องติ๊กมาพูดซ้ำแล้ว
           ขึ้นหลังกด "ถัดไป" เท่านั้น (มติ 25/09 · ผู้เรียกตัดสินผ่าน `summary`) */
        <StatusNotice tone="error" title={notice.title} className={styles.notice}>
          <ul className={styles.warnList}>
            {issues.map((issue) => <li key={`${issue.field}-${issue.rowKey || ""}-${issue.message}`}>{issueText(issue)}</li>)}
          </ul>
        </StatusNotice>
      )}
      {loadError ? (
        <StatusNotice
          tone="error"
          title="โหลดทะเบียนไซต์ไม่สำเร็จ"
          className={styles.notice}
          action={(
            <Button
              size="sm" variant="ghost"
              disabled={busy || loading}
              onClick={() => setSitesRound((round) => round + 1)}
              icon={<RefreshCw size={14} aria-hidden="true" />}
            >
              {loading ? "กำลังโหลด…" : "ลองโหลดทะเบียนไซต์อีกครั้ง"}
            </Button>
          )}
        >
          {loadError} — บรรทัดที่ผูกโซนไว้ยังลบไม่ได้จนกว่าจะโหลดสำเร็จ (ยังไม่รู้ว่าโซนยังอยู่ไหม)
        </StatusNotice>
      ) : null}
      {failedSites.length > 0 ? (
        /* 🔴 N1 — ไซต์ที่อ่านโซนไม่สำเร็จ: ตัวเลือกของไซต์นั้นยังไม่ขึ้นในช่อง "ไซต์ · โซน" และบรรทัดที่ผูกโซนของมันไว้
           **ลบไม่ได้** จนกว่าจะอ่านครบ (ยังไม่รู้ว่าโซนหายจริงไหม) — ปุ่มนี้คือทางออกเดียว */
        <StatusNotice
          tone="warning"
          title={`ยังโหลดโซนไม่สำเร็จ ${fmtNumber(failedSites.length)} ไซต์`}
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
          <ul className={styles.warnList}>
            {failedSites.map((site) => <li key={site.id}>{[site.code, site.name].filter(Boolean).join(" ")} — {siteErrors[site.id]}</li>)}
          </ul>
          {registry.unresolved.length ? (
            <p className={styles.hint}>
              บรรทัดที่ผูกโซนไว้ {fmtNumber(registry.unresolved.length)} บรรทัดยังอ่านชื่อจุดไม่ได้ — ลบไม่ได้จนกว่าจะอ่านทะเบียนครบ
              (ยังบอกไม่ได้ว่าโซนหายจริงหรือแค่อยู่ในไซต์ที่อ่านไม่ถึง) · ยอดรวมท้ายตารางยังนับบรรทัดพวกนี้อยู่
            </p>
          ) : null}
        </StatusNotice>
      ) : null}

      {/* ⭐ หัวตาราง = หัวการ์ด "รายการสินค้า/บริการ" ของใบเสนอราคา: ชื่อ + ปุ่มเพิ่มชิดขวา */}
      <div className={styles.linesHead} id={historicalFieldAnchorId("zones")}>
        <h4 className={styles.section}>
          รายการ
          <span className={styles.sectionKind}>{rows.length ? historicalLinesSummary(rows) : "ยังไม่มีรายการ"}</span>
        </h4>
        <span className={styles.linesHeadActions}>
          <Button
            size="sm" tone="neutral" disabled={busy}
            onClick={() => setBulkOpen(true)}
            icon={<ListPlus size={14} aria-hidden="true" />}
          >
            เพิ่มหลายโซน
          </Button>
          <Button
            size="sm" tone="neutral" disabled={busy}
            onClick={addLine}
            icon={<Plus size={14} aria-hidden="true" />}
          >
            เพิ่มรายการ
          </Button>
        </span>
      </div>
      <QuoteLinesTable>
        <thead>
          <tr>
            <QuoteLineIndexHead />
            <QuoteLineHeadCells />
            <QuoteLineActionsHead />
          </tr>
        </thead>
        <tbody>
          {lines.map(({ row, index, zone, name, removable, removeTitle }) => {
            const product = row.productId ? productsById.get(row.productId) || null : null;
            const amount = historicalZoneLineAmount(row);
            const warn = row.zoneId ? liveTermByZone.get(row.zoneId) || null : null;
            const bad = lineIssues.get(row.key) || {};
            return (
              <tr key={row.key} className="premium-row">
                <QuoteLineIndexCell index={index} />
                <QuoteLineItemCell>
                  <QuoteLineProductPicker
                    value={row.productId}
                    onChange={(value) => pickRowPackage(row.key, value)}
                    name={name}
                    options={packageOptions}
                    disabled={busy}
                    /* 🐞 รีวิว R9: ทะเบียนโหลดไม่ขึ้นต้องพูดว่า "โหลดไม่ขึ้น" ไม่ใช่ "ไม่พบรายการ" (อ่านเป็นคำตอบ) */
                    emptyText={productsError ? REGISTRY_LOAD_FAILED : "ลูกค้ารายนี้ยังไม่มีแพ็คเกจบริการ (หมวด 02-001) ในทะเบียนสินค้า"}
                  />
                  {bad.productId ? <span className={styles.cellBad}>{bad.productId}</span> : null}
                  {row.productId || row.fgCode ? <QuoteLineFgInfo line={row} product={product} /> : null}
                  {productsError && row.productId && !product ? (
                    <span className={styles.cellSub}>
                      บรรทัดนี้ผูกแพ็คเกจไว้แล้ว ({row.productId}) — ชื่อไม่ขึ้นเพราะทะเบียนสินค้าโหลดไม่สำเร็จ
                    </span>
                  ) : null}
                  {/* ⭐ ของเพิ่มสองอย่างของใบย้อนหลัง (มติ 23/09 · 25/09): ไซต์ · โซน (เลือกในบรรทัด) + รอบบริการที่ขายไว้ */}
                  <div className={styles.lineBind}>
                    <div className={styles.lineBindZone}>
                      <span className={styles.lineBindLabel}>ไซต์ · โซน <b className={styles.req}>*</b></span>
                      <SearchableSelect
                        size="sm"
                        className="w-full"
                        value={row.zoneId}
                        onChange={(value) => pickRowZone(row.key, value)}
                        options={zoneOptionsByRow.get(row.key) || []}
                        disabled={busy}
                        ariaLabel={`ไซต์ · โซน ${name}`}
                        placeholder={loading ? "กำลังโหลดทะเบียนไซต์…" : "เลือกไซต์ · โซน"}
                        searchPlaceholder="ค้นหารหัส/ชื่อไซต์ หรือชื่อ/รหัสโซน"
                        /* 🔴 R9: โหลดอยู่ / โหลดพัง / บางไซต์อ่านไม่ได้ ≠ "ไม่มีในทะเบียน" (รีวิว 25/09) — ถามสามข้อนั้นก่อนเสมอ */
                        emptyText={(query) => {
                          if (loading) return "กำลังโหลดทะเบียนไซต์…";
                          if (loadError) return "โหลดทะเบียนไซต์ไม่สำเร็จ — ดูข้อความแดงด้านบน";
                          if (failedSites.length) {
                            return `ยังโหลดโซนไม่สำเร็จ ${fmtNumber(failedSites.length)} ไซต์ — กด “ลองอ่านไซต์ที่พังอีกครั้ง” ด้านบนก่อน (โซนที่หาอาจอยู่ในไซต์นั้น)`;
                          }
                          return query
                            ? `ไม่มีไซต์หรือโซนที่ตรง “${query}” — ไม่เจอให้แจ้ง TS เพิ่มในทะเบียนไซต์`
                            : "ลูกค้ารายนี้ยังไม่มีไซต์ที่ใช้งานอยู่ในทะเบียน — แจ้งฝ่าย TS เพิ่มไซต์ก่อน";
                        }}
                      />
                      {zone?.code ? <small className={styles.cellSub}>{zone.code}</small> : null}
                      {bad.zoneId ? <span className={styles.cellBad}>{bad.zoneId}</span> : null}
                    </div>
                    <div className={styles.lineBindRounds}>
                      <QuoteLineServiceRounds
                        value={row.rounds}
                        onChange={(value) => patchRow(row.key, { rounds: value })}
                        disabled={busy}
                        name={name}
                        note="เว้นว่างได้ · TS ตั้งวันนัดเอง"
                      />
                      {bad.rounds ? <span className={styles.cellBad}>{bad.rounds}</span> : null}
                    </div>
                  </div>
                  {warn ? (
                    <span className={styles.cellSub}>
                      ⚠️ โซนนี้มีรอบขายของ {warn.orderNumber} อยู่แล้ว{warn.endDate ? ` (ถึง ${warn.endDate})` : ""}
                    </span>
                  ) : null}
                  {bad.row ? <span className={styles.cellBad}>{bad.row}</span> : null}
                </QuoteLineItemCell>
                <QuoteLineMoneyCells
                  line={row}
                  product={product}
                  editable={!busy}
                  onPatch={(patch) => patchRow(row.key, patch)}
                  name={name}
                  driftNote={`ระบบคิดด้วยราคานี้ตอนกด “${HISTORICAL_NEXT_BUTTON_LABEL}”`}
                  amountPending={!amount.known}
                  registryPriceOnly
                  /* ⭐ ข้อความใต้ช่องจำนวนมีที่เดียว: เหตุที่จอรู้เอง (1.5 / 0) ก่อน แล้วค่อยข้อที่แผนตีกลับ (เช่นยังว่าง) */
                  qtyNote={amount.qtyNote || bad.qty || null}
                />
                {/* ปุ่มลบ = ลบบรรทัด · โซนที่ยังตัดสินไม่ได้ (ทะเบียนอ่านไม่ครบ/กำลังโหลด) ลบไม่ได้ พร้อมเหตุใน title (N1) */}
                <QuoteLineRemoveCell
                  name={name}
                  onRemove={() => removeRow(row.key)}
                  disabled={busy || !removable}
                  title={removeTitle}
                />
              </tr>
            );
          })}
          {!lines.length && (
            <QuoteLinesEmptyRow colSpan={7}>ยังไม่มีรายการ — กด “เพิ่มรายการ” หรือ “เพิ่มหลายโซน”</QuoteLinesEmptyRow>
          )}
        </tbody>
      </QuoteLinesTable>

      {/* ⭐ กล่องสรุปท้ายตาราง = กล่องแบบแก้ได้ของใบเสนอราคา (ส่วนลดท้ายใบ + VAT) — ตัวเดียวกับหน้าออกใบเสนอราคา
          ⚠️ VAT ไม่มีค่าตั้งต้น (`vatPlaceholder`) · ป้ายยอดมาจาก `historicalTotalsView` ตัวเดียวกับขั้น ④ */}
      <QuoteLineTotalsEditor
        values={totals.values}
        discountType={state.discountType}
        discountValue={state.discountValue}
        vatRate={HISTORICAL_VAT_RATES.includes(state.vatRate) ? state.vatRate : null}
        editable={!busy}
        onDiscountChange={changeDiscount}
        onVatRateChange={changeVat}
        vatPlaceholder="เลือก"
        vatInvalid={Boolean(vatIssue)}
        vatNote={vatIssue ? "ต้องเลือก — ไม่มีค่าตั้งต้น (ใบเก่ามีทั้งแบบรวม VAT แล้วและบวก 7% ท้ายใบ)" : null}
        discountNote={discountIssue}
        vatId={historicalFieldAnchorId("vatRate")}
        discountId={historicalFieldAnchorId("discount")}
      />
      {moneyView.ok ? null : <p className={styles.totalsReason}>{moneyView.reason}</p>}

      <p className={styles.registryLine}>
        <MapPin size={14} aria-hidden="true" />
        <span>ไม่เจอไซต์/โซนในช่อง “ไซต์ · โซน”? ทะเบียนไซต์เป็นของฝ่าย TS — แจ้ง TS เพิ่มก่อน แล้วกลับมาเลือก (ห้ามพิมพ์ชื่อจุดเอง)</span>
        <Link href="/database/sites" className="linklike">เปิดทะเบียนไซต์</Link>
      </p>

      <HistoricalBulkZonesModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        sites={sites}
        zonesBySite={zonesBySite}
        siteErrors={siteErrors}
        loading={loading}
        loadError={loadError}
        rows={rows}
        packageOptions={packageOptions}
        productsById={productsById}
        productsError={productsError}
        onAdd={(newRows, productId) => { addBulk(newRows, productId); setBulkOpen(false); }}
      />
    </>
  );
}
