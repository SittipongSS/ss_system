"use client";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, Building2, CheckCircle2, Circle, ClipboardList, ExternalLink, FileText, FolderKanban, MessageSquare, PackageCheck, Pencil, Plus, Printer, Save, Send, Trash2, Trophy } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ReadableText from "@/components/ui/ReadableText";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import { DEAL_STAGES, DEAL_TYPES, DEAL_TYPE_LABELS, SALES_FEATURES, STAGE_LABELS, dealTypeOf, isClosedStage, isWonStage, normalizeDealType, stageAtLeast } from "@/lib/salesPlanning";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import { cachedFetchJson } from "@/lib/apiCache";
import { dealLifecycle } from "@/lib/salesPlanningLifecycle";
import { canDeleteDeal, createDealLifecycle, DEAL_PATCH_TRANSITIONS } from "@/lib/sales/dealLifecycle";
import RecordControlCard from "@/components/ui/RecordControlCard";
import { useRole, useTeam } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { offerDeleteEmptyProject } from "@/lib/sales/emptyProjectCleanup";
import { FORECAST_LEVELS, dealTypeBadge, quoteStatusBadge, snapForecastLevel, DEAL_TYPE_COLORS } from "@/components/salesPlanning/ui";
import { brandThList, normalizeBrands } from "@/lib/master/brands";
import DealFormFields from "@/components/salesPlanning/DealFormFields";
import TimelineWorkspace from "@/components/pm/TimelineWorkspace";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { entityCodeDisplay } from "@/lib/entityCode";
import SalesDetailTabs from "@/components/salesPlanning/SalesDetailTabs";
import ExciseStatusBadge from "@/components/excise/StatusBadge";
import UiStatusBadge from "@/components/ui/StatusBadge";
import RequestListCard from "@/components/requests/RequestListCard";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { detailTabFromSearch } from "@/lib/salesDetailTabs";
import UpdateThread from "@/components/updates/UpdateThread";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { dealTimelineDocument } from "@/lib/sales/dealTimelineDocument";
import Textarea from "@/components/ui/Textarea";
import styles from "./page.module.css";

// ข้อความอธิบาย drift แต่ละรายการ (FC รอบล่าสุดต่างจากตอน map)
function driftText(it) {
  if (it.kind === "dropped") return `${it.fgCode}: ถูกตัดออกจาก FC ล่าสุด (เดิม ${it.month} · ${Number(it.fromQty || 0).toLocaleString("th-TH")})`;
  if (it.kind === "shifted") return `${it.fgCode}: เลื่อนเดือน ${it.month} → ${(it.toMonths || []).join(", ")}`;
  if (it.kind === "qtyChanged") return `${it.fgCode} (${it.month}): จำนวน ${Number(it.fromQty || 0).toLocaleString("th-TH")} → ${Number(it.toQty || 0).toLocaleString("th-TH")}`;
  return `${it.fgCode}: มีการเปลี่ยนแปลง`;
}

const money = (value) => fmtMoney(value);

/* เนื้อความย่อของรายการที่ยืมมาแสดงในเธรด — ยาวกว่านี้แล้วเส้นเรื่องจะถูกกลบด้วย
   เนื้อหาของเรื่องอื่น · จบด้วย … เพื่อบอกว่ายังมีต่อที่ต้นทาง (กดลิงก์ไปอ่านได้) */
const clipText = (value, max = 160) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
};

// สถานะที่เลือกได้ (won = ปิดสุดท้าย; ไม่มี in_project ให้เลือก แต่ STAGE_LABELS ยังรองรับข้อมูลเก่า)
const PIPELINE_STAGES = DEAL_STAGES.filter((s) => s !== "in_project");

