"use client";
// ── ขั้น ② ไซต์ โซน และแพ็ค (ม็อก Step2) ─────────────────────────────────────────
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
import MoneyInput from "@/components/ui/MoneyInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { apiJson } from "@/lib/apiFetch";
import { productSelectOptions } from "@/components/master/productOption";
import { fmtMoney, fmtNumber, NA } from "@/lib/format";
import { lineIsServicePackage } from "@/lib/sales/serviceOrders";
import {
  REGISTRY_LOAD_FAILED, contractSpan, emptyHistoricalZone, historicalMoneyView, historicalZoneBrowser,
  zoneAmountSuggestion, zoneAmountSuggestionNote,
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
  /* ⚠️ `months` เป็น null เมื่อช่วงสัญญา **ไม่ลงตัวเป็นเดือน** (ไม่ใช่ปัดลงอย่างที่เคยเป็น)
     ⇒ ปุ่มลัดยอดโซนกดไม่ได้ และต้องบอกเหตุ ไม่ใช่เสนอยอดที่ขาดไปทั้งเดือน */
  const { months, note: spanNote } = contractSpan(state.contract?.startDate, state.contract?.endDate);

  const rows = useMemo(() => state.zones || [], [state.zones]);
  const rowByZone = useMemo(() => new Map(rows.map((row, index) => [row.zoneId, { row, index }])), [rows]);
  const planLines = plan?.lines || [];
  const liveTermByZone = useMemo(() => {
    const map = new Map();
    for (const term of plan?.liveTerms || []) if (!map.has(term.zoneId)) map.set(term.zoneId, term);
    return map;
  }, [plan]);
  const issueByZone = useMemo(() => {
    const map = new Map();
    for (const issue of issues) {
      const index = Number(String(issue.field || "").split(".")[1]);
      const zoneId = Number.isInteger(index) ? rows[index]?.zoneId : null;
      if (zoneId && !map.has(zoneId)) map.set(zoneId, issue.message);
    }
    return map;
  }, [issues, rows]);

  /* ค้น · ซ่อน · กาง · โซนกำพร้า — ตัวตัดสินอยู่ที่ lib (ดูหัวไฟล์ ③) จอแค่วาดตามที่มันตอบ
     ⚠️ `ready` เท็จระหว่างโหลด/โหลดพัง — ไม่งั้นทุกโซนที่ใบผูกไว้ถูกอ่านว่า "กำพร้า" ชั่วครู่ */
  const browser = useMemo(() => historicalZoneBrowser({
    sites, zonesBySite, siteErrors, query, pickedZoneIds: rows.map((row) => row.zoneId),
    ready: !loading && !loadError,
  }), [sites, zonesBySite, siteErrors, query, rows, loading, loadError]);
  /* ยอดใบ: มีแผนใช้แผน ไม่มีก็คิดจากยอดโซน + โหมด VAT ด้วยตัวเดียวกับ server (รีวิว R7) */
  const moneyView = useMemo(() => money || historicalMoneyView(state, plan), [money, state, plan]);

  const setRows = (next) => onChange({ zones: next });
  const patchRow = (zoneId, patch) => setRows(rows.map((row) => (row.zoneId === zoneId ? { ...row, ...patch } : row)));
  const toggleZone = (zone, site) => {
    if (rowByZone.has(zone.id)) { setRows(rows.filter((row) => row.zoneId !== zone.id)); return; }
    setRows([...rows, emptyHistoricalZone({ zoneId: zone.id, siteId: site.id, productId: state.packageProductId })]);
  };
  const applyPackage = (productId) => onChange({
    packageProductId: productId,
    zones: rows.map((row) => ({ ...row, productId })),
  });
  const suggestInput = (row) => ({
    unitPrice: productsById.get(row.productId)?.costPrice,
    packs: Number(row.packs),
    months,
  });
  const suggestAmount = (row) => {
    const value = zoneAmountSuggestion(suggestInput(row));
    if (value !== null) patchRow(row.zoneId, { lineAmount: String(value) });
  };

  const totalPacks = rows.reduce((sum, row) => sum + (Number(row.packs) || 0), 0);
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
          <small>เลือกแล้วใส่ให้ทุกแถวที่ติ๊กไว้ · แต่ละแถวเปลี่ยนเองได้</small>
        </div>
        <div className={styles.field}>
          <span>ระยะสัญญา</span>
          <p className={styles.derived} data-empty={months ? undefined : "yes"}>
            {months ? `${fmtNumber(months)} เดือน` : (spanNote || "กรอกวันสัญญาในขั้น ① ก่อน")}
          </p>
          <small>
            {months
              ? "ใช้กับปุ่มลัด “ใช้ราคาแพ็คเกจ × แพ็ค × เดือน” ของแต่ละแถว"
              : "ปุ่มลัดยอดต่อโซนกดไม่ได้จนกว่าช่วงสัญญาจะลงตัวเป็นเดือน — ใส่ยอดที่ตกลงกับลูกค้าเองได้เลย"}
          </small>
        </div>
      </div>

      {/* ⭐ ช่องค้นหนึ่งช่องกินทั้ง **รหัสไซต์ · ชื่อไซต์ · ชื่อโซน · รหัสโซน** = ทุกอย่างที่ตาเห็น
          บนแถว (กฎบ้าน search haystack) · autoComplete ปิดตามกฎช่องค้นทั้งระบบ */}
      <div className={styles.grid2}>
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
        <div className={styles.field}>
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
      </div>

      {/* 🪤 โซนที่ติ๊กไว้แล้วแต่ถูกคำค้นซ่อน **ยังถูกนับในยอดรวมท้ายจอ** — ไม่บอก = ยอดลอยมาจากไหนไม่รู้ */}
      {browser.hiddenPicked > 0 ? (
        <p className={styles.hint}>
          คำค้นนี้ซ่อนโซนที่เลือกไว้แล้วอยู่ {fmtNumber(browser.hiddenPicked)} โซน — ยอดรวมท้ายจอยังนับโซนพวกนั้นอยู่
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
        const siteTotal = rows
          .filter((row) => zones.some((zone) => zone.id === row.zoneId))
          .reduce((sum, row) => sum + (Number(row.lineAmount) || 0), 0);
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
                <span>{picked ? fmtMoney(siteTotal) : "ยังไม่เลือกโซนในไซต์นี้"}</span>
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
              <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={880}>
                <table className="w-full text-sm">
                  <thead><tr>
                    <th>โซน</th>
                    <th>แพ็คเกจ</th>
                    <th className="num">แพ็ค</th>
                    <th className="num">รอบในสัญญา</th>
                    <th className="num">ยอด</th>
                  </tr></thead>
                  <tbody>
                    {zones.map((zone) => {
                      const entry = rowByZone.get(zone.id) || null;
                      const row = entry?.row || null;
                      const planLine = entry ? planLines[entry.index] || null : null;
                      const inactive = zone.isActive === false;
                      const warn = liveTermByZone.get(zone.id) || null;
                      const problem = issueByZone.get(zone.id) || null;
                      /* 🐞 รีวิว R9: ทะเบียนสินค้าโหลดไม่ขึ้น ⇒ `unitPrice` เป็น undefined แล้วปุ่มลัด
                         บอกเหตุผิดว่า "แพ็คเกจนี้ไม่มีราคาต่อหน่วยในทะเบียน" ⇒ พูดเหตุจริงก่อน */
                      const blocked = row
                        ? ((productsError && row.productId && !productsById.has(row.productId))
                          ? "ทะเบียนสินค้าโหลดไม่ขึ้น — ยังคิดราคาแพ็คเกจให้ไม่ได้ · ใส่ยอดเอง หรือกด “ลองอ่านทะเบียนอีกครั้ง” ด้านบน"
                          : zoneAmountSuggestionNote({ ...suggestInput(row), monthsPartial: Boolean(spanNote) }))
                        : null;
                      return (
                        <tr key={zone.id}>
                          <td>
                            <label className={styles.addRow}>
                              {/* 🐞 รีวิว R10: `disabled={busy || inactive}` ปิด **การถอนติ๊ก** ของแถว
                                  ที่ใบผูกไว้อยู่แล้วด้วย · ระหว่างนั้น `bindTargetError` ฝั่ง server
                                  ตีกลับโซนที่ปิดใช้งานเสมอ และตัวติ๊กคือทางเดียวที่ถอดแถวออกจากใบได้
                                  ⇒ ใบที่ถูกตีกลับแล้ว TS ปิดโซนระหว่างนั้น แก้ต่อไม่ได้เลย และ
                                    ข้อความ "หรือเลือกโซนอื่น" ทำตามไม่ได้เพราะสลับโซนต้องถอนติ๊กก่อน
                                  ⇒ **ถอนติ๊กได้เสมอ · ติ๊กใหม่ไม่ได้** (จอบริการ IntakeWizard ทำแบบนี้อยู่แล้ว) */}
                              <input
                                type="checkbox"
                                checked={Boolean(row)}
                                disabled={busy || (inactive && !row)}
                                onChange={() => toggleZone(zone, site)}
                                aria-label={`เลือกโซน ${zone.name}`}
                              />
                              <span>{zone.name}</span>
                            </label>
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
                            {problem ? <span className={styles.cellSub}>{problem}</span> : null}
                          </td>
                          <td>
                            {row ? (
                              <SearchableSelect
                                entity="product"
                                ariaLabel={`แพ็คเกจของโซน ${zone.name}`}
                                options={packageOptions}
                                value={row.productId}
                                onChange={(value) => patchRow(zone.id, { productId: value })}
                                disabled={busy}
                                placeholder="เลือกแพ็คเกจ"
                                searchPlaceholder="ค้นหารหัส FG"
                                /* 🐞 รีวิว R9: ช่องนี้ไม่มี emptyText ⇒ ตกไปที่ "ไม่พบรายการ" ของตัวห่อ
                                   ซึ่งอ่านเป็นคำตอบ · และเมื่อทะเบียนโหลดไม่ขึ้น ค่าที่แถวถืออยู่จะเด้ง
                                   กลับเป็น placeholder ทั้งที่ใบยังผูกแพ็คเกจนั้นอยู่ ⇒ บอกทั้งสองอย่าง */
                                emptyText={productsError ? REGISTRY_LOAD_FAILED : undefined}
                              />
                            ) : <span className={styles.muted}>{NA}</span>}
                            {row && productsError && row.productId && !productsById.has(row.productId) ? (
                              <span className={styles.cellSub}>
                                แถวนี้ผูกแพ็คเกจไว้แล้ว ({row.productId}) — ชื่อไม่ขึ้นเพราะทะเบียนสินค้าโหลดไม่สำเร็จ
                              </span>
                            ) : null}
                            {planLine?.fgCode ? <span className={styles.cellSub}>{planLine.fgCode}</span> : null}
                          </td>
                          <td className="num">
                            {row ? (
                              <Input
                                mono type="number" min="1" step="1" autoComplete="off"
                                value={row.packs}
                                disabled={busy}
                                onChange={(event) => patchRow(zone.id, { packs: event.target.value })}
                                aria-label={`แพ็คของโซน ${zone.name}`}
                              />
                            ) : <span className={styles.muted}>{NA}</span>}
                          </td>
                          <td className="num">
                            {row ? (
                              <Input
                                mono type="number" min="1" step="1" autoComplete="off"
                                value={row.rounds}
                                disabled={busy}
                                onChange={(event) => patchRow(zone.id, { rounds: event.target.value })}
                                aria-label={`รอบในสัญญาของโซน ${zone.name}`}
                              />
                            ) : <span className={styles.muted}>{NA}</span>}
                            {row ? <span className={styles.cellSub}>รอบที่ขายไว้ · TS ตั้งวันเอง</span> : null}
                          </td>
                          <td className="num">
                            {row ? (
                              <>
                                <MoneyInput
                                  value={row.lineAmount}
                                  disabled={busy}
                                  onChange={(value) => patchRow(zone.id, { lineAmount: value })}
                                  aria-label={`ยอดของโซน ${zone.name}`}
                                />
                                <span className={styles.cellSub}>ก่อน VAT {planLine ? fmtMoney(planLine.lineTotal) : NA}</span>
                                {/* ⭐ กดไม่ได้ = **โชว์แล้วบอกเหตุ** ไม่ใช่ปุ่มที่กดแล้วเงียบ (กฎบ้าน)
                                    เหตุมาจากตัวตัดสินตัวเดียวกับที่คิดยอด ⇒ ไม่มีทางบอกคนละเรื่องกัน */}
                                <Button
                                  size="sm" variant="quiet"
                                  disabled={busy || Boolean(blocked)}
                                  onClick={() => suggestAmount(row)}
                                  title={blocked || "ราคาแพ็คเกจ × แพ็ค × เดือน"}
                                >
                                  ใช้ราคาแพ็คเกจ × แพ็ค × เดือน
                                </Button>
                                {blocked ? <span className={styles.cellSub}>{blocked}</span> : null}
                              </>
                            ) : <span className={styles.muted}>{NA}</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {zones.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <span className={styles.muted}>
                            {query ? "ไม่มีโซนที่ตรงคำค้นในไซต์นี้" : "ไซต์นี้ยังไม่มีโซนในทะเบียน"}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableScroll>
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
          **ห้ามมีปุ่มถอด** (ของเดิมโชว์ปุ่มถอด ⇒ ผู้คีย์ลบบรรทัดจริงเพราะเน็ตกระตุก) */}
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
            (ยอดรวมท้ายจอยังนับโซนพวกนี้อยู่)
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
          โอนไปลูกค้ารายอื่น · โซนถูกลบ) **ไม่ถูกเรนเดอร์สักแถว** แต่ยังถูกนับในยอดรวมและยังทำให้
          พรีวิวตีกลับ ⇒ ต้องมีปุ่มถอดของตัวเอง ไม่งั้น `state.zones` ลดลงไม่ได้เลยไม่ว่าด้วยเหตุใด */}
      {browser.orphans.length > 0 ? (
        <StatusNotice
          tone="error"
          title={`มี ${fmtNumber(browser.orphans.length)} โซนที่ใบผูกไว้แต่ไม่อยู่ในทะเบียนที่โหลดมา`}
          className={styles.notice}
        >
          <p className={styles.hint}>
            อาจถูกปิดใช้งาน ถูกย้ายไปลูกค้ารายอื่น หรือถูกลบ — ให้ฝ่าย TS เปิด/คืนโซนให้
            หรือถอดออกจากใบนี้ (ยอดรวมท้ายจอยังนับโซนพวกนี้อยู่)
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

      <div className={styles.sumBar}>
        <span className={styles.sumItem}><b>{fmtNumber(rows.length)}</b> โซน</span>
        <span className={styles.sumItem}><b>{fmtNumber(totalPacks)}</b> แพ็ค</span>
        {/* ⭐ ยอดสามช่องนี้เคยขึ้นขีดตลอดรอบคีย์ (แผนคืนมาเฉพาะตอนไม่มี error) — รีวิว R7 */}
        <span className={styles.sumItem}>ยอดก่อน VAT <b>{moneyView.ok ? fmtMoney(moneyView.subtotal) : NA}</b></span>
        <span className={styles.sumItem}>VAT <b>{moneyView.ok ? fmtMoney(moneyView.vatAmount) : NA}</b></span>
        <span className={`${styles.sumItem} ${styles.sumTotal}`}>รวม <b>{moneyView.ok ? fmtMoney(moneyView.totalAmount) : NA}</b></span>
      </div>
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
