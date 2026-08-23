"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import useStickyState from "@/lib/ui/useStickyState";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Ban, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ExternalLink, FileText, Flag, FolderKanban, Handshake, Layers, Paperclip, PackageCheck, Plus, Save, Search, Trash2, Truck, Trophy } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import { useCan, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canSeeDealKpi, hasTeam, isSuperuser, salesDealScopes } from "@/lib/permissions";
import { forecastDueState, forecastReviewWindow } from "@/lib/sales/forecastDue";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { offerDeleteEmptyProject } from "@/lib/sales/emptyProjectCleanup";
import { createClient } from "@/lib/supabaseBrowser";
import { CREATABLE_STAGES, DEAL_TYPES, DEAL_TYPE_LABELS, PIPELINE_STAGES, SALES_FEATURES, STAGE_LABELS, canCreateDeal, dealTypeOf, editableStages, isClosedStage, isWonStage, stageIndex } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, MonthPicker, SCOPE_LABELS, businessLineBadge, dealTypeBadge, forecastBadge, initialDealForm, money, quoteStatusBadge, snapForecastLevel, stageBadge, thisMonth, yearOfMonth } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtName, fmtNumber, naText, NA } from "@/lib/format";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import useDealOwners from "@/lib/sales/useDealOwners";
import { livePersonName } from "@/lib/ui/personName";
import { cachedFetchJson } from "@/lib/apiCache";
import { brandDisplayFromList, brandThList } from "@/lib/master/brands";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import { dealValueItemsToForm } from "@/lib/sales/dealValueItems";
import DealCreateModal from "@/components/salesPlanning/DealCreateModal";
import MenuSelect from "@/components/ui/MenuSelect";
import Segmented from "@/components/ui/Segmented";
import MyTeamsFilter from "@/components/ui/MyTeamsFilter";
import useMyTeamsFilter from "@/lib/useMyTeamsFilter";
import Button from "@/components/ui/Button";
import ForecastMonthCell from "@/components/salesPlanning/ForecastMonthCell";
import StageCell from "@/components/salesPlanning/StageCell";
import ForecastReviewBanner from "@/components/salesPlanning/ForecastReviewBanner";
import FilterPopover from "@/components/ui/FilterPopover";
import DetailRow from "@/components/ui/DetailRow";
import RecordActionMenu from "@/components/ui/RecordActionMenu";
import { canDeleteDeal, createDealLifecycle, DEAL_PATCH_TRANSITIONS } from "@/lib/sales/dealLifecycle";
import ReadableText from "@/components/ui/ReadableText";
import QuotationWonDialog from "@/components/salesPlanning/QuotationWonDialog";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import Textarea from "@/components/ui/Textarea";
import { businessDate } from "@/lib/businessDate";
import { customerArIndex, customerSearchText } from "@/lib/master/customerAr";

/* มูลค่าที่ขึ้นจอของดีลหนึ่งใบ — Won ใช้ยอดปิดจริง นอกนั้นใช้ยอดคาดการณ์
   (กติกาเดียวกับคอลัมน์มูลค่าและ KPI — ยอดรวมหัวกลุ่มต้องบวกจากเลขเดียวกับในแถว) */
const dealValue = (deal) => Number((isWonStage(deal.stage) ? deal.wonValue ?? deal.projectValue : deal.projectValue) || 0);

/* 🪤 ค่าตั้งต้นของตัวกรองต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าที่ไหนก็ตามคิดว่า
   "เปลี่ยนแล้ว" ตลอดเวลา */
const EMPTY = [];

