"use client";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Circle, ClipboardList, ExternalLink, FileText, FolderKanban, MessageSquare, PackageCheck, Paperclip, Pencil, Plus, Printer, Save, Send, Trash2, Trophy, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { DEAL_STAGES, DEAL_TYPES, DEAL_TYPE_LABELS, SALES_FEATURES, STAGE_LABELS, dealTypeOf } from "@/lib/salesPlanning";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { dealLifecycle } from "@/lib/salesPlanningLifecycle";
import { useRole, useTeam } from "@/lib/roleContext";
import { canDeleteRecord, isSuperuser } from "@/lib/permissions";
import { FORECAST_LEVELS, dealTypeBadge, snapForecastLevel } from "@/components/salesPlanning/ui";
import { brandThList, normalizeBrands } from "@/lib/master/brands";
import AddBrandButton from "@/components/master/AddBrandButton";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import TimelineWorkspace from "@/components/pm/TimelineWorkspace";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { entityCodeDisplay } from "@/lib/entityCode";
import SalesDetailTabs from "@/components/salesPlanning/SalesDetailTabs";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { detailTabFromSearch } from "@/lib/salesDetailTabs";
import { IMAGE_ACCEPT_ATTR, MAX_UPLOAD_MB, MAX_UPLOAD_BYTES } from "@/lib/master/attachmentTypes";
import { useResponsiveView } from "@/lib/useResponsiveView";

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
      {stage === "accepted" ? "Won" : STAGE_LABELS[stage] || stage || "-"}
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

const TASK_STATUS_META = {
  Pending: { label: "รอ", color: "var(--text-3)" },
  "In Progress": { label: "กำลังทำ", color: "var(--accent)" },
  Completed: { label: "เสร็จแล้ว", color: "var(--green)" },
};

function TaskStatusBadge({ status }) {
  const meta = TASK_STATUS_META[status] || { label: status || "-", color: "var(--text-3)" };
  return <span className="ui-badge" style={{ color: meta.color }}>{meta.label}</span>;
}

