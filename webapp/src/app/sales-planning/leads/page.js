"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";

// หน้าลีด (/sa/leads — Sales Revamp เฟส C): คิวรับลีดของ Marketing →
// คัดกรอง (Supervisor เลือกทีม) → กระจาย (Senior เลือก AE) → ติดต่อ/นัด → เปิดลูกค้า.
// SLA 1 วันทำการ (คัดกรอง + ติดต่อกลับ) วัดจาก timestamp อัตโนมัติ — โชว์บน KPI strip.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Inbox, Plus, Search, PhoneCall, CalendarClock, Filter, LineChart, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import MoneyInput from "@/components/ui/MoneyInput";
import PhoneInput from "@/components/ui/PhoneInput";
import SortControl from "@/components/ui/SortControl";
import FilterPopover from "@/components/ui/FilterPopover";
import { canSeeLeadKpi } from "@/lib/permissions";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { TEAM_LABELS } from "@/lib/permissions";
import { DEAL_TYPES, DEAL_TYPE_LABELS, STAGE_LABELS } from "@/lib/salesPlanning";
import { brandThList } from "@/lib/master/brands";
import LeadDealModal from "@/components/salesPlanning/LeadDealModal";
import RecordActionMenu from "@/components/ui/RecordActionMenu";
import { buildLeadTransitionPayload, createLeadLifecycle, leadDealAction, LEAD_TRANSITION_ACTIONS } from "@/lib/sales/leadLifecycle";
import {
  LEAD_CHANNELS, LEAD_CHANNEL_LABELS, CHANNEL_GROUP_COLORS, CHANNEL_GROUP_LABELS, channelGroupOf, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS,
  SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, SERVICE_DETAIL_REQUIRED,
  canEditLead, canDeleteLead, canCreateLead, canCreateDealFromLead,
} from "@/lib/sales/leads";
import { FORECAST_LEVELS, MonthPicker, thisMonth, snapForecastLevel, yearOfMonth } from "@/components/salesPlanning/ui";
import { fmtDateTime, fmtMoney, fmtPercent } from "@/lib/format";
import { cachedFetchJson } from "@/lib/apiCache";
import { CUSTOMER_NAME_LABEL } from "@/lib/uiLabels";
import { usePagination } from "@/lib/usePagination";
import Pager from "@/components/ui/Pager";
import DetailRow from "@/components/ui/DetailRow";
import Textarea from "@/components/ui/Textarea";

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
  const canCreate = canCreateLead(role);
  const [meId, setMeId] = useState(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setMeId(me?.id || null))
      .catch(() => setMeId(null));
  }, []);

  const [leads, setLeads] = useState([]);
  const [kpi, setKpi] = useState(null);
  /* รายชื่อผู้ใช้ 2 หน้าที่ แยกกันคนละชุดโดยตั้งใจ:
     - `directory` (รวมคนที่ปิดบัญชีแล้ว) = ใช้ *อ่านชื่อปัจจุบัน* ของผู้รับผิดชอบ
       ในแถว — ต้องมีคนที่ลาออกด้วย ไม่งั้นลีดเก่าตกไปใช้ชื่อที่ค้างในแถว
     - `users` (เฉพาะคนที่ยังทำงาน) = dropdown มอบหมายงาน
     ⚠️ ต้องโหลดโดยไม่ติดเงื่อนไข role เพราะทุกคนที่เปิดหน้านี้ได้ต้องอ่านชื่อออก
     (ของเดิมโหลดเฉพาะ role ที่ทำคิวได้) · ยิงไม่ผ่าน = [] แล้วถอยไปชื่อในแถวเอง */
  const directory = usePeopleDirectory();
  const users = useMemo(() => directory.filter((u) => !u.disabled), [directory]);
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  // หมวดสินค้า (product-types) — DealFormFields ในโมดัลสร้างดีลใช้ (hotfix: state ตัวนี้
  // หลุดตอนแยกฟอร์มใน #287 ทำหน้า crash ตอนเปิดโมดัล)
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) — ทุกหมวด
  // multi-select, ว่าง = ทั้งหมด. "คิวงาน" (ซ่อนลีดที่ปิดแล้ว) เดิมเป็นค่าตั้งต้นของ
  // dropdown สถานะ — แยกเป็นหมวดของตัวเองและติ๊กไว้ตั้งแต่แรกเพื่อคงพฤติกรรมเดิม
  // (badge จะขึ้น 1 ให้เห็นว่ามีตัวกรองอยู่ ไม่ใช่ซ่อนเงียบ ๆ แบบเดิม)
  const [statusFilter, setStatusFilter] = useState([]);
  const [channelFilter, setChannelFilter] = useState([]);
  const [queueFilter, setQueueFilter] = useState(["openOnly"]);
  const openOnly = queueFilter.includes("openOnly");
  const [sortKey, setSortKey] = useState("created");
  const [sortDir, setSortDir] = useState("desc");

  const SORT_OPTIONS = [
    { key: "created", label: "รับล่าสุด" },
    { key: "name", label: CUSTOMER_NAME_LABEL },
    { key: "status", label: "สถานะ" },
    { key: "budget", label: "Budget" },
  ];

  // ทิศตั้งต้นต่อคีย์: ตัวหนังสือ/สถานะอ่าน ก→ฮ (asc), วันที่/ยอดเอาใหม่/มากก่อน (desc)
  const defaultDir = (key) => (key === "name" || key === "status" ? "asc" : "desc");
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(defaultDir(key)); }
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadsRes, kpiRes] = await Promise.all([
        fetch("/api/sales-planning/leads"),
        // ติ๊ก "ทุกเดือน" = ทุกเดือนของปีที่เลือก (เดิมส่ง month=all = ทุกปีตั้งแต่เปิดระบบ)
        fetch(allMonths
          ? `/api/sales-planning/leads/kpi?year=${encodeURIComponent(yearOfMonth(month) || "")}`
          : `/api/sales-planning/leads/kpi?month=${encodeURIComponent(month)}`),
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
    fetch("/api/master/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
    // โครงการ — โมดัลแตกดีลจากลีดเลือกโครงการได้เหมือนหน้ารวมดีล (ไม่งั้นดีลที่มาจาก
    // ลีดจะไม่มีโครงการติดมาเลย แล้วสอบถาม RD ในนามดีลนั้นไม่ได้)
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((d) => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, [role, canLead]);

  // ชื่อผู้รับผิดชอบที่ควรขึ้นจอ — อ่านจาก `assigneeId` ไม่ใช่สำเนาชื่อในแถว
  // (prod มี 64 แถวที่ `assigneeName` เป็นชื่อย่อ/ชื่อเก่าซึ่งไม่ตรงบัญชีใครเลย)
  const assigneeNameOf = useCallback(
    (lead) => livePersonName(directory, lead?.assigneeId, lead?.assigneeName),
    [directory],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = leads.filter((l) => {
      // "คิวงาน" เป็นทางลัดของค่าตั้งต้น — ถ้าผู้ใช้เลือกสถานะเองแล้ว ให้สถานะชนะ
      // ไม่งั้นติ๊ก "เปิดลูกค้า/ไม่ผ่าน" ทั้งที่คิวงานยังติดอยู่จะได้ผลลัพธ์ว่างเสมอ
      if (openOnly && !statusFilter.length && ["qualified", "disqualified"].includes(l.status)) return false;
      if (statusFilter.length && !statusFilter.includes(l.status)) return false;
      if (channelFilter.length && !channelFilter.includes(l.channel)) return false;
      if (!q) return true;
      // ค้นด้วยชื่อ *ปัจจุบัน* — ไม่งั้นพิมพ์ชื่อใหม่ของ AE แล้วหาลีดของเขาไม่เจอ
      return [l.contactName, l.company, l.phone, l.email, l.details, assigneeNameOf(l)].some((v) => (v || "").toLowerCase().includes(q));
    });
    
    const mul = sortDir === "desc" ? -1 : 1;
    return result.sort((a, b) => {
      if (sortKey === "name") return (a.contactName || "").localeCompare(b.contactName || "", "th") * mul;
      if (sortKey === "status") return ((LEAD_STATUSES.indexOf(a.status) || 99) - (LEAD_STATUSES.indexOf(b.status) || 99)) * mul;
      if (sortKey === "budget") return ((a.budget || 0) - (b.budget || 0)) * mul;
      // asc = เก่า→ใหม่ ให้ desc (ค่าตั้งต้น) โชว์ล่าสุดก่อน — เดิมกลับทิศ ทำให้เปิดหน้ามาเจอลีดเก่าสุด
      return ((a.createdAt || "") < (b.createdAt || "") ? -1 : 1) * mul;
    });
  }, [leads, query, statusFilter, channelFilter, openOnly, sortKey, sortDir, assigneeNameOf]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(filtered, {
      resetKey: `${query}|${statusFilter.join()}|${channelFilter.join()}|${openOnly}|${sortKey}|${sortDir}`,
    });

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

  /* จุดเดียวที่ปุ่มในแถววิ่งเข้า — คืน false = ไม่สำเร็จ RecordActionMenu จะค้างกล่องไว้
     พร้อมค่าที่กรอก ผู้ใช้ไม่ต้องพิมพ์ใหม่ (สัญญาเดียวกับหน้ารายละเอียด) */
  const runTransition = async (lead, actionId, values) => {
    if (!LEAD_TRANSITION_ACTIONS.includes(actionId)) return false;
    setBusy("action");
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/leads/${lead.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLeadTransitionPayload({ action: actionId, values, users })),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy("");
    }
  };

  const canCreateDeals = canCreateDealFromLead(role);
  const [dealModal, setDealModal] = useState(null); // lead ที่กำลังเปิดดีลให้


  const deleteLead = async (lead) => {
    if (!(await confirmAction(`ลบลีด "${lead.contactName}"? การลบย้อนกลับไม่ได้`))) return;
    setError("");
    const res = await fetch(`/api/sales-planning/leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || "ลบลีดไม่สำเร็จ");
    await load();
  };

  const viewer = useMemo(() => ({ role, id: meId, team }), [role, meId, team]);
  /* กติกา "ลีดใบนี้ทำอะไรได้บ้าง" มาจากไฟล์เดียวกับหน้ารายละเอียด — เดิมหน้านี้มี
     rowActions() ของตัวเองที่คิดซ้ำจาก LEAD_TRANSITIONS + เช็ค role เอง แล้วเพี้ยนจาก
     หน้ารายละเอียดได้เงียบ ๆ (เจอจริง: contact บังคับเหตุผลที่นี่ แต่หน้าโน้นไม่บังคับ) */
  const lifecycle = useMemo(
    () => createLeadLifecycle({ users, canCreateDeals, viewerTeam: team }),
    [users, canCreateDeals, team],
  );
  /* "เปิดดีล" ไม่ใช่ขั้นในเส้นทางแล้ว (ดู leadDealAction) — ส่งเข้าเมนูแถวเป็นรายการ
     ของตัวเอง โดยใช้ descriptor ตัวเดียวกับที่หน้ารายละเอียดใช้ ห้ามคิดเงื่อนไขซ้ำที่นี่ */
  const dealItemFor = (lead) => {
    const action = leadDealAction({
      lead, user: viewer, canCreateDeals, icon: BriefcaseBusiness, onClick: () => setDealModal(lead),
    });
    return { ...action, label: action.rowLabel, tone: "primary" };
  };
  // นโยบายเดียวกับ API (lib/sales/leads.js) — ปุ่มโชว์เฉพาะเมื่อ action จะสำเร็จจริง
  const canEditRow = (lead) => canEditLead({ role, id: meId, team }, lead);
  const canDeleteRow = (lead) => canDeleteLead({ role, id: meId, team }, lead);

  const slaPct = (s) => (s && s.checked ? fmtPercent((s.hit / s.checked) * 100) : "-");

  if (!canLead && !canView) {
    return (
      <SaWorkspace icon={<Inbox size={22} />} title="ลีด">
        <div className="glass-panel" style={{ padding: 16, color: "var(--text-3)" }}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>
      </SaWorkspace>
    );
  }

  return (
    <SaWorkspace
      icon={<Inbox size={22} />}
      title="บริหารงานขาย — ลีด"
      subtitle="Marketing กรอกลีดรายวัน → คัดกรองส่งทีมใน 1 วันทำการ → AE ติดต่อกลับใน 1 วันทำการ"
      headerRight={
        <>
          <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
          {canCreate && (
            <button type="button" className="btn btn-accent" onClick={() => { setForm(initialForm); setFormOpen(true); }}>
              <Plus size={15} aria-hidden="true" /> รับลีดใหม่
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        {canSeeLeadKpi(role) && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <Link href="/sa/dashboard?tab=lead_kpi" className="linklike" style={{ display: "inline-flex", alignItems: "center", fontSize: "var(--fs-7)", fontWeight: "var(--fw-medium)", color: "var(--blue)" }}>ดู KPI เต็ม →</Link>
            </div>
          )}
          <SaMetricStrip aria-busy={loading}>
            <SaMetric icon={<Inbox />} label="ลีดเข้า" value={kpi?.funnel?.total ?? "-"} note={allMonths ? "ทั้งหมด" : `เดือน ${month}`} />
            <SaMetric icon={<Filter />} label="SLA คัดกรอง ≤1 วันทำการ" value={slaPct(kpi?.sla?.screen)} note={`ทัน ${kpi?.sla?.screen?.hit ?? 0}/${kpi?.sla?.screen?.checked ?? 0} · ค้าง ${kpi?.sla?.screen?.pending ?? 0}`} tone={(kpi?.sla?.screen?.pending ?? 0) ? "warning" : "good"} />
            <SaMetric icon={<PhoneCall />} label="SLA ติดต่อกลับ ≤1 วันทำการ" value={slaPct(kpi?.sla?.contact)} note={`ทัน ${kpi?.sla?.contact?.hit ?? 0}/${kpi?.sla?.contact?.checked ?? 0} · ค้าง ${kpi?.sla?.contact?.pending ?? 0}`} tone={(kpi?.sla?.contact?.pending ?? 0) ? "warning" : "good"} />
            <SaMetric icon={<CalendarClock />} label="Conversion" value={kpi?.funnel?.total ? fmtPercent((kpi.funnel.qualified / kpi.funnel.total) * 100) : "-"} note={`ลีด ${kpi?.funnel?.total ?? 0} → นัด ${kpi?.funnel?.meeting ?? 0} → เปิดลูกค้า ${kpi?.funnel?.qualified ?? 0}`} />
          </SaMetricStrip>

        <SaSection icon={<Inbox size={17} />} title="คิวลีด" subtitle="ค้นหา คัดกรอง และติดตามลีดจนพร้อมส่งต่อเป็นดีล" actions={<span className="ui-badge">{filtered.length} ลีด</span>}>
          <div className="toolbar" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <div className="search-glass" style={{ width: 260 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาลีด / บริษัท / เบอร์" aria-label="ค้นหาลีด" />
            </div>
            <FilterPopover
              count={statusFilter.length + channelFilter.length + queueFilter.length}
              onClear={() => { setStatusFilter([]); setChannelFilter([]); setQueueFilter([]); }}
              groups={[
                {
                  key: "queue", label: "คิวงาน", icon: Inbox,
                  options: [{ value: "openOnly", label: "เฉพาะที่ยังไม่ปิด (ซ่อนเปิดลูกค้า/ไม่ผ่าน)" }],
                  selected: queueFilter, onChange: setQueueFilter,
                },
                {
                  key: "status", label: "สถานะ", icon: Filter,
                  options: LEAD_STATUSES.map((s) => ({ value: s, label: `${LEAD_STATUS_LABELS[s]} (${countBy[s] || 0})` })),
                  selected: statusFilter, onChange: setStatusFilter,
                },
                {
                  key: "channel", label: "ช่องทาง", icon: PhoneCall,
                  options: LEAD_CHANNELS.map((c) => ({ value: c, label: LEAD_CHANNEL_LABELS[c] || c })),
                  selected: channelFilter, onChange: setChannelFilter,
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
            <TableScroll surface="embedded"><table className="w-full text-sm">
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
                {/* DetailRow แทน <tr onClick> ดิบ — ท่าเดียวกับหน้าดีล/โครงการ
                    ได้ 2 อย่างที่ของเดิมไม่มี: กด Enter/Space บนแถวได้ (คีย์บอร์ด) และ
                    `isInteractiveTarget` กันแถวยิง router.push ซ้ำตอนกดลิงก์ชื่อ/ปุ่มข้างใน */}
                {pageRows.map((lead) => (
                  <DetailRow key={lead.id} href={`/sa/leads/${lead.id}`} className="premium-row">
                    <td>
                      {/* ชื่อเป็นลิงก์จริง ไม่ใช่ข้อความในแถวที่กดได้ — คลิกทั้งแถวใช้ได้เฉพาะ
                          เมาส์ ส่วนลิงก์ได้ทั้งคีย์บอร์ด/โปรแกรมอ่านหน้าจอ/เปิดแท็บใหม่
                          ท่าเดียวกับหน้าดีลและหน้าโครงการ (`linklike` = ลิงก์ที่ไม่ทำสีทับข้อความ)
                          prefetch={false}: ลิสต์ยาว ๆ เคยยิง RSC prefetch เป็นพันครั้ง/วัน */}
                      <Link prefetch={false} href={`/sa/leads/${lead.id}`} className="linklike text-left" style={{ display: "block" }} title="เปิดหน้ารายละเอียดลีด">
                        <strong>{lead.contactName}</strong>
                        <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
                          {[lead.company, lead.phone, lead.email || lead.contactChannel].filter(Boolean).join(" · ") || "-"}
                        </span>
                      </Link>
                    </td>
                    <td><span className="ui-badge" style={{ color: CHANNEL_GROUP_COLORS[channelGroupOf(lead.channel)] || "var(--text-2)", borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>{LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</span></td>
                    <td>
                      {SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest}
                      {lead.serviceDetail && <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{lead.serviceDetail}</span>}
                    </td>
                    <td className="num mono">{lead.budget != null ? fmtMoney(lead.budget) : "-"}</td>
                    <td>
                      {lead.team ? `${TEAM_LABELS[lead.team] || lead.team}` : "-"}
                      {assigneeNameOf(lead) && <span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{assigneeNameOf(lead)}</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>
                        {statusBadge(lead.status)}
                      </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-6)", color: "var(--text-2)" }}>{fmtDateTime(lead.createdAt)}</td>
                    <td className="num" onClick={(event) => event.stopPropagation()}>
                      {/* กติกาว่าปุ่มไหนโผล่มาจาก lifecycle ตัวเดียวกับหน้ารายละเอียด —
                          แถวโชว์ "ก้าวถัดไป" 1 ปุ่ม (มีสีตามขั้น) + เมนู "…" ที่รวม
                          ตีกลับ/ไม่ไปต่อ/แก้ไข/ลบ (มติผู้ใช้ 2026-08-01)

                          ไม่ส่ง manageHref: ตารางนี้ชื่อลีดเป็นลิงก์ไปหน้ารายละเอียดอยู่แล้ว
                          ลิงก์ "จัดการ" ท้ายแถวจึงเป็นทางที่สองไปที่เดิม — กินที่และแย่งสายตา
                          จากปุ่มก้าวถัดไป (มติผู้ใช้ 2026-08-01) */}
                      <RecordActionMenu
                        lifecycle={lifecycle}
                        record={lead}
                        user={viewer}
                        busy={!!busy}
                        recordLabel={lead.contactName}
                        extraItems={[dealItemFor(lead)]}
                        onTransition={(actionId, values) => runTransition(lead, actionId, values)}
                        canEdit={canEditRow(lead)}
                        canDelete={canDeleteRow(lead)}
                        onEdit={() => { setForm({ id: lead.id, channel: lead.channel, contactName: lead.contactName || "", company: lead.company || "", email: lead.email || "", contactChannel: lead.contactChannel || "", phone: lead.phone || "", serviceInterest: lead.serviceInterest || "other", serviceDetail: lead.serviceDetail || "", budget: lead.budget ?? "", details: lead.details || "" }); setFormOpen(true); }}
                        onDelete={() => deleteLead(lead)}
                      />
                    </td>
                  </DetailRow>
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีลีดตามตัวกรองนี้ {canCreate ? "— เริ่มจากปุ่มรับลีดใหม่" : ""}</td></tr>
                )}
              </tbody>
            </table></TableScroll>
          </div>

          {filtered.length > 0 && (
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

      {/* ฟอร์มรับ/แก้ลีด */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? "แก้ไขลีด" : "รับลีดใหม่"} size="xl">
        <form onSubmit={saveLead} className="form-grid cols-2" aria-busy={busy === "save"} style={{ padding: 18 }}>
          
          <div style={{ gridColumn: "1 / -1" }}>
            <h4 style={{ fontSize: "var(--fs-7)", color: "var(--text)", marginBottom: 8, fontWeight: "var(--fw-semibold)" }}>ช่องทางที่รับลีด</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, fontSize: "var(--fs-7)" }}>
              {/* คอลัมน์ต่อกลุ่ม derive จาก enum กลาง — เพิ่ม channel ใหม่ที่ lib/sales/leads.js ที่เดียว */}
              {Object.entries(CHANNEL_GROUP_LABELS).map(([group, groupLabel]) => (
                <div key={group} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <strong style={{ color: "var(--text-3)" }}>{groupLabel}</strong>
                  {LEAD_CHANNELS.filter((c) => channelGroupOf(c) === group).map(c => (
                    <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" name="leadChannel" checked={form.channel === c} onChange={() => setForm({ ...form, channel: c })} />
                      {LEAD_CHANNEL_LABELS[c]}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          
          <hr style={{ gridColumn: "1 / -1", margin: "4px 0", borderColor: "var(--border)" }} />
          
          <label>
            {CUSTOMER_NAME_LABEL} *
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
          <label>
            Budget (บาท)
            <MoneyInput value={form.budget} onChange={(value) => setForm({ ...form, budget: value ?? "" })} />
          </label>
          {SERVICE_DETAIL_REQUIRED.has(form.serviceInterest) ? (
            <label style={{ gridColumn: "1 / -1" }}>
              รายละเอียดบริการ *
              <input className="premium-input" value={form.serviceDetail} onChange={(e) => setForm({ ...form, serviceDetail: e.target.value })} required placeholder={form.serviceInterest === "product" ? "ระบุสินค้าที่สนใจ" : "ระบุ"} />
            </label>
          ) : null}
          
          <label style={{ gridColumn: "1 / -1" }}>
            รายละเอียดเพิ่มเติม
            <Textarea rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
          </label>
          
          <div className="form-action-bar">
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={busy === "save"}><Plus size={14} aria-hidden="true" /> {busy === "save" ? "กำลังบันทึก…" : "บันทึกลีด"}</button>
          </div>
        </form>
      </Modal>

      {/* สร้างดีลจากลีด — ฟอร์มเดียวกับที่หน้ารายละเอียดใช้
          mount ตอนเปิดเท่านั้น (ดูคำเตือนใน LeadDealModal) · key = รีเซ็ตฟอร์มเมื่อสลับลีด */}
      {dealModal && (
        <LeadDealModal
          key={dealModal.id}
          lead={dealModal}
          customers={customers}
          projects={projects}
          categories={categories}
          onClose={() => setDealModal(null)}
        />
      )}
    </SaWorkspace>
  );
}
