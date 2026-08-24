"use client";
// รายละเอียดคำร้อง (mig 0158 → 0219)
//
// ผู้ขอ: ส่งคำร้อง / ยกเลิก / ลบร่าง · เห็นสถานะทุกขั้นว่าใครรับเรื่องแล้ว
// RD/PC: รับเรื่อง → ตอบราคาราย "ชั้นจำนวน" ที่ผู้ขอระบุ หรือกด "ตอบไม่ได้" พร้อมเหตุผล
// ราคาที่ตอบ = rev ใหม่ของวัสดุตัวเดิมในทะเบียน และเติมกลับบรรทัดในใบขอราคาผลิตให้เอง
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Building2, CalendarClock, FileText, FolderKanban, Handshake, Hash, History, MessageCircleQuestion, Paperclip, Pencil, Plus, Printer, Send, Ban, Check, CheckCheck, Trash2, Undo2, UserPlus,
} from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PersonSelect from "@/components/ui/PersonSelect";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { personFullName } from "@/lib/ui/personName";
import { deptQueueHref } from "@/lib/requests/modules";
import { requestAssignee } from "@/lib/requests/assign";
import Toast from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
import RichText from "@/components/ui/RichText";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { REQUEST_EDITABLE_STATUSES } from "@/lib/requests/requestEdit";
import { lineFormRows } from "@/lib/requests/requestLineEdit";
import { cachedFetchJson } from "@/lib/apiCache";
import UpdateThread from "@/components/updates/UpdateThread";
import {
  DocumentControlCard, WorkflowRail,
} from "@/components/ui/DocumentControlPanel";
import SalesDetailOverview from "@/components/ui/DetailOverview";
import RequestForm, { emptyRequestForm } from "@/components/requests/RequestForm";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { useDepartment, useRole } from "@/lib/roleContext";
import { fmtDate, naText, NA } from "@/lib/format";
import { canAnswerRequestsFor } from "@/lib/permissions";
import { requestRailSteps } from "@/lib/requests/requestRail";
import { requestHeaderFacts, requestHeaderPeople } from "@/lib/requests/headerFacts";
import { briefBoard, briefBoardTotals } from "@/lib/requests/briefBoard";
import { bulkReadyRows, formulaDevBoard, formulaDevTotals } from "@/lib/requests/formulaDevBoard";
import { documentBoard, documentTotals } from "@/lib/requests/documentBoard";
import { requestHasPdr } from "@/lib/master/requestTypes";
import { pdrValuesFrom } from "@/lib/requests/pdrFields";
import { pdrTargetValuesFrom } from "@/lib/requests/pdrTargets";
import {
  canEditPdrRefManual, issuesPdrRefNoOnAcknowledge, pdrRefManualError, pdrRefMode,
  pdrRefNoError,
} from "@/lib/requests/pdrRefNo";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import {
  REQUEST_OPEN_STATUSES,
  acknowledgeRequestError,
  answerRequestError, closeOutcomeError, closeRequestError, requestNeedsOutcome, requestProgress,
} from "@/lib/deptRequests";
import { requestAwaitingDue, requestStatusView } from "@/lib/requests/statuses";
import { requestSideLabel, requestSideText } from "@/lib/requests/replyTurn";
import { requestClosure, reopenRequestError } from "@/lib/requests/closure";
import { SO_RECONCILE_TONE, soReconcile, soReconcileText } from "@/lib/requests/soReconcile";
import { hopLabel, hopValuesError, hopLabelFor } from "@/lib/requests/hops";
import { isDocLineKind } from "@/lib/requests/docTypes";
import { deliveryRowLabel, normalizeFormulaDelivery } from "@/lib/requests/delivery";
import FormulaForm, { emptyFormulaForm } from "@/components/database/FormulaForm";
import { detailForKind, panelForKind } from "@/components/requests/details";
import Input from "@/components/ui/Input";
import ScentDeliveryFields, {
  codeConflict, emptyDeliveryRow, reworkDeliveryRow,
} from "@/components/requests/ScentDeliveryFields";
import Tabs from "@/components/ui/Tabs";
import { reworkSlots } from "@/lib/requests/rework";
import DateInput from "@/components/ui/DateInput";
import { businessDate } from "@/lib/businessDate";
import {
  lineShapeForKind, requestDeliversRows, requestHasItems, requestKindLabel,
} from "@/lib/master/requestTypes";
import { SCENT_STATUS_LABELS, isScentRegistrar } from "@/lib/master/scents";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import styles from "./page.module.css";
import { normalizeDocumentControlActions, workflowStepsFromIndex } from "@/lib/documentControlModel";
import Textarea from "@/components/ui/Textarea";

const STATUS_TONE = {
  draft: "var(--text-3)",
  pending: "var(--amber)",
  acknowledged: "var(--blue)",
  answered: "var(--green)",
  closed: "var(--text-3)",
  cancelled: "var(--text-3)",
};
// ⚠️ เดิมมี `isFlowRow` แยก **แถววัสดุ** (ตอบราคาจบในที่) ออกจากแถวที่เดินราง
// ห้าก้าว · บรรทัดวัสดุถูกถอดใน mig 0219 (ม-28) ⇒ ทุกแถวที่เหลือเดินรางทั้งหมด
// ไม่มีสาขาที่สองอีกแล้ว

