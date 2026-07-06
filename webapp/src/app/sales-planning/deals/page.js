"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, ExternalLink, FileText, FolderKanban, Plus, RefreshCcw, Save, Search, Trash2, Truck } from "lucide-react";
import Modal from "@/components/Modal";
import Workspace from "@/components/ui/Workspace";
import { useCan } from "@/lib/roleContext";
import { DEAL_STAGES, STAGE_LABELS } from "@/lib/salesPlanning";
import { initialDealForm, money, stageBadge, thisMonth } from "@/components/salesPlanning/ui";

export default function SalesPlanningPipelinePage() {
  const canEdit = useCan("salesplan:edit");
  const canReview = useCan("salesplan:review");
  const [month, setMonth] = useState(thisMonth());
  const [deals, setDeals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
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
  const [creatingProjectId, setCreatingProjectId] = useState(null);
  const [shippingDealId, setShippingDealId] = useState(null);
  const [winningDealId, setWinningDealId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dealsRes, customersRes] = await Promise.all([
        fetch(`/api/sales-planning/deals?month=${encodeURIComponent(month)}`),
        fetch("/api/master/customers"),
      ]);
      if (!dealsRes.ok) throw new Error((await dealsRes.json()).error || "โหลด pipeline ไม่สำเร็จ");
      setDeals(await dealsRes.json());
      setCustomers(customersRes.ok ? await customersRes.json() : []);
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deals.filter((deal) => {
      if (stageFilter !== "all" && deal.stage !== stageFilter) return false;
      if (!q) return true;
      return [deal.title, deal.customerName, deal.ownerName, deal.notes].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [deals, query, stageFilter]);

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
      projectValue: deal.projectValue ?? "",
      probability: deal.probability ?? "",
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
      if (!res.ok) throw new Error((await res.json()).error || "บันทึก deal ไม่สำเร็จ");
      setDealModal(false);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึก deal ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteDeal = async (deal) => {
    if (!window.confirm(`ลบ deal "${deal.title}"?`)) return;
    setError("");
    const res = await fetch(`/api/sales-planning/deals/${deal.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error || "ลบ deal ไม่สำเร็จ");
    await load();
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

  const createProject = async (deal) => {
    if (!window.confirm(`สร้าง PM project จาก deal "${deal.title}"?`)) return;
    setCreatingProjectId(deal.id);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || "สร้าง PM project ไม่สำเร็จ");
      await load();
    } catch (e) {
      setError(e.message || "สร้าง PM project ไม่สำเร็จ");
    } finally {
      setCreatingProjectId(null);
    }
  };

  // ส่งต่อคลัง: สร้างเอกสารเตรียมส่งของจากโครงการที่ผูกกับ deal (idempotent ฝั่ง PM)
  // แล้วเปิดหน้า PM shipment-prep เพื่อดู/พิมพ์ ส่งให้คลังดำเนินการ.
  const createShipmentPrep = async (deal) => {
    if (!deal.projectId) return;
    if (!window.confirm(`สร้างเอกสารเตรียมส่งของจากโครงการของ deal "${deal.title}"?`)) return;
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
      window.open(`/pm/projects/${deal.projectId}/shipment-prep`, "_blank", "noopener");
    } catch (e) {
      setError(e.message || "สร้างเอกสารส่งของไม่สำเร็จ");
    } finally {
      setShippingDealId(null);
    }
  };

  // ปิดดีลเป็น Won ในคลิกเดียว — นับเป็นยอด + ปิด forecast (ผ่าน markWon กลาง).
  const markDealWon = async (deal) => {
    if (!window.confirm(`ปิดดีล "${deal.title}" เป็น Won?\nยืนยันว่าได้รับมัดจำ/ยืนยันจากลูกค้าแล้ว — จะนับเป็นยอดและปิด forecast ของดีลนี้`)) return;
    setWinningDealId(deal.id);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${deal.id}/win`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "ปิดดีลไม่สำเร็จ");
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

  const headerRight = (
    <>
      <input type="month" aria-label="เดือน forecast" className="premium-input" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 150 }} />
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
      {canEdit && (
        <button type="button" className="btn btn-primary" onClick={openNewDeal}>
          <Plus size={15} aria-hidden="true" /> เพิ่ม deal
        </button>
      )}
    </>
  );

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title="แผนงานขาย — ดีล (Pipeline)"
      subtitle="จัดการดีล / โอกาสการขาย และส่งต่อ PM · ใบเสนอราคา · ส่งของ · ปิดดีล"
      back={{ href: "/sales-planning", label: "กลับไปภาพรวม" }}
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
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหา deal / ลูกค้า / owner" aria-label="ค้นหา deal" />
            </div>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="premium-select" aria-label="กรอง stage" style={{ width: 180 }}>
              <option value="all">ทุก stage</option>
              {DEAL_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
            <div className="spacer" />
            <span className="ui-badge">{filteredDeals.length} deals</span>
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>ดีล</th>
                  <th>สถานะ</th>
                  <th>เจ้าของ</th>
                  <th className="num">มูลค่า</th>
                  <th className="num">โอกาส</th>
                  <th className="num">คาดการณ์</th>
                  <th>PM</th>
                  <th>ใบเสนอ</th>
                  <th>เอกสาร</th>
                  <th>ส่ง</th>
                  <th>360</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal) => (
                  <tr key={deal.id} className="premium-row">
                    <td>
                      <button type="button" className="linklike text-left" onClick={() => openEditDeal(deal)} disabled={!deal.canEdit} title={deal.canEdit ? undefined : "แก้ได้เฉพาะเจ้าของ deal"}>
                        <strong>{deal.title}</strong>
                        <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{deal.customerName || "-"}</span>
                      </button>
                    </td>
                    <td>{stageBadge(deal.stage)}</td>
                    <td>{deal.ownerName || deal.team || "-"}</td>
                    <td className="num mono">{money(deal.projectValue)}</td>
                    <td className="num mono">{deal.probability || 0}%</td>
                    <td className="num mono">{money(Number(deal.projectValue || 0) * Number(deal.probability || 0) / 100)}</td>
                    <td>
                      {deal.projectId ? (
                        <a className="btn ghost" href={`/pm/projects/${deal.projectId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <ExternalLink size={14} aria-hidden="true" /> PM
                        </a>
                      ) : deal.canEdit && deal.stage !== "lost" ? (
                        <button type="button" className="btn ghost" onClick={() => createProject(deal)} disabled={creatingProjectId === deal.id}>
                          <Plus size={14} aria-hidden="true" /> {creatingProjectId === deal.id ? "กำลังสร้าง..." : "สร้าง PM"}
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>-</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn ghost" onClick={() => openQuotations(deal)}>
                        <FileText size={14} aria-hidden="true" /> ใบเสนอ
                      </button>
                    </td>
                    <td>
                      <button type="button" className="btn ghost" onClick={() => openDocuments(deal)}>
                        <ClipboardList size={14} aria-hidden="true" /> เอกสาร
                      </button>
                    </td>
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
                    <td>
                      <a className="btn ghost" href={`/sales-planning/deals/${deal.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <ExternalLink size={14} aria-hidden="true" /> 360
                      </a>
                    </td>
                    <td className="num">
                      <div className="flex items-center gap-2 justify-end">
                        {deal.canEdit && !["won", "in_project", "lost"].includes(deal.stage) && (
                          <button type="button" className="btn ghost" onClick={() => markDealWon(deal)} disabled={winningDealId === deal.id} title="ปิดดีลเป็น Won (นับยอด + ปิด forecast)">
                            <CheckCircle2 size={14} aria-hidden="true" /> {winningDealId === deal.id ? "..." : "Won"}
                          </button>
                        )}
                        {deal.canEdit && (
                          <button type="button" className="btn icon-only ghost" onClick={() => deleteDeal(deal)} aria-label={`ลบ ${deal.title}`}>
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredDeals.length && (
                  <tr>
                    <td colSpan={12} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>
                      ยังไม่มีดีลในเดือนนี้ {canEdit ? "เริ่มจากปุ่มเพิ่ม deal ด้านบน" : ""}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal open={dealModal} onClose={() => setDealModal(false)} title={dealForm.id ? "แก้ไข deal" : "เพิ่ม deal"} size="lg">
        <form onSubmit={saveDeal} className="form-grid" aria-busy={submitting} style={{ padding: 18 }}>
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
            สถานะ
            <select className="premium-select" value={dealForm.stage} onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value })}>
              {DEAL_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
            </select>
          </label>
          <label>
            เดือนพยากรณ์
            <input type="month" className="premium-input" value={dealForm.forecastMonth} onChange={(e) => setDealForm({ ...dealForm, forecastMonth: e.target.value })} />
          </label>
          <label>
            มูลค่าโครงการ
            <input type="number" min="0" step="0.01" className="premium-input mono" value={dealForm.projectValue} onChange={(e) => setDealForm({ ...dealForm, projectValue: e.target.value })} />
          </label>
          <label>
            โอกาส (%)
            <input type="number" min="0" max="100" step="1" className="premium-input mono" value={dealForm.probability} onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })} />
          </label>
          <label>
            คาดปิดได้ (วันที่)
            <input type="date" className="premium-input" value={dealForm.expectedCloseDate} onChange={(e) => setDealForm({ ...dealForm, expectedCloseDate: e.target.value })} />
          </label>
          <label className="flex items-center gap-2" style={{ alignSelf: "end", minHeight: 40 }}>
            <input type="checkbox" checked={dealForm.depositPaid} onChange={(e) => setDealForm({ ...dealForm, depositPaid: e.target.checked })} />
            ได้รับมัดจำแล้ว
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            หมายเหตุ
            <textarea className="premium-input" rows={3} value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} />
          </label>
          <div className="drawer-actions" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="btn" onClick={() => setDealModal(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Save size={15} aria-hidden="true" /> {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
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
                <input type="date" className="premium-input" value={docForm.dueDate} onChange={(e) => setDocForm({ ...docForm, dueDate: e.target.value })} />
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
      </Modal>
    </Workspace>
  );
}