// แถบ lifecycle: ลีด → … → เข้าโครงการ (lost = แถบแดงแทน) — ฝังใน hero สถานะ
function DealStepper({ steps, lost }) {
  if (lost) {
    return (
      <div style={{ color: "var(--red)", display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600 }}>
        <Ban size={16} aria-hidden="true" /> ดีลนี้ปิดแบบไม่สำเร็จ (Lost)
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5,
            fontWeight: s.state === "current" ? 800 : 650,
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

const ROUTE_COLOR = { done: "var(--green)", available: "var(--accent)", progress: "var(--amber)", locked: "var(--text-3)" };
function RouteMenuButton({ route, onAction, busy, canEdit }) {
  const color = ROUTE_COLOR[route.status] || "var(--text-3)";
  if (route.actionKind && canEdit) {
    return (
      <button type="button" className={`btn sm${route.status === "available" ? " btn-primary" : ""}`} onClick={() => onAction(route)} disabled={busy} title={route.hint} style={{ borderColor: color }}>
        {route.actionKind?.startsWith("create-") ? <Plus size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />} {route.actionLabel || route.label}
      </button>
    );
  }
  if (route.href) {
    return <a className="btn sm" href={route.href} title={route.hint} style={{ borderColor: color }}><ExternalLink size={13} aria-hidden="true" /> {route.linkLabel || route.label}</a>;
  }
  return null;
}

export default function DealOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // เมนูครอบ (แบบเดียวกับหน้าโครงการ): ภาพรวม (default) ↔ ไทม์ไลน์ — sync ?tab=timeline
  const [tab, setTab] = useState("overview");
  const [timelineView, setTimelineView] = useResponsiveView({ portrait: "list", landscape: "table" });
  useEffect(() => {
    setTab(detailTabFromSearch(window.location.search));
  }, []);
  const switchTab = (t) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t !== "overview") url.searchParams.set("tab", t);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };
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
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((d) => setProjects(d || [])).catch(() => {});
  }, []);

  const acceptedQuote = useMemo(() => (data?.quotations || []).find((quote) => quote.status === "accepted"), [data]);
  const pendingDocs = useMemo(() => (data?.documents || []).filter((doc) => doc.status === "pending"), [data]);

  // ไทม์ไลน์รวม: อัปเดตงาน (activities) + การเปลี่ยนสถานะ (stageHistory) เรียงเวลาล่าสุดก่อน
  const timeline = useMemo(() => {
    const acts = (data?.activities || []).map((a) => ({ type: "activity", at: a.createdAt, act: a }));
    const stages = (data?.stageHistory || []).map((s) => ({ type: "stage", at: s.changedAt, stage: s }));
    return [...acts, ...stages].sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")));
  }, [data]);

  // สรุปความคืบหน้าไทม์ไลน์ (จาก project_tasks ของโครงการ PM ที่ผูก)
  const taskSummary = useMemo(() => {
    const tasks = data?.projectTasks || [];
    const done = tasks.filter((t) => t.status === "Completed").length;
    const current = tasks.find((t) => t.status === "In Progress");
    return { total: tasks.length, done, current };
  }, [data]);
  const dealTaskSummary = useMemo(() => {
    const tasks = data?.dealTasks || [];
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === "Completed").length,
      active: tasks.filter((t) => t.status !== "Completed").length,
    };
  }, [data]);

  // พิมพ์เอกสารไทม์ไลน์ของดีล — ใช้ตัว gen เดียวกับหน้าโครงการ (openGanttPrintWindow)
  // แต่ไม่ออกเลข Rev / ไม่เก็บประวัติ (rev+revDate = null) ตามมติผู้ใช้.
  const printDealTimeline = () => {
    if (!deal) return;
    openGanttPrintWindow({
      code: deal.code || "",
      docNumber: deal.code || "",
      name: deal.title || "",
      productName: deal.title || "",
      customerName: deal.customerName || deal.customer?.name || "",
      aeOwner: deal.ownerName || "",
      aeSupervisor: "",
      preparedBy: deal.ownerName || "",
      startDate: deal.startDate || data?.project?.startDate || "",
      dueDate: deal.endDate || deal.expectedCloseDate || data?.project?.dueDate || "",
      metadata: { brand: deal.metadata?.brand || deal.brand || "" },
      categoryFallback: deal.categoryCode || "",
      projectProducts: data?.projectProducts || [],
      tasks: data?.projectTasks || [],
      rev: null,     // ไม่ออกเลข Rev
      revDate: null, // ไม่มีวันที่ Rev / ไม่เก็บประวัติ
    });
  };

  // เวลาปัจจุบันจับใน effect (กฎ react-hooks/purity ห้าม Date.now() ระหว่าง render)
  const [nowMs, setNowMs] = useState(null);
  useEffect(() => { setNowMs(Date.now()); }, [data]);

  // จำนวนวันตั้งแต่วันที่กำหนด (null ถ้าไม่มีข้อมูล)
  const daysSince = (iso) => {
    if (!iso || nowMs == null) return null;
    const ms = nowMs - new Date(iso).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86400000)) : null;
  };
  const stageSinceAt = data?.stageHistory?.[0]?.changedAt || data?.deal?.createdAt;
  const daysInStage = daysSince(stageSinceAt);
  const dealAgeDays = daysSince(data?.deal?.createdAt);
  // วันคงเหลือถึงวันคาดปิด (ติดลบ = เลยกำหนด)
  const daysToClose = useMemo(() => {
    const d = data?.deal?.expectedCloseDate;
    if (!d || nowMs == null) return null;
    const diff = Math.ceil((new Date(`${d}T00:00:00`) - nowMs) / 86400000);
    return Number.isFinite(diff) ? diff : null;
  }, [data, nowMs]);

  const deal = data?.deal;
  const canEdit = !!data?.canEdit;
  const role = useRole();
  const team = useTeam();
  const alreadyWon = ["won", "in_project"].includes(deal?.stage);
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
  const [feedFiles, setFeedFiles] = useState([]); // { file, url } รูปที่เลือกไว้ (ยังไม่อัป)
  const [lightbox, setLightbox] = useState(null); // { src, name } พรีวิวเต็มจอ

  // เลือกรูปแนบ (composer) — กรองขนาด/ชนิด client-side ก่อน, สร้าง objectURL พรีวิว
  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้
    const valid = [];
    for (const file of picked) {
      if (!file.type.startsWith("image/")) { setError(`ไฟล์ ${file.name} ไม่ใช่รูปภาพ`); continue; }
      if (file.size > MAX_UPLOAD_BYTES) { setError(`ไฟล์ ${file.name} ใหญ่เกิน ${MAX_UPLOAD_MB} MB`); continue; }
      valid.push({ file, url: URL.createObjectURL(file) });
    }
    setFeedFiles((prev) => [...prev, ...valid].slice(0, 8));
  };
  const removeFeedFile = (idx) => setFeedFiles((prev) => {
    const next = prev.slice();
    const [gone] = next.splice(idx, 1);
    if (gone) URL.revokeObjectURL(gone.url);
    return next;
  });

  // อัปโหลดรูปหนึ่งไฟล์ผ่าน /api/upload (Drive/Supabase) → คืน ref สำหรับเก็บใน activity
  const uploadOneImage = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    if (deal?.customerId) { fd.append("entityType", "customer"); fd.append("entityId", deal.customerId); }
    if (deal?.customerName) fd.append("customerName", deal.customerName);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `อัปโหลด ${file.name} ไม่สำเร็จ`);
    return { fileUrl: payload.url, driveFileId: payload.driveFileId || null, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
  };

  // โมดัลแก้ดีล + สร้าง PM
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const dealBrand = useMemo(() => {
    const value = String(deal?.metadata?.brand || deal?.brand || "").trim();
    const customer = customers.find((item) => item.id === deal?.customerId);
    const brands = normalizeBrands(customer?.brands || []);
    const key = value.toLocaleLowerCase("th-TH");
    const matched = brands.find((item) => item.th.toLocaleLowerCase("th-TH") === key || item.en.toLocaleLowerCase("en-US") === key);
    if (matched) return matched;
    return { th: value, en: "" };
  }, [customers, deal?.brand, deal?.customerId, deal?.metadata?.brand]);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealForm, setDealForm] = useState(null);
  const [savingDeal, setSavingDeal] = useState(false);
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmInitial, setPmInitial] = useState(null);

  const postActivity = async () => {
    if (!feedBody.trim() && !feedFiles.length) return;
    setFeedBusy(true);
    setError("");
    try {
      // อัปรูปที่เลือกไว้ก่อน แล้วแนบ ref ไปกับ activity
      const attachments = [];
      for (const f of feedFiles) attachments.push(await uploadOneImage(f.file));
      const res = await fetch("/api/sales-planning/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: id,
          kind: feedKind,
          body: feedBody.trim(),
          dueDate: feedKind === "next_step" ? (feedDue || null) : null,
          attachments,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โพสต์อัปเดตไม่สำเร็จ");
      setFeedBody("");
      setFeedDue("");
      setFeedKind("note");
      feedFiles.forEach((f) => URL.revokeObjectURL(f.url));
      setFeedFiles([]);
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

  // DL1: ไทม์ไลน์ของดีลเอง (ยังไม่ผูกโครงการ) — gen จาก template ตามประเภท+หมวด,
  // ลบเพื่อสร้างใหม่, และเปลี่ยนสถานะรายขั้น (auto-propagate ขั้นถัดไปที่ server)
  const genOwnTimeline = () => runAction("gen-timeline", `/api/sales-planning/deals/${id}/timeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const dropOwnTimeline = () => {
    if (!window.confirm("ลบไทม์ไลน์ของดีลนี้ทั้งชุด (ความคืบหน้าหายด้วย) แล้วค่อยสร้างใหม่?")) return;
    return runAction("drop-timeline", `/api/sales-planning/deals/${id}/timeline`, { method: "DELETE" });
  };

  // เฟส B: ผูกดีลเข้า "โครงการเดิม" ของลูกค้า (หลายดีลต่อโครงการ) — โหลดโครงการ
  // ของลูกค้ารายนี้มาให้เลือก แล้วต่อ task ชุดตามประเภทดีลเป็น segment ใหม่
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkProjects, setLinkProjects] = useState([]);
  const [linkProjectId, setLinkProjectId] = useState("");
  const [linkStartDate, setLinkStartDate] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const openLinkProject = async () => {
    setLinkOpen(true);
    setLinkLoading(true);
    setLinkProjects([]);
    setLinkProjectId("");
    setLinkStartDate(new Date().toISOString().slice(0, 10));
    try {
      const res = await fetch("/api/pm/projects");
      const rows = res.ok ? await res.json() : [];
      const mine = (Array.isArray(rows) ? rows : []).filter((p) => !deal.customerId || !p.customerId || p.customerId === deal.customerId);
      setLinkProjects(mine);
      if (mine.length === 1) setLinkProjectId(mine[0].id);
    } catch {
      setLinkProjects([]);
    } finally {
      setLinkLoading(false);
    }
  };
  const submitLinkProject = async () => {
    if (!linkProjectId) { setError("เลือกโครงการที่จะผูกก่อน"); return; }
    const okDone = await runAction("link-project", `/api/sales-planning/deals/${id}/link-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: linkProjectId, startDate: linkStartDate || undefined }),
    });
    if (okDone) setLinkOpen(false);
  };

  // สร้างโครงการ PM ผ่านโมดัล (เหมือนหน้า PM) พร้อมเติมค่าแนะนำจากดีล
  const openCreatePM = () => {
    if (!deal) return;
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
      dealType: dealTypeOf(deal),
      formulaName: deal.formulaName || "",
      categoryCode: deal.categoryCode || "",
      categoryMainCode: String(deal.categoryCode || "").split("-")[0] || "",
      brand: deal.metadata?.brand || "",
      projectValue: deal.projectValue ?? "",
      wonValue: deal.wonValue ?? "",
      probability: snapForecastLevel(deal.probability),
      forecastMonth: deal.forecastMonth || "",
      expectedCloseDate: deal.expectedCloseDate || "",
      startDate: deal.startDate || "",
      endDate: deal.endDate || "",
      depositPaid: !!deal.depositPaid,
      notes: deal.notes || "",
      projectId: deal.projectId || "",
      lockedProjectId: deal.projectId || "",
    });
    setDealModalOpen(true);
  };
  const saveDeal = async (e) => {
    e.preventDefault();
    setSavingDeal(true);
    setError("");
    try {
      const selected = customers.find((c) => c.id === dealForm.customerId);
      // อย่าให้ชื่อลูกค้าหายเมื่อ dropdown โหลดไม่ครบ/ลูกค้า pending ถูกซ่อน — fallback
      // ไปชื่อเดิมของดีลก่อน null (เหมือน logic ในหน้า list)
      const customerName = selected?.name || deal?.customerName || deal?.customer?.name || null;
      const res = await fetch(`/api/sales-planning/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dealForm, customerName }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
      if (dealForm.projectId && !deal.projectId) {
        const linkRes = await fetch(`/api/sales-planning/deals/${id}/link-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: dealForm.projectId, startDate: dealForm.startDate || undefined }),
        });
        if (!linkRes.ok) throw new Error((await linkRes.json().catch(() => ({}))).error || "บันทึกดีลแล้ว แต่เชื่อมโครงการไม่สำเร็จ");
      }
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
    // ระบุให้ชัดว่าจะลบอะไรพ่วงไปบ้าง (Sales เป็นแม่ — ลบทั้งสาย)
    const extras = [];
    if (data?.project) extras.push(`ไทม์ไลน์ ${data.project.code || ""}`.trim());
    if (data?.projectTasks?.length) extras.push(`${data.projectTasks.length} ขั้นตอน`);
    if (data?.shipmentPrep) extras.push("เอกสารเตรียมส่งของ");
    const extraText = extras.length ? `\n\nจะลบพ่วงด้วย: ${extras.join(" · ")}` : "";
    if (!window.confirm(`ลบดีล "${deal.title}"?${extraText}\n\nการลบนี้ย้อนกลับไม่ได้`)) return;
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/deals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
      router.push("/sa/deals");
    } catch (e) {
      setError(e.message || "ลบไม่สำเร็จ");
    }
  };
  // ลบไม่ได้ถ้า: ปิด Won แล้ว / มาจาก PO สหมิตร (นับยอดแล้ว) / มีทะเบียนสรรพสามิตผูก /
  // มี PM project ผูกแต่ผู้ใช้ไม่มีสิทธิ์ลบ project (AE/AC = 'none') — ตรงกับที่ API จะปฏิเสธ
  // จึงไม่โชว์ปุ่มให้กดแล้วเจอ 403/409 (U3).
  const linkedProject = data?.project || null;
  const canDeleteLinkedProject = !deal?.projectId || (linkedProject && canDeleteRecord({ role, team }, "projects", linkedProject));
  const hasExcise = (data?.exciseRegistrations?.length || 0) > 0;
  const superuser = isSuperuser(role);
  const canDelete = deal && (!["won", "in_project"].includes(deal.stage) || superuser) && !deal.metadata?.sahamitPoId
    && canDeleteLinkedProject && !hasExcise;

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
    return null;
  };
  const headerRight = (
    <>
      {deal?.projectId ? (
        <Link href={`/sa/projects/${deal.projectId}`} className="btn btn-primary">
          <FolderKanban size={15} aria-hidden="true" /> ไปโครงการ
        </Link>
      ) : canEdit ? (
        <button type="button" className="btn btn-primary" onClick={openLinkProject} disabled={!!actionBusy} title="แนะนำให้เชื่อมโครงการก่อนออกใบเสนอราคา">
          <FolderKanban size={15} aria-hidden="true" /> เชื่อมโครงการ
        </button>
      ) : null}
      {canEdit && lc?.canNoGo && (
        <button type="button" className="btn ghost" onClick={() => setLostOpen(true)} disabled={!!actionBusy}>
          <Ban size={15} aria-hidden="true" /> ไม่ไปต่อ
        </button>
      )}
    </>
  );

  // ปุ่มแก้ไข/ลบ — ไอคอนล้วน วางแถวเดียวกับปุ่มย้อนกลับ (R2)
  const backActions = canEdit ? (
    <>
      <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={openEditDeal} disabled={!!actionBusy} aria-label="แก้ไขดีล" title="แก้ไข">
        <Pencil size={16} aria-hidden="true" />
      </button>
      {canDelete && (
        <button type="button" className="btn-icon danger" onClick={deleteDeal} disabled={!!actionBusy} aria-label="ลบดีล" title="ลบดีล (ลบโครงการ PM พ่วงด้วย)">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
    </>
  ) : null;

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title={deal?.title || "ศูนย์รวมดีล"}
      subtitle={deal ? `${deal.customerName || deal.customer?.name || "ไม่มีลูกค้า"} · ${deal.forecastMonth || "ไม่มีเดือนพยากรณ์"}` : "ศูนย์รวมดีล"}
      back={{ href: "/sa/deals", label: "กลับหน้าดีล" }}
      backActions={backActions}
      headerRight={headerRight}
      hideHeader
      loading={loading}
    >
      {error && (
        <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {deal && (
        <div className="flex flex-col gap-5">
          {/* Header เดียว: ชื่อดีล ข้อมูลหลัก สถานะ และลำดับขั้นตอน */}
          <SalesDetailOverview
            eyebrow="รายละเอียดดีล"
            title={deal.title}
            description={<>
              {deal.code && <span className="mono" style={{ fontWeight: 700, color: "var(--text)" }}>{entityCodeDisplay(deal.code, 0)}</span>}
              <span>ลูกค้า: {deal.customerName || deal.customer?.name || "ไม่ผูกลูกค้า"}</span>
              {(dealBrand.en || dealBrand.th) && <span>แบรนด์: {dealBrand.en || dealBrand.th}{dealBrand.en && dealBrand.th ? ` · ${dealBrand.th}` : ""}</span>}
            </>}
            badges={<SalesStateBadge label={STAGE_LABELS[deal.stage] || deal.stage} color={deal.stage === "lost" ? "var(--red)" : alreadyWon ? "var(--green)" : "var(--accent)"} />}
            actions={headerRight}
            facts={[
              { icon: FolderKanban, label: "ผู้รับผิดชอบ", value: deal.ownerName || "-" },
              { icon: ClipboardList, label: "ทีม", value: deal.team || "-" },
              { icon: Circle, label: "เดือน Forecast", value: deal.forecastMonth || "-" },
              { icon: Trophy, label: "ประเภท / โอกาส", value: `${dealTypeOf(deal)}${!alreadyWon && deal.stage !== "lost" ? ` · FC ${snapForecastLevel(deal.probability)}%` : ""}` },
            ]}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lc && <DealStepper steps={lc.steps} lost={deal.stage === "lost"} />}
            {lc?.nextAction && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>ขั้นต่อไป</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{lc.nextAction.label}</div>
                  {lc.nextAction.hint && <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>{lc.nextAction.hint}</div>}
                </div>
                {nextPrimary()}
              </div>
            )}
            {/* route actions (ทะเบียนสรรพสามิต/PO สหมิตร/ส่งของ) — ย้ายจากแถบเมนูที่ถูกตัดออก */}
            {(lc?.routes || []).length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                {lc.routes.map((route) => (
                  <RouteMenuButton key={route.kind} route={route} onAction={onRouteAction} busy={!!actionBusy} canEdit={canEdit} />
                ))}
              </div>
            )}
            </div>
          </SalesDetailOverview>

          {/* เมนูครอบ (แบบหน้าโครงการ): แท็บ ภาพรวม ↔ ไทม์ไลน์ — ตัดแถบทางลัด/ป้ายเฟสถัดไปออก (มติผู้ใช้) */}
          <SalesDetailTabs value={tab} onChange={switchTab} label="ส่วนของดีล" />

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

          {tab === "overview" && (
          <>
          <section id="deal-kpi" className="kpi-grid">
            {alreadyWon ? (
              <Stat
                label="มูลค่าปิดจริง (Won)"
                value={money(deal.wonValue ?? deal.projectValue)}
                hint={Number(deal.projectValue) !== Number(deal.wonValue ?? deal.projectValue)
                  ? `คาดการณ์ ${money(deal.projectValue)} · ต่าง ${money(Number(deal.projectValue) - Number(deal.wonValue ?? deal.projectValue))}`
                  : `ตรงกับคาดการณ์`}
              />
            ) : (
              <Stat label="มูลค่าคาดการณ์" value={money(deal.projectValue)} hint={deal.forecastMonth ? `เดือนพยากรณ์ ${deal.forecastMonth}` : "ไม่มีเดือนพยากรณ์"} />
            )}
            <Stat
              label="คาดปิด"
              value={deal.expectedCloseDate || "-"}
              hint={daysToClose == null ? "ยังไม่กำหนด" : daysToClose >= 0 ? `อีก ${daysToClose} วัน` : `เลยกำหนด ${Math.abs(daysToClose)} วัน`}
            />
            <Stat
              label="อยู่ในสถานะนี้"
              value={daysInStage == null ? "-" : `${daysInStage} วัน`}
              hint={dealAgeDays == null ? "-" : `อายุดีลรวม ${dealAgeDays} วัน`}
            />
            <Stat
              label="ไทม์ไลน์คืบหน้า"
              value={taskSummary.total ? `${taskSummary.done}/${taskSummary.total}` : "-"}
              hint={!taskSummary.total ? "ยังไม่ได้สร้างไทม์ไลน์" : taskSummary.current ? `กำลังทำ: ${taskSummary.current.name}` : taskSummary.done === taskSummary.total ? "ครบทุกขั้นตอน" : !deal.projectId ? "ไทม์ไลน์ของดีล (ยังไม่ผูกโครงการ)" : "-"}
            />
            {SALES_FEATURES.quotations && (
              <Stat label="ใบเสนอราคา Won" value={acceptedQuote ? money(Number(acceptedQuote.totalAmount || 0) - Number(acceptedQuote.vatAmount || 0)) : "-"} hint={acceptedQuote?.quoteNumber || "ยังไม่มีใบเสนอราคา Won"} />
            )}
            {SALES_FEATURES.documents && (
              <Stat label="เอกสารค้าง" value={pendingDocs.length} hint={`${data.documents?.length || 0} รายการ`} />
            )}
          </section>

          </>
          )}

          {(tab === "tasks" || tab === "overview") && (
          <section id="deal-tasks" className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>งานของดีล</h2>
              <span className="ui-badge" style={{ color: "var(--text-2)" }}>{dealTaskSummary.done}/{dealTaskSummary.total} เสร็จ</span>
              <div className="spacer" />
              <a className="btn ghost" href={`/sa/tasks?dealId=${deal.id}`}><ExternalLink size={14} aria-hidden="true" /> เปิด</a>
            </div>
            {(data.dealTasks || []).length ? (
              <div className="premium-glass-table table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>งาน</th>
                      <th>สถานะ</th>
                      <th>ผู้รับผิดชอบ</th>
                      <th>กำหนดเสร็จ</th>
                      <th>หมวด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dealTasks.map((task) => (
                      <tr key={task.id} className="premium-row">
                        <td style={{ fontWeight: 700 }}>
                          {task.title}
                          {task.note && <div style={{ marginTop: 2, color: "var(--text-3)", fontSize: 12, fontWeight: 500 }}>{task.note}</div>}
                        </td>
                        <td><TaskStatusBadge status={task.status} /></td>
                        <td>{task.assigneeName || task.ownerName || "-"}</td>
                        <td>{task.dueDate ? fmtDate(task.dueDate) : <span style={{ color: "var(--text-3)" }}>-</span>}</td>
                        <td>{task.category || <span style={{ color: "var(--text-3)" }}>-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>ยังไม่มีงานของดีลนี้ กด “เปิด” แล้วสร้างงานโดยเลือกผูกกับดีลนี้ได้</Empty>
            )}
          </section>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 20,
            alignItems: "start",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* แท็บภาพรวม: การ์ดเมนูไทม์ไลน์ (กดเข้าแท็บไทม์ไลน์) — แบบเดียวกับหน้าโครงการ */}
          {tab === "overview" && (
            <div
              className="glass-panel"
              role="button"
              tabIndex={0}
              onClick={() => switchTab("timeline")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab("timeline"); } }}
              style={{ padding: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
              title="เปิดไทม์ไลน์ของดีล"
            >
              <span style={{ background: "var(--accent)", color: "#fff", padding: 8, borderRadius: 10, display: "flex", flexShrink: 0 }}>
                <PackageCheck size={18} aria-hidden="true" />
              </span>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>ไทม์ไลน์</div>
                <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
                  {!taskSummary.total ? "ยังไม่ได้สร้าง — กดเพื่อเริ่ม" : taskSummary.current ? `กำลังทำ: ${taskSummary.current.name}` : taskSummary.done === taskSummary.total ? "ครบทุกขั้นตอน" : deal.projectId ? `ในโครงการ ${data.project?.code || ""}` : "ไทม์ไลน์ของดีล (ยังไม่ผูกโครงการ)"}
                </div>
              </div>
              {taskSummary.total > 0 && (
                <div style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="progress" style={{ flex: 1 }} role="progressbar" aria-valuenow={taskSummary.done} aria-valuemax={taskSummary.total} aria-label="ความคืบหน้าไทม์ไลน์">
                    <span className={taskSummary.done === taskSummary.total ? "done" : undefined} style={{ width: `${Math.round((taskSummary.done / taskSummary.total) * 100)}%` }} />
                  </div>
                  <span className="mono tabular-nums" style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>{taskSummary.done}/{taskSummary.total}</span>
                </div>
              )}
              <span className="btn btn-primary" style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>เปิดไทม์ไลน์</span>
            </div>
          )}
          {tab === "timeline" && (
          <section id="deal-pm" className="glass-panel" style={{ padding: 16 }}>
            <div className="timeline-header-row mb-3">
              <PackageCheck size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ไทม์ไลน์</h2>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                {(data.projectTasks || []).length > 0 && (
                  <button type="button" className="btn ghost" onClick={printDealTimeline} title="เปิดเอกสาร A4 สำหรับพิมพ์ / บันทึก PDF (ไม่ออกเลข Rev / ไม่เก็บประวัติ)">
                    <Printer size={14} aria-hidden="true" /> พิมพ์เอกสาร
                  </button>
                )}
                {data.project && <a className="btn ghost" href={`/sa/projects/${data.project.id}`}><ExternalLink size={14} aria-hidden="true" /> เปิด</a>}
                {(data.projectTasks || []).length > 0 && <ViewSwitcher value={timelineView} onChange={setTimelineView} modes={["list", "table", "document"]} />}
              </div>
            </div>
            {data.project ? (
              <>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <Stat label="โครงการ" value={data.project.code || data.project.id} hint={data.project.status || "-"} />
                <Stat label="ความคืบหน้า (segment นี้)" value={taskSummary.total ? `${taskSummary.done}/${taskSummary.total} ขั้นตอน` : "-"} hint={taskSummary.current ? `กำลังทำ: ${taskSummary.current.name}` : "-"} />
                <Stat label="ประเภท" value={data.project.type || "-"} hint={data.project.dueDate ? `กำหนด ${data.project.dueDate}` : "ไม่มีกำหนด"} />
                <Stat label="รายการ FG" value={data.projectProducts?.length || 0} hint={(data.projectProducts || []).slice(0, 2).map((row) => row.product?.fgCode).filter(Boolean).join(", ") || "-"} />
                {SALES_FEATURES.shipment && (
                  <Stat label="เอกสารส่งของ" value={data.shipmentPrep ? data.shipmentPrep.status : "-"} hint={data.shipmentPrep ? `${data.shipmentPrep.lines?.length || 0} รายการ` : "ยังไม่สร้าง"} />
                )}
              </div>
              {/* DL2: ตารางขั้นตอน segment ของดีลนี้ (รวมงานกลางที่ไม่ผูกดีล) —
                  แก้สถานะจากหน้าดีลได้เลย ไม่ต้องเข้าโครงการ (PATCH ตัวเดียวกับฝั่ง PM) */}
              {(data.projectTasks || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <TimelineWorkspace
                    tasks={data.projectTasks}
                    canEdit={canEdit}
                    dealId={deal.id}
                    projectId={data.project?.id || null}
                    view={timelineView}
                    onViewChange={setTimelineView}
                    showHeading={false}
                    showViewSwitcher={false}
                    timelineContext={{
                      name: deal.title,
                      customerName: deal.customerName,
                      startDate: deal.startDate || data.project?.startDate,
                      brand: deal.brand,
                      status: data.project?.status || deal.stage,
                      statusLabel: STAGE_LABELS[deal.stage] || deal.stage,
                    }}
                    onChanged={load}
                    onError={setError}
                  />
                </div>
              )}
              {/* เฟส B: ดีลอื่นในโครงการเดียวกัน (SCENT→NPD→RE-ORDER…) — ลิงก์ข้าม */}
              {(data.siblingDeals || []).length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginBottom: 6 }}>ดีลอื่นในโครงการนี้</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {data.siblingDeals.map((sib) => (
                      <Link key={sib.id} href={`/sa/deals/${sib.id}`} className="btn ghost sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {dealTypeBadge(dealTypeOf(sib))}
                        <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sib.title}</span>
                        {stageBadge(sib.stage)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              </>
            ) : (data.projectTasks || []).length ? (
              <>
                {/* DL1: ไทม์ไลน์ของดีลเอง (ยังไม่ผูกโครงการ) — task ลอย projectId ว่าง
                    ผูกโครงการเมื่อไหร่ ชุดนี้ถูก "รับเลี้ยง" เข้าโครงการทั้งชุด ไม่ gen ใหม่ */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <span className="ui-badge" style={{ color: "var(--accent)" }}>ไทม์ไลน์ของดีล (ยังไม่ผูกโครงการ)</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                    {taskSummary.done}/{taskSummary.total} ขั้นตอน{deal.categoryCode ? ` · หมวด ${deal.categoryCode}` : ""}
                  </span>
                  <div className="spacer" />
                  {canEdit && (
                    <button type="button" className="btn-icon danger" title="ลบไทม์ไลน์ (ไว้สร้างใหม่)" aria-label="ลบไทม์ไลน์"
                      disabled={!!actionBusy} onClick={dropOwnTimeline}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <TimelineWorkspace
                  tasks={data.projectTasks}
                  canEdit={canEdit}
                  dealId={deal.id}
                  projectId={data.project?.id || null}
                  view={timelineView}
                  onViewChange={setTimelineView}
                  showHeading={false}
                  showViewSwitcher={false}
                  timelineContext={{
                    name: deal.title,
                    customerName: deal.customerName,
                    startDate: deal.startDate,
                    brand: deal.brand,
                    status: deal.stage,
                    statusLabel: STAGE_LABELS[deal.stage] || deal.stage,
                  }}
                  onChanged={load}
                  onError={setError}
                />
                {canEdit && deal?.stage !== "lost" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-primary" onClick={openCreatePM} disabled={!!actionBusy} title="สร้างโครงการ — ไทม์ไลน์ชุดนี้จะย้ายเข้าโครงการทั้งชุด">
                      <Plus size={14} aria-hidden="true" /> สร้างโครงการใหม่
                    </button>
                    <button type="button" className="btn ghost" onClick={openLinkProject} disabled={!!actionBusy || !deal?.customerId} title={deal?.customerId ? "ผูกดีลเข้าโครงการที่มีอยู่ — ไทม์ไลน์ชุดนี้ย้ายตามไป" : "ต้องผูกลูกค้าก่อน"}>
                      <PackageCheck size={14} aria-hidden="true" /> ผูกกับโครงการเดิม
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Empty>
                <div style={{ marginBottom: 12 }}>ยังไม่ได้สร้างไทม์ไลน์</div>
                {canEdit && deal?.stage !== "lost" && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    {/* DL1: ไทม์ไลน์ของดีลเอง — สร้างได้ตั้งแต่ยังไม่มีโครงการ (template ตามประเภท+หมวด) */}
                    <button type="button" className="btn btn-primary" onClick={genOwnTimeline} disabled={!!actionBusy}
                      title={`สร้างจาก template ${dealTypeOf(deal)}${deal.categoryCode ? ` หมวด ${deal.categoryCode}` : " (ยังไม่ระบุหมวด — แก้ที่ปุ่มแก้ไขดีล)"}`}>
                      <Plus size={14} aria-hidden="true" /> สร้างไทม์ไลน์ของดีล
                    </button>
                    {['timeline_proposed', 'awaiting_confirm', 'deposit_pending', 'won', 'in_project'].includes(deal?.stage) && (
                      <>
                        <button type="button" className="btn ghost" onClick={openCreatePM} disabled={!!actionBusy}>
                          <Plus size={14} aria-hidden="true" /> สร้างโครงการใหม่
                        </button>
                        {/* เฟส B: ผูกเข้าโครงการเดิมของลูกค้า (ต่อ segment ตามประเภทดีล) */}
                        <button type="button" className="btn ghost" onClick={openLinkProject} disabled={!!actionBusy} title="ผูกดีลเข้าโครงการที่มีอยู่">
                          <PackageCheck size={14} aria-hidden="true" /> ผูกกับโครงการเดิม
                        </button>
                      </>
                    )}
                  </div>
                )}
              </Empty>
            )}
          </section>
          )}

          {(tab === "quotations" || tab === "overview") && (SALES_FEATURES.quotations || SALES_FEATURES.documents) && (
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {SALES_FEATURES.quotations && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ใบเสนอราคา</h2>
                <div className="spacer" />
                {canEdit && deal.projectId && deal.customerId && !["lost"].includes(deal.stage) && (
                  <Link href={`/sa/quotations/new?dealId=${deal.id}`} className="btn btn-primary sm"><Plus size={13} aria-hidden="true" /> สร้างใบเสนอราคา</Link>
                )}
                <Link href="/sa/quotations" className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> เมนูใบเสนอราคา</Link>
              </div>
              {(data.quotations || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr><th>เลขที่</th><th>สถานะ</th><th className="num">ยอดรวม</th></tr>
                    </thead>
                    <tbody>
                      {data.quotations.map((quote) => (
                        <tr key={quote.id} className="premium-row">
                          <td className="mono"><Link href={`/sa/quotations/${quote.id}`} className="linklike">{quote.quoteNumber}</Link></td>
                          <td>{stageBadge(quote.status)}</td>
                          <td className="num mono">{money(quote.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>ยังไม่มีใบเสนอราคา — สร้างได้จากเมนู <Link href="/sa/quotations" className="linklike">ใบเสนอราคา</Link></Empty>}
            </section>
            )}

            {tab === "quotations" && SALES_FEATURES.documents && (
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

            </div>
            {(tab === "activities" || tab === "overview") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* ไทม์ไลน์รวม: อัปเดตงาน + การเปลี่ยนสถานะ เรียงตามเวลาเดียวกัน — เห็นเรื่องราวของดีลในฟีดเดียว */}
          <section id="deal-timeline" className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ความเคลื่อนไหว</h2>
                <span className="ui-badge" style={{ marginLeft: "auto", color: "var(--text-3)" }}>{timeline.length} รายการ</span>
              </div>

              {canEdit && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Select className="premium-select" value={feedKind} onChange={(e) => setFeedKind(e.target.value)} style={{ width: 140 }} aria-label="ประเภทอัปเดต">
                      {Object.entries(ACTIVITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                    </Select>
                    {feedKind === "next_step" && (
                      <DateInput value={feedDue} onChange={setFeedDue} style={{ width: 180 }} ariaLabel="กำหนดวันขั้นถัดไป" />
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
                  {/* พรีวิวรูปที่เลือกไว้ (ยังไม่อัป) — กดกากบาทเอาออกได้ */}
                  {!!feedFiles.length && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {feedFiles.map((f, i) => (
                        <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                          <img src={f.url} alt={f.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button type="button" onClick={() => removeFeedFile(i)} aria-label="เอารูปออก"
                            style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.6)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", lineHeight: 0 }}>
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
                    <label className="btn ghost sm" style={{ cursor: "pointer" }} title="แนบรูปภาพ">
                      <Paperclip size={13} aria-hidden="true" /> แนบรูป
                      <input type="file" accept={IMAGE_ACCEPT_ATTR} multiple onChange={onPickFiles} style={{ display: "none" }} />
                    </label>
                    <button type="button" className="btn btn-primary sm" onClick={postActivity} disabled={feedBusy || (!feedBody.trim() && !feedFiles.length)}>
                      <Send size={13} aria-hidden="true" /> {feedBusy ? "กำลังโพสต์..." : "โพสต์"}
                    </button>
                  </div>
                </div>
              )}

              {timeline.length ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {timeline.map((item) => {
                    if (item.type === "stage") {
                      const row = item.stage;
                      return (
                        <li key={`st-${row.id}`} style={{ borderLeft: "3px solid var(--border)", paddingLeft: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span className="ui-badge" style={{ color: "var(--text-3)" }}>สถานะ</span>
                            <span style={{ fontSize: 13.5 }}>
                              {STAGE_LABELS[row.fromStage] || row.fromStage || "เริ่ม"} → <strong>{STAGE_LABELS[row.toStage] || row.toStage}</strong>
                            </span>
                          </div>
                          <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{row.changedByName || "-"} · {row.changedAt ? fmtDateTime(row.changedAt) : "-"}</div>
                        </li>
                      );
                    }
                    const act = item.act;
                    const meta = ACTIVITY_META[act.kind] || ACTIVITY_META.note;
                    if (editActId === act.id) {
                      return (
                        <li key={act.id} style={{ borderLeft: `3px solid ${meta.color}`, paddingLeft: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Select className="premium-select" value={editKind} onChange={(e) => setEditKind(e.target.value)} style={{ width: 140 }} aria-label="ประเภทอัปเดต">
                              {Object.entries(ACTIVITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                            </Select>
                            {editKind === "next_step" && (
                              <DateInput value={editDue} onChange={setEditDue} style={{ width: 180 }} ariaLabel="กำหนดวัน" />
                            )}
                          </div>
                          <textarea className="premium-input" rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} style={{ resize: "vertical" }} />
                          <div className="form-action-inline">
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
                              <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={() => startEditActivity(act)} aria-label="แก้ไขอัปเดต" disabled={feedBusy}><Pencil size={14} aria-hidden="true" /></button>
                              <button type="button" className="btn-icon danger" onClick={() => deleteActivity(act)} aria-label="ลบอัปเดต" disabled={feedBusy}><Trash2 size={14} aria-hidden="true" /></button>
                            </span>
                          )}
                        </div>
                        {act.body && <div style={{ margin: "4px 0 2px", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{act.body}</div>}
                        {!!act.attachments?.length && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 2px" }}>
                            {act.attachments.map((att, i) => {
                              const src = `/api/sales-planning/activities/${act.id}/file?i=${i}`;
                              return (
                                <button key={i} type="button" onClick={() => setLightbox({ src, name: att.fileName })}
                                  title={att.fileName || "ดูรูป"}
                                  style={{ width: 88, height: 88, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", padding: 0, cursor: "pointer", background: "var(--bg)" }}>
                                  <img src={src} alt={att.fileName || "รูปแนบ"} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ color: "var(--text-3)", fontSize: 12 }}>{act.createdByName || "-"} · {act.createdAt ? fmtDateTime(act.createdAt) : "-"}</div>
                      </li>
                    );
                  })}
                </ul>
              ) : <Empty>ยังไม่มีความเคลื่อนไหว{canEdit ? " — เริ่มโพสต์อัปเดตได้เลย" : ""}</Empty>}
          </section>
            </div>
            )}
          </div>
        </div>
      )}

      {/* เฟส B: โมดัลผูกดีลเข้าโครงการเดิมของลูกค้า — เลือกโครงการ + วันเริ่ม segment */}
      <Modal open={linkOpen} onClose={() => !actionBusy && setLinkOpen(false)} title="ผูกกับโครงการเดิม" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            ดีลนี้จะถูกผูกเข้าโครงการที่เลือก และต่อขั้นตอนตาม template ประเภท <strong>{DEAL_TYPE_LABELS[dealTypeOf(deal)]}</strong> เป็นช่วงใหม่ท้ายไทม์ไลน์
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            โครงการของ {deal?.customerName || deal?.customer?.name || "ลูกค้า"}
            <Select className="premium-select" value={linkProjectId} onChange={(e) => setLinkProjectId(e.target.value)} disabled={linkLoading}>
              <option value="">{linkLoading ? "กำลังโหลด…" : linkProjects.length ? "— เลือกโครงการ —" : "ลูกค้ารายนี้ยังไม่มีโครงการ"}</option>
              {linkProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.code || p.id} · {p.name}{p.type ? ` (${p.type})` : ""}</option>
              ))}
            </Select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            วันเริ่มงานช่วงนี้
            <DateInput value={linkStartDate} onChange={setLinkStartDate} />
          </label>
          <div className="form-action-bar">
            <button type="button" className="btn ghost" onClick={() => setLinkOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={submitLinkProject} disabled={!!actionBusy || !linkProjectId}>
              {actionBusy === "link-project" ? "กำลังผูก…" : "ผูกเข้าโครงการ"}
            </button>
          </div>
        </div>
      </Modal>

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
          <div className="form-action-bar">
            <button type="button" className="btn ghost" onClick={() => setLostOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={doLost} disabled={!!actionBusy}>
              <Ban size={14} aria-hidden="true" /> {actionBusy === "lost" ? "กำลังบันทึก..." : "ยืนยัน Lost"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={dealModalOpen} onClose={() => setDealModalOpen(false)} title="แก้ไขดีล" size="lg">
        {dealForm && (
          <form onSubmit={saveDeal} className="form-grid cols-2" aria-busy={savingDeal} style={{ padding: 18 }}>
            <DealFormFields
              form={dealForm}
              onPatch={(patch) => setDealForm((f) => ({ ...f, ...patch }))}
              customers={customers}
              projects={projects}
              showProject
              categories={categories}
              stages={PIPELINE_STAGES.filter((st) => st !== "won" || alreadyWon)}
              alreadyWon={alreadyWon}
              onCustomersUpdated={(uc) => setCustomers((prev) => prev.map((c) => (c.id === uc.id ? uc : c)))}
              extra={(
                <>
                  <label className="form-inline-check" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={dealForm.depositPaid} onChange={(e) => setDealForm({ ...dealForm, depositPaid: e.target.checked })} />
                    ได้รับมัดจำแล้ว
                  </label>
                </>
              )}
            />
            <div className="form-action-bar">
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
        createLabel="จัดการโครงการ"
      />

      {/* Lightbox พรีวิวรูปเต็มจอ — คลิกที่ใดก็ปิด */}
      {lightbox && (
        <div
          role="dialog"
          aria-label={lightbox.name || "พรีวิวรูป"}
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}
        >
          <button type="button" onClick={() => setLightbox(null)} aria-label="ปิด"
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", color: "#fff", border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <X size={20} aria-hidden="true" />
          </button>
          <img src={lightbox.src} alt={lightbox.name || "รูปแนบ"} onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, cursor: "default" }} />
        </div>
      )}
    </Workspace>
  );
}
