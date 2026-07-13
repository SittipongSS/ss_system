"use client";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Ban, CheckCircle2, ClipboardList, ExternalLink, FileText, FolderKanban, PackageCheck, Pencil, Plus, Save, Search, Trash2, Truck, Trophy } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import Workspace from "@/components/ui/Workspace";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { canSeeDealKpi, isSuperuser, salesDealScopes } from "@/lib/permissions";
import { createClient } from "@/lib/supabaseBrowser";
import { DEAL_STAGES, DEAL_TYPES, DEAL_TYPE_LABELS, SALES_FEATURES, STAGE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, KpiCard, MonthPicker, dealTypeBadge, forecastBadge, initialDealForm, money, snapForecastLevel, stageBadge, thisMonth } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtName } from "@/lib/format";
import { brandDisplayFromList, brandThList } from "@/lib/master/brands";
import AddBrandButton from "@/components/master/AddBrandButton";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import SortControl from "@/components/ui/SortControl";
import DetailRow from "@/components/ui/DetailRow";

// สถานะที่เลือกได้ใน pipeline — won เป็นสถานะปิดสุดท้าย (ไม่มี in_project ให้เลือกแล้ว
// แต่ STAGE_LABELS ยังรองรับข้อมูลเก่า)
const PIPELINE_STAGES = DEAL_STAGES.filter((s) => s !== "in_project");

