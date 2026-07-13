"use client";
import Select from "@/components/ui/Select";

// หน้าลีด (/sa/leads — Sales Revamp เฟส C): คิวรับลีดของ Marketing →
// คัดกรอง (Supervisor เลือกทีม) → กระจาย (Senior เลือก AE) → ติดต่อ/นัด → เปิดลูกค้า.
// SLA 1 วันทำการ (คัดกรอง + ติดต่อกลับ) วัดจาก timestamp อัตโนมัติ — โชว์บน KPI strip.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Plus, Search, Pencil, Trash2, PhoneCall, Users as UsersIcon, CalendarClock, CheckCircle2, Ban, Undo2, Filter, LineChart, FolderKanban, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import MoneyInput from "@/components/ui/MoneyInput";
import DateTimeInput from "@/components/ui/DateTimeInput";
import PhoneInput from "@/components/ui/PhoneInput";
import SortControl from "@/components/ui/SortControl";
import { canSeeLeadKpi } from "@/lib/permissions";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { isSuperuser, TEAMS, TEAM_LABELS } from "@/lib/permissions";
import { DEAL_TYPES, DEAL_TYPE_LABELS, DEAL_STAGES, STAGE_LABELS } from "@/lib/salesPlanning";
import { brandThList } from "@/lib/master/brands";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import {
  LEAD_CHANNELS, LEAD_CHANNEL_LABELS, CHANNEL_GROUP_COLORS, channelGroupOf, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS,
  SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, SERVICE_DETAIL_REQUIRED,
  MEETING_MODES, MEETING_MODE_LABELS, LEAD_TRANSITIONS,
} from "@/lib/sales/leads";
import { FORECAST_LEVELS, KpiCard, MonthPicker, thisMonth, initialDealForm, snapForecastLevel } from "@/components/salesPlanning/ui";
import { fmtDateTime, fmtMoney, fmtName } from "@/lib/format";

const ACTION_COLORS = {
  screen: 'var(--blue)',
  assign: 'var(--violet)',
  contact: 'var(--teal)',
  meeting: 'var(--teal)',
  create_deal: 'var(--green)',
  bounce: 'var(--amber)',
  disqualify: 'var(--red)'
};

const initialForm = {
  id: null, channel: "chatcone_line", contactName: "", company: "", email: "",
  contactChannel: "", phone: "", serviceInterest: "diffuser", serviceDetail: "",
  budget: "", details: "",
};

