"use client";
import { TableScroll } from "@/components/ui/Table";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, GanttChart,
  ListTodo, Clock, Calendar,
  Edit2, Trash2,
  Printer, User, FolderX,
  GitCommit, History, RotateCcw, ShieldCheck, ExternalLink,
  FileText,
} from "lucide-react";
import { useCan, useRole, useTeam } from "@/lib/roleContext";
import Modal from "@/components/Modal";
import ProjectDealsHub, { ProjectActivityFeed, ProjectQuotationsCard } from "@/components/pm/ProjectDealsHub";
import EntityDocumentsPanel from "@/components/salesPlanning/EntityDocumentsPanel";
import SalesProjectCreateModal from "@/components/pm/SalesProjectCreateModal";
import TimelineWorkspace from "@/components/pm/TimelineWorkspace";
import { TASK_STATUS_META, taskStatusColor } from "@/components/pm/StatusSelect";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import ReadableText from "@/components/ui/ReadableText";
import { cachedFetchJson } from "@/lib/apiCache";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast, { notifyToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusNotice from "@/components/ui/StatusNotice";
import RecordControlCard from "@/components/ui/RecordControlCard";
import {
  canDeleteProject, createProjectLifecycle,
  PROJECT_CLOSE_ACTIONS, PROJECT_PATCH_TRANSITIONS,
} from "@/lib/pm/projectLifecycle";
import { setHolidays, toLocalISODate } from "@/lib/pm/dateHelpers";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { entityCodeDisplay } from "@/lib/entityCode";
import { isExciseCategory } from "@/lib/master/categoryOf";
import { getComputedStatus, statusDotColor } from "@/lib/pm/derived";
import { PROJECT_CLOSE_STATUS_LABELS, PROJECT_CLOSE_TYPE_LABELS } from "@/lib/pm/projectClose";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateTime } from "@/lib/format";
import { isWonStage } from "@/lib/salesPlanning";
import SalesDetailTabs from "@/components/salesPlanning/SalesDetailTabs";
import RequestListCard from "@/components/requests/RequestListCard";
import DeliveriesPanel from "@/components/pm/DeliveriesPanel";
import { DELIVERY_STEP_KEYS, deliveriesForDeal, deliveryStepBadge } from "@/lib/pm/deliveries";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { DetailPageLayout } from "@/components/ui/DetailPage";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { detailTabFromSearch, PROJECT_DETAIL_TABS, PROJECT_TAB_ALIASES } from "@/lib/salesDetailTabs";
import { TIMELINE_CENTRAL, filterTimelineTasks, singleSelectedDeal } from "@/lib/pm/timelineFilter";
import { brandDisplayFromList } from "@/lib/master/brands";
import { PageShell as SaPageShell, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import Textarea from "@/components/ui/Textarea";

// ความยาวเหตุผล 10–500 ย้ายไปอยู่ที่ recordLifecycle (ค่าเริ่มต้นของ reasonPolicy)
// แล้ว — TransitionDialog บังคับให้เอง หน้านี้ไม่ต้องถือเลขของตัวเองอีก


// เตือนงานค้างสายขายก่อนปิดโครงการ (มติ B3 2026-07-27) — **เตือนอย่างเดียว ไม่บล็อก**
// ปุ่มขอปิด/อนุมัติปิดยังกดได้ตามปกติแม้ตัวเลขไม่เป็นศูนย์ บางโครงการปิดทั้งที่มีใบค้าง
// โดยเจตนา (ยกเลิกกลางคัน เอกสารที่เหลือไปตัดจบทางอื่น) — อย่าเปลี่ยนเป็นด่านโดยไม่ถามผู้ใช้
function CloseReadinessNotice({ readiness }) {
  if (!readiness?.total) return null;
  return (
    <StatusNotice tone="warning" title={`ยังมีเอกสารสายขายค้างอยู่ ${readiness.total} ใบ`}>
      <ul className="close-readiness-list">
        {readiness.items.map((item) => (
          <li key={item.key}>
            {item.label} <strong>{item.count}</strong> ใบ
            {item.refs.length ? <span className="close-readiness-refs"> · {item.refs.slice(0, 3).join(", ")}{item.refs.length > 3 ? ` และอีก ${item.refs.length - 3}` : ""}</span> : null}
          </li>
        ))}
      </ul>
      ปิดโครงการได้ตามปกติ — แต่หลังปิดแล้วจะออกใบเสนอราคา/ใบสั่งขายใบใหม่ในโครงการนี้ไม่ได้จนกว่าจะเปิดใหม่ (RE-ORDER)
    </StatusNotice>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const hasEditCap = useCan("salesplan:edit");
  const canCreateTaxRegistration = useCan("products:edit");
  const userRole = useRole();
  const team = useTeam();
  // ตัวตนของผู้ใช้ปัจจุบัน — `id` เป็นหลัก (เทียบกับ aeOwnerId) ส่วน `name` เก็บไว้
  // เป็นทางถอยสำหรับใบเก่าที่ยังไม่มี aeOwnerId (ดู isAeOwner ใน projectLifecycle)
  const [myId, setMyId] = useState("");
  const [myName, setMyName] = useState("");
  useEffect(() => {
    try {
      setMyId(localStorage.getItem("userId") || "");
      setMyName(localStorage.getItem("userName") || "");
    } catch { /* ssr */ }
  }, []);
  /* กติกา "โครงการใบนี้ทำอะไรได้บ้าง" — ไฟล์เดียวกับหน้ารายการ (lib/pm/projectLifecycle)
     ⚠️ ห้ามคำนวณสิทธิ์ซ้ำในหน้านี้: ของเดิมเช็ค `salesplan:edit` ทั้งที่ทุก API ตรวจ
     `pm:edit` — lifecycle แก้ให้แล้ว เอาไปใช้ตรง ๆ
     name เข้าไปด้วยเพราะ transition "ดึงกลับจากระงับ" เทียบเจ้าของด้วย *ชื่อ* ไม่ใช่ id */
  const viewer = useMemo(() => ({ role: userRole, team, id: myId, name: myName }), [userRole, team, myId, myName]);
  const projectLc = useMemo(() => createProjectLifecycle(), []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  // มุมมองสลับอัตโนมัติตามจอ: จอตั้ง → List, จอนอน → Table; Gantt (document) เลือกเองได้
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" }); // list | table | document
  /* เมนูครอบ (มติผู้ใช้): เปิดมาเจอ "ภาพรวม" (ศูนย์รวมดีล) ก่อน — กดเข้าไทม์ไลน์อีกชั้น
     ถึงเห็นตารางขั้นตอน. sync กับ ?tab=timeline เพื่อให้ refresh/แชร์ลิงก์ค้างแท็บเดิม.

     ⭐ มติผู้ใช้ 2026-08-05: **แท็บต้องไม่ทับกัน** — ของเดิมทุกก้อนเขียนว่า
     `{(tab === "overview" || tab === "xxx") && …}` ทำให้ "ภาพรวม" = ทุกแท็บต่อกันเป็นพรืด
     แท็บอื่นจึงมีหน้าที่แค่ *ตัด* ของออก และคนอ่านเจอของชุดเดิมซ้ำสองรอบ
     ⇒ ห้ามเติม `tab === "overview" ||` กลับเข้าไปในเงื่อนไขของแท็บใด ๆ อีก
     ภาพรวม = สรุป (KPI เงิน + ตารางดีล + การ์ดไทม์ไลน์) เท่านั้น */
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    setTab(detailTabFromSearch(window.location.search, { tabs: PROJECT_DETAIL_TABS, aliases: PROJECT_TAB_ALIASES }));
  }, []);
  const switchTab = (t) => {
    setTab(t);
    if (t === "tasks") setView("table");
    const url = new URL(window.location.href);
    if (t !== "overview") url.searchParams.set("tab", t);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };
  const [showEditProject, setShowEditProject] = useState(false);
  /* state ของ table/list view รุ่นเก่าถูกลบแล้ว (showAddTask · taskForm · collapsedPhases ·
     editingTaskId · editForm · insertAfterId/BeforeId · tableStatusFilter · tableSort ·
     editTask · showEditTask · depPopover · dirty) — TimelineWorkspace ถือ state พวกนี้เอง */
  /* ตัวกรอง "ดีลที่แสดง" ตัวเดียวของทั้งหน้า (มติผู้ใช้ 2026-08-05)
     ⚠️ เดิมเป็น state สองตัว (timelineDealFilters / taskDealFilters) กับตัวเลือกสามที่
     — เลือกที่หนึ่งอีกที่ไม่ตาม คนอ่านว่าเป็นข้อมูลคนละชุด · ตอนนี้ตัวเลือกอยู่บน
     "ที่ที่มันมีผล" เท่านั้น: หัวแท็บไทม์ไลน์ กับ หัวตารางงาน
     ⚠️ ผลข้างเคียงที่ตั้งใจ: กรองไว้ที่แท็บงานแล้วข้ามไปไทม์ไลน์ จะยังกรองอยู่ —
     แถบหัวไทม์ไลน์บอกจำนวนขั้นที่แสดงไว้แล้ว และการเพิ่ม/เรียงขั้นตอนถูกล็อกตามเดิม */
  const [dealFilters, setDealFilters] = useState([]);
  // เฟส 2: document revision control — ออก Revise = freeze เอกสารทั้งชุดเป็นเวอร์ชัน + เลข Rev
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [issuingRev, setIssuingRev] = useState(false);
  const [showIssueRev, setShowIssueRev] = useState(false); // modal ออกเวอร์ชันใหม่ (แทน window.prompt)
  const [revNote, setRevNote] = useState("");
  const [revError, setRevError] = useState("");
  const [toast, setToast] = useState(null); // { kind: 'success'|'error'|'info', msg }
  const [creatingTaxReg, setCreatingTaxReg] = useState(false);

  const [confirmState, setConfirmState] = useState(null); // ยืนยันแบบ promise (แทน window.confirm)
  /* เคยมี isFirstLoad ref ไว้ "พับทุกเฟสตอนโหลดครั้งแรก" ให้ table/list view รุ่นเก่า
     พอ collapsedPhases หายไปก็ไม่มีอะไรให้พับ — TimelineWorkspace/ProjectDocumentView
     ถือ collapsedPhases ของตัวเองและตั้งค่าเริ่มต้นเอง */
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pm/projects/${id}`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* เฟส F — อนุมัติปิดโครงการ (มติ 2026-07-18)
     ขอปิด/ถอน/อนุมัติ/ตีกลับ/เปิดใหม่ เคยถือ state โมดัลของตัวเองคนละก้อน (closeReqForm ·
     reopenForm · rejectForm · showDrop) — ย้ายไปให้ RecordControlCard ถือแทนทั้งชุดแล้ว
     เหลือแค่ตัวบอกว่ากำลังยิงอะไรอยู่ */
  const [closeBusy, setCloseBusy] = useState("");
  // งานค้างสายขาย (มติ B3): เตือนแต่ไม่บล็อก — คนขอปิดกับคนอนุมัติต้องเห็นก่อนกด
  // ไม่ใช่ไปรู้ทีหลังตอนออกใบใหม่ไม่ได้แล้ว. โหลดเมื่อยังไม่ปิด (ปิดไปแล้วไม่มีอะไรให้เตือน)
  const [closeReadiness, setCloseReadiness] = useState(null);
  const closeStatusNow = data?.closeStatus || "open";
  useEffect(() => {
    if (!id || closeStatusNow === "closed") { setCloseReadiness(null); return undefined; }
    let alive = true;
    fetch(`/api/pm/projects/${id}/close`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => { if (alive) setCloseReadiness(payload); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id, closeStatusNow]);

  const closeAction = useCallback(async (action, payload = {}) => {
    setCloseBusy(action);
    try {
      const res = await fetch(`/api/pm/projects/${id}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { notifyToast.error(d.error || "ทำรายการไม่สำเร็จ"); return false; }
      await load();
      return true;
    } finally { setCloseBusy(""); }
  }, [id, load]);

  /* จุดเดียวที่ปุ่มบนการ์ด Control วิ่งเข้า — โครงการยิงสองปลายทางตามชนิดของ transition
     สถานะงาน (ระงับ / ยกเลิก / ดึงกลับ) → PATCH · ชั้นการปิด → POST /close
     ท่าเดียวกับ runProjectTransition ของหน้ารายการ อ่านกติกาจาก lifecycle ตัวเดียวกัน
     คืน false = ไม่สำเร็จ การ์ดค้างกล่องไว้พร้อมเหตุผลที่พิมพ์ไปแล้ว ไม่ต้องพิมพ์ใหม่ */
  const runControlTransition = useCallback(async (actionId, values) => {
    const action = PROJECT_CLOSE_ACTIONS[actionId];
    const reason = values.reason?.trim() || undefined;
    if (action) return closeAction(action, { reason, closeType: values.closeType || undefined });
    if (!PROJECT_PATCH_TRANSITIONS.includes(actionId)) return false;
    setCloseBusy(actionId);
    try {
      const res = await fetch(`/api/pm/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actionId === "drop"
          // เหตุผลที่ยกเลิกเก็บใน metadata.lossReason ตามของเดิม ไม่ใช่คอลัมน์ของตัวเอง
          ? { status: "Dropped", metadata: { ...(data?.metadata || {}), lossReason: reason || null } }
          : { status: projectLc.get(actionId).to }),
      });
      if (!res.ok) {
        notifyToast.error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
        return false;
      }
      await load();
      return true;
    } finally { setCloseBusy(""); }
  }, [closeAction, data?.metadata, id, load, projectLc]);

  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(d || [])).catch(() => {});
    // โหลดปฏิทินวันหยุดจริงให้ฝั่ง client (Gantt/Document view นับวันทำการถูกต้อง)
    cachedFetchJson("/api/holidays").then((d) => {
      if (Array.isArray(d) && d.length) setHolidays(d.map((h) => h.date));
    }).catch(() => {});
  }, []);
  // FG picker: scope to the project's customer so cross-team FGs of the same
  // customer show up (product.team = creator's team, not the customer's).
  const projectCustomerId = data?.customerId;
  useEffect(() => {
    if (!data) return;
    const url = projectCustomerId
      ? `/api/products?customerId=${encodeURIComponent(projectCustomerId)}`
      : "/api/products";
    fetch(url).then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCustomerId]);

  const updateProject = async (patch) => {
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) { const updated = await res.json(); setData((d) => ({ ...d, ...updated })); }
    return res.ok;
  };

  const createTaxRegistrationFromProject = async () => {
    if (!p?.id) return;
    setCreatingTaxReg(true);
    try {
      const res = await fetch("/api/excise-registrations/from-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", msg: payload.error || "สร้างทะเบียนภาษีจากโครงการไม่สำเร็จ" });
        return;
      }
      setToast({ kind: "success", msg: `สร้างทะเบียนภาษี ${payload.fgCode || ""} แล้ว` });
      router.push(`/tax/registrations/${payload.id}`);
    } finally {
      setCreatingTaxReg(false);
    }
  };


  /* ── เฟส 1: แก้ task แบบ "ค้างก่อน-ยืนยันรวด" — ของหน้านี้ถูกลบแล้ว ─────────
     stageTaskEdit / stageScheduleEdit / cancelEdits / confirmEdits / dirty / dirtyCount
     กับแถบ "ยืนยันการเปลี่ยนแปลง" ท้ายจอ ทั้งชุดรับ input จาก table/list view รุ่นเก่า
     เท่านั้น พอวิวนั้นหายไป `dirty` ก็ไม่มีทางมีของ → แถบไม่เคยโผล่

     ⚠️ ของจริงที่ผู้ใช้เห็นอยู่คือแถบของ TimelineWorkspace ซึ่งถือ `drafts`/`dirtyCount`
     กับแถบ `.timeline-save-bar` ของตัวเอง (DealTimelineTable) — คลาสเดียวกัน ข้อความ
     เดียวกัน คนละก้อน · หน้านี้จึงไม่ต้องถือชุดของตัวเองซ้ำอีก */

  // ── เฟส 2: ออก Revise (freeze เอกสารทั้งชุดเป็นเวอร์ชัน) ──────────────────
  // การแก้ task = บันทึกทับ live ไม่เก็บประวัติ; "ออก Revise" คือการกระทำระดับ
  // เอกสารที่ตั้งใจ → snapshot ทุก task + เด้งเลข Rev (เริ่มที่ 0) ที่โชว์บนหน้าพิมพ์.
  // เปิด modal ออกเวอร์ชัน
  // 🔴 ด่าน "กันออก Rev ตอนยังมีการแก้ค้าง" หายไปตอนย้ายมา TimelineWorkspace — ของเดิม
  //    เช็ค dirtyCount ของหน้า ซึ่งค้าง 0 ตลอดหลังวิวเก่าถูกปิด (เท่ากับไม่มีด่านมานานแล้ว)
  //    ตอนนี้ของค้างอยู่ใน `drafts` ของ TimelineWorkspace ที่หน้านี้มองไม่เห็น — จะเอาด่าน
  //    กลับมาต้องให้ TimelineWorkspace รายงาน dirtyCount ขึ้นมา (ยังไม่มี prop นั้น)
  const openIssueRev = () => {
    setRevNote(""); setRevError(""); setShowIssueRev(true);
  };
  const confirmIssueRev = async () => {
    setIssuingRev(true); setRevError("");
    try {
      const res = await fetch(`/api/pm/projects/${id}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: revNote }),
      });
      if (!res.ok) { setRevError((await res.json().catch(() => ({}))).error || "ออกเวอร์ชันไม่สำเร็จ"); return; }
      const rev = await res.json();
      // เด้งเลข Rev + วันที่ออก (revisedAt) ทันที — หัวเอกสารพิมพ์ใช้ revDate=p.revisedAt
      // ถ้าไม่อัปเดต วันที่จะว่างจนกว่าจะ reload ทั้งหน้า
      setData((d) => ({ ...d, currentRev: rev.currentRev, maxRev: rev.currentRev, revisedAt: rev.createdAt ?? d?.revisedAt ?? null, revStale: false }));
      setShowIssueRev(false);
      refreshRevisions(); // ให้ประวัติที่อาจเปิดค้างอยู่เห็น Rev ใหม่
      setToast({ kind: "success", msg: `ออกเวอร์ชันแล้ว — Rev. ${rev.currentRev}` });
    } finally { setIssuingRev(false); }
  };
  // ดึงประวัติเวอร์ชันใหม่ (ใช้ซ้ำหลัง ออก Rev / ย้อน / บันทึก เพื่อไม่ให้ลิสต์ค้างเก่า)
  const refreshRevisions = async () => {
    const res = await fetch(`/api/pm/projects/${id}/revisions`);
    if (res.ok) { const d = await res.json(); setRevisions(d.revisions || []); }
  };
  const openRevisions = async () => {
    setShowRevisions(true);
    await refreshRevisions();
  };
  // พิมพ์เวอร์ชันเก่า: ดึง snapshot แล้วส่งเข้า print เหมือนเอกสารปัจจุบัน
  const printRevision = async (revNo) => {
    const res = await fetch(`/api/pm/projects/${id}/revisions/${revNo}`);
    if (!res.ok) { setToast({ kind: "error", msg: "ดึงเวอร์ชันไม่สำเร็จ" }); return; }
    const revRow = await res.json();
    const snapshot = revRow?.snapshot;
    const proj = snapshot?.project || {};
    const fallback = proj.productMainCategory ? `${mainCatName(proj.productMainCategory)}${proj.productSubCategory ? ` / ${proj.productSubCategory}` : ""}` : "";
    openGanttPrintWindow({
      ...proj,
      // Rev ที่ถ่ายก่อนมีดีลใน snapshot (ก่อน 2026-08-05) ไม่มี proj.deals — ถอยไปใช้
      // ดีลปัจจุบันให้ ดีกว่าปล่อยช่อง "โครงการย่อย" ว่างบนเอกสารที่พิมพ์ซ้ำ
      deals: proj.deals || p.deals || [],
      tasks: snapshot?.tasks || [],
      projectProducts: enrichProducts(snapshot?.projectProducts || []),
      categoryFallback: fallback,
      ...resolveAe(proj.aeOwner, proj.aeOwnerId),
      rev: revNo,
      revDate: revRow?.createdAt || null, // วันที่ออก Rev นี้ → โชว์ DD/MM/YY ในหัวเอกสาร
    });
  };

  // ยืนยันแบบ promise — แทน await confirmAction() ด้วย ConfirmDialog ที่เข้าธีม.
  // ใช้: if (!(await askConfirm({ title, message }))) return;
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };

  // ย้อนงานทั้งชุดกลับไปเท่ากับจุดที่เลือก (เซฟใหญ่หรือ Rev)
  // 🔴 ด่าน "กันย้อนตอนยังมีการแก้ค้าง" หายไปด้วยเหตุเดียวกับ openIssueRev (ดูคอมเมนต์ที่นั่น)
  const restoreSnapshot = async (row) => {
    const label = row.kind === "rev" ? `Rev. ${row.revNo}` : `บันทึกเมื่อ ${fmtDateTime(row.createdAt)}`;
    if (!(await askConfirm({ title: "ย้อนกลับไปจุดนี้?", message: `งานทั้งหมดจะกลับไปเท่ากับ "${label}" (สร้าง/ลบ/แก้ขั้นตอนให้ตรง). จุดบันทึก/Rev อื่นยังอยู่ครบ ย้อนไปจุดอื่นได้อีก.` }))) return;
    const res = await fetch(`/api/pm/projects/${id}/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: row.id }),
    });
    if (!res.ok) { setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ย้อนเวอร์ชันไม่สำเร็จ" }); return; }
    const r = await res.json().catch(() => ({}));
    setShowRevisions(false); // ปิดโมดัลประวัติหลังย้อนสำเร็จ
    await load();            // refresh หน้า (ดึง task + currentRev/revStale ใหม่)
    const changed = (r.recreated || 0) + (r.overwritten || 0) + (r.deleted || 0);
    setToast(changed
      ? { kind: "success", msg: `ย้อนกลับไป ${label} แล้ว — เขียนทับ ${r.overwritten || 0}, สร้างคืน ${r.recreated || 0}, ลบ ${r.deleted || 0} ขั้น` }
      : { kind: "info", msg: `${label} เหมือนสถานะปัจจุบันอยู่แล้ว — ไม่มีอะไรเปลี่ยน` });
  };

  /* ผูก/ถอด FG จากหน้านี้ — ทั้งชุดถูกลบแล้ว (addProduct · removeProduct ·
     updateProductQty · deriveCategoryFromProducts · confirmExciseFlip · addingProduct)
     ทางเข้าเดียวของมันคือปุ่มใน fgUI ซึ่งไม่เคยขึ้นจอ (ดูคอมเมนต์ที่ fgUI)

     มติ 2026-08-08 (artifact 23dc1d94): **ฟอร์มโครงการไม่มีช่อง FG โดยเจตนา** —
     โครงการเป็นภาชนะรวมดีล ฟอร์มถามเฉพาะเรื่องภาชนะ · ProjectFormModal (ฟอร์มยุค 1:1
     ที่เคยมีช่อง FG) ถูกลบทั้งไฟล์แล้ว ทุกทางเรียกใช้ SalesProjectCreateModal ตัวเดียว
     (ตัว onSuccess ยังเช็ค productWarning ไว้ แต่จะไม่มีทางเด้ง — ฟอร์มไม่ส่ง
     projectProducts) · ถ้าวันหนึ่งต้องมี UI ผูก FG ให้ทำเป็นการ์ดบนหน้ารายละเอียดนี้
     ไม่ใช่ยัดกลับเข้าฟอร์มสร้าง/แก้ */

  /* ระงับ / ยกเลิก / ดึงกลับ (สองแบบ — คนละสิทธิ์กันโดยเจตนา) ย้ายไปประกาศที่
     lib/pm/projectLifecycle.js แล้ว ทั้งกล่องยืนยันและช่องกรอกเหตุผล ที่นี่เหลือ
     runControlTransition ตัวเดียวเป็นทางออกสู่ API */

  const handleDeleteProject = async () => {
    if (!data) return;
    if (!(await askConfirm({ title: "ลบโครงการ", message: `ต้องการลบโครงการ "${data.code} — ${data.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`, confirmLabel: "ลบ" }))) return;
    const res = await fetch(`/api/pm/projects/${data.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/sa/deals");
    } else {
      setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ" });
    }
  };

  /* เพิ่ม / ลบ / เลื่อนลำดับ / แก้ไข ขั้นตอน — ตัวจัดการทั้งชุดของหน้านี้ถูกลบแล้ว
     ทุกตัวมีผู้เรียกอยู่ใน table/list view รุ่นเก่าเท่านั้น (addTask · deleteTask ·
     togglePhase · moveTask/moveButtons · startEditing/saveEditing · openEditModal ·
     handleToggleTask) พอวิวนั้นหายไปก็ไม่มีทางเรียกถึงอีก
     ตอนนี้ TimelineWorkspace ยิง API ชุดเดียวกันเองแล้วเรียก onChanged={load} กลับมา */

  const allTasks = useMemo(() => data?.tasks || [], [data?.tasks]);
  const tasks = useMemo(
    () => filterTimelineTasks(allTasks, dealFilters),
    [allTasks, dealFilters],
  );
  // สรุปของเข้าแปะบน milestone "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด"
  // (npd-38 / re-order-11) เพื่อให้ขั้นนั้นมีของจริงข้างในแทนที่จะเป็นกล่องเปล่า 45 วัน
  //
  // ⚠️ **นับเฉพาะของเข้าของดีลที่เป็นเจ้าของ task นั้น** ไม่ใช่ทั้งโครงการ —
  // โครงการคือศูนย์รวมข้อมูลดีล สินค้าตัวหนึ่งมี RE-ORDER ได้หลายรอบ ถ้ารวมทุกรอบ
  // ของรอบเก่าจะลากให้รอบใหม่ดูเหมือนยังไม่ครบตลอดไป (task มี dealId อยู่แล้ว)
  // · ขั้นที่ไม่มี dealId (ข้อมูลเก่า 18 แถวบน prod) ตกไปใช้ยอดรวมทั้งโครงการ
  //   เพราะไม่มีทางรู้ว่าเป็นของรอบไหน — ดีกว่าไม่โชว์อะไรเลย
  const deliveryStepBadgeFor = useMemo(() => {
    const rows = data?.deliveries || [];
    if (!rows.length) return null;
    const today = toLocalISODate(new Date());
    return (task) => {
      if (!DELIVERY_STEP_KEYS.includes(task?.workflowTemplateStepKey)) return null;
      const scoped = task.dealId ? deliveriesForDeal(rows, task.dealId) : rows;
      return deliveryStepBadge(scoped, today, { scope: task.dealId ? 'deal' : 'project' });
    };
  }, [data?.deliveries]);
  const processedTasks = useMemo(() => {
    let currentPhase = null;
    let phaseNum = 0;
    let taskInPhase = 0;
    
    return tasks.map(task => {
      const p = task.phase || "—";
      if (p !== currentPhase) {
        currentPhase = p;
        phaseNum++;
        taskInPhase = 1;
      } else {
        taskInPhase++;
      }
      return {
        ...task,
        phaseNum,
        taskInPhase,
        displayNumber: `${phaseNum}.${taskInPhase}`
      };
    });
  }, [tasks]);

  /* taskNumById (ชิป predecessor ในตาราง) · phaseColorMap · tableGroups (filter → group
     by phase → sort) ถูกลบแล้ว — ทั้งสามป้อน table view รุ่นเก่าเท่านั้น
     TimelineWorkspace จัดกลุ่ม/เรียง/ให้สีเฟส ด้วยชุดของตัวเอง */

  if (loading) return <SkeletonRows />;
  if (!data) return <EmptyState icon={FolderX}>ไม่พบโครงการ</EmptyState>;

  const p = data;
  // โครงการกำพร้า (ไม่มีดีล) ไม่มีอะไรให้ดูในภาพรวม — เข้าไทม์ไลน์ตรงเหมือนเดิม
  const showTimeline = tab === "timeline";
  const projectBrand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand) || "-";
  const projectTitle = p.name && projectBrand !== "-" && !p.name.includes("/") ? `${p.name} / ${projectBrand}` : (p.name || "โครงการ");
  const hasWriteAccess = hasEditCap && !!data.canEdit;
  const isLocked = p.status === "On Hold" || p.status === "Dropped" || p.status === "Completed";
  const canEdit = hasWriteAccess && !isLocked;
  const canReorderTimeline = canEdit && dealFilters.length === 0;
  const canAddTimelineTask = canEdit && dealFilters.length <= 1;
  // แนะนำสร้างทะเบียนภาษีเฉพาะเมื่อ (1) ดีลที่ผูก won แล้ว (โครงการที่ไม่ได้มาจากดีล
  // ถือว่าผ่าน) และ (2) มี FG หมวดสรรพสามิต (ติ๊ก isExcise) อย่างน้อยหนึ่งตัว —
  // ไม่งั้นไม่ต้องมีทะเบียนภาษี.
  const dealWon = !p.dealId || isWonStage(p.dealStage);
  const hasExciseFg = (p.projectProducts || []).some((x) => isExciseCategory(x.product?.categoryCode || "", categories));
  const recommendTaxReg = dealWon && hasExciseFg;

  const total = processedTasks.length;
  const done = processedTasks.filter((t) => t.status === "Completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isDone = pct === 100;
  const accent = isDone ? "var(--green)" : "var(--accent)";
  const projectPersonalTasks = p.personalTasks || [];
  /* ตัวเลือกชุดเดียวของตัวกรอง — นับทั้ง "ขั้นตอน" (ไทม์ไลน์) และ "งาน" (/sa/tasks)
     ในบรรทัดเดียว เพราะตัวกรองตัวเดียวกันคุมทั้งสองที่ · ตัวเลือก "งานกลางโครงการ"
     หมายถึงของที่ไม่ผูกดีล — ฝั่งไทม์ไลน์คือ task.dealId ว่าง ฝั่งงานก็ว่างเหมือนกัน */
  const dealFilterOptions = [
    ...(p.deals || []).map((deal) => ({
      value: deal.id,
      label: `${deal.title} (${allTasks.filter((task) => task.dealId === deal.id).length} ขั้นตอน · ${projectPersonalTasks.filter((task) => task.dealId === deal.id).length} งาน)`,
    })),
    ...(allTasks.some((task) => !task.dealId) || projectPersonalTasks.some((task) => !task.dealId) ? [{
      value: TIMELINE_CENTRAL,
      label: `งานกลางโครงการ (${allTasks.filter((task) => !task.dealId).length} ขั้นตอน · ${projectPersonalTasks.filter((task) => !task.dealId).length} งาน)`,
    }] : []),
  ];
  // 🐞 ของเดิมเทียบ `dealFilters.includes(task.dealId)` ตรง ๆ — พอตัวกรองรวมเป็นตัวเดียว
  //    การเลือก "งานกลางโครงการ" จะไม่ตรงกับงานที่ dealId ว่างเลย แล้วตารางว่างเงียบ
  const shownPersonalTasks = dealFilters.length
    ? projectPersonalTasks.filter((task) => dealFilters.includes(task.dealId || TIMELINE_CENTRAL))
    : projectPersonalTasks;
  const completedPersonalTasks = shownPersonalTasks.filter((task) => task.status === "Completed").length;

  /* ตัวเลขบนแท็บ — จำเป็นหลังจากภาพรวมไม่ได้กองของทุกแท็บไว้แล้ว: ถ้าไม่บอกจำนวน
     คนจะไม่รู้ว่าแท็บไหนมีของ แล้วต้องไล่กดทีละแท็บ (ปัญหาที่การกองรวมเคยกลบไว้)
     นับ "ของทั้งหมด" ไม่ใช่ของที่ผ่านตัวกรอง — ป้ายบนแท็บที่ยังไม่ได้เปิดต้องไม่ขยับ
     ตามตัวกรองที่อยู่ในแท็บอื่น */
  const tabCounts = {
    documents: (p.quotations || []).length + (p.salesOrders || []).length,
    tasks: projectPersonalTasks.length + (p.inquiries || []).length,
  };
  const projectTabs = PROJECT_DETAIL_TABS.map((entry) => (tabCounts[entry.key]
    ? { ...entry, label: <>{entry.label} <span className="ui-badge" style={{ marginLeft: 4 }}>{tabCounts[entry.key]}</span></> }
    : entry));

  /* ───────── การ์ด Record Control ─────────
     ของเดิมกระจายอยู่ 4 ที่: แถบไอคอนหัวหน้า (แก้ไข/ลบ) · การ์ดสถานะการปิดกลางหน้า ·
     แบนเนอร์แดง "ยกเลิกแล้ว" · แถบปุ่มท้ายหน้า (ระงับ/ยกเลิก) ที่โผล่เฉพาะแท็บไทม์ไลน์
     — ผู้ใช้ต้องรู้เองว่าปุ่มไหนอยู่ตรงไหน · ตอนนี้รวมเป็นการ์ดเดียวที่แถบขวา */
  const closeStatus = p.closeStatus || "open";
  const linkedDealCount = (p.deals || []).length;
  const isCloseRequester = !!p.me?.id && p.closeRequestedBy === p.me.id;

  /* ⚠️ CloseReadinessNotice เป็น **คำเตือน ไม่ใช่ด่าน** (มติ B3) — อยู่ที่ notices เท่านั้น
     ห้ามเอาไปผูกกับ allow() ของ transition ไม่งั้นโครงการที่ตั้งใจปิดทั้งที่มีใบค้าง
     จะปิดไม่ได้เลย

     โชว์เฉพาะตอนที่ "การปิด" เป็นเรื่องที่กดได้จริง: กำลังจะยื่น (ของเดิมเห็นในโมดัล
     ขอปิดเท่านั้น — สายไป ต้องเห็นก่อนกด) หรือกำลังรออนุมัติ (ผู้อนุมัติต้องเห็นชุด
     เดียวกับผู้ขอ) · โครงการที่ยกเลิกไปแล้วขอปิดไม่ได้ เตือนไปก็ไม่มีปุ่มให้กด */
  const showCloseReadiness = closeStatus === "pending_close"
    || projectLc.available(p, viewer).some((entry) => entry.id === "request_close");
  const controlNotices = [
    p.status === "Dropped" ? (
      <StatusNotice key="dropped" tone="error" title="โครงการนี้ถูกยกเลิกแล้ว">
        {p.metadata?.lossReason ? `เหตุผล: ${p.metadata.lossReason}` : "เหตุผลที่ยกเลิกอยู่ในประวัติ"}
      </StatusNotice>
    ) : null,
    showCloseReadiness && closeReadiness?.total ? <CloseReadinessNotice key="readiness" readiness={closeReadiness} /> : null,
    // ผู้อนุมัติที่เป็นคนยื่นเอง — lifecycle ซ่อนปุ่มอนุมัติ/ตีกลับให้แล้ว แต่ต้องบอกว่าทำไม
    closeStatus === "pending_close" && p.canApproveClose && isCloseRequester ? (
      <StatusNotice key="own-request" tone="info" title="คำขอปิดนี้เป็นของคุณเอง">
        ต้องให้ผู้อนุมัติคนอื่นเป็นคนกดอนุมัติหรือตีกลับ
      </StatusNotice>
    ) : null,
  ].filter(Boolean);

  // หลักฐานการปิด — เดิมเป็นการ์ด "สถานะการปิดโครงการ" กลางหน้า ที่บอกเรื่องเดียวกับ
  // สถานะบนหัวการ์ดอยู่แล้ว เหลือไว้เฉพาะส่วนที่การ์ดไม่ได้บอก (ใคร/เมื่อไหร่/เหตุผล)
  const controlEvidence = closeStatus !== "open" || p.closeReason ? (
    <div className="project-close-evidence">
      <div>
        <strong>{PROJECT_CLOSE_STATUS_LABELS[closeStatus]}</strong>
        {p.closeType ? ` · ${PROJECT_CLOSE_TYPE_LABELS[p.closeType]}` : ""}
      </div>
      {closeStatus === "pending_close" && p.closeRequestedByName ? <div>ขอโดย {p.closeRequestedByName}</div> : null}
      {closeStatus === "closed" && p.closedByName ? <div>อนุมัติโดย {p.closedByName}</div> : null}
      {p.closeReason ? <div className="project-close-reason">{p.closeReason}</div> : null}
    </div>
  ) : null;

  /* action ที่ไม่ใช่การย้ายสถานะ — lifecycle ไม่รู้จัก แต่ผู้ใช้มองว่าเป็น "การควบคุม"
     เหมือนกัน (มติ 2026-08-01) กด onClick ตรง ๆ เพราะมีกล่องยืนยันของตัวเองอยู่แล้ว */
  const recordActions = [
    {
      id: "edit", kind: "edit", slot: "secondary", label: "แก้ไขข้อมูลโครงการ", icon: Edit2,
      visible: canEdit, disabled: !!closeBusy, onClick: () => setShowEditProject(true),
    },
    {
      id: "delete", kind: "delete", slot: "danger", label: "ลบโครงการนี้", icon: Trash2,
      /* ⚠️ ใช้ canDelete ที่ API ส่งมา ห้ามเดาจาก canEdit — ของเดิมเดา แล้ว AE ที่
         deleteScope='none' เห็นปุ่มลบ กดแล้วเจอ 403 (คอมเมนต์ที่ canDeleteProject) */
      visible: canDeleteProject(p) && closeStatus !== "closed",
      // ผูกดีลอยู่ = API ตอบ 409 — บอกเหตุผลไว้บนปุ่มแทนที่จะให้กดแล้วค่อยรู้
      // (ของเดิมสลับปุ่มลบเป็นไอคอนลิงก์ไปหน้าดีล ซึ่งอ่านไม่ออกว่าแปลว่าอะไร)
      disabled: !!closeBusy || linkedDealCount > 0,
      disabledReason: linkedDealCount > 0
        ? `โครงการนี้ยังผูกดีลอยู่ ${linkedDealCount} ใบ — ลบดีลทั้งหมดที่หน้าบริหารงานขายก่อน`
        : undefined,
      onClick: handleDeleteProject,
    },
  ];

  const controlCard = (
    <RecordControlCard
      lifecycle={projectLc}
      record={p}
      user={viewer}
      onTransition={runControlTransition}
      extraActions={recordActions}
      notices={controlNotices.length ? controlNotices : null}
      evidence={controlEvidence}
      busy={!!closeBusy}
    />
  );

  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || mc;
  // ยังไม่ผูก FG → ชื่อหมวด/หมวดรอง (resolve ชื่อหมวดหลักจากโค้ด) ใช้เป็น fallback บนหน้าพิมพ์
  const categoryFallback = p.productMainCategory ? `${mainCatName(p.productMainCategory)}${p.productSubCategory ? ` / ${p.productSubCategory}` : ""}` : "";

  // ── เติมข้อมูลให้เอกสาร ISO (CR §3) ──────────────────────────────────
  /* เบอร์มือถือ + อีเมลของ AE ผู้ดูแล — ดึงจากข้อมูลผู้ใช้ (ไม่ใช่ของลูกค้า)
     🐞 เดิมจับคู่ด้วย **ชื่อ** อย่างเดียว (`x.name === aeName`) ซึ่งพังสองทาง:
     คนเปลี่ยนชื่อ → ชื่อในใบไม่ตรงบัญชีอีกต่อไป · ใบเก่าเก็บชื่อย่อ ("Kantima T.")
     ที่ไม่เคยตรงกับชื่อบัญชีเลย ⇒ เบอร์/อีเมลบนเอกสาร ISO หายเงียบ ๆ ไม่มี error
     ตอนนี้ยึด `aeOwnerId` ก่อน แล้วค่อยถอยไปเทียบชื่อสำหรับใบที่ยังไม่มี id */
  const resolveAe = (aeName, aeOwnerId) => {
    const u = (aeOwnerId && users.find((x) => x.id === aeOwnerId))
      || users.find((x) => x.name === aeName);
    return { aeMobile: u?.phone || "", aeEmail: u?.email || "" };
  };
  // หมวดหลัก / หมวดรอง ของ FG หนึ่งๆ → "ODM / Shower Gel" (lookup จาก categoryCode).
  const catLabelFor = (productId) => {
    const pr = allProducts.find((x) => x.id === productId);
    const code = pr?.categoryCode || "";
    if (!code) return "";
    const [mc = "", tc = ""] = code.split("-");
    const main = categories.find((c) => c.mainCategoryCode === mc)?.mainCategoryName || mc;
    const sub = categories.find((c) => c.mainCategoryCode === mc && c.typeCode === tc)?.nameTh || "";
    return sub ? `${main} / ${sub}` : main;
  };
  const enrichProducts = (list) => (list || []).map((pp) => ({ ...pp, categoryLabel: catLabelFor(pp.productId) }));
  // เลข Rev ถัดไป (รันอัตโนมัติ): ครั้งแรก = 0, จากนั้น +1 — ใช้โชว์บนปุ่ม "ออก Rev. N"
  // เลข Rev ถัดไป = สูงสุดที่เคยออก + 1 (ไม่อิง currentRev — เพราะ currentRev เป็น "ตัวชี้
  // ว่าอยู่ที่ Rev ไหน" ซึ่งย้อนถอยได้; ออก Rev ใหม่ต้องไม่ชนเลขที่เคยใช้)
  const nextRev = p.maxRev == null ? 0 : p.maxRev + 1;

  /* fgUI (ลิสต์ FG + ช่องสั่งซื้อ/ผลิต + ปุ่มเพิ่ม-ลบสินค้า) ถูกลบแล้ว — ที่เดียวที่รับมันไปคือ
     <ProjectDocumentView fgUI={fgUI}> ในบล็อกที่ตายแล้ว และ ProjectDocumentView เองก็ไม่มี
     prop ชื่อ fgUI มารับ (กลืนทิ้งเงียบ ๆ) → JSX ก้อนนี้ไม่เคยขึ้นจอเลย
     ⚠️ ฟอร์มโครงการไม่มีช่อง FG (มติ 2026-08-08 — โครงการ = ภาชนะ) · UI ผูก FG
     ถ้าจะกลับมา ให้เป็นการ์ดบนหน้านี้ ไม่ใช่ในโมดัลสร้าง/แก้ */

  return (
    <SaPageShell>
      {/* Top Header Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
        <Link
          href="/sa/projects"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--text-2)",
            fontSize: "var(--fs-7)",
            fontWeight: "var(--fw-medium)",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={16} /> กลับไปหน้ารวมโครงการ
        </Link>
        {/* ไอคอนแก้ไข/ลบ ย้ายไปการ์ด Control แล้ว — การควบคุมอยู่ที่เดียว ไม่ว่าจะเป็น
            การเดินสถานะหรือการจัดการตัวระเบียน (มติ 2026-08-01) */}
      </div>

      <SalesDetailOverview
        eyebrow="รายละเอียดโครงการ"
        title={projectTitle}
        description={<>
          <span className="mono" style={{ fontWeight: "var(--fw-bold)", color: "var(--text)" }}>{entityCodeDisplay(p.code, p.currentRev)}</span>
          {/* ลิงก์ลูกค้ามาอยู่ตรงนี้แทนการ์ด "ลูกค้าของโครงการ" ที่ถอดออก (มติ 2026-08-05)
              — การ์ดใบนั้นพูดเรื่องเดียวกับบรรทัดนี้และแถบ facts ด้านล่างทั้งใบ */}
          <span>ลูกค้า: {p.customerId
            ? <Link href={`/database/customers/${p.customerId}`} className="linklike">{p.customerName || "-"}</Link>
            : (p.customerName || "-")}</span>
          <span>แบรนด์: {projectBrand}</span>
          {p.productMainCategory ? <span>หมวดสินค้า: {`${mainCatName(p.productMainCategory)}${p.productSubCategory ? ` / ${p.productSubCategory}` : ""}`}</span> : null}
        </>}
        badges={<>
          <SalesStateBadge label={getComputedStatus(p)} color={statusDotColor(getComputedStatus(p))} />
          {p.closeStatus === "pending_close" && <span className="ui-badge" style={{ color: "var(--amber)" }}>รออนุมัติปิด · {PROJECT_CLOSE_TYPE_LABELS[p.closeType] || ""}</span>}
          {p.closeStatus === "closed" && <span className="ui-badge" style={{ color: "var(--text-3)" }}>ปิดแล้ว · {PROJECT_CLOSE_TYPE_LABELS[p.closeType] || ""}</span>}
        </>}
        /* ปุ่มนี้เคยโผล่ทุกแท็บที่ไม่ใช่ไทม์ไลน์ — ซ้ำกับปุ่มบนการ์ดไทม์ไลน์ของภาพรวม
           ที่อยู่ห่างกันไม่ถึงหนึ่งจอ ⇒ ภาพรวมใช้ปุ่มบนการ์ด แท็บอื่นใช้ปุ่มนี้ */
        actions={tab !== "overview" && tab !== "timeline"
          ? <button type="button" className="btn btn-primary" onClick={() => switchTab("timeline")}><GanttChart size={14} /> เปิดไทม์ไลน์</button>
          : null}
        facts={[
          { icon: Calendar, label: "วันเริ่ม", value: p.startDate || "-" },
          { icon: Clock, label: "วันสิ้นสุด", value: p.dueDate || "-" },
          { icon: User, label: "AE / ทีม", value: `${p.aeOwner || "-"} · ${p.team || "-"}` },
          { icon: GanttChart, label: "จำนวนดีล", value: `${(p.deals || []).length} ดีล` },
        ]}
      />

      {/* จุดจัดการเดียวของโครงการ — การ์ดสถานะการปิดเดิมที่เคยอยู่ตรงนี้ถูกยุบเข้าไปแล้ว
          (สถานะ + ปุ่มเดินสถานะ + แก้ไข/ลบ + หลักฐานการปิด)

          ⚠️ **ซ่อนบนแท็บไทม์ไลน์** (มติผู้ใช้ 2026-08-02) ต่างจากหน้าดีลที่การ์ดอยู่ทุกแท็บ
          — วัดที่ 1280px แล้วตารางไทม์ไลน์อยากได้ 1250px แต่การ์ดกินไป 348px เหลือ 818px
          ⇒ ซ่อนหลังสกอลล์แนวนอน 432px (ไม่มีการ์ดซ่อนแค่ ~84px) ไทม์ไลน์คือพื้นที่ทำงาน
          จริงของหน้านี้ ความกว้างจึงชนะความสม่ำเสมอ · ทุกปุ่มยังกดได้จากแท็บอื่นครบ */}
      <DetailPageLayout aside={showTimeline ? null : controlCard}>

      {/* ⚠️ ContextGrid ของแท็บภาพรวมถูกถอดออกทั้งแถว (มติผู้ใช้ 2026-08-05) —
          การ์ด "ลูกค้าของโครงการ" พูดเรื่องเดียวกับ description + facts บนหัวหน้า
          (ลูกค้า · แบรนด์ · ทีม/AE · กำหนดเสร็จ) ส่วนการ์ดดีล 3 ใบแรกคือ subset ของ
          ตารางดีลที่อยู่ถัดลงไปไม่ถึงหนึ่งจอ และ "3 ใบแรก" ก็ไม่มีเกณฑ์ว่าทำไมสามใบนั้น
          ⇒ ลิงก์ไปหน้าลูกค้ายังอยู่ที่คำว่า "ลูกค้า" บนหัวหน้า อย่าเอาการ์ดกลับมา */}

      <div style={{ marginTop: 20 }}>
        <SalesDetailTabs value={tab} onChange={switchTab} label="ส่วนของโครงการ" tabs={projectTabs} />
      </div>

      {/* เครื่องมือเอกสารขั้นสูง แสดงเมื่อเปิดส่วนไทม์ไลน์ */}
      <div className="glass-panel" style={{ padding: 16, margin: "16px 0 24px", display: showTimeline ? "block" : "none" }}>
        <div>
          <div className="timeline-header-row">
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <GanttChart size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: "var(--fs-10)", fontWeight: "var(--fw-bold)" }}>ไทม์ไลน์</h2>
            </div>
            {/* 🐞 เคยมีสาขา `!showTimeline ?` ที่นี่เป็นปุ่ม "เปิดไทม์ไลน์" — ตายมาตลอด
                เพราะกล่องครอบทั้งกล่องเป็น display:none เมื่อไม่ได้อยู่แท็บไทม์ไลน์ */}
            <div className="project-detail-actions">
              <div className="project-detail-action-row">
              <span
                className="ui-badge"
                title={p.currentRev == null
                  ? "ยังไม่ออกเวอร์ชัน (ฉบับร่าง)"
                  : (p.revStale
                    ? `แก้ไขหลังออก Rev. ${p.currentRev} — เนื้อหาปัจจุบันต่างจากเวอร์ชันทางการ กรุณาออก Rev ใหม่เพื่อยืนยัน`
                    : `เวอร์ชันเอกสารล่าสุด: Rev. ${p.currentRev}`)}
                style={{ whiteSpace: "nowrap", ...(p.currentRev != null && p.revStale ? { borderColor: "var(--amber)", color: "var(--amber)" } : {}) }}
              >
                {p.currentRev == null ? "ฉบับร่าง" : (p.revStale ? `Rev. ${p.currentRev} • แก้แล้ว` : `Rev. ${p.currentRev}`)}
              </span>
              {canEdit && (
                <button onClick={openIssueRev} disabled={issuingRev} className="btn" style={{ whiteSpace: "nowrap" }} title={`freeze เอกสารทั้งชุดเป็นเวอร์ชันใหม่ — เลขรันอัตโนมัติเป็น Rev. ${nextRev} (จะขึ้นบนหน้าพิมพ์)`}>
                  <GitCommit size={14} /> {issuingRev ? "กำลังออก…" : `ออก Rev. ${nextRev}`}
                </button>
              )}
              {canCreateTaxRegistration && recommendTaxReg && (
                <button
                  onClick={createTaxRegistrationFromProject}
                  disabled={creatingTaxReg || !(p.projectProducts || []).length}
                  className="btn"
                  style={{ whiteSpace: "nowrap" }}
                  title="สร้างทะเบียนภาษี draft จาก FG หมวดสรรพสามิตในโครงการนี้"
                >
                  <ShieldCheck size={14} /> {creatingTaxReg ? "กำลังสร้าง..." : "สร้างทะเบียนภาษี"}
                </button>
              )}

              <button onClick={openRevisions} className="btn" style={{ whiteSpace: "nowrap" }} title="ดู/พิมพ์เวอร์ชันเอกสารที่เคยออก">
                <History size={14} /> ประวัติเวอร์ชัน
              </button>
              <button
                onClick={() => openGanttPrintWindow({ ...p, tasks, categoryFallback,
                  ...resolveAe(p.aeOwner, p.aeOwnerId),
                  projectProducts: enrichProducts(p.projectProducts),
                  // ถ้า live ถูกแก้หลังออก Rev (revStale) อย่าปั๊มเลข Rev ทางการทับเนื้อหาที่ต่าง —
                  // พิมพ์เป็น "ฉบับร่าง" (ไม่มีเลข/วันที่ Rev). พิมพ์เวอร์ชันทางการแท้ใช้ปุ่มในประวัติ.
                  rev: p.revStale ? null : p.currentRev,
                  revDate: p.revStale ? null : p.revisedAt })}
                className="btn btn-primary"
                style={{ whiteSpace: "nowrap" }}
                title="เปิดเอกสาร A4 สำหรับพิมพ์ / บันทึก PDF"
              >
                <Printer size={14} /> พิมพ์เอกสาร
              </button>
              </div>
              <div className="project-detail-action-row"><ViewSwitcher value={view} onChange={setView} modes={["list", "table", "document"]} /></div>
            </div>
          </div>
        </div>

        {/* โชว์ตั้งแต่มีดีลเดียว (มติผู้ใช้ 2026-07-18: "ปุ่มเลือกดีลหาย") — มีดีลเดียวก็ยัง
            มีตัวเลือก "งานกลางโครงการ" ให้สลับดูได้ */}
        {(p.deals || []).length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--fs-7)", fontWeight: "var(--fw-bold)" }}>ไทม์ไลน์ที่แสดง</div>
              <div style={{ fontSize: "var(--fs-4)", color: "var(--text-3)", marginTop: 2 }}>เลือกได้หลายดีล · ไม่เลือก = แสดงทั้งหมด</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <MultiSelectFilter label="ดีลที่แสดง" selected={dealFilters} onChange={setDealFilters} options={dealFilterOptions} />
            </div>
            {dealFilters.length > 0 && <span className="ui-badge" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>กำลังแสดง {tasks.length} ขั้นตอน</span>}
            {dealFilters.length > 1 && <span style={{ fontSize: "var(--fs-4)", color: "var(--text-3)" }}>เลือกเหลือ 1 ดีลก่อนเพิ่มขั้นตอนใหม่</span>}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", opacity: isLocked ? 0.6 : 1, filter: isLocked ? "grayscale(50%)" : "none", transition: "all var(--motion-slow)", pointerEvents: isLocked ? "none" : "auto" }}>
          <TimelineWorkspace
            tasks={tasks}
            requests={p.inquiries || []}
            stepBadgeFor={deliveryStepBadgeFor}
            canEdit={canEdit}
            canAdd={canAddTimelineTask}
            canReorder={canReorderTimeline}
            dealId={singleSelectedDeal(dealFilters)}
            projectId={p.id}
            view={view}
            onViewChange={setView}
            showHeading={false}
            showViewSwitcher={false}
            documentProject={{ ...p, tasks }}
            canEditProjectFields={canEdit}
            onUpdateProject={updateProject}
            timelineContext={{
              name: p.name,
              customerName: p.customerName,
              startDate: p.startDate,
              brand: p.metadata?.brand,
              status: getComputedStatus(p),
              statusLabel: getComputedStatus(p),
              statusColor: statusDotColor(getComputedStatus(p)),
            }}
            onChanged={load}
            onError={(message) => setToast({ kind: "error", msg: message })}
          />
        </div>

        {/* ของเข้า PM/RM (mig 0176) — อยู่ใต้ไทม์ไลน์โดยตั้งใจ ไม่แยกแท็บ:
            มันคือ "ข้างในของ milestone สั่งซื้อสารและบรรจุภัณฑ์" ที่เคยเป็นกล่องเปล่า
            45 วัน · ป้ายสรุปบนขั้นนั้นกับตารางนี้อ่านจากชุดข้อมูลเดียวกัน */}
        <div className="timeline-deliveries">
          <DeliveriesPanel
            projectId={p.id}
            deliveries={p.deliveries || []}
            salesOrders={p.deliverySalesOrders || []}
            deals={p.deals || []}
            canEdit={!!p.canEditDeliveries}
            onChanged={async (msg) => { await load(); if (msg) setToast({ kind: "success", msg }); }}
            onError={(message) => setToast({ kind: "error", msg: message })}
          />
        </div>

        </div>

      {/* ภาพรวม = สรุปเท่านั้น: KPI เงิน + ตารางดีล (ProjectDealsHub) + การ์ดไทม์ไลน์
          ของแท็บอื่นไม่มาต่อท้ายอีกแล้ว — ดูเหตุผลที่ประกาศ state `tab` ด้านบน */}
      {tab === "overview" && (
        <>
          <ProjectDealsHub project={p} onChanged={load} />
          {/* การ์ดเมนูไทม์ไลน์ — ทางเข้าแท็บไทม์ไลน์ + ความคืบหน้ารวม
              ⚠️ นับจาก allTasks (ทั้งโครงการ) ไม่ใช่ `tasks` ที่ผ่านตัวกรอง — การ์ดนี้
              ไม่มีตัวเลือกกรองอยู่ด้วยแล้ว ตัวเลขที่ขยับตาม state ที่มองไม่เห็นบนจอนี้
              จะอ่านเป็น "โครงการมีแค่นี้" · ตัวเลขตามตัวกรองอยู่ในแท็บไทม์ไลน์ */}
          <div
            className="glass-panel"
            style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
          >
            <span style={{ background: "var(--accent)", color: "var(--accent-fg)", padding: 8, borderRadius: 10, display: "flex", flexShrink: 0 }}>
              <GanttChart size={18} />
            </span>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)" }}>ไทม์ไลน์โครงการ</div>
              <div style={{ fontSize: "var(--fs-6)", color: "var(--text-3)", marginTop: 2 }}>
                {(() => {
                  const doing = allTasks.filter((t) => t.status === "In Progress").map((t) => t.name);
                  return doing.length ? `กำลังทำ: ${doing.slice(0, 2).join(", ")}${doing.length > 2 ? ` +${doing.length - 2}` : ""}` : "ขั้นตอนทั้งหมดของทุกดีลรวมในผืนเดียว";
                })()}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, display: "flex", alignItems: "center", gap: 10 }}>
              {(() => {
                const total = allTasks.length;
                const done = allTasks.filter((t) => t.status === "Completed").length;
                return (
                  <>
                    <div className="progress" style={{ flex: 1 }} role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="ความคืบหน้าไทม์ไลน์">
                      <span className={total && done === total ? "done" : undefined} style={{ width: total ? `${Math.round((done / total) * 100)}%` : 0 }} />
                    </div>
                    <span className="mono tabular-nums" style={{ fontSize: "var(--fs-7)", color: "var(--text-2)", whiteSpace: "nowrap" }}>{done}/{total} ขั้นตอน</span>
                  </>
                );
              })()}
            </div>
            {/* ตัวเลือก "ดีลที่แสดง" ของการ์ดนี้ถูกถอดออก (มติผู้ใช้ 2026-08-05) — ตัวกรอง
                ตัวเดียวกันมีให้เลือกอยู่แล้วในแท็บไทม์ไลน์และหัวตารางงาน ซึ่งเป็นที่ที่
                *เห็นผลทันที* · ตรงนี้กรองแล้วมีผลแค่ตัวเลขบนแถบเดียวกันนี้ */}
            <div className="project-timeline-card-actions">
              <button type="button" className="btn btn-primary" onClick={() => switchTab("timeline")} style={{ whiteSpace: "nowrap" }}>
                <GanttChart size={14} /> เปิดไทม์ไลน์
              </button>
            </div>
          </div>
        </>
      )}

      {/* เอกสาร = ใบเสนอราคา + Sale Order (การ์ดเดิม) + **ไฟล์รวมของทุกดีล** (ม-88)
          — "RD แนบเอกสาร → เอกสารไปสู่แท็บเอกสารในโครงการ/ดีลนั้นด้วย" · แผงเดียวกับ
          แท็บเอกสารบนหน้าดีล แค่โหมดโครงการรวมทุกดีลและบอกว่าแถวไหนของดีลไหน */}
      {tab === "documents" && (
        <>
          <ProjectQuotationsCard project={p} />
          {/* ใช้ WorkspaceSection ของกลาง — inline style คือชั้นเก่าที่ ratchet
              audit:ui ห้ามเพิ่ม (เพดานลงได้อย่างเดียว) */}
          <SaSection
            icon={<FileText size={17} />}
            title="ไฟล์เอกสารของโครงการ"
            subtitle="รวมจากทุกดีลในโครงการ — ไฟล์จากคำร้อง · ไฟล์แนบ · ฉบับที่ออกจริง · ของที่ยังรอ"
          >
            <EntityDocumentsPanel projectId={p.id} />
          </SaSection>
        </>
      )}

      {tab === "tasks" && (
        <section className="glass-panel" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <ListTodo size={18} />
            <div>
              <h2 style={{ margin: 0, fontSize: "var(--fs-10)" }}>งานของโครงการ</h2>
              <div style={{ marginTop: 2, fontSize: "var(--fs-5)", color: "var(--text-3)" }}>ดึงงานจาก /sa/tasks ตามดีลที่ผูกกับโครงการ</div>
            </div>
            <span className="ui-badge" style={{ color: "var(--text-2)" }}>{completedPersonalTasks}/{shownPersonalTasks.length} เสร็จ</span>
            <div style={{ marginLeft: "auto" }}>
              {dealFilterOptions.length > 1 && <MultiSelectFilter label="ดีลที่แสดง" selected={dealFilters} onChange={setDealFilters} options={dealFilterOptions} />}
            </div>
            <Link className="btn ghost sm" href={dealFilters.length === 1 ? `/sa/tasks?dealId=${dealFilters[0]}` : "/sa/tasks"}><ExternalLink size={13} /> เปิดหน้างาน</Link>
          </div>
          {shownPersonalTasks.length ? (
            /* ตารางกลางล้วน — คลาสเก่า `.premium-table` บังคับ nowrap ทุกเซลล์ ชื่องาน
               กับหมายเหตุยาว ๆ จึงดันตารางกว้างเกินการ์ดแล้วคอลัมน์ท้ายถูกตัด */
            <div>
              <TableScroll surface="embedded"><table>
                <thead><tr><th>งาน</th><th>ดีล</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th></tr></thead>
                <tbody>{shownPersonalTasks.map((task) => {
                  const deal = (p.deals || []).find((item) => item.id === task.dealId);
                  const assignee = users.find((user) => user.id === (task.assigneeId || task.ownerId));
                  return <tr key={task.id} className="premium-row">
                    <td style={{ fontWeight: "var(--fw-bold)" }}>{task.title}{task.note && <ReadableText text={task.note} lines={2} style={{ color: "var(--text-3)", fontSize: "var(--fs-5)", fontWeight: "var(--fw-normal)", marginTop: 2 }} />}</td>
                    <td>{deal ? <Link className="linklike" href={`/sales-planning/deals/${deal.id}`}>{deal.title}</Link> : <span style={{ color: "var(--text-3)" }}>งานเดิมของโครงการ</span>}</td>
                    <td><span className="status-pill dot" style={{ "--dot": taskStatusColor(task.status) }}>{TASK_STATUS_META[task.status]?.full || task.status}</span></td>
                    <td>{assignee?.name || task.assigneeName || task.ownerName || "-"}</td>
                    <td>{task.dueDate || "-"}</td>
                  </tr>;
                })}</tbody>
              </table></TableScroll>
            </div>
          ) : <EmptyState icon={ListTodo}>ยังไม่มีงานจากดีลที่เลือก</EmptyState>}
        </section>
      )}

      {/* คำร้องข้ามฝ่ายอยู่ท้ายแท็บ "งาน" ไม่ใช่แท็บของตัวเอง (มติผู้ใช้ 2026-08-05) —
          ทั้งสองตอบคำถามเดียวกันว่า "ตอนนี้ค้างใครอยู่" และถูกเปิดพร้อมกันเสมอ */}
      {tab === "tasks" && <RequestListCard requests={p.inquiries || []} title="คำร้องข้ามฝ่ายของโครงการและดีล" />}

      {/* แบนเนอร์แดง "ยกเลิกแล้ว" + ปุ่มกู้คืน ย้ายไปการ์ด Control แล้ว — ข้อความไปอยู่
          notices ส่วนปุ่มเป็น transition `restore_from_dropped` (สิทธิ์เดิม senior_ae ขึ้นไป)
          แถบปุ่มท้ายหน้า (ระงับ / ยกเลิก / ดึงกลับ) ก็ย้ายไปการ์ดเดียวกัน
          🐞 ของเดิมมันอยู่ใน `{showTimeline && …}` — คนที่อยู่แท็บภาพรวมกดไม่ได้เลย
          ต้องเข้าไทม์ไลน์ก่อนถึงจะเห็นปุ่ม

          ที่เคยอยู่ตรงนี้อีกก้อนคือ ProjectDocumentView / table view / list view รุ่นเก่า
          ห่อด้วย `{false && …}` ไว้ตอนย้ายไป TimelineWorkspace — ลบทิ้งแล้ว
          ทั้งสามโหมดยังมีอยู่ ไปดูที่ TimelineWorkspace (รับ view/onViewChange ด้านบน) */}

      {/* ฟีดความเคลื่อนไหวรวมทุกดีล — แท็บของตัวเอง (เดิมพ่วงท้ายภาพรวมด้วย) */}
      {tab === "activities" && <ProjectActivityFeed project={p} onChanged={load} />}

      </DetailPageLayout>

      {/* โมดัล เพิ่ม/แก้ ขั้นตอน ของหน้านี้ถูกลบแล้ว — ปุ่มที่เปิดมันอยู่ใน table/list view
         รุ่นเก่า พอวิวนั้นหายไปโมดัลก็ไม่มีใครเปิดได้อีก (showAddTask/showEditTask ค้าง
         false ตลอด) · ตัวจริงอยู่ที่ TimelineWorkspace ซึ่งถือ StepFormFields ของตัวเอง */}

      <Modal open={showIssueRev} onClose={() => !issuingRev && setShowIssueRev(false)} title="ออกเวอร์ชันเอกสารใหม่ (Revise)" size="sm">
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
            <GitCommit size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span>จะ freeze เอกสารชุดปัจจุบันทั้งหมด และรันเลขอัตโนมัติเป็น <b className="ui-badge">Rev. {nextRev}</b></span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
            หมายเหตุการแก้ (ไม่บังคับ)
            <Textarea
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="เช่น ปรับวันส่งมอบตาม PO ใหม่"
              style={{ resize: "vertical", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: "var(--fs-7)", fontFamily: "inherit" }}
            />
          </label>
          {revError && <div style={{ fontSize: "var(--fs-5)", color: "var(--red)" }}>{revError}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "0 20px 16px" }}>
          <button className="btn" disabled={issuingRev} onClick={() => setShowIssueRev(false)}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={issuingRev} onClick={confirmIssueRev}>
            <GitCommit size={14} /> {issuingRev ? "กำลังออก…" : `ออก Rev. ${nextRev}`}
          </button>
        </div>
      </Modal>

      <Modal open={showRevisions} onClose={() => setShowRevisions(false)} title="ประวัติเวอร์ชัน (Rev)" size="md">
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", marginBottom: "10px" }}>
            <b style={{ color: "var(--accent)" }}>Rev.</b> = เวอร์ชันทางการ (เก็บถาวร) — เป็นจุดเดียวที่ย้อนกลับได้. กด “ออก Rev” เพื่อ freeze เอกสารชุดปัจจุบันเป็นเวอร์ชันใหม่
          </div>
          {revisions.length === 0 ? (
            <div style={{ fontSize: "var(--fs-7)", color: "var(--text-3)", textAlign: "center", padding: "24px 0" }}>
              ยังไม่มีเวอร์ชัน — กด “ออก Rev” เพื่อสร้างจุดย้อนแรก
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {revisions.map((r) => {
                const isRev = r.kind !== "save";
                return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--panel)" }}>
                  <span className="ui-badge" style={{ flexShrink: 0, ...(isRev ? { borderColor: "var(--accent)", color: "var(--accent)" } : { color: "var(--text-3)" }) }}>
                    {isRev ? `Rev. ${r.revNo}` : "บันทึก"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "var(--fs-5)", color: "var(--text-2)" }}>
                      {r.createdAt ? fmtDateTime(r.createdAt) : "-"} · {r.createdByName || "-"}
                    </div>
                    {r.note && <ReadableText text={r.note} lines={4} style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }} />}
                  </div>
                  {canEdit && (
                    <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => restoreSnapshot(r)} title="ย้อนงานทั้งชุดกลับไปเท่ากับจุดนี้">
                      <RotateCcw size={13} /> ย้อนกลับ
                    </button>
                  )}
                  {isRev && (
                    <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => printRevision(r.revNo)} title="เปิดเอกสารเวอร์ชันนี้เพื่อพิมพ์/บันทึก PDF">
                      <Printer size={13} /> พิมพ์
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />

      <ConfirmDialog
        open={!!confirmState}
        onClose={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || "ยืนยัน"}
        danger={confirmState?.danger ?? true}
      />

      {/* กล่องกรอกเหตุผลของ ตีกลับ / เปิดใหม่ / ยกเลิกโครงการ ย้ายไปเป็น TransitionDialog
         ของ RecordControlCard แล้ว — reasonPolicy ประกาศที่ projectLifecycle ที่เดียว */}

      {showEditProject && (
        <SalesProjectCreateModal
          open={showEditProject}
          onClose={() => setShowEditProject(false)}
          editingId={p.id}
          initialData={p}
          onSuccess={(data) => {
            // บั๊ก D: หลังแก้โครงการ (อาจ resync ขั้นตอนสรรพสามิตใน DB) ต้อง reload
            // ทั้งก้อน — PATCH คืนแค่แถว project ไม่มี tasks ที่เปลี่ยน
            setShowEditProject(false);
            // เชื่อมสินค้า (FG) ไม่สำเร็จ → เตือน (PATCH ลบของเดิมไปแล้ว ต้องผูกใหม่)
            if (data?.productWarning) setToast({ kind: "error", msg: data.productWarning });
            load();
          }}
          customers={customers}
          categories={categories}
        />
      )}

      {/* PredecessorPopover ของหน้านี้ถูกลบแล้ว — ที่เปิดมันคือช่อง "ขึ้นกับ" ของ table view
         รุ่นเก่า (depPopover ค้าง null ตลอดหลังวิวนั้นหาย) · แก้ predecessors ตอนนี้ทำผ่าน
         StepFormFields ใน TimelineWorkspace */}

      {/* โมดัล "ขออนุมัติปิดโครงการ" (เลือกชนิดการปิด + เหตุผล) ย้ายไปเป็น transition
         `request_close` ของ projectLifecycle — ช่อง closeType ประกาศเป็น fields ในนั้น */}

      {/* แถบ "ยืนยันการเปลี่ยนแปลง" ของหน้านี้ถูกลบแล้ว — ตัวที่ผู้ใช้เห็นมาจาก
         TimelineWorkspace (ดูคอมเมนต์เฟส 1 ด้านบน) */}
    </SaPageShell>
  );
}
