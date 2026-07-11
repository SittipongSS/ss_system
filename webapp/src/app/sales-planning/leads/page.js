"use client";

// หน้าลีด (/sa/leads — Sales Revamp เฟส C): คิวรับลีดของ Marketing →
// คัดกรอง (Supervisor เลือกทีม) → กระจาย (Senior เลือก AE) → ติดต่อ/นัด → เปิดลูกค้า.
// SLA 1 วันทำการ (คัดกรอง + ติดต่อกลับ) วัดจาก timestamp อัตโนมัติ — โชว์บน KPI strip.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Plus, Search, Pencil, Trash2, PhoneCall, Users as UsersIcon, CalendarClock, CheckCircle2, Ban, Undo2, Filter, LineChart } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import { isSuperuser, TEAMS, TEAM_LABELS } from "@/lib/permissions";
import {
  LEAD_CHANNELS, LEAD_CHANNEL_LABELS, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS,
  SERVICE_INTERESTS, SERVICE_INTEREST_LABELS, SERVICE_DETAIL_REQUIRED,
  MEETING_MODES, MEETING_MODE_LABELS, LEAD_TRANSITIONS,
} from "@/lib/sales/leads";
import { KpiCard, MonthPicker, thisMonth } from "@/components/salesPlanning/ui";
import { fmtDateTime, fmtMoney, fmtName } from "@/lib/format";

const initialForm = {
  id: null, channel: "chatcone_line", contactName: "", company: "", email: "",
  contactChannel: "", phone: "", serviceInterest: "diffuser", serviceDetail: "",
  budget: "", details: "",
};

