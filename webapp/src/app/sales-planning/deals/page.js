"use client";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Ban, CheckCircle2, ClipboardList, ExternalLink, FileText, FolderKanban, PackageCheck, Pencil, Plus, Save, Search, Trash2, Truck, Trophy } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import SaWorkspace, { SaMetric, SaMetricStrip, SaSection } from "@/components/salesPlanning/SaWorkspace";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { canSeeDealKpi, isSuperuser, salesDealScopes } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { createClient } from "@/lib/supabaseBrowser";
import { DEAL_STAGES, DEAL_TYPES, DEAL_TYPE_LABELS, SALES_FEATURES, STAGE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, MonthPicker, dealTypeBadge, forecastBadge, initialDealForm, money, quoteStatusBadge, snapForecastLevel, stageBadge, thisMonth } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtName } from "@/lib/format";
import { cachedFetchJson } from "@/lib/apiCache";
import { brandDisplayFromList, brandThList } from "@/lib/master/brands";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import SortControl from "@/components/ui/SortControl";
import FilterPopover from "@/components/ui/FilterPopover";
import DetailRow from "@/components/ui/DetailRow";
import QuotationWonDialog from "@/components/salesPlanning/QuotationWonDialog";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/excise/Pager";

// สถานะที่เลือกได้ใน pipeline — won เป็นสถานะปิดสุดท้าย (ไม่มี in_project ให้เลือกแล้ว
// แต่ STAGE_LABELS ยังรองรับข้อมูลเก่า)
const PIPELINE_STAGES = DEAL_STAGES.filter((s) => s !== "in_project");

