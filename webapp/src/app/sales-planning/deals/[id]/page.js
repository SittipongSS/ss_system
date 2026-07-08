"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Circle, ClipboardList, ExternalLink, FileText, FolderKanban, Lock, MessageSquare, PackageCheck, Pencil, RefreshCcw, Save, Send, Trash2, Trophy, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { DEAL_STAGES, SALES_FEATURES, STAGE_LABELS } from "@/lib/salesPlanning";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { dealLifecycle } from "@/lib/salesPlanningLifecycle";

// ข้อความอธิบาย drift แต่ละรายการ (FC รอบล่าสุดต่างจากตอน map)
function driftText(it) {
  if (it.kind === "dropped") return `${it.fgCode}: ถูกตัดออกจาก FC ล่าสุด (เดิม ${it.month} · ${Number(it.fromQty || 0).toLocaleString("th-TH")})`;
  if (it.kind === "shifted") return `${it.fgCode}: เลื่อนเดือน ${it.month} → ${(it.toMonths || []).join(", ")}`;
  if (it.kind === "qtyChanged") return `${it.fgCode} (${it.month}): จำนวน ${Number(it.fromQty || 0).toLocaleString("th-TH")} → ${Number(it.toQty || 0).toLocaleString("th-TH")}`;
  return `${it.fgCode}: มีการเปลี่ยนแปลง`;
}

const money = (value) => fmtMoney(value);

// สถานะที่เลือกได้ (won = ปิดสุดท้าย; ไม่มี in_project ให้เลือก แต่ STAGE_LABELS ยังรองรับข้อมูลเก่า)
const PIPELINE_STAGES = DEAL_STAGES.filter((s) => s !== "in_project");

// ประเภทอัปเดตงาน (feed) — ตรงกับ CHECK ของตาราง sales_deal_activities (mig 0063)
const ACTIVITY_META = {
  note: { label: "บันทึก", color: "var(--text-3)" },
  call: { label: "โทร", color: "var(--blue)" },
  meeting: { label: "ประชุม", color: "var(--violet)" },
  email: { label: "อีเมล", color: "var(--teal)" },
  next_step: { label: "ขั้นถัดไป", color: "var(--amber)" },
};

function stageBadge(stage) {
  const color = {
    draft: "var(--text-3)",
    pending: "var(--amber)",
    sent: "var(--blue)",
    accepted: "var(--green)",
    received: "var(--green)",
    waived: "var(--text-3)",
    rejected: "var(--red)",
    cancelled: "var(--red)",
    lead: "var(--text-3)",
    qualified: "var(--blue)",
    quotation: "var(--amber)",
    timeline_proposed: "var(--blue)",
    awaiting_confirm: "var(--teal)",
    deposit_pending: "var(--violet)",
    won: "var(--green)",
    in_project: "var(--green)",
    lost: "var(--red)",
  }[stage] || "var(--text-3)";
  return (
    <span className="ui-badge" style={{ color, borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}>
      {STAGE_LABELS[stage] || stage || "-"}
    </span>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="glass-panel" style={{ padding: 14 }}>
      <div style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div className="mono tabular-nums" style={{ marginTop: 8, fontSize: 20, fontWeight: 800 }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: 18, color: "var(--text-3)", fontSize: 13 }}>{children}</div>;
}

// แถบ lifecycle: ลีด → … → เข้าโครงการ (lost = แถบแดงแทน)
function DealStepper({ steps, lost }) {
  if (lost) {
    return (
      <div className="glass-panel" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center" }}>
        <Ban size={16} aria-hidden="true" /> ดีลนี้ปิดแบบไม่สำเร็จ (Lost)
      </div>
    );
  }
  return (
    <div className="glass-panel" style={{ padding: "12px 14px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5,
            fontWeight: s.state === "current" ? 700 : 500,
            color: s.state === "done" ? "var(--green)" : s.state === "current" ? "var(--accent)" : "var(--text-3)",
          }}>
            {s.state === "done" ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} fill={s.state === "current" ? "currentColor" : "none"} aria-hidden="true" />}
            {s.label}
          </span>
          {i < steps.length - 1 && <ArrowRight size={12} aria-hidden="true" style={{ color: "var(--text-3)", opacity: 0.5 }} />}
        </div>
      ))}
    </div>
  );
}