function statusBadge(status) {
  return (
    <span className="ui-badge" style={{ color: LEAD_STATUS_COLORS[status] || "var(--text-3)", borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
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

  const [leads, setLeads] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open"); // open = ยังไม่ปิด
  const [month, setMonth] = useState(thisMonth());
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
  const [actCustomer, setActCustomer] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadsRes, kpiRes] = await Promise.all([
        fetch("/api/sales-planning/leads"),
        fetch(`/api/sales-planning/leads/kpi?month=${encodeURIComponent(month)}`),
      ]);
      if (!leadsRes.ok) throw new Error((await leadsRes.json().catch(() => ({}))).error || "โหลดลีดไม่สำเร็จ");
      setLeads(await leadsRes.json());
      setKpi(kpiRes.ok ? await kpiRes.json() : null);
    } catch (e) {
      setError(e.message || "โหลดลีดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // รายชื่อ AE (มอบหมาย) + ลูกค้า (qualify) — โหลดเมื่อ role ทำงานคิวได้เท่านั้น
  useEffect(() => {
    if (role === "marketing" || !canLead) return;
    fetch("/api/users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/master/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [role, canLead]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter === "open" && ["qualified", "disqualified"].includes(l.status)) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.contactName, l.company, l.phone, l.email, l.details, l.assigneeName].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [leads, query, statusFilter]);

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
    setActCustomer("");
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
          customerId: action === "qualify" ? actCustomer : undefined,
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
    const isAssignee = role === "ae" && lead.assigneeId != null;
    const works = superuser || inTeam || isAssignee;
    const btns = [];
    if (allowed.includes("screen") && superuser) btns.push({ a: "screen", label: "คัดกรอง", icon: Filter, primary: true });
    if (allowed.includes("assign") && (superuser || inTeam)) btns.push({ a: "assign", label: "มอบหมาย", icon: UsersIcon, primary: true });
    if (allowed.includes("contact") && works) btns.push({ a: "contact", label: "ติดต่อแล้ว", icon: PhoneCall, primary: true });
    if (allowed.includes("meeting") && works) btns.push({ a: "meeting", label: "นัดประชุม", icon: CalendarClock });
    if (allowed.includes("qualify") && works) btns.push({ a: "qualify", label: "เปิดลูกค้า", icon: CheckCircle2, primary: lead.status === "meeting" });
    if (allowed.includes("bounce") && works) btns.push({ a: "bounce", label: "ตีกลับ", icon: Undo2 });
    if (allowed.includes("disqualify") && works) btns.push({ a: "disqualify", label: "ไม่ไปต่อ", icon: Ban });
    return btns;
  };

  const canEditRow = (lead) => {
    if (["qualified", "disqualified"].includes(lead.status)) return false;
    if (superuser) return true;
    if (role === "marketing") return lead.createdBy != null; // ของตัวเอง — API บังคับซ้ำ
    return canLead;
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
      back={{ href: "/sa", label: "กลับไปภาพรวม" }}
      headerRight={
        <>
          <MonthPicker value={month} onChange={setMonth} />
          {canLead && (
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

        <section className="kpi-grid" aria-busy={loading}>
          <KpiCard icon={<Inbox size={16} aria-hidden="true" />} label={`ลีดเดือน ${month}`} value={kpi?.funnel?.total ?? "-"} hint={`เปิดลูกค้าแล้ว ${kpi?.funnel?.qualified ?? 0} · ไม่ไปต่อ ${kpi?.funnel?.disqualified ?? 0}`} />
          <KpiCard icon={<Filter size={16} aria-hidden="true" />} label="SLA คัดกรอง ≤1 วันทำการ" value={slaPct(kpi?.sla?.screen)} hint={`ตรวจ ${kpi?.sla?.screen?.checked ?? 0} ใบ · ค้างคิว ${kpi?.sla?.screen?.pending ?? 0}`} />
          <KpiCard icon={<PhoneCall size={16} aria-hidden="true" />} label="SLA ติดต่อกลับ ≤1 วันทำการ" value={slaPct(kpi?.sla?.contact)} hint={`ตรวจ ${kpi?.sla?.contact?.checked ?? 0} ใบ · ค้างติดต่อ ${kpi?.sla?.contact?.pending ?? 0}`} />
          <KpiCard icon={<CalendarClock size={16} aria-hidden="true" />} label="นัดประชุม / ตีกลับ" value={`${kpi?.funnel?.meeting ?? 0} / ${kpi?.funnel?.bounced ?? 0}`} hint={<Link href="/sa/kpi" className="linklike">ดู KPI เต็ม →</Link>} />
        </section>

        <section className="glass-panel" style={{ padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            <div className="search-glass" style={{ width: 260 }}>
              <Search size={16} color="var(--text-3)" aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาลีด / บริษัท / เบอร์" aria-label="ค้นหาลีด" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-select" aria-label="กรองสถานะ" style={{ width: 210 }}>
              <option value="open">ที่ยังไม่ปิด (คิวงาน)</option>
              <option value="all">ทุกสถานะ</option>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]} ({countBy[s] || 0})</option>)}
            </select>
            <div className="spacer" />
            <span className="ui-badge">{filtered.length} ลีด</span>
          </div>

          <div className="premium-glass-table table-responsive" aria-busy={loading}>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>ลูกค้า/ผู้ติดต่อ</th>
                  <th>ช่องทาง</th>
                  <th>บริการที่สนใจ</th>
                  <th className="num">Budget</th>
                  <th>ทีม / ผู้รับผิดชอบ</th>
                  <th>สถานะ</th>
                  <th>รับเมื่อ</th>
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
                    <td><span className="ui-badge" style={{ color: "var(--text-2)" }}>{LEAD_CHANNEL_LABELS[lead.channel] || lead.channel}</span></td>
                    <td>
                      {SERVICE_INTEREST_LABELS[lead.serviceInterest] || lead.serviceInterest}
                      {lead.serviceDetail && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{lead.serviceDetail}</span>}
                    </td>
                    <td className="num mono">{lead.budget != null ? fmtMoney(lead.budget) : "-"}</td>
                    <td>
                      {lead.team ? `${TEAM_LABELS[lead.team] || lead.team}` : "-"}
                      {lead.assigneeName && <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{lead.assigneeName}</span>}
                    </td>
                    <td>
                      {statusBadge(lead.status)}
                      {lead.disqualifiedReason && <span style={{ display: "block", color: "var(--text-3)", fontSize: 11 }}>{lead.disqualifiedReason}</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12.5, color: "var(--text-2)" }}>{fmtDateTime(lead.createdAt)}</td>
                    <td className="num">
                      <div className="flex items-center gap-1.5 justify-end" style={{ flexWrap: "wrap" }}>
                        {rowActions(lead).map(({ a, label, icon: Icon, primary }) => (
                          <button key={a} type="button" className={`btn sm ${primary ? "btn-primary" : "ghost"}`} onClick={() => openAction(lead, a)} disabled={!!busy}>
                            <Icon size={13} aria-hidden="true" /> {label}
                          </button>
                        ))}
                        {canEditRow(lead) && (
                          <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} title="แก้ไขลีด" aria-label={`แก้ไข ${lead.contactName}`}
                            onClick={() => { setForm({ id: lead.id, channel: lead.channel, contactName: lead.contactName || "", company: lead.company || "", email: lead.email || "", contactChannel: lead.contactChannel || "", phone: lead.phone || "", serviceInterest: lead.serviceInterest || "other", serviceDetail: lead.serviceDetail || "", budget: lead.budget ?? "", details: lead.details || "" }); setFormOpen(true); }}>
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                        )}
                        {superuser && (
                          <button type="button" className="btn-icon danger" title="ลบลีด" aria-label={`ลบ ${lead.contactName}`} onClick={() => deleteLead(lead)}>
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !loading && (
                  <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีลีดตามตัวกรองนี้ {canLead ? "— เริ่มจากปุ่มรับลีดใหม่" : ""}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ฟอร์มรับ/แก้ลีด */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={form.id ? "แก้ไขลีด" : "รับลีดใหม่"} size="lg">
        <form onSubmit={saveLead} className="form-grid" aria-busy={busy === "save"} style={{ padding: 18 }}>
          <label>
            ชื่อลูกค้า/ผู้ติดต่อ *
            <input className="premium-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
          </label>
          <label>
            บริษัท/แบรนด์
            <input className="premium-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </label>
          <label>
            ช่องทางที่รับลีด *
            <select className="premium-select" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {LEAD_CHANNELS.map((c) => <option key={c} value={c}>{LEAD_CHANNEL_LABELS[c]}</option>)}
            </select>
          </label>
          <label>
            เบอร์โทร
            <input className="premium-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label>
            อีเมล
            <input type="email" className="premium-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            ช่องทางติดต่ออื่น (LINE ID ฯลฯ)
            <input className="premium-input" value={form.contactChannel} onChange={(e) => setForm({ ...form, contactChannel: e.target.value })} />
          </label>
          <label>
            บริการที่สนใจ *
            <select className="premium-select" value={form.serviceInterest} onChange={(e) => setForm({ ...form, serviceInterest: e.target.value })}>
              {SERVICE_INTERESTS.map((s) => <option key={s} value={s}>{SERVICE_INTEREST_LABELS[s]}</option>)}
            </select>
          </label>
          <label>
            รายละเอียดบริการ{SERVICE_DETAIL_REQUIRED.has(form.serviceInterest) ? " *" : ""}
            <input className="premium-input" value={form.serviceDetail} onChange={(e) => setForm({ ...form, serviceDetail: e.target.value })} required={SERVICE_DETAIL_REQUIRED.has(form.serviceInterest)} placeholder={form.serviceInterest === "product" ? "ระบุสินค้าที่สนใจ" : "ระบุ"} />
          </label>
          <label>
            Budget (บาท)
            <input type="number" min="0" step="0.01" className="premium-input mono" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </label>
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

      {/* โมดัล action ตาม transition */}
      <Modal open={!!actionModal} onClose={() => !busy && setActionModal(null)} size="sm"
        title={actionModal ? ({ screen: "คัดกรอง — เลือกทีม", assign: "มอบหมาย AE", contact: "บันทึกติดต่อกลับ", meeting: "บันทึกนัดประชุม", qualify: "เปิดลูกค้า (ผูกฐานข้อมูล)", disqualify: "ไม่ไปต่อ", bounce: "ตีกลับ (ทีมไม่ตรง)" }[actionModal.action]) : ""}>
        {actionModal && (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              ลีด: <strong style={{ color: "var(--text)" }}>{actionModal.lead.contactName}</strong>{actionModal.lead.company ? ` · ${actionModal.lead.company}` : ""}
            </div>
            {actionModal.action === "screen" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                ส่งให้ทีม
                <select className="premium-select" value={actTeam} onChange={(e) => setActTeam(e.target.value)}>
                  <option value="">— เลือกทีม —</option>
                  {TEAMS.map((t) => <option key={t} value={t}>{TEAM_LABELS[t]}</option>)}
                </select>
              </label>
            )}
            {actionModal.action === "assign" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                AE ผู้รับผิดชอบ (ทีม {TEAM_LABELS[actionModal.lead.team] || actionModal.lead.team})
                <select className="premium-select" value={actAssignee} onChange={(e) => setActAssignee(e.target.value)}>
                  <option value="">— เลือก AE —</option>
                  {users.filter((u) => ["ae", "senior_ae"].includes(u.role) && (!actionModal.lead.team || u.team === actionModal.lead.team)).map((u) => (
                    <option key={u.id} value={u.id}>{fmtName(u)}{u.role === "senior_ae" ? " (Senior)" : ""}</option>
                  ))}
                </select>
              </label>
            )}
            {["contact", "meeting"].includes(actionModal.action) && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                วัน-เวลา{actionModal.action === "meeting" ? "นัด" : "ที่ติดต่อ"}
                <input type="datetime-local" className="premium-input" value={actAt} onChange={(e) => setActAt(e.target.value)} />
              </label>
            )}
            {actionModal.action === "meeting" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                รูปแบบนัด
                <select className="premium-select" value={actMode} onChange={(e) => setActMode(e.target.value)}>
                  {MEETING_MODES.map((m) => <option key={m} value={m}>{MEETING_MODE_LABELS[m]}</option>)}
                </select>
              </label>
            )}
            {actionModal.action === "qualify" && (
              <>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  ลูกค้าในฐานข้อมูล
                  <select className="premium-select" value={actCustomer} onChange={(e) => setActCustomer(e.target.value)}>
                    <option value="">— เลือกลูกค้า —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  ยังไม่มีในระบบ? <Link href="/database/customers" className="linklike" target="_blank">เปิดลูกค้าใหม่ที่ฐานข้อมูล</Link> แล้วกลับมาเลือก — จากนั้นไปเปิดโครงการ/ดีลต่อที่หน้า <Link href="/sa/deals" className="linklike">ดีล</Link>
                </div>
              </>
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
                  || (actionModal.action === "qualify" && !actCustomer)
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