function statusBadge(status) {
  return (
    <span className="ui-badge" style={{ color: LEAD_STATUS_COLORS[status] || "var(--text-3)", borderColor: "color-mix(in srgb, currentColor 25%, transparent)", minWidth: 90, justifyContent: "center" }}>
      {LEAD_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function LeadsPage() {
  const canLead = useCan("salesplan:lead");
  const canView = useCan("salesplan:view");
  const role = useRole();
  const team = useTeam();
  const superuser = isSuperuser(role);
  const canCreate = role === 'marketing' || role === 'admin';
  const [meId, setMeId] = useState(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setMeId(me?.id || null))
      .catch(() => setMeId(null));
  }, []);

  const [leads, setLeads] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  // หมวดสินค้า (product-types) — DealFormFields ในโมดัลสร้างดีลใช้ (hotfix: state ตัวนี้
  // หลุดตอนแยกฟอร์มใน #287 ทำหน้า crash ตอนเปิดโมดัล)
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [sortKey, setSortKey] = useState("created");
  const [sortDir, setSortDir] = useState("desc");

  const SORT_OPTIONS = [
    { key: "created", label: "รับล่าสุด" },
    { key: "name", label: "ชื่อลูกค้า" },
    { key: "status", label: "สถานะ" },
    { key: "budget", label: "Budget" },
  ];

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />; // open = ยังไม่ปิด
  const [month, setMonth] = useState(thisMonth());
  const [allMonths, setAllMonths] = useState(false);
  const [busy, setBusy] = useState("");

  // modals
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [actionModal, setActionModal] = useState(null); // { lead, action }
  const [actTeam, setActTeam] = useState("");
  const [actAssignee, setActAssignee] = useState("");
  const [actReason, setActReason] = useState("");
  const [actMode, setActMode] = useState("online");
  const [actAt, setActAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadsRes, kpiRes] = await Promise.all([
        fetch("/api/sales-planning/leads"),
        fetch(`/api/sales-planning/leads/kpi?month=${allMonths ? "all" : encodeURIComponent(month)}`),
      ]);
      if (!leadsRes.ok) throw new Error((await leadsRes.json().catch(() => ({}))).error || "โหลดลีดไม่สำเร็จ");
      setLeads(await leadsRes.json());
      setKpi(kpiRes.ok ? await kpiRes.json() : null);
    } catch (e) {
      setError(e.message || "โหลดลีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month, allMonths]);

  useEffect(() => { load(); }, [load]);

  // รายชื่อ AE (มอบหมาย) + ลูกค้า (qualify) — โหลดเมื่อ role ทำงานคิวได้เท่านั้น
  useEffect(() => {
    if (role === "marketing" || !canLead) return;
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/master/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [role, canLead]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = leads.filter((l) => {
      if (statusFilter === "open" && ["qualified", "disqualified"].includes(l.status)) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.contactName, l.company, l.phone, l.email, l.details, l.assigneeName].some((v) => (v || "").toLowerCase().includes(q));
    });
    
    const mul = sortDir === "desc" ? -1 : 1;
    return result.sort((a, b) => {
      if (sortKey === "name") return (a.contactName || "").localeCompare(b.contactName || "", "th") * mul;
      if (sortKey === "status") return ((LEAD_STATUSES.indexOf(a.status) || 99) - (LEAD_STATUSES.indexOf(b.status) || 99)) * mul;
      if (sortKey === "budget") return ((a.budget || 0) - (b.budget || 0)) * mul;
      return ((a.createdAt || "") < (b.createdAt || "") ? 1 : -1) * mul;
    });
  }, [leads, query, statusFilter, sortKey, sortDir]);

  const countBy = useMemo(() => {
    const c = {};
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1;
    return c;
  }, [leads]);

  const saveLead = async (e) => {
    e.preventDefault();
    setBusy("save");
    setError("");
    try {
      const res = await fetch(form.id ? `/api/sales-planning/leads/${form.id}` : "/api/sales-planning/leads", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกลีดไม่สำเร็จ");
      setFormOpen(false);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึกลีดไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const openAction = (lead, action) => {
    setActionModal({ lead, action });
    setActTeam(lead.team || "");
    setActAssignee("");
    setActReason("");
    setActMode("online");
    setActAt(new Date().toISOString().slice(0, 16));
  };

  const submitAction = async () => {
    const { lead, action } = actionModal || {};
    if (!lead) return;
    setBusy("action");
    setError("");
    try {
      const assignee = users.find((u) => u.id === actAssignee);
      const res = await fetch(`/api/sales-planning/leads/${lead.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          team: actTeam || undefined,
          assigneeId: actAssignee || undefined,
          assigneeName: assignee ? fmtName(assignee) : undefined,
          reason: actReason || undefined,
          meetingMode: action === "meeting" ? actMode : undefined,
          eventAt: ["meeting", "contact"].includes(action) && actAt ? new Date(actAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      setActionModal(null);
      await load();
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  // สร้างดีลจากลีด (feedback ผู้ใช้): ติ้กประเภทที่จะเปิดได้หลายอันในครั้งเดียว —
  // ลดขั้นการกรอก (ลูกค้า/ทีม/ผู้ดูแล/มูลค่า ดึงจากลีดให้หมด)
  const canEditDeals = useCan("salesplan:edit");
  const [dealModal, setDealModal] = useState(null); // lead
  const [dealsToCreate, setDealsToCreate] = useState([]);
  
  const openDealModal = (lead) => {
    setDealModal(lead);
    setDealsToCreate([{
      ...initialDealForm,
      title: `${lead.company || lead.contactName} — SCENT`,
      customerId: lead.customerId || "",
      dealType: "SCENT",
      stage: "qualified",
      projectValue: lead.budget || "",
      forecastMonth: thisMonth(),
    }]);
  };
  
  const addDealToCreate = () => {
    setDealsToCreate((prev) => [...prev, {
      ...initialDealForm,
      title: `${dealModal.company || dealModal.contactName} — NPD`,
      customerId: dealModal.customerId || "",
      dealType: "NPD",
      stage: "qualified",
      projectValue: "",
      forecastMonth: thisMonth(),
    }]);
  };
  
  const updateDealToCreate = (index, field, value) => {
    setDealsToCreate((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };
  
  const removeDealToCreate = (index) => {
    setDealsToCreate((prev) => prev.filter((_, i) => i !== index));
  };

  const submitDeals = async () => {
    if (!dealModal || !dealsToCreate.length) return;
    setBusy("deals");
    setError("");
    try {
      const created = [];
      for (const d of dealsToCreate) {
        if (!d.title) throw new Error("กรุณาระบุชื่อดีลให้ครบ");
        if (d.dealType !== "SCENT" && !d.categoryCode) throw new Error(`ดีล ${d.dealType} ต้องเลือกหมวดสินค้า`);
        const res = await fetch("/api/sales-planning/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: d.title,
            customerId: d.customerId,
            dealType: d.dealType,
            categoryCode: d.categoryCode || undefined,
            startDate: d.startDate || undefined,
            endDate: d.endDate || undefined,
            brand: d.brand || undefined,
            stage: d.stage,
            probability: Number(d.probability) || 50,
            forecastMonth: d.forecastMonth || undefined,
            projectValue: d.projectValue || 0,
            notes: d.notes || undefined,
            ownerId: dealModal.assigneeId || undefined,
            ownerName: dealModal.assigneeName || undefined,
            team: dealModal.team || undefined,
            leadId: dealModal.id,
            metadata: { leadId: dealModal.id, source: "lead", leadChannel: dealModal.channel },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `สร้างดีล ${d.title} ไม่สำเร็จ`);
        created.push(data);
      }
      setDealModal(null);
      setError("");
      window.location.href = created.length === 1 ? `/sa/deals/${created[0].id}` : "/sa/deals";
    } catch (e) {
      setError(e.message || "สร้างดีลไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const deleteLead = async (lead) => {
    if (!window.confirm(`ลบลีด "${lead.contactName}"? การลบย้อนกลับไม่ได้`)) return;
    setError("");
    const res = await fetch(`/api/sales-planning/leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "ลบลีดไม่สำเร็จ");
    await load();
  };

  // ปุ่ม action ต่อแถว ตามสถานะ + role (กติกาจริงบังคับซ้ำที่ API)
  const rowActions = (lead) => {
    const allowed = LEAD_TRANSITIONS[lead.status] || [];
    const inTeam = (role === "senior_ae" || role === "ac") && lead.team === team;
    const isAssignee = role === "ae" && meId != null && lead.assigneeId === meId;
    const works = superuser || inTeam || isAssignee;
    const btns = [];
    if (allowed.includes("screen") && superuser) btns.push({ a: "screen", label: "คัดกรอง", icon: Filter, primary: true });
    if (allowed.includes("assign") && (role === "admin" || inTeam)) btns.push({ a: "assign", label: "มอบหมาย", icon: UsersIcon, primary: true });
    if (allowed.includes("contact") && works) btns.push({ a: "contact", label: "ติดต่อแล้ว", icon: PhoneCall, primary: true });
    if (allowed.includes("meeting") && works) btns.push({ a: "meeting", label: "นัดประชุม", icon: CalendarClock });
    if (allowed.includes("create_deal") && works && lead.status !== "qualified") btns.push({ a: "create_deal", label: "สร้างดีล", icon: FolderKanban, primary: true });
    if (allowed.includes("bounce") && works) btns.push({ a: "bounce", label: "ตีกลับ", icon: Undo2 });
    if (allowed.includes("disqualify") && works) btns.push({ a: "disqualify", label: "ไม่ไปต่อ", icon: Ban });
    return btns;
  };

  const canEditRow = (lead) => {
    if (role === "admin") return true;
    if (["contacted", "meeting", "qualified", "disqualified"].includes(lead.status)) return false;
    if (superuser) return true;
    if (role === "marketing") return meId != null && lead.createdBy === meId;
    return canLead;
  };

  const canDeleteRow = (lead) => {
    if (role === "admin") return true;
    if (["contacted", "meeting", "qualified", "disqualified"].includes(lead.status)) return false;
    if (superuser || role === "marketing") return true;
    return false;
  };

  const slaPct = (s) => (s && s.checked ? `${Math.round((s.hit / s.checked) * 100)}%` : "-");

  if (!canLead && !canView) {
    return (
      <Workspace icon={<Inbox size={22} />} title="ลีด">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<Inbox size={22} />}
      title="บริหารงานขาย — ลีด"
      subtitle="Marketing กรอกลีดรายวัน → คัดกรองส่งทีมใน 1 วันทำการ → AE ติดต่อกลับใน 1 วันทำการ"
      headerRight={
        <>
          <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
          {canCreate && (
            <button type="button" className="btn btn-primary" onClick={() => { setForm(initialForm); setFormOpen(true); }}>
              <Plus size={15} aria-hidden="true" /> รับลีดใหม่
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        {canSeeLeadKpi(role) && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <Link href="/sa/dashboard?tab=lead_kpi" className="linklike" style={{ display: "inline-flex", alignItems: "center", fontSize: 13, fontWeight: 500, color: "var(--blue)" }}>ดู KPI เต็ม →</Link>
            </div>
          )}
          <section className="kpi-grid" aria-busy={loading}>
            <KpiCard icon={<Inbox size={16} aria-hidden="true" />} label="ลีดเข้า" value={kpi?.funnel?.total ?? "-"} hint={allMonths ? "ทั้งหมด" : `เดือน ${month}`} />
            <KpiCard icon={<Filter size={16} aria-hidden="true" />} label="SLA คัดกรอง ≤1 วันทำการ" value={slaPct(kpi?.sla?.screen)} hint={`ทัน ${kpi?.sla?.screen?.hit ?? 0}/${kpi?.sla?.screen?.checked ?? 0} · ค้างคิว ${kpi?.sla?.screen?.pending ?? 0}`} />
            <KpiCard icon={<PhoneCall size={16} aria-hidden="true" />} label="SLA ติดต่อกลับ ≤1 วันทำการ" value={slaPct(kpi?.sla?.contact)} hint={`ทัน ${kpi?.sla?.contact?.hit ?? 0}/${kpi?.sla?.contact?.checked ?? 0} · ค้างติดต่อ ${kpi?.sla?.contact?.pending ?? 0}`} />
            <KpiCard 
              icon={<CalendarClock size={16} aria-hidden="true" />} 
              label="Conversion" 
              value={kpi?.funnel?.total ? Math.round((kpi.funnel.qualified / kpi.funnel.total) * 100) + "%" : "-"} 
              hint={`ลีด ${kpi?.funnel?.total ?? 0} → นัด ${kpi?.funnel?.meeting ?? 0} → เปิดลูกค้า ${kpi?.funnel?.qualified ?? 0}`}
            />
          </section>

        <section className="glass-panel" style={{ padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <div className="search-glass" style={{ width: 260 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาลีด / บริษัท / เบอร์" aria-label="ค้นหาลีด" />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" aria-label="กรองสถานะ" style={{ width: 210 }}>
              <option value="open">ที่ยังไม่ปิด (คิวงาน)</option>
              <option value="all">ทุกสถานะ</option>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]} ({countBy[s] || 0})</option>)}
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
            <span className="ui-badge">{filtered.length} ลีด</span>
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>ลูกค้า/ผู้ติดต่อ {sortArrow("name")}</span></th>
                  <th>ช่องทาง</th>
                  <th>บริการที่สนใจ</th>
                  <th className="num" onClick={() => handleSort("budget")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>Budget {sortArrow("budget")}</span></th>
                  <th>ทีม / ผู้รับผิดชอบ</th>
                  <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none", textAlign: "center" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "center" }}>สถานะ {sortArrow("status")}</span></th>
                  <th onClick={() => handleSort("created")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>รับเมื่อ {sortArrow("created")}</span></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.id} className="premium-row">
                    <td>
                      <strong>{lead.contactName}</strong>
                      <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                        {[lead.company, lead.phone, lead.email || lead.contactChannel].filter(Boolean).join(" · ") || "-"}
                      </span>
                    </td>
                    <td><span className="ui-badge" style={{ color: CHANNEL_GROUP_COLORS[channelGroupOf(lead.channel)] || "var(--text-2)", borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>{LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</span></td>
                    <td>
                      {SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest}
                      {lead.serviceDetail && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{lead.serviceDetail}</span>}
                    </td>
                    <td className="num mono">{lead.budget != null ? fmtMoney(lead.budget) : "-"}</td>
                    <td>
                      {lead.team ? `${TEAM_LABELS[lead.team] || lead.team}` : "-"}
                      {lead.assigneeName && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{lead.assigneeName}</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                        {statusBadge(lead.status)}
                      </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12.5, color: "var(--text-2)" }}>{fmtDateTime(lead.createdAt)}</td>
                    <td className="num" style={{ verticalAlign: "middle" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "100px 80px 85px 28px 28px", gap: 6, justifyContent: "flex-end", alignItems: "center", minWidth: 345 }}>
                          
                          {/* Slot 1: Primary Action */}
                          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                            {(() => {
                              const primary = rowActions(lead).find(a => ["screen", "assign", "contact", "meeting", "create_deal"].includes(a.a));
                              if (primary) {
                                return (
                                  <button type="button" className="btn btn-status sm" onClick={() => primary.a === "create_deal" ? openDealModal(lead) : openAction(lead, primary.a)} disabled={!!busy} style={{ '--btn-bg': ACTION_COLORS[primary.a], width: "100%", padding: "0 4px", justifyContent: "center" }}>
                                    <primary.icon size={13} aria-hidden="true" /> {primary.label}
                                  </button>
                                );
                              }
                              if (lead.status === "qualified" && canEditDeals) {
                                return (
                                  <button type="button" className="btn btn-status sm" onClick={() => openDealModal(lead)} disabled={!!busy} title="เปิดดีลจากลีดนี้" style={{ '--btn-bg': 'var(--green)', width: "100%", padding: "0 4px", justifyContent: "center" }}>
                                    <Plus size={13} aria-hidden="true" /> สร้างดีล
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          {/* Slot 2: Bounce */}
                          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                            {(() => {
                              const bounce = rowActions(lead).find(a => a.a === "bounce");
                              if (bounce) {
                                return (
                                  <button type="button" className="btn btn-status-ghost sm" onClick={() => openAction(lead, bounce.a)} disabled={!!busy} style={{ '--btn-bg': ACTION_COLORS[bounce.a], width: "100%", padding: "0 4px", justifyContent: "center" }}>
                                    <bounce.icon size={13} aria-hidden="true" /> {bounce.label}
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          {/* Slot 3: Disqualify */}
                          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                            {(() => {
                              const dq = rowActions(lead).find(a => a.a === "disqualify");
                              if (dq) {
                                return (
                                  <button type="button" className="btn btn-status-ghost sm" onClick={() => openAction(lead, dq.a)} disabled={!!busy} style={{ '--btn-bg': ACTION_COLORS[dq.a], width: "100%", padding: "0 4px", justifyContent: "center" }}>
                                    <dq.icon size={13} aria-hidden="true" /> {dq.label}
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          {/* Slot 4: Edit */}
                          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                            {canEditRow(lead) && (
                              <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} title="แก้ไขลีด" aria-label={`แก้ไข ${lead.contactName}`}
                                onClick={() => { setForm({ id: lead.id, channel: lead.channel, contactName: lead.contactName || "", company: lead.company || "", email: lead.email || "", contactChannel: lead.contactChannel || "", phone: lead.phone || "", serviceInterest: lead.serviceInterest || "other", serviceDetail: lead.serviceDetail || "", budget: lead.budget ?? "", details: lead.details || "" }); setFormOpen(true); }}>
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                            )}
                          </div>

                          {/* Slot 5: Delete */}
                          <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                            {canDeleteRow(lead) && (
                              <button type="button" className="btn-icon danger" title="ลบลีด" aria-label={`ลบ ${lead.contactName}`} onClick={() => deleteLead(lead)}>
                                <Trash2 size={14} aria-hidden="true" />
                              </button>
                            )}
                          </div>

                        </div>
                      </td>
                  </tr>
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีลีดตามตัวกรองนี้ {canCreate ? "— เริ่มจากปุ่มรับลีดใหม่" : ""}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ฟอร์มรับ/แก้ลีด */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? "แก้ไขลีด" : "รับลีดใหม่"} size="xl">
        <form onSubmit={saveLead} className="form-grid" aria-busy={busy === "save"} style={{ padding: 18 }}>
          
          <div style={{ gridColumn: "1 / -1" }}>
            <h4 style={{ fontSize: 13, color: "var(--text)", marginBottom: 8, fontWeight: 600 }}>ช่องทางที่รับลีด</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, fontSize: 13 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <strong style={{ color: "var(--text-3)" }}>Online</strong>
                {["chatcone_line", "chatcone_meta", "chatcone_tiktok", "chatcone_ig"].map(c => (
                  <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                    <input type="radio" name="leadChannel" checked={form.channel === c} onChange={() => setForm({ ...form, channel: c })} />
                    {LEAD_CHANNEL_LABELS[c]}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <strong style={{ color: "var(--text-3)" }}>Onsite</strong>
                {["phone", "walkin"].map(c => (
                  <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                    <input type="radio" name="leadChannel" checked={form.channel === c} onChange={() => setForm({ ...form, channel: c })} />
                    {LEAD_CHANNEL_LABELS[c]}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <strong style={{ color: "var(--text-3)" }}>Website</strong>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="leadChannel" checked={form.channel === "website"} onChange={() => setForm({ ...form, channel: "website" })} />
                  {LEAD_CHANNEL_LABELS["website"]}
                </label>
              </div>
            </div>
          </div>
          
          <hr style={{ gridColumn: "1 / -1", margin: "4px 0", borderColor: "var(--border)" }} />
          
          <label>
            ชื่อลูกค้า/ผู้ติดต่อ *
            <input className="premium-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
          </label>
          <label>
            บริษัท/แบรนด์
            <input className="premium-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </label>
          
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              อีเมล
              <input type="email" className="premium-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              ช่องทางอื่น
              <input className="premium-input" value={form.contactChannel} onChange={(e) => setForm({ ...form, contactChannel: e.target.value })} placeholder="LINE ID ฯลฯ" />
            </label>
          </div>
          <label>
            เบอร์โทร
            <PhoneInput value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          </label>

          <hr style={{ gridColumn: "1 / -1", margin: "4px 0", borderColor: "var(--border)" }} />
          
          <label>
            ประเภทบริการที่สนใจ *
            <Select className="premium-select" value={form.serviceInterest} onChange={(e) => setForm({ ...form, serviceInterest: e.target.value })}>
              {SERVICE_INTERESTS.map((s) => <option key={s} value={s}>{SERVICE_INTEREST_LABELS[s]}</option>)}
            </Select>
          </label>
          {SERVICE_DETAIL_REQUIRED.has(form.serviceInterest) ? (
            <label>
              รายละเอียดบริการ *
              <input className="premium-input" value={form.serviceDetail} onChange={(e) => setForm({ ...form, serviceDetail: e.target.value })} required placeholder={form.serviceInterest === "product" ? "ระบุสินค้าที่สนใจ" : "ระบุ"} />
            </label>
          ) : <div />}

          <label>
            Budget (บาท)
            <MoneyInput value={form.budget} onChange={(value) => setForm({ ...form, budget: value ?? "" })} />
          </label>
          <div />
          
          <label style={{ gridColumn: "1 / -1" }}>
            รายละเอียดเพิ่มเติม
            <textarea className="premium-input" rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          </label>
          
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setFormOpen(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={busy === "save"}><Plus size={14} aria-hidden="true" /> {busy === "save" ? "กำลังบันทึก…" : "บันทึกลีด"}</button>
          </div>
        </form>
      </Modal>

      {/* สร้างดีลจากลีด (ดึงฟอร์มเต็มมาให้กรอก สามารถสร้างหลายรายการพร้อมกันได้) */}
      <Modal open={!!dealModal} onClose={() => !busy && setDealModal(null)} title="สร้างดีลจากลีด" size="lg">
        {dealModal && (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "75vh", overflowY: "auto" }}>
            <div style={{ fontSize: 13, color: "var(--text-3)", paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              ลีด: <strong style={{ color: "var(--text)" }}>{dealModal.contactName}</strong>{dealModal.company ? ` · ${dealModal.company}` : ""}
              {dealModal.team ? ` · ทีม ${TEAM_LABELS[dealModal.team] || dealModal.team}` : ""}{dealModal.assigneeName ? ` · ${dealModal.assigneeName}` : ""}
            </div>
            
            {dealsToCreate.map((d, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 12, background: "var(--surface-50)", position: "relative" }}>
                {dealsToCreate.length > 1 && (
                  <button type="button" onClick={() => removeDealToCreate(i)} className="btn-icon danger" style={{ position: "absolute", top: 12, right: 12, background: "var(--surface)" }} title="ลบรายการนี้">
                    <Trash2 size={16} />
                  </button>
                )}
                
                <div className="form-grid">
                  <DealFormFields
                    form={d}
                    onPatch={(patch) => setDealsToCreate((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)))}
                    customers={customers}
                    categories={categories}
                    stages={DEAL_STAGES.filter((st) => st !== "won")}
                    onCustomersUpdated={(uc) => setCustomers((prev) => prev.map((c) => (c.id === uc.id ? uc : c)))}
                  />
                </div>
              </div>
            ))}
            
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
              <button type="button" className="btn ghost" onClick={addDealToCreate}>
                <Plus size={14} aria-hidden="true" /> เพิ่มดีลอีกรายการ
              </button>
            </div>
            
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setDealModal(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-primary" onClick={submitDeals} disabled={!!busy || !dealsToCreate.length}>
                {busy === "deals" ? "กำลังสร้าง…" : `สร้าง ${dealsToCreate.length} ดีล`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* โมดัล action ตาม transition */}
      <Modal open={!!actionModal} onClose={() => !busy && setActionModal(null)} size="sm"
        title={actionModal ? ({ screen: "คัดกรอง — เลือกทีม", assign: "มอบหมาย AE", contact: "บันทึกติดต่อกลับ", meeting: "บันทึกนัดประชุม", create_deal: actionModal.lead.status === "qualified" ? "สร้างดีลเพิ่ม" : "สร้างดีล", disqualify: "ไม่ไปต่อ", bounce: "ตีกลับ (ทีมไม่ตรง)" }[actionModal.action]) : ""}>
        {actionModal && (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              ลีด: <strong style={{ color: "var(--text)" }}>{actionModal.lead.contactName}</strong>{actionModal.lead.company ? ` · ${actionModal.lead.company}` : ""}
            </div>
            {actionModal.action === "screen" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                ส่งให้ทีม
                <Select className="premium-select" value={actTeam} onChange={(e) => setActTeam(e.target.value)}>
                  <option value="">— เลือกทีม —</option>
                  {TEAMS.map((t) => <option key={t} value={t}>{TEAM_LABELS[t]}</option>)}
                </Select>
              </label>
            )}
            {actionModal.action === "assign" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                AE ผู้รับผิดชอบ (ทีม {TEAM_LABELS[actionModal.lead.team] || actionModal.lead.team})
                <Select className="premium-select" value={actAssignee} onChange={(e) => setActAssignee(e.target.value)}>
                  <option value="">— เลือก AE —</option>
                  {users.filter((u) => ["ae", "senior_ae"].includes(u.role) && (!actionModal.lead.team || u.team === actionModal.lead.team)).map((u) => (
                    <option key={u.id} value={u.id}>{fmtName(u)}{u.role === "senior_ae" ? " (Senior)" : ""}</option>
                  ))}
                </Select>
              </label>
            )}
            {["contact", "meeting"].includes(actionModal.action) && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                วัน-เวลา{actionModal.action === "meeting" ? "นัด" : "ที่ติดต่อ"}
                <DateTimeInput value={actAt} onChange={setActAt} />
              </label>
            )}
            {actionModal.action === "meeting" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                รูปแบบนัด
                <Select className="premium-select" value={actMode} onChange={(e) => setActMode(e.target.value)}>
                  {MEETING_MODES.map((m) => <option key={m} value={m}>{MEETING_MODE_LABELS[m]}</option>)}
                </Select>
              </label>
            )}
            {["disqualify", "bounce"].includes(actionModal.action) && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                เหตุผล *
                <textarea className="premium-input" rows={2} value={actReason} onChange={(e) => setActReason(e.target.value)} placeholder={actionModal.action === "bounce" ? "เช่น งานเป็นของทีม SV ไม่ใช่ ODM" : "เช่น งบไม่พอ / ติดต่อไม่ได้"} />
              </label>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setActionModal(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-primary" onClick={submitAction}
                disabled={!!busy
                  || (actionModal.action === "screen" && !actTeam)
                  || (actionModal.action === "assign" && !actAssignee)
                  || (["disqualify", "bounce"].includes(actionModal.action) && !actReason.trim())}>
                {busy === "action" ? "กำลังบันทึก…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Workspace>
  );
}
