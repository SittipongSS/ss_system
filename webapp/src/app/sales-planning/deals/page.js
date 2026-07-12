"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, FileText, FolderKanban, PackageCheck, Pencil, Plus, Save, Search, Trash2, Truck, Trophy } from "lucide-react";
import Modal from "@/components/Modal";
import Workspace from "@/components/ui/Workspace";
import SlidePanel from "@/components/ui/SlidePanel";
import FormattedNumberInput from "@/components/ui/FormattedNumberInput";
import DatePicker from "@/components/ui/DatePicker";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { DEAL_STAGES, DEAL_TYPES, DEAL_TYPE_LABELS, SALES_FEATURES, STAGE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, MonthPicker, dealTypeBadge, forecastBadge, initialDealForm, money, snapForecastLevel, stageBadge, thisMonth } from "@/components/salesPlanning/ui";
import { fmtMoney, fmtName } from "@/lib/format";
import { brandThList } from "@/lib/master/brands";
import AddBrandButton from "@/components/master/AddBrandButton";

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
  const [docLoading, setDocLoading] = useState(false);
  const [docForm, setDocForm] = useState({ kind: "customer_brief", title: "", status: "pending", dueDate: "", notes: "" });
  const [shippingDealId, setShippingDealId] = useState(null);
  const [winningDealId, setWinningDealId] = useState(null);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmDeal, setPmDeal] = useState(null);
  const [pmInitial, setPmInitial] = useState(null);
  const [dealToDelete, setDealToDelete] = useState(null);
  
  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", action: null, isDanger: false, confirmLabel: "ยืนยัน" });
  const requestConfirm = (title, message, action, confirmLabel = "ยืนยัน", isDanger = false) => {
    setConfirmState({ open: true, title, message, action, confirmLabel, isDanger });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dealsRes, customersRes] = await Promise.all([
        // ตัวกรอง "รอเติมข้อมูล" ต้องดึงทุกเดือน (deal backfill มี forecastMonth=null)
        fetch((allMonths || reviewOnly) ? "/api/sales-planning/deals" : `/api/sales-planning/deals?month=${encodeURIComponent(month)}`),
        fetch("/api/master/customers"),
      ]);
      if (!dealsRes.ok) throw new Error((await dealsRes.json()).error || "โหลดดีลไม่สำเร็จ");
      setDeals(await dealsRes.json());
      setCustomers(customersRes.ok ? await customersRes.json() : []);
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
    return deals.filter((deal) => {
      if (reviewOnly && !deal.metadata?.needsReview) return false;
      if (stageFilter !== "all" && deal.stage !== stageFilter) return false;
      if (typeFilter !== "all" && dealTypeOf(deal) !== typeFilter) return false;
      if (!q) return true;
      return [deal.title, deal.customerName, deal.ownerName, deal.notes, deal.formulaName].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [deals, query, stageFilter, typeFilter, reviewOnly]);

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
      brand: deal.metadata?.brand || "",
      projectValue: deal.projectValue ?? "",
      wonValue: deal.wonValue ?? "",
      probability: snapForecastLevel(deal.probability),
      forecastMonth: deal.forecastMonth || month,
      expectedCloseDate: deal.expectedCloseDate || "",
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

  const confirmDelete = (deal) => {
    setDealToDelete(deal);
  };

  const deleteDeal = async () => {
    if (!dealToDelete) return;
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${dealToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ลบดีลไม่สำเร็จ");
      setDealToDelete(null);
      await load();
    } catch (e) {
      setError(e.message || "ลบดีลไม่สำเร็จ");
      setDealToDelete(null);
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

  const acceptQuotation = (quote) => {
    requestConfirm("รับใบเสนอราคา", `ยืนยันรับใบเสนอราคา ${quote.quoteNumber}?`, async () => {
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
    });
  };

  const changeQuotationApproval = (quote, action) => {
    const label = action === "approve" ? "อนุมัติ" : action === "reject" ? "ตีกลับ" : "ขออนุมัติ";
    requestConfirm(label, `ยืนยัน${label}ใบเสนอราคา ${quote.quoteNumber}?`, async () => {
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
    });
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
  const createShipmentPrep = (deal) => {
    if (!deal.projectId) return;
    requestConfirm("เตรียมส่งของ", `สร้างเอกสารเตรียมส่งของจากโครงการ "${deal.title}"?`, async () => {
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
    });
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

  const deleteDocument = (doc) => {
    requestConfirm("ลบเอกสาร", `ยืนยันการลบเอกสาร "${doc.title}"?`, async () => {
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
    }, "ลบเอกสาร", true);
  };

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

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title="บริหารงานขาย — ดีล"
      subtitle="จัดการดีลขาย (พัฒนากลิ่น / พัฒนาสินค้า / สั่งผลิตซ้ำ) และส่งต่อโครงการ PM"
      back={{ href: "/sa", label: "กลับไปภาพรวม" }}
      headerRight={headerRight}
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>
            {error}
          </div>
        )}

        <section className="glass-panel" style={{ padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="search-glass" style={{ width: 280 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาดีล / ลูกค้า / ผู้ดูแล / สูตร" aria-label="ค้นหาดีล" />
            </div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="premium-select" aria-label="กรอง stage" style={{ width: 180 }}>
              <option value="all">ทุก stage</option>
              {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="premium-select" aria-label="กรองประเภทดีล" style={{ width: 170 }}>
              <option value="all">ทุกประเภท</option>
              {DEAL_TYPES.map((t) => <option key={t} value={t}>{DEAL_TYPE_LABELS[t]}</option>)}
            </select>

            <div className="spacer" />
            <span className="ui-badge">{filteredDeals.length} ดีล</span>
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>ดีล</th>
                  <th>สถานะ</th>
                  <th>ประเภท</th>
                  <th>ผู้ดูแล (AE)</th>
                  <th className="num">มูลค่า</th>
                  <th>ไทม์ไลน์</th>
                  {SALES_FEATURES.quotations && <th>ใบเสนอ</th>}
                  {SALES_FEATURES.documents && <th>เอกสาร</th>}
                  {SALES_FEATURES.shipment && <th>ส่ง</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal) => (
                  <tr key={deal.id} className="premium-row">
                    <td>
                      <Link href={`/sa/deals/${deal.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้ารายละเอียดดีล">
                        <strong>
                          {deal.title}
                          {deal.forecastDrift?.hasDrift && (
                            <AlertTriangle size={13} aria-label="FC ล่าสุดเปลี่ยนจากตอน map" title={`FC รอบ #${deal.forecastDrift.latestRoundNo} เปลี่ยนจากตอนสร้างโครงการ`} style={{ color: "var(--amber)", marginLeft: 6, verticalAlign: "-1px" }} />
                          )}
                        </strong>
                        <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{deal.customerName || "-"}{deal.metadata?.brand ? ` · ${deal.metadata.brand}` : ""}</span>
                      </Link>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {stageBadge(deal.stage)}
                        {!["won", "in_project", "lost"].includes(deal.stage) && forecastBadge(deal.probability)}
                      </div>
                    </td>
                    <td>
                      {dealTypeBadge(dealTypeOf(deal))}
                    </td>
                    <td>{deal.ownerName ? fmtName(deal.ownerName) : (deal.team || "-")}</td>
                    <td className="num mono" title={["won", "in_project"].includes(deal.stage) ? "มูลค่าปิดจริง (Won)" : "มูลค่าคาดการณ์"}>
                      {["won", "in_project"].includes(deal.stage) ? fmtMoney(deal.wonValue ?? deal.projectValue) : fmtMoney(deal.projectValue)}
                    </td>
                    <td>
                      {deal.projectId ? (
                        <a className="btn ghost" href={`/sa/projects/${deal.projectId}`} title="จัดการไทม์ไลน์" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <PackageCheck size={14} aria-hidden="true" /> จัดการ
                        </a>
                      ) : deal.canEdit && deal.stage !== "lost" ? (
                        <button type="button" className="btn ghost" onClick={() => openCreatePM(deal)} title="สร้างไทม์ไลน์ (ยังไม่มี)">
                          <Plus size={14} aria-hidden="true" /> สร้าง
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>-</span>
                      )}
                    </td>
                    {SALES_FEATURES.quotations && (
                      <td>
                        <button type="button" className="btn ghost" onClick={() => openQuotations(deal)}>
                          <FileText size={14} aria-hidden="true" /> ใบเสนอ
                        </button>
                      </td>
                    )}
                    {SALES_FEATURES.documents && (
                      <td>
                        <button type="button" className="btn ghost" onClick={() => openDocuments(deal)}>
                          <ClipboardList size={14} aria-hidden="true" /> เอกสาร
                        </button>
                      </td>
                    )}
                    {SALES_FEATURES.shipment && (
                      <td>
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
                    <td className="num">
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
                          <button type="button" className="btn-icon danger" onClick={() => confirmDelete(deal)} aria-label={`ลบ ${deal.title}`} title="ลบดีล (ลบโครงการ PM ที่ผูกพ่วงด้วย)">
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredDeals.length && (
                  <tr>
                    <td colSpan={7 + (SALES_FEATURES.quotations ? 1 : 0) + (SALES_FEATURES.documents ? 1 : 0) + (SALES_FEATURES.shipment ? 1 : 0)} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีดีลในเดือนนี้ {canEdit ? "เริ่มจากปุ่มเพิ่มดีลด้านบน" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <SlidePanel 
        isOpen={dealModal} 
        onClose={() => setDealModal(false)} 
        title={dealForm.id ? "แก้ไขดีล" : "เพิ่มดีล"}
        width="max-w-xl"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDealModal(false)}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={saveDeal} disabled={submitting}>
              <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </>
        }
      >
        <form onSubmit={saveDeal} className="form-grid" aria-busy={submitting}>
          <label>
            ชื่อดีล
            <input className="premium-input" value={dealForm.title} onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })} required />
          </label>
          <label>
            ลูกค้า
            <select className="premium-select" value={dealForm.customerId} onChange={(e) => setDealForm({ ...dealForm, customerId: e.target.value })}>
              <option value="">ไม่ผูกฐานข้อมูลลูกค้า</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            ประเภทดีล
            <select className="premium-select" value={dealForm.dealType} onChange={(e) => setDealForm({ ...dealForm, dealType: e.target.value })}>
              {DEAL_TYPES.map((t) => <option key={t} value={t}>{t} · {DEAL_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          {dealForm.dealType === "SCENT" && (
            <label>
              ชื่อสูตรกลิ่น
              <input className="premium-input" value={dealForm.formulaName} onChange={(e) => setDealForm({ ...dealForm, formulaName: e.target.value })} placeholder="เช่น SS-FLORAL-0042 (เชื่อม RD ในอนาคต)" />
            </label>
          )}
          <label>
            แบรนด์
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select className="premium-select" style={{ flex: 1, minWidth: 0 }} value={dealForm.brand} onChange={(e) => setDealForm({ ...dealForm, brand: e.target.value })} disabled={!dealForm.customerId}>
                <option value="">{dealForm.customerId ? "— ไม่ระบุแบรนด์ —" : "เลือกลูกค้าก่อน"}</option>
                {(() => {
                  const opts = brandThList((customers.find((c) => c.id === dealForm.customerId)?.brands) || []);
                  const withCur = dealForm.brand && !opts.includes(dealForm.brand) ? [dealForm.brand, ...opts] : opts;
                  return withCur.map((b) => <option key={b} value={b}>{b}</option>);
                })()}
              </select>
              <AddBrandButton
                customerId={dealForm.customerId}
                disabled={!dealForm.customerId}
                onAdded={(b, updatedCustomer) => {
                  setCustomers((prev) => prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c)));
                  setDealForm((f) => ({ ...f, brand: b.th || b.en }));
                }}
              />
            </span>
          </label>
          <label>
            สถานะ
            {/* ปิด Won ใช้ปุ่ม "Won" (กรอกมูลค่าจริง) — ไม่ให้เลือก won จาก dropdown เว้นแต่ดีลนี้ won อยู่แล้ว */}
            <select className="premium-select" value={dealForm.stage} onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value })}>
              {PIPELINE_STAGES.filter((s) => s !== "won" || dealForm.stage === "won").map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
          </label>
          <label>
            โอกาสที่จะปิดได้ (FC%)
            <select className="premium-select" value={snapForecastLevel(dealForm.probability)} onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })}>
              {FORECAST_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label>
            เดือนพยากรณ์
            <input type="month" className="premium-input" value={dealForm.forecastMonth} onChange={(e) => setDealForm({ ...dealForm, forecastMonth: e.target.value })} />
          </label>
          <label>
            มูลค่าคาดการณ์{dealForm.stage === "won" ? " (ล็อกหลังปิด Won)" : ""}
            <FormattedNumberInput 
              value={dealForm.projectValue} 
              disabled={dealForm.stage === "won"} 
              onChange={(v) => setDealForm({ ...dealForm, projectValue: v })} 
              className="premium-input"
            />
          </label>
          {dealForm.stage === "won" && (
            <label>
              มูลค่าปิดจริง (Won)
              <FormattedNumberInput 
                value={dealForm.wonValue} 
                onChange={(v) => setDealForm({ ...dealForm, wonValue: v })} 
                className="premium-input"
              />
            </label>
          )}
          <label>
            คาดปิดได้ (วันที่)
            <DatePicker 
              value={dealForm.expectedCloseDate} 
              onChange={(v) => setDealForm({ ...dealForm, expectedCloseDate: v })} 
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            รายละเอียด
            <textarea className="premium-input" rows={3} value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} />
          </label>
        </form>
      </SlidePanel>

      <SlidePanel isOpen={!!winDeal} onClose={() => winningDealId ? null : setWinDeal(null)} title="ปิดการขาย (Won)" width="max-w-md" footer={<><button type="button" className="btn ghost" onClick={() => setWinDeal(null)} disabled={!!winningDealId}>ยกเลิก</button><button type="button" className="btn btn-primary" onClick={submitWin} disabled={!!winningDealId || !(Number(winValue) > 0)}><CheckCircle2 size={14} aria-hidden="true" /> {winningDealId ? "กำลังบันทึก..." : "ยืนยัน Won"}</button></>}>
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            ปิดดีล <strong>{winDeal?.title}</strong> — ยืนยันว่าได้รับมัดจำ/ยืนยันแล้ว กรอก <strong>มูลค่าปิดจริง</strong> (นับเข้าเป้า)
          </div>
          <label style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            มูลค่าปิดจริง (บาท)
            <FormattedNumberInput min={0} step={0.01} className="premium-input mono" value={winValue} onChange={(v) => setWinValue(v)} autoFocus />
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
        </div>
      </SlidePanel>

      <SlidePanel isOpen={quoteModal} onClose={() => setQuoteModal(false)} title={`Quotation${quoteDeal?.title ? ` · ${quoteDeal.title}` : ""}`} width="max-w-4xl">
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
      </SlidePanel>

      <SlidePanel isOpen={docModal} onClose={() => setDocModal(false)} title={`Documents${docDeal?.title ? ` · ${docDeal.title}` : ""}`} width="max-w-4xl">
        <div style={{ padding: 18 }}>
          {docDeal?.canEdit && (
            <form onSubmit={createDocument} className="form-grid" aria-busy={docLoading} style={{ marginBottom: 16 }}>
              <label>
                ประเภท
                <select className="premium-select" value={docForm.kind} onChange={(e) => setDocForm({ ...docForm, kind: e.target.value })}>
                  <option value="customer_brief">บรีฟลูกค้า</option>
                  <option value="quotation">ใบเสนอราคา</option>
                  <option value="deposit_proof">หลักฐานมัดจำ</option>
                  <option value="po">ใบสั่งซื้อ (PO)</option>
                  <option value="tax_docs">เอกสารภาษี</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </label>
              <label>
                ชื่อเอกสาร
                <input className="premium-input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} required />
              </label>
              <label>
                กำหนดส่ง
                <DatePicker value={docForm.dueDate} onChange={(v) => setDocForm({ ...docForm, dueDate: v })} />
              </label>
              <label>
                สถานะ
                <select className="premium-select" value={docForm.status} onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="received">รับแล้ว</option>
                  <option value="waived">ยกเว้น</option>
                </select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                หมายเหตุ
                <textarea className="premium-input" rows={2} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
              </label>
              <div className="drawer-actions" style={{ gridColumn: "1 / -1" }}>
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
      </SlidePanel>

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

      <ConfirmDialog
        isOpen={!!dealToDelete}
        onClose={() => setDealToDelete(null)}
        onConfirm={deleteDeal}
        title="ลบดีล"
        message={`คุณต้องการลบดีล "${dealToDelete?.title}" ใช่หรือไม่? ${dealToDelete?.projectId ? 'โครงการ (PM) ที่ผูกอยู่จะถูกลบพ่วงไปด้วย ' : ''}การลบนี้ไม่สามารถย้อนกลับได้`}
        confirmLabel="ลบดีล"
        isDanger={true}
      />
    </Workspace>
  );
}