// การ์ดปลายทางส่งต่อ 1 ระบบ (PM / สรรพสามิต / ส่งของ / PO)
const ROUTE_BADGE = { done: "เสร็จแล้ว", available: "พร้อมทำ", progress: "กำลังดำเนินการ", locked: "ล็อก" };
const ROUTE_COLOR = { done: "var(--green)", available: "var(--accent)", progress: "var(--amber)", locked: "var(--text-3)" };
function RouteCard({ route, onAction, busy, canEdit }) {
  const color = ROUTE_COLOR[route.status] || "var(--text-3)";
  return (
    <div className="glass-panel" style={{ padding: 14, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{route.label}</span>
        <span className="ui-badge" style={{ marginLeft: "auto", color }}>{ROUTE_BADGE[route.status] || route.status}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 10px" }}>{route.hint}</div>
      {route.actionKind && canEdit ? (
        <button type="button" className="btn btn-primary sm" onClick={() => onAction(route)} disabled={busy}>
          {route.actionKind === "create-project" ? <PackageCheck size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />} {route.actionLabel}
        </button>
      ) : route.href ? (
        <a className="btn sm" href={route.href}><ExternalLink size={13} aria-hidden="true" /> {route.linkLabel || "เปิด"}</a>
      ) : route.status === "locked" ? (
        <button type="button" className="btn ghost sm" disabled><Lock size={13} aria-hidden="true" /> ล็อก</button>
      ) : null}
    </div>
  );
}

export default function DealOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${id}/overview`);
      if (!res.ok) throw new Error((await res.json()).error || "load project center failed");
      setData(await res.json());
    } catch (e) {
      setError(e.message || "load project center failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // ข้อมูลสำหรับโมดัลแก้ดีล + สร้างโครงการ PM — โหลดครั้งเดียว
  useEffect(() => {
    fetch("/api/master/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(d || [])).catch(() => {});
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
  }, []);

  const acceptedQuote = useMemo(() => (data?.quotations || []).find((quote) => quote.status === "accepted"), [data]);
  const pendingDocs = useMemo(() => (data?.documents || []).filter((doc) => doc.status === "pending"), [data]);

  const deal = data?.deal;
  const canEdit = !!data?.canEdit;
  const lc = useMemo(
    () => (deal ? dealLifecycle(deal, {
      projectProducts: data?.projectProducts,
      exciseRegistrations: data?.exciseRegistrations,
      sahamitPo: data?.sahamitPo,
      shipmentPrep: data?.shipmentPrep,
    }) : null),
    [deal, data],
  );

  const [actionBusy, setActionBusy] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");

  // ฟีดอัปเดตงาน (sales_deal_activities)
  const [feedKind, setFeedKind] = useState("note");
  const [feedBody, setFeedBody] = useState("");
  const [feedDue, setFeedDue] = useState("");
  const [feedBusy, setFeedBusy] = useState(false);

  // โมดัลแก้ดีล + สร้าง PM
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealForm, setDealForm] = useState(null);
  const [savingDeal, setSavingDeal] = useState(false);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmInitial, setPmInitial] = useState(null);

  const postActivity = async () => {
    if (!feedBody.trim()) return;
    setFeedBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sales-planning/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: id,
          kind: feedKind,
          body: feedBody.trim(),
          dueDate: feedKind === "next_step" ? (feedDue || null) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โพสต์อัปเดตไม่สำเร็จ");
      setFeedBody("");
      setFeedDue("");
      setFeedKind("note");
      await load();
    } catch (e) {
      setError(e.message || "โพสต์อัปเดตไม่สำเร็จ");
    } finally {
      setFeedBusy(false);
    }
  };

  // แก้ไข/ลบ อัปเดตงาน
  const [editActId, setEditActId] = useState("");
  const [editKind, setEditKind] = useState("note");
  const [editBody, setEditBody] = useState("");
  const [editDue, setEditDue] = useState("");

  const startEditActivity = (act) => {
    setEditActId(act.id);
    setEditKind(act.kind || "note");
    setEditBody(act.body || "");
    setEditDue(act.dueDate || "");
  };
  const cancelEditActivity = () => { setEditActId(""); setEditBody(""); setEditDue(""); };

  const saveEditActivity = async () => {
    if (!editBody.trim()) return;
    setFeedBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/activities/${editActId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: editKind, body: editBody.trim(), dueDate: editKind === "next_step" ? (editDue || null) : null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "แก้ไขอัปเดตไม่สำเร็จ");
      cancelEditActivity();
      await load();
    } catch (e) {
      setError(e.message || "แก้ไขอัปเดตไม่สำเร็จ");
    } finally {
      setFeedBusy(false);
    }
  };

  const deleteActivity = async (act) => {
    if (!window.confirm("ลบอัปเดตงานนี้?")) return;
    setFeedBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/activities/${act.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ลบอัปเดตไม่สำเร็จ");
      await load();
    } catch (e) {
      setError(e.message || "ลบอัปเดตไม่สำเร็จ");
    } finally {
      setFeedBusy(false);
    }
  };

  const runAction = useCallback(async (key, url, opts) => {
    setActionBusy(key);
    setError("");
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setActionBusy("");
    }
  }, [load]);

  const doWin = () => runAction("win", `/api/sales-planning/deals/${id}/win`, { method: "POST" });

  // สร้างโครงการ PM ผ่านโมดัล (เหมือนหน้า PM) พร้อมเติมค่าแนะนำจากดีล
  const openCreatePM = () => {
    if (!deal) return;
    setPmInitial({
      name: deal.title || "",
      customerId: deal.customerId || "",
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: deal.expectedCloseDate || "",
      type: "NPD",
      aeOwner: deal.ownerName || "",
    });
    setPmModalOpen(true);
  };
  const handlePmSuccess = async (payload) => {
    setPmModalOpen(false);
    if (payload?.productWarning) setError(payload.productWarning);
    await load();
  };

  // แก้ไขดีล (โมดัล)
  const openEditDeal = () => {
    if (!deal) return;
    setDealForm({
      title: deal.title || "",
      customerId: deal.customerId || "",
      stage: deal.stage || "lead",
      projectValue: deal.projectValue ?? "",
      forecastMonth: deal.forecastMonth || "",
      expectedCloseDate: deal.expectedCloseDate || "",
      depositPaid: !!deal.depositPaid,
      notes: deal.notes || "",
    });
    setDealModalOpen(true);
  };
  const saveDeal = async (e) => {
    e.preventDefault();
    setSavingDeal(true);
    setError("");
    try {
      const selected = customers.find((c) => c.id === dealForm.customerId);
      const res = await fetch(`/api/sales-planning/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dealForm, customerName: selected?.name || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      setDealModalOpen(false);
      await load();
    } catch (e2) {
      setError(e2.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSavingDeal(false);
    }
  };
  const deleteDeal = async () => {
    if (!deal) return;
    if (!window.confirm(`ลบโครงการ "${deal.title}"? การลบนี้ย้อนกลับไม่ได้`)) return;
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
      router.push("/sales-planning/deals");
    } catch (e) {
      setError(e.message || "ลบไม่สำเร็จ");
    }
  };

  // สร้างทะเบียนสรรพสามิต FG ที่ระบุ (reuse action เดียวกับหน้า PM) แล้วพาไปหน้าทะเบียน
  const doCreateExcise = async (productId) => {
    if (!deal?.projectId) return;
    setActionBusy("excise");
    setError("");
    try {
      const res = await fetch(`/api/excise-registrations/from-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: deal.projectId, ...(productId ? { productId } : {}) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "สร้างทะเบียนสรรพสามิตไม่สำเร็จ");
      if (payload.id) router.push(`/tax/registrations/${payload.id}`);
      else await load();
    } catch (e) {
      setError(e.message || "สร้างทะเบียนสรรพสามิตไม่สำเร็จ");
    } finally {
      setActionBusy("");
    }
  };

  // dispatch ปุ่ม action ของการ์ด Routing
  const onRouteAction = (route) => {
    if (route.actionKind === "create-project") openCreatePM();
    else if (route.actionKind === "create-excise") doCreateExcise(route.productId);
  };
  const doLost = async () => {
    const okDone = await runAction("lost", `/api/sales-planning/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "lost", lostReason: lostReason.trim() || null }),
    });
    if (okDone) { setLostOpen(false); setLostReason(""); }
  };

  // ปุ่มหลักของการ์ด "ขั้นต่อไป" ตาม nextAction.kind
  const nextPrimary = () => {
    if (!canEdit || !lc?.nextAction) return null;
    const k = lc.nextAction.kind;
    if (k === "win") return <button type="button" className="btn btn-primary" onClick={doWin} disabled={!!actionBusy}><Trophy size={14} aria-hidden="true" /> ปิดได้ (Won)</button>;
    if (k === "create_project") return <button type="button" className="btn btn-primary" onClick={openCreatePM} disabled={!!actionBusy}><PackageCheck size={14} aria-hidden="true" /> สร้างโครงการ</button>;
    if (k === "open_project" && deal.projectId) return <a className="btn btn-primary" href={`/pm/projects/${deal.projectId}`}><ExternalLink size={14} aria-hidden="true" /> เปิดโครงการ</a>;
    return null;
  };
  const headerRight = (
    <>
      {canEdit && lc?.canGo && (
        <button type="button" className="btn btn-primary" onClick={doWin} disabled={!!actionBusy}>
          <Trophy size={15} aria-hidden="true" /> ปิดได้ (Won)
        </button>
      )}
      {canEdit && lc?.canNoGo && (
        <button type="button" className="btn ghost" onClick={() => setLostOpen(true)} disabled={!!actionBusy}>
          <Ban size={15} aria-hidden="true" /> ไม่ไปต่อ
        </button>
      )}
      {deal?.projectId && (
        <a className="btn" href={`/pm/projects/${deal.projectId}`}>
          <ExternalLink size={15} aria-hidden="true" /> โครงการ PM
        </a>
      )}
      {canEdit && (
        <button type="button" className="btn" onClick={openEditDeal} disabled={!!actionBusy}>
          <Pencil size={15} aria-hidden="true" /> แก้ไข
        </button>
      )}
      {canEdit && (
        <button type="button" className="btn ghost" onClick={deleteDeal} disabled={!!actionBusy} title="ลบโครงการ">
          <Trash2 size={15} aria-hidden="true" /> ลบ
        </button>
      )}
      <button type="button" className="btn" onClick={load} disabled={loading}>
        <RefreshCcw size={15} aria-hidden="true" /> รีเฟรช
      </button>
    </>
  );

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title={deal?.title || "ศูนย์รวมโครงการ"}
      subtitle={deal ? `${deal.customerName || deal.customer?.name || "ไม่มีลูกค้า"} · ${deal.forecastMonth || "ไม่มีเดือนพยากรณ์"}` : "ศูนย์รวมโครงการ"}
      back={{ href: "/sales-planning", label: "กลับไปภาพรวม" }}
      headerRight={headerRight}
      loading={loading}
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {deal && (
        <div className="flex flex-col gap-5">
          {lc && <DealStepper steps={lc.steps} lost={deal.stage === "lost"} />}

          {lc?.nextAction && (
            <div className="glass-panel" style={{ padding: 16, borderLeft: "3px solid var(--accent)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>ขั้นต่อไป</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{lc.nextAction.label}</div>
                {lc.nextAction.hint && <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>{lc.nextAction.hint}</div>}
              </div>
              {nextPrimary()}
            </div>
          )}

          {!!data?.warnings?.length && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", color: "var(--amber)", borderColor: "var(--amber)" }}>
              {data.warnings.join(" · ")}
            </div>
          )}

          {data?.forecastDrift?.hasDrift && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", borderColor: "var(--amber)", borderLeft: "3px solid var(--amber)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--amber)", fontWeight: 700 }}>
                <AlertTriangle size={16} aria-hidden="true" />
                FC สหมิตรรอบล่าสุด (#{data.forecastDrift.latestRoundNo}) ต่างจากตอนสร้างดีล
              </div>
              <ul style={{ margin: "8px 0 4px", paddingLeft: 20, fontSize: 13 }}>
                {data.forecastDrift.items.map((it, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{driftText(it)}</li>
                ))}
              </ul>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                คำแนะนำ: ดีลถูกล็อกตัวเลขไว้ตอน map — ปรับ “เดือนคาดได้รับ PO” / มูลค่าดีลเองหากต้องการให้ตรงกับ FC ล่าสุด
              </div>
            </div>
          )}

          <section className="kpi-grid">
            <Stat label="สถานะ" value={stageBadge(deal.stage)} hint={deal.depositPaid ? "ได้รับมัดจำ" : "ยังไม่ยืนยันมัดจำ"} />
            <Stat label="มูลค่าโครงการ" value={money(deal.projectValue)} hint={deal.forecastMonth || "-"} />
            {SALES_FEATURES.quotations && (
              <Stat label="ใบเสนอที่รับแล้ว" value={acceptedQuote ? money(acceptedQuote.totalAmount) : "-"} hint={acceptedQuote?.quoteNumber || "ยังไม่มีใบเสนอที่รับ"} />
            )}
            {SALES_FEATURES.documents && (
              <Stat label="เอกสารค้าง" value={pendingDocs.length} hint={`${data.documents?.length || 0} รายการ`} />
            )}
          </section>

          <section className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <PackageCheck size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>งานผลิต (PM)</h2>
              <div className="spacer" />
              {data.project && <a className="btn ghost" href={`/pm/projects/${data.project.id}`}><ExternalLink size={14} aria-hidden="true" /> เปิด</a>}
            </div>
            {data.project ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <Stat label="โครงการ" value={data.project.code || data.project.id} hint={data.project.status || "-"} />
                <Stat label="ประเภท" value={data.project.type || "-"} hint={data.project.dueDate ? `กำหนด ${data.project.dueDate}` : "ไม่มีกำหนด"} />
                <Stat label="รายการ FG" value={data.projectProducts?.length || 0} hint={(data.projectProducts || []).slice(0, 2).map((row) => row.product?.fgCode).filter(Boolean).join(", ") || "-"} />
                {SALES_FEATURES.shipment && (
                  <Stat label="เอกสารส่งของ" value={data.shipmentPrep ? data.shipmentPrep.status : "-"} hint={data.shipmentPrep ? `${data.shipmentPrep.lines?.length || 0} รายการ` : "ยังไม่สร้าง"} />
                )}
              </div>
            ) : <Empty>ยังไม่ได้ผูกโครงการ PM</Empty>}
          </section>

          {(SALES_FEATURES.quotations || SALES_FEATURES.documents) && (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {SALES_FEATURES.quotations && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ใบเสนอราคา</h2>
              </div>
              {(data.quotations || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th>เลขที่</th><th>สถานะ</th><th>อนุมัติ</th><th className="num">ยอดรวม</th></tr>
                    </thead>
                    <tbody>
                      {data.quotations.map((quote) => (
                        <tr key={quote.id} className="premium-row">
                          <td className="mono">{quote.quoteNumber}</td>
                          <td>{stageBadge(quote.status)}</td>
                          <td>{stageBadge(quote.approvalStatus || "not_required")}</td>
                          <td className="num mono">{money(quote.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>ยังไม่มีใบเสนอราคา</Empty>}
            </section>
            )}

            {SALES_FEATURES.documents && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>เอกสาร</h2>
              </div>
              {(data.documents || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th>เอกสาร</th><th>สถานะ</th><th>กำหนด</th></tr>
                    </thead>
                    <tbody>
                      {data.documents.map((doc) => (
                        <tr key={doc.id} className="premium-row">
                          <td>{doc.title}<span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>{doc.kind}</span></td>
                          <td>{stageBadge(doc.status)}</td>
                          <td className="mono">{doc.dueDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>ยังไม่มีรายการเอกสาร</Empty>}
            </section>
            )}
          </div>
          )}

          {lc && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ส่งต่อ (Routing)</h2>
              </div>
              {lc.routes.length ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {lc.routes.map((route) => (
                    <RouteCard key={route.kind} route={route} onAction={onRouteAction} busy={!!actionBusy} canEdit={canEdit} />
                  ))}
                </div>
              ) : <Empty>ยังไม่มีปลายทางที่ต้องส่งต่อ</Empty>}
            </section>
          )}

          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>อัปเดตงาน</h2>
                <span className="ui-badge" style={{ marginLeft: "auto", color: "var(--text-3)" }}>{(data.activities || []).length} รายการ</span>
              </div>

              {canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select className="premium-select" value={feedKind} onChange={(e) => setFeedKind(e.target.value)} style={{ width: 140 }} aria-label="ประเภทอัปเดต">
                      {Object.entries(ACTIVITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </select>
                    {feedKind === "next_step" && (
                      <input type="date" className="premium-input" value={feedDue} onChange={(e) => setFeedDue(e.target.value)} style={{ width: 160 }} aria-label="กำหนดวันขั้นถัดไป" />
                    )}
                  </div>
                  <textarea
                    className="premium-input"
                    rows={2}
                    value={feedBody}
                    onChange={(e) => setFeedBody(e.target.value)}
                    placeholder="พิมพ์อัปเดตงาน เช่น โทรคุยลูกค้าแล้ว รอส่งใบเสนอราคา..."
                    style={{ resize: "vertical" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-primary sm" onClick={postActivity} disabled={feedBusy || !feedBody.trim()}>
                      <Send size={13} aria-hidden="true" /> {feedBusy ? "กำลังโพสต์..." : "โพสต์"}
                    </button>
                  </div>
                </div>
              )}

              {(data.activities || []).length ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.activities.map((act) => {
                    const meta = ACTIVITY_META[act.kind] || ACTIVITY_META.note;
                    if (editActId === act.id) {
                      return (
                        <li key={act.id} style={{ borderLeft: `3px solid ${meta.color}`, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <select className="premium-select" value={editKind} onChange={(e) => setEditKind(e.target.value)} style={{ width: 140 }} aria-label="ประเภทอัปเดต">
                              {Object.entries(ACTIVITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                            </select>
                            {editKind === "next_step" && (
                              <input type="date" className="premium-input" value={editDue} onChange={(e) => setEditDue(e.target.value)} style={{ width: 160 }} aria-label="กำหนดวัน" />
                            )}
                          </div>
                          <textarea className="premium-input" rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ resize: "vertical" }} />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button type="button" className="btn ghost sm" onClick={cancelEditActivity} disabled={feedBusy}><X size={13} aria-hidden="true" /> ยกเลิก</button>
                            <button type="button" className="btn btn-primary sm" onClick={saveEditActivity} disabled={feedBusy || !editBody.trim()}><Save size={13} aria-hidden="true" /> บันทึก</button>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={act.id} style={{ borderLeft: `3px solid ${meta.color}`, paddingLeft: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span className="ui-badge" style={{ color: meta.color }}>{meta.label}</span>
                          {act.dueDate && <span style={{ fontSize: 12, color: "var(--amber)" }}>กำหนด {act.dueDate}</span>}
                          {canEdit && (
                            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                              <button type="button" className="btn icon-only ghost" onClick={() => startEditActivity(act)} aria-label="แก้ไขอัปเดต" disabled={feedBusy}><Pencil size={14} aria-hidden="true" /></button>
                              <button type="button" className="btn icon-only ghost" onClick={() => deleteActivity(act)} aria-label="ลบอัปเดต" disabled={feedBusy}><Trash2 size={14} aria-hidden="true" /></button>
                            </span>
                          )}
                        </div>
                        <div style={{ margin: "4px 0 2px", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{act.body}</div>
                        <div style={{ color: "var(--text-3)", fontSize: 12 }}>{act.createdByName || "-"} · {act.createdAt ? fmtDateTime(act.createdAt) : "-"}</div>
                      </li>
                    );
                  })}
                </ul>
              ) : <Empty>ยังไม่มีอัปเดตงาน{canEdit ? " — เริ่มโพสต์ได้เลย" : ""}</Empty>}
            </section>

            <section className="glass-panel" style={{ padding: 16 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700 }}>ความเคลื่อนไหวล่าสุด</h2>
              {(data.stageHistory || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.stageHistory.slice(0, 6).map((row) => (
                    <li key={row.id} style={{ marginBottom: 8 }}>
                      {STAGE_LABELS[row.fromStage] || row.fromStage || "เริ่ม"} → {STAGE_LABELS[row.toStage] || row.toStage}
                      <span style={{ display: "block", color: "var(--text-3)", fontSize: 12 }}>
                        {row.changedByName || "-"} · {row.changedAt ? fmtDateTime(row.changedAt) : "-"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <Empty>ยังไม่มีการเปลี่ยนสถานะ</Empty>}
            </section>
          </div>
        </div>
      )}

      <Modal open={lostOpen} onClose={() => !actionBusy && setLostOpen(false)} title="ปิดดีลแบบไม่สำเร็จ (Lost)" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            เหตุผล (ไม่บังคับ)
            <textarea
              rows={3}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="เช่น ลูกค้าเลือกคู่แข่ง / ราคาสูงเกิน / เลื่อนโครงการ"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-1)", fontSize: 13, resize: "vertical" }}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setLostOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={doLost} disabled={!!actionBusy}>
              <Ban size={14} aria-hidden="true" /> {actionBusy === "lost" ? "กำลังบันทึก..." : "ยืนยัน Lost"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={dealModalOpen} onClose={() => setDealModalOpen(false)} title="แก้ไขโครงการ" size="lg">
        {dealForm && (
          <form onSubmit={saveDeal} className="form-grid" aria-busy={savingDeal} style={{ padding: 18 }}>
            <label>
              ชื่อโครงการ
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
                {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
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
              คาดปิดได้ (วันที่)
              <input type="date" className="premium-input" value={dealForm.expectedCloseDate} onChange={(e) => setDealForm({ ...dealForm, expectedCloseDate: e.target.value })} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={dealForm.depositPaid} onChange={(e) => setDealForm({ ...dealForm, depositPaid: e.target.checked })} />
              ได้รับมัดจำแล้ว (จำเป็นสำหรับสถานะ Won)
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              รายละเอียด
              <textarea className="premium-input" rows={3} value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} />
            </label>
            <div className="drawer-actions" style={{ gridColumn: "1 / -1" }}>
              <button type="button" className="btn" onClick={() => setDealModalOpen(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={savingDeal}>
                <Save size={15} aria-hidden="true" /> {savingDeal ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ProjectFormModal
        open={pmModalOpen}
        onClose={() => setPmModalOpen(false)}
        editingId={null}
        initialData={pmInitial}
        onSuccess={handlePmSuccess}
        customers={customers}
        categories={categories}
        allProducts={allProducts}
        createEndpoint={`/api/sales-planning/deals/${id}/create-project`}
        createLabel="สร้างโครงการ PM"
      />
    </Workspace>
  );
}