export default function SalesPlanningPipelinePage() {
  const canEdit = useCan("salesplan:edit");
  const role = useRole();
  const superuser = isSuperuser(role);
  // สร้างดีลได้เฉพาะ AE / Senior AE (+ superuser กำกับดูแล) — AC เปิดดีลไม่ได้ (มติผู้ใช้)
  const canCreateDeals = superuser || role === "ae" || role === "senior_ae";
  // ตัวกรองทั้งหมดอยู่ใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ทุกหมวด multi-select, ว่าง = ทั้งหมด. "รอเติมข้อมูล" เดิมมี state แต่ไม่มีปุ่มให้กด
  // (กรองไม่ได้จริง) — ย้ายมาเป็นหมวดหนึ่งในแผงนี้
  const [stageFilter, setStageFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]); // ประเภทดีล SCENT/NPD/RE-ORDER
  const [reviewFilter, setReviewFilter] = useState([]);
  const reviewOnly = reviewFilter.includes("needsReview");
  const [month, setMonth] = useState(thisMonth());
  const [allMonths, setAllMonths] = useState(true);
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("created");
  const [sortDir, setSortDir] = useState("desc");
  // มุมมอง KPI: ของฉัน/ทีม/ทั้งหมด — PR #275 ใช้ตัวแปรพวกนี้แต่ไม่ได้ประกาศ (หน้า crash)
  const team = useTeam();
  const [scope, setScope] = useState("mine");
  const [meId, setMeId] = useState(null);
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => setMeId(user?.id || null)).catch(() => {});
  }, []);
  const me = { id: meId, team };

  const SORT_OPTIONS = [
    { key: "created", label: "อัปเดตล่าสุด" },
    { key: "name", label: "ชื่อดีล" },
    { key: "status", label: "สถานะ" },
    { key: "amount", label: "มูลค่า" },
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
  const [createDeals, setCreateDeals] = useState(null); // array = โหมดเพิ่ม (หลายดีลได้), null = โหมดแก้ไข
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
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmDeal, setPmDeal] = useState(null);
  const [pmInitial, setPmInitial] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dealsRes, customersRes, projectsRes] = await Promise.all([
        // ตัวกรอง "รอเติมข้อมูล" ต้องดึงทุกเดือน (deal backfill มี forecastMonth=null)
        fetch((allMonths || reviewOnly) ? "/api/sales-planning/deals" : `/api/sales-planning/deals?month=${encodeURIComponent(month)}`),
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

  // ข้อมูลสำหรับโมดัลสร้างโครงการ PM (หมวดสินค้า + FG) — โหลดครั้งเดียว
  useEffect(() => {
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
    cachedFetchJson("/api/products").then((d) => setAllProducts(d || [])).catch(() => {});
  }, []);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = deals.filter((deal) => {
      if (reviewOnly && !deal.metadata?.needsReview) return false;
      if (stageFilter.length && !stageFilter.includes(deal.stage)) return false;
      if (typeFilter.length && !typeFilter.includes(dealTypeOf(deal))) return false;
      if (!q) return true;
      return [deal.title, deal.customerName, deal.ownerName, deal.notes, deal.formulaName].some((v) => (v || "").toLowerCase().includes(q));
    });

    const mul = sortDir === "desc" ? -1 : 1;
    return result.sort((a, b) => {
      if (sortKey === "name") return (a.title || "").localeCompare(b.title || "", "th") * mul;
      if (sortKey === "status") return ((DEAL_STAGES.indexOf(a.stage) || 99) - (DEAL_STAGES.indexOf(b.stage) || 99)) * mul;
      if (sortKey === "amount") {
        const valA = ["won", "in_project"].includes(a.stage) ? (a.wonValue ?? a.projectValue ?? 0) : (a.projectValue ?? 0);
        const valB = ["won", "in_project"].includes(b.stage) ? (b.wonValue ?? b.projectValue ?? 0) : (b.projectValue ?? 0);
        return (valA - valB) * mul;
      }
      // asc = เก่า→ใหม่ ให้ desc (ค่าตั้งต้น) โชว์ล่าสุดก่อน — เดิมกลับทิศ ทำให้เปิดหน้ามาเจอดีลเก่าสุด
      return ((a.updatedAt || a.createdAt || "") < (b.updatedAt || b.createdAt || "") ? -1 : 1) * mul;
    });
  }, [deals, query, stageFilter, typeFilter, reviewOnly, sortKey, sortDir]);

  const reviewCount = useMemo(() => deals.filter((d) => d.metadata?.needsReview).length, [deals]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filteredDeals, {
      resetKey: `${query}|${stageFilter.join()}|${typeFilter.join()}|${reviewOnly}|${sortKey}|${sortDir}|${month}|${allMonths}`,
    });

  const openNewDeal = () => {
    setCreateDeals([{ ...initialDealForm }]);
    setDealModal(true);
  };
  const addDealRow = () => setCreateDeals((prev) => [...(prev || []), { ...initialDealForm }]);
  const removeDealRow = (i) => setCreateDeals((prev) => prev.filter((_, idx) => idx !== i));

  const submitCreateDeals = async () => {
    setSubmitting(true);
    setError("");
    try {
      for (const d of (createDeals || [])) {
        if (!d.title?.trim()) throw new Error("กรุณาระบุชื่อดีลให้ครบทุกรายการ");
        // บังคับเลือกประเภทดีล — ตัวนี้เลือก template ไทม์ไลน์ ถ้าปล่อยว่างจะถูก default
        // เป็น NPD เงียบ ๆ ที่ฝั่ง server (normalizeDealType) แล้วได้ template ผิดประเภท
        if (!d.dealType) throw new Error(`กรุณาเลือกประเภทดีล (SCENT/NPD/RE-ORDER) ให้ครบทุกรายการ${d.title ? ` — "${d.title}"` : ""}`);
        const selectedCustomer = customers.find((c) => c.id === d.customerId);
        const payload = { ...d, customerName: selectedCustomer?.name || d.customerName || null };
        const res = await fetch("/api/sales-planning/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const savedDeal = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(savedDeal.error || `สร้างดีล ${d.title} ไม่สำเร็จ`);
        if (d.projectId && !d.lockedProjectId) {
          const linkRes = await fetch(`/api/sales-planning/deals/${savedDeal.id}/link-project`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: d.projectId, startDate: d.startDate || undefined }),
          });
          if (!linkRes.ok) throw new Error((await linkRes.json().catch(() => ({}))).error || `สร้างดีล ${d.title} แล้ว แต่เชื่อมโครงการไม่สำเร็จ`);
        }
      }
      setDealModal(false);
      setCreateDeals(null);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึกดีลไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDeal = (deal) => {
    setCreateDeals(null);
    setDealForm({
      id: deal.id,
      title: deal.title || "",
      customerId: deal.customerId || "",
      customerName: deal.customerName || "",
      stage: deal.stage || "lead",
      dealType: dealTypeOf(deal),
      formulaName: deal.formulaName || "",
      categoryCode: deal.categoryCode || "",
      categoryMainCode: String(deal.categoryCode || "").split("-")[0] || "",
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
    if (!window.confirm(`ลบดีล "${deal.title}"?${withPm}\n\nการลบนี้ย้อนกลับไม่ได้`)) return;
    setError("");
    try {
      // admin: ถ้าถูกบล็อกด้วยกฎธุรกิจ จะได้พรีวิว + ถามยืนยันบังคับลบต่อ
      const result = await deleteWithForce(`/api/sales-planning/deals/${deal.id}`, { isAdmin: role === "admin" });
      if (result.ok) await load();
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

  // เปิดโมดัลสร้างโครงการ PM (เหมือนหน้า PM) พร้อมเติมค่าแนะนำจากดีล — ปรับแก้ได้
  const openCreatePM = (deal) => {
    setPmDeal(deal);
    setPmInitial({
      name: deal.title || "",
      customerId: deal.customerId || "",
      // ซิงค์วันที่กับดีล: ใช้วันเริ่ม/สิ้นสุดของดีลเป็นค่าตั้งต้น (ไม่มีค่อยตกเป็นวันนี้)
      startDate: deal.startDate || new Date().toISOString().slice(0, 10),
      dueDate: deal.endDate || deal.expectedCloseDate || "",
      type: dealTypeOf(deal),
      aeOwner: deal.ownerName || "",
      metadata: { brand: deal.metadata?.brand || "" },
    });
    setPmModalOpen(true);
  };

  const handlePmSuccess = async (data) => {
    setPmModalOpen(false);
    setPmDeal(null);
    if (data?.productWarning) setError(data.productWarning);
    await load();
  };

  // ส่งต่อคลัง: สร้างเอกสารเตรียมส่งของจากโครงการที่ผูกกับ Sales Planning (idempotent ฝั่ง PM)
  // แล้วเปิดหน้า PM shipment-prep เพื่อดู/พิมพ์ ส่งให้คลังดำเนินการ.
  const createShipmentPrep = async (deal) => {
    if (!deal.projectId) return;
    if (!window.confirm(`สร้างเอกสารเตรียมส่งของจากโครงการ "${deal.title}"?`)) return;
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
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
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
  const pctFmt = (value) => (value == null ? "–" : `${Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

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

    const allowedScopes = salesDealScopes(role);
  const SCOPE_TH = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };

  // Set default scope correctly on mount
  useEffect(() => {
    if (!allowedScopes.includes(scope)) {
      setScope(allowedScopes[0] || "mine");
    }
  }, [allowedScopes, scope]);

  // Calculate KPIs
  const kpiDeals = deals.filter(d => {
    if (scope === "mine" && me?.id) return d.ownerId === me.id;
    if (scope === "team" && me?.team) return d.team === me.team;
    return true;
  });
  const totalDeals = kpiDeals.length;
  const pipelineValue = kpiDeals
    .filter((d) => !["won", "lost", "in_project"].includes(d.stage))
    .reduce((sum, d) => sum + Number(d.projectValue || 0), 0);
  const wonDeals = kpiDeals.filter((d) => ["won", "in_project"].includes(d.stage));
  const wonValue = wonDeals.reduce(
    (sum, d) => sum + Number(d.wonValue ?? d.projectValue ?? 0),
    0,
  );
  const lostDeals = kpiDeals.filter((d) => d.stage === "lost");

  return (
    <SaWorkspace
      icon={<FolderKanban size={22} />}
      title="บริหารงานขาย — ดีล"
      subtitle="จัดการดีลขาย (พัฒนากลิ่น / พัฒนาสินค้า / สั่งผลิตซ้ำ) และส่งต่อโครงการ PM"
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
              {allowedScopes.length > 1 && (
                <div className="segmented deal-scope-toggle" style={{ marginBottom: "16px" }}>
                  {allowedScopes.map((s) => (
                    <button key={s} type="button" onClick={() => setScope(s)} className={scope === s ? "active" : ""}>
                      {SCOPE_TH[s]}
                    </button>
                  ))}
                </div>
              )}
              
              <SaMetricStrip>
                <SaMetric icon={<FolderKanban />} label="จำนวนดีลทั้งหมด" value={totalDeals} note="ตามขอบเขตและเดือนที่เลือก" />
                <SaMetric icon={<Trophy />} label="ยอดไปป์ไลน์" value={fmtMoney(pipelineValue)} note="มูลค่าดีลที่กำลังดำเนินการ" tone="warning" />
                <SaMetric icon={<CheckCircle2 />} label="ปิดสำเร็จ (Won)" value={wonDeals.length} note={wonValue > 0 ? fmtMoney(wonValue) : "ยังไม่มียอด Won"} tone="good" />
                <SaMetric icon={<Ban />} label="ไม่ไปต่อ (Lost)" value={lostDeals.length} note="ดีลที่ปิดโดยไม่เกิดยอดขาย" tone={lostDeals.length ? "danger" : undefined} />
              </SaMetricStrip>
            </>
          )}

          <SaSection icon={<FolderKanban size={17} />} title="ไปป์ไลน์ดีล" subtitle="ค้นหา กรอง และติดตามทุกดีลในกระบวนการขาย" actions={<span className="ui-badge">{filteredDeals.length} ดีล</span>}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 280 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาดีล / ลูกค้า / ผู้ดูแล / สูตร" aria-label="ค้นหาดีล" />
            </div>
            <FilterPopover
              count={stageFilter.length + typeFilter.length + reviewFilter.length}
              onClear={() => { setStageFilter([]); setTypeFilter([]); setReviewFilter([]); }}
              groups={[
                {
                  key: "stage", label: "สถานะ", icon: ClipboardList,
                  options: PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
                  selected: stageFilter, onChange: setStageFilter,
                },
                {
                  key: "type", label: "ประเภทดีล", icon: FolderKanban,
                  options: DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABELS[t] })),
                  selected: typeFilter, onChange: setTypeFilter,
                },
                {
                  key: "review", label: "ข้อมูลดีล", icon: AlertTriangle,
                  options: [{ value: "needsReview", label: `รอเติมข้อมูล${reviewCount ? ` (${reviewCount})` : ""}` }],
                  selected: reviewFilter, onChange: setReviewFilter,
                },
              ]}
            />

            <div className="spacer" />
            <SortControl
              value={sortKey}
              onChange={(event) => { setSortKey(event.target.value); setSortDir(defaultDir(event.target.value)); }}
              options={SORT_OPTIONS}
              direction={sortDir}
              onDirectionChange={setSortDir}
              selectStyle={{ width: 120 }}
            />
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>ดีล {sortArrow("name")}</span></th>
                  <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>สถานะ {sortArrow("status")}</span></th>
                  <th style={{ textAlign: "center" }}>FC%</th>
                  <th style={{ textAlign: "center" }}>ประเภท</th>
                  <th>ผู้ดูแล (AE)</th>
                  <th className="num" onClick={() => handleSort("amount")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>มูลค่า {sortArrow("amount")}</span></th>
                  <th style={{ textAlign: "center" }}>ไทม์ไลน์</th>
                  {SALES_FEATURES.quotations && <th style={{ textAlign: "center" }}>ใบเสนอ</th>}
                  {SALES_FEATURES.documents && <th style={{ textAlign: "center" }}>เอกสาร</th>}
                  {SALES_FEATURES.shipment && <th style={{ textAlign: "center" }}>ส่ง</th>}
                  <th style={{ textAlign: "right" }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((deal) => (
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
                        <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                          {deal.customerName || "-"}{deal.metadata?.brand ? ` · ${brandDisplayFromList(customers.find((c) => c.id === deal.customerId)?.brands, deal.metadata.brand)}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{stageBadge(deal.stage)}</td>
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      {["won", "in_project", "lost"].includes(deal.stage)
                        ? <span style={{ color: "var(--text-3)" }}>-</span>
                        : forecastBadge(deal.probability)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {dealTypeBadge(dealTypeOf(deal))}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{deal.ownerName ? fmtName(deal.ownerName) : (deal.team || "-")}</td>
                    <td className="num mono" style={{ whiteSpace: "nowrap" }} title={["won", "in_project"].includes(deal.stage) ? "มูลค่าปิดจริง (Won)" : "มูลค่าคาดการณ์"}>
                      {["won", "in_project"].includes(deal.stage) ? fmtMoney(deal.wonValue ?? deal.projectValue) : fmtMoney(deal.projectValue)}
                    </td>
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <Link prefetch={false} className="btn ghost" href={`/sa/deals/${deal.id}?tab=timeline`} title="เปิดไทม์ไลน์ของดีล" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 96, justifyContent: "center" }}>
                        <PackageCheck size={14} aria-hidden="true" /> ไทม์ไลน์
                      </Link>
                    </td>
                    {SALES_FEATURES.quotations && (
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <Link prefetch={false} className="btn ghost" href={`/sa/deals/${deal.id}?tab=quotations`} title="เปิดใบเสนอราคาของดีล" style={{ minWidth: 96, justifyContent: "center" }}>
                          <FileText size={14} aria-hidden="true" /> ใบเสนอ
                        </Link>
                      </td>
                    )}
                    {SALES_FEATURES.documents && (
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <button type="button" className="btn ghost" onClick={() => openDocuments(deal)} style={{ minWidth: 96, justifyContent: "center" }}>
                          <ClipboardList size={14} aria-hidden="true" /> เอกสาร
                        </button>
                      </td>
                    )}
                    {SALES_FEATURES.shipment && (
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        {deal.projectId ? (
                          deal.canEdit ? (
                            <button type="button" className="btn ghost" onClick={() => createShipmentPrep(deal)} disabled={shippingDealId === deal.id}>
                              <Truck size={14} aria-hidden="true" /> {shippingDealId === deal.id ? "กำลังสร้าง..." : "ส่ง"}
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-3)" }}>-</span>
                          )
                        ) : (
                          <span style={{ color: "var(--text-3)" }} title="ต้องส่งต่อ PM ก่อน">-</span>
                        )}
                      </td>
                    )}
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      <div className="flex items-center gap-2 justify-end">
                        {deal.projectId ? (
                          <Link href={`/sa/projects/${deal.projectId}`} className="btn ghost sm" title="เปิดโครงการที่เชื่อมแล้ว">
                            <FolderKanban size={14} aria-hidden="true" /> ไปโครงการ
                          </Link>
                        ) : deal.canEdit ? (
                          <button type="button" className="btn ghost sm" onClick={() => openEditDeal(deal)} title="แนะนำให้เชื่อมโครงการก่อนออกใบเสนอราคา">
                            <FolderKanban size={14} aria-hidden="true" /> เชื่อมโครงการ
                          </button>
                        ) : null}
                        {deal.canEdit && (
                          <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={() => openEditDeal(deal)} aria-label={`แก้ไข ${deal.title}`} title="แก้ไขดีล">
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                        )}
                        {(role === "admin" || (deal.canEdit && (!["won", "in_project"].includes(deal.stage) || superuser) && !deal.metadata?.sahamitPoId)) && (
                          <button type="button" className="btn-icon danger" onClick={() => deleteDeal(deal)} aria-label={`ลบ ${deal.title}`} title="ลบดีล (ไม่ลบโครงการ PM ที่ผูก)">
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </DetailRow>
                ))}
                {!filteredDeals.length && (
                  <tr>
                    <td colSpan={8 + (SALES_FEATURES.quotations ? 1 : 0) + (SALES_FEATURES.documents ? 1 : 0) + (SALES_FEATURES.shipment ? 1 : 0)} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีดีลในเดือนนี้ {canCreateDeals ? "เริ่มจากปุ่มเพิ่มดีลด้านบน" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredDeals.length > 0 && (
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

      <Modal open={dealModal} onClose={() => setDealModal(false)} title={createDeals ? "เพิ่มดีล" : "แก้ไขดีล"} size="lg">
        {createDeals ? (
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16, maxHeight: "75vh", overflowY: "auto" }} aria-busy={submitting}>
            {createDeals.map((d, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, position: "relative", background: "var(--surface-50)" }}>
                {createDeals.length > 1 && (
                  <button type="button" onClick={() => removeDealRow(i)} className="btn-icon danger" style={{ position: "absolute", top: 12, right: 12, background: "var(--surface)" }} title="ลบรายการนี้">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
                <div className="form-grid cols-2">
                  <DealFormFields
                    form={d}
                    onPatch={(patch) => setCreateDeals((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)))}
                    customers={customers}
                    projects={projects}
                    showProject
                    categories={categories}
                    stages={PIPELINE_STAGES.filter((st) => st !== "won")}
                  />
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="button" className="btn ghost" onClick={addDealRow}>
                <Plus size={14} aria-hidden="true" /> เพิ่มดีลอีกรายการ
              </button>
            </div>
            <div className="form-action-bar">
              <button type="button" className="btn" onClick={() => setDealModal(false)}>ยกเลิก</button>
              <button type="button" className="btn btn-primary" onClick={submitCreateDeals} disabled={submitting}>
                <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : `บันทึก ${createDeals.length} ดีล`}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={saveDeal} className="form-grid cols-2" aria-busy={submitting} style={{ padding: 18 }}>
            <DealFormFields
              form={dealForm}
              onPatch={(patch) => setDealForm((f) => ({ ...f, ...patch }))}
              customers={customers}
              projects={projects}
              showProject
              categories={categories}
              stages={PIPELINE_STAGES.filter((st) => st !== "won" || dealForm.stage === "won")}
              alreadyWon={dealForm.stage === "won"}
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
            <div style={{ color: "var(--text-3)", fontSize: 12 }}>
              {quoteDeal?.projectId ? "สร้าง line จาก FG ใน PM project และ freeze ราคาขาย ณ วันที่สร้าง" : "ต้องสร้าง/ผูก PM project และ FG ก่อนจึง seed quotation อัตโนมัติได้"}
            </div>
            <div className="spacer" />
            {/* ดีลปิด Won/Lost = ใบเสนอราคาถูกล็อกทั้งชุด — ซ่อนปุ่มสร้าง */}
            {quoteDeal?.canEdit && !["won", "in_project", "lost"].includes(quoteDeal?.stage) && (
              <button type="button" className="btn btn-primary" onClick={createQuotation} disabled={quoteLoading || !quoteDeal?.projectId}>
                <Plus size={15} aria-hidden="true" /> สร้างใบเสนอราคา
              </button>
            )}
          </div>
          <div className="premium-glass-table table-responsive" aria-busy={quoteLoading}>
            <table className="w-full text-sm">
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
                    <td>{quote.quoteDate || "-"}</td>
                    <td className="num mono">{money(quote.totalAmount)}</td>
                    <td>
                      {(quote.lines || []).length ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {(quote.lines || []).slice(0, 3).map((line) => (
                            <li key={line.id}>
                              {line.fgCode ? <span className="mono">{line.fgCode} · </span> : null}{line.description} · <span className="mono">{line.qty}</span> x <span className="mono">{money(line.unitPrice)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : "-"}
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
            </table>
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
                <textarea className="premium-input" rows={2} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
              </label>
              <div className="form-action-bar">
                <button type="submit" className="btn btn-primary" disabled={docLoading}>
                  <Plus size={15} aria-hidden="true" /> เพิ่มเอกสาร
                </button>
              </div>
            </form>
          )}

          <div className="premium-glass-table table-responsive" aria-busy={docLoading}>
            <table className="w-full text-sm">
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
                      <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{doc.kind}</span>
                    </td>
                    <td>{stageBadge(doc.status === "received" ? "won" : doc.status === "waived" ? "lost" : "awaiting_confirm")}</td>
                    <td className="mono">{doc.dueDate || "-"}</td>
                    <td>{doc.notes || "-"}</td>
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
            </table>
          </div>
        </div>
      </Modal>

      {pmDeal && (
        <ProjectFormModal
          open={pmModalOpen}
          onClose={() => setPmModalOpen(false)}
          editingId={null}
          initialData={pmInitial}
          onSuccess={handlePmSuccess}
          customers={customers}
          categories={categories}
          allProducts={allProducts}
          createEndpoint={`/api/sales-planning/deals/${pmDeal.id}/create-project`}
          createLabel="จัดการโครงการ"
        />
      )}
    </SaWorkspace>
  );
}