// ป้ายช่องวันที่ต้องพูดถึงก้าวนั้นตรง ๆ — "วันที่" เฉย ๆ ทำให้คนกรอกวันนี้ทุกครั้ง
// ทั้งที่หลายก้าวถูกกดย้อนหลังเป็นปกติ (ของส่งไปเมื่อวาน เพิ่งมาบันทึกเช้านี้)
// ⚠️ ก้าวส่ง (ready) ไม่มีช่องวันแล้ว (ม-92) — ระบบประทับวันที่กดให้เอง
const HOP_DATE_LABEL = {
  ack: "วันที่รับเรื่อง",
  pickup: "วันที่รับของ",
  send: "วันที่ส่งให้ลูกค้า",
  outcome: "วันที่ลูกค้าตอบ",
  receive: "วันที่ได้รับเอกสาร",
  // refuse ไม่มีช่องวัน — เวลาอยู่บนเหตุการณ์ในเธรด · เหลือแต่เหตุผล (บังคับ)
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);
  // break-glass = role admin เท่านั้น (เข้มกว่า isSuperuser — ae_supervisor เป็น
  // superuser แต่บังคับลบไม่ได้ ดู lib/forceDelete.js) · ตรงกับทะเบียนกลิ่น/สูตร
  const isAdmin = role === "admin";

  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // ก้าวของแถว — { item, hop, outcome, at, dueAt, confirmedQty, note }
  const [hopDraft, setHopDraft] = useState(null);
  /* ทะเบียนที่ **ฟอร์มแก้** ต้องใช้ — ช่อง "อ้างอิงเพิ่ม" (QT/SO/FG) ของหัวข้อที่มี
     ⚠️ **โหลดตอนกดแก้เท่านั้น** — ใบส่วนใหญ่ถูกเปิดอ่านอย่างเดียว การลากทะเบียน
     ใบเสนอราคา/ใบสั่งขาย/สินค้าทั้งชุดมาทุกครั้งที่เปิดใบ คือ 3 query ที่ไม่ได้ใช้
     ⚠️ โหลดครั้งเดียวต่อการเปิดหน้า (ธง `loaded`) — กดแก้/ยกเลิกสลับไปมาไม่ยิงซ้ำ */
  const [editRefs, setEditRefs] = useState({
    loaded: false, quotations: [], salesOrders: [], products: [],
  });

  /* ⭐ **โหมดแก้มีสถานะเดียว** (มติผู้ใช้ 2026-08-24) — เดิมแยกเป็น `editDraft`
     (หัวใบ) กับ `pdrDraft` (แบบฟอร์ม) คนละก้อน คนละที่วาง ⇒ หน้าแก้ไม่เหมือนหน้าสร้าง
     เลยสักหัวข้อ · ตอนนี้เป็นค่าของ `RequestForm` ก้อนเดียวกับตอนเปิดใบ
     ⚠️ สิทธิ์ยัง **สลับมือคนละจังหวะ** อยู่ (หัวใบ = ผู้ขอ ถึงก่อนรับเรื่อง ·
     PDR = ฝ่ายปลายทาง หลังรับเรื่อง) ⇒ ก้อนเดียวแต่ยิงสอง action ตามเดิม
     และเทาส่วนที่คนนี้แก้ไม่ได้ผ่าน `disabled`/`pdrDisabled` */
  /* ทะเบียนหมวดสินค้า — ฟอร์ม PDR (โหมดแก้) ใช้เลือก "ประเภทสินค้า" หลายรายการ (0227)
     ⚠️ โหลดเสมอ ไม่รอให้กดแก้ — โหลดตอนกดจะได้ดรอปดาวน์ว่างในวินาทีแรก */
  const [productTypes, setProductTypes] = useState([]);
  useEffect(() => {
    cachedFetchJson("/api/product-types").then((d) => setProductTypes(d || [])).catch(() => {});
  }, []);
  /* ⭐ **แจ้งกำหนดส่ง — ก้าวของตัวเอง** (มติผู้ใช้ 2026-08-19) · `null` = ปิดโมดัล
     ⚠️ ไม่ใช่ช่องในโมดัลรับเรื่องอีกแล้ว — รับเรื่องคือการตัดรอบ ส่วนวันที่รับปาก
     ฝ่ายกดทีหลังได้เมื่อรู้จริง (รอวัตถุดิบ · รอฝ่ายอื่น) */
  const [commitDue, setCommitDue] = useState(null);
  // เลื่อนวันกำหนดส่งหลังรับเรื่องแล้ว — { date, reason }
  const [reschedule, setReschedule] = useState(null);
  // ช่วงเปลี่ยนผ่าน: RD กรอกเลขที่เอกสารเอง (mig 0272) — null = ปิดโมดัล
  const [refDraft, setRefDraft] = useState(null);
  // "ยังไม่จบ" — ถอนตราปิด · { reason } (บังคับ)
  const [reopen, setReopen] = useState(null);
  /* ⭐ มอบหมายผู้รับผิดชอบ (mig 0230) — `null` = ปิดโมดัล · สตริง = id ที่เลือกอยู่
     (สตริงว่าง = "ยังไม่ระบุ" ซึ่งแปลว่าถอนการมอบหมาย) */
  const [assign, setAssign] = useState(null);
  /* ⚠️ ชื่อ `directory` ไม่ใช่ `people` — `people` ถูกใช้ไปแล้วกับ **แถวคนบนหัวใบ**
     (`requestHeaderPeople`) ซึ่งเป็นคนละเรื่องกันสิ้นเชิง
     ⚠️ `usePeopleDirectory` รวมคนที่ปิดบัญชีแล้วด้วย (ใบเก่าต้องอ่านชื่อออก) —
     ตัวเลือกในโมดัลจึงกรองเฉพาะคนที่ยังใช้งานอยู่ ไม่งั้นมอบงานให้คนที่ลาออกได้ */
  const directory = usePeopleDirectory();
  // ใบนี้อยู่ที่ใคร — ผู้รับผิดชอบก่อน แล้วถอยไปคนที่กดรับเรื่อง (กฎเดียวกับคิว)
  const assignee = requestAssignee(req || {});
  const activePeople = useMemo(() => directory.filter((u) => !u.disabled), [directory]);
  // แก้ข้อมูลคำร้อง — ช่องต้องตรงกับ REQUEST_EDITABLE_FIELDS
  const [editDraft, setEditDraft] = useState(null);
  const [confirm, setConfirm] = useState(null);     // { kind }
  const [cancelReason, setCancelReason] = useState("");
  // ตีกลับ — ผู้รับเรื่องส่งคืนผู้ยื่นพร้อมเหตุผล (mig 0209)
  const [bounceReason, setBounceReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  // ผลลัพธ์ตอนปิดบรีฟกลิ่น — { mode: 'link'|'create'|'none', scentId, scentName, code }
  const [outcome, setOutcome] = useState(null);
  const [scentOptions, setScentOptions] = useState([]);
  // ส่งของ (พัฒนากลิ่น) — [{ scent, spec, briefId, targetItemId, _files }]
  const [delivery, setDelivery] = useState(null);
  /* ⭐ **หนึ่ง direction = หนึ่งแท็บ** (มติผู้ใช้ 2026-08-19 · แบบเดียวกับโมดัลสร้างดีล)
     — เดิมกางทุก direction เรียงกันแล้วมีปุ่ม "เพิ่มอีก direction" อยู่ล่างสุด */
  const [deliveryTab, setDeliveryTab] = useState(0);
  // ⭐ โมดัลรวบส่งของของพัฒนาสูตร (ช่องว่างข้อ 3) — { rows: [{ item, formula, error }] }
  // `formula` = ค่าฟอร์มทะเบียนสูตรของแถวนั้น (ฟอร์มเดียวกับหน้าทะเบียน · 2026-08-19)
  const [bulkReady, setBulkReady] = useState(null);
  // ⚠️ ทะเบียนกลิ่น **ทั้งก้อน** ไม่ใช่เฉพาะของลูกค้ารายนี้ — รหัสกลิ่นห้ามซ้ำทั้ง
  // บริษัท (scents_code_uk เป็น unique ทั้งตาราง) ⇒ เตือนซ้ำต้องเทียบกับทุกแถว
  const [allScents, setAllScents] = useState([]);
  // ใส่ราคาแถวสายพัฒนา — { item, price, validUntil, note }
  const [pricing, setPricing] = useState(null);
  /* ⭐ ทะเบียนที่ **ฟอร์มส่งงาน** ต้องใช้ (มติผู้ใช้ 2026-08-19) — ทั้งสายสูตรและสาย
     กลิ่นใช้ฟอร์มตัวเดียวกับหน้าทะเบียน ⇒ ต้องมีของครบชุดเหมือนกัน
     · สายสูตร: ลูกค้า · กลิ่น · สูตร (สายพันธุ์)   · สายกลิ่น: ลูกค้า (กลิ่นใช้ `allScents`)
     ⚠️ โหลดเฉพาะใบที่มีฟอร์มนี้จริง — ใบสายเอกสาร/ราคาไม่มีวันเปิด
     ⚠️ โหลดตั้งแต่เปิดใบ ไม่ใช่ตอนกดส่ง — โหลดตอนกดจะได้ฟอร์มที่ช่องเลือกว่างเปล่า
     ในวินาทีแรก (โรคเดียวกับ productTypes ข้างบน) */
  const [registry, setRegistry] = useState({ customers: [], scents: [], formulas: [] });
  const hasFormulaRows = (req?.items || []).some((i) => i.lineKind === "product_dev");
  const needsCustomers = hasFormulaRows || req?.kind === "scent_dev";
  useEffect(() => {
    if (!needsCustomers) return;
    const get = (url) => fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => (Array.isArray(d) ? d : []))
      .catch(() => []);
    Promise.all([
      get("/api/customers"),
      // กลิ่น/สูตรใช้เฉพาะฟอร์มสูตร — ใบสายกลิ่นไม่ต้องลากทั้งทะเบียนมาเปล่า ๆ
      hasFormulaRows ? get("/api/master/scents") : [],
      hasFormulaRows ? get("/api/master/formulas") : [],
    ]).then(([customers, scents, formulas]) => setRegistry({ customers, scents, formulas }));
  }, [needsCustomers, hasFormulaRows]);
  /* ค่าตั้งต้นของฟอร์มส่งงาน — ลูกค้า/กลิ่น/หมวด เป็นของที่ **แถวรู้อยู่แล้ว** ⇒ เติมให้
     แล้วล็อกไว้ (ดู prop `locked` ของ FormulaForm) · ลูกค้ายกจากใบ ไม่ใช่จากกลิ่น
     เพื่อให้ตรงกับที่ server ตัดสิน (route ของแถว) */
  const formulaDraftFor = useCallback((item) => ({
    ...emptyFormulaForm(),
    customerId: req?.customerId || "",
    scentId: item?.scentId || "",
    categoryCode: item?.categoryCode || "",
  }), [req?.customerId]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch(`/api/sa/requests/${id}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setReq(d);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // กลิ่นของลูกค้ารายนี้ — ใช้ในโมดัลปิดบรีฟ (มติ 9: กลิ่นข้ามลูกค้าไม่ได้ จึงกรอง
  // ที่ต้นทางเลย ไม่ปล่อยให้เลือกผิดแล้วค่อยให้ server ตีกลับ)
  useEffect(() => {
    if (!req?.customerId || !requestNeedsOutcome(req?.kind)) { setScentOptions([]); return; }
    fetch(`/api/master/scents?customerId=${encodeURIComponent(req.customerId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setScentOptions(Array.isArray(d) ? d : []))
      .catch(() => setScentOptions([]));
  }, [req?.customerId, req?.kind]);

  /* โหลดทะเบียนของช่อง "อ้างอิงเพิ่ม" ครั้งแรกที่เปิดโหมดแก้
     ⚠️ ล้มแล้วไม่โยน — ช่องอ้างอิงเป็นของ "ถ้ามี" · ดรอปดาวน์ว่างดีกว่าฟอร์มไม่ขึ้น */
  useEffect(() => {
    if (!editDraft || editRefs.loaded) return;
    const get = (url) => fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => (Array.isArray(d) ? d : []))
      .catch(() => []);
    Promise.all([
      get("/api/sales-planning/quotations"),
      get("/api/sales-planning/sales-orders"),
      get("/api/products"),
    ]).then(([quotations, salesOrders, products]) => setEditRefs({
      loaded: true, quotations, salesOrders, products,
    }));
  }, [editDraft, editRefs.loaded]);

  useEffect(() => {
    if (req?.kind !== "scent_dev") { setAllScents([]); return; }
    fetch("/api/master/scents", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setAllScents(Array.isArray(d) ? d : []))
      .catch(() => setAllScents([]));
  }, [req?.kind]);

  const call = useCallback(async (path, init, okMsg) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/requests/${id}${path}`, {
        headers: { "Content-Type": "application/json" }, ...init,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      // okMsg = null ⇒ เงียบไว้ (ขั้นกลางของงานที่ยิงหลายครั้ง — ทักครั้งเดียวตอนจบ)
      if (okMsg) setToast({ kind: "success", msg: okMsg });
      await load();
      return true;
    } catch (e) { setToast({ kind: "error", msg: e.message }); return false; }
    finally { setSaving(false); }
  }, [id, load]);

  // กลับไปแท็บที่คนคนนี้ใช้งานจริง — ผู้ตอบกลับเข้าคิวของฝ่ายที่คำร้องนี้ถามไป,
  // ผู้ขอกลับไปดูคำร้องของตัวเอง (ชื่อแท็บตรงกับที่ /sa/requests รับผ่าน ?tab=)
  /* 🐞 **ฝ่ายที่มีโมดูลของตัวเองต้องกลับเข้าบ้านตัวเอง** (มติ 2026-08-22 · กฎข้อ 9)
     ลิงก์เดิมชี้ `/requests?tab=queue-RD` ซึ่งเป็นชื่อแท็บยุคก่อนมี `/rd/requests`
     ⇒ RD กด "กลับ" แล้วไปโผล่คิวรวมที่ **ไม่มีแถวของเขาเหลือแล้ว** (ฝ่ายที่มีโมดูล
     ถูกตัดออกจากคิวรวมตั้งแต่ ม-29) · บั๊กนี้มีมาก่อนกฎข้อ 9 แต่เห็นชัดตอนนี้เพราะ
     เปลือกไม่สลับให้รู้ตัวอีกแล้ว
     ⚠️ ต้องดูที่ **ฝ่ายของคนกด** ไม่ใช่ฝ่ายบนใบ — AE Supervisor เปิดใบของ RD ได้
     (break-glass) ถ้าส่งเขาไป `/rd/requests` จะโดน proxy เด้งกลับ `/home` เงียบ ๆ */
  const backTab = req?._mine === false ? `queue-${req.dept}` : "mine";
  const ownQueue = req?.dept === department ? deptQueueHref(department) : null;
  const back = { href: ownQueue || `/requests?tab=${backTab}`, label: "กลับรายการคำร้อง" };
  if (loading) return <Workspace hideHeader back={back}><SkeletonRows rows={5} /></Workspace>;
  if (loadError || !req) {
    return (
      <Workspace hideHeader back={back}>
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError || "ไม่พบคำร้อง"}</div>
      </Workspace>
    );
  }

  // ตัวนี้คุม `canDept` ของรางห้าก้าว ⇒ ถามผิดคำถามแปลว่าฝ่ายเจ้าของเรื่อง
  // เห็นแต่ป้าย "รอฝ่ายปลายทางรับเรื่อง" และกดอะไรไม่ได้เลยทั้งใบ
  const owner = canAnswerRequestsFor(me, req.dept);
  const showPdr = requestHasPdr(req.kind);
  // เลือกเนื้อของหน้าจากทะเบียน ไม่ใช่ `kind === '...'` กลางหน้า (ม-34)
  const KindDetail = detailForKind(req.kind);
  // การ์ด panel รายหัวข้อ (ม-94) — null = มีแค่การ์ด control กลาง + การ์ดบริบท
  const KindPanel = panelForKind(req.kind);
  // ⭐ **แถบสรุปของใบ** (ม็อกอัพ ส่วน 06–07) — เปิดใบมาแล้วรู้สถานการณ์ทันที
  // โดยไม่ต้องไล่อ่านทีละแถว
  //
  // 🐞 `soReconcile` มีอยู่แล้วแต่ถูกขังใน `{hasItems && …}` ⇒ **ไม่เคยแสดงใน
  // `scent_dev` ซึ่งเป็นหัวข้อที่มันถูกสร้างมาเพื่อ** (hasItems: false ตอนเปิด เพราะ
  // RD สร้างแถวตอนส่ง)
  //
  // ⭐ **ประกอบครั้งเดียว ใช้สองที่** — แถบตัวเลขกับตารางสรุปอ่านจาก `board` ก้อนเดียว
  // ⇒ ขัดกันไม่ได้เชิงโครงสร้าง · เดิมแถบตัวเลขใช้ `scentBriefSummary` ซึ่งนับจาก
  // `items` ที่มี briefId เท่านั้น ⇒ direction ที่ยังไม่ผูกบรีฟหายจากยอดรวมเงียบ ๆ
  const board = briefBoard(req.briefs || [], req.items || []);
  // ⚠️ ประกอบทั้งสองแบบไว้เสมอ แล้วให้ component ของหัวข้อเลือกใช้ — ประกอบใน
  // เงื่อนไขเมื่อไร hook order จะเปลี่ยนตามหัวข้อ ซึ่ง React ห้าม
  const formulaBoard = formulaDevBoard(req.items || []);
  const formulaTotals = formulaDevTotals(formulaBoard);
  const docBoard = documentBoard(req.items || []);
  const docTotals = documentTotals(docBoard);
  const briefSummary = briefBoardTotals(board);
  const canAnswer = owner && REQUEST_OPEN_STATUSES.includes(req.status);
  const progress = requestProgress(req.items || []);
  // ⚠️ ชนิดที่ไม่มีบรรทัด (สอบถาม/พัฒนากลิ่น/ติดตามของเข้า
  // ชนิด) มี progress.complete = false เสมอเพราะ total = 0 · เดิมเงื่อนไขปิดใบอ่านจาก
  // ตัวนี้ตรง ๆ ทำให้ **ปุ่มปิดไม่เคยโผล่เลย** คำร้องพวกนั้นค้างถาวร
  // → ใช้ด่านของ lib เป็นตัวตัดสินที่เดียว (ตัวเดียวกับที่ server ใช้) ไม่คิดเอง
  const hasItems = requestHasItems(req.kind);
  // ⭐ ปิดสองฝ่าย (ม-89) — ปุ่มปิดเป็นของ **ผู้ขอ** เท่านั้น · ฝ่ายปลายทางจบงาน
  // ของตัวผ่านรายการ (ส่งเอกสาร/ปฏิเสธ) ไปแล้ว การปิดคือผู้ขอยืนยันรับงานทั้งใบ
  // ⚠️ เก็บ **ประโยค** ไว้ด้วย ไม่ใช่แค่ true/false — ผู้ขอที่กดปิดไม่ได้ต้องรู้ว่า
  // ติดอะไร (ปุ่มหายไปเฉย ๆ คือสิ่งที่งวด 2 เพิ่งเลิกทำ)
  /* ⭐ **ปิดสองฝั่ง** (มติผู้ใช้ 2026-08-20) — ตราของฝ่ายคือ `answeredAt` · ของผู้ขอคือ
     `closedAt` · ใบจบเมื่อครบทั้งคู่ (กติกาอยู่ที่ `lib/requests/closure.js`) */
  const closure = requestClosure(req);
  const closeBlocker = closeRequestError(req, req.items || []);
  const canClose = !closeBlocker && req._mine && !closure.requesterDone;
  /* ชนิดที่ไม่มีบรรทัด ระบบไม่มีทางรู้ว่าคำตอบครบหรือยัง → ผู้ตอบกดเองว่า "ตอบแล้ว"
     ⚠️ **หัวข้อที่ฝ่ายสร้างแถวเองตอนส่ง (`deliversRows`) ไม่นับว่า "ไม่มีบรรทัด"** —
     พอส่งงานแล้วมันมีแถวที่เดินสถานะของตัวเอง ระบบรู้เองว่าครบหรือยัง
     🐞 เดิมเงื่อนไขนี้เป็นจริงกับพัฒนากลิ่นมาตลอด แต่ถูกปุ่ม "ส่งงาน" บังไว้ · พอปุ่มนั้น
     ย้ายลงตาราง (2026-08-18) ปุ่ม "ตอบแล้ว" ก็โผล่ขึ้นมาเป็นปุ่มหลักของ RD ทันที
     ซึ่งเป็นทางลัดปิดงานที่ข้ามสถานะจริงของ direction */
  const canMarkAnswered = !hasItems && !requestDeliversRows(req.kind)
    && owner && !answerRequestError(req) && !closure.deptDone;
  /* ⭐ **"ยังไม่จบ" — ถอนตราปิดที่กดไปแล้ว** (มติผู้ใช้ 2026-08-20) · โผล่เฉพาะตอนมี
     ตราฝั่งใดฝั่งหนึ่งแล้วแต่ยังไม่ครบ · กดได้ทั้งสองฝั่ง (ฝั่งที่กดเปลี่ยนใจ หรือ
     อีกฝั่งที่รู้ว่างานยังไม่จบจริง) — ด่านเดียวกับ server */
  const canReopen = (owner || req._mine) && !reopenRequestError(req, { reason: "x" });
  // บรีฟกลิ่นที่ยังไม่ผูกกลิ่น = ต้องถามผลลัพธ์ก่อนปิด (ผูกแล้วไม่ต้องถามซ้ำ)
  const needsOutcome = requestNeedsOutcome(req.kind) && !req.scentId;
  const outcomeError = outcome ? closeOutcomeError(req, outcome) : null;

  // ── ก้าวของแถว ────────────────────────────────────────────────────────
  // ⚠️ ตรวจด้วย `hopValuesError` ตัวเดียวกับที่ server ใช้ — ไม่เขียนเงื่อนไขซ้ำที่จอ
  // ไม่งั้นสองชั้นจะเลื่อนออกจากกัน แล้วปุ่มที่กดได้จะได้ 400 กลับมา
  // ⚠️ สองด่านคนละชั้น — `hopValuesError` คุมค่าของก้าว · ของสูตรมีด่านของตัวเอง
  // ที่ server ใช้ตัวเดียวกัน (normalizeFormulaDelivery) ⇒ ปุ่มกับ API ไม่เพี้ยนกัน
  // ก้าว `ack` ที่ดันใบจาก `pending` = รับเรื่องทั้งใบ ⇒ ต้องผ่านด่านของใบด้วย (ค-2)
  // ⚠️ **ไม่บังคับวันแล้ว** (มติผู้ใช้ 2026-08-19) — `dueAt` ตรงนี้เป็นวันของ *แถว*
  // ส่วนวันที่รับปากของใบมาจากปุ่ม "แจ้งกำหนดส่ง" ทางเดียว
  const ackPromotesRequest = hopDraft?.hop === "ack" && req?.status === "pending";
  const hopError = hopDraft
    ? (hopValuesError(hopDraft.hop, hopDraft, { lineKind: hopDraft.item.lineKind })
      // ⚠️ เรียกด่านของ **ใบ** ตัวเดียวกับ server ไม่เขียนเงื่อนไขเองที่นี่
      || (ackPromotesRequest ? acknowledgeRequestError(req) : null)
      || (hopDraft.hop === "ready" && hopDraft.item.lineKind === "product_dev"
        ? normalizeFormulaDelivery(hopDraft).error
        : null))
    : null;
  const openHop = (item, hop, outcome = null) => setHopDraft({
    item,
    hop,
    outcome,
    // ⭐ ส่งของของ "พัฒนาผลิตภัณฑ์" = สูตรเข้าทะเบียนในจังหวะเดียว (P4b)
    // **หมวดกับกลิ่นไม่ถามซ้ำ แต่โชว์เทาไว้** — อยู่บนแถวแล้วและเป็นตัวตนของสูตรพอดี
    formula: formulaDraftFor(item),
    // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน
    at: businessDate(),
    dueAt: "",
    confirmedQty: "",
    note: "",
    // ผลลัพธ์ของบรรทัดเอกสารการเงิน (B-3) — เติมค่าเดิมกลับมาเมื่อส่งซ้ำหลังแก้
    docNumber: item.docNumber || "",
    docDueDate: item.docDueDate || "",
  });
  const submitHop = async () => {
    const { item, hop, outcome } = hopDraft;
    const ok = await call(`/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        hop,
        // ก้าวส่งไม่ส่งวัน (ม-92) — server ประทับวันไทยของวันที่กดให้เอง
        ...(["ready", "unready"].includes(hop) ? {} : { at: hopDraft.at }),
        ...(hop === "ack" ? { dueAt: hopDraft.dueAt || null } : {}),
        // ⚠️ ส่งทั้งก้อน — ลูกค้า/กลิ่น/หมวดที่ติดมาด้วยถูก server ทิ้ง แล้วยกจากแถวเอง
        ...(hop === "ready" && item.lineKind === "product_dev"
          ? { formula: hopDraft.formula } : {}),
        // เลขที่เอกสาร + วันครบกำหนดของบรรทัดเอกสารการเงิน (B-3)
        ...(hop === "ready" && item.lineKind === "billing_doc" ? {
          docNumber: hopDraft.docNumber,
          docDueDate: hopDraft.docDueDate || null,
        } : {}),
        ...(hop === "outcome" ? { outcome, note: hopDraft.note } : {}),
        // 🐞 ปฏิเสธต้องส่งเหตุผล — เดิมลืมสาขานี้ โมดัลกดบันทึกแล้วโดน 400
        // "ต้องบอกเหตุผลที่ปฏิเสธ" ทั้งที่กรอกแล้ว (เจอตอนกดจริงจากตาราง ม-94)
        ...(["refuse", "unready"].includes(hop) ? { note: hopDraft.note } : {}),
        ...(outcome === "confirmed" ? { confirmedQty: hopDraft.confirmedQty } : {}),
      }),
    }, outcome === "revise"
      // บอกผลข้างเคียงที่มองไม่เห็นตอนกด — แถวใหม่ถูกสร้างให้เอง
      ? "บันทึกแล้ว · เปิดรายการใหม่สำหรับรอบแก้ให้แล้ว"
      : hop === "unready"
        // ก้าวถอยจบแล้วยังมีงานเหลือ — ไม่บอกว่าต้องกลับมากดส่งเอง คนจะนึกว่าจบ
        ? 'ดึงกลับแล้ว · รายการกลับไปขั้น "กำลังทำ" — แก้ไฟล์แล้วกด "ส่งงาน" อีกครั้ง'
        : `บันทึก "${hopLabel(hop, outcome)}" แล้ว`);
    if (ok) setHopDraft(null);
  };

  // ── รวบส่งของหลายแถว (พัฒนาสูตร) ────────────────────────────────────────
  // ⚠️ แต่ละแถวเป็น **อิสระต่อกันจริง** (สูตรคนละตัว คนละ identity) ⇒ ยิงทีละแถว
  // แล้วรายงานรายแถวได้ ไม่ต้องมี endpoint รวบใหม่ · แถวที่สำเร็จแล้วหลุดจากโมดัล
  // แถวที่พังค้างไว้พร้อมข้อความ — กดส่งซ้ำได้โดยไม่ยิงซ้ำของที่สำเร็จไปแล้ว
  const bulkReadyBlocker = (() => {
    if (!bulkReady) return null;
    for (let i = 0; i < bulkReady.rows.length; i += 1) {
      const row = bulkReady.rows[i];
      const bad = normalizeFormulaDelivery(row).error;
      if (bad) return `${row.item.label}: ${bad}`;
    }
    return hopValuesError("ready", { at: bulkReady.at });
  })();
  const submitBulkReady = async () => {
    setSaving(true);
    const failed = [];
    let sent = 0;
    try {
      for (const row of bulkReady.rows) {
        try {
          const res = await fetch(`/api/sa/requests/${id}/items/${row.item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // ไม่ส่งวัน (ม-92) — server ประทับวันไทยของวันที่กดให้ทุกแถว
              hop: "ready",
              formula: row.formula,
            }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d.error || "ส่งไม่สำเร็จ");
          sent += 1;
        } catch (e) { failed.push({ ...row, error: e.message }); }
      }
    } finally { setSaving(false); }
    await load();
    if (failed.length) {
      setBulkReady({ ...bulkReady, rows: failed });
      setToast({ kind: "error", msg: `ส่งแล้ว ${sent} รายการ · ติด ${failed.length} รายการ — แก้แล้วกดส่งซ้ำได้` });
    } else {
      setBulkReady(null);
      setToast({ kind: "success", msg: `ส่งงาน ${sent} รายการ — สูตรเข้าทะเบียนแล้ว` });
    }
  };

  // ปุ่มส่งปิดด้วยกติกาเดียวกับที่ช่องเตือน — ฟอร์มไม่คิดกฎเอง (บทเรียนเดิม:
  // หน้าจอคำนวณเงื่อนไขเองแล้วเพี้ยนจาก server จนปุ่มกดได้แต่ได้ 400 กลับมา)
  const deliveryBlocker = (() => {
    if (!delivery) return null;
    const codes = new Set(allScents.map((s) => String(s.code ?? "").trim().toLowerCase()).filter(Boolean));
    for (let i = 0; i < delivery.length; i += 1) {
      const row = delivery[i];
      // ป้ายต้องตรงกับ **แท็บ** ที่คนเห็น ไม่งั้นข้อความบอกว่าใบไหนพังแล้วหาแท็บไม่เจอ
      const at = deliveryRowLabel(row, i);
      if (!String(row.scent?.name ?? "").trim()) return `${at}: ต้องระบุชื่อกลิ่น`;
      if (!String(row.scent?.code ?? "").trim()) return `${at}: ต้องระบุรหัสกลิ่น`;
      const clash = codeConflict(row.scent?.code, i, delivery, codes);
      if (clash) return `${at}: ${clash}`;
    }
    return null;
  })();

  // ⚠️ คืน null เมื่อ "ยังไม่มีอะไรให้เทียบ" — แถบจะไม่ขึ้นเลย ดีกว่าขึ้นแถบเขียว
  // ว่าครบแล้วตอนที่ยังไม่มีใครคอนเฟิร์มอะไร
  const reconcile = soReconcile({ lines: req.salesOrderLines, items: req.items });
  // ⭐ **ก้อนเดียว กระจายสองที่** — เนื้อกลางหน้า (`KindDetail`) กับการ์ดขวา
  // (`KindPanel`) ต้องได้ชุดเดียวกัน
  // 🐞 เดิมประกอบสามบรรทัดนี้ไว้ที่ `KindDetail` ที่เดียว แล้ว `KindPanel` ไม่ได้รับเลย
  // ⇒ `ScentPanel` รับ prop ครบแต่เป็น undefined ทั้งชุด · แถว "กลิ่นตาม SO" กับ
  // บรรทัดกระทบยอด **ไม่เคยขึ้นบนจอ** ทั้งที่ `soReconcile` คำนวณไว้แล้ว
  const reconcileProps = {
    reconcile,
    reconcileTone: reconcile ? SO_RECONCILE_TONE[reconcile.state] : undefined,
    reconcileText: reconcile ? soReconcileText(reconcile) : null,
  };

  // ⭐ บอกปลายทางตอนกำลังจะพิมพ์ — "ใครกำลังถือขั้นนี้อยู่" เปลี่ยนว่าคนจะพิมพ์อะไร
  // (มติผู้ใช้: ฝั่งที่ไม่ใช่ตาตัวเองต้องพิมพ์ได้ทันทีตรงนั้น ไม่ใช่ปุ่มที่เด้งไปที่อื่น)
  // ⚠️ อ่านจากสถานะจริงของใบ ไม่ใช่เดาจาก role ของคนดู — ใบที่ยังไม่ส่งไม่มีใครรออยู่
  const composeHint = (() => {
    if (req.status === "draft") return "ยังไม่ได้ส่ง — ข้อความนี้จะยังไม่แจ้งเตือนใคร";
    if (["closed", "cancelled"].includes(req.status)) return null;
    return req._mine
      ? `จะแจ้งเตือนถึง ${req.dept} ที่ถือเรื่องนี้อยู่`
      : `จะแจ้งเตือนถึง ${req.requestedByName || "ผู้เปิดคำร้อง"}`;
  })();

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "submit") {
      return {
        title: "ส่งคำร้อง",
        description: `${(req.items || []).length} รายการ → ${req.dept}`,
        detail: "ระบบจะออกเลขที่และแจ้งฝ่ายปลายทางทันที — หลังส่งแล้วลบใบไม่ได้",
        confirmLabel: "ส่งคำร้อง",
      };
    }
    /* ⭐ **รับเรื่องต้องมีโมดัลบอกผลลัพธ์** — กติกาเดียวกับทุกการอนุมัติในระบบ ·
       ยิ่งจำเป็นหลังแยกก้าว: คนกดต้องรู้ว่ากดแล้วใบ **ยังไม่มีวันกำหนดส่ง** และ
       ต้องกลับมากด "แจ้งกำหนดส่ง" อีกที ไม่งั้นจะเข้าใจว่าจบแล้ว */
    if (confirm.kind === "acknowledge") {
      return {
        title: "รับเรื่อง",
        description: req.docNo || "",
        detail: `ใบนี้จะเข้าคิวของ ${req.dept} ทันที และนับเป็นงานที่ ${req.dept} รับไว้แล้ว`
          + " · ยังไม่ต้องระบุวันกำหนดส่งตอนนี้ — ใบจะไปอยู่สถานะ \"รอกำหนดส่ง\""
          + " แล้วกด \"แจ้งกำหนดส่ง\" เมื่อรู้วันจริง"
          /* ⭐ บอกด้วยว่ากดแล้ว **ได้เลขที่เอกสารหรือยัง** — สองโหมดคนละเรื่องกันเลย
             (mig 0271 · 0272) · เลขอัตโนมัติใช้วันที่ของวินาทีที่กดและแก้ทีหลังไม่ได้
             ส่วนช่วงกรอกเองต้องบอกให้ชัดว่ายังต้องไปกดอีกปุ่ม ไม่งั้นคนกดจะเข้าใจว่า
             จบแล้ว แล้วเอกสารออกไปโดยไม่มีเลข */
          + (!requestHasPdr(req.kind) ? ""
            : issuesPdrRefNoOnAcknowledge(req)
              ? " · ระบบจะออกเลขที่เอกสารของ PDR (วันที่วันนี้) ให้ในจังหวะเดียวกัน"
              : " · เดือนนี้ยังไม่ออกเลขให้เอง — รับเรื่องแล้วกด \"กรอกเลขที่เอกสาร\" ใส่เลขจากกระดาษ"),
        confirmLabel: "รับเรื่อง",
      };
    }
    /* ⭐ ออกเลขที่เอกสารย้อนหลัง — ใบที่รับเรื่องไปก่อน mig 0271 ยังไม่มีเลข
       ⚠️ ต้องบอกให้ชัดว่า **เลขใช้วันที่รับเรื่องของใบ ไม่ใช่วันนี้** และแก้ไม่ได้
       (เลขที่พิมพ์ลงกระดาษไปแล้วต้องตามกลับมาที่ใบเดิมได้เสมอ) */
    if (confirm.kind === "pdr-ref") {
      return {
        title: "ออกเลขที่เอกสาร PDR",
        description: req.docNo || "",
        detail: `เลขจะใช้วันที่รับเรื่องของใบนี้ (${fmtDate(req.acknowledgedAt)})`
          + " ไม่ใช่วันที่กดปุ่ม · ออกแล้วแก้ไม่ได้ และจะขึ้นบนหัวเอกสารทันที",
        confirmLabel: "ออกเลข",
      };
    }
    if (confirm.kind === "answer") {
      return {
        title: "ทำเครื่องหมายว่าตอบแล้ว",
        description: req.docNo || "",
        /* ⭐ ปิดสองฝั่ง (มติผู้ใช้ 2026-08-20) — โมดัลต้องบอกว่ากดแล้วใบ **ยังไม่จบ**
           ไม่งั้นฝ่ายเข้าใจว่าจบแล้วและเลิกตามงาน */
        detail: "ชนิดนี้ไม่มีรายการให้ระบบนับ — ผู้ตอบเป็นคนบอกเองว่าตอบครบแล้ว"
          + `\nใบยังไม่จบจนกว่า${requestSideLabel(req, "requester")}จะกด "ปิดเรื่อง" ด้วย`
          + " · ถ้ามีคนถามกลับในเธรด เครื่องหมายนี้จะถูกถอนเองแล้วใบกลับมาที่คุณ",
        confirmLabel: "ตอบแล้ว",
      };
    }
    if (confirm.kind === "close") {
      /* ⭐ ปิดสองฝั่ง (มติผู้ใช้ 2026-08-20) — บอกตรง ๆ ว่าใบจะจบเลยไหม หรือยังต้องรอ
         ฝ่ายกด "ตอบแล้ว" ก่อน · และครบสองฝั่งแล้วเปิดกลับไม่ได้ */
      const deptPending = !closure.deptDone;
      return {
        title: "ปิดเรื่อง",
        description: req.docNo || "",
        detail: (hasItems
          ? "ราคาที่ตอบแล้วยังอยู่ในทะเบียนวัสดุตามเดิม — ปิดเรื่องแค่บอกว่างานนี้จบ"
          : "ปิดเรื่องแล้วยังอ่านย้อนหลังได้ตามเดิม — แค่บอกว่างานนี้จบ")
          + (deptPending
            ? `\nนี่คือการปิดฝั่งคุณเท่านั้น — ใบยังไม่จบจนกว่า${requestSideLabel(req, "dept")}จะกด "ตอบแล้ว"`
            : "\nอีกฝั่งกดแล้ว — กดปุ่มนี้คือใบจบถาวร เปิดกลับไม่ได้"),
        confirmLabel: "ปิดเรื่อง",
      };
    }
    if (req.status === "draft") {
      return {
        title: "ลบคำร้องร่าง",
        description: "คำร้องนี้ยังไม่ถูกส่ง จึงลบทิ้งได้",
        confirmLabel: "ลบคำร้อง",
      };
    }
    // ใบที่ส่งแล้ว = ทาง admin เท่านั้น · กฎธุรกิจจะบล็อกก่อน แล้ว deleteWithForce
    // จะแสดงพรีวิวของที่จะโดนลบพ่วงอีกชั้น ที่นี่จึงบอกแค่ว่ากำลังจะทำอะไร
    return {
      title: "ลบคำร้องที่ส่งแล้ว",
      description: `${req.docNo || id} · สถานะ ${requestStatusView(req).label}`,
      detail: "คำร้องที่ออกเลขแล้วถือเป็นหลักฐาน — ปกติควรใช้ \"ยกเลิกคำร้อง\" แทน"
        + " · ระบบจะแสดงรายการที่จะถูกลบพ่วงให้ยืนยันอีกครั้ง",
      confirmLabel: "ดำเนินการต่อ",
    };
  };

  const runConfirm = async () => {
    if (confirm.kind === "delete") {
      // ลบตามปกติก่อน · ถูกกฎธุรกิจบล็อกและเป็น admin → ดึงพรีวิว (?dryRun=1) มาแสดง
      // ว่าจะลบอะไรพ่วง แล้วถามยืนยันก่อนยิง ?force=1 (แพตเทิร์นเดียวกับทะเบียน
      // กลิ่น/สูตร/ดีล — ห้ามเขียนกลไกใหม่ ดู lib/forceDeleteClient.js)
      setSaving(true);
      try {
        const result = await deleteWithForce(`/api/sa/requests/${id}`, { isAdmin });
        if (result.cancelled) { setConfirm(null); return; }
        setToast({
          kind: "success",
          msg: result.forced ? "บังคับลบคำร้องแล้ว" : "ลบร่างคำร้องแล้ว",
        });
        window.location.href = "/requests?tab=mine";
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      } finally {
        setSaving(false);
      }
      return;
    }
    const labels = {
      submit: "ส่งคำร้องแล้ว", acknowledge: "รับเรื่องแล้ว",
      answer: "บันทึกว่าตอบแล้ว", close: "ปิดเรื่องแล้ว",
      "pdr-ref": "ออกเลขที่เอกสารแล้ว",
    };
    const ok = await call("", {
      method: "PATCH", body: JSON.stringify({ action: confirm.kind }),
    }, labels[confirm.kind]);
    if (ok) setConfirm(null);
  };

  // ⭐ ตรรกะการประกอบรางอยู่ที่ lib — เทสต์ครอบได้ (บั๊กป้ายซ้ำ/ไฮไลต์ผิดขั้นเกิดตอน
  // มันฝังอยู่ใน JSX ซึ่ง CI มองไม่เห็น)
  const { steps: railSteps, index: workflowIndex } = requestRailSteps(req, { hasItems });
  const workflowSteps = workflowStepsFromIndex(railSteps, workflowIndex, req.status === "cancelled");

  /* ⭐ **แผงจัดการคือศูนย์กลางการควบคุม — เปิดโหมดแก้แล้วแผงต้องเปลี่ยนตาม**
     (มติผู้ใช้ 2026-08-09) · ระหว่างแก้แบบฟอร์ม PDR ปุ่มของทั้งใบ (ส่ง/ลบ/แก้ข้อมูล)
     ต้องหลบไป เหลือแค่ "บันทึกแบบฟอร์ม / ยกเลิก" ซึ่งเป็นสองทางเดียวที่ออกจากโหมดนี้ได้
     ⚠️ ปล่อยให้ปุ่มอื่นค้างไว้ = กด "ส่งคำร้อง" ระหว่างที่ยังไม่บันทึกฟอร์ม แล้วของที่
     พิมพ์ค้างหายเงียบ ๆ */
  const editing = !!editDraft;
  const cancelEdit = () => setEditDraft(null);

  const primaryAction = editing
    ? {
      id: "edit-save",
      label: "บันทึกการแก้ไข",
      kind: "save",
      icon: Check,
      /* ⚠️ **สอง action คนละด่าน จึงยิงสองครั้ง** — API เป็น action-based และ
         `update`/`pdr` มีด่านสิทธิ์คนละชุด (สลับมือคนละจังหวะ) การยุบเป็นครั้งเดียว
         = ต้องเขียนด่านชุดที่สามที่ต้องคอยให้ตรงกับสองชุดเดิมตลอดไป
         ⚠️ ยิงหัวใบก่อน แล้วค่อยแบบฟอร์ม — หัวใบล้ม (เช่นลืมเหตุผลด่วน) ต้องหยุด
         ทันทีโดยที่แบบฟอร์มยังไม่ถูกเขียน ไม่ใช่บันทึกครึ่งเดียวแล้วบอกว่าพลาด */
      onClick: async () => {
        if (canEditInfo) {
          const ok = await call("", {
            method: "PATCH",
            body: JSON.stringify({ action: "update", ...editDraft }),
          }, canEditPdrNow ? null : "แก้ข้อมูลคำร้องแล้ว");
          if (!ok) return;
        }
        if (canEditPdrNow) {
          const ok = await call("", {
            method: "PATCH",
            body: JSON.stringify({
              action: "pdr",
              pdr: editDraft.pdr,
              briefs: editDraft.briefs,
              pdrTargets: editDraft.pdrTargets,
            }),
          }, "บันทึกการแก้ไขแล้ว");
          if (!ok) return;
        }
        cancelEdit();
      },
    }
    : req._mine && req.status === "draft"
    ? {
      id: "submit",
      label: "ส่งคำร้อง",
      kind: "submit",
      icon: Send,
      onClick: () => setConfirm({ kind: "submit" }),
    }
    : owner && req.status === "pending"
      ? {
        id: "acknowledge",
        label: "รับเรื่อง",
        kind: "approve",
        icon: Check,
        // ⚠️ ไม่ถามวันแล้ว (มติผู้ใช้ 2026-08-19) — รับเรื่อง = ตัดรอบเข้าฝ่าย
        onClick: () => setConfirm({ kind: "acknowledge" }),
      }
      /* ⭐ **แจ้งกำหนดส่ง = ก้าวถัดไปของฝ่าย** (มติผู้ใช้ 2026-08-19) — ต้องเป็น
         *ปุ่มหลัก* ไม่ใช่เมนูรอง: ตราบใดที่ยังไม่กด ผู้ขอไม่มีวันให้ยึด และไม่มี
         ตัวเลขไหนบอกได้ว่าใบนี้ช้าหรือยัง ⇒ มันคือสิ่งที่ค้างอยู่จริงของใบนี้ */
      : owner && requestAwaitingDue(req)
        ? {
          id: "commit-due",
          label: "แจ้งกำหนดส่ง",
          kind: "approve",
          icon: CalendarClock,
          onClick: () => setCommitDue({ date: businessDate(), reason: "" }),
        }
      /* ⚠️ **ปุ่ม "ส่งงาน" ไม่อยู่บน Control Panel แล้ว** (มติผู้ใช้ 2026-08-18) —
         ย้ายไปอยู่ **ในแถวของบรีฟ** ที่ตารางสรุปทั้งใบ (ดู `openDelivery` ข้างล่าง)
         เหตุผล: ใบหนึ่งมีหลายบรีฟ ปุ่มระดับใบไม่ได้บอกว่ากำลังส่งตอบก้อนไหน ⇒ คนกด
         ต้องมาเลือกบรีฟในโมดัลอีกทีทั้งที่เพิ่งอ่านตารางอยู่แท้ ๆ
         ⇒ Control Panel เหลือ **ปุ่มปลายทาง** (ปิดเรื่อง) ที่จางพร้อมเหตุผลจนครบทุกขั้น
         ⚠️ ย้าย ไม่ก๊อป — ห้ามเอากลับมาที่นี่ */
      // ชนิดที่ไม่มีบรรทัด: ผู้ตอบกด "ตอบแล้ว" ก่อน แล้วผู้ขอค่อยปิดเรื่อง
      // (ระบบนับคำตอบเองไม่ได้ — ไม่มีบรรทัดให้นับ)
      : canMarkAnswered
        ? {
          id: "answer",
          label: "ตอบแล้ว",
          hint: `${requestSideText(req, "requester", "ยังต้องกดปิดเรื่องด้วย")}`,
          kind: "approve",
          icon: CheckCheck,
          onClick: () => setConfirm({ kind: "answer" }),
        }
        : canClose
          ? {
            id: "close",
            label: "ปิดเรื่อง",
            kind: "approve",
            icon: CheckCheck,
            // บรีฟกลิ่นต้องบอกก่อนว่าได้กลิ่นตัวไหน — ถามในโมดัลแทน confirm ธรรมดา
            onClick: () => (needsOutcome
              ? setOutcome({ mode: scentOptions.length ? "link" : "create", scentId: "", scentName: "", code: "" })
              : setConfirm({ kind: "close" })),
          }
          /* ⭐ **ผู้ขอที่ปิดยังไม่ได้ ต้องเห็นว่าติดอะไร** — ไม่ใช่การ์ดที่ไม่มีปุ่มเลย
             (แพตเทิร์นเดียวกับปุ่ม "แก้ไข" ในงวด 2) · `closeBlocker` เป็นประโยคจาก
             lib ตัวเดียวกับที่ API ใช้ ⇒ สิ่งที่จอบอกกับสิ่งที่ server บังคับตรงกันเสมอ
             ⚠️ เฉพาะใบที่ยังเดินอยู่ — ใบที่ปิด/ยกเลิกไปแล้วจบของมันแล้ว ไม่ต้องมีปุ่ม
             ค้างไว้ให้เข้าใจผิดว่ายังทำอะไรได้ */
          : req._mine && REQUEST_OPEN_STATUSES.includes(req.status) && closeBlocker
            ? {
              id: "close",
              label: "ปิดเรื่อง",
              kind: "approve",
              icon: CheckCheck,
              disabled: true,
              disabledReason: closeBlocker,
              onClick: () => {},
            }
            : null;

  // ⭐ **ปุ่มระดับใบอยู่บาร์บนสุดของเนื้อ ที่เดียวทุกหัวข้อ** (งวด 1 ของรอบรื้อ) —
  // เดิมที่วางเปลี่ยนไปตามโครงของหัวข้อ: การ์ด control ขวา (ธง Control Panel) ·
  // หัวใบ (โครงเดิม) · แถบท้ายเธรด (หัวข้อที่ไม่มีแถว) ⇒ สามที่ที่ต้องเรียนรู้
  //
  // ⚠️ **ย้าย ไม่ก๊อป** — กติกา "ที่เดียวเสมอ" (ม-49 · ม-57 · ม-94) ไม่เปลี่ยน
  // เปลี่ยนแค่ว่าที่นั้นอยู่ตรงไหน ⇒ หัวใบ/การ์ดขวา/ท้ายเธรด **ต้องไม่มีปุ่มระดับใบ**

  // ── ปุ่มของใบทั้งใบ ─────────────────────────────────────────────────────
  //
  // ⭐ **หัวใบเดียว** — เดิมหน้านี้วาดสถานะซ้ำสี่ที่ (ป้ายบนหัวใบ · status-pill ใน
  // การ์ด inline style · สถานะในการ์ดสรุป · สถานะในการ์ดจัดการ) และ "ฝ่ายผู้ตอบ"
  // สามที่ ⇒ เปิดมาแล้วต้องกวาดตาสี่จุดเพื่อรู้เรื่องเดียว · ตอนนี้เหลือจุดเดียว
  // ต่อหนึ่งข้อเท็จจริง และปุ่มทั้งหมดมาอยู่บนหัวใบที่คนเห็นก่อน
  //
  // ⚠️ ยังใช้ `normalizeDocumentControlActions` ตัวเดิม — กติกา `visible: false`
  // อยู่ที่เดียวกับทุกโมดูล เปลี่ยนแค่ *ที่วาง* ไม่ใช่กติกา
  /* ⚠️ สองด่านคนละชุด ต้องถามแยกกันแม้ปุ่มจะเหลือปุ่มเดียว
     · `canEditInfo`   = ผู้ขอแก้หัวใบได้ (ถึงก่อนรับเรื่องเท่านั้น — requestEdit.js)
     · `canEditPdrNow` = สิทธิ์แก้ PDR ซึ่ง **สลับมือ** ไปฝ่ายปลายทางตอนรับเรื่อง
       (pdrEdit.js) ⇒ RD หลังรับเรื่องกด "แก้ไข" แล้วได้เฉพาะแบบฟอร์ม ไม่ได้หัวใบ */
  const canEditInfo = (req._mine || isAdmin) && REQUEST_EDITABLE_STATUSES.includes(req.status);
  const canEditPdrNow = requestHasPdr(req.kind) && !!req._canEditPdr;
  // ⭐ ประโยค "ทำไมแก้ไม่ได้ตอนนี้" — server ตัดสินมาให้แล้ว (`editPdrError`) หน้าจอ
  /* เหตุผลที่แก้ไม่ได้ — **มาจาก server ทั้งสองฝั่ง ไม่คิดเอง**
     · ใบที่มีแบบฟอร์ม PDR ⇒ `_editPdrBlocker` (สิทธิ์สลับมือตอนรับเรื่อง)
     · ใบที่ไม่มี ⇒ `_editBlocker` (= `requestEditError` — ผู้ขอ ถึงก่อนรับเรื่อง)
     🐞 เดิมฝั่งขวาเป็น `null` ตายตัว ⇒ ใบขอเอกสาร/ขอใบวางบิล/พัฒนาสูตร/สอบถาม
     พอฝ่ายกด "รับเรื่อง" **ปุ่มแก้หายไปทั้งปุ่มโดยไม่มีเหตุผลบนจอ** ทั้งที่ประโยค
     ไทยรออยู่ใน `requestEditError` แล้ว (ผลตรวจ 2026-08-24) */
  const editBlocker = (requestHasPdr(req.kind) ? req._editPdrBlocker : req._editBlocker) || null;

  /* ⭐ เปิดโมดัลส่งงาน **ของบรีฟก้อนเดียว** (มติผู้ใช้ 2026-08-18) — ปุ่มอยู่ในแถว
     ของบรีฟนั้นในตารางสรุปทั้งใบ
     ⭐ **รอบแก้ที่ค้างอยู่ขึ้นมาก่อนเสมอ** — ลูกค้าสั่งแก้ไว้แล้ว แถวรออยู่แล้ว RD ไม่ต้อง
     ไปจำเองว่าค้างอะไร และไม่มีทางสร้างแถวใหม่ทับของที่รออยู่ (กติกาเดิมของปุ่มระดับใบ)
     ⚠️ กรองรอบแก้ **ตามบรีฟ** — ก้อนอื่นที่ค้างอยู่ไม่ใช่เรื่องของการกดปุ่มก้อนนี้ */
  const openDelivery = (briefId) => {
    const waiting = reworkSlots(req.items || [])
      .filter((slot) => !briefId || slot.briefId === briefId)
      .map(reworkDeliveryRow);
    setDelivery(waiting.length ? waiting : [{ ...emptyDeliveryRow(), briefId: briefId || "" }]);
    setDeliveryTab(0);
  };

  const requestActions = normalizeDocumentControlActions({
    // ปุ่มหลักไม่ผ่านหัวใบ/ท้ายเธรดแล้ว — เข้า normalize ตรงเพื่อไปโผล่ที่บาร์บนสุด
    primaryAction,
    secondaryActions: editing ? [
      {
        id: "edit-cancel",
        label: "ยกเลิกการแก้",
        kind: "open",
        icon: Undo2,
        variant: "ghost",
        onClick: cancelEdit,
      },
    ] : [
      /* ⚠️ **"ส่งงานหลายรายการ" ย้ายไปหัวการ์ดตารางสรุปทั้งใบแล้ว** (มติผู้ใช้
         2026-08-18) — ปุ่มส่งงานทุกแบบอยู่กับตาราง Control Panel เหลือปุ่มปลายทาง */
      {
        // ⭐ **ออกเอกสาร** (มติผู้ใช้ 2026-08-09) — เดิมชื่อ "ดูฉบับที่ออกจริง" และ
        // ซ่อนอยู่ในแท็บแบบฟอร์ม · เป็นของระดับใบจึงย้ายมารวมที่แผงจัดการ
        // ⚠️ ป้ายสั้นกว่าเดิมแต่ยังไม่ใช่ "ดาวน์โหลด" — ฉบับที่ออกเป็นหน้า HTML
        id: "pdr-document",
        label: "ออกเอกสาร",
        kind: "open",
        icon: Printer,
        onClick: () => window.open(`/api/sa/requests/${id}/pdr-document`, "_blank"),
        visible: requestHasPdr(req.kind),
      },
      {
        /* ⭐ **ปุ่มแก้ปุ่มเดียว** (มติผู้ใช้ 2026-08-10) — เดิมแยกเป็น "แก้ข้อมูลคำร้อง"
           กับ "แก้แบบฟอร์ม PDR" สองปุ่มในเมนูเดียวกัน ทั้งที่คนกดคิดแค่ว่า "จะแก้ใบนี้"
           แล้วต้องมาเดาว่าของที่อยากแก้อยู่ปุ่มไหน · ปุ่มเดียวเปิดโหมดแก้ แล้วโหมดนั้น
           กางเฉพาะส่วนที่ **คนนี้ ณ ขั้นนี้** แก้ได้จริง
           ⚠️ สองฝั่งมีด่านคนละชุด และสลับมือคนละจังหวะ — `_canEdit` (ผู้ขอ ถึงก่อน
           รับเรื่อง) กับ `_canEditPdr` (สลับไปฝ่ายปลายทางตอนรับเรื่อง) ⇒ บางขั้นกางได้
           ทั้งสองส่วน บางขั้นได้ส่วนเดียว · server ตัดสินมาให้แล้วทั้งคู่ */
        id: "edit",
        label: "แก้ไข",
        kind: "edit",
        icon: Pencil,
        onClick: () => {
          /* ⭐ **ค่าเดียวกับฟอร์มเปิดใบ** — `emptyRequestForm` เติมคีย์ที่เหลือให้ครบ
             (ฟอร์มเป็น controlled ล้วน · คีย์ที่ขาดกลายเป็น uncontrolled input) */
          setEditDraft(emptyRequestForm({
              kind: req.kind,
              dept: req.dept || "",
              team: req.team || "",
              title: req.title || "",
              body: req.body || "",
              requestedDueDate: req.requestedDueDate || "",
              urgent: !!req.urgent,
              urgentReason: req.urgentReason || "",
              /* ⭐ **บรรทัดเข้าโหมดแก้ด้วย** (มติผู้ใช้ 2026-08-24) — หัวข้อที่เนื้องาน
                 อยู่ในบรรทัด (ขอเอกสาร · ขอใบวางบิล · พัฒนาสูตร) เคยแก้ได้แต่หัวใบ
                 ⚠️ **ต้องพา `id` ของแถวเดิมไปด้วย** (`lineFormRows`) — server จับคู่
                 แถวด้วย id · ลืมบรรทัดนี้ = ทุกแถวกลายเป็นแถวใหม่แล้วของเดิมถูกลบ
                 พร้อมไฟล์แนบที่ผูกกับ id นั้น (บั๊กเดียวกับที่ `pdrValuesFrom` กันไว้
                 ฝั่ง PDR) */
              items: hasItems ? lineFormRows(req.items || [], lineShapeForKind(req.kind)) : [],
              // ยอดที่ขอวางบิล — ส่งคู่เสมอ server คิดใหม่จากยอดจริงของใบอยู่ดี
              billPercent: req.billPercent ?? null,
              billAmount: req.billAmount ?? null,
              /* ของที่ผูก — ส่งไปให้ฟอร์มอ่าน (ช่องถูกล็อกในโหมดแก้) และให้ด่าน
                 `requestShapeError` ฝั่ง server เห็นใบทั้งใบเหมือนตอนเปิด */
              dealId: req.dealId || "",
              projectId: req.projectId || "",
              /* ⚠️ อ้างอิงเพิ่ม QT/SO/FG **แก้ได้** — มันคือ "ถ้ามี" ไม่ใช่ต้นทาง
                 (ด่านมีข้อเดียว: มีจริง + อยู่ดีลเดียวกัน · `resolveOptionalRefs`) */
              quotationId: req.quotationId || "",
              salesOrderId: req.salesOrderId || "",
              productIds: (req.productRefs || []).map((fg) => fg.id)
                .concat(!req.productRefs?.length && req.productId ? [req.productId] : []),
              /* แบบฟอร์ม PDR อยู่ในก้อนเดียวกันแล้ว — แท็บ "รายละเอียด" ของฟอร์ม
                 เป็นคนวาดราง เหมือนตอนเปิดใบเป๊ะ
                 ⚠️ แถวข้อ 2.2/2.3 (mig 0229) ต้องแปลงเป็นค่าสตริงของฟอร์มด้วยตัวแปลง
                 กลาง — ลืมบรรทัดนี้ = เปิดโหมดแก้แล้วรายการราคาหายทั้งชุด แล้วกด
                 บันทึกทับของจริง */
              pdr: pdrValuesFrom(req),
              briefs: (req.briefs || []).map((b) => ({ ...b })),
            pdrTargets: (req.targets || []).map(pdrTargetValuesFrom),
          }));
          /* ⭐ **กดแก้แล้วต้องเห็นว่ามีอะไรเปิดขึ้นมา** (ผลตรวจ 2026-08-24) — ปุ่มอยู่
             บนแผงจัดการ (รางขวา / บนสุดบนจอแคบ) ส่วนการ์ดแก้ไปโผล่ในคอลัมน์เนื้อ
             ⇒ บนใบยาว ๆ กดแล้วหน้าไม่ขยับเลย อ่านเหมือนปุ่มเสีย
             ⚠️ `setTimeout(0)` ไม่ใช่ `requestAnimationFrame` — ต้องรอให้ React
             commit การ์ดลง DOM ก่อน ไม่งั้น `getElementById` ยังได้ null */
          setTimeout(() => {
            document.getElementById("request-edit")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 0);
        },
        // ⚠️ ฝั่งจอไม่มี `user.id` (context เก็บแค่ role/department) จึงถามด้วย
        // `_mine` ที่ server คำนวณมาให้ + ขั้นชุดเดียวกับ lib · ด่านจริงอยู่ที่ API
        //
        // ⭐ **แก้ไม่ได้ตอนนี้ ≠ ไม่ใช่ปุ่มของคุณ** (ผลตรวจ 2026-08-17) — ใบที่มี
        // แบบฟอร์ม PDR สลับมือคนแก้ตอน "รับเรื่อง" ⇒ อีกฝั่งเห็นปุ่มหายไปเฉย ๆ แล้ว
        // ไม่รู้ว่าต้องไปบอกใคร · โชว์ปุ่มแบบกดไม่ได้พร้อมเหตุผลจาก server แทน
        // ⚠️ ซ่อนจริงเฉพาะใบที่ **ไม่มีอะไรให้แก้เลย** (ไม่มี PDR และไม่ใช่ใบของเรา)
        // — ปุ่มที่ไม่มีวันกดได้ไม่ควรกินที่บนแผง
        /* ⚠️ ซ่อนจริงเฉพาะใบที่ **ไม่ใช่เรื่องของคนนี้เลย** — ใบของคนอื่นที่เราแค่
           เปิดอ่าน ปุ่มแก้ไม่มีวันกดได้ ⇒ ไม่ควรกินที่บนแผง
           ⭐ ส่วนใบ **ของเราเองที่เลยจังหวะแก้ไปแล้ว** ต้องโชว์แบบกดไม่ได้พร้อมเหตุผล
           (มติ GatedAction) · ใบที่มี PDR โชว์เสมอเพราะสิทธิ์สลับมือไปอีกฝั่ง
           คนที่เห็นปุ่มหายจะไม่รู้ว่าต้องไปบอกใคร */
        visible: (canEditInfo || canEditPdrNow
          || (!!editBlocker && (requestHasPdr(req.kind) || req._mine)))
          && !editing,
        disabled: !canEditInfo && !canEditPdrNow,
        disabledReason: editBlocker,
      },
      {
        // ⭐ **เลื่อนวันกำหนดส่ง** (มติผู้ใช้ 2026-08-06) — RD ขอให้แก้ได้ เผื่อ
        // ตอนรับเรื่องเลือกวันไปก่อนแล้วมาเจอของจริง · ไม่ต้องตีกลับแล้วรับใหม่
        //
        // ⚠️ อยู่ในกลุ่ม secondary ไม่ใช่ปุ่มหลัก — ปุ่มหลักคือก้าวถัดไปของงาน
        // (ส่งกลิ่น/ตอบแล้ว) การเลื่อนวันเป็นการแก้คำสัญญา ไม่ใช่การเดินหน้า
        id: "reschedule",
        label: "เลื่อนวันกำหนดส่ง",
        kind: "edit",
        icon: CalendarClock,
        onClick: () => setReschedule({ date: req.committedDueDate || businessDate(), reason: "" }),
        // เห็นเฉพาะฝ่ายที่รับงานไปแล้ว — `canAnswer` คุมทั้งสิทธิ์และ
        // "ใบยังเดินอยู่" ให้แล้ว · ห้ามหลวมกว่า `rescheduleRequestError`
        // ⚠️ **ต้องมีวันเดิมก่อน** (มติผู้ใช้ 2026-08-19) — ใบที่ยังไม่เคยแจ้งวันใช้
        // ปุ่ม "แจ้งกำหนดส่ง" · ปล่อยให้เลื่อนได้ตั้งแต่ยังไม่มีวัน = ทางลัดที่เธรด
        // จะเขียนว่า "เลื่อนจาก (ไม่เคยระบุ)" ทั้งที่นี่คือการให้วันครั้งแรก
        visible: canAnswer && !!req.acknowledgedAt && !!req.committedDueDate,
      },
      {
        /* ⭐ **ยังไม่จบ** (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง) — ถอนตราปิดของฝั่งที่กด
           ไปแล้ว แล้วใบกลับมาเปิด · บังคับเหตุผล ลงเธรด
           ⚠️ ใบที่ปิดครบสองฝั่งแล้วไม่มีปุ่มนี้ — `closed` เป็นปลายทางถาวร (มติเดียวกัน)
           ⚠️ ใบสอบถามไม่ต้องรอปุ่มนี้: อีกฝั่งพิมพ์ถามกลับ ตราหลุดเอง (ดู closure.js) */
        id: "reopen",
        label: "ยังไม่จบ",
        kind: "edit",
        icon: Undo2,
        onClick: () => setReopen({ reason: "" }),
        visible: canReopen,
      },
      {
        /* ⭐ **ออกเลขที่เอกสาร PDR ย้อนหลัง** (mig 0271 · มติผู้ใช้ 2026-08-20)
           — ใบใหม่ได้เลขเองตอนรับเรื่อง ปุ่มนี้มีไว้ให้ใบที่รับเรื่องไปก่อนหน้านั้น
           ⚠️ **ไม่ backfill ทั้งกองด้วย migration** — เลขรันของแต่ละเดือนมีจำกัด
           (3 หลัก) การไล่ออกให้ทุกใบย้อนหลังคือการใช้เลขไปกับใบที่ไม่มีใครจะพิมพ์
           ⚠️ เงื่อนไขต้องไม่หลวมกว่า `pdrRefNoError` ฝั่ง API — ปุ่มที่กดแล้วเด้ง
           409 คือปุ่มที่ไม่ควรขึ้นตั้งแต่แรก */
        id: "pdr-ref",
        label: "ออกเลขที่เอกสาร",
        kind: "edit",
        icon: Hash,
        onClick: () => setConfirm({ kind: "pdr-ref" }),
        visible: canAnswer && requestHasPdr(req.kind) && !pdrRefNoError(req),
      },
      {
        /* ⭐ **ช่วงเปลี่ยนผ่าน: กรอกเลขเอง** (มติผู้ใช้ 2026-08-20 · mig 0272) — ใบที่
           รับเรื่องก่อนเดือนที่ระบบเริ่มออกเลข RD เดินเลขบนกระดาษของตัวเองไปแล้ว
           ⇒ ที่นี่คือการ *ลอกเลขเข้าระบบ* ไม่ใช่การออกเลขใหม่
           ⚠️ ปุ่มนี้กับ "ออกเลขที่เอกสาร" ข้างบน **ไม่มีวันขึ้นพร้อมกัน** — `pdrRefMode`
           ตัดสินจากเดือนของ `acknowledgedAt` ใบเดียวกันจึงอยู่ได้โหมดเดียว
           ⚠️ เลขที่กรอกเองแก้ได้จนกว่าใบจะปิด ปุ่มจึงยังอยู่หลังมีเลขแล้ว (ป้ายเปลี่ยน
           เป็น "แก้") ต่างจากเลขอัตโนมัติที่ล็อกทันที */
        id: "pdr-ref-manual",
        label: canEditPdrRefManual(req) ? "แก้เลขที่เอกสาร" : "กรอกเลขที่เอกสาร",
        kind: "edit",
        icon: Hash,
        onClick: () => setRefDraft(req.pdrRefNo || ""),
        visible: canAnswer
          && requestHasPdr(req.kind)
          && pdrRefMode(req) === "manual"
          && (!req.pdrRefNo || canEditPdrRefManual(req)),
      },
      {
        /* ⭐ **มอบหมายผู้รับผิดชอบ** (mig 0230 · มติผู้ใช้ 2026-08-12) — คนละเรื่อง
           กับ "รับเรื่อง": รับเรื่อง = ฝ่ายรับปากกับผู้ขอ · มอบหมาย = จัดคนในฝ่าย
           ⚠️ เห็นตั้งแต่ใบยังไม่ถูกรับเรื่อง (ต่างจากเลื่อนวัน) — หัวหน้าแจกงาน
           ก่อนใครกดรับได้ และนั่นคือลำดับที่ใช้จริง */
        id: "assign",
        /* 🐞 **ชื่อคนยาวดันปุ่มล้นกรอบ** (IS-26080021 · ผู้ใช้ส่งภาพมา) — ชื่อบัญชี
           ในระบบเป็น "ProjectCo.Jeab : Project Management, R&D" ⇒ ป้ายปุ่มยาว 55
           ตัวอักษร ตกสองบรรทัดแล้วล้นออกนอกปุ่มบนรางขวาที่กว้าง 330px
           ⇒ **ป้ายปุ่มบอกแค่การกระทำ** (มติผู้ใช้ 2026-08-12) — ชื่อคนที่ถืออยู่ตอนนี้
           ไม่ใช่หน้าที่ของปุ่ม มันอยู่บนการ์ดผู้รับผิดชอบและในเธรดอยู่แล้ว ·
           ชื่อเต็มเก็บไว้ที่ `title` เผื่อคนอยากรู้โดยไม่ต้องเลื่อนไปหา */
        label: assignee.name ? "เปลี่ยนผู้รับผิดชอบ" : "มอบหมายผู้รับผิดชอบ",
        title: assignee.name ? `ตอนนี้คือ ${assignee.name}` : undefined,
        kind: "edit",
        icon: UserPlus,
        onClick: () => setAssign(req.assigneeId || ""),
        visible: canAnswer,
      },
    ],
    dangerActions: editing ? [] : [
      {
        id: "delete",
        // ผู้ดูแลระบบลบได้ทุกสถานะ (break-glass) — คนอื่นได้เฉพาะร่างของตัวเอง
        // ป้ายต้องบอกตรง ๆ ว่ากำลังใช้สิทธิ์อะไร ไม่ใช่เขียน "ลบร่าง" แล้วลบใบจริง
        label: isAdmin && req.status !== "draft"
          ? "ลบคำร้อง (ผู้ดูแลระบบ)"
          : "ลบคำร้องร่าง",
        kind: "delete",
        icon: Trash2,
        onClick: () => setConfirm({ kind: "delete" }),
        visible: isAdmin || (req._mine && req.status === "draft"),
      },
      {
        // ⚠️ อยู่ในกลุ่ม danger เพราะมันผลักงานกลับไปหาคนอื่น แต่ **ไม่ใช่
        // การทำลาย** — ใบยังอยู่ เลขที่เดิม ผู้ขอแก้แล้วส่งซ้ำได้
        id: "bounce",
        label: "ตีกลับให้แก้ไข",
        kind: "cancel",
        icon: Undo2,
        onClick: () => setBounceReason(" "),
        visible: owner && req.status === "pending",
      },
      {
        id: "cancel",
        label: "ยกเลิกคำร้อง",
        kind: "cancel",
        icon: Ban,
        onClick: () => setCancelReason(" "),
        visible: req._mine && !["closed", "cancelled", "answered"].includes(req.status),
      },
    ],
  });
  // ⭐ **กติกา "ช่องไหนขึ้นเมื่อไร" อยู่ที่ `lib/requests/headerFacts.js`** พร้อมเทสต์
  // (ม-98 · ม-101) — ของเดิมประกอบตรงนี้กลาง JSX แล้วให้ "ลูกค้า" กับ "ตอบแล้ว"
  // สลับกันใช้ช่องเดียว ⇒ ใบที่มีบรรทัดไม่เคยโชว์ลูกค้าเลย (IS-26080003)
  // ⚠️ ไอคอนอยู่ที่นี่ ไม่ใช่ในไลบรารี — ไลบรารีต้องไม่ import component ของ React
  // (เทสต์รันด้วย node เปล่า) · คีย์ที่ไม่มีไอคอนไม่ต้องประกาศ
  const FACT_ICONS = { submitted: CalendarClock };
  const headerFacts = requestHeaderFacts(req, { hasItems, progress })
    .map((fact) => ({ ...fact, icon: FACT_ICONS[fact.key] }));

  /* ⭐ **ชิปผู้ยื่น** (ม-101) — ใบของใคร อ่านพร้อมเลขที่ใบในสายตาเดียว
     ⚠️ ใช้ `_opener` ไม่ใช่ `_mine` — ตั้งแต่ทีมทำแทนกันได้ (ม-100) `_mine` แปลว่า
     "จัดการได้" ⇒ ป้าย "ใบของฉัน" จะไปขึ้นบนใบของเพื่อนร่วมทีม
     ⚠️ **ผู้รับเรื่องไม่อยู่ตรงนี้** — เคยลองทำเป็นชิปคู่ แล้วผู้ใช้เลือกบรรทัด
     "รับเรื่องโดย …" ใต้หัวใบแทน (ม-101.2) · มีที่เดียวพอ */
  const people = requestHeaderPeople(req, { mine: !!req._opener });
  const initials = (name) => naText(String(name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase());
  const peopleRow = people ? (
    <span className={`${styles.person} ${people.requester.mine ? styles.personSelf : styles.personTeam}`}>
      <span className={styles.personAvatar}>{initials(people.requester.name)}</span>
      {people.requester.label}
      {people.requester.team ? ` · ทีม ${people.requester.team}` : ""}
      {people.requester.mine ? null : <b>{people.requester.name}</b>}
    </span>
  ) : null;

  /* ⭐ **เนื้อคำร้องอยู่ในคอลัมน์เนื้อหา ไม่ใช่ในหัวใบ** (ผู้ใช้ทัก 2026-08-11)
     เดิมวางเป็นลูกของหัวใบ ⇒ ข้อความยาว ๆ (บรีฟกลิ่นของจริงยาวหลายย่อหน้า) ทำให้
     หัวใบสูงเป็นหน้าจอ **แล้วดันการ์ด "จัดการคำร้อง" ลงไปอยู่ใต้พับ** ทั้งที่มันคือ
     ที่ที่ปุ่มทุกปุ่มอยู่ · ย้ายลงคอลัมน์ซ้ายแล้วการ์ดขวาเริ่มที่บรรทัดเดียวกับเนื้อเรื่อง
     และความกว้างของบรรทัดลดลงเองตามคอลัมน์ (อ่านง่ายขึ้นด้วย) */
  /* ⚠️ **หลบให้โหมดแก้ด้วย** (มติผู้ใช้ 2026-08-24) — การ์ดนี้อยู่คนละที่กับหัวใบ
     (คอลัมน์เนื้อ ไม่ใช่ในหัวใบ) จึงต้องกันแยกอีกจุด · มันคือ `req.body` ตัวเดียวกับ
     ช่อง "รายละเอียดเพิ่มเติม" ที่ฟอร์มกำลังแก้อยู่ ⇒ ปล่อยไว้ = พิมพ์ข้างบนแล้ว
     ข้างล่างยังเป็นค่าเดิม อ่านเหมือนแก้ไม่ติด */
  const requestBodyBlock = (!editing && (req.body || req.note)) ? (
    <DetailCard icon={MessageCircleQuestion} title="รายละเอียดคำร้อง" className={styles.bodyCard}>
      {/* ⭐ RichText ไม่ใช่ ReadableText: ผู้ใช้วาง URL หรือรหัสเอกสารในรายละเอียด
          ได้ (ฟอร์มบอกไว้ว่าได้) ถ้าเรนเดอร์เป็นข้อความเปล่าก็กดไม่ได้ = สัญญาที่
          ฟอร์มให้ไว้ไม่เป็นจริง */}
      {req.body && <RichText text={req.body} lines={12} className={styles.requestBody} />}
      {/* `note` เลิกเขียนใหม่แล้ว — ยังแสดงของเก่าที่มีค่าอยู่ ไม่ซ่อนข้อมูลที่คน
          เคยพิมพ์ไว้ (คอลัมน์ยังไม่ถูก DROP) */}
      {req.note && <ReadableText text={req.note} lines={4} className={styles.requestNote} />}
    </DetailCard>
  ) : null;

  /* ไฟล์แนบระดับหัวคำร้อง — เพิ่งมีที่แนบตั้งแต่ 2026-08-03 (เดิมแนบได้เฉพาะรายบรรทัด
     ของหัวข้อขอราคา → พัฒนากลิ่น/พัฒนาสูตร ที่ต้องมีรูปอ้างอิงมากที่สุดแนบไม่ได้เลย
     ต้องส่งกันทาง LINE) · ประกาศครั้งเดียวแล้ววางได้สองที่ตามโครงของหัวข้อ */
  return (
    <Workspace hideHeader back={back}>
      {/* หัวเรื่องพูดภาษาของชนิดคำร้อง — หน้านี้เคยเขียนว่า "เคสขอราคาวัสดุ" ทุกจุด
          ทั้งที่รับคำร้องหลายชนิด · พัฒนากลิ่นที่ขึ้นว่า "รายการ 0 · ตอบแล้ว 0/0"
          อ่านแล้วเหมือนข้อมูลหาย ไม่ใช่ชนิดที่ไม่มีบรรทัดตั้งแต่แรก
          ⭐ **หัวใบเดียวจบ** — สถานะ · รางก้าว · ข้อเท็จจริง · เนื้อคำร้อง · ไฟล์แนบ ·
          ปุ่ม เรียงตามลำดับที่คนอ่านจริง · ฝ่ายผู้ตอบขึ้นไปอยู่กับชนิดบน eyebrow
          เพราะสองอย่างนี้คือ "ใบนี้คืออะไร ส่งไปไหน" ซึ่งอ่านคู่กันเสมอ */}
      {/* ── เนื้ออ่านอย่างเดียวของใบ — **หลบให้โหมดแก้** (มติผู้ใช้ 2026-08-24) ─────
          ผู้ใช้ทัก: *"การกดแก้ไข ควรไม่มีรายละเอียด detail ของคำร้องสิ ควรโชว์แค่
          ส่วนที่เหมือนตอนสร้างคำร้อง"*
          🐞 ก่อนหน้านี้กดแก้แล้วได้ **ของเดียวกันสองชุดในหน้าเดียว**: ฟอร์มแก้ข้างบน
          กับหัวใบ/ตารางเอกสาร/การ์ดบริบทที่โชว์ค่าเดิมอยู่ข้างล่าง (วัดแล้วหน้ายาว
          2,937px) ⇒ พิมพ์ในฟอร์มแล้วข้างล่างไม่ขยับ อ่านเหมือนแก้ไม่ติด
          ⚠️ **ไม่ซ่อนทั้งหน้า** — ที่ยังอยู่คือของที่ฟอร์มไม่มี และคนกำลังแก้ต้องใช้:
            · แผงจัดการ — ปุ่ม "บันทึกการแก้ไข / ยกเลิก" อยู่ที่นั่น
            · ไฟล์แนบของคำร้อง — แท็บ "กำหนดและไฟล์" ของฟอร์มชี้มาที่การ์ดนี้ตรง ๆ
            · ความเคลื่อนไหว — เหตุผลที่ถูกตีกลับอยู่ในเธรด (`appendRequestEvent`)
              ซึ่งเป็นสิ่งที่คนกดแก้หลังโดนตีกลับกำลังตามอ่านพอดี */}
      {!editing && (
      <SalesDetailOverview
        eyebrow={`${requestKindLabel(req.kind)} · ถึง ${req.dept}`}
        title={req.docNo || `${requestKindLabel(req.kind)} (ร่าง)`}
        /* ⭐ ลูกค้าต่อท้ายหัวข้อเรื่องเป็นประโยคเดียว "ทำอะไร ให้ใคร" (ม-101) —
           เดิมลูกค้าเป็นช่องในแถบซึ่งหายไปทั้งใบเมื่อใบนั้นมีบรรทัด */
        description={
          <span className={styles.subject}>
            {req.title || requestKindLabel(req.kind)}
            {req.customerName ? (
              <>
                {" · ให้ "}
                {/* ⭐ รหัส AR อยู่ **หน้าชื่อ** (มติผู้ใช้ 2026-08-21) — กติกาเดียวกับ
                    ทุกหน้ารายละเอียด · เดิมห้อยท้ายชื่อเป็นชิป ซึ่งอ่านเป็นของแถมมากกว่า
                    ตัวชี้ทะเบียน และไม่ตรงแนวกับหน้าอื่น
                    ⚠️ nowrap — "AR-787" ที่ขึ้นบรรทัดใหม่ตรงขีดกลางอ่านเป็นคนละรหัส */}
                {req.refCustomer?.arCode ? (
                  <span className={styles.arCode}>{req.refCustomer.arCode}</span>
                ) : null}
                <b>{req.customerName}</b>
              </>
            ) : null}
          </span>
        }
        meta={peopleRow}
        /* ⚠️ **หัวใบไม่มีทั้งป้ายสถานะและปุ่มระดับใบ** — ทั้งสองอย่างอยู่การ์ด
           จัดการที่เดียว (ย้าย ไม่ก๊อป — บทเรียนรางขวารุ่นแรกที่พูดซ้ำหัวใบทุกบรรทัด) */
        facts={headerFacts}
      >

        {/* ⭐ **ผู้รับเรื่องย้ายไปอยู่บนราง** (แผน scent-dev-detail-fix-plan งวด 3) —
            ขั้น "รอรับเรื่อง" จบลงตอนมีคนรับ ⇒ ชื่อกับวันที่คือหลักฐานของขั้นนั้น
            ทรงเดียวกับรางของใบสั่งขายที่ทุกขั้นพกค่าจริงของใบ
            ⚠️ **ย้าย ไม่ก๊อป** — เคยมีทั้งชิปบนหัวใบและบรรทัดนี้พร้อมกัน แล้วมันพูดซ้ำ
            คำต่อคำ (ชื่อเดียวกัน วันที่เดียวกัน) ผู้ใช้ทักทันที (ม-101.2) · รอบนี้ก็เหมือนกัน
            บรรทัดนี้จึงเหลือเฉพาะ **รหัสสูตร** ซึ่งยังไม่มีที่อยู่อื่นบนหัวใบ */}
        {/* ⭐ **เลขที่เอกสารของ PDR** (mig 0271) — คนละเลขกับหัวเรื่องข้างบน
            ซึ่งเป็น `docNo` (เลขที่คำร้อง) · ที่นี่คือเลขที่พิมพ์บนกระดาษ FM-RD-01
            ⇒ คนที่ถือกระดาษอยู่ตรงหน้าต้องหาใบในระบบเจอด้วยเลขนี้
            ⚠️ อยู่บรรทัดนี้ ไม่ใช่ในแถบข้อเท็จจริง — แถบนั้นเหลือแต่เรื่องเวลาแล้ว
            (มติ ม-101 · ดู lib/requests/headerFacts.js) */}
        {(req.pdrRefNo || req.formulaCode) && (
          <p className={styles.headMeta}>
            {[
              req.pdrRefNo ? `เลขที่เอกสาร ${req.pdrRefNo}` : null,
              req.formulaCode ? `สูตร ${req.formulaCode}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* ⭐ ขึ้นเฉพาะตอนยังเป็นร่าง — ส่งซ้ำแล้วค่าเดิมยังอยู่ในคอลัมน์ (เป็นประวัติ)
            แต่ไม่ควรค้างบนจอ ไม่งั้นใบที่แก้แล้วยังดูเหมือนถูกตีกลับอยู่ */}
        {req.status === "draft" && req.bounceReason && (
          <div className={styles.bounced}>
            <strong>{req.dept} ตีกลับให้แก้ไข</strong>
            {req.bouncedByName ? ` · ${req.bouncedByName}` : ""}
            {req.bouncedAt ? ` · ${fmtDate(req.bouncedAt)}` : ""}
            <ReadableText text={req.bounceReason} lines={6} />
          </div>
        )}
        {req.status === "cancelled" && req.cancelReason && (
          <div className={styles.cancelledReason}>
            <strong>เหตุผลที่ยกเลิก: </strong><ReadableText text={req.cancelReason} lines={4} />
          </div>
        )}

        {/* ⭐ **ไฟล์แนบย้ายไปคอลัมน์ขวา** (มติผู้ใช้ 2026-08-09) — มันเป็นของ *ทั้งใบ*
            เหมือนปุ่มระดับใบ · วางเป็นแถบกว้างใต้หัวใบทำให้จอแรกเป็นกล่องว่างเปล่า
            ครึ่งจอ ทั้งที่ส่วนใหญ่ไม่มีไฟล์ · ท้ายเธรดก็ไม่ใช่ที่ของมัน — เธรดมีที่แนบ
            ของตัวเองรายข้อความอยู่แล้ว (ของสองอันนี้คนละความหมาย: ของใบ vs ของบทสนทนา)
            ⚠️ **ที่เดียวแล้วทุกหัวข้อ** — คอลัมน์ขวามีครบทุกใบตั้งแต่ ม-123 */}
      </SalesDetailOverview>
      )}

      {/* ── โหมดแก้: หัวใบ ─────────────────────────────────────────────────
          ⭐ **ในหน้า ไม่ใช่โมดัล** — แบบฟอร์ม PDR ก็แก้ในหน้าอยู่แล้ว และปุ่มบันทึก/
          ยกเลิกอยู่ที่แผงจัดการที่เดียว (มติผู้ใช้ 2026-08-09) ⇒ ปุ่ม "แก้ไข" ปุ่มเดียว
          เปิดทั้งสองส่วนบนพื้นเดียวกัน ไม่มีโมดัลซ้อนหน้าที่กำลังแก้อยู่
          ⚠️ ช่องมาจาก `RequestEditableFields` ตัวเดียวกับฟอร์มเปิดคำร้อง — ห้ามวาง
          Input/Textarea เองที่นี่ (กฎ AGENTS.md · เคยเพี้ยนมาแล้ว 6 จุด) */}
      {/* ── โหมดแก้: **ฟอร์มตัวเดียวกับตอนเปิดคำร้อง** ───────────────────────
          ⭐ มติผู้ใช้ 2026-08-24: *"หน้าแก้ ไม่เหมือนหน้าสร้างหรอ … ในทุกๆหัวข้อ
          ตามกฎ สร้างเหมือนกับแก้"* — ก่อนหน้านี้ที่นี่ประกอบการ์ดของตัวเองจากช่องกลาง
          ไม่กี่ช่อง ⇒ ได้ฟอร์มที่ไม่มีแท็บ ไม่มีเกจ "ยังขาดอะไร" และลำดับช่องคนละแบบ
          กับที่คนเพิ่งกรอกมาตอนเปิดใบ · แบบฟอร์ม PDR ก็ถูกวาดแยกอีกที่หนึ่ง
          (ใน `ScentDevDetail`) ⇒ ใบพัฒนากลิ่นมีพื้นที่แก้สองแห่งในหน้าเดียว
          ⚠️ ตอนนี้เป็น `RequestForm` ตัวเดียวกัน ต่างกันแค่ props ตามที่ AGENTS.md
          อนุญาต — เหตุผลของแต่ละข้ออยู่ที่หัวพร็อพ `mode` ของฟอร์ม */}
      {editDraft && (
        <DetailCard
          icon={Pencil} eyebrow="EDIT" title="แก้ข้อมูลคำร้อง"
          className={styles.editCard} id="request-edit"
        >
          <RequestForm
            mode="edit"
            value={editDraft}
            onChange={setEditDraft}
            /* ⚠️ **สองด่าน สลับมือคนละจังหวะ** — คนที่แก้ PDR ได้อาจแก้หัวใบไม่ได้แล้ว
               (และกลับกัน) ⇒ เทาส่วนที่ไม่ใช่ของตัวเอง ไม่ใช่ซ่อน · server ตัดสิน */
            disabled={saving || !canEditInfo}
            pdrDisabled={saving || !canEditPdrNow}
            lockKind
            deferMentions
            showBlocker={false}
            /* ป้ายของสิ่งที่ล็อกไว้ — มาจากใบที่ server ประกอบให้แล้ว ไม่ต้องโหลด
               ทะเบียนดีล/ใบสั่งขาย/ใบเสนอราคาทั้งชุดมาแปล id เป็นชื่อ */
            lockedRefs={{
              deal: req.refDeal
                ? `${req.refDeal.code || req.dealId}${req.refDeal.title ? ` — ${req.refDeal.title}` : ""}`
                : req.dealId || "",
              project: req.projectCode || req.projectName
                ? [req.projectCode, req.projectName].filter(Boolean).join(" — ")
                : "",
              customer: req.customerName || "",
              customerId: req.customerId || null,
              quotation: req.refQuotation?.quoteNumber || req.quotationId || "",
              salesOrder: req.refSalesOrder?.orderNumber || req.salesOrderId || "",
            }}
            billBaseAmount={req.billBaseAmount ?? null}
            /* ทะเบียนที่ช่อง "อ้างอิงเพิ่ม" กับตารางบรรทัดต้องใช้ — โหลดตอนกดแก้
               เท่านั้น (ใบส่วนใหญ่ไม่เคยถูกแก้ ⇒ ไม่ต้องจ่ายตอนเปิดอ่าน) */
            quotations={editRefs.quotations}
            salesOrders={editRefs.salesOrders}
            products={editRefs.products}
            productTypes={productTypes}
            scents={registry.scents}
            me={me}
          />
        </DetailCard>
      )}

      {/* ⭐ **แถวบริบทเต็มความกว้าง ทรงเดียวกับหน้าใบสั่งขาย** (โจทย์ผู้ใช้ 2026-08-18
          "เอาหน้ารายละเอียดใบสั่งขายเป็นตัวอย่าง") — การ์ดบริบทสามใบเคยต่อคิวอยู่ใน
          รางขวา 330px ⇒ วัดจริงบนใบ SB-26080010: รางสูง 1992px ส่วนคอลัมน์เนื้อสูง
          693px = ครึ่งล่างของหน้าเป็นรางเดี่ยวกับที่ว่าง 1026px ข้าง ๆ
          ⚠️ ทุกหน้ารายละเอียดของระบบวางบริบทแบบนี้อยู่แล้ว (ใบสั่งขาย · ดีล · โครงการ ·
          ลีด · งาน) — หน้าคำร้องเป็นหน้าเดียวที่ยัดไว้ในราง
          ⭐ ลำดับ ลูกค้า › โครงการ › ดีล › ใบสั่งขาย = ลำดับเดียวกับหน้าใบสั่งขาย
          (มติผู้ใช้ 2026-08-13 "ใครซื้อ → งานอยู่โครงการไหน → รอบขายไหน → ใบไหนต้นทาง")
          ⚠️ โชว์เฉพาะที่อ้างจริง — ใบที่ไม่ผูกโครงการไม่ต้องมีการ์ดเปล่า */}
      {/* ⚠️ โหมดแก้ไม่ต้องมี — แท็บ "งาน" ของฟอร์มโชว์ ลูกค้า/โครงการ/ดีล/ใบที่อ้าง
          ครบอยู่แล้ว (ช่องที่ถูกล็อก) ⇒ วางซ้ำคือของเดียวกันสองที่ในจอเดียว */}
      {!editing
        && (req.refCustomer || req.refProject || req.refDeal || req.quotationId || req.salesOrderId) && (
        <ContextGrid className={styles.contextRow}>
          {req.refCustomer && (
            <ContextCard
              href={`/database/customers/${req.refCustomer.id}`}
              icon={Building2}
              eyebrow="ลูกค้า"
              title={req.refCustomer.name || req.customerName}
              subtitle={req.refCustomer.arCode || undefined}
              facts={[{ label: "ผู้ติดต่อ", value: req.refCustomer.contactPerson }]}
            />
          )}
          {req.refProject && (
            <ContextCard
              href={`/sa/projects/${req.refProject.code || req.refProject.id}`}
              icon={FolderKanban}
              eyebrow="โครงการ"
              title={req.refProject.name || req.refProject.code || req.refProject.id}
              subtitle={req.refProject.code || undefined}
            />
          )}
          {/* /sa/deals คือ URL คงที่ (rewrite ใน next.config) — เส้น
              /sales-planning/deals โดน redirect หนึ่งเด้ง */}
          {req.refDeal && (
            <ContextCard
              href={`/sa/deals/${req.refDeal.id}`}
              icon={Handshake}
              eyebrow="ดีล"
              title={req.refDeal.title || req.refDeal.code || req.refDeal.id}
              subtitle={req.refDeal.code || undefined}
            />
          )}
          {/* ⭐ **ใบสั่งขายที่หายไปทั้งใบ** (ผลตรวจ 2026-08-17) — `refSalesOrder`
              มากับ payload อยู่แล้วแต่ไม่เคยถูกเรนเดอร์ ⇒ ลิงก์เดินทางเดียว:
              หน้าใบสั่งขายชี้มาที่คำร้อง (เลน "บรีฟกลิ่น") แต่กลับไม่ได้
              ⚠️ **ไม่ใส่ `facts` จำนวนกลิ่นที่นี่** — การ์ดสรุปบนรางบอกไปแล้ว
              ใส่ซ้ำก็ได้ตัวเลขเดียวกันสองที่ที่ต้องคอยดูแลให้ตรงกัน */}
          {/* ⭐ ใบเสนอราคาย้ายขึ้นมาจากรางขวา (มติผู้ใช้ 2026-08-18) — เดิมอยู่ในการ์ด
              "อ้างอิงของใบนี้" ของแผงใบวางบิล ซึ่งทำให้บริบทของใบแตกเป็นสองที่:
              ลูกค้า/โครงการ/ดีล/SO อยู่แถวบน แต่ QT อยู่รางขวา · แถมใบสั่งขายโผล่
              ซ้ำทั้งสองที่ ⇒ ยุบมาไว้แถวเดียวตามลำดับ "ใครซื้อ → โครงการ → รอบขาย
              → ใบไหนต้นทาง" เหมือนหน้าใบสั่งขาย
              ⚠️ **ผูกไว้แต่ตามกลับไม่เจอ = ใบถูกลบ ต้องบอกตรง ๆ** (กติกาเดิมของการ์ด
              ที่ถูกยุบมา) ⇒ เงื่อนไขดูที่ `quotationId` ไม่ใช่ `refQuotation`
              ไม่งั้นใบที่ต้นทางถูกลบจะเงียบหายไปทั้งการ์ด */}
          {req.quotationId && (
            <ContextCard
              href={req.refQuotation ? `/sa/quotations/${req.quotationId}` : undefined}
              icon={FileText}
              eyebrow="ใบเสนอราคา"
              title={req.refQuotation?.quoteNumber || "ถูกลบไปแล้ว"}
            />
          )}
          {req.salesOrderId && (
            <ContextCard
              href={req.refSalesOrder ? `/sa/sales-orders/${req.salesOrderId}` : undefined}
              icon={FileText}
              eyebrow="ใบสั่งขาย"
              title={req.refSalesOrder?.orderNumber || "ถูกลบไปแล้ว"}
            />
          )}
        </ContextGrid>
      )}

      {/* ⭐ **โครงเดียวทุกหัวข้อ** (ม-123 — จบการย้ายทีละหัวข้อที่เริ่มไว้ 2026-08-09):
          การ์ดขวา DOCUMENT CONTROL ถือ สถานะ + รางแนวตั้ง + ปุ่มระดับใบ **ที่เดียว**
          (หัวใบ/ท้ายเธรดไม่มีปุ่ม — ย้าย ไม่ก๊อป · บทเรียนรางขวารุ่นแรกที่ถูกยุบเพราะ
          การ์ดพูดซ้ำหัวใบทุกบรรทัด) */}
      <DetailPageLayout
        className={styles.detailLayout}
        asideLabel="จัดการคำร้อง"
        /* ⭐ จอแคบให้การ์ดจัดการขึ้นก่อนเนื้อ — หน้านี้ปุ่มระดับใบ **ทั้งชุด** อยู่บน
           การ์ดนั้นที่เดียว (ม-122) และไม่มีแถบก้าวท้ายเธรดเป็นทางเข้าสำรองแล้ว
           ⇒ ที่ ≤1050px ปุ่มเดียวของใบเคยไปอยู่ก้นหน้า (วัดจริง y=1843 จาก 2269)
           ⚠️ หน้าที่ "เนื้อ" คือคำถามแรกไม่ควรเปิดโหมดนี้ตามไปเฉย ๆ — ดูคอมเมนต์
           ที่ `DetailPageLayout` ก่อน */
        controlFirst
        aside={(
          <>
            {/* ⭐ **ปุ่มระดับใบอยู่บนการ์ดจัดการ** (ม-122) — ทรงเดียวกับหน้า QT/SO/
                บัญชีที่ใช้ `DocumentControlCard` ตัวเดียวกันอยู่แล้ว ⇒ ทั้งเว็บวางปุ่ม
                ระดับเอกสารที่เดียวกัน
                ⚠️ ไม่มีหัวข้อ/คำใบ้แยกบนการ์ด — รางข้างบนพูดประโยคเดียวกันอยู่แล้ว
                (บั๊กเดิมของรางขวารุ่นแรก: การ์ดพูดซ้ำทุกบรรทัดจนต้องยุบทิ้ง) */}
            {/* ⭐ `statusDescription` + `notices` — สองช่องที่การ์ดกลางมีให้อยู่แล้ว
                แต่หน้านี้ปล่อยว่างมาตลอด (หน้าใบสั่งขายใช้ครบ) · ผลคือใบที่ไม่มีปุ่มให้
                คนคนนี้กด จะเห็นแค่การ์ดเปล่า ไม่มีอะไรบอกว่ารออะไรหรือต้องไปบอกใคร
                · statusDescription = ก้าวปัจจุบันบนราง (ก้อนเดียวกับที่รางวาด — ไม่ได้
                  เขียนประโยคใหม่ให้ต้องคอยดูแลให้ตรงกัน)
                · notices = อุปสรรคที่เป็นของ "คนที่กำลังดูอยู่" ณ ตอนนี้ */}
            <DocumentControlCard
              title="จัดการคำร้อง"
              /* ⚠️ **ป้ายมาจาก `requestStatusView` ไม่ใช่ `status` ดิบ** (มติผู้ใช้
                 2026-08-19) — ใบที่รับเรื่องแล้วแต่ยังไม่แจ้งวันต้องอ่านว่า "รอกำหนดส่ง"
                 ไม่ใช่ "กำลังดำเนินการ" ซึ่งฟังเหมือนมีวันแล้ว */
              status={requestStatusView(req).label}
              statusColor={requestAwaitingDue(req) ? "var(--amber)" : STATUS_TONE[req.status]}
              statusDescription={workflowSteps[workflowIndex]?.hint}
              workflowSteps={workflowSteps}
              primaryAction={requestActions.primaryAction}
              secondaryActions={requestActions.secondaryActions}
              dangerActions={requestActions.dangerActions}
              busy={saving}
              /* ⚠️ ป้ายเปล่า ไม่ทาสีเอง — โทนตั้งต้นของป้ายเป็นกลางอยู่แล้ว และนี่คือ
                 ข้อเท็จจริง (ตอนนี้เป็นของฝ่ายไหน) ไม่ใช่คำเตือน */
              notices={editBlocker && !canEditInfo && !canEditPdrNow ? (
                <span className="ui-badge">{editBlocker}</span>
              ) : null}
            />
            {/* ⚠️ **การ์ดบริบทไม่อยู่ในรางแล้ว** (2026-08-18) — ย้ายขึ้นไปเป็นแถว
                `ContextGrid` เต็มความกว้างใต้หัวใบ ทรงเดียวกับหน้าใบสั่งขาย/ดีล/โครงการ
                · ย้าย ไม่ก๊อป: ห้ามวางกลับที่นี่อีก ไม่งั้นได้ลิงก์เดียวกันสองที่ */}
            {/* การ์ดรายหัวข้อ — ส่งก้อนชุดเดียวกับ KindDetail แล้วให้หัวข้อหยิบ
                ของตัวเอง (แพตเทิร์น ม-34 เดียวกับเนื้อกลางหน้า) */}
            {KindPanel && (
              <KindPanel
                request={req}
                docBoard={docBoard}
                docTotals={docTotals}
                formulaBoard={formulaBoard}
                formulaTotals={formulaTotals}
                board={board}
                briefSummary={briefSummary}
                {...reconcileProps}
              />
            )}
            {/* ⚠️ **ประวัติการทำรายการกับไฟล์แนบไม่อยู่ในรางแล้ว** (2026-08-18) —
                ลงไปท้ายคอลัมน์เนื้อ ตำแหน่งเดียวกับ AUDIT TRAIL ของหน้าใบสั่งขาย
                เหตุผลเป็นเรื่องสัดส่วน ไม่ใช่รสนิยม: วัดบน SB-26080010 ก่อนย้าย
                ราง 1992px vs เนื้อ 693px ⇒ ของ "เย็น" สองใบนี้ดันรางลงไปอีก 264px
                ในคอลัมน์ 330px ทั้งที่ข้าง ๆ ว่าง 1026px */}
          </>
        )}
      >
        {requestBodyBlock}
        {/* ⭐ สแต็กเดียวคุมระยะของทุกก้อนในคอลัมน์นี้ (ม-121) — เดิมเป็น `<div>` เปล่า
            ⇒ `gap` ของ `.main` ตกไม่ถึงลูก การ์ดทุกใบชนกัน 0px */}
        <div className={styles.stack}>

      {/* ⭐ **เนื้อของหน้าเลือกตามหัวข้อ** (ม-34) — หน้านี้เหลือหน้าที่ "เปลือก":
          หัวใบ · เธรด · โมดัลของแต่ละก้าว · ส่วนที่ต่างกันรายหัวข้อ (PDR · ตารางสรุป ·
          กระทบยอด SO · การ์ดรายแถว) อยู่ในไฟล์ของหัวข้อนั้น
          ⚠️ เพิ่มหัวข้อใหม่ **ห้ามมาแก้ไฟล์นี้** — ลงทะเบียนที่ `details/index.js` */}
      {/* ⚠️ **ส่งของทุกหัวข้อไปให้ครบ แล้วให้ component ของหัวข้อหยิบตัวของตัวเอง**
          — เลือกให้ที่นี่ต้องรู้ว่าหัวข้อไหนใช้ก้อนไหน ซึ่งเป็นความรู้ของหัวข้อ ไม่ใช่
          ของเปลือก (ม-34) · เคยเขียนเป็น `docBoard.length ? … : …` ซึ่งเดาจากข้อมูล
          ⇒ ใบร่างที่ยังไม่มีแถวจะตกไปใช้ก้อนของหัวข้ออื่นเงียบ ๆ */}
      {/* `rowStep` = ปุ่มก้าวติดแถวในตาราง (มติผู้ใช้ 2026-08-09) — ก้าวรายแถว
          อยู่ในตารางของหัวข้อที่เดียว แถบท้ายเธรดไม่รับก้าวระดับใบแล้ว */}
      {/* ⚠️ โหมดแก้ไม่ต้องมี — ตารางรายการของหัวข้อคือของชุดเดียวกับรางในแท็บ
          "รายละเอียด" ของฟอร์ม · และที่ขั้น draft/pending (ขั้นเดียวที่แก้ได้) ยังไม่มี
          แถวไหนเดินก้าว ⇒ คอลัมน์สถานะ/ก้าวถัดไปว่างทั้งตารางอยู่แล้ว */}
      {!editing && (
      <KindDetail
        request={req}
        categories={productTypes}
        canEditAttachments={(req._mine || owner)
          && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
        rowStep={{
          // ⭐ ใบยังไม่ถูกรับเรื่อง = ยังไม่มีก้าวรายแถวให้กด (มติผู้ใช้ 2026-08-20)
          requestPending: req.status === "pending",
          // ป้าย "รอใคร" ของก้าวรายแถว — ชื่อฝ่ายจริงทั้งสองฝั่ง (มติผู้ใช้ 2026-08-20)
          deptLabel: requestSideLabel(req, "dept"),
          requesterLabel: requestSideLabel(req, "requester"),
          canDept: canAnswer,
          canRequester: !!req._mine && REQUEST_OPEN_STATUSES.includes(req.status),
          busy: saving,
          onHop: (row, hop, outcome) => openHop(row, hop, outcome),
          onPrice: (row) => setPricing({ item: row, price: "", validUntil: "", note: "" }),
        }}
        saving={saving}
        /* ⭐ หัวข้อที่แก้ของกลาง (ทะเบียนกลิ่น/สูตร) ได้จากในใบ ต้องบอกเปลือกให้
           โหลดใบใหม่ — ค่าที่ตารางโชว์เป็นค่าสดที่มากับ payload ของใบ (ม-129) */
        onReload={load}
        /* ปุ่มลงมือของ "ก้อนงาน" ในตารางสรุป — พัฒนากลิ่นใช้เป็นปุ่มส่งงานรายบรีฟ
           ส่วนพัฒนาสูตรใช้เป็นปุ่มส่งรวบหลายแถว (ทั้งคู่คือของที่เคยอยู่บน Control Panel) */
        onDeliver={openDelivery}
        bulkReady={{
          count: bulkReadyRows(req.items || []).length,
          onOpen: () => setBulkReady({
            rows: bulkReadyRows(req.items || []).map((item) => ({
              item, formula: formulaDraftFor(item),
            })),
          }),
        }}
        board={board}
        briefSummary={briefSummary}
        formulaBoard={formulaBoard}
        formulaTotals={formulaTotals}
        docBoard={docBoard}
        docTotals={docTotals}
        {...reconcileProps}
      />
      )}

      {/* เธรดคุยกันในคำร้อง (mig 0163) — เดิมคำถามอย่าง "ขวดสีชามีไหม / MOQ 500 ได้ไหม"
          ต้องโทรออกนอกระบบ เหตุผลของราคาเลยหายไปกับสาย · เหตุการณ์ของใบ
          (ส่ง/รับเรื่อง/ตอบ/ปิด) ระบบเขียนลงสายเดียวกันให้เอง */}
      <DetailCard icon={History} eyebrow="ACTIVITY" title="ความเคลื่อนไหวของคำร้อง">
        {/* 🐞 เคยส่งชื่อชุดก่อน mig 0173 (ชื่อเก่าของคำร้อง/บรรทัดคำร้อง) — เธรดเลย
            อ่านคนละคีย์กับที่ server เขียนเหตุการณ์ลงไป (`dept_request`) ผลคือ
            **ไม่เห็นทั้งเหตุการณ์ของระบบและข้อความเก่า** และข้อความใหม่ตกไปอยู่คีย์
            ที่ไม่มีใครอ่าน (ไฟล์แนบพลาดคู่กัน) · เทสต์กันไว้แล้วที่
            lib/master/entityTypeUsage.test.mjs */}
        {/* ⭐ **กล่องเดียว เรียงตามเวลา ตั้งต้นเห็นครบ** (มติผู้ใช้ 2026-08-18) —
            ทับมติ 2026-08-17 ที่แยกเหตุการณ์ระบบไปการ์ด "ประวัติการทำรายการ" ต่างหาก
            🐞 เหตุที่มติเดิมเกิด: การ์ดพาดหัวว่า "พูดคุยในคำร้องนี้" แต่เป็น log ล้วน
            บน 16 ใบจาก 32 (นับจริง 132 แถว = ข้อความคน 33 · เหตุการณ์ระบบ 99)
            🐞 เหตุที่มติเดิมถูกทับ: **พาดหัวคือปัญหา ไม่ใช่การเรียงรวม** · พอย้าย log
            ลงมาคอลัมน์เดียวกับเธรด (2026-08-18) อาการโผล่ทันที — ใบ SB-26080010 ได้
            การ์ด "พูดคุย" ว่างเปล่าวางติดการ์ด log ที่มี 3 แถว · และใบที่เลื่อนวันสองรอบ
            (FD-26080006) เหตุการณ์อยู่กล่องหนึ่ง ข้อความที่คุยเรื่องเลื่อนอยู่อีกกล่อง
            ⇒ ไล่เรื่องต่อกันไม่ได้ ทั้งที่ *ลำดับ* คือเนื้อหาของใบชนิดนี้
            ⇒ กล่องเดียว **ชื่อกลาง ๆ ที่ไม่สัญญาว่าเป็นบทสนทนา** จึงไม่โกหกแม้ไม่มีใครพิมพ์
            ⚠️ ตั้งต้น `hideSystem = false` (เห็นครบ) — คนที่ไม่อยากเห็นกดสวิตช์ในเธรดได้
            และมันจำรายชนิดเอกสารให้เอง ไม่ต้องกดซ้ำทุกใบ */}
        <UpdateThread
          entityType="dept_request"
          entityId={req.id}
          placeholder="ถามสเปก / ต่อรอง MOQ / แจ้งข้อมูลเพิ่ม..."
          emptyText="ยังไม่มีความเคลื่อนไหว — ถามสเปกหรือเงื่อนไขไว้ตรงนี้ได้ แนบรูปตัวอย่างได้ด้วย"
          composeHint={composeHint}
          onPosted={load}
        />
      </DetailCard>

      {/* ⭐ ก้าวถัดไปอยู่ **ท้ายเธรด** ไม่ใช่บนรางรายแถว (ม-36 ก) — เธรดเป็นแกน
          ของหน้า สถานะกับบทสนทนาอยู่สายเดียวกัน แล้วจบด้วย "ต้องทำอะไรต่อ"
          ⭐ **ปักหมุดล่างจอ** (มติผู้ใช้ 2026-08-08 · อาการ "ไม่รู้ว่าต้องทำอะไรต่อ") —
          ใบที่คุยกันมา 20 ข้อความต้องเลื่อนผ่านทั้งเธรดกว่าจะเจอปุ่ม
          ⚠️ **ปักหมุด ไม่ใช่ย้าย** — ปุ่มยังอยู่ที่เดียวตามที่ ม-49/ม-57 บังคับ
          เปลี่ยนแค่ว่ามันติดจออยู่ตลอดระหว่างเลื่อนอ่าน
          ⚠️ **ต้องอยู่นอก `DetailCard`** — `.card { overflow: hidden }` ตัด sticky ทิ้ง
          ทันที (พิสูจน์ในเบราว์เซอร์ 2026-08-08) · ตำแหน่งบนหน้ายังท้ายเธรดเหมือนเดิม */}

      {/* ⭐ ไฟล์แนบของ **ทั้งใบ** — ย้ายลงมาจากท้ายราง (2026-08-18)
          ⚠️ **ต้องอยู่ใต้เธรด ไม่ใช่ใต้การ์ดงาน** — ลองวางใต้การ์ดงานแล้ววัดจริงบน
          SB-26080010: กล่องลากวางของ direction (ท้ายการ์ดงาน) กับกล่องลากวางของใบ
          ห่างกัน 160px หน้าตาเหมือนกันเป๊ะ ⇒ อ่านไม่ออกว่าไฟล์จะไปลงใบหรือลง direction
          · ของสองอันนี้คนละความหมาย (ของใบ vs ของ direction) ต้องไม่ติดกัน
          ⚠️ ที่ 330px บนรางเดิม กล่องลากวางกว้างพอแค่ปุ่มเดียว — เต็มความกว้างของ
          คอลัมน์เนื้อทำให้รายชื่อไฟล์อ่านได้จริงโดยไม่ตัดคำ */}
      <DetailCard icon={Paperclip} eyebrow="ATTACHMENTS" title="ไฟล์แนบของคำร้อง">
        <AttachmentsPanel
          entityType="dept_request"
          entityId={req.id}
          canEdit={(req._mine || owner) && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
          inlineUpload
        />
      </DetailCard>

      {/* ⚠️ **ไม่มีการ์ด `UpdateLog` แยกแล้ว** (มติผู้ใช้ 2026-08-18) — เหตุการณ์ระบบ
          กลับไปเรียงในสายเดียวกับข้อความคนที่การ์ด "ความเคลื่อนไหวของคำร้อง" ข้างบน
          · `UpdateLog` ยังอยู่ในระบบให้ entity อื่นใช้ ห้ามเอากลับมาที่หน้านี้
          เพราะแถวชุดเดียวกันจะโผล่สองกล่อง */}
        </div>
      </DetailPageLayout>

      {/* ⭐ **ยังไม่จบ** (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง) — ถอนตราปิดที่กดไปแล้ว
          ⚠️ บังคับเหตุผล: ใบเด้งกลับมาโดยไม่มีใครรู้ว่าติดอะไร คือใบที่จะวนอีกรอบ */}
      <Modal
        open={reopen !== null} onClose={() => setReopen(null)} size="sm" dismissible={!saving}
        title="ยังไม่จบ — เปิดเรื่องกลับมา"
      >
        {reopen && (
          <>
            <div className="form-group">
              <label htmlFor="reopen-why">ยังเหลืออะไร *</label>
              <Textarea
                id="reopen-why" rows={3} maxLength={500}
                value={reopen.reason} disabled={saving}
                placeholder="เช่น กลิ่นที่ส่งมายังไม่ได้ให้ลูกค้าดม · ขอเอกสารเพิ่มอีกฉบับ"
                onChange={(e) => setReopen({ ...reopen, reason: e.target.value })}
              />
              <small className={styles.hint}>
                ตราปิดที่กดไปแล้วจะถูกถอน แล้วใบกลับมาอยู่ในคิวของทั้งสองฝั่ง
              </small>
            </div>
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" disabled={saving} onClick={() => setReopen(null)}>ยกเลิก</Button>
              <Button
                tone="danger" disabled={saving || !reopen.reason.trim()}
                onClick={() => call("", {
                  method: "PATCH",
                  body: JSON.stringify({ action: "reopen", reason: reopen.reason }),
                }, "เปิดเรื่องกลับมาแล้ว").then((ok) => { if (ok) setReopen(null); })}
              >
                ยังไม่จบ
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ⭐ **แจ้งกำหนดส่ง — ก้าวที่สองของฝ่ายผู้รับ** (มติผู้ใช้ 2026-08-19)
          ⚠️ ของเดิมโมดัลนี้คือ "รับเรื่อง — ระบุวันกำหนดส่ง" ซึ่งมัดสองก้าวไว้ด้วยกัน
          ⇒ ฝ่ายที่ยังตอบวันไม่ได้ต้องเดาวันไปก่อน หรือไม่ก็ไม่กดรับเลย */}
      <Modal
        open={commitDue !== null} onClose={() => setCommitDue(null)} size="sm" dismissible={!saving}
        title="แจ้งกำหนดส่ง"
      >
        {commitDue && (
          <>
            <div className="form-group">
              <label htmlFor="commit-due">วันกำหนดส่ง</label>
              <DateInput
                id="commit-due" value={commitDue.date} disabled={saving}
                onChange={(v) => setCommitDue({ ...commitDue, date: v })}
              />
              {/* วันที่ผู้ขอต้องการเป็นของผู้ขอ · วันกำหนดส่งเป็นของฝ่ายปลายทาง และ
                  เป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง — คนละช่อง คนละเจ้าของ */}
              <small className={styles.hint}>
                เป็นวันที่ {req.dept} รับปาก และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง
                {req.requestedDueDate ? ` · ผู้ขอต้องการรับงาน ${fmtDate(req.requestedDueDate)}` : ""}
              </small>
            </div>
            <div className="form-group">
              <label htmlFor="commit-why">หมายเหตุ (ไม่บังคับ)</label>
              <Textarea
                id="commit-why" rows={2} maxLength={500}
                value={commitDue.reason} disabled={saving}
                placeholder="เช่น รอวัตถุดิบเข้าวันที่ 25 — ส่งได้หลังจากนั้น"
                onChange={(e) => setCommitDue({ ...commitDue, reason: e.target.value })}
              />
            </div>
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" disabled={saving} onClick={() => setCommitDue(null)}>ยกเลิก</Button>
              <Button
                tone="primary" disabled={saving || !commitDue.date}
                onClick={() => call("", {
                  method: "PATCH",
                  body: JSON.stringify({
                    action: "commit-due",
                    committedDueDate: commitDue.date,
                    reason: commitDue.reason,
                  }),
                }, "แจ้งกำหนดส่งแล้ว").then((ok) => { if (ok) setCommitDue(null); })}
              >
                แจ้งกำหนดส่ง
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ⭐ เลื่อนวันกำหนดส่ง — **ไม่แก้เงียบ ๆ** วันนี้คือคำสัญญาที่ให้ฝ่ายขายไปแล้ว
          และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง ⇒ ลงเธรดว่าเลื่อนจากวันไหนเป็นวันไหน */}
      {/* ── แก้ข้อมูลคำร้อง (มติผู้ใช้ 2026-08-09) ────────────────────────────
          ⚠️ **ช่องที่นี่ต้องเท่ากับ `REQUEST_EDITABLE_FIELDS` เป๊ะ** — ลิสต์นั้นเป็น
          ของ API ด้วย · เพิ่มช่องที่นี่โดยไม่เพิ่มในลิสต์ = พิมพ์แล้วหายเงียบ
          ⚠️ ของที่ผูก (ดีล · ใบสั่งขาย · รายการ · หัวข้อ) แก้ทางนี้ไม่ได้ และ
          ข้อความในโมดัลบอกทางออกไว้ ไม่ใช่ปล่อยให้หาเอง */}
      <Modal
        open={!!reschedule} onClose={() => setReschedule(null)} size="sm" dismissible={!saving}
        title="เลื่อนวันกำหนดส่ง"
      >
        {reschedule && (
          <>
            <div className="form-group">
              <label htmlFor="resch-due">วันกำหนดส่งใหม่</label>
              <DateInput
                id="resch-due" value={reschedule.date} disabled={saving}
                onChange={(v) => setReschedule({ ...reschedule, date: v })}
              />
              <small className={styles.hint}>
                เดิมรับปากไว้ {req.committedDueDate ? fmtDate(req.committedDueDate) : NA}
              </small>
            </div>
            <div className="form-group">
              <label htmlFor="resch-why">เหตุผล (ไม่บังคับ)</label>
              <Textarea
                id="resch-why" rows={2} maxLength={500}
                value={reschedule.reason} disabled={saving}
                placeholder="บอกผู้ขอว่าทำไมต้องเลื่อน — จะได้ไปคุยกับลูกค้าต่อได้"
                onChange={(e) => setReschedule({ ...reschedule, reason: e.target.value })}
              />
            </div>
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" disabled={saving} onClick={() => setReschedule(null)}>ยกเลิก</Button>
              <Button
                tone="primary"
                disabled={saving || !reschedule.date || reschedule.date === req.committedDueDate}
                onClick={() => call("", {
                  method: "PATCH",
                  body: JSON.stringify({
                    action: "reschedule",
                    committedDueDate: reschedule.date,
                    reason: reschedule.reason,
                  }),
                }, "เลื่อนวันแล้ว").then((ok) => { if (ok) setReschedule(null); })}
              >
                บันทึกวันใหม่
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ⭐ กรอกเลขที่เอกสารเอง (ช่วงเปลี่ยนผ่าน · mig 0272) — ลอกเลขจากกระดาษที่ RD
          ออกไปแล้ว · ด่านรูปแบบตัวเดียวกับฝั่ง API (`pdrRefManualError`) เพื่อไม่ให้
          ปุ่มกับ server เห็นไม่ตรงกัน */}
      <Modal
        open={refDraft !== null} onClose={() => setRefDraft(null)} size="sm" dismissible={!saving}
        title={req.pdrRefNo ? "แก้เลขที่เอกสาร" : "กรอกเลขที่เอกสาร"}
      >
        {refDraft !== null && (
          <>
            <div className="form-group">
              <label htmlFor="pdr-ref-input">เลขที่เอกสารบนกระดาษ</label>
              <Input
                id="pdr-ref-input" value={refDraft} disabled={saving}
                placeholder="200869-016" inputMode="numeric" autoComplete="off"
                onChange={(e) => setRefDraft(e.target.value)}
              />
              <small className={styles.hint}>
                รูปแบบ DDMMYY-XXX (พ.ศ.) — ส่วนที่ต่อท้ายรหัสแบบฟอร์มบนกระดาษ
                เช่น FM-RD-01-<b>200869-016</b> · ใส่เลขตามที่ออกไปจริง ไม่ต้องตรงกับ
                วันที่รับเรื่องในระบบ
              </small>
            </div>
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" disabled={saving} onClick={() => setRefDraft(null)}>ยกเลิก</Button>
              <Button
                tone="primary"
                disabled={saving || !!pdrRefManualError(req, refDraft) || refDraft === req.pdrRefNo}
                onClick={() => call("", {
                  method: "PATCH",
                  body: JSON.stringify({ action: "pdr-ref-manual", pdrRefNo: refDraft }),
                }, "บันทึกเลขที่เอกสารแล้ว").then((ok) => { if (ok) setRefDraft(null); })}
              >
                บันทึกเลข
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* มอบหมายผู้รับผิดชอบ — ช่องเลือกคนตัวกลางของระบบ (`PersonSelect`)
          ⚠️ **เลือก "ยังไม่ระบุ" = ถอนการมอบหมาย** ไม่ใช่ปิดโมดัลเฉย ๆ — คนลาออก/
          ลาป่วยต้องเอางานออกจากมือได้ ไม่งั้นเขาค้างเป็นเจ้าของงานถาวร
          ⚠️ รายชื่อไม่กรองด้วยฝ่ายโดยตั้งใจ — งานข้ามฝ่ายมีจริง (RD ยืมคน QC มาช่วยดม)
          และการบล็อกจะบังคับให้ต้องไปแก้ทะเบียนก่อนถึงจะทำงานได้ */}
      <Modal
        open={assign !== null} onClose={() => setAssign(null)} size="sm" dismissible={!saving}
        title="มอบหมายผู้รับผิดชอบ"
      >
        {assign !== null && (
          <>
            <div className="form-group">
              <label htmlFor="assign-who">ผู้รับผิดชอบ</label>
              <PersonSelect
                id="assign-who" users={activePeople} value={assign} disabled={saving}
                emptyLabel="ยังไม่ระบุ (ถอนการมอบหมาย)"
                onChange={(v) => setAssign(v || "")}
              />
              <small className={styles.hint}>
                {req.acknowledgedByName
                  ? `ผู้กดรับเรื่อง: ${req.acknowledgedByName} — คนละช่องกับผู้รับผิดชอบ`
                  : "ยังไม่มีใครกดรับเรื่อง — มอบหมายไว้ก่อนได้"}
              </small>
            </div>
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" disabled={saving} onClick={() => setAssign(null)}>ยกเลิก</Button>
              <Button
                tone="primary"
                disabled={saving || assign === (req.assigneeId || "")}
                onClick={() => call("", {
                  method: "PATCH",
                  body: JSON.stringify({
                    action: "assign",
                    assigneeId: assign || null,
                    // ชื่อ ณ ตอนมอบหมาย — snapshot แบบเดียวกับ `acknowledgedByName`
                    assigneeName: assign
                      ? (personFullName(activePeople.find((u) => u.id === assign)) || null)
                      : null,
                  }),
                }, assign ? "มอบหมายแล้ว" : "ถอนการมอบหมายแล้ว").then((ok) => { if (ok) setAssign(null); })}
              >
                {assign ? "มอบหมาย" : "ถอนการมอบหมาย"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* รวบส่งของหลายแถว (พัฒนาสูตร · ช่องว่างข้อ 3) — วันที่ครั้งเดียว สูตรรายแถว
          ⚠️ ด่านต่อแถวใช้ `normalizeFormulaDelivery` ตัวเดียวกับ server และกับโมดัล
          รายแถว ⇒ สามทางเข้าตรวจเหมือนกันเป๊ะ */}
      <Modal
        open={!!bulkReady} onClose={() => setBulkReady(null)} size="lg" dismissible={!saving}
        title={bulkReady ? `ส่งงาน ${bulkReady.rows.length} รายการ — สูตรเข้าทะเบียนทันที` : ""}
      >
        {bulkReady && (
          <>
            {/* ไม่มีช่องวันส่ง (ม-92) — ระบบประทับวันที่กดให้ทุกแถว */}
            {bulkReady.rows.map((row, i) => (
              <div key={row.item.id} className={styles.bulkRow}>
                <div className="toolbar-label">{row.item.label}</div>
                {row.error && <p className={styles.error}>{row.error}</p>}
                {/* ฟอร์มเดียวกับทะเบียนสูตร — ลูกค้า/กลิ่น/หมวดของแถวนี้เทาไว้ให้อ่านได้
                    ว่าสูตรที่กำลังจะเกิดผูกกับอะไร */}
                <FormulaForm
                  mode="create" canSetCode codeRequired
                  value={row.formula} disabled={saving}
                  customers={registry.customers}
                  scents={registry.scents}
                  formulas={registry.formulas}
                  categories={productTypes}
                  locked={["customerId", "scentId", "categoryCode"]}
                  onChange={(value) => setBulkReady({
                    ...bulkReady,
                    rows: bulkReady.rows.map((r, j) => (i === j ? { ...r, formula: value } : r)),
                  })}
                />
                <div className="form-grid">
                  {/* ไฟล์ประกอบ (ม-91) — แถวมีอยู่แล้ว อัปตรงเข้าแถวนั้นทันที */}
                  <div className="form-group col-span-2">
                    <span className="toolbar-label">
                      ไฟล์ประกอบ <span className={styles.fieldHint}>(ไม่บังคับ)</span>
                    </span>
                    <AttachmentsPanel
                      entityType="dept_request_item"
                      entityId={row.item.id}
                      canEdit={!saving}
                      inlineUpload
                    />
                  </div>
                </div>
              </div>
            ))}
            {bulkReadyBlocker && <p className={styles.fieldHint}>{bulkReadyBlocker}</p>}
            <div className="form-actions-buttons">
              <Button variant="quiet" disabled={saving} onClick={() => setBulkReady(null)}>ยกเลิก</Button>
              <Button tone="accent" disabled={saving || !!bulkReadyBlocker} onClick={submitBulkReady}>
                {saving ? "กำลังส่ง…" : `ส่งงาน ${bulkReady.rows.length} รายการ`}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* บันทึกก้าวของแถว — กล่องเดียวรับทั้งห้าก้าว ช่องสลับตามก้าวที่กด
          ⭐ ห้ากล่องแยกจะได้ปุ่มยกเลิก/บันทึกและกติกาวันที่ห้าชุดที่ต้องคอยดูแลให้ตรงกัน
          ซึ่งเป็นโรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้ */}
      <Modal
        open={!!hopDraft} onClose={() => setHopDraft(null)} dismissible={!saving}
        /* ฟอร์มสูตรเป็นฟอร์มเต็มสองคอลัมน์ (ตัวเดียวกับทะเบียน) — กว้างเท่าโมดัลก้าวอื่น
           ไม่พอ · ก้าวอื่นยังแคบเหมือนเดิม เพราะมันมีช่องเดียวสองช่อง */
        size={hopDraft?.hop === "ready" && hopDraft?.item.lineKind === "product_dev" ? "md" : "sm"}
        title={hopDraft ? `${hopLabelFor(hopDraft.item, hopDraft.hop, hopDraft.outcome)} — ${hopDraft.item.label}` : ""}
      >
        {hopDraft && (
          <>
            {/* ⭐ ก้าวส่ง (ready) ไม่มีช่องวัน (ม-92) — ระบบประทับวันที่กดให้เอง
                ก้าวอื่นยังถาม: แก้ย้อนหลังได้ตั้งใจ — ของถูกส่งไปก่อนแล้วค่อยมา
                บันทึกเป็นเรื่องปกติ (migration จึงไม่มี CHECK บังคับให้วันเรียงกัน) */}
            {!["refuse", "ready", "unready"].includes(hopDraft.hop) && (
            <div className="form-group">
              <label htmlFor="hop-at">{HOP_DATE_LABEL[hopDraft.hop]}</label>
              <DateInput
                id="hop-at" value={hopDraft.at} disabled={saving}
                onChange={(v) => setHopDraft({ ...hopDraft, at: v })}
              />
            </div>
            )}

            {/* ⭐ ปฏิเสธ (สายเอกสาร · ม-85 · คำตาม ม-89) — เหตุผลบังคับ คือหลักฐาน
                แสดงติดแถวในตารางสรุปเสมอ (constraint answer_evidence บังคับคู่นี้) */}
            {hopDraft.hop === "refuse" && (
              <div className="form-group">
                <label htmlFor="hop-refuse-why">เหตุผลที่ปฏิเสธ</label>
                <Textarea
                  id="hop-refuse-why" rows={3} maxLength={2000}
                  value={hopDraft.note} disabled={saving}
                  placeholder="เช่น เนื้อสารตัวนี้ซื้อจากซัพพลายเออร์ ต้องขอเอกสารจากเขาโดยตรง"
                  onChange={(e) => setHopDraft({ ...hopDraft, note: e.target.value })}
                />
                <p className={styles.fieldHint}>
                  ผู้ขอเห็นเหตุผลนี้ติดแถวเอกสารในใบ — รายการจะจบแบบ &quot;ปฏิเสธ&quot;
                </p>
              </div>
            )}

            {/* ⭐ ดึงกลับ (มติผู้ใช้ 2026-08-20 — "เผื่อแนบผิด") — เหตุผลบังคับเหมือน
                "ดึงกลับ" ทุกที่ในระบบ (ใบเสนอราคา · ใบขอราคาผลิต) เพราะอีกฝั่งเห็น
                รายการเด้งกลับเอง · เหตุผลลงเธรดของใบ (ไม่มีคอลัมน์เก็บบนแถว)
                ⚠️ **บอกผลลัพธ์ให้ครบก่อนกด** (กติกาโมดัลยืนยัน #1223) — คนกดต้องรู้ว่า
                ไฟล์ไม่ได้หายไปไหน และต้องกลับมากด "ส่งงาน" ใหม่เอง */}
            {hopDraft.hop === "unready" && (
              <div className="form-group">
                <label htmlFor="hop-unready-why">เหตุผลที่ดึงกลับ</label>
                <Textarea
                  id="hop-unready-why" rows={3} maxLength={500}
                  value={hopDraft.note} disabled={saving}
                  placeholder="เช่น แนบไฟล์ผิดใบ / ไฟล์เป็นฉบับร่าง ขอส่งฉบับจริงแทน"
                  onChange={(e) => setHopDraft({ ...hopDraft, note: e.target.value })}
                />
                <p className={styles.fieldHint}>
                  รายการจะกลับไปขั้น &quot;กำลังทำ&quot; และเป็นตาของฝ่ายอีกครั้ง ·
                  <strong> ไฟล์ที่แนบไว้ยังอยู่ครบ</strong> — ลบตัวที่ผิดและแนบตัวใหม่ได้ใน
                  หน้าต่าง &quot;ส่งงาน&quot; แล้วกดส่งอีกครั้ง · ผู้ขอเห็นเหตุผลนี้ในเธรด
                </p>
              </div>
            )}

            {/* ⭐ ส่งเอกสาร (ม-89 · ม-90) — **โมดัลนี้คือที่แนบไฟล์ที่เดียวของสาย
                เอกสาร** เดิมแนบได้ทั้งการ์ดแถวและที่นี่ ผู้ใช้ชี้ว่าสองทาง = สับสน
                ("flow การส่งเอกสาร ต้องเป็นแบบเดียว") ⇒ การ์ดแถวเหลือดูอย่างเดียว
                (DocumentDetail) · ด่านฝั่ง server (ไฟล์ ≥ 1) ยังเป็น backstop */}
            {hopDraft.hop === "ready" && isDocLineKind(hopDraft.item.lineKind) && (
              <div className="form-group">
                <label>ไฟล์เอกสารที่จะส่ง (แนบได้หลายไฟล์)</label>
                <AttachmentsPanel
                  entityType="dept_request_item"
                  entityId={hopDraft.item.id}
                  canEdit={!saving}
                  inlineUpload
                />
                <p className={styles.fieldHint}>
                  ต้องมีอย่างน้อย 1 ไฟล์ก่อนกดบันทึก — หลังส่ง ไฟล์โผล่ที่การ์ดรายการ
                  และแท็บเอกสารของดีล/โครงการ
                </p>
              </div>
            )}

            {/* ⭐ ผลลัพธ์ของบรรทัดเอกสารการเงิน (B-3 · R-6) — บัญชีออกเอกสารจาก
                ระบบบัญชีข้างนอกแล้วทิ้งเลขที่ไว้ตรงนี้ · เลขที่คือสิ่งเดียวที่เชื่อม
                คำร้องกับเอกสารจริงได้ ⇒ ไม่มีเลข = ปิดใบแล้วตามกลับไม่เจอ */}
            {hopDraft.hop === "ready" && hopDraft.item.lineKind === "billing_doc" && (
              <>
                <div className="form-group">
                  <label htmlFor="hop-doc-number">เลขที่เอกสารที่ออกให้</label>
                  <Input
                    id="hop-doc-number" mono value={hopDraft.docNumber} disabled={saving}
                    placeholder="เช่น IV-26080012"
                    onChange={(e) => setHopDraft({ ...hopDraft, docNumber: e.target.value })}
                  />
                  <p className={styles.fieldHint}>
                    เลขที่จากระบบบัญชี — ผู้ขอใช้เลขนี้ตามเอกสารกลับ และค้นย้อนได้
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="hop-doc-due">วันครบกำหนดชำระ</label>
                  <DateInput
                    id="hop-doc-due" value={hopDraft.docDueDate} disabled={saving}
                    onChange={(v) => setHopDraft({ ...hopDraft, docDueDate: v })}
                  />
                  {/* ⚠️ ไม่บังคับ — ใบเสร็จออกหลังรับเงินแล้ว ไม่มีกำหนดชำระ */}
                  <p className={styles.fieldHint}>ว่างได้ — ใบเสร็จไม่มีกำหนดชำระ</p>
                </div>
              </>
            )}

            {hopDraft.hop === "ready" && hopDraft.item.lineKind === "product_dev" && (
              <>
                <p className={styles.fieldHint}>
                  บันทึกแล้ว<strong>สูตรเข้าทะเบียนทันที</strong> — ฟอร์มเดียวกับหน้าทะเบียนสูตร
                  · ลูกค้า · กลิ่น · หมวด ยกมาจากรายการนี้เอง ({hopDraft.item.label}) จึงเทาไว้
                </p>
                <FormulaForm
                  mode="create" canSetCode codeRequired
                  value={hopDraft.formula} disabled={saving}
                  customers={registry.customers}
                  scents={registry.scents}
                  formulas={registry.formulas}
                  categories={productTypes}
                  locked={["customerId", "scentId", "categoryCode"]}
                  onChange={(value) => setHopDraft({ ...hopDraft, formula: value })}
                />
                {/* ไฟล์ประกอบ (ม-91) — สามสายกดส่งแล้วจบในโมดัลเดียวเหมือนกัน ·
                    ไม่บังคับ: ตัวงานคือสูตรที่เข้าทะเบียน ไฟล์เป็นของแถม (ต่างจาก
                    สายเอกสารที่ไฟล์คือตัวงาน จึงบังคับ ≥ 1) · แถวมีอยู่แล้ว อัปตรง */}
                <div className="form-group">
                  <span className="toolbar-label">
                    ไฟล์ประกอบ <span className={styles.fieldHint}>(ไม่บังคับ · แนบได้หลายไฟล์)</span>
                  </span>
                  <AttachmentsPanel
                    entityType="dept_request_item"
                    entityId={hopDraft.item.id}
                    canEdit={!saving}
                    inlineUpload
                  />
                </div>
              </>
            )}

            {/* ⚠️ **วันตรงนี้เป็นของ *แถว* ไม่ใช่คำสัญญาของใบ** (มติผู้ใช้ 2026-08-19) —
                วันกำหนดส่งของใบมาจากปุ่ม "แจ้งกำหนดส่ง" ทางเดียว ซึ่งลงเธรดเสมอ ⇒
                ไม่บังคับที่นี่แม้ก้าวนี้จะดันใบทั้งใบเป็น "รับเรื่องแล้ว" ก็ตาม */}
            {hopDraft.hop === "ack" && (
              <div className="form-group">
                <label htmlFor="hop-due">วันที่คาดว่าจะส่งของแถวนี้ (ไม่ใส่ก็ได้)</label>
                <DateInput
                  id="hop-due" value={hopDraft.dueAt} disabled={saving}
                  onChange={(v) => setHopDraft({ ...hopDraft, dueAt: v })}
                />
                <p className={styles.fieldHint}>
                  {ackPromotesRequest
                    ? "กดที่แถวนี้ = รับเรื่องทั้งใบด้วย — วันกำหนดส่งของใบยังต้องกด \"แจ้งกำหนดส่ง\" อีกที"
                    : "เป็นวันของแถวนี้เท่านั้น — ไม่ทับวันกำหนดส่งของทั้งใบ"}
                </p>
              </div>
            )}

            {hopDraft.outcome === "confirmed" && (
              <div className="form-group">
                <label htmlFor="hop-qty">จำนวนที่ลูกค้าคอนเฟิร์ม</label>
                <Input
                  id="hop-qty" type="number" min="0" step="any"
                  value={hopDraft.confirmedQty} disabled={saving}
                  onChange={(e) => setHopDraft({ ...hopDraft, confirmedQty: e.target.value })}
                />
                <p className={styles.fieldHint}>
                  ใช้กระทบยอดกับใบสั่งขาย — ไม่มีจำนวนก็เทียบไม่ได้ว่าส่งครบหรือยัง
                </p>
              </div>
            )}

            {hopDraft.hop === "outcome" && (
              <div className="form-group">
                <label htmlFor="hop-note">สิ่งที่ลูกค้าบอก</label>
                <Textarea
                  id="hop-note" rows={3} maxLength={4000}
                  value={hopDraft.note} disabled={saving}
                  placeholder={hopDraft.outcome === "revise"
                    ? "เช่น ขอให้หวานลง เพิ่มโทนไม้ท้ายกลิ่น"
                    : "คำพูดของลูกค้าตามที่ได้ยินมา"}
                  onChange={(e) => setHopDraft({ ...hopDraft, note: e.target.value })}
                />
                {hopDraft.outcome === "revise" && (
                  <p className={styles.fieldHint}>
                    บันทึกแล้วระบบจะ<strong>เปิดรายการใหม่</strong>สำหรับรอบแก้ให้เอง
                    โดยยกสิ่งที่ขอมาทั้งชุด — ข้อความนี้คือบรีฟของรอบใหม่นั้น
                  </p>
                )}
              </div>
            )}

            {hopError && <p className={styles.fieldError}>{hopError}</p>}

            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" onClick={() => setHopDraft(null)} disabled={saving}>ยกเลิก</Button>
              <Button tone="primary" disabled={saving || !!hopError} onClick={submitHop}>
                บันทึก
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ตอบราคา — ชั้นจำนวนตั้งต้นมาจากที่ผู้ขอระบุ แต่เพิ่ม/ลดได้ */}

      {/* ปิดบรีฟกลิ่น — ต้องบอกว่าได้กลิ่นตัวไหน (มติ 3)
          ⚠️ ไม่เดาชื่อกลิ่นจากหัวเรื่องคำร้อง: หัวเรื่องเป็นข้อความบรีฟ ไม่ใช่ชื่อกลิ่น
          สร้าง master data ผิดแย่กว่าไม่สร้าง (ของจริงบน prod: สินค้า 10 แถวเอาชื่อ
          กลิ่นไปกรอกช่องชื่อสูตร เพราะไม่มีที่เก็บกลิ่น) */}
      <Modal
        open={!!outcome} onClose={() => setOutcome(null)} size="sm" dismissible={!saving}
        title="ปิดบรีฟกลิ่น — ได้กลิ่นตัวไหน"
      >
        {outcome && (
          <>
            <div className="form-group">
              <label htmlFor="close-outcome-mode">ผลของบรีฟนี้</label>
              <Select
                id="close-outcome-mode" value={outcome.mode} disabled={saving}
                onChange={(e) => setOutcome({ ...outcome, mode: e.target.value })}
                options={[
                  { value: "link", label: "ผูกกับกลิ่นที่มีอยู่ในทะเบียน", disabled: !scentOptions.length },
                  { value: "create", label: "เพิ่มกลิ่นใหม่เข้าทะเบียน" },
                  { value: "none", label: "ไม่ได้กลิ่นจากบรีฟนี้" },
                ]}
              />
            </div>

            {outcome.mode === "link" && (
              <div className="form-group">
                <label htmlFor="close-outcome-scent">กลิ่นของ {req.customerName || "ลูกค้ารายนี้"}</label>
                <Select
                  id="close-outcome-scent" value={outcome.scentId} disabled={saving}
                  onChange={(e) => setOutcome({ ...outcome, scentId: e.target.value })}
                  options={[
                    { value: "", label: "— เลือกกลิ่น —" },
                    ...scentOptions.map((s) => ({
                      value: s.id,
                      label: `${s.code ? `${s.code} · ` : ""}${s.name} (${SCENT_STATUS_LABELS[s.status] || s.status})`,
                    })),
                  ]}
                />
              </div>
            )}

            {outcome.mode === "create" && (
              <>
                <div className="form-group">
                  <label htmlFor="close-outcome-name">ชื่อกลิ่น</label>
                  <Input
                    id="close-outcome-name" maxLength={200}
                    value={outcome.scentName} disabled={saving}
                    placeholder="ชื่อกลิ่นจริงที่ RD ตั้ง ไม่ใช่หัวเรื่องบรีฟ"
                    onChange={(e) => setOutcome({ ...outcome, scentName: e.target.value })}
                  />
                </div>
                {/* รหัสกลิ่นเป็นของ RD (มติ 8) — คนอื่นเปิดได้แค่ร่างรอ RD รับเข้าทะเบียน */}
                {isScentRegistrar(me) ? (
                  <div className="form-group">
                    <label htmlFor="close-outcome-code">รหัสกลิ่น (ใส่แล้วเข้าทะเบียนเลย)</label>
                    <Input
                      id="close-outcome-code" mono maxLength={100}
                      value={outcome.code} disabled={saving} placeholder="เช่น SC-2026-001"
                      onChange={(e) => setOutcome({ ...outcome, code: e.target.value })}
                    />
                  </div>
                ) : (
                  <p className={styles.fieldHint}>
                    กลิ่นจะเข้าเป็น <strong>ร่าง</strong> รอ RD ใส่รหัสและรับเข้าทะเบียน
                  </p>
                )}
              </>
            )}

            {outcomeError && <p className={styles.fieldError}>{outcomeError}</p>}

            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" onClick={() => setOutcome(null)} disabled={saving}>ยกเลิก</Button>
              <Button
                tone="accent" disabled={saving || !!outcomeError}
                onClick={async () => {
                  const ok = await call("", {
                    method: "PATCH", body: JSON.stringify({ action: "close", outcome }),
                  }, outcome.mode === "none" ? "ปิดเรื่องแล้ว" : "ปิดเรื่องแล้ว · บันทึกกลิ่นลงทะเบียน");
                  if (ok) setOutcome(null);
                }}
              >
                ปิดเรื่อง
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ใส่ราคา — ขั้นสุดท้ายของสายงาน อยู่ในใบเดิม ไม่ใช่คำร้องใบใหม่
          ⚠️ ราคาเดียว ไม่มีชั้นจำนวน (มติผู้ใช้): หัวน้ำหอมคิดต่อกิโลเดียว ไม่ลดตามจำนวน */}
      <Modal
        open={!!pricing} onClose={() => setPricing(null)} size="sm" dismissible={!saving}
        title={pricing ? `ใส่ราคา — ${pricing.item.label}` : ""}
      >
        {pricing && (
          <>
            <div className="form-group">
              <label htmlFor="row-price">ราคา (฿/กก.)</label>
              <Input
                id="row-price" type="number" min="0" step="any" mono
                value={pricing.price} disabled={saving}
                onChange={(e) => setPricing({ ...pricing, price: e.target.value })}
              />
              <p className={styles.fieldHint}>
                ราคานี้เข้าทะเบียนวัสดุเป็นรุ่นใหม่ของกลิ่นตัวนี้
                {req.customerName ? ` (ราคาเฉพาะ ${req.customerName})` : ""}
                {" — อ่านได้จากใบขอราคาผลิตและหน้าทะเบียนตามปกติ"}
              </p>
            </div>
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" onClick={() => setPricing(null)} disabled={saving}>ยกเลิก</Button>
              <Button
                tone="primary"
                disabled={saving || !String(pricing.price ?? "").trim()}
                onClick={async () => {
                  const done = await call(`/items/${pricing.item.id}/price`, {
                    method: "POST",
                    body: JSON.stringify({ price: pricing.price, note: pricing.note || null }),
                  }, "บันทึกราคาเข้าทะเบียนแล้ว");
                  if (done) setPricing(null);
                }}
              >
                บันทึกราคา
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ส่งงาน — สร้างแถวคำร้อง + เข้าทะเบียนกลิ่นในจังหวะเดียว
          ⚠️ หัวโมดัลใช้คำเดียวกับปุ่มที่กดมา (ม-120 รวมคำ "ส่งกลิ่น"/"ส่งของ" เป็น
          "ส่งงาน") — กดปุ่มชื่อหนึ่งแล้วเจอหัวกล่องอีกชื่อ คนจะไม่แน่ใจว่ากดถูกกล่องไหม */}
      <Modal
        open={!!delivery} onClose={() => setDelivery(null)} size="lg" dismissible={!saving}
        title="ส่งงานให้ผู้ขอ — กลิ่นเข้าทะเบียนทันที"
        /* ── แถบเครื่องมือใต้หัวโมดัล (โซนที่ไม่เลื่อนตามฟอร์ม) ─────────────────
           ⭐ **ปุ่มเพิ่มอยู่แถวเดียวกับแท็บ** (มติผู้ใช้ 2026-08-19 · ยกแพตเทิร์นมาจาก
           โมดัลสร้างดีล) — ปุ่มล่างสุดหลุดบริบท และมองไม่ออกว่ามันเพิ่ม "แท็บ"
           ไม่ใช่ช่องในใบที่เปิดอยู่
           ⚠️ **รอบแก้ลบไม่ได้** — มันคืองานที่ลูกค้าสั่งไว้ ไม่ใช่บรรทัดที่ RD เพิ่งเพิ่ม
           เอง · ลบทิ้งได้เมื่อไรก็เท่ากับทิ้งงานเงียบ ๆ */
        toolbar={delivery && (
          <>
            {delivery.length > 1 ? (
              <Tabs
                className={styles.deliveryTabs}
                ariaLabel="direction ที่จะส่ง"
                value={String(Math.min(deliveryTab, delivery.length - 1))}
                onChange={(key) => setDeliveryTab(Number(key))}
                tabs={delivery.map((row, i) => ({
                  key: String(i),
                  label: deliveryRowLabel(row, i),
                }))}
              />
            ) : <span className={styles.deliveryTabSpacer} aria-hidden="true" />}
            {delivery.length > 1 && !delivery[deliveryTab]?.targetItemId && (
              <Button
                variant="ghost" size="sm" tone="danger" disabled={saving}
                onClick={() => {
                  setDelivery(delivery.filter((_, j) => j !== deliveryTab));
                  setDeliveryTab(Math.max(0, deliveryTab - 1));
                }}
              >
                <Trash2 size={13} aria-hidden="true" /> ลบ direction นี้
              </Button>
            )}
            <Button
              variant="ghost" size="sm" disabled={saving}
              className={styles.deliveryAdd}
              onClick={() => {
                setDelivery([...delivery, emptyDeliveryRow()]);
                setDeliveryTab(delivery.length);
              }}
            >
              <Plus size={14} aria-hidden="true" /> เพิ่ม Direction
            </Button>
          </>
        )}
      >
        {delivery && (
          <>
            <p className={styles.fieldHint}>
              แต่ละแท็บคือ <strong>1 direction</strong> — บันทึกแล้วกลิ่นเข้าทะเบียนทันที
              พร้อมรหัสและวันที่ส่ง ไม่ต้องไปกรอกซ้ำที่หน้าทะเบียน
              {delivery.some((r) => r.targetItemId)
                && " · รอบแก้ที่ลูกค้าสั่งไว้ขึ้นให้แล้ว — เติมชื่อกับรหัสของตัวใหม่ได้เลย"}
            </p>
            <ScentDeliveryFields
              rows={delivery} onChange={setDelivery} scents={allScents}
              customers={registry.customers} active={deliveryTab}
              customerId={req.customerId} disabled={saving}
              briefs={req.briefs || []}
            />
            <div className={`action-bar ${styles.modalActions}`}>
              <Button variant="quiet" onClick={() => setDelivery(null)} disabled={saving}>ยกเลิก</Button>
              <Button
                tone="primary"
                disabled={saving || !!deliveryBlocker}
                onClick={async () => {
                  // ⚠️ คีย์ขีดล่าง (_files ฯลฯ) เป็นของฟอร์มล้วน — File serialize
                  // เป็น {} เปล่า ๆ ส่งไปมีแต่ทางให้ server งง
                  const prevIds = new Set((req.items || []).map((x) => x.id));
                  const rows = delivery.map(
                    ({ _files, _sourceLabel, _customerNote, ...r }) => r,
                  );
                  const done = await call("/items", {
                    method: "POST", body: JSON.stringify({ rows }),
                  }, `ส่งกลิ่น ${delivery.length} รายการ · เข้าทะเบียนแล้ว`);
                  if (!done) return;
                  setDelivery(null);
                  // ⭐ ไฟล์ประกอบ (ม-91) — แถวเพิ่งเกิดตอนส่ง จึงอัปได้ตอนนี้เท่านั้น
                  // จับคู่: แถวใหม่เรียง sortOrder ตามลำดับ direction ที่กรอก ·
                  // รอบแก้เติมแถวเดิม (targetItemId รู้อยู่แล้ว)
                  // ⚠️ อัปพังไม่ย้อนอะไร — กลิ่น/แถวบันทึกแล้ว การ์ดรายการยังแนบ
                  // ต่อได้ (สายพัฒนาแนบบนการ์ดได้ตาม ม-90)
                  if (!delivery.some((r) => (r._files || []).length)) return;
                  const after = await fetch(`/api/sa/requests/${id}`)
                    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
                  const freshRows = ((after && after.items) || [])
                    .filter((x) => !prevIds.has(x.id))
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                  let fi = 0;
                  const failed = [];
                  for (const row of delivery) {
                    const targetId = row.targetItemId
                      ? row.targetItemId : freshRows[fi++]?.id;
                    for (const f of row._files || []) {
                      if (!targetId) { failed.push(f.name); continue; }
                      const up = await uploadAttachment({
                        entityType: "dept_request_item", entityId: targetId,
                        file: f, docType: "other",
                      });
                      if (!up.ok) failed.push(f.name);
                    }
                  }
                  if (failed.length) {
                    setToast({ kind: "error", msg: `กลิ่นเข้าทะเบียนแล้ว แต่แนบไฟล์ไม่สำเร็จ ${failed.length} ไฟล์ (${failed.join(", ")}) — แนบใหม่ได้ที่การ์ดรายการ` });
                  }
                  await load();
                }}
              >
                ส่งและเข้าทะเบียน
              </Button>
            </div>
            {deliveryBlocker && <p className={styles.fieldError}>{deliveryBlocker}</p>}
          </>
        )}
      </Modal>

      {/* ตีกลับ — เหตุผลบังคับ เพราะผู้ขอต้องรู้ว่าต้องแก้อะไรถึงจะส่งใหม่ได้ */}
      <Modal
        open={!!bounceReason} onClose={() => setBounceReason("")}
        title="ตีกลับให้แก้ไข" size="sm" dismissible={!saving}
      >
        <p className={styles.fieldHint}>
          คำร้องจะกลับไปเป็น <strong>ร่าง</strong> ของผู้ขอ โดย<strong>เลขที่ไม่เปลี่ยน</strong> —
          แก้แล้วส่งกลับมาได้เลย ไม่ต้องเปิดใบใหม่
        </p>
        <div className="form-group">
          <label htmlFor="ask-bounce">ต้องแก้อะไร</label>
          <Textarea
            id="ask-bounce" rows={3} maxLength={2000}
            value={bounceReason.trim() ? bounceReason : ""} disabled={saving}
            placeholder="เช่น ยังไม่ได้แนบไฟล์อ้างอิง / ใบสั่งขายยังไม่อนุมัติ / ระบุปริมาณที่ต้องการด้วย"
            onChange={(e) => setBounceReason(e.target.value || " ")}
          />
        </div>
        <div className={`action-bar ${styles.modalActions}`}>
          <Button variant="quiet" onClick={() => setBounceReason("")} disabled={saving}>ปิด</Button>
          <Button
            tone="primary" disabled={saving || !bounceReason.trim()}
            onClick={() => call("", {
              method: "PATCH", body: JSON.stringify({ action: "bounce", reason: bounceReason }),
            }, "ตีกลับให้ผู้ขอแก้ไขแล้ว").then((ok) => { if (ok) setBounceReason(""); })}
          >
            ตีกลับ
          </Button>
        </div>
      </Modal>

      {/* ยกเลิกคำร้อง */}
      <Modal open={!!cancelReason} onClose={() => setCancelReason("")} title="ยกเลิกคำร้อง" size="sm" dismissible={!saving}>
        <div className="form-group">
          <label htmlFor="ask-cancel">เหตุผลที่ยกเลิก</label>
          <Textarea
            id="ask-cancel" rows={3} maxLength={500}
            value={cancelReason.trim() ? cancelReason : ""} disabled={saving}
            onChange={(e) => setCancelReason(e.target.value || " ")}
          />
        </div>
        <div className="action-bar" style={{ marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={() => setCancelReason("")} disabled={saving}>ปิด</button>
          <button
            type="button" className="btn btn-danger" disabled={saving || !cancelReason.trim()}
            onClick={() => call("", {
              method: "PATCH", body: JSON.stringify({ action: "cancel", cancelReason }),
            }, "ยกเลิกคำร้องแล้ว").then((ok) => { if (ok) setCancelReason(""); })}
          >
            ยกเลิกเคสนี้
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        {...confirmCopy()}
        busy={saving}
        tone={confirm?.kind === "delete" ? "danger" : "default"}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
