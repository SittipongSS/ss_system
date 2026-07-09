"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Circle, ClipboardList, ExternalLink, FileText, FolderKanban, Lock, MessageSquare, PackageCheck, Paperclip, Pencil, Plus, Save, Send, Trash2, Trophy, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { DEAL_STAGES, SALES_FEATURES, STAGE_LABELS } from "@/lib/salesPlanning";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { dealLifecycle } from "@/lib/salesPlanningLifecycle";
import { useRole, useTeam } from "@/lib/roleContext";
import { canDeleteRecord } from "@/lib/permissions";
import { FORECAST_LEVELS, forecastBadge, snapForecastLevel } from "@/components/salesPlanning/ui";
import { brandThList } from "@/lib/master/brands";
import { IMAGE_ACCEPT_ATTR, MAX_UPLOAD_MB, MAX_UPLOAD_BYTES } from "@/lib/master/attachmentTypes";

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

// แถบ lifecycle: ลีด → … → เข้าโครงการ (lost = แถบแดงแทน) — ฝังใน hero สถานะ
function DealStepper({ steps, lost }) {
  if (lost) {
    return (
      <div style={{ color: "var(--red)", display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600 }}>
        <Ban size={16} aria-hidden="true" /> โครงการนี้ปิดแบบไม่สำเร็จ (Lost)
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
          {route.actionKind?.startsWith("create-") ? <Plus size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />} {route.actionLabel}
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

  // ไทม์ไลน์รวม: อัปเดตงาน (activities) + การเปลี่ยนสถานะ (stageHistory) เรียงเวลาล่าสุดก่อน
  const timeline = useMemo(() => {
    const acts = (data?.activities || []).map((a) => ({ type: "activity", at: a.createdAt, act: a }));
    const stages = (data?.stageHistory || []).map((s) => ({ type: "stage", at: s.changedAt, stage: s }));
    return [...acts, ...stages].sort((x, y) => String(y.at || "").localeCompare(String(x.at || "")));
  }, [data]);

  // สรุปความคืบหน้างานผลิต (จาก project_tasks ของโครงการ PM ที่ผูก)
  const taskSummary = useMemo(() => {
    const tasks = data?.projectTasks || [];
    const done = tasks.filter((t) => t.status === "Completed").length;
    const current = tasks.find((t) => t.status === "In Progress");
    return { total: tasks.length, done, current };
  }, [data]);

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

  // ปิด Won ต้องกรอกมูลค่าปิดจริง — เปิดโมดัลรับตัวเลข (prefill = มูลค่าคาดการณ์)
  const [winOpen, setWinOpen] = useState(false);
  const [winValue, setWinValue] = useState("");
  const doWin = () => { setWinValue(deal?.projectValue ?? ""); setWinOpen(true); };
  const submitWin = async () => {
    const v = Number(winValue);
    if (!Number.isFinite(v) || v <= 0) { setError("ต้องระบุมูลค่าปิดจริง (Won) มากกว่า 0"); return; }
    const okDone = await runAction("win", `/api/sales-planning/deals/${id}/win`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wonValue: v }),
    });
    if (okDone) setWinOpen(false);
  };

  // สร้างโครงการ PM ผ่านโมดัล (เหมือนหน้า PM) พร้อมเติมค่าแนะนำจากดีล
  const openCreatePM = () => {
    if (!deal) return;
    setPmInitial({
      name: deal.title || "",
      customerId: deal.customerId || "",
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: deal.expectedCloseDate || "",
      type: deal.metadata?.projectType === "RE-ORDER" ? "RE-ORDER" : "NPD",
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
      projectType: deal.metadata?.projectType === "RE-ORDER" ? "RE-ORDER" : "NPD",
      brand: deal.metadata?.brand || "",
      projectValue: deal.projectValue ?? "",
      wonValue: deal.wonValue ?? "",
      probability: snapForecastLevel(deal.probability),
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
      // อย่าให้ชื่อลูกค้าหายเมื่อ dropdown โหลดไม่ครบ/ลูกค้า pending ถูกซ่อน — fallback
      // ไปชื่อเดิมของดีลก่อน null (เหมือน logic ในหน้า list)
      const customerName = selected?.name || deal?.customerName || deal?.customer?.name || null;
      const res = await fetch(`/api/sales-planning/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dealForm, customerName }),
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
    // ระบุให้ชัดว่าจะลบอะไรพ่วงไปบ้าง (Sales เป็นแม่ — ลบทั้งสาย)
    const extras = [];
    if (data?.project) extras.push(`งานผลิต PM ${data.project.code || ""}`.trim());
    if (data?.projectTasks?.length) extras.push(`${data.projectTasks.length} ขั้นตอน`);
    if (data?.shipmentPrep) extras.push("เอกสารเตรียมส่งของ");
    const extraText = extras.length ? `\n\nจะลบพ่วงด้วย: ${extras.join(" · ")}` : "";
    if (!window.confirm(`ลบโครงการ "${deal.title}"?${extraText}\n\nการลบนี้ย้อนกลับไม่ได้`)) return;
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
  const canDelete = deal && !["won", "in_project"].includes(deal.stage) && !deal.metadata?.sahamitPoId
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
    if (!canEdit || !lc?.nextAction) return null;
    const k = lc.nextAction.kind;
    if (k === "win") return <button type="button" className="btn btn-primary" onClick={doWin} disabled={!!actionBusy}><Trophy size={14} aria-hidden="true" /> ปิดได้ (Won)</button>;
    if (k === "create_project") return <button type="button" className="btn btn-primary" onClick={openCreatePM} disabled={!!actionBusy}><Plus size={14} aria-hidden="true" /> สร้างไทม์ไลน์</button>;
    if (k === "open_project" && deal.projectId) return <a className="btn btn-primary" href={`/sa/projects/${deal.projectId}`}><ExternalLink size={14} aria-hidden="true" /> จัดการไทม์ไลน์</a>;
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
      {/* มีไทม์ไลน์ PM แล้ว → "จัดการ"; ยังไม่มี → "+ สร้าง" (ให้ต่างจากปุ่มจัดการชัดเจน) */}
      {deal?.projectId ? (
        <a className="btn" href={`/sa/projects/${deal.projectId}`}>
          <PackageCheck size={15} aria-hidden="true" /> จัดการไทม์ไลน์
        </a>
      ) : (canEdit && deal?.stage !== "lost") ? (
        <button type="button" className="btn" onClick={openCreatePM} disabled={!!actionBusy}>
          <Plus size={15} aria-hidden="true" /> สร้างไทม์ไลน์
        </button>
      ) : null}
    </>
  );

  // ปุ่มแก้ไข/ลบ — ไอคอนล้วน วางแถวเดียวกับปุ่มย้อนกลับ (R2)
  const backActions = canEdit ? (
    <>
      <button type="button" className="btn icon-only ghost" onClick={openEditDeal} disabled={!!actionBusy} aria-label="แก้ไขโครงการ" title="แก้ไข">
        <Pencil size={16} aria-hidden="true" />
      </button>
      {canDelete && (
        <button type="button" className="btn icon-only ghost" onClick={deleteDeal} disabled={!!actionBusy} aria-label="ลบโครงการ" title="ลบโครงการ (ลบงานผลิตพ่วงด้วย)">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
    </>
  ) : null;

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title={deal?.title || "ศูนย์รวมโครงการ"}
      subtitle={deal ? `${deal.customerName || deal.customer?.name || "ไม่มีลูกค้า"} · ${deal.forecastMonth || "ไม่มีเดือนพยากรณ์"}` : "ศูนย์รวมโครงการ"}
      back={{ href: "/sa", label: "กลับไปภาพรวม" }}
      backActions={backActions}
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
          {/* Hero สถานะ: สถานะปัจจุบัน + มัดจำ + ผู้ดูแล + stepper + ขั้นต่อไป ในผืนเดียว */}
          <section className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15 }}>{stageBadge(deal.stage)}</span>
              <span className="ui-badge" style={{ color: "var(--text-2)" }}>{deal.metadata?.projectType === "RE-ORDER" ? "RE-ORDER" : "NPD"}</span>
              {deal.metadata?.brand && <span className="ui-badge" style={{ color: "var(--text-2)" }}>แบรนด์ {deal.metadata.brand}</span>}
              {!alreadyWon && deal.stage !== "lost" && forecastBadge(deal.probability)}
              <span className="ui-badge" style={{ color: deal.depositPaid ? "var(--green)" : "var(--amber)" }}>
                {deal.depositPaid ? "ได้รับมัดจำแล้ว" : "ยังไม่ยืนยันมัดจำ"}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                ผู้ดูแล (AE): <strong>{deal.ownerName || "-"}</strong>{deal.team ? ` · ทีม ${deal.team}` : ""}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-3)", marginLeft: "auto" }}>
                ลูกค้า: {deal.customerName || deal.customer?.name || "ไม่ผูกลูกค้า"}
              </span>
            </div>
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
          </section>

          {/* เมนูลิงก์ไปแต่ละส่วนของหน้า + ป้ายเฟสถัดไปของส่วนที่ยังไม่เปิดใช้ */}
          <nav className="glass-panel toolbar" aria-label="ส่วนต่าง ๆ ของโครงการ" style={{ padding: "8px 12px" }}>
            <a className="btn ghost sm" href="#deal-kpi">ภาพรวม</a>
            <a className="btn ghost sm" href="#deal-pm">งานผลิต (PM)</a>
            <a className="btn ghost sm" href="#deal-routing">ส่งต่อ</a>
            <a className="btn ghost sm" href="#deal-timeline">ความเคลื่อนไหว</a>
            <span className="spacer" />
            {!SALES_FEATURES.quotations && <span className="ui-badge" style={{ color: "var(--text-3)" }} title="อยู่ในแผนเฟสถัดไป">ใบเสนอราคา · เฟสถัดไป</span>}
            {!SALES_FEATURES.shipment && <span className="ui-badge" style={{ color: "var(--text-3)" }} title="อยู่ในแผนเฟสถัดไป">การส่ง · เฟสถัดไป</span>}
          </nav>

          {!!data?.warnings?.length && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", color: "var(--amber)", borderColor: "var(--amber)" }}>
              {data.warnings.join(" · ")}
            </div>
          )}

          {data?.forecastDrift?.hasDrift && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", borderColor: "var(--amber)", borderLeft: "3px solid var(--amber)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--amber)", fontWeight: 700 }}>
                <AlertTriangle size={16} aria-hidden="true" />
                FC สหมิตรรอบล่าสุด (#{data.forecastDrift.latestRoundNo}) ต่างจากตอนสร้างโครงการ
              </div>
              <ul style={{ margin: "8px 0 4px", paddingLeft: 20, fontSize: 13 }}>
                {data.forecastDrift.items.map((it, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{driftText(it)}</li>
                ))}
              </ul>
              <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                คำแนะนำ: โครงการถูกล็อกตัวเลขไว้ตอน map — ปรับ “เดือนคาดได้รับ PO” / มูลค่าโครงการเองหากต้องการให้ตรงกับ FC ล่าสุด
              </div>
            </div>
          )}

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
              hint={dealAgeDays == null ? "-" : `อายุโครงการรวม ${dealAgeDays} วัน`}
            />
            <Stat
              label="งานผลิตคืบหน้า"
              value={deal.projectId && taskSummary.total ? `${taskSummary.done}/${taskSummary.total}` : "-"}
              hint={!deal.projectId ? "ยังไม่ผูกโครงการ PM" : taskSummary.current ? `กำลังทำ: ${taskSummary.current.name}` : taskSummary.total && taskSummary.done === taskSummary.total ? "ครบทุกขั้นตอน" : "-"}
            />
            {SALES_FEATURES.quotations && (
              <Stat label="ใบเสนอที่รับแล้ว" value={acceptedQuote ? money(acceptedQuote.totalAmount) : "-"} hint={acceptedQuote?.quoteNumber || "ยังไม่มีใบเสนอที่รับ"} />
            )}
            {SALES_FEATURES.documents && (
              <Stat label="เอกสารค้าง" value={pendingDocs.length} hint={`${data.documents?.length || 0} รายการ`} />
            )}
          </section>

          <section id="deal-pm" className="glass-panel" style={{ padding: 16 }}>
            <div className="flex items-center gap-2 mb-3">
              <PackageCheck size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>งานผลิต (PM)</h2>
              <div className="spacer" />
              {data.project && <a className="btn ghost" href={`/sa/projects/${data.project.id}`}><ExternalLink size={14} aria-hidden="true" /> เปิด</a>}
            </div>
            {data.project ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <Stat label="โครงการ" value={data.project.code || data.project.id} hint={data.project.status || "-"} />
                <Stat label="ความคืบหน้า" value={taskSummary.total ? `${taskSummary.done}/${taskSummary.total} ขั้นตอน` : "-"} hint={taskSummary.current ? `กำลังทำ: ${taskSummary.current.name}` : "-"} />
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
            <section id="deal-routing" className="glass-panel" style={{ padding: 16 }}>
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

          {/* ไทม์ไลน์รวม: อัปเดตงาน + การเปลี่ยนสถานะ เรียงตามเวลาเดียวกัน — เห็นเรื่องราวของโครงการในฟีดเดียว */}
          <section id="deal-timeline" className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ความเคลื่อนไหว</h2>
                <span className="ui-badge" style={{ marginLeft: "auto", color: "var(--text-3)" }}>{timeline.length} รายการ</span>
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

      <Modal open={winOpen} onClose={() => !actionBusy && setWinOpen(false)} title="ปิดการขาย (Won)" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            ยืนยันว่าได้รับมัดจำ/ยืนยันจากลูกค้าแล้ว — กรอก <strong>มูลค่าปิดจริง</strong> (ยอดขายที่จะนับเข้าเป้า)
          </div>
          <label style={{ fontSize: 13, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            มูลค่าปิดจริง (บาท)
            <input
              type="number" min="0" step="0.01" className="premium-input mono"
              value={winValue}
              onChange={(e) => setWinValue(e.target.value)}
              autoFocus
            />
          </label>
          {deal && Number(deal.projectValue) > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              มูลค่าคาดการณ์เดิม: {money(deal.projectValue)}
              {Number(winValue) > 0 && Number(winValue) !== Number(deal.projectValue) && (
                <span style={{ color: "var(--amber)" }}> · ต่างจากคาด {money(Number(deal.projectValue) - Number(winValue))}</span>
              )}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setWinOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={submitWin} disabled={!!actionBusy || !(Number(winValue) > 0)}>
              <Trophy size={14} aria-hidden="true" /> {actionBusy === "win" ? "กำลังบันทึก..." : "ยืนยัน Won"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={lostOpen} onClose={() => !actionBusy && setLostOpen(false)} title="ปิดโครงการแบบไม่สำเร็จ (Lost)" size="sm">
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
              ประเภทโครงการ
              <select className="premium-select" value={dealForm.projectType} onChange={(e) => setDealForm({ ...dealForm, projectType: e.target.value })}>
                <option value="NPD">NPD (สินค้าใหม่)</option>
                <option value="RE-ORDER">RE-ORDER (สั่งซ้ำ)</option>
              </select>
            </label>
            <label>
              แบรนด์
              <select className="premium-select" value={dealForm.brand} onChange={(e) => setDealForm({ ...dealForm, brand: e.target.value })} disabled={!dealForm.customerId}>
                <option value="">{dealForm.customerId ? "— ไม่ระบุแบรนด์ —" : "เลือกลูกค้าก่อน"}</option>
                {(() => {
                  const opts = brandThList((customers.find((c) => c.id === dealForm.customerId)?.brands) || []);
                  const withCur = dealForm.brand && !opts.includes(dealForm.brand) ? [dealForm.brand, ...opts] : opts;
                  return withCur.map((b) => <option key={b} value={b}>{b}</option>);
                })()}
              </select>
            </label>
            <label>
              สถานะ
              {/* ปิด Won ทำผ่านปุ่ม "ปิดได้ (Won)" เพื่อกรอกมูลค่าจริง — ไม่ให้เลือก won
                  จาก dropdown (กัน 400). แต่ถ้าดีลนี้ won อยู่แล้ว ให้คงตัวเลือกไว้เพื่อ revert ได้ */}
              <select className="premium-select" value={dealForm.stage} onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value })}>
                {PIPELINE_STAGES.filter((s) => s !== "won" || alreadyWon).map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
              </select>
            </label>
            <label>
              โอกาสที่จะปิดได้ (FC%)
              <select className="premium-select" value={snapForecastLevel(dealForm.probability)} disabled={alreadyWon} onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })}>
                {FORECAST_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
            <label>
              เดือนพยากรณ์
              <input type="month" className="premium-input" value={dealForm.forecastMonth} onChange={(e) => setDealForm({ ...dealForm, forecastMonth: e.target.value })} />
            </label>
            <label>
              มูลค่าคาดการณ์{alreadyWon ? " (ล็อกหลังปิด Won)" : ""}
              <input type="number" min="0" step="0.01" className="premium-input mono" value={dealForm.projectValue} disabled={alreadyWon} onChange={(e) => setDealForm({ ...dealForm, projectValue: e.target.value })} />
            </label>
            {alreadyWon && (
              <label>
                มูลค่าปิดจริง (Won)
                <input type="number" min="0" step="0.01" className="premium-input mono" value={dealForm.wonValue} onChange={(e) => setDealForm({ ...dealForm, wonValue: e.target.value })} />
              </label>
            )}
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