export default function SalesPlanningPipelinePage() {
  const canEdit = useCan("salesplan:edit");
  const canReview = useCan("salesplan:review");
  const role = useRole();
  const superuser = isSuperuser(role);
  const [reviewOnly, setReviewOnly] = useState(false); // ตัวกรอง "รอเติมข้อมูล (backfill)"
  const [month, setMonth] = useState(thisMonth());
  const [allMonths, setAllMonths] = useState(true);
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // กรองตามประเภทดีล SCENT/NPD/RE-ORDER
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

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;

  const [dealModal, setDealModal] = useState(false);
  const [dealForm, setDealForm] = useState({ ...initialDealForm, forecastMonth: thisMonth() });
  const [submitting, setSubmitting] = useState(false);
  const [quoteModal, setQuoteModal] = useState(false);
  const [quoteDeal, setQuoteDeal] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [docDeal, setDocDeal] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [dashTotals, setDashTotals] = useState({});
  const [dashTargetRows, setDashTargetRows] = useState(0);
  const [docLoading, setDocLoading] = useState(false);
  const [docForm, setDocForm] = useState({ kind: "customer_brief", title: "", status: "pending", dueDate: "", notes: "" });
  const [shippingDealId, setShippingDealId] = useState(null);
  const [winningDealId, setWinningDealId] = useState(null);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmDeal, setPmDeal] = useState(null);
  const [pmInitial, setPmInitial] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dealsRes, customersRes] = await Promise.all([
        // ตัวกรอง "รอเติมข้อมูล" ต้องดึงทุกเดือน (deal backfill มี forecastMonth=null)
        fetch((allMonths || reviewOnly) ? "/api/sales-planning/deals" : `/api/sales-planning/deals?month=${encodeURIComponent(month)}`),
        fetch("/api/master/customers"),
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
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
  }, []);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = deals.filter((deal) => {
      if (reviewOnly && !deal.metadata?.needsReview) return false;
      if (stageFilter !== "all" && deal.stage !== stageFilter) return false;
      if (typeFilter !== "all" && dealTypeOf(deal) !== typeFilter) return false;
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
      return ((a.updatedAt || a.createdAt || "") < (b.updatedAt || b.createdAt || "") ? 1 : -1) * mul;
    });
  }, [deals, query, stageFilter, typeFilter, reviewOnly, sortKey, sortDir]);

  const reviewCount = useMemo(() => deals.filter((d) => d.metadata?.needsReview).length, [deals]);

  const openNewDeal = () => {
    setDealForm({ ...initialDealForm, forecastMonth: month });
    setDealModal(true);
  };

  const openEditDeal = (deal) => {
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
      forecastMonth: deal.forecastMonth || month,
      expectedCloseDate: deal.expectedCloseDate || "",
      startDate: deal.startDate || "",
      endDate: deal.endDate || "",
      depositPaid: !!deal.depositPaid,
      notes: deal.notes || "",
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
      if (!res.ok) throw new Error((await res.json()).error || "บันทึกดีลไม่สำเร็จ");
      setDealModal(false);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึกดีลไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDeal = async (deal) => {
    // Sales เป็นแม่ — ลบดีลจะลบโครงการ PM ที่ผูกอยู่พ่วงไปด้วย
    const withPm = deal.projectId ? "\n\nโครงการ (PM) ที่ผูกอยู่จะถูกลบพ่วงไปด้วย" : "";
    if (!window.confirm(`ลบดีล "${deal.title}"?${withPm}\n\nการลบนี้ย้อนกลับไม่ได้`)) return;
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ลบดีลไม่สำเร็จ");
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

  const acceptQuotation = async (quote) => {
    if (!window.confirm(`Accept quotation ${quote.quoteNumber}?`)) return;
    setQuoteLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${quote.id}/accept`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "accept quotation ไม่สำเร็จ");
      await loadQuotations(quoteDeal);
      await load();
    } catch (e) {
      setError(e.message || "accept quotation ไม่สำเร็จ");
    } finally {
      setQuoteLoading(false);
    }
  };

  const changeQuotationApproval = async (quote, action) => {
    const label = action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Request approval for";
    if (!window.confirm(`${label} quotation ${quote.quoteNumber}?`)) return;
    setQuoteLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/quotations/${quote.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "update quotation approval failed");
      await loadQuotations(quoteDeal);
      await load();
    } catch (e) {
      setError(e.message || "update quotation approval failed");
    } finally {
      setQuoteLoading(false);
    }
  };

  // เปิดโมดัลสร้างโครงการ PM (เหมือนหน้า PM) พร้อมเติมค่าแนะนำจากดีล — ปรับแก้ได้
  const openCreatePM = (deal) => {
    setPmDeal(deal);
    setPmInitial({
      name: deal.title || "",
      customerId: deal.customerId || "",
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: deal.expectedCloseDate || "",
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

  // ปิดดีลเป็น Won — เปิดโมดัลรับ "มูลค่าปิดจริง" (prefill = คาดการณ์) ก่อนยืนยัน
  const [winDeal, setWinDeal] = useState(null);
  const [winValue, setWinValue] = useState("");
  const [winMonth, setWinMonth] = useState(thisMonth());
  // เดือนที่ปิด (Won) เริ่มที่เดือนพยากรณ์ของดีล — ปรับได้ถ้าปิดคนละเดือน. เดือนนี้จะย้าย
  // ทั้ง FC และ AT มาอยู่ด้วยกัน (แล้วล็อก) เพื่อเทียบ TG/FC/AT ในเดือนเดียวกัน
  const openWin = (deal) => { setWinDeal(deal); setWinValue(deal.projectValue ?? ""); setWinMonth(deal.forecastMonth || thisMonth()); };
  const submitWin = async () => {
    if (!winDeal) return;
    const v = Number(winValue);
    if (!Number.isFinite(v) || v <= 0) { setError("ต้องระบุมูลค่าปิดจริง (Won) มากกว่า 0"); return; }
    setWinningDealId(winDeal.id);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${winDeal.id}/win`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wonValue: v, wonMonth: winMonth }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "ปิดดีลไม่สำเร็จ");
      setWinDeal(null);
      await load();
    } catch (e) {
      setError(e.message || "ปิดดีลไม่สำเร็จ");
    } finally {
      setWinningDealId(null);
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

      {canEdit && (
        <button type="button" className="btn btn-primary" onClick={openNewDeal}>
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
    (sum, d) => sum + Number(d.wonValue || d.projectValue || 0),
    0,
  );
  const lostDeals = kpiDeals.filter((d) => d.stage === "lost");

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title="บริหารงานขาย — ดีล"
      subtitle="จัดการดีลขาย (พัฒนากลิ่น / พัฒนาสินค้า / สั่งผลิตซ้ำ) และส่งต่อโครงการ PM"
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-5">
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
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                <KpiCard 
                  icon={<FolderKanban size={20} />} 
                  label="จำนวนดีลทั้งหมด" 
                  value={totalDeals}
                  color="var(--blue)"
                />
                <KpiCard 
                  icon={<Trophy size={20} />} 
                  label="ยอดไปป์ไลน์" 
                  value={fmtMoney(pipelineValue)}
                  color="var(--amber)"
                />
                <KpiCard 
                  icon={<CheckCircle2 size={20} />} 
                  label="ปิดสำเร็จ (Won)" 
                  value={wonDeals.length}
                  hint={wonValue > 0 ? fmtMoney(wonValue) : null}
                  color="var(--green)"
                />
                <KpiCard 
                  icon={<Ban size={20} />} 
                  label="ไม่ไปต่อ (Lost)" 
                  value={lostDeals.length}
                  color="var(--red)"
                />
              </div>
            </>
          )}

          <section className="glass-panel" style={{ padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 280 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาดีล / ลูกค้า / ผู้ดูแล / สูตร" aria-label="ค้นหาดีล" />
            </div>
            <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="premium-select" aria-label="กรอง stage" style={{ width: 180 }}>
              <option value="all">ทุก stage</option>
              {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </Select>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="premium-select" aria-label="กรองประเภทดีล" style={{ width: 170 }}>
              <option value="all">ทุกประเภท</option>
              {DEAL_TYPES.map((t) => <option key={t} value={t}>{DEAL_TYPE_LABELS[t]}</option>)}
            </Select>

            <div className="spacer" />
            <SortControl
              value={sortKey}
              onChange={(event) => { setSortKey(event.target.value); setSortDir("asc"); }}
              options={SORT_OPTIONS}
              direction={sortDir}
              onDirectionChange={setSortDir}
              selectStyle={{ width: 120 }}
            />
            <span className="ui-badge">{filteredDeals.length} ดีล</span>
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
                {filteredDeals.map((deal) => (
                  <DetailRow key={deal.id} href={`/sa/deals/${deal.id}`} className="premium-row">
                    <td>
                      <Link href={`/sa/deals/${deal.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้ารายละเอียดดีล">
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
                      <Link className="btn ghost" href={`/sa/deals/${deal.id}?tab=timeline`} title="เปิดไทม์ไลน์ของดีล" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 96, justifyContent: "center" }}>
                        <PackageCheck size={14} aria-hidden="true" /> ไทม์ไลน์
                      </Link>
                    </td>
                    {SALES_FEATURES.quotations && (
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <Link className="btn ghost" href={`/sa/deals/${deal.id}?tab=quotations`} title="เปิดใบเสนอราคาของดีล" style={{ minWidth: 96, justifyContent: "center" }}>
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
                        {deal.canEdit && !["won", "in_project", "lost"].includes(deal.stage) && (
                          <button type="button" className="btn btn-success sm" onClick={() => openWin(deal)} disabled={winningDealId === deal.id} title="ปิดดีลเป็น Won (นับยอด + ปิด forecast)">
                            <Trophy size={14} aria-hidden="true" /> {winningDealId === deal.id ? "..." : "Won"}
                          </button>
                        )}
                        {deal.canEdit && (
                          <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={() => openEditDeal(deal)} aria-label={`แก้ไข ${deal.title}`} title="แก้ไขดีล">
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                        )}
                        {deal.canEdit && (!["won", "in_project"].includes(deal.stage) || superuser) && !deal.metadata?.sahamitPoId && (
                          <button type="button" className="btn-icon danger" onClick={() => deleteDeal(deal)} aria-label={`ลบ ${deal.title}`} title="ลบดีล (ลบโครงการ PM ที่ผูกพ่วงด้วย)">
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
                      ยังไม่มีดีลในเดือนนี้ {canEdit ? "เริ่มจากปุ่มเพิ่มดีลด้านบน" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal open={dealModal} onClose={() => setDealModal(false)} title={dealForm.id ? "แก้ไขดีล" : "เพิ่มดีล"} size="lg">
        <form onSubmit={saveDeal} className="form-grid cols-2" aria-busy={submitting} style={{ padding: 18 }}>
          <DealFormFields
            form={dealForm}
            onPatch={(patch) => setDealForm((f) => ({ ...f, ...patch }))}
            customers={customers}
            categories={categories}
            stages={PIPELINE_STAGES.filter((st) => st !== "won" || dealForm.stage === "won")}
            alreadyWon={dealForm.stage === "won"}
            onCustomersUpdated={(uc) => setCustomers((prev) => prev.map((c) => (c.id === uc.id ? uc : c)))}
            extra={dealForm.stage === "won" ? (
              <label>
                มูลค่าปิดจริง (Won)
                <MoneyInput value={dealForm.wonValue} onChange={(value) => setDealForm({ ...dealForm, wonValue: value ?? "" })} />
              </label>
            ) : null}
          />
          <div className="form-action-bar">
            <button type="button" className="btn" onClick={() => setDealModal(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!winDeal} onClose={() => winningDealId ? null : setWinDeal(null)} title="ปิดการขาย (Won)" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            ปิดดีล <strong>{winDeal?.title}</strong> — ยืนยันว่าได้รับมัดจำ/ยืนยันแล้ว กรอก <strong>มูลค่าปิดจริง</strong> (นับเข้าเป้า)
          </div>
          <label style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            มูลค่าปิดจริง (บาท)
            <MoneyInput value={winValue} onChange={(value) => setWinValue(value ?? "")} autoFocus />
          </label>
          {winDeal && Number(winDeal.projectValue) > 0 && Number(winValue) > 0 && Number(winValue) !== Number(winDeal.projectValue) && (
            <div style={{ fontSize: 12, color: "var(--amber)" }}>ต่างจากคาดการณ์ ({money(winDeal.projectValue)}) {money(Number(winDeal.projectValue) - Number(winValue))}</div>
          )}
          <label style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            เดือนที่ปิด (Won) <span style={{ fontSize: 11, color: "var(--text-3)" }}>— ยอด AT และ FC จะย้ายมาเดือนนี้ แล้วล็อก</span>
            <div style={{ display: "flex", gap: 8 }}>
              <MonthPicker value={winMonth} onChange={setWinMonth} />
            </div>
          </label>
          <div className="form-action-bar">
            <button type="button" className="btn ghost" onClick={() => setWinDeal(null)} disabled={!!winningDealId}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={submitWin} disabled={!!winningDealId || !(Number(winValue) > 0)}>
              <CheckCircle2 size={14} aria-hidden="true" /> {winningDealId ? "กำลังบันทึก..." : "ยืนยัน Won"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={quoteModal} onClose={() => setQuoteModal(false)} title={`Quotation${quoteDeal?.title ? ` · ${quoteDeal.title}` : ""}`} size="lg">
        <div style={{ padding: 18 }}>
          <div className="flex items-center gap-2 mb-3">
            <div style={{ color: "var(--text-3)", fontSize: 12 }}>
              {quoteDeal?.projectId ? "สร้าง line จาก FG ใน PM project และ freeze ราคาขาย ณ วันที่สร้าง" : "ต้องสร้าง/ผูก PM project และ FG ก่อนจึง seed quotation อัตโนมัติได้"}
            </div>
            <div className="spacer" />
            {quoteDeal?.canEdit && (
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
                  <th>การอนุมัติ</th>
                  <th>รายการ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quote) => (
                  <tr key={quote.id} className="premium-row">
                    <td className="mono">{quote.quoteNumber}</td>
                    <td>{stageBadge(quote.status === "accepted" ? "won" : "quotation")}</td>
                    <td>{quote.quoteDate || "-"}</td>
                    <td className="num mono">{money(quote.totalAmount)}</td>
                    <td>
                      {stageBadge(quote.approvalStatus || "not_required")}
                      {quote.approvalReason && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{quote.approvalReason}</span>}
                    </td>
                    <td>
                      {(quote.lines || []).length ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {(quote.lines || []).slice(0, 3).map((line) => (
                            <li key={line.id}>
                              {line.description} · <span className="mono">{line.qty}</span> x <span className="mono">{money(line.unitPrice)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : "-"}
                    </td>
                    <td className="num">
                      {quote.status !== "accepted" && (
                        <div className="flex items-center gap-2 justify-end">
                          {quoteDeal?.canEdit && (quote.approvalStatus || "not_required") === "not_required" && (
                            <button type="button" className="btn ghost" onClick={() => changeQuotationApproval(quote, "request")} disabled={quoteLoading}>
                              ขออนุมัติ
                            </button>
                          )}
                          {canReview && quote.approvalStatus === "pending" && (
                            <>
                              <button type="button" className="btn ghost" onClick={() => changeQuotationApproval(quote, "reject")} disabled={quoteLoading}>
                                ตีกลับ
                              </button>
                              <button type="button" className="btn ghost" onClick={() => changeQuotationApproval(quote, "approve")} disabled={quoteLoading}>
                                อนุมัติ
                              </button>
                            </>
                          )}
                          {quoteDeal?.canEdit && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => acceptQuotation(quote)}
                              disabled={quoteLoading || ["pending", "rejected"].includes(quote.approvalStatus || "not_required")}
                              title={["pending", "rejected"].includes(quote.approvalStatus || "not_required") ? "ต้องอนุมัติก่อนจึงรับใบเสนอได้" : undefined}
                            >
                              รับใบเสนอ
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!quotations.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีใบเสนอราคาสำหรับดีลนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

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
    </Workspace>
  );
}