export default function SalesPlanningPipelinePage() {
  const canEdit = useCan("salesplan:edit");
  const role = useRole();
  const superuser = isSuperuser(role);
  // สร้างดีลได้เฉพาะ AE / Senior AE (+ superuser กำกับดูแล) — AC เปิดดีลไม่ได้ (มติผู้ใช้)
  /* ⚠️ ใช้ตัวเดียวกับที่ API บังคับ ห้ามคำนวณเอง — ของเดิมเขียนรายชื่อ role ซ้ำไว้ที่นี่
     แล้วตกรุ่นทันทีที่กติกาเปลี่ยน (AC ถูกเพิ่มเข้ามา 2026-08-05 แต่ปุ่มยังไม่โผล่) */
  const canCreateDeals = canCreateDeal({ role });
  // ตัวกรองทั้งหมดอยู่ใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ทุกหมวด multi-select, ว่าง = ทั้งหมด. "รอเติมข้อมูล" เดิมมี state แต่ไม่มีปุ่มให้กด
  // (กรองไม่ได้จริง) — ย้ายมาเป็นหมวดหนึ่งในแผงนี้
  /* ตัวกรอง "เดือน FC" (มติผู้ใช้ 2026-08-05) — ทางเดียวที่จะหาใบที่ต้องเลื่อนเจอ
     โดยไม่ต้องเปิดทีละใบ · เกณฑ์มาจาก forecastDueState ตัวเดียวกับป้ายในแถว */
  const [dueFilter, setDueFilter] = useStickyState("dueFilter", EMPTY);
  const [stageFilter, setStageFilter] = useStickyState("stageFilter", EMPTY);
  const [typeFilter, setTypeFilter] = useStickyState("typeFilter", EMPTY); // ประเภทดีล SCENT/NPD/RE-ORDER
  const [reviewFilter, setReviewFilter] = useStickyState("reviewFilter", EMPTY);
  const reviewOnly = reviewFilter.includes("needsReview");
  const [month, setMonth] = useStickyState("month", thisMonth());
  const [allMonths, setAllMonths] = useStickyState("allMonths", true);
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  /* ⭐ รหัสลูกค้า (AR) คู่ชื่อกิจการ (มติผู้ใช้ IS-26080003) — ตัวเชื่อมกับรหัสกลิ่น/MU
     ⚠️ อ่านสดจากทะเบียนเสมอ ไม่ใช่ค่าที่ดีลประทับไว้ — `customerName` บนดีลคือชื่อ ณ วันที่
     ผูก (หลักฐาน) ส่วนรหัสเป็นตัวชี้กลับทะเบียน ต้องเป็นค่าปัจจุบัน */
  const arIndex = useMemo(() => customerArIndex(customers), [customers]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useStickyState("query", "");
  const [sortKey, setSortKey] = useStickyState("sortKey", "created");
  const [sortDir, setSortDir] = useStickyState("sortDir", "desc");
  /* จัดกลุ่มรายการดีล (มติผู้ใช้ 2026-08-08) — ดูภาพรวมเป็นก้อนต่อลูกค้า/โครงการ/แบรนด์/AE
     แล้วกดย่อ-ขยายทีละกลุ่มได้ · ตัวเลือกน้อยจึงเป็น Segmented ไม่ใช่ dropdown (มาตรฐานระบบ) */
  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  // มุมมอง KPI: ของฉัน/ทีม/ทั้งหมด — PR #275 ใช้ตัวแปรพวกนี้แต่ไม่ได้ประกาศ (หน้า crash)
  const team = useTeam();
  const teams = useTeams();
  /* ⚠️ ตั้งต้นที่ขอบเขต **กว้างสุด** ไม่ใช่ "ของฉัน" — เดิมตั้งต้นที่ตัวแรกของลิสต์
     ซึ่งคือ mine เสมอ ⇒ แอดมิน/หัวหน้าฝ่ายที่ไม่ได้เป็นเจ้าของดีลสักใบ เปิดหน้ามาเจอ
     KPI เป็น 0 ทุกช่องทั้งที่ตารางข้างล่างมีดีลเต็มไปหมด (null = ยังไม่ได้เลือกเอง) */
  /* วันนี้ — จับใน effect ตามกฎ react-hooks/purity (ห้ามอ่านนาฬิการะหว่าง render)
     ใช้ตัดสิน "FC เลยกำหนด" และนับถอยหลังก่อนขึ้นเดือนใหม่ */
  const [today, setToday] = useState(null);
  useEffect(() => { setToday(businessDate()); }, []);
  const currentMonth = today ? today.slice(0, 7) : null;
  const reviewWindow = forecastReviewWindow(today);

  const [scope, setScope] = useStickyState("scope", null);
  const [meId, setMeId] = useState(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setMeId(user?.id || null)).catch(() => {});
  }, []);
  const me = useMemo(() => ({ id: meId, team, teams }), [meId, team, teams]);
  // อยู่หลายทีม → เลือกได้ว่าขอบเขต "ทีม" จะรวมทีมไหนบ้าง
  const teamFilter = useMyTeamsFilter();
  const viewer = useMemo(() => ({ role, id: meId, team, teams }), [role, meId, team, teams]);
  /* กติกา "ดีลใบนี้ทำอะไรได้บ้าง" มาจากไฟล์เดียวกับที่หน้ารายละเอียดจะใช้ —
     ของเดิมหน้านี้เช็คเงื่อนไขเองในแต่ละปุ่ม แล้วหลวมกว่า API อยู่ 3 จุด */
  /* ผู้รับผิดชอบ (AE) — กติกา "เฉพาะทีมตัวเอง" อยู่ใน hook ที่เดียว (3 หน้าใช้ร่วมกัน) */
  const { owners, defaultOwnerId, lockedOwner } = useDealOwners(meId);

  const dealLc = useMemo(() => createDealLifecycle(), []);

  const SORT_OPTIONS = [
    { key: "created", label: "อัปเดตล่าสุด" },
    { key: "name", label: "ชื่อดีล" },
    { key: "status", label: "สถานะ" },
    { key: "amount", label: "มูลค่า" },
  ];

  const GROUP_OPTIONS = [
    { value: "none", label: "ไม่จัดกลุ่ม" },
    { value: "customer", label: "ลูกค้า" },
    { value: "project", label: "โครงการ" },
    { value: "brand", label: "แบรนด์" },
    { value: "owner", label: "AE" },
  ];

  // ทิศตั้งต้นต่อคีย์: ตัวหนังสือ/สถานะอ่าน ก→ฮ (asc), วันที่/มูลค่าเอาใหม่/มากก่อน (desc)
  const defaultDir = (key) => (key === "name" || key === "status" ? "asc" : "desc");
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(defaultDir(key)); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;

  const [dealModal, setDealModal] = useState(false);
  const [dealForm, setDealForm] = useState({ ...initialDealForm });
  const [createModal, setCreateModal] = useState(false); // โมดัลสร้างดีล (ตัวกลาง ใช้ร่วมกับฝั่งลีด)
  const [submitting, setSubmitting] = useState(false);
  const [quoteModal, setQuoteModal] = useState(false);
  const [quoteDeal, setQuoteDeal] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [wonQuote, setWonQuote] = useState(null); // ใบที่กำลังยืนยัน Won (เปิดฟอร์มหลักฐาน)
  const [docModal, setDocModal] = useState(false);
  const [docDeal, setDocDeal] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [dashTotals, setDashTotals] = useState({});
  const [dashTargetRows, setDashTargetRows] = useState(0);
  const [docLoading, setDocLoading] = useState(false);
  const [docForm, setDocForm] = useState({ kind: "customer_brief", title: "", status: "pending", dueDate: "", notes: "" });
  const [shippingDealId, setShippingDealId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dealsRes, customersRes, projectsRes] = await Promise.all([
        /* ตัวกรอง "รอเติมข้อมูล" ต้องดึงทุกเดือนจริง ๆ (deal backfill มี forecastMonth=null
           จึงตกทุกช่วงที่กรอง) — ต่างจากติ๊ก "ทุกเดือน" ที่แปลว่า *ทุกเดือนของปีที่เลือก*
           เดิมสองอย่างนี้ยิง URL เดียวกัน = ติ๊กทุกเดือนแล้วได้ดีลทุกปีมาปนกัน */
        fetch(reviewOnly
          ? "/api/sales-planning/deals"
          : allMonths
            ? `/api/sales-planning/deals?year=${encodeURIComponent(yearOfMonth(month) || "")}`
            : `/api/sales-planning/deals?month=${encodeURIComponent(month)}`),
        fetch("/api/master/customers"),
        fetch("/api/pm/projects"),
      ]);
      if (!dealsRes.ok) {
        const txt = await dealsRes.text();
        let errStr = "โหลดดีลไม่สำเร็จ";
        try { if(txt) errStr = JSON.parse(txt).error || errStr; } catch(e){}
        throw new Error(errStr);
      }
      const dTxt = await dealsRes.text();
      try { setDeals(dTxt ? JSON.parse(dTxt) : []); } catch(e) { setDeals([]); }
      let custData = [];
      if (customersRes.ok) {
        const txt = await customersRes.text();
        try { if(txt) custData = JSON.parse(txt); } catch(e){}
      }
      setCustomers(custData);
      setProjects(projectsRes.ok ? await projectsRes.json() : []);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month, allMonths, reviewOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // หมวดสินค้าให้ฟอร์มดีล (สร้าง/แก้) — โหลดครั้งเดียว
  // (โมดัลสร้างโครงการเคยอยู่หน้านี้แบบไม่มีปุ่มเรียก — ถอดทิ้งแล้ว ตัวจริงอยู่หน้าดีลรายใบ)
  useEffect(() => {
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
  }, []);

  /* ชื่อเจ้าของดีลที่ควรขึ้นจอ — `ownerName` ในแถวเป็นสำเนา ณ ตอนบันทึก ซึ่งไม่ขยับ
     ตอนเจ้าตัวเปลี่ยนชื่อ · ดีลทุกใบมี `ownerId` ครบ จึงอ่านจาก id ได้เสมอ */
  const directory = usePeopleDirectory();
  const ownerNameOf = useCallback(
    (deal) => livePersonName(directory, deal?.ownerId, deal?.ownerName),
    [directory],
  );

  const allowedScopes = salesDealScopes(role);
  const activeScope = scope && allowedScopes.includes(scope) ? scope : allowedScopes[allowedScopes.length - 1];

  /* 🐞 ตัวสลับขอบเขตเคยกรองแค่ตัวเลข KPI — ตารางข้างล่างไม่ขยับเลย ผู้ใช้กด "ของฉัน"
     แล้วเห็นตัวเลขเปลี่ยนแต่รายการเท่าเดิม อ่านไม่ออกว่าปุ่มทำอะไรกันแน่
     ตอนนี้ทั้ง KPI และตารางใช้ตัวเดียวกัน (กติกาเดียวกับคิวลีด) */
  const inScopeDeal = useCallback((deal) => {
    if (activeScope === "mine") return !!me?.id && deal.ownerId === me.id;
    // "ทีมของฉัน" = ทุกทีมที่ฉันสังกัด — คนอยู่หลายทีมได้ ถ้าเทียบทีมหลักตัวเดียว
    // ดีลของอีกทีมจะหายจากตารางทั้งที่สิทธิ์ฝั่ง API เปิดให้เห็น
    if (activeScope === "team") return hasTeam(me, deal.team) && teamFilter.matches(deal.team);
    return true;
  }, [activeScope, me, teamFilter]);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = deals.filter((deal) => {
      if (!inScopeDeal(deal)) return false;
      if (dueFilter.length) {
        const due = forecastDueState(deal, currentMonth);
        const key = due.overdue ? "overdue" : (due.missing ? "missing" : "ontime");
        if (!dueFilter.includes(key)) return false;
      }
      if (reviewOnly && !deal.metadata?.needsReview) return false;
      if (stageFilter.length && !stageFilter.includes(deal.stage)) return false;
      if (typeFilter.length && !typeFilter.includes(dealTypeOf(deal))) return false;
      if (!q) return true;
      return [
        deal.title, customerSearchText(deal.customerId, deal.customerName, arIndex),
        ownerNameOf(deal), deal.notes, deal.formulaName,
      ].some((v) => (v || "").toLowerCase().includes(q));
    });

    const mul = sortDir === "desc" ? -1 : 1;
    return result.sort((a, b) => {
      if (sortKey === "name") return (a.title || "").localeCompare(b.title || "", "th") * mul;
      // เดิมเขียน `indexOf(...) || 99` ซึ่งพังกับ 'lead' โดยเฉพาะ: indexOf คืน 0 แล้ว
      // `0 || 99` = 99 → เรียงตามสถานะทีไร ลีดตกไปท้ายสุดแทนที่จะขึ้นหัว
      const rank = (s) => { const i = stageIndex(s); return i < 0 ? 99 : i; };
      if (sortKey === "status") return (rank(a.stage) - rank(b.stage)) * mul;
      if (sortKey === "amount") {
        const valA = isWonStage(a.stage) ? (a.wonValue ?? a.projectValue ?? 0) : (a.projectValue ?? 0);
        const valB = isWonStage(b.stage) ? (b.wonValue ?? b.projectValue ?? 0) : (b.projectValue ?? 0);
        return (valA - valB) * mul;
      }
      // asc = เก่า→ใหม่ ให้ desc (ค่าตั้งต้น) โชว์ล่าสุดก่อน — เดิมกลับทิศ ทำให้เปิดหน้ามาเจอดีลเก่าสุด
      return ((a.updatedAt || a.createdAt || "") < (b.updatedAt || b.createdAt || "") ? -1 : 1) * mul;
    });
  }, [deals, query, inScopeDeal, dueFilter, currentMonth, stageFilter, typeFilter, reviewOnly, sortKey, sortDir, ownerNameOf]);

  /* จับกลุ่มจากรายการที่กรอง+เรียงแล้ว (ลำดับในกลุ่ม = ลำดับที่ผู้ใช้เลือกเรียงไว้)
     · กุญแจกลุ่มใช้ id ก่อน (กันชื่อซ้ำ) — แบรนด์เป็นข้อความอิสระจึง normalize ตัวพิมพ์
     · กลุ่ม "ไม่ระบุ" ไปท้ายเสมอ · เรียงกลุ่ม: เรียงตามชื่อเมื่อผู้ใช้เรียงตามชื่อดีล
       นอกนั้นเอามูลค่ารวมมากก่อน (คนขายอยากเห็นก้อนใหญ่ก่อน) */
  const groupedDeals = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map();
    for (const deal of filteredDeals) {
      let key; let label; let sub = null;
      if (groupBy === "customer") {
        key = deal.customerId || (deal.customerName || "").trim().toLocaleLowerCase("th-TH") || "__none";
        label = deal.customerName || "ไม่ระบุลูกค้า";
        // ⚠️ รหัสไม่ใช่ส่วนหนึ่งของกุญแจ — ดีลเก่าที่ผูกก่อนออกรหัสต้องยังรวมกลุ่มเดียวกัน
        sub = deal.customerId ? arIndex.get(deal.customerId) || null : null;
      } else if (groupBy === "project") {
        key = deal.projectId || "__none";
        label = deal.projectId
          ? (projects.find((p) => p.id === deal.projectId)?.name || deal.title || "โครงการ")
          : "ไม่ผูกโครงการ";
      } else if (groupBy === "brand") {
        const raw = String(deal.metadata?.brand || "").trim();
        key = raw ? raw.toLocaleLowerCase("th-TH") : "__none";
        label = raw
          ? brandDisplayFromList(customers.find((c) => c.id === deal.customerId)?.brands, raw)
          : "ไม่ระบุแบรนด์";
      } else {
        key = deal.ownerId || deal.team || "__none";
        label = ownerNameOf(deal) ? fmtName(ownerNameOf(deal)) : (deal.team || "ไม่ระบุผู้ดูแล");
      }
      const group = map.get(key) || { key, label, sub, deals: [], total: 0, missing: key === "__none" };
      // ดีลใบแรกของกลุ่มอาจผูกก่อนออกรหัส — เอาค่าแรกที่มีจริง
      if (!group.sub && sub) group.sub = sub;
      group.deals.push(deal);
      group.total += dealValue(deal);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => {
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      if (sortKey === "name") return a.label.localeCompare(b.label, "th");
      return (b.total - a.total) || a.label.localeCompare(b.label, "th");
    });
  }, [groupBy, filteredDeals, projects, customers, ownerNameOf, sortKey]);

  const allCollapsed = !!groupedDeals?.length && groupedDeals.every((g) => collapsedGroups.has(g.key));
  const toggleGroup = (key) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const reviewCount = useMemo(() => deals.filter((d) => d.metadata?.needsReview).length, [deals]);

  /* นับจาก **ดีลที่ผู้ใช้เห็นตามขอบเขตที่เลือก** ไม่ใช่ทั้งตาราง — แถบเตือนบอกว่า
     "ของคุณค้างกี่ใบ" ไม่ใช่ยอดทั้งบริษัทที่เขาทำอะไรไม่ได้ */
  const dueCounts = useMemo(() => {
    const c = { overdue: 0, missing: 0, ontime: 0 };
    for (const deal of deals.filter(inScopeDeal)) {
      const due = forecastDueState(deal, currentMonth);
      c[due.overdue ? "overdue" : (due.missing ? "missing" : "ontime")] += 1;
    }
    return c;
  }, [deals, inScopeDeal, currentMonth]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filteredDeals, {
      resetKey: `${query}|${stageFilter.join()}|${typeFilter.join()}|${reviewOnly}|${sortKey}|${sortDir}|${month}|${allMonths}|${groupBy}`,
    });

  const openNewDeal = () => setCreateModal(true);

  /* async: แถวในตารางไม่มีรายการมูลค่ารายหมวดติดมาด้วย (mig 0264 — ลิสต์ทั้งหน้า
     ไม่ควรลากลูกของทุกใบมา) ⇒ เปิดฟอร์มแก้ = อ่านใบเดียวก่อนหนึ่งครั้ง
     ⚠️ อ่านไม่สำเร็จ = เปิดฟอร์มด้วยรายการว่าง ซึ่งกดบันทึกแล้วจะ **ล้างแถวเดิมทิ้ง**
     จึงต้องไม่เปิดฟอร์มเลย ให้ผู้ใช้ลองใหม่แทน */
  const openEditDeal = async (deal) => {
    let valueItems = [];
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}`);
      if (!res.ok) throw new Error();
      valueItems = dealValueItemsToForm((await res.json()).valueItems || []);
    } catch {
      setError("โหลดรายการมูลค่าคาดการณ์ของดีลนี้ไม่สำเร็จ — ลองใหม่อีกครั้ง");
      return;
    }
    setDealForm({
      id: deal.id,
      title: deal.title || "",
      customerId: deal.customerId || "",
      customerName: deal.customerName || "",
      stage: deal.stage || "lead",
      dealType: dealTypeOf(deal),
      formulaName: deal.formulaName || "",
      valueItems,
      brand: deal.metadata?.brand || "",
      projectValue: deal.projectValue ?? "",
      wonValue: deal.wonValue ?? "",
      probability: snapForecastLevel(deal.probability),
      expectedCloseDate: deal.expectedCloseDate || "",
      startDate: deal.startDate || "",
      endDate: deal.endDate || "",
      notes: deal.notes || "",
      projectId: deal.projectId || "",
      lockedProjectId: deal.projectId || "",
      // สายธุรกิจของดีล (mig 0275) — ต้องโหลดมาด้วย ไม่งั้นฟอร์มแก้ส่งค่าว่างไปทับ
      line: deal.line || "",
      // ต้องโหลดมาด้วย ไม่งั้นช่องว่างจะถูกส่งไปทับเจ้าของเดิมตอนกดบันทึก
      ownerId: deal.ownerId || "",
      // ทีมปัจจุบันของดีล — เจ้าของที่อยู่หลายทีมย้ายใบนี้ระหว่างทีมตัวเองได้จากช่องนี้
      team: deal.team || "",
    });
    setDealModal(true);
  };

  const saveDeal = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const selectedCustomer = customers.find((c) => c.id === dealForm.customerId);
    const payload = { ...dealForm, customerName: selectedCustomer?.name || dealForm.customerName || null };
    try {
      const res = await fetch(dealForm.id ? `/api/sales-planning/deals/${dealForm.id}` : "/api/sales-planning/deals", {
        method: dealForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const savedDeal = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(savedDeal.error || "บันทึกดีลไม่สำเร็จ");
      if (dealForm.projectId && !dealForm.lockedProjectId) {
        const linkRes = await fetch(`/api/sales-planning/deals/${savedDeal.id || dealForm.id}/link-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: dealForm.projectId, startDate: dealForm.startDate || undefined }),
        });
        if (!linkRes.ok) throw new Error((await linkRes.json().catch(() => ({}))).error || "บันทึกดีลแล้ว แต่เชื่อมโครงการไม่สำเร็จ");
      }
      setDealModal(false);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึกดีลไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDeal = async (deal) => {
    // เฟส B: ลบดีล "ไม่ลบโครงการ PM" ที่ผูกอยู่ — โครงการมีได้หลายดีลและอาจมีดีลอื่น
    // มาผูกแทน; ลบดีลแค่ถอดงานของดีลนี้ออก โครงการยังอยู่ (ลบเองที่หน้าโครงการ)
    const withPm = deal.projectId ? "\n\nโครงการ (PM) ที่ผูกอยู่จะยังอยู่ (ไม่ถูกลบ) — ถอดเฉพาะงานของดีลนี้ออก" : "";
    if (!(await confirmAction(`ลบดีล "${deal.title}"?${withPm}\n\nงานที่ผูกดีลนี้จะถูกลบไปด้วย\n\nการลบนี้ย้อนกลับไม่ได้`))) return;
    setError("");
    try {
      // admin: ถ้าถูกบล็อกด้วยกฎธุรกิจ จะได้พรีวิว + ถามยืนยันบังคับลบต่อ
      const result = await deleteWithForce(`/api/sales-planning/deals/${deal.id}`, { isAdmin: role === "admin" });
      if (!result.ok) return;
      // ดีลใบสุดท้ายของโครงการ → ถามว่าจะลบโครงเปล่าทิ้งด้วยไหม (ไม่ตัดสินใจแทน)
      const cleanup = await offerDeleteEmptyProject(result.data?.emptyProject);
      if (cleanup.error) setError(`ลบดีลแล้ว แต่${cleanup.error}`);
      await load();
    } catch (e) {
      setError(e.message || "ลบดีลไม่สำเร็จ");
    }
  };

  const loadQuotations = async (deal) => {
    setQuoteLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}/quotations`);
      if (!res.ok) throw new Error((await res.json()).error || "โหลด quotation ไม่สำเร็จ");
      setQuotations(await res.json());
    } catch (e) {
      setError(e.message || "โหลด quotation ไม่สำเร็จ");
    } finally {
      setQuoteLoading(false);
    }
  };

  const openQuotations = async (deal) => {
    setQuoteDeal(deal);
    setQuotations([]);
    setQuoteModal(true);
    await loadQuotations(deal);
  };

  const createQuotation = async () => {
    if (!quoteDeal) return;
    setQuoteLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${quoteDeal.id}/quotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || "สร้าง quotation ไม่สำเร็จ");
      await loadQuotations(quoteDeal);
      await load();
    } catch (e) {
      setError(e.message || "สร้าง quotation ไม่สำเร็จ");
    } finally {
      setQuoteLoading(false);
    }
  };

  // เปิดฟอร์มหลักฐาน Won (บังคับแนบสลิป/PO/เอกสารยืนยันสั่งซื้อ + วันที่เอกสาร)
  const acceptQuotation = (quote) => setWonQuote(quote);

  // ส่งต่อคลัง: สร้างเอกสารเตรียมส่งของจากโครงการที่ผูกกับ Sales Planning (idempotent ฝั่ง PM)
  // แล้วเปิดหน้า PM shipment-prep เพื่อดู/พิมพ์ ส่งให้คลังดำเนินการ.
  const createShipmentPrep = async (deal) => {
    if (!deal.projectId) return;
    if (!(await confirmAction(`สร้างเอกสารเตรียมส่งของจากโครงการ "${deal.title}"?`))) return;
    setShippingDealId(deal.id);
    setError("");
    try {
      const res = await fetch(`/api/pm/projects/${deal.projectId}/shipment-prep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "สร้างเอกสารส่งของไม่สำเร็จ");
      window.open(`/sa/projects/${deal.projectId}/shipment-prep`, "_blank", "noopener");
    } catch (e) {
      setError(e.message || "สร้างเอกสารส่งของไม่สำเร็จ");
    } finally {
      setShippingDealId(null);
    }
  };

  const loadDocuments = async (deal) => {
    setDocLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/documents?dealId=${encodeURIComponent(deal.id)}`);
      if (!res.ok) throw new Error((await res.json()).error || "load documents failed");
      setDocuments(await res.json());
    } catch (e) {
      setError(e.message || "load documents failed");
    } finally {
      setDocLoading(false);
    }
  };

  const openDocuments = async (deal) => {
    setDocDeal(deal);
    setDocuments([]);
    setDocForm({ kind: "customer_brief", title: "", status: "pending", dueDate: "", notes: "" });
    setDocModal(true);
    await loadDocuments(deal);
  };

  /* ทางไปหน้าอื่นของแถว — ย้ายจาก 4 คอลัมน์เดิมเข้าเมนู "…"
     ที่เป็นลิงก์ใช้ `href` ไม่ใช่ onClick+router.push เพื่อให้เปิดแท็บใหม่/คัดลอกลิงก์ได้ */
  const rowLinks = (deal) => [
    { id: "timeline", label: "ไทม์ไลน์", icon: PackageCheck, href: `/sa/deals/${deal.id}?tab=timeline` },
    {
      id: "quotations", label: "ใบเสนอราคา", icon: FileText,
      href: `/sa/deals/${deal.id}?tab=quotations`, visible: SALES_FEATURES.quotations,
    },
    {
      id: "project", label: "เปิดโครงการที่ผูกไว้", icon: FolderKanban,
      href: deal.projectId ? `/sa/projects/${deal.projectId}` : undefined, visible: !!deal.projectId,
    },
    {
      id: "documents", label: "เอกสาร", icon: Paperclip,
      visible: SALES_FEATURES.documents, onClick: () => openDocuments(deal),
    },
    {
      id: "shipment", label: "เตรียมส่งของ", icon: Truck,
      visible: SALES_FEATURES.shipment && !!deal.projectId && !!deal.canEdit,
      disabled: shippingDealId === deal.id,
      onClick: () => createShipmentPrep(deal),
    },
  ];

  /* transition ที่ยิง PATCH ตรง ๆ — ตอนนี้มีแค่ "ไม่ไปต่อ" (ดู DEAL_PATCH_TRANSITIONS)
     คืน false = ไม่สำเร็จ เมนูจะค้างกล่องไว้พร้อมเหตุผลที่พิมพ์ไปแล้ว */
  const runDealTransition = async (deal, actionId, values) => {
    if (!DEAL_PATCH_TRANSITIONS.includes(actionId)) return false;
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "lost", lostReason: values.reason?.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ปิดดีลไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "ปิดดีลไม่สำเร็จ");
      return false;
    }
  };

  const createDocument = async (e) => {
    e.preventDefault();
    if (!docDeal) return;
    setDocLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...docForm, dealId: docDeal.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "create document failed");
      setDocForm({ kind: "customer_brief", title: "", status: "pending", dueDate: "", notes: "" });
      await loadDocuments(docDeal);
    } catch (e2) {
      setError(e2.message || "create document failed");
    } finally {
      setDocLoading(false);
    }
  };

  const updateDocumentStatus = async (doc, status) => {
    setDocLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "update document failed");
      await loadDocuments(docDeal);
    } catch (e) {
      setError(e.message || "update document failed");
    } finally {
      setDocLoading(false);
    }
  };

  const deleteDocument = async (doc) => {
    if (!(await confirmAction(`Delete "${doc.title}"?`))) return;
    setDocLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "delete document failed");
      await loadDocuments(docDeal);
    } catch (e) {
      setError(e.message || "delete document failed");
    } finally {
      setDocLoading(false);
    }
  };

  const money = (value) => fmtMoney(value);
  const pctFmt = (value) => (value == null ? "–" : `${fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

  /* แถวดีลหนึ่งแถว — ใช้ร่วมกันทั้งโหมดตารางปกติ (แบ่งหน้า) และโหมดจัดกลุ่ม
     ต้องเป็นตัวเดียวกันเสมอ ไม่งั้นสองโหมดจะเพี้ยนหากันแบบเดียวกับฟอร์มสร้าง/แก้ */
  const dealRow = (deal) => (
    <DetailRow key={deal.id} href={`/sa/deals/${deal.id}`} className="premium-row">
      <td>
        {/* prefetch={false} ทั้งลิงก์ในแถว: ลิสต์ยาว ๆ เคยยิง RSC prefetch
            ของ /sa/deals/[id] เป็นพันครั้ง/วัน (แถวละ 3 ลิงก์ × ทุกแถวที่เห็น) */}
        <Link prefetch={false} href={`/sa/deals/${deal.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้ารายละเอียดดีล">
          <strong>
            {deal.title}
            {deal.forecastDrift?.hasDrift && (
              <AlertTriangle size={13} aria-label="FC ล่าสุดเปลี่ยนจากตอน map" title={`FC รอบ #${deal.forecastDrift.latestRoundNo} เปลี่ยนจากตอนสร้างโครงการ`} style={{ color: "var(--amber)", marginLeft: 6, verticalAlign: "-1px" }} />
            )}
          </strong>
          <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
            {/* AR บน · ชื่อล่าง (มติผู้ใช้ 2026-08-12 — ทรงเดียวทุกตาราง QT/SO/ดีล)
                แบรนด์ยังเกาะท้ายชื่อเหมือนเดิม */}
            {deal.customerId && arIndex.get(deal.customerId) ? <span className="ar-code ar-code-block">{arIndex.get(deal.customerId)}</span> : null}
            {naText(deal.customerName)}{deal.metadata?.brand ? ` · ${brandDisplayFromList(customers.find((c) => c.id === deal.customerId)?.brands, deal.metadata.brand)}` : ""}
          </span>
        </Link>
      </td>
      <td onClick={(event) => event.stopPropagation()}>
        <StageCell
          deal={deal}
          canEdit={!!deal.canEdit}
          className="ui-badge-cell ui-badge-w-stage"
          onSaved={load}
        />
      </td>
      <td className="step-cell">
        {/* ขั้นตอนปัจจุบันตามไทม์ไลน์ (มติผู้ใช้ 2026-08-08): บรรทัดบน = เลข n/รวม
            บรรทัดล่าง = ชื่อขั้นตอน · คลิกไปแท็บไทม์ไลน์ของดีลตรง ๆ
            สไตล์อยู่ที่ .step-cell-* ใน globals.css — ห้ามกลับมาเขียน inline (เพดาน audit) */}
        {deal.timelineStep ? (
          <Link
            prefetch={false}
            href={`/sa/deals/${deal.id}?tab=timeline`}
            className={`linklike step-cell-link${deal.timelineStep.current ? "" : " step-cell-done"}`}
            title="เปิดไทม์ไลน์ดีล"
          >
            <span className="mono step-cell-num">
              {deal.timelineStep.current || deal.timelineStep.total}/{deal.timelineStep.total}
            </span>
            <span className="step-cell-name">
              {deal.timelineStep.current ? deal.timelineStep.name : "เสร็จครบทุกขั้น"}
            </span>
          </Link>
        ) : (
          <span className="step-cell-empty">{NA}</span>
        )}
      </td>
      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
        {isClosedStage(deal.stage)
          ? <span style={{ color: "var(--text-3)" }}>{NA}</span>
          : forecastBadge(deal.probability, "ui-badge-cell ui-badge-w-fc")}
      </td>
      {/* สาย + ชนิดงานอยู่ช่องเดียวกัน: อ่านคู่กันเสมอ (สายบอกว่าเส้นทางจบยังไง
          ชนิดงานบอกว่าใบนี้เติมช่วงไหน) — ดีลเก่าที่ยังไม่มีสายไม่ขึ้นป้ายสาย */}
      <td style={{ textAlign: "center" }}>
        {businessLineBadge(deal.line, "ui-badge-cell")}
        {dealTypeBadge(dealTypeOf(deal), "ui-badge-cell ui-badge-w-deal-type")}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>{ownerNameOf(deal) ? fmtName(ownerNameOf(deal)) : (naText(deal.team))}</td>
      <td onClick={(event) => event.stopPropagation()}>
        <ForecastMonthCell
          deal={deal}
          currentMonth={currentMonth}
          canEdit={deal.canEdit && !isClosedStage(deal.stage)}
          onSaved={load}
        />
      </td>
      <td className="num mono" style={{ whiteSpace: "nowrap" }} title={isWonStage(deal.stage) ? "มูลค่าปิดจริง (Won)" : "มูลค่าคาดการณ์"}>
        {fmtMoney(dealValue(deal))}
      </td>
      <td className="num" onClick={(event) => event.stopPropagation()}>
        {/* ก้าวถัดไป 1 ปุ่ม + เมนู "…" รวมที่เหลือ (มติผู้ใช้ 2026-08-01)
            ของเดิมกระจาย 8 ปุ่มใน 5 คอลัมน์ · กติกาว่าปุ่มไหนโผล่มาจาก
            dealLifecycle ตัวเดียวกับที่หน้ารายละเอียดจะใช้ */}
        <RecordActionMenu
          lifecycle={dealLc}
          record={deal}
          user={viewer}
          busy={shippingDealId === deal.id}
          recordLabel={deal.title}
          onSelect={(transition) => {
            /* ทั้งผูกและสร้างโครงการลงมือที่ฟอร์มแก้ไขดีล (ต้องเลือกโครงการ)
               ไม่ใช่ยิง /transition — ดักก่อนการ์ดเปิดกล่องยืนยันเปล่า ๆ */
            if (!["link_project", "create_project"].includes(transition.id)) return false;
            openEditDeal(deal);
            return true;
          }}
          onTransition={(actionId, values) => runDealTransition(deal, actionId, values)}
          canEdit={!!deal.canEdit}
          canDelete={canDeleteDeal(deal, { role, superuser })}
          onEdit={() => openEditDeal(deal)}
          onDelete={() => deleteDeal(deal)}
          extraItems={rowLinks(deal)}
        />
      </td>
    </DetailRow>
  );

  const headerRight = (
    <>
      <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />

      {canCreateDeals && (
        <button type="button" className="btn btn-accent" onClick={openNewDeal}>
          <Plus size={15} aria-hidden="true" /> เพิ่มดีล
        </button>
      )}
    </>
  );



  // Calculate KPIs
  // ⭐ ขอบเขตเดียวกับที่ตารางใช้ (inScopeDeal) — เดิม KPI กับตารางแยกกันคนละตัวกรอง
  const kpiDeals = deals.filter(inScopeDeal);
  const totalDeals = kpiDeals.length;
  const pipelineValue = kpiDeals
    .filter((d) => !["won", "lost", "in_project"].includes(d.stage))
    .reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const wonDeals = kpiDeals.filter((d) => isWonStage(d.stage));
  const wonValue = wonDeals.reduce(
    (sum, d) => sum + Number(d.wonValue ?? d.projectValue ?? 0),
    0,
  );
  const lostDeals = kpiDeals.filter((d) => d.stage === "lost");

  // ⚠️ ไล่ประเภทจาก DEAL_TYPE_LABELS ไม่ใช่พิมพ์เอง — คำโปรยนี้เคยค้างที่ 3 ประเภท
  // อยู่รอบหนึ่งหลังเพิ่ม 'อื่นๆ' (mig 0247/0249) โดยไม่มีอะไรเตือน
  const dealsSubtitle = `จัดการดีลขาย (${DEAL_TYPES.map((t) => DEAL_TYPE_LABELS[t]).join(" / ")}) และส่งต่อโครงการ PM`;

  return (
    <SaWorkspace
      icon={<Handshake size={22} />}
      title="บริหารงานขาย — ดีล"
      subtitle={dealsSubtitle}
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-4">
        {error && (
            <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
              {error}
            </div>
          )}

          {canSeeDealKpi(role) && (
            <>
              {/* ขอบเขต (ซ้าย) + ทางไป KPI เต็ม (ขวา) แถวเดียวกัน — ชุดเดียวกับคิวลีด
                  (มติผู้ใช้ 2026-08-05) คลาสอยู่ที่ globals.css ทั้งคู่ ห้ามแยกไปเขียนเอง
                  ไม่งั้นสองหน้าจะเพี้ยนหากันเหมือนตอนที่ตัวสลับเคยเป็นคนละคลาส (#969)

                  ⚠️ ทั้งก้อนอยู่ใน canSeeDealKpi อยู่แล้ว ต่างจากคิวลีดที่ตัวสลับเปิดให้
                  คนทำงานคิวทุกคนแม้ไม่เห็น KPI — ที่นี่คนที่ไม่มีสิทธิ์ KPI ก็ไม่เห็น
                  ไปป์ไลน์รวมอยู่แล้ว จึงไม่มีเคส "เห็นตัวสลับแต่ไม่เห็นแถบ" */}
              <div className="scope-row">
                {allowedScopes.length > 1 && (
                  <Segmented
                    ariaLabel="ขอบเขตของไปป์ไลน์"
                    className="scope-toggle"
                    value={activeScope}
                    onChange={setScope}
                    options={allowedScopes.map((key) => ({ value: key, label: SCOPE_LABELS[key] }))}
                  />
                )}
                {activeScope === "team" && (
                  <MyTeamsFilter teams={teamFilter.teams} selected={teamFilter.selected} onChange={teamFilter.setSelected} />
                )}
                {/* ?tab=performance = "ผลงานขาย" ซึ่งเป็นที่อยู่ของ KPI ดีลฉบับเต็ม
                    (แท็บ overview เดิมถูกยุบเข้าไปแล้ว — ดูหัวไฟล์ sa/dashboard) */}
                <Link href="/sa/dashboard?tab=performance" className="linklike kpi-full-link">ดู KPI เต็ม →</Link>
              </div>

              <SaMetricStrip>
                <SaMetric icon={<Handshake />} label="จำนวนดีลทั้งหมด" value={totalDeals} note="ตามขอบเขตและเดือนที่เลือก" />
                <SaMetric icon={<Trophy />} label="ยอดไปป์ไลน์" value={fmtMoney(pipelineValue)} note="มูลค่าดีลที่กำลังดำเนินการ" tone="warning" />
                <SaMetric icon={<CheckCircle2 />} label="ปิดสำเร็จ (Won)" value={wonDeals.length} note={wonValue > 0 ? fmtMoney(wonValue) : "ยังไม่มียอด Won"} tone="good" />
                <SaMetric icon={<Ban />} label="ไม่ไปต่อ (Lost)" value={lostDeals.length} note="ดีลที่ปิดโดยไม่เกิดยอดขาย" tone={lostDeals.length ? "danger" : undefined} />
              </SaMetricStrip>
            </>
          )}

          {/* ⏳ 7 วันสุดท้ายของเดือน: เตือนให้เคลียร์เดือน FC ก่อนตัวเลขปิดงวด
              (มติผู้ใช้ 2026-08-05) นับถอยหลังทุกวัน · โผล่เฉพาะเมื่อมีของค้างจริง
              ปุ่มพาไปที่ตัวกรองเลย ไม่ใช่บอกเฉย ๆ แล้วให้ไปหาเอง */}
          {reviewWindow.active && dueCounts.overdue > 0 && (
            <ForecastReviewBanner
              daysLeft={reviewWindow.daysLeft}
              overdueCount={dueCounts.overdue}
              onShowOverdue={() => setDueFilter(["overdue"])}
            />
          )}

          <SaSection icon={<Handshake size={17} />} title="ไปป์ไลน์ดีล" subtitle="ค้นหา กรอง และติดตามทุกดีลในกระบวนการขาย" actions={<span className="ui-badge">{filteredDeals.length} ดีล</span>}>
          <div className="toolbar">
            <div className="search-glass" style={{ width: 280 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาดีล / ลูกค้า / ผู้ดูแล / สูตร" aria-label="ค้นหาดีล" />
            </div>
            <FilterPopover
              count={stageFilter.length + typeFilter.length + dueFilter.length + reviewFilter.length}
              onClear={() => { setStageFilter([]); setTypeFilter([]); setDueFilter([]); setReviewFilter([]); }}
              groups={[
                {
                  key: "stage", label: "สถานะ", icon: Flag,
                  options: PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
                  selected: stageFilter, onChange: setStageFilter,
                },
                {
                  key: "type", label: "ประเภทดีล", icon: Handshake,
                  options: DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABELS[t] })),
                  selected: typeFilter, onChange: setTypeFilter,
                },
                {
                  key: "due", label: "เดือน FC", icon: CalendarClock,
                  options: [
                    { value: "overdue", label: `เลยกำหนด — ต้องเลื่อนเดือน (${dueCounts.overdue})` },
                    { value: "missing", label: `ยังไม่ระบุเดือน (${dueCounts.missing})` },
                    { value: "ontime", label: `ตรงกำหนด (${dueCounts.ontime})` },
                  ],
                  selected: dueFilter, onChange: setDueFilter,
                },
                {
                  key: "review", label: "ข้อมูลดีล", icon: AlertTriangle,
                  options: [{ value: "needsReview", label: `รอเติมข้อมูล${reviewCount ? ` (${reviewCount})` : ""}` }],
                  selected: reviewFilter, onChange: setReviewFilter,
                },
              ]}
            />

            {/* จัดกลุ่ม/เรียง = ปุ่มทรงเดียวกับตัวกรอง ชื่อ+ไอคอนอยู่ในปุ่ม (มติผู้ใช้
                2026-08-08 — ลดพื้นที่ ไม่มีป้ายนอกปุ่ม) · ปุ่มไอคอนข้าง ๆ ไม่มีคำอธิบาย
                เหลือ tooltip: ย่อ/ขยายทุกกลุ่ม กับ ทิศทางเรียง */}
            <MenuSelect
              icon={Layers}
              label="จัดกลุ่ม"
              title="จัดกลุ่มรายการดีล"
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsedGroups(new Set()); }}
              options={GROUP_OPTIONS}
              isActive={(value) => value !== "none"}
            />
            {!!groupedDeals?.length && (
              <Button
                iconOnly
                onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(groupedDeals.map((g) => g.key)))}
                title={allCollapsed ? "ขยายทุกกลุ่ม" : "ย่อทุกกลุ่ม"}
                aria-label={allCollapsed ? "ขยายทุกกลุ่ม" : "ย่อทุกกลุ่ม"}
                icon={allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
              />
            )}

            <div className="spacer" />
            <MenuSelect
              icon={ArrowUpDown}
              label="เรียง"
              title="เรียงลำดับ"
              value={sortKey}
              onChange={(key) => { setSortKey(key); setSortDir(defaultDir(key)); }}
              options={SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
              showValue
              isActive={(key) => key !== "created"}
            />
            <Button
              iconOnly
              className="ui-sort-direction"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "น้อย → มาก" : "มาก → น้อย"}
              aria-label={sortDir === "asc" ? "เรียงจากน้อยไปมาก" : "เรียงจากมากไปน้อย"}
              icon={sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
            />
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
              <thead>
                <tr>
                  <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>ดีล {sortArrow("name")}</span></th>
                  <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>สถานะ {sortArrow("status")}</span></th>
                  <th>ขั้นตอน</th>
                  <th style={{ textAlign: "center" }}>FC%</th>
                  <th style={{ textAlign: "center" }}>ประเภท</th>
                  <th>ผู้ดูแล (AE)</th>
                  <th>เดือน FC</th>
                  <th className="num" onClick={() => handleSort("amount")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>มูลค่า {sortArrow("amount")}</span></th>
                  {/* 4 คอลัมน์เดิม (ไทม์ไลน์/ใบเสนอ/เอกสาร/ส่ง) ยุบเข้าเมนู "…" ในคอลัมน์นี้ */}
                  <th style={{ textAlign: "right" }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {/* โหมดจัดกลุ่ม: หัวกลุ่มเป็นแถวเต็มความกว้าง กดที่แถบเพื่อย่อ/ขยาย
                    แถวดีลข้างในเป็น dealRow ตัวเดียวกับโหมดปกติ — ห้ามก๊อปแยกสองสำเนา */}
                {groupedDeals ? groupedDeals.map((group) => {
                  const collapsed = collapsedGroups.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr className="group-row">
                        <td colSpan={9}>
                          <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={!collapsed}>
                            {collapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                            <strong>{group.label}</strong>
                            {group.sub ? <span className="ar-code">{group.sub}</span> : null}
                            <span className="ui-badge">{group.deals.length} ดีล</span>
                            <span className="group-total mono" title="มูลค่ารวมของกลุ่ม (Won ใช้ยอดปิดจริง)">{fmtMoney(group.total)}</span>
                          </button>
                        </td>
                      </tr>
                      {!collapsed && group.deals.map(dealRow)}
                    </Fragment>
                  );
                }) : pageRows.map(dealRow)}
                {!filteredDeals.length && (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีดีลในเดือนนี้ {canCreateDeals ? "เริ่มจากปุ่มเพิ่มดีลด้านบน" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table></TableScroll>
          </div>

          {/* โหมดจัดกลุ่มไม่แบ่งหน้า — แบ่งหน้าจะหั่นกลุ่มกลางคันแล้วยอดหัวกลุ่ม
              ไม่ตรงกับแถวที่เห็น · ใช้ย่อ/ขยายกลุ่มคุมความยาวแทน */}
          {filteredDeals.length > 0 && !groupedDeals && (
            <Pager
              page={page}
              pageCount={pageCount}
              total={total}
              onPage={setPage}
              pageSize={pageSize}
              onPageSize={setPageSize}
            />
          )}
        </SaSection>
      </div>

      {/* สร้างดีล = โมดัลกลางตัวเดียวกับฝั่งลีด (มติผู้ใช้ 2026-08-05) — ได้แท็บแทนการ์ด
          เรียงยาว และได้กันสร้างซ้ำตอนกดใหม่หลังพลาดกลางทางมาด้วย
          ⚠️ mount ตอนเปิดเท่านั้น (ดูคำเตือนใน DealCreateModal) */}
      {createModal && (
        <DealCreateModal
          customers={customers}
          projects={projects}
          categories={categories}
          stages={CREATABLE_STAGES}
          owners={owners}
          defaultOwnerId={defaultOwnerId}
          lockedOwner={lockedOwner}
          onClose={() => setCreateModal(false)}
          onCreated={(created) => {
            setCreateModal(false);
            // ดีลเกิดแต่ของประกอบไม่ครบ (ไทม์ไลน์ไม่เกิด / แถวมูลค่ารายหมวดเขียนไม่ลง)
            // — บอกทันที ไม่ปล่อยเงียบ
            const warnings = (created || [])
              .flatMap((d) => [d?.timelineWarning, d?.valueItemsWarning])
              .filter(Boolean);
            if (warnings.length) setError(warnings.join(" · "));
            load();
          }}
        />
      )}

      <Modal open={dealModal} onClose={() => setDealModal(false)} title="แก้ไขดีล" size="lg">
        {(
          <form onSubmit={saveDeal} className="form-grid cols-2" aria-busy={submitting} style={{ padding: 18 }}>
            <DealFormFields
              form={dealForm}
              onPatch={(patch) => setDealForm((f) => ({ ...f, ...patch }))}
              customers={customers}
              projects={projects}
              showProject
              categories={categories}
              stages={editableStages(dealForm.stage === "won")}
              alreadyWon={dealForm.stage === "won"}
              owners={owners}
            />
            <div className="form-action-bar">
              <button type="button" className="btn" onClick={() => setDealModal(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={quoteModal} onClose={() => setQuoteModal(false)} title={`Quotation${quoteDeal?.title ? ` · ${quoteDeal.title}` : ""}`} size="lg">
        <div style={{ padding: 18 }}>
          <div className="flex items-center gap-2 mb-3">
            <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
              {quoteDeal?.projectId ? "สร้าง line จาก FG ใน PM project และ freeze ราคาขาย ณ วันที่สร้าง" : "ต้องสร้าง/ผูก PM project และ FG ก่อนจึง seed quotation อัตโนมัติได้"}
            </div>
            <div className="spacer" />
            {/* ดีลปิด Won/Lost = ใบเสนอราคาถูกล็อกทั้งชุด — ซ่อนปุ่มสร้าง */}
            {quoteDeal?.canEdit && !isClosedStage(quoteDeal?.stage) && (
              <button type="button" className="btn btn-primary" onClick={createQuotation} disabled={quoteLoading || !quoteDeal?.projectId}>
                <Plus size={15} aria-hidden="true" /> สร้างใบเสนอราคา
              </button>
            )}
          </div>
          <div className="premium-glass-table table-responsive" aria-busy={quoteLoading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>สถานะ</th>
                  <th>วันที่</th>
                  <th className="num">ยอดรวม</th>
                  <th>รายการ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quote) => (
                  <tr key={quote.id} className="premium-row">
                    <td className="mono">{quote.quoteNumber}</td>
                    <td>{quoteStatusBadge(quote.status)}</td>
                    <td>{naText(quote.quoteDate)}</td>
                    <td className="num mono">{money(quote.totalAmount)}</td>
                    <td>
                      {(quote.lines || []).length ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {(quote.lines || []).slice(0, 3).map((line) => (
                            <li key={line.id}>
                              {line.fgCode ? <span className="mono">{line.fgCode}</span> : null}
                              <ReadableText text={line.description} lines={2} empty="ไม่มีรายละเอียด" />
                              <span className="mono">{line.qty} x {money(line.unitPrice)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : NA}
                    </td>
                    <td className="num">
                      {["draft", "sent"].includes(quote.status) && (
                        <div className="flex items-center gap-2 justify-end">
                          {quoteDeal?.canEdit && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => acceptQuotation(quote)}
                              disabled={quoteLoading}
                            >
                              Won
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!quotations.length && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีใบเสนอราคาสำหรับดีลนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table></TableScroll>
          </div>
        </div>
      </Modal>

      <QuotationWonDialog
        open={!!wonQuote}
        onClose={() => setWonQuote(null)}
        quote={wonQuote}
        customerId={quoteDeal?.customerId}
        customerName={quoteDeal?.customerName}
        onDone={async () => {
          setWonQuote(null);
          await loadQuotations(quoteDeal);
          await load();
        }}
      />

      <Modal open={docModal} onClose={() => setDocModal(false)} title={`Documents${docDeal?.title ? ` · ${docDeal.title}` : ""}`} size="lg">
        <div style={{ padding: 18 }}>
          {docDeal?.canEdit && (
            <form onSubmit={createDocument} className="form-grid" aria-busy={docLoading} style={{ marginBottom: 16 }}>
              <label>
                ประเภท
                <Select className="premium-select" value={docForm.kind} onChange={(e) => setDocForm({ ...docForm, kind: e.target.value })}>
                  <option value="customer_brief">บรีฟลูกค้า</option>
                  <option value="quotation">ใบเสนอราคา</option>
                  <option value="deposit_proof">หลักฐานมัดจำ</option>
                  <option value="po">ใบสั่งซื้อ (PO)</option>
                  <option value="tax_docs">เอกสารภาษี</option>
                  <option value="other">อื่นๆ</option>
                </Select>
              </label>
              <label>
                ชื่อเอกสาร
                <input className="premium-input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} required />
              </label>
              <label>
                กำหนดส่ง
                <DateInput value={docForm.dueDate} onChange={(value) => setDocForm({ ...docForm, dueDate: value })} />
              </label>
              <label>
                สถานะ
                <Select className="premium-select" value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="received">รับแล้ว</option>
                  <option value="waived">ยกเว้น</option>
                </Select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                หมายเหตุ
                <Textarea rows={2} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
              </label>
              <div className="form-action-bar">
                <button type="submit" className="btn btn-primary" disabled={docLoading}>
                  <Plus size={15} aria-hidden="true" /> เพิ่มเอกสาร
                </button>
              </div>
            </form>
          )}

          <div className="premium-glass-table table-responsive" aria-busy={docLoading}>
            <TableScroll surface="embedded"><table className="w-full text-sm">
              <thead>
                <tr>
                  <th>เอกสาร</th>
                  <th>สถานะ</th>
                  <th>กำหนด</th>
                  <th>หมายเหตุ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="premium-row">
                    <td>
                      <strong>{doc.title}</strong>
                      <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{doc.kind}</span>
                    </td>
                    <td>{stageBadge(doc.status === "received" ? "won" : doc.status === "waived" ? "lost" : "awaiting_confirm")}</td>
                    <td className="mono">{naText(doc.dueDate)}</td>
                    <td>{naText(doc.notes)}</td>
                    <td className="num">
                      {docDeal?.canEdit && (
                        <div className="flex items-center gap-2 justify-end">
                          {doc.status !== "received" && (
                            <button type="button" className="btn ghost" onClick={() => updateDocumentStatus(doc, "received")} disabled={docLoading}>
                              รับแล้ว
                            </button>
                          )}
                          {doc.status !== "waived" && (
                            <button type="button" className="btn ghost" onClick={() => updateDocumentStatus(doc, "waived")} disabled={docLoading}>
                              ยกเว้น
                            </button>
                          )}
                          <button type="button" className="btn icon-only ghost" onClick={() => deleteDocument(doc)} aria-label={`Delete ${doc.title}`} disabled={docLoading}>
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!documents.length && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีรายการเอกสาร
                    </td>
                  </tr>
                )}
              </tbody>
            </table></TableScroll>
          </div>
        </div>
      </Modal>

    </SaWorkspace>
  );
}