// ป้ายประเภทอัปเดตย้ายไปทะเบียนกลางแล้ว (UPDATE_KINDS.deal ใน lib/master/updateTypes)
// — ค่าเดิมยกไปทั้งชุด ป้าย/สีเหมือนเดิมทุกตัว

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
      <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)", fontWeight: "var(--fw-semibold)" }}>{label}</div>
      <div className="mono tabular-nums" style={{ marginTop: 8, fontSize: "var(--fs-12)", fontWeight: "var(--fw-bold)" }}>{value}</div>
      {hint && <div style={{ marginTop: 4, color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{hint}</div>}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: 18, color: "var(--text-3)", fontSize: "var(--fs-7)" }}>{children}</div>;
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
      <div style={{ color: "var(--red)", display: "flex", gap: 8, alignItems: "center", fontSize: "var(--fs-7)", fontWeight: "var(--fw-semibold)" }}>
        <Ban size={16} aria-hidden="true" /> ดีลนี้ปิดแบบไม่สำเร็จ (Lost)
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--fs-6)",
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
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
    cachedFetchJson("/api/products").then((d) => setAllProducts(d || [])).catch(() => {});
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((d) => setProjects(d || [])).catch(() => {});
  }, []);

  const acceptedQuote = useMemo(() => (data?.quotations || []).find((quote) => quote.status === "accepted"), [data]);
  const pendingDocs = useMemo(() => (data?.documents || []).filter((doc) => doc.status === "pending"), [data]);

  // เหตุการณ์อ่านอย่างเดียวที่ส่งเข้าเธรดกลางให้เรียงรวมกับข้อความคน (extraItems)
  //
  // "เก็บแยก โชว์รวม": ประวัติสถานะ (sales_deal_stage_history) กับเรื่องสอบถาม RD
  // (inquiries) **ไม่ย้ายตาราง** — ทั้งคู่มี schema เฉพาะโดเมนและมีคิว/KPI query ตรง
  // เหมือน lead_events · เธรดแค่ยืมมาแสดงในสายเดียว แล้วกดเข้าไปดูของจริงได้
  const extraItems = useMemo(() => {
    const stages = (data?.stageHistory || []).map((s) => ({
      id: `st-${s.id}`,
      at: s.changedAt,
      label: "สถานะ",
      color: "var(--text-3)",
      by: s.changedByName || null,
      body: `${STAGE_LABELS[s.fromStage] || s.fromStage || "เริ่ม"} → ${STAGE_LABELS[s.toStage] || s.toStage}`,
    }));
    // ⚠️ ทุกแถวต้องมี `body` — ป้ายกับลิงก์เปล่า ๆ บอกแค่ว่า "มีอะไรเกิดขึ้น" คนอ่าน
    // ต้องกดออกไปอีกหน้าทุกครั้งจึงจะรู้ว่าเกิดอะไร ทั้งที่ข้อความอยู่ในมือแล้ว
    const inqs = (data?.inquiries || []).flatMap((q) => {
      const href = `/requests/${q.id}`;
      const linkLabel = `${q.code ? `${q.code} · ` : ""}${q.title || "เรื่องสอบถาม"}`;
      const rows = [{
        id: `iq-${q.id}-created`, at: q.createdAt, label: q.urgent ? "สอบถาม RD (ด่วน)" : "คำร้อง",
        color: q.urgent ? "var(--red)" : "var(--violet)", href, linkLabel,
        // 🐞 เคยอ้าง `q.requesterName`/`q.assigneeName` ซึ่งไม่มีในตาราง (คอลัมน์จริง
        // คือ requestedByName / closedByName) → ชื่อคนในบรรทัดคำร้องว่างมาตลอด
        by: q.requestedByName || null,
        body: clipText([q.title, q.body || q.note].filter(Boolean).join(" — ")),
      }];
      if (q.answeredAt) {
        rows.push({
          id: `iq-${q.id}-answered`, at: q.answeredAt, label: "RD ตอบแล้ว",
          color: "var(--green)", href, linkLabel, by: null,
          // ⚠️ คำตอบอยู่ที่ระดับ **บรรทัด** (dept_request_items) ไม่ใช่ที่หัวคำร้อง
          // ดึงมาที่นี่ไม่ได้โดยไม่ยิงเพิ่ม — บรรทัดนี้จึงบอกได้แค่ว่าตอบแล้ว
          body: null,
        });
      }
      if (q.closedAt) {
        rows.push({
          id: `iq-${q.id}-closed`, at: q.closedAt, label: "ปิดเรื่องสอบถาม",
          color: "var(--text-3)", href, linkLabel, by: q.closedByName || null,
          body: null,
        });
      }
      return rows;
    });
    // ความคืบหน้าที่คนพิมพ์ไว้ในเธรดของงานที่ผูกดีล — ของจริงอยู่ที่งาน ที่นี่ยืมมา
    // แสดงในสายเดียว (server กรองงานที่ผู้อ่านไม่มีสิทธิ์เห็นออกไปแล้ว)
    const taskRows = (data?.taskUpdates || []).map((u) => ({
      id: `tu-${u.id}`,
      at: u.createdAt,
      label: "อัปเดตงาน",
      color: "var(--blue)",
      by: u.authorName || null,
      body: u.body,
      href: `/sa/tasks/${u.entityId}`,
      linkLabel: u.taskTitle || "งาน",
      // เข้ากลุ่มเดียวกับ "สร้างงาน/งานเสร็จ" ของงานใบเดียวกัน (เธรดอ่านคีย์นี้คู่กับ
      // meta.taskId ของเหตุการณ์ในเธรด) — ไม่งั้นงานใบเดียวกินหัวเรื่องหลายอัน
      threadKey: `task:${u.entityId}`,
    }));
    return [...stages, ...inqs, ...taskRows];
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
    openGanttPrintWindow(dealDocumentProject);
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
  /* ชื่อเจ้าของดีลที่ควรขึ้นจอ — อ่านจาก `ownerId` เพราะ `deal.ownerName` เป็นสำเนา
     ณ ตอนบันทึก ที่ไม่ขยับตอนเจ้าตัวเปลี่ยนชื่อ
     ⚠️ ไม่แตะ `dealTimelineDocument` ด้านล่างโดยตั้งใจ — เอกสารที่พิมพ์ออกไปต้อง
     เป็น snapshot ตามกติกาเดิม (ดู [[entity-updates-plan]]) */
  const directory = usePeopleDirectory();
  const ownerName = livePersonName(directory, deal?.ownerId, deal?.ownerName);
  const dealDocumentProject = dealTimelineDocument(deal, data || {});
  const canEdit = !!data?.canEdit;
  const role = useRole();
  const alreadyWon = isWonStage(deal?.stage);
  // สายภาษีของแต่ละ SO — 3 กรณีที่ต้องอ่านออกจากตาเดียว:
  //   มีใบยื่นแล้ว → ป้ายสถานะ + ลิงก์ไปใบนั้น
  //   ยังไม่มีแต่อยู่ในคิวกลาง → "รอออกใบยื่น" (SO อนุมัติแล้วและมีสินค้าสรรพสามิตจริง)
  //   นอกนั้น → ว่าง = ไม่ต้องยื่น ห้ามทำให้ดูเหมือนงานค้าง
  const filingBySalesOrder = useMemo(
    () => new Map((data?.taxFilings || []).map((filing) => [filing.salesOrderId, filing])),
    [data?.taxFilings],
  );
  const awaitingFilingIds = useMemo(
    () => new Set(data?.awaitingFilingIds || []),
    [data?.awaitingFilingIds],
  );
  const filingOf = (salesOrderId) => {
    const filing = filingBySalesOrder.get(salesOrderId);
    if (filing) {
      return (
        <Link prefetch={false} href={`/tax/filings/${filing.id}`} className="linklike" title="เปิดใบยื่นชำระภาษี">
          <ExciseStatusBadge status={filing.status} />
        </Link>
      );
    }
    if (awaitingFilingIds.has(salesOrderId)) {
      return <UiStatusBadge label="รอออกใบยื่น" tone="warning" showIcon={false} />;
    }
    return <span className="muted">—</span>;
  };
  // หมวดสินค้า (ประกาศก่อน lc — useMemo ข้างล่างอ้างใน deps; ใช้ร่วมกับโมดัลแก้ดีล/สร้าง PM ด้วย)
  const [categories, setCategories] = useState([]);
  const lc = useMemo(
    () => (deal ? dealLifecycle(deal, {
      projectProducts: data?.projectProducts,
      exciseRegistrations: data?.exciseRegistrations,
      sahamitPo: data?.sahamitPo,
      shipmentPrep: data?.shipmentPrep,
      // หมวดสินค้า — ใช้ตัดสินการ์ดสรรพสามิตจาก flag isExcise (mig 0131)
      productTypes: categories,
    }) : null),
    [deal, data, categories],
  );

  /* กติกา "ดีลใบนี้ทำอะไรได้บ้าง" ฝั่ง Record Control — ไฟล์เดียวกับหน้ารายการ (PR #882)
     ⚠️ คนละตัวกับ `lc` (salesPlanningLifecycle) ที่ยังคุมแถบขั้นตอน/การ์ดปลายทาง
     (ทะเบียนสรรพสามิต · PO สหมิตร · ส่งของ) — สองตัวนี้ตอบคนละคำถาม ยังไม่ยุบรวม */
  const team = useTeam();
  /* dealLifecycle ตัดสินจาก `deal.canEdit` (API ส่งมาต่อใบ) + สิทธิ์ตาม role — ไม่ต้องใช้ id
     จึงไม่ต้องยิง /api/users/me เพิ่มที่หน้านี้ */
  const viewer = useMemo(() => ({ role, team }), [role, team]);
  const controlLc = useMemo(() => createDealLifecycle(), []);

  const [actionBusy, setActionBusy] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");

  // ฟีดความเคลื่อนไหวย้ายไปเธรดกลางแล้ว (mig 0169) — โพสต์/แก้/ลบ/แนบรูป/พรีวิวรูป
  // อยู่ใน UpdateThread ทั้งชุด หน้านี้เหลือหน้าที่แค่ส่งเหตุการณ์อ่านอย่างเดียว
  // (ประวัติสถานะ + เรื่องสอบถาม RD) เข้าไปเรียงรวมผ่าน extraItems

  // โมดัลแก้ดีล + สร้าง PM
  const [customers, setCustomers] = useState([]);
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
  // ยืนยันก่อนสร้าง: เปิดโมดัลให้เห็น+เลือกประเภท (template) ก่อน gen — กัน "ดึงผิดประเภท"
  // (เดิมยิงเลยด้วยประเภทที่ดีลเก็บ ซึ่งอาจ default NPD ค้างไว้). ส่ง type ไปให้ server
  // อัปเดต deal.dealType ให้ตรงด้วย.
  const [genOpen, setGenOpen] = useState(false);
  const [genType, setGenType] = useState("");
  const openGenTimeline = () => { setGenType(dealTypeOf(deal)); setGenOpen(true); };
  const genOwnTimeline = (type) => runAction("gen-timeline", `/api/sales-planning/deals/${id}/timeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(type ? { type } : {}),
  });
  const confirmGenTimeline = async () => {
    const done = await genOwnTimeline(genType);
    if (done) setGenOpen(false);
  };
  const dropOwnTimeline = async () => {
    if (!(await confirmAction("ลบไทม์ไลน์ของดีลนี้ทั้งชุด (ความคืบหน้าหายด้วย) แล้วค่อยสร้างใหม่?"))) return;
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
      // ซิงค์วันที่กับดีล: ใช้วันเริ่ม/สิ้นสุดของดีลเป็นค่าตั้งต้น (ไม่มีค่อยตกเป็นวันนี้)
      startDate: deal.startDate || new Date().toISOString().slice(0, 10),
      dueDate: deal.endDate || deal.expectedCloseDate || "",
      type: dealTypeOf(deal),
      // ชื่อ *ปัจจุบัน* + id — ส่งชื่อที่ค้างในแถวไปจะจับคู่บัญชีไม่ได้ แล้วโครงการ
      // ใหม่เกิดมาพร้อม `aeOwnerId` ว่าง (สาเหตุที่ prod มี 11/14 ใบเป็นแบบนั้น)
      aeOwner: ownerName,
      aeOwnerId: deal.ownerId || null,
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
      expectedCloseDate: deal.expectedCloseDate || "",
      startDate: deal.startDate || "",
      endDate: deal.endDate || "",
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
    // เฟส B: ลบดีล "ไม่ลบโครงการ PM" ที่ผูกอยู่ — โครงการมีได้หลายดีลและอาจมีดีลอื่น
    // มาผูกแทน; ลบดีลแค่ถอดไทม์ไลน์ segment ของดีลนี้ออก (เอกสารส่งของ/ทะเบียนผูกกับ
    // โครงการ จึงอยู่ต่อ) — ลบโครงการทำที่หน้าโครงการโดยตรง
    // นับเฉพาะงานของดีลนี้ — projectTasks รวมงานกลางโครงการ (dealId ว่าง) ที่ไม่ถูกลบ
    const ownTaskCount = (data?.projectTasks || []).filter((t) => t.dealId === deal.id).length;
    const detachText = data?.project
      ? `\n\nโครงการ (PM)${data.project.code ? ` ${data.project.code}` : ""} ที่ผูกอยู่จะยังอยู่ (ไม่ถูกลบ) — ถอดเฉพาะไทม์ไลน์ของดีลนี้ออก${ownTaskCount ? ` (${ownTaskCount} ขั้นตอน)` : ""}`
      : ownTaskCount ? `\n\nไทม์ไลน์ของดีลนี้ (${ownTaskCount} ขั้นตอน) จะถูกลบด้วย` : "";
    // งานที่ผูกดีลใบนี้จะถูกลบไปด้วย (ไม่งั้นค้างอยู่ในเมนูงานโดยชี้ดีลที่ไม่มีแล้ว) —
    // นับเฉพาะที่ผูก dealId ตรง ๆ · งานที่ผูกผ่านโครงการไม่ถูกแตะ
    const ownDealTasks = (data?.dealTasks || []).filter((t) => t.dealId === deal.id).length;
    const taskText = ownDealTasks ? `\n\nงานที่ผูกดีลนี้ (${ownDealTasks} งาน) จะถูกลบไปด้วย` : "";
    if (!(await confirmAction(`ลบดีล "${deal.title}"?${detachText}${taskText}\n\nการลบนี้ย้อนกลับไม่ได้`))) return;
    setError("");
    try {
      // admin: ถ้าถูกบล็อกด้วยกฎธุรกิจ จะได้พรีวิว + ถามยืนยันบังคับลบต่อ
      const result = await deleteWithForce(`/api/sales-planning/deals/${id}`, { isAdmin: role === "admin" });
      if (!result.ok) return;
      // ดีลใบสุดท้ายของโครงการ → ถามว่าจะลบโครงเปล่าทิ้งด้วยไหม (ไม่ตัดสินใจแทน)
      const cleanup = await offerDeleteEmptyProject(result.data?.emptyProject);
      // ลบโครงการพลาด = ดีลลบไปแล้ว แต่ยังต้องบอกให้รู้ จึงคาไว้ที่หน้านี้ ไม่เด้งออก
      if (cleanup.error) setError(`ลบดีลแล้ว แต่${cleanup.error}`);
      else router.push("/sa/deals");
    } catch (e) {
      setError(e.message || "ลบไม่สำเร็จ");
    }
  };
  // ลบไม่ได้ถ้า: ปิด Won/in_project (เว้น superuser) / มีใบเสนอราคา accepted (ยอด Actual —
  // ห้ามแม้ superuser) / มาจาก PO สหมิตร (นับยอดแล้ว) — ตรงกับที่ API DELETE จะปฏิเสธ
  // จึงไม่โชว์ปุ่มให้กดแล้วเจอ 409 (U3). เฟส B: ลบดีลไม่ลบโครงการที่ผูก — สิทธิ์ลบ project
  // และทะเบียนสรรพสามิตของโครงการจึงไม่เกี่ยวกับการลบดีลอีกต่อไป.
  //
  // เงื่อนไขจริงย้ายไป `canDeleteDeal()` ใน lib/sales/dealLifecycle.js แล้ว (PR #882)
  // — หน้ารายการกับหน้านี้เคยเขียนคนละชุด แล้วหน้ารายการลืมข้อ "ใบเสนอราคาที่รับแล้ว"
  const superuser = isSuperuser(role);

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

  /* หัวหน้าเหลือแค่ทางไปโครงการ — ปุ่มที่ *เปลี่ยนข้อมูล* ทั้งหมดย้ายไปการ์ด Control
     (มติผู้ใช้ 2026-08-01: การควบคุมคือการควบคุม ไม่ว่าจะเดินหน้าหรือจัดการตัวระเบียน) */
  const headerRight = deal?.projectId ? (
    <Link href={`/sa/projects/${deal.projectId}`} className="btn btn-secondary">
      <FolderKanban size={15} aria-hidden="true" /> ไปโครงการ
    </Link>
  ) : null;

  /* จุดเดียวที่ปุ่มบนการ์ดวิ่งเข้า — คืน false = ไม่สำเร็จ การ์ดจะค้างกล่องไว้พร้อมเหตุผล
     ที่พิมพ์ไปแล้ว ผู้ใช้ไม่ต้องพิมพ์ซ้ำ */
  async function runControlTransition(actionId, values) {
    if (!DEAL_PATCH_TRANSITIONS.includes(actionId)) return false;
    const okDone = await runAction("lost", `/api/sales-planning/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "lost", lostReason: values.reason?.trim() || null }),
    });
    return !!okDone;
  }

  /* ผูก/สร้างโครงการ = ต้องเลือกโครงการในฟอร์มของมันเอง ไม่ใช่ย้ายสถานะเฉย ๆ
     ดักก่อนการ์ดเปิดกล่องยืนยันเปล่า ๆ คั่นหนึ่งชั้น */
  function openProjectFlow(transition) {
    if (transition.id === "link_project") { openLinkProject(); return true; }
    if (transition.id === "create_project") { openCreatePM(); return true; }
    return false;
  }

  /* action ที่ไม่ใช่การย้ายสถานะ — lifecycle ไม่รู้จัก แต่เป็น "การควบคุม" เหมือนกัน */
  const recordActions = [
    {
      id: "edit", kind: "edit", slot: "secondary", label: "แก้ไขข้อมูลดีล", icon: Pencil,
      visible: canEdit, disabled: !!actionBusy, onClick: openEditDeal,
    },
    {
      id: "delete", kind: "delete", slot: "danger", label: "ลบดีลนี้", icon: Trash2,
      /* เงื่อนไขเดียวกับที่ API DELETE บังคับ — รวมข้อ "มีใบเสนอราคาที่รับแล้ว" ที่หน้า
         รายการเคยลืม (PR #882) · ส่ง acceptedQuotationId เข้าไปเพราะหน้านี้รู้จากตัวใบจริง */
      visible: !!deal && canDeleteDeal(
        { ...deal, acceptedQuotationId: acceptedQuote ? "yes" : null },
        { role, superuser },
      ),
      disabled: !!actionBusy,
      onClick: deleteDeal,
    },
  ];

  /* รายละเอียดดีล (`notes`) = บล็อกปักหมุดหัวเธรด ไม่ใช่การ์ดแยก (มติผู้ใช้ 2026-08-03:
     "แยกกันมันงง") · ก่อนหน้านี้ค่านี้ไม่เคยถูกแสดงที่ไหนเลย (#911)

     ⚠️ ปักหมุด **ไม่ใช่** ยัดเป็นเหตุการณ์ในเธรด — เธรดเก็บเหตุการณ์ที่เกิดแล้วซึ่ง
     ไม่เปลี่ยนอีก แต่ `notes` แก้ได้ตลอดผ่าน PATCH · บล็อกนี้อ่านจาก `deal.notes`
     สด ๆ ทุกครั้ง แก้ที่ฟอร์มแล้วเปลี่ยนตามทันที ไม่ค้างเป็นข้อความเวอร์ชันเก่า
     และไม่จมไปก้นเธรด (เธรดดีลเรียงใหม่ก่อน — ของที่ผูกเวลาสร้างดีลจะไปอยู่ล่างสุด)

     โชว์แม้ยังไม่ได้กรอก — คนอ่านต้องแยกออกระหว่าง "ดีลนี้ไม่มีรายละเอียด" กับ
     "มีแต่ระบบไม่โชว์" ซึ่งเป็นบั๊กที่เพิ่งแก้ไป */
  const dealNotesPinned = deal ? (
    <div className={styles.pinnedNotes}>
      <div className={styles.pinnedHead}>
        <FileText size={14} aria-hidden="true" />
        <strong>รายละเอียดดีล</strong>
        {canEdit && (
          <button type="button" className={styles.pinnedEdit} onClick={openEditDeal}>
            {deal.notes ? "แก้ไข" : "เพิ่มรายละเอียด"}
          </button>
        )}
      </div>
      <ReadableText
        text={deal.notes || ""}
        lines={5}
        empty={<span className="muted">ยังไม่ได้ระบุรายละเอียดตอนสร้างดีล</span>}
      />
    </div>
  ) : null;

  return (
    <Workspace
      icon={<FolderKanban size={22} />}
      title={deal?.title || "ศูนย์รวมดีล"}
      subtitle={deal ? `${deal.customerName || deal.customer?.name || "ไม่มีลูกค้า"} · ${deal.forecastMonth || "ไม่มีเดือนพยากรณ์"}` : "ศูนย์รวมดีล"}
      back={{ href: "/sa/deals", label: "กลับหน้าดีล" }}
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
              {deal.code && <span className="mono" style={{ fontWeight: "var(--fw-bold)", color: "var(--text)" }}>{entityCodeDisplay(deal.code, 0)}</span>}
              <span>ลูกค้า: {deal.customerName || deal.customer?.name || "ไม่ผูกลูกค้า"}</span>
              {(dealBrand.en || dealBrand.th) && <span>แบรนด์: {dealBrand.en || dealBrand.th}{dealBrand.en && dealBrand.th ? ` · ${dealBrand.th}` : ""}</span>}
            </>}
            badges={<>{dealTypeBadge(dealTypeOf(deal))}<SalesStateBadge label={STAGE_LABELS[deal.stage] || deal.stage} color={deal.stage === "lost" ? "var(--red)" : alreadyWon ? "var(--green)" : "var(--accent)"} /></>}
            actions={headerRight}
            facts={[
              { icon: FolderKanban, label: "ผู้ดูแล (AE)", value: ownerName || "-" },
              { icon: ClipboardList, label: "ทีม", value: deal.team || "-" },
              { icon: Circle, label: "เดือน Forecast", value: deal.forecastMonth || "-" },
              { icon: Trophy, label: "ประเภท / โอกาส", value: `${dealTypeOf(deal)}${!alreadyWon && deal.stage !== "lost" ? ` · FC ${snapForecastLevel(deal.probability)}%` : ""}` },
            ]}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lc && <DealStepper steps={lc.steps} lost={deal.stage === "lost"} />}
            {/* บล็อก "ขั้นต่อไป" เดิมถูกยุบเข้าการ์ด Control แล้ว — การ์ดบอกทั้งสถานะ
                คำอธิบาย และปุ่มก้าวถัดไปในที่เดียว ปล่อยไว้สองที่คือผู้ใช้ต้องอ่านสองรอบ
                (ปุ่มหลักของบล็อกนั้นคืน null ตลอดอยู่แล้ว — Won เกิดที่ใบเสนอราคา ไม่ใช่ที่ดีล) */}
            {/* route actions (ทะเบียนสรรพสามิต/PO สหมิตร/ส่งของ) — ปลายทางที่ *สร้าง entity
                อื่น* ไม่ใช่การควบคุมตัวดีล จึงยังอยู่ตรงนี้ ไม่ยัดเข้าการ์ด */}
            {(lc?.routes || []).length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                {lc.routes.map((route) => (
                  <RouteMenuButton key={route.kind} route={route} onAction={onRouteAction} busy={!!actionBusy} canEdit={canEdit} />
                ))}
              </div>
            )}
            </div>
          </SalesDetailOverview>

          {/* จุดจัดการเดียวของดีล — อยู่แถบขวาตลอดทุกแท็บ ท่าเดียวกับหน้าลีดและหน้าเอกสาร
              เดินหน้า (เชื่อม/สร้างโครงการ) · จัดการตัวระเบียน (แก้ไข/ลบ) · ปิดดีล
              แยกด้วย *ช่อง* ในการ์ด ไม่ใช่แยกไปคนละมุมจอเหมือนเดิม */}
          <DetailPageLayout aside={
            <RecordControlCard
              lifecycle={controlLc}
              record={deal}
              user={viewer}
              onTransition={runControlTransition}
              onSelect={openProjectFlow}
              extraActions={recordActions}
              busy={!!actionBusy}
            />
          }>
          <div className="flex flex-col gap-5">

          {tab === "overview" && <ContextGrid>
            <ContextCard
              icon={Building2}
              href={deal.customerId ? `/database/customers/${deal.customerId}` : undefined}
              eyebrow="ลูกค้าและเจ้าของดีล"
              title={deal.customerName || deal.customer?.name || "ยังไม่ผูกลูกค้า"}
              subtitle={(dealBrand.en || dealBrand.th) ? `แบรนด์ ${dealBrand.en || dealBrand.th}` : "ยังไม่ระบุแบรนด์"}
              badges={<>{deal.team && <span className="ui-badge">ทีม {deal.team}</span>}{ownerName && <span className="ui-badge" style={{ color: "var(--accent)" }}>{ownerName}</span>}</>}
              facts={[
                { label: "ประเภทดีล", value: DEAL_TYPE_LABELS[dealTypeOf(deal)] || dealTypeOf(deal) },
                { label: "Forecast", value: deal.forecastMonth || "-" },
              ]}
            />
            <ContextCard
              icon={FolderKanban}
              href={deal.projectId ? `/sa/projects/${deal.projectId}` : undefined}
              eyebrow="โครงการที่เชื่อมอยู่"
              title={data.project ? `${data.project.code ? `${data.project.code} · ` : ""}${data.project.name}` : "ยังไม่ได้เชื่อมโครงการ"}
              subtitle={data.project ? "เปิดเพื่อดูไทม์ไลน์ งาน และเอกสารโครงการ" : "เชื่อมโครงการเพื่อส่งต่องานหลังการขาย"}
              badges={data.project?.status ? <span className="ui-badge" style={{ color: "var(--green)" }}>{data.project.status}</span> : null}
              facts={data.project ? [
                { label: "วันเริ่ม", value: data.project.startDate ? fmtDate(data.project.startDate) : "-" },
                { label: "กำหนดเสร็จ", value: data.project.dueDate ? fmtDate(data.project.dueDate) : "-" },
              ] : []}
            />
          </ContextGrid>}

          {/* การ์ด "รายละเอียดดีล" เดี่ยว ๆ ที่เคยอยู่ตรงนี้ (#911) ย้ายเข้าไปเป็นบล็อก
              ปักหมุดหัวเธรดแล้ว (มติผู้ใช้ 2026-08-03: "แยกกันมันงง") — ดู dealNotesPinned */}

          {/* เมนูครอบ (แบบหน้าโครงการ): แท็บ ภาพรวม ↔ ไทม์ไลน์ — ตัดแถบทางลัด/ป้ายเฟสถัดไปออก (มติผู้ใช้) */}
          <SalesDetailTabs value={tab} onChange={switchTab} label="ส่วนของดีล" />

          {!!data?.warnings?.length && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", color: "var(--amber)", borderColor: "var(--amber)" }}>
              {data.warnings.join(" · ")}
            </div>
          )}

          {data?.forecastDrift?.hasDrift && (
            <div className="glass-panel" role="status" style={{ padding: "12px 14px", borderColor: "var(--amber)", borderLeft: "3px solid var(--amber)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--amber)", fontWeight: "var(--fw-bold)" }}>
                <AlertTriangle size={16} aria-hidden="true" />
                FC สหมิตรรอบล่าสุด (#{data.forecastDrift.latestRoundNo}) ต่างจากตอนสร้างดีล
              </div>
              <ul style={{ margin: "8px 0 4px", paddingLeft: 20, fontSize: "var(--fs-7)" }}>
                {data.forecastDrift.items.map((it, i) => (
                  <li key={i} style={{ marginBottom: 3 }}>{driftText(it)}</li>
                ))}
              </ul>
              <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
                คำแนะนำ: ดีลถูกล็อกตัวเลขไว้ตอน map — ปรับ “เดือนคาดได้รับ PO” / มูลค่าดีลเองหากต้องการให้ตรงกับ FC ล่าสุด
              </div>
            </div>
          )}

          {tab === "overview" && (
          <>
          <section id="deal-kpi" className="kpi-grid" style={{ gridTemplateColumns: "none", gridAutoFlow: "column", gridAutoColumns: "minmax(180px, 1fr)", overflowX: "auto" }}>
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
          <DetailCard icon={ClipboardList} eyebrow="Linked tasks" title="งานของดีล" meta={`${dealTaskSummary.done}/${dealTaskSummary.total} เสร็จ`} actions={<a className="btn ghost" href={`/sa/tasks?dealId=${deal.id}`}><ExternalLink size={14} aria-hidden="true" /> เปิด</a>}>
            {(data.dealTasks || []).length ? (
              <div className="premium-glass-table table-responsive">
                <TableScroll surface="embedded"><table className="premium-table">
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
                        <td style={{ fontWeight: "var(--fw-bold)" }}>
                          {task.title}
                          {task.note && <ReadableText text={task.note} lines={2} style={{ marginTop: 2, color: "var(--text-3)", fontSize: "var(--fs-5)", fontWeight: "var(--fw-medium)" }} />}
                        </td>
                        <td><TaskStatusBadge status={task.status} /></td>
                        <td>{task.assigneeName || task.ownerName || "-"}</td>
                        <td>{task.dueDate ? fmtDate(task.dueDate) : <span style={{ color: "var(--text-3)" }}>-</span>}</td>
                        <td>{task.category || <span style={{ color: "var(--text-3)" }}>-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></TableScroll>
              </div>
            ) : (
              <Empty>ยังไม่มีงานของดีลนี้ กด “เปิด” แล้วสร้างงานโดยเลือกผูกกับดีลนี้ได้</Empty>
            )}
          </DetailCard>
          )}

          {(tab === "inquiries" || tab === "overview") && (
            <RequestListCard requests={data.inquiries || []} openHref={`/requests?dealId=${deal.id}`} />
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
              <span style={{ background: "var(--accent)", color: "var(--accent-fg)", padding: 8, borderRadius: 10, display: "flex", flexShrink: 0 }}>
                <PackageCheck size={18} aria-hidden="true" />
              </span>
              <div style={{ minWidth: 150 }}>
                <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)" }}>ไทม์ไลน์</div>
                <div style={{ fontSize: "var(--fs-6)", color: "var(--text-3)", marginTop: 2 }}>
                  {!taskSummary.total ? "ยังไม่ได้สร้าง — กดเพื่อเริ่ม" : taskSummary.current ? `กำลังทำ: ${taskSummary.current.name}` : taskSummary.done === taskSummary.total ? "ครบทุกขั้นตอน" : deal.projectId ? `ในโครงการ ${data.project?.code || ""}` : "ไทม์ไลน์ของดีล (ยังไม่ผูกโครงการ)"}
                </div>
              </div>
              {taskSummary.total > 0 && (
                <div style={{ flex: 1, minWidth: 120, display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="progress" style={{ flex: 1 }} role="progressbar" aria-valuenow={taskSummary.done} aria-valuemax={taskSummary.total} aria-label="ความคืบหน้าไทม์ไลน์">
                    <span className={taskSummary.done === taskSummary.total ? "done" : undefined} style={{ width: `${Math.round((taskSummary.done / taskSummary.total) * 100)}%` }} />
                  </div>
                  <span className="mono tabular-nums" style={{ fontSize: "var(--fs-7)", color: "var(--text-2)", whiteSpace: "nowrap" }}>{taskSummary.done}/{taskSummary.total}</span>
                </div>
              )}
              <span className="btn btn-primary" style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>เปิดไทม์ไลน์</span>
            </div>
          )}
          {tab === "timeline" && (
          <section id="deal-pm" className="glass-panel" style={{ padding: 16 }}>
            <div className="timeline-header-row mb-3">
              <PackageCheck size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ไทม์ไลน์</h2>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn ghost" onClick={printDealTimeline} title="เปิดเอกสาร A4 สำหรับพิมพ์ / บันทึก PDF (ไม่ออกเลข Rev / ไม่เก็บประวัติ)">
                  <Printer size={14} aria-hidden="true" /> พิมพ์เอกสาร
                </button>
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
                    requests={data.inquiries || []}
                    canEdit={canEdit}
                    dealId={deal.id}
                    projectId={data.project?.id || null}
                    documentProject={dealDocumentProject}
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
                  <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", fontWeight: "var(--fw-semibold)", marginBottom: 6 }}>ดีลอื่นในโครงการนี้</div>
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
                  <span style={{ fontSize: "var(--fs-6)", color: "var(--text-3)" }}>
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
                  documentProject={dealDocumentProject}
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
                    <button type="button" className="btn btn-primary" onClick={openGenTimeline} disabled={!!actionBusy}
                      title={`เลือก/ยืนยัน template ก่อนสร้าง${deal.categoryCode ? ` · หมวด ${deal.categoryCode}` : " (ยังไม่ระบุหมวด — แก้ที่ปุ่มแก้ไขดีล)"}`}>
                      <Plus size={14} aria-hidden="true" /> สร้างไทม์ไลน์ของดีล
                    </button>
                    {/* เดิมเป็นลิสต์ชื่อ stage ฮาร์ดโค้ด — พอสลับลำดับ (B4) "เสนอราคา" ย้ายไป
                        อยู่หลัง "เสนอไทม์ไลน์" แต่ไม่มีในลิสต์ ดีลที่ออกใบแล้วจะกดสร้าง/ผูก
                        โครงการไม่ได้เลย. เทียบตำแหน่งแทนชื่อ = ลำดับขยับอีกกี่ครั้งก็ไม่พัง */}
                    {stageAtLeast(deal?.stage, 'timeline_proposed') && (
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
                <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ใบเสนอราคา</h2>
                <div className="spacer" />
                {/* ดีลปิด Won/Lost = ใบเสนอราคาถูกล็อกทั้งชุด — ซ่อนปุ่มสร้าง */}
                {canEdit && deal.projectId && deal.customerId && !isClosedStage(deal.stage) && (
                  <Link prefetch={false} href={`/sa/quotations/new?dealId=${deal.id}`} className="btn btn-primary sm"><Plus size={13} aria-hidden="true" /> สร้างใบเสนอราคา</Link>
                )}
                <Link href="/sa/quotations" className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> เมนูใบเสนอราคา</Link>
              </div>
              {(data.quotations || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <TableScroll surface="embedded"><table className="w-full text-sm">
                    <thead>
                      <tr><th>เลขที่</th><th>สถานะ</th><th className="num">ยอดรวม</th></tr>
                    </thead>
                    <tbody>
                      {data.quotations.map((quote) => (
                        <tr key={quote.id} className="premium-row">
                          <td className="mono"><Link href={`/sa/quotations/${quote.id}`} className="linklike">{quote.quoteNumber}</Link></td>
                          <td>{quoteStatusBadge(quote.status)}</td>
                          <td className="num mono">{money(quote.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></TableScroll>
                </div>
              ) : <Empty>ยังไม่มีใบเสนอราคา — สร้างได้จากเมนู <Link href="/sa/quotations" className="linklike">ใบเสนอราคา</Link></Empty>}
            </section>
            )}

            {(data.salesOrders || []).length > 0 && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ใบสั่งขาย</h2>
                <div className="spacer" />
                <Link href="/sa/sales-orders" className="btn ghost sm"><ExternalLink size={13} aria-hidden="true" /> เมนู ใบสั่งขาย</Link>
              </div>
              <div className="premium-glass-table table-responsive">
                <TableScroll surface="embedded"><table className="w-full text-sm">
                  <thead><tr><th>เลขที่ SO</th><th>สถานะ</th><th className="num">Actual ก่อน VAT</th><th>ใบยื่นภาษี</th></tr></thead>
                  <tbody>{data.salesOrders.map((order) => (
                    <tr key={order.id} className="premium-row">
                      <td className="mono"><Link href={`/sa/sales-orders/${order.id}`} className="linklike">{order.orderNumber}</Link></td>
                      <td><span className="ui-badge" style={{ color: order.status === "approved" ? "var(--green)" : order.status === "pending_approval" ? "var(--amber)" : "var(--text-3)" }}>{({ draft: "ร่าง", pending_approval: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ตีกลับ", cancelled: "ยกเลิก" })[order.status] || order.status}</span></td>
                      <td className="num mono">{money(order.status === "approved" ? order.actualAmount : 0)}</td>
                      {/* ปลายทางของ SO — เดิมหน้าดีลจบที่ SO ต้องไปเปิดหน้า SO ถึงจะรู้ว่าภาษีเดินถึงไหน.
                          ว่าง = ไม่มีสินค้าสรรพสามิตต้องยื่น (คิวกลางกรองให้แล้ว) ไม่ใช่งานค้าง */}
                      <td>{filingOf(order.id)}</td>
                    </tr>
                  ))}</tbody>
                </table></TableScroll>
              </div>
            </section>
            )}

            {tab === "quotations" && SALES_FEATURES.documents && (
            <section className="glass-panel" style={{ padding: 16 }}>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={17} aria-hidden="true" />
                <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>เอกสาร</h2>
              </div>
              {(data.documents || []).length ? (
                <div className="premium-glass-table table-responsive">
                  <TableScroll surface="embedded"><table className="w-full text-sm">
                    <thead>
                      <tr><th>เอกสาร</th><th>สถานะ</th><th>กำหนด</th></tr>
                    </thead>
                    <tbody>
                      {data.documents.map((doc) => (
                        <tr key={doc.id} className="premium-row">
                          <td>{doc.title}<span style={{ display: "block", color: "var(--text-3)", fontSize: "var(--fs-5)" }}>{doc.kind}</span></td>
                          <td>{stageBadge(doc.status)}</td>
                          <td className="mono">{doc.dueDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></TableScroll>
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
                <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ความเคลื่อนไหว</h2>
                {/* ตัวนับย้ายออก — จำนวนรายการในเธรดเป็นของ UpdateThread ที่โหลดเอง
                    หน้านี้ไม่รู้ยอดจริงอีกแล้ว ใส่เลขที่นับได้ครึ่งเดียวจะหลอกคนอ่าน */}
                {/* งานที่ผู้อ่านไม่มีสิทธิ์เปิดเธรดถูกกรองที่ server — ต้องบอกตรง ๆ ว่ามี
                    ของที่ถูกซ่อน ไม่งั้นเส้นเรื่องที่สั้นลงจะอ่านเป็น "ไม่มีความคืบหน้า" */}
                {data?.hiddenTaskFeeds > 0 && (
                  <span className="ui-badge">ซ่อน {data.hiddenTaskFeeds} งานที่ไม่มีสิทธิ์เห็น</span>
                )}
                {canEdit && (
                  <span style={{ marginLeft: "auto" }} />
                )}
                {/* เปิดคำร้องย้ายไปหน้า /sa/requests ทั้งหมด — ฟอร์มต้องรู้ชนิดและ
                    ทะเบียนที่ชนิดนั้นอ้าง (กลิ่น/สูตร/วัสดุ/ดีล) ครบก่อน จึงไม่ยก
                    โมดัลมาซ้อนบนหน้าดีลอีก */}
                {canEdit && (
                  <Link className="btn sm" href={`/requests?dealId=${deal.id}`} title="เปิดคำร้องถึงฝ่ายอื่นในนามดีลนี้">
                    <MessageSquare size={13} aria-hidden="true" /> เปิดคำร้อง
                  </Link>
                )}
              </div>
              <UpdateThread
                entityType="deal"
                entityId={deal.id}
                order="desc"
                extraItems={extraItems}
                pinned={dealNotesPinned}
                placeholder="พิมพ์อัปเดตงาน เช่น โทรคุยลูกค้าแล้ว รอส่งใบเสนอราคา..."
                emptyText="ยังไม่มีความเคลื่อนไหว"
                onPosted={load}
              />
          </section>
            </div>
            )}
          </div>
          </div>
          </DetailPageLayout>
        </div>
      )}

      {/* (โมดัล "คำร้อง" ถูกถอดออกพร้อมระบบสอบถาม — เปิดคำร้องที่ /sa/requests
          ซึ่งฟอร์มรู้จักชนิดคำร้องครบ 8 ชนิดและโหลดทะเบียนที่ต้องอ้างไว้ให้แล้ว) */}

      {/* ยืนยัน + เลือกประเภท (template) ก่อนสร้างไทม์ไลน์ของดีล — กัน "ดึงผิดประเภท" */}
      <Modal open={genOpen} onClose={() => !actionBusy && setGenOpen(false)} title="สร้างไทม์ไลน์ของดีล" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: "var(--fs-7)", color: "var(--text-2)", lineHeight: "var(--lh-relaxed)" }}>
            ระบบจะสร้างขั้นตอนงานจาก <strong>Workflow Template</strong> ตาม “ประเภทดีล” ด้านล่าง
            {deal?.categoryCode ? <> · หมวดสินค้า <strong>{deal.categoryCode}</strong></> : " (ยังไม่ระบุหมวดสินค้า — แก้ได้ที่ปุ่มแก้ไขดีล)"}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-7)" }}>
            ประเภทดีล (Template ที่จะใช้)
            <Select
              className="premium-select"
              value={genType}
              onChange={(e) => setGenType(e.target.value)}
              style={{ color: DEAL_TYPE_COLORS[normalizeDealType(genType)], fontWeight: "var(--fw-semibold)" }}
            >
              {DEAL_TYPES.map((t) => (
                <option key={t} value={t} style={{ color: DEAL_TYPE_COLORS[t], fontWeight: "var(--fw-semibold)" }}>{t} · {DEAL_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-5)", color: "var(--text-3)", flexWrap: "wrap" }}>
            จะใช้ template: {dealTypeBadge(genType)}
            {normalizeDealType(genType) !== dealTypeOf(deal) && (
              <span style={{ color: "var(--amber)" }}>· จะอัปเดตประเภทของดีลเป็นค่านี้ให้ด้วย</span>
            )}
          </div>
          <div className="form-action-bar">
            <button type="button" className="btn" onClick={() => setGenOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={confirmGenTimeline} disabled={!!actionBusy}>
              {actionBusy === "gen-timeline" ? "กำลังสร้าง…" : "สร้างไทม์ไลน์"}
            </button>
          </div>
        </div>
      </Modal>

      {/* เฟส B: โมดัลผูกดีลเข้าโครงการเดิมของลูกค้า — เลือกโครงการ + วันเริ่ม segment */}
      <Modal open={linkOpen} onClose={() => !actionBusy && setLinkOpen(false)} title="ผูกกับโครงการเดิม" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>
            ดีลนี้จะถูกผูกเข้าโครงการที่เลือก และต่อขั้นตอนตาม template ประเภท <strong>{DEAL_TYPE_LABELS[dealTypeOf(deal)]}</strong> เป็นช่วงใหม่ท้ายไทม์ไลน์
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-7)" }}>
            โครงการของ {deal?.customerName || deal?.customer?.name || "ลูกค้า"}
            <Select className="premium-select" value={linkProjectId} onChange={(e) => setLinkProjectId(e.target.value)} disabled={linkLoading}>
              <option value="">{linkLoading ? "กำลังโหลด…" : linkProjects.length ? "— เลือกโครงการ —" : "ลูกค้ารายนี้ยังไม่มีโครงการ"}</option>
              {linkProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.code || p.id} · {p.name}{p.type ? ` (${p.type})` : ""}</option>
              ))}
            </Select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--fs-7)" }}>
            วันเริ่มงานช่วงนี้
            <DateInput value={linkStartDate} onChange={setLinkStartDate} />
          </label>
          <div className="form-action-bar">
            <button type="button" className="btn btn-secondary" onClick={() => setLinkOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={submitLinkProject} disabled={!!actionBusy || !linkProjectId}>
              {actionBusy === "link-project" ? "กำลังผูก…" : "ผูกเข้าโครงการ"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={lostOpen} onClose={() => !actionBusy && setLostOpen(false)} title="ปิดดีลแบบไม่สำเร็จ (Lost)" size="sm">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: "var(--fs-7)", color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            เหตุผล (ไม่บังคับ)
            <Textarea
              rows={3}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="เช่น ลูกค้าเลือกคู่แข่ง / ราคาสูงเกิน / เลื่อนโครงการ"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text-1)", fontSize: "var(--fs-7)", resize: "vertical" }}
            />
          </label>
          <div className="form-action-bar">
            <button type="button" className="btn btn-secondary" onClick={() => setLostOpen(false)} disabled={!!actionBusy}>ยกเลิก</button>
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

    </Workspace>
  );
}
