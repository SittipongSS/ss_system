"use client";
// รายละเอียดคำร้อง (mig 0158 → 0219)
//
// ผู้ขอ: ส่งคำร้อง / ยกเลิก / ลบร่าง · เห็นสถานะทุกขั้นว่าใครรับเรื่องแล้ว
// RD/PC: รับเรื่อง → ตอบราคาราย "ชั้นจำนวน" ที่ผู้ขอระบุ หรือกด "ตอบไม่ได้" พร้อมเหตุผล
// ราคาที่ตอบ = rev ใหม่ของวัสดุตัวเดิมในทะเบียน และเติมกลับบรรทัดในใบขอราคาผลิตให้เอง
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarClock, ClipboardList, FileText, FolderKanban, Handshake, Paperclip, Pencil, Send, Ban, Check, CheckCheck, MessageSquare, Trash2, Undo2,
} from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
import RichText from "@/components/ui/RichText";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { REQUEST_EDITABLE_STATUSES } from "@/lib/requests/requestEdit";
import { cachedFetchJson } from "@/lib/apiCache";
import UpdateThread from "@/components/updates/UpdateThread";
import {
  DocumentControlCard, WorkflowRail,
} from "@/components/ui/DocumentControlPanel";
import { ActionButton, kindMeta } from "@/components/ui/ActionButtons";
import RowActionMenu from "@/components/ui/RowActionMenu";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { RequestDueUrgentFields, RequestTitleBodyFields } from "@/components/requests/RequestEditableFields";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { useDepartment, useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import { canAnswerRequestsFor } from "@/lib/permissions";
import { isAwaitingApproval, requestNeedsApproval } from "@/lib/requests/approval";
import { requestRailSteps } from "@/lib/requests/requestRail";
import { requestHeaderFacts, requestHeaderPeople } from "@/lib/requests/headerFacts";
import { briefBoard, briefBoardTotals } from "@/lib/requests/briefBoard";
import { bulkReadyRows, formulaDevBoard, formulaDevTotals } from "@/lib/requests/formulaDevBoard";
import { documentBoard, documentTotals } from "@/lib/requests/documentBoard";
import { requestHasPdr, requestRequiresCommittedDue } from "@/lib/master/requestTypes";
import { pdrValuesFrom } from "@/lib/requests/pdrFields";
import { pdrTargetValuesFrom } from "@/lib/requests/pdrTargets";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import {
  REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS,
  answerRequestError, closeOutcomeError, closeRequestError, requestNeedsOutcome, requestProgress,
} from "@/lib/deptRequests";
import { SO_RECONCILE_TONE, soReconcile, soReconcileText } from "@/lib/requests/soReconcile";
import { hopLabel, hopValuesError, hopLabelFor } from "@/lib/requests/hops";
import { isDocLineKind } from "@/lib/requests/docTypes";
import { normalizeFormulaDelivery } from "@/lib/requests/delivery";
import NextStepBar from "@/components/requests/NextStepBar";
import { detailForKind, panelForKind } from "@/components/requests/details";
import Input from "@/components/ui/Input";
import ScentDeliveryFields, {
  codeConflict, emptyDeliveryRow, reworkDeliveryRow,
} from "@/components/requests/ScentDeliveryFields";
import { reworkSlots } from "@/lib/requests/rework";
import DateInput from "@/components/ui/DateInput";
import { businessDate } from "@/lib/businessDate";
import { requestDeliversRows, requestHasItems, requestKindLabel, requestUsesControlPanel } from "@/lib/master/requestTypes";
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
// ป้ายบอกว่า "ตอนนี้รออะไร" คู่กับปุ่มท้ายเธรดของหัวข้อที่ไม่มีแถว (P6)
// ⚠️ ผูกกับ `primaryAction.id` ที่หน้านี้ประกอบเอง — เพิ่มก้าวใหม่แล้วลืมป้าย
// จะได้คำว่า "รอดำเนินการ" กลาง ๆ ซึ่งไม่ผิด แต่ไม่ได้บอกอะไร
const THREAD_STEP_HINT = {
  submit: "ยังไม่ได้ส่ง — ส่งแล้วเลขที่จะออกและฝ่ายปลายทางจะเห็น",
  acknowledge: "รอฝ่ายปลายทางรับเรื่อง",
  approve: "รอหัวหน้าสายงานขายยืนยัน",
  answer: "รับเรื่องแล้ว — ตอบในเธรดแล้วกดว่าตอบครบ",
  close: "ตอบแล้ว — ผู้ขอกดปิดเมื่อพอใจกับคำตอบ",
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
  // ⭐ โหมดแก้ PDR — null = อ่านอย่างเดียว · object = กำลังแก้ (มติผู้ใช้ 2026-08-06)
  // สิทธิ์สลับมือที่จังหวะ "รับเรื่อง" — server เป็นคนตัดสิน (`_canEditPdr`)
  const [pdrDraft, setPdrDraft] = useState(null);
  /* ทะเบียนหมวดสินค้า — ฟอร์ม PDR (โหมดแก้) ใช้เลือก "ประเภทสินค้า" หลายรายการ (0227)
     ⚠️ โหลดเสมอ ไม่รอให้กดแก้ — โหลดตอนกดจะได้ดรอปดาวน์ว่างในวินาทีแรก */
  const [productTypes, setProductTypes] = useState([]);
  useEffect(() => {
    cachedFetchJson("/api/product-types").then((d) => setProductTypes(d || [])).catch(() => {});
  }, []);
  // ⭐ วันกำหนดส่งตอนรับเรื่อง — บังคับเฉพาะหัวข้อที่ประกาศธง (มติผู้ใช้ 2026-08-06)
  // ⚠️ ปุ่มเดิมยิง `acknowledge` เปล่า ๆ ⇒ พอ server บังคับแล้วจะกดไม่ผ่านทุกครั้ง
  // ถ้าไม่มีช่องให้กรอก · ด่านกับหน้าจอต้องมาพร้อมกันเสมอ
  const [ackDue, setAckDue] = useState(null);
  // เลื่อนวันกำหนดส่งหลังรับเรื่องแล้ว — { date, reason }
  const [reschedule, setReschedule] = useState(null);
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
  // ส่งของ (พัฒนากลิ่น) — [{ name, code, sentAt, derivedFromScentId, spec }]
  const [delivery, setDelivery] = useState(null);
  // ⭐ โมดัลรวบส่งของของพัฒนาสูตร (ช่องว่างข้อ 3) — { at, rows: [{item, formulaName,
  // formulaCode, formulaDate, error}] } · วันที่กรอกครั้งเดียว สูตรกรอกรายแถว
  const [bulkReady, setBulkReady] = useState(null);
  // ⚠️ ทะเบียนกลิ่น **ทั้งก้อน** ไม่ใช่เฉพาะของลูกค้ารายนี้ — รหัสกลิ่นห้ามซ้ำทั้ง
  // บริษัท (scents_code_uk เป็น unique ทั้งตาราง) ⇒ เตือนซ้ำต้องเทียบกับทุกแถว
  const [allScents, setAllScents] = useState([]);
  // ใส่ราคาแถวสายพัฒนา — { item, price, validUntil, note }
  const [pricing, setPricing] = useState(null);

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
  const backTab = req?._mine === false ? `queue-${req.dept}` : "mine";
  const back = { href: `/requests?tab=${backTab}`, label: "กลับรายการคำร้อง" };
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
  // รอหัวหน้ายืนยันอยู่ไหม — ขั้นนี้ derive ไม่ได้เก็บ (ดู lib/requests/approval.js)
  const awaitingApproval = isAwaitingApproval(req);
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
  const needsApproval = requestNeedsApproval(req);
  const canAnswer = owner && REQUEST_OPEN_STATUSES.includes(req.status);
  const progress = requestProgress(req.items || []);
  // ⚠️ ชนิดที่ไม่มีบรรทัด (สอบถาม/พัฒนากลิ่น/ติดตามของเข้า
  // ชนิด) มี progress.complete = false เสมอเพราะ total = 0 · เดิมเงื่อนไขปิดใบอ่านจาก
  // ตัวนี้ตรง ๆ ทำให้ **ปุ่มปิดไม่เคยโผล่เลย** คำร้องพวกนั้นค้างถาวร
  // → ใช้ด่านของ lib เป็นตัวตัดสินที่เดียว (ตัวเดียวกับที่ server ใช้) ไม่คิดเอง
  const hasItems = requestHasItems(req.kind);
  // ⭐ ปิดสองฝ่าย (ม-89) — ปุ่มปิดเป็นของ **ผู้ขอ** เท่านั้น · ฝ่ายปลายทางจบงาน
  // ของตัวผ่านรายการ (ส่งเอกสาร/ปฏิเสธ) ไปแล้ว การปิดคือผู้ขอยืนยันรับงานทั้งใบ
  const canClose = !closeRequestError(req, req.items || []) && req._mine;
  // ชนิดที่ไม่มีบรรทัด ระบบไม่มีทางรู้ว่าคำตอบครบหรือยัง → ผู้ตอบกดเองว่า "ตอบแล้ว"
  const canMarkAnswered = !hasItems && owner && !answerRequestError(req);
  // บรีฟกลิ่นที่ยังไม่ผูกกลิ่น = ต้องถามผลลัพธ์ก่อนปิด (ผูกแล้วไม่ต้องถามซ้ำ)
  const needsOutcome = requestNeedsOutcome(req.kind) && !req.scentId;
  const outcomeError = outcome ? closeOutcomeError(req, outcome) : null;

  // ── ก้าวของแถว ────────────────────────────────────────────────────────
  // ⚠️ ตรวจด้วย `hopValuesError` ตัวเดียวกับที่ server ใช้ — ไม่เขียนเงื่อนไขซ้ำที่จอ
  // ไม่งั้นสองชั้นจะเลื่อนออกจากกัน แล้วปุ่มที่กดได้จะได้ 400 กลับมา
  // ⚠️ สองด่านคนละชั้น — `hopValuesError` คุมค่าของก้าว · ของสูตรมีด่านของตัวเอง
  // ที่ server ใช้ตัวเดียวกัน (normalizeFormulaDelivery) ⇒ ปุ่มกับ API ไม่เพี้ยนกัน
  const hopError = hopDraft
    ? (hopValuesError(hopDraft.hop, hopDraft)
      || (hopDraft.hop === "ready" && hopDraft.item.lineKind === "product_dev"
        ? normalizeFormulaDelivery(hopDraft).error
        : null))
    : null;
  const openHop = (item, hop, outcome = null) => setHopDraft({
    item,
    hop,
    outcome,
    // ⭐ ส่งของของ "พัฒนาผลิตภัณฑ์" = สูตรเข้าทะเบียนในจังหวะเดียว (P4b)
    // **ไม่ถามหมวดกับกลิ่นซ้ำ** — อยู่บนแถวแล้วและเป็นตัวตนของสูตรพอดี
    formulaCode: "",
    formulaName: "",
    formulaDate: "",
    // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน
    at: businessDate(),
    dueAt: "",
    confirmedQty: "",
    note: "",
  });
  const submitHop = async () => {
    const { item, hop, outcome } = hopDraft;
    const ok = await call(`/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        hop,
        // ก้าวส่งไม่ส่งวัน (ม-92) — server ประทับวันไทยของวันที่กดให้เอง
        ...(hop === "ready" ? {} : { at: hopDraft.at }),
        ...(hop === "ack" ? { dueAt: hopDraft.dueAt || null } : {}),
        ...(hop === "ready" && item.lineKind === "product_dev" ? {
          formulaName: hopDraft.formulaName,
          formulaCode: hopDraft.formulaCode,
          formulaDate: hopDraft.formulaDate || null,
        } : {}),
        ...(hop === "outcome" ? { outcome, note: hopDraft.note } : {}),
        // 🐞 ปฏิเสธต้องส่งเหตุผล — เดิมลืมสาขานี้ โมดัลกดบันทึกแล้วโดน 400
        // "ต้องบอกเหตุผลที่ปฏิเสธ" ทั้งที่กรอกแล้ว (เจอตอนกดจริงจากตาราง ม-94)
        ...(hop === "refuse" ? { note: hopDraft.note } : {}),
        ...(outcome === "confirmed" ? { confirmedQty: hopDraft.confirmedQty } : {}),
      }),
    }, outcome === "revise"
      // บอกผลข้างเคียงที่มองไม่เห็นตอนกด — แถวใหม่ถูกสร้างให้เอง
      ? "บันทึกแล้ว · เปิดรายการใหม่สำหรับรอบแก้ให้แล้ว"
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
              formulaName: row.formulaName,
              formulaCode: row.formulaCode,
              formulaDate: row.formulaDate || null,
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
      setToast({ kind: "success", msg: `ส่งของ ${sent} รายการ — สูตรเข้าทะเบียนแล้ว` });
    }
  };

  // ปุ่มส่งปิดด้วยกติกาเดียวกับที่ช่องเตือน — ฟอร์มไม่คิดกฎเอง (บทเรียนเดิม:
  // หน้าจอคำนวณเงื่อนไขเองแล้วเพี้ยนจาก server จนปุ่มกดได้แต่ได้ 400 กลับมา)
  const deliveryBlocker = (() => {
    if (!delivery) return null;
    const codes = new Set(allScents.map((s) => String(s.code ?? "").trim().toLowerCase()).filter(Boolean));
    for (let i = 0; i < delivery.length; i += 1) {
      const row = delivery[i];
      // ป้ายต้องตรงกับหัวการ์ดที่คนเห็น ไม่งั้นข้อความชี้ไปคนละใบกับที่ต้องแก้
      const at = row.targetItemId
        ? `รอบแก้ของ ${row._sourceLabel || "รายการก่อนหน้า"}`
        : `รายการที่ ${i + 1}`;
      if (!String(row.name ?? "").trim()) return `${at}: ต้องระบุชื่อกลิ่น`;
      if (!String(row.code ?? "").trim()) return `${at}: ต้องระบุรหัสกลิ่น`;
      const clash = codeConflict(row.code, i, delivery, codes);
      if (clash) return `${at}: ${clash}`;
    }
    return null;
  })();

  // ⚠️ คืน null เมื่อ "ยังไม่มีอะไรให้เทียบ" — แถบจะไม่ขึ้นเลย ดีกว่าขึ้นแถบเขียว
  // ว่าครบแล้วตอนที่ยังไม่มีใครคอนเฟิร์มอะไร
  const reconcile = soReconcile({ lines: req.salesOrderLines, items: req.items });

  // ⭐ บอกปลายทางตอนกำลังจะพิมพ์ — "ใครกำลังถือขั้นนี้อยู่" เปลี่ยนว่าคนจะพิมพ์อะไร
  // (มติผู้ใช้: ฝั่งที่ไม่ใช่ตาตัวเองต้องพิมพ์ได้ทันทีตรงนั้น ไม่ใช่ปุ่มที่เด้งไปที่อื่น)
  // ⚠️ อ่านจากสถานะจริงของใบ ไม่ใช่เดาจาก role ของคนดู — ใบที่ยังไม่ส่งไม่มีใครรออยู่
  const composeHint = (() => {
    if (req.status === "draft") return "ยังไม่ได้ส่ง — ข้อความนี้จะยังไม่แจ้งเตือนใคร";
    if (["closed", "cancelled"].includes(req.status)) return null;
    return req._mine
      ? `จะแจ้งเตือนถึงฝ่าย ${req.dept} ที่ถือเรื่องนี้อยู่`
      : `จะแจ้งเตือนถึง ${req.requestedByName || "ผู้เปิดคำร้อง"}`;
  })();

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "submit") {
      return {
        title: "ส่งคำร้อง",
        description: `${(req.items || []).length} รายการ → ฝ่าย ${req.dept}`,
        detail: "ระบบจะออกเลขที่และแจ้งฝ่ายปลายทางทันที — หลังส่งแล้วลบใบไม่ได้",
        confirmLabel: "ส่งคำร้อง",
      };
    }
    if (confirm.kind === "answer") {
      return {
        title: "ทำเครื่องหมายว่าตอบแล้ว",
        description: req.docNo || "",
        detail: "ชนิดนี้ไม่มีรายการให้ระบบนับ — ผู้ตอบเป็นคนบอกเองว่าตอบครบแล้ว"
          + " · ผู้ขอจะเป็นคนกดปิดเรื่องเมื่อพอใจกับคำตอบ",
        confirmLabel: "ตอบแล้ว",
      };
    }
    if (confirm.kind === "close") {
      return {
        title: "ปิดเรื่อง",
        description: req.docNo || "",
        detail: hasItems
          ? "ราคาที่ตอบแล้วยังอยู่ในทะเบียนวัสดุตามเดิม — ปิดเรื่องแค่บอกว่างานนี้จบ"
          : "ปิดเรื่องแล้วยังอ่านย้อนหลังได้ตามเดิม — แค่บอกว่างานนี้จบ",
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
      description: `${req.docNo || id} · สถานะ ${REQUEST_STATUS_LABELS[req.status] || req.status}`,
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
    const labels = { submit: "ส่งคำร้องแล้ว", answer: "บันทึกว่าตอบแล้ว", close: "ปิดเรื่องแล้ว" };
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
  const editingPdr = !!pdrDraft;
  // โหมดแก้ = แก้หัวใบ หรือแก้แบบฟอร์ม (หรือทั้งคู่ ถ้าขั้นนั้นเปิดให้ทั้งสอง)
  const editing = editingPdr || !!editDraft;
  const cancelEdit = () => { setPdrDraft(null); setEditDraft(null); };

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
        if (editDraft) {
          const ok = await call("", {
            method: "PATCH",
            body: JSON.stringify({ action: "update", ...editDraft }),
          }, pdrDraft ? null : "แก้ข้อมูลคำร้องแล้ว");
          if (!ok) return;
        }
        if (pdrDraft) {
          const ok = await call("", {
            method: "PATCH",
            body: JSON.stringify({
              action: "pdr",
              pdr: pdrDraft.pdr,
              briefs: pdrDraft.briefs,
              pdrTargets: pdrDraft.targets,
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
        onClick: () => (requestRequiresCommittedDue(req.kind)
          ? setAckDue(businessDate())
          : call("", { method: "PATCH", body: JSON.stringify({ action: "acknowledge" }) }, "รับเรื่องแล้ว")),
      }
      // ⭐ พัฒนากลิ่น: หลังรับเรื่องแล้ว ปุ่มหลักของ RD คือ **ส่งของ** ซึ่งสร้างแถว
      // เอง (SA ไม่มีทางรู้ล่วงหน้าว่าจะได้กี่ direction จึงไม่มีตารางตอนเปิดใบ)
      // ⭐ ประตูหัวหน้าสายงานขาย (mig 0216) — วางก่อน "ส่งกลิ่น" เพราะระหว่างรอยืนยัน
      // ปุ่มหลักของหน้าคือของหัวหน้า ไม่ใช่ของ RD · `_canApprove` มาจาก server
      : req._canApprove
        ? {
          id: "approve",
          label: "ยืนยันให้ RD ดำเนินการ",
          kind: "approve",
          icon: Check,
          onClick: () => call("", {
            method: "PATCH", body: JSON.stringify({ action: "approve" }),
          }, "ยืนยันแล้ว"),
        }
      : canAnswer && requestDeliversRows(req.kind) && !awaitingApproval
        ? {
          id: "deliver",
          label: "ส่งกลิ่น",
          kind: "submit",
          icon: Send,
          // ⭐ **รอบแก้ที่ค้างอยู่ขึ้นมาก่อนเสมอ** — ลูกค้าสั่งแก้ไว้แล้ว แถวรออยู่แล้ว
          // RD ไม่ต้องไปจำเองว่าค้างอะไร และไม่มีทางสร้างแถวใหม่ทับของที่รออยู่
          onClick: () => {
            const waiting = reworkSlots(req.items || []).map(reworkDeliveryRow);
            setDelivery(waiting.length ? waiting : [emptyDeliveryRow()]);
          },
        }
      // ชนิดที่ไม่มีบรรทัด: ผู้ตอบกด "ตอบแล้ว" ก่อน แล้วผู้ขอค่อยปิดเรื่อง
      // (ระบบนับคำตอบเองไม่ได้ — ไม่มีบรรทัดให้นับ)
      : canMarkAnswered
        ? {
          id: "answer",
          label: "ตอบแล้ว",
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
          : null;

  // ⭐ **หัวข้อที่ไม่มีแถวเอาปุ่มหลักไปไว้ท้ายเธรด** (P6) — ทั้งหน้าคือเธรด ปุ่มอยู่
  // บนหัวใบอย่างเดียวแปลว่าอ่านจนจบแล้วต้องเงยหน้ากลับขึ้นไปหา ⇒ ขัดกับ ม-49
  //
  // ⚠️ **ที่เดียวเสมอ ไม่โชว์สองที่** — `primaryAction` ตัวเดียวกัน ย้ายที่วาง ไม่ใช่
  // ก๊อป · โชว์ทั้งหัวใบและท้ายเธรดเมื่อไร ก็ได้ทางเข้าสองทางที่ต้องคอยดูแลให้ตรงกัน
  // ซึ่งเป็นโรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้
  // ⭐ โครง Control Panel (มติผู้ใช้ 2026-08-09) — หัวข้อที่เปิดธง ปุ่มระดับใบ
  // **ทั้งชุด**อยู่การ์ดขวาที่เดียว: ไม่มีปุ่มบนหัวใบ และไม่มีแถบท้ายเธรด
  // (ยังคงกติกา "ที่เดียวเสมอ" — แค่ที่นั้นเปลี่ยนเป็น panel)
  const usePanel = requestUsesControlPanel(req.kind);
  const threadStep = !usePanel && !hasItems && primaryAction
    ? { ...primaryAction, hint: THREAD_STEP_HINT[primaryAction.id] || "รอดำเนินการ" }
    : null;
  const headerAction = (threadStep || usePanel) ? null : primaryAction;

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

  const requestActions = normalizeDocumentControlActions({
    // โครง panel: ปุ่มหลักไม่ผ่านหัวใบ/ท้ายเธรด — เข้า normalize ตรงเพื่อไปโผล่ที่การ์ดขวา
    primaryAction: usePanel ? primaryAction : headerAction,
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
      {
        // ⭐ **รวบส่งของหลายแถว** (ช่องว่างข้อ 3 ของแบบพัฒนาสูตร) — ใบที่ขอ 5 รายการ
        // และเสร็จพร้อมกัน ไม่ต้องเปิดโมดัลห้ารอบกรอกวันเดิมห้าครั้ง
        // ⚠️ โผล่เมื่อมีแถวพร้อมส่ง ≥ 2 — แถวเดียวใช้ปุ่มรายแถวท้ายเธรดตามเดิม
        // (สองทางเข้าเดินเข้ากติกาเดียวกันที่ server · ไม่มีด่านของตัวเอง)
        id: "bulk-ready",
        label: "ส่งของหลายรายการ",
        kind: "submit",
        icon: Send,
        visible: canAnswer && bulkReadyRows(req.items || []).length >= 2,
        onClick: () => setBulkReady({
          rows: bulkReadyRows(req.items || []).map((item) => ({
            item, formulaName: "", formulaCode: "", formulaDate: "",
          })),
        }),
      },
      {
        // ⭐ **ออกเอกสาร** (มติผู้ใช้ 2026-08-09) — เดิมชื่อ "ดูฉบับที่ออกจริง" และ
        // ซ่อนอยู่ในแท็บแบบฟอร์ม · เป็นของระดับใบจึงย้ายมารวมที่แผงจัดการ
        // ⚠️ ป้ายสั้นกว่าเดิมแต่ยังไม่ใช่ "ดาวน์โหลด" — ฉบับที่ออกเป็นหน้า HTML
        id: "pdr-document",
        label: "ออกเอกสาร",
        kind: "open",
        icon: FileText,
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
          if (canEditInfo) {
            setEditDraft({
              kind: req.kind,
              title: req.title || "",
              body: req.body || "",
              requestedDueDate: req.requestedDueDate || "",
              urgent: !!req.urgent,
              urgentReason: req.urgentReason || "",
            });
          }
          if (canEditPdrNow) {
            setPdrDraft({
              pdr: pdrValuesFrom(req),
              briefs: (req.briefs || []).map((b) => ({ ...b })),
              // แถวข้อ 2.2/2.3 (mig 0229) — แปลงเป็นค่าสตริงของฟอร์มด้วยตัวแปลงกลาง
              // ⚠️ ลืมบรรทัดนี้ = เปิดโหมดแก้แล้วรายการราคาหายทั้งชุด แล้วกดบันทึก
              // ทับของจริง (บั๊กเดียวกับที่ `pdrValuesFrom` มีไว้กันฝั่งหัวใบ)
              targets: (req.targets || []).map(pdrTargetValuesFrom),
            });
          }
        },
        // ⚠️ ฝั่งจอไม่มี `user.id` (context เก็บแค่ role/department) จึงถามด้วย
        // `_mine` ที่ server คำนวณมาให้ + ขั้นชุดเดียวกับ lib · ด่านจริงอยู่ที่ API
        visible: (canEditInfo || canEditPdrNow) && !editing,
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
        visible: canAnswer && !!req.acknowledgedAt,
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
  // โครง panel: หัวใบไม่มีปุ่มเลย — ทุกปุ่มระดับใบอยู่การ์ดขวาที่เดียว
  const hasHeaderActions = !usePanel && (!!requestActions.primaryAction
    || requestActions.secondaryActions.length > 0
    || requestActions.dangerActions.length > 0);

  // รายการในเมนู "…" ของหัวใบ — secondary + danger ชุดเดิมทั้งหมด
  // ⚠️ ลำดับ: เดินหน้ารอง → เส้นคั่น → อันตราย (แพตเทิร์นเดียวกับ RecordActionMenu)
  //    สี/ไอคอนมาจาก `kindMeta` ตัวเดียวกับที่ปุ่มใช้ ไม่ใช่ทาเองตามกลุ่ม
  const headerMenuItems = [
    ...requestActions.secondaryActions.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon || kindMeta(action.kind)?.Icon,
      tone: kindMeta(action.kind)?.tone || "neutral",
      onClick: action.onClick,
    })),
    ...requestActions.dangerActions.map((action, index) => ({
      id: action.id || `danger-${index}`,
      label: action.label,
      icon: action.icon || kindMeta(action.kind)?.Icon,
      tone: kindMeta(action.kind)?.tone || "danger",
      separatorBefore: index === 0 && requestActions.secondaryActions.length > 0,
      onClick: action.onClick,
    })),
  ];

  // ⭐ **กติกา "ช่องไหนขึ้นเมื่อไร" อยู่ที่ `lib/requests/headerFacts.js`** พร้อมเทสต์
  // (ม-98 · ม-101) — ของเดิมประกอบตรงนี้กลาง JSX แล้วให้ "ลูกค้า" กับ "ตอบแล้ว"
  // สลับกันใช้ช่องเดียว ⇒ ใบที่มีบรรทัดไม่เคยโชว์ลูกค้าเลย (IS-26080003)
  // ⚠️ ไอคอนอยู่ที่นี่ ไม่ใช่ในไลบรารี — ไลบรารีต้องไม่ import component ของ React
  // (เทสต์รันด้วย node เปล่า) · คีย์ที่ไม่มีไอคอนไม่ต้องประกาศ
  const FACT_ICONS = { submitted: ClipboardList };
  const headerFacts = requestHeaderFacts(req, { hasItems, progress })
    .map((fact) => ({ ...fact, icon: FACT_ICONS[fact.key] }));

  /* ⭐ **บรรทัดคนสองฝั่งของใบ** (ม-101) — ผู้ยื่น → ผู้รับเรื่อง อ่านเป็นเส้นทางเดียว
     ⚠️ ใช้ `_opener` ไม่ใช่ `_mine` — ตั้งแต่ทีมทำแทนกันได้ (ม-100) `_mine` แปลว่า
     "จัดการได้" ⇒ ป้าย "ใบของฉัน" จะไปขึ้นบนใบของเพื่อนร่วมทีม */
  const people = requestHeaderPeople(req, { mine: !!req._opener });
  const initials = (name) => String(name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "—";
  const peopleRow = people ? (
    <>
      <span className={`${styles.person} ${people.requester.mine ? styles.personSelf : styles.personTeam}`}>
        <span className={styles.personAvatar}>{initials(people.requester.name)}</span>
        {people.requester.label}
        {people.requester.team ? ` · ทีม ${people.requester.team}` : ""}
        {people.requester.mine ? null : <b>{people.requester.name}</b>}
      </span>
      {/* ลูกศรมีความหมายก็ต่อเมื่อชิปอยู่บรรทัดเดียวกัน — จอแคบซ่อนใน CSS */}
      <span className={styles.personArrow} aria-hidden="true">→</span>
      <span className={`${styles.person} ${people.receiver.pending ? styles.personEmpty : styles.personDept}`}>
        <span className={styles.personAvatar}>
          {people.receiver.pending ? req.dept : initials(people.receiver.name)}
        </span>
        {people.receiver.pending
          ? `${people.receiver.name} · ${people.receiver.label}`
          : <>{people.receiver.label} · <b>{people.receiver.name}</b>{people.receiver.at ? ` · ${fmtDate(people.receiver.at)}` : ""}</>}
      </span>
    </>
  ) : null;

  /* ⭐ **เนื้อคำร้องอยู่ในคอลัมน์เนื้อหา ไม่ใช่ในหัวใบ** (ผู้ใช้ทัก 2026-08-11)
     เดิมวางเป็นลูกของหัวใบ ⇒ ข้อความยาว ๆ (บรีฟกลิ่นของจริงยาวหลายย่อหน้า) ทำให้
     หัวใบสูงเป็นหน้าจอ **แล้วดันการ์ด "จัดการคำร้อง" ลงไปอยู่ใต้พับ** ทั้งที่มันคือ
     ที่ที่ปุ่มทุกปุ่มอยู่ · ย้ายลงคอลัมน์ซ้ายแล้วการ์ดขวาเริ่มที่บรรทัดเดียวกับเนื้อเรื่อง
     และความกว้างของบรรทัดลดลงเองตามคอลัมน์ (อ่านง่ายขึ้นด้วย) */
  const requestBodyBlock = (req.body || req.note) ? (
    <DetailCard icon={FileText} title="รายละเอียดคำร้อง" className={styles.bodyCard}>
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
  const attachmentsBlock = (
    <div className={styles.attachBlock}>
      <div className="toolbar-label">ไฟล์แนบของคำร้อง</div>
      <AttachmentsPanel
        entityType="dept_request"
        entityId={req.id}
        canEdit={(req._mine || owner) && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
        inlineUpload
      />
    </div>
  );

  return (
    <Workspace hideHeader back={back}>
      {/* หัวเรื่องพูดภาษาของชนิดคำร้อง — หน้านี้เคยเขียนว่า "เคสขอราคาวัสดุ" ทุกจุด
          ทั้งที่รับคำร้องหลายชนิด · พัฒนากลิ่นที่ขึ้นว่า "รายการ 0 · ตอบแล้ว 0/0"
          อ่านแล้วเหมือนข้อมูลหาย ไม่ใช่ชนิดที่ไม่มีบรรทัดตั้งแต่แรก
          ⭐ **หัวใบเดียวจบ** — สถานะ · รางก้าว · ข้อเท็จจริง · เนื้อคำร้อง · ไฟล์แนบ ·
          ปุ่ม เรียงตามลำดับที่คนอ่านจริง · ฝ่ายผู้ตอบขึ้นไปอยู่กับชนิดบน eyebrow
          เพราะสองอย่างนี้คือ "ใบนี้คืออะไร ส่งไปไหน" ซึ่งอ่านคู่กันเสมอ */}
      {/* ⭐ **ปุ่มหลัก 1 ปุ่ม + เมนู "…"** ที่ `actions` (มติผู้ใช้ 2026-08-08) — ของเดิม
          เรียงปุ่มเส้นขอบได้ถึง 4 ปุ่ม (เลื่อนวัน · ลบ · ตีกลับ · ยกเลิก) ต่อท้ายด้วย
          ปุ่มหลัก ⇒ หัวใบเป็นแถวปุ่มยาวที่อ่านไม่ออกว่าอันไหนคือสิ่งที่ต้องทำ
          ⚠️ **กติกาปุ่มไม่เปลี่ยน** — ยังผ่าน `normalizeDocumentControlActions` ตัวเดิม
          (`visible: false` ตัดออกให้แล้ว) · ที่เปลี่ยนคือที่วางเท่านั้น
          ⚠️ ไอคอน/สีของรายการมาจาก `kindMeta` ชุดเดียวกับปุ่ม ⇒ เมนูกับปุ่มพูดเรื่อง
          เดียวกันเสมอ (บทเรียนจาก RecordActionMenu: เมนูทา "ตีกลับ" เป็นแดง แต่การ์ด
          โชว์เทา ทั้งที่เป็น action เดียวกัน) */}
      <SalesDetailOverview
        eyebrow={`${requestKindLabel(req.kind)} · ถึงฝ่าย ${req.dept}`}
        title={req.docNo || `${requestKindLabel(req.kind)} (ร่าง)`}
        /* ⭐ ลูกค้าต่อท้ายหัวข้อเรื่องเป็นประโยคเดียว "ทำอะไร ให้ใคร" (ม-101) —
           เดิมลูกค้าเป็นช่องในแถบซึ่งหายไปทั้งใบเมื่อใบนั้นมีบรรทัด */
        description={
          <span className={styles.subject}>
            {req.title || requestKindLabel(req.kind)}
            {req.customerName ? (
              <>
                {" · ให้ "}<b>{req.customerName}</b>
                {req.refCustomer?.arCode ? (
                  // ⚠️ nowrap — "AR-787" ที่ขึ้นบรรทัดใหม่ตรงขีดกลางอ่านเป็นคนละรหัส
                  <span className={styles.arCode}>{req.refCustomer.arCode}</span>
                ) : null}
              </>
            ) : null}
          </span>
        }
        meta={peopleRow}
        badges={usePanel
          // โครง panel: สถานะอยู่การ์ดขวาที่เดียว (ย้าย ไม่ก๊อป — บทเรียนรางขวารุ่นแรก)
          ? null
          : <SalesStateBadge label={REQUEST_STATUS_LABELS[req.status] || req.status} color={STATUS_TONE[req.status]} />}
        actions={hasHeaderActions ? (
          <>
            {requestActions.primaryAction ? (
              <ActionButton
                kind={requestActions.primaryAction.kind}
                label={requestActions.primaryAction.label}
                icon={requestActions.primaryAction.icon}
                variant="filled" disabled={saving}
                onClick={requestActions.primaryAction.onClick}
              />
            ) : null}
            {headerMenuItems.length > 0 && (
              <RowActionMenu
                label={`การจัดการของ ${req.docNo || "คำร้อง"}`}
                items={headerMenuItems}
                busy={saving}
              />
            )}
          </>
        ) : null}
        facts={headerFacts}
      >
        {/* รางก้าว — โครงเดิมวางแนวนอนบนหัวใบ · โครง panel ย้ายไปการ์ดขวาแนวตั้ง
            (WorkflowRail ตัวเดียวกัน ต่างแค่ orientation — ห้ามมีสองชุด) */}
        {!usePanel && (
          <WorkflowRail steps={workflowSteps} orientation="row" label="เส้นทางของคำร้อง" />
        )}


        {/* ของที่ไม่ติดสี่ช่องบนแถบข้อเท็จจริง แต่ทิ้งไม่ได้ — ผู้รับเรื่องคือหลักฐาน
            ว่ามีคนรับงานไปจริง ไม่ใช่แค่สถานะเปลี่ยน */}
        {(req.acknowledgedByName || req.formulaCode) && (
          <p className={styles.headMeta}>
            {req.acknowledgedByName
              ? `รับเรื่องโดย ${req.acknowledgedByName} · ${fmtDate(req.acknowledgedAt)}`
              : ""}
            {req.acknowledgedByName && req.formulaCode ? " · " : ""}
            {req.formulaCode ? `สูตร ${req.formulaCode}` : ""}
          </p>
        )}

        {/* ⭐ ขึ้นเฉพาะตอนยังเป็นร่าง — ส่งซ้ำแล้วค่าเดิมยังอยู่ในคอลัมน์ (เป็นประวัติ)
            แต่ไม่ควรค้างบนจอ ไม่งั้นใบที่แก้แล้วยังดูเหมือนถูกตีกลับอยู่ */}
        {req.status === "draft" && req.bounceReason && (
          <div className={styles.bounced}>
            <strong>ฝ่าย {req.dept} ตีกลับให้แก้ไข</strong>
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
            ⚠️ หัวข้อที่ยังไม่เปิดโครง panel ยังใช้ที่เดิม — ไม่มีคอลัมน์ขวาให้ย้ายไป */}
        {!usePanel && attachmentsBlock}
      </SalesDetailOverview>

      {/* ── โหมดแก้: หัวใบ ─────────────────────────────────────────────────
          ⭐ **ในหน้า ไม่ใช่โมดัล** — แบบฟอร์ม PDR ก็แก้ในหน้าอยู่แล้ว และปุ่มบันทึก/
          ยกเลิกอยู่ที่แผงจัดการที่เดียว (มติผู้ใช้ 2026-08-09) ⇒ ปุ่ม "แก้ไข" ปุ่มเดียว
          เปิดทั้งสองส่วนบนพื้นเดียวกัน ไม่มีโมดัลซ้อนหน้าที่กำลังแก้อยู่
          ⚠️ ช่องมาจาก `RequestEditableFields` ตัวเดียวกับฟอร์มเปิดคำร้อง — ห้ามวาง
          Input/Textarea เองที่นี่ (กฎ AGENTS.md · เคยเพี้ยนมาแล้ว 6 จุด) */}
      {editDraft && (
        <DetailCard icon={Pencil} eyebrow="EDIT" title="แก้ข้อมูลคำร้อง" className={styles.editCard}>
          <div className="form-grid cols-2">
            <RequestTitleBodyFields
              value={editDraft} onChange={setEditDraft} disabled={saving} idPrefix="edit"
            />
            <RequestDueUrgentFields
              value={editDraft} onChange={setEditDraft} disabled={saving} idPrefix="edit"
            />
          </div>
          <small className={styles.hint}>
            เปลี่ยนดีล ใบสั่งขาย รายการ หรือหัวข้อทางนี้ไม่ได้ — ใบร่างลบแล้วเปิดใหม่ได้
            (ยังไม่กินเลขที่) ส่วนใบที่ส่งแล้วให้คุยต่อในเธรด
          </small>
        </DetailCard>
      )}

      {/* ⭐ โครงสองแบบ (มติผู้ใช้ 2026-08-09 — รีดีไซน์ทีละหัวข้อ):
          · หัวข้อธง `detailControlPanel` — การ์ดขวา DOCUMENT CONTROL ถือ สถานะ+ราง
            แนวตั้ง+ปุ่มระดับใบ **ที่เดียว** (หัวใบ/ท้ายเธรดไม่มีปุ่ม — ย้าย ไม่ก๊อป)
          · หัวข้อที่ยังไม่เปิดธง — คอลัมน์เดียวแบบเดิม (รางขวารุ่นแรกเคยถูกยุบเพราะ
            การ์ดพูดซ้ำหัวใบทุกบรรทัด — ธงนี้คือรอบแก้ที่ย้ายจริง ไม่ใช่วาดซ้ำ) */}
      <DetailPageLayout
        className={usePanel ? styles.panelLayout : ""}
        asideLabel="จัดการคำร้อง"
        aside={usePanel ? (
          <>
            <DocumentControlCard
              title="จัดการคำร้อง"
              status={REQUEST_STATUS_LABELS[req.status] || req.status}
              statusColor={STATUS_TONE[req.status]}
              workflowSteps={workflowSteps}
              primaryAction={requestActions.primaryAction}
              secondaryActions={requestActions.secondaryActions}
              dangerActions={requestActions.dangerActions}
              busy={saving}
            />
            {/* การ์ดบริบท — ใบนี้เกาะโครงการ/ดีลไหน กดแล้วไปหน้านั้นได้เลย
                (มติผู้ใช้ 2026-08-09) · ContextCard เป็นลิงก์ทั้งใบอยู่แล้ว
                ⚠️ โชว์เฉพาะที่อ้างจริง — ใบที่ไม่ผูกโครงการไม่ต้องมีการ์ดเปล่า */}
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
                subtitle={req.customerName || undefined}
              />
            )}
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
              />
            )}
            {/* ไฟล์แนบของใบ — ปิดท้ายคอลัมน์: อ่านจากบนลงล่างเป็น ควบคุม → บริบท →
                สรุป → หลักฐาน · การ์ดทรงเดียวกับที่อื่นในคอลัมน์ (`DetailCard`) */}
            <DetailCard icon={Paperclip} title="ไฟล์แนบของคำร้อง">
              <AttachmentsPanel
                entityType="dept_request"
                entityId={req.id}
                canEdit={(req._mine || owner) && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
                inlineUpload
              />
            </DetailCard>
          </>
        ) : null}
      >
        {requestBodyBlock}
        <div>

      {/* ⭐ **เนื้อของหน้าเลือกตามหัวข้อ** (ม-34) — หน้านี้เหลือหน้าที่ "เปลือก":
          หัวใบ · เธรด · โมดัลของแต่ละก้าว · ส่วนที่ต่างกันรายหัวข้อ (PDR · ตารางสรุป ·
          กระทบยอด SO · การ์ดรายแถว) อยู่ในไฟล์ของหัวข้อนั้น
          ⚠️ เพิ่มหัวข้อใหม่ **ห้ามมาแก้ไฟล์นี้** — ลงทะเบียนที่ `details/index.js` */}
      {/* ⚠️ **ส่งของทุกหัวข้อไปให้ครบ แล้วให้ component ของหัวข้อหยิบตัวของตัวเอง**
          — เลือกให้ที่นี่ต้องรู้ว่าหัวข้อไหนใช้ก้อนไหน ซึ่งเป็นความรู้ของหัวข้อ ไม่ใช่
          ของเปลือก (ม-34) · เคยเขียนเป็น `docBoard.length ? … : …` ซึ่งเดาจากข้อมูล
          ⇒ ใบร่างที่ยังไม่มีแถวจะตกไปใช้ก้อนของหัวข้ออื่นเงียบ ๆ */}
      {/* `rowStep` = ปุ่มก้าวติดแถวในตาราง (มติผู้ใช้ 2026-08-09) — ชุด callback
          เดียวกับแถบท้ายเธรดเป๊ะ · ส่งเฉพาะโครง panel: โครงเดิมยังใช้แถบท้ายเธรด */}
      <KindDetail
        request={req}
        categories={productTypes}
        canEditAttachments={(req._mine || owner)
          && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
        rowStep={usePanel ? {
          canDept: canAnswer,
          canRequester: !!req._mine && REQUEST_OPEN_STATUSES.includes(req.status),
          busy: saving,
          onHop: (row, hop, outcome) => openHop(row, hop, outcome),
          onPrice: (row) => setPricing({ item: row, price: "", validUntil: "", note: "" }),
        } : null}
        saving={saving}
        board={board}
        briefSummary={briefSummary}
        formulaBoard={formulaBoard}
        formulaTotals={formulaTotals}
        docBoard={docBoard}
        docTotals={docTotals}
        reconcile={reconcile}
        reconcileTone={reconcile ? SO_RECONCILE_TONE[reconcile.state] : undefined}
        reconcileText={reconcile ? soReconcileText(reconcile) : null}
        pdrDraft={pdrDraft}
        onPdrDraftChange={setPdrDraft}
      />

      {/* เธรดคุยกันในคำร้อง (mig 0163) — เดิมคำถามอย่าง "ขวดสีชามีไหม / MOQ 500 ได้ไหม"
          ต้องโทรออกนอกระบบ เหตุผลของราคาเลยหายไปกับสาย · เหตุการณ์ของใบ
          (ส่ง/รับเรื่อง/ตอบ/ปิด) ระบบเขียนลงสายเดียวกันให้เอง */}
      <DetailCard icon={MessageSquare} eyebrow="Discussion" title="พูดคุยในคำร้องนี้">
        {/* 🐞 เคยส่งชื่อชุดก่อน mig 0173 (ชื่อเก่าของคำร้อง/บรรทัดคำร้อง) — เธรดเลย
            อ่านคนละคีย์กับที่ server เขียนเหตุการณ์ลงไป (`dept_request`) ผลคือ
            **ไม่เห็นทั้งเหตุการณ์ของระบบและข้อความเก่า** และข้อความใหม่ตกไปอยู่คีย์
            ที่ไม่มีใครอ่าน (ไฟล์แนบพลาดคู่กัน) · เทสต์กันไว้แล้วที่
            lib/master/entityTypeUsage.test.mjs */}
        <UpdateThread
          entityType="dept_request"
          entityId={req.id}
          placeholder="ถามสเปก / ต่อรอง MOQ / แจ้งข้อมูลเพิ่ม..."
          emptyText="ยังไม่มีการพูดคุย — ถามสเปกหรือเงื่อนไขไว้ตรงนี้ได้ แนบรูปตัวอย่างได้ด้วย"
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
      <NextStepBar
        // ⭐ ย้าย ไม่ก๊อป (มติผู้ใช้ 2026-08-09): โครง panel ปุ่มก้าวรายแถวอยู่ใน
        // ตารางของหัวข้อ (เอกสารที่ขอ · สรุปทั้งใบ) — แถบท้ายเธรดเงียบทั้งใบ
        // (สองที่เมื่อไรก็เพี้ยนกันเมื่อนั้น) · หัวข้อโครงเดิมไม่กระทบ
        rows={usePanel ? [] : (req.items || [])}
        canDept={canAnswer}
        canRequester={!!req._mine && REQUEST_OPEN_STATUSES.includes(req.status)}
        busy={saving}
        onHop={(row, hop, outcome) => openHop(row, hop, outcome)}
        onPrice={(row) => setPricing({ item: row, price: "", validUntil: "", note: "" })}
        requestStep={threadStep}
      />
        </div>
      </DetailPageLayout>

      {/* ⭐ รับเรื่อง + วันกำหนดส่ง — หัวข้อที่บังคับต้องมีช่องให้กรอกในจังหวะเดียวกัน
          ไม่ใช่ให้กดแล้วเจอ error แล้วไปหาว่าต้องกรอกที่ไหน */}
      <Modal
        open={ackDue !== null} onClose={() => setAckDue(null)} size="sm" dismissible={!saving}
        title="รับเรื่อง — ระบุวันกำหนดส่ง"
      >
        <div className="form-group">
          <label htmlFor="ack-due">วันกำหนดส่ง</label>
          <DateInput id="ack-due" value={ackDue || ""} disabled={saving} onChange={setAckDue} />
          {/* วันที่คาดหวังเป็นของผู้ขอ · วันกำหนดส่งเป็นของฝ่ายปลายทาง และเป็นตัวที่
              ใช้นับว่าเลยกำหนดหรือยัง — คนละช่อง คนละเจ้าของ */}
          <small className={styles.hint}>
            เป็นวันที่ฝ่ายคุณรับปาก และเป็นตัวที่ใช้นับว่าเลยกำหนดหรือยัง
            {req.requestedDueDate ? ` · ผู้ขอคาดหวังไว้ ${fmtDate(req.requestedDueDate)}` : ""}
          </small>
        </div>
        <div className={`action-bar ${styles.modalActions}`}>
          <Button variant="quiet" disabled={saving} onClick={() => setAckDue(null)}>ยกเลิก</Button>
          <Button
            tone="primary" disabled={saving || !ackDue}
            onClick={() => call("", {
              method: "PATCH",
              body: JSON.stringify({ action: "acknowledge", committedDueDate: ackDue }),
            }, "รับเรื่องแล้ว").then((ok) => { if (ok) setAckDue(null); })}
          >
            รับเรื่อง
          </Button>
        </div>
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
                เดิมรับปากไว้ {req.committedDueDate ? fmtDate(req.committedDueDate) : "—"}
              </small>
            </div>
            <div className="form-group">
              <label htmlFor="resch-why">เหตุผล (ไม่บังคับ)</label>
              <Textarea
                variant="data" id="resch-why" rows={2} maxLength={500}
                value={reschedule.reason} disabled={saving}
                placeholder="บอกฝ่ายขายว่าทำไมต้องเลื่อน — จะได้ไปคุยกับลูกค้าต่อได้"
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

      {/* รวบส่งของหลายแถว (พัฒนาสูตร · ช่องว่างข้อ 3) — วันที่ครั้งเดียว สูตรรายแถว
          ⚠️ ด่านต่อแถวใช้ `normalizeFormulaDelivery` ตัวเดียวกับ server และกับโมดัล
          รายแถว ⇒ สามทางเข้าตรวจเหมือนกันเป๊ะ */}
      <Modal
        open={!!bulkReady} onClose={() => setBulkReady(null)} size="lg" dismissible={!saving}
        title={bulkReady ? `ส่งของ ${bulkReady.rows.length} รายการ — สูตรเข้าทะเบียนทันที` : ""}
      >
        {bulkReady && (
          <>
            {/* ไม่มีช่องวันส่ง (ม-92) — ระบบประทับวันที่กดให้ทุกแถว */}
            {bulkReady.rows.map((row, i) => (
              <div key={row.item.id} className={styles.bulkRow}>
                <div className="toolbar-label">{row.item.label}</div>
                {row.error && <p className={styles.error}>{row.error}</p>}
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor={`bulk-name-${i}`}>ชื่อสูตร</label>
                    <Input
                      id={`bulk-name-${i}`} value={row.formulaName} disabled={saving}
                      placeholder="ชื่อจริงที่ RD ตั้ง"
                      onChange={(e) => setBulkReady({
                        ...bulkReady,
                        rows: bulkReady.rows.map((r, j) => (i === j ? { ...r, formulaName: e.target.value } : r)),
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`bulk-code-${i}`}>รหัสสูตร</label>
                    <Input
                      id={`bulk-code-${i}`} mono value={row.formulaCode} disabled={saving}
                      placeholder="เช่น PF638010202-P1"
                      onChange={(e) => setBulkReady({
                        ...bulkReady,
                        rows: bulkReady.rows.map((r, j) => (i === j ? { ...r, formulaCode: e.target.value } : r)),
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`bulk-date-${i}`}>
                      วันที่ของสูตร <span className={styles.fieldHint}>(ไม่บังคับ)</span>
                    </label>
                    <DateInput
                      id={`bulk-date-${i}`} value={row.formulaDate} disabled={saving}
                      onChange={(v) => setBulkReady({
                        ...bulkReady,
                        rows: bulkReady.rows.map((r, j) => (i === j ? { ...r, formulaDate: v } : r)),
                      })}
                    />
                  </div>
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
                {saving ? "กำลังส่ง…" : `ส่งของ ${bulkReady.rows.length} รายการ`}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* บันทึกก้าวของแถว — กล่องเดียวรับทั้งห้าก้าว ช่องสลับตามก้าวที่กด
          ⭐ ห้ากล่องแยกจะได้ปุ่มยกเลิก/บันทึกและกติกาวันที่ห้าชุดที่ต้องคอยดูแลให้ตรงกัน
          ซึ่งเป็นโรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้ */}
      <Modal
        open={!!hopDraft} onClose={() => setHopDraft(null)} size="sm" dismissible={!saving}
        title={hopDraft ? `${hopLabelFor(hopDraft.item, hopDraft.hop, hopDraft.outcome)} — ${hopDraft.item.label}` : ""}
      >
        {hopDraft && (
          <>
            {/* ⭐ ก้าวส่ง (ready) ไม่มีช่องวัน (ม-92) — ระบบประทับวันที่กดให้เอง
                ก้าวอื่นยังถาม: แก้ย้อนหลังได้ตั้งใจ — ของถูกส่งไปก่อนแล้วค่อยมา
                บันทึกเป็นเรื่องปกติ (migration จึงไม่มี CHECK บังคับให้วันเรียงกัน) */}
            {!["refuse", "ready"].includes(hopDraft.hop) && (
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
                <Textarea variant="data"
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

            {hopDraft.hop === "ready" && hopDraft.item.lineKind === "product_dev" && (
              <>
                <p className={styles.fieldHint}>
                  บันทึกแล้ว<strong>สูตรเข้าทะเบียนทันที</strong> — หมวดกับกลิ่นยกมาจาก
                  รายการนี้เอง ({hopDraft.item.label}) ไม่ต้องเลือกซ้ำ
                </p>
                <div className="form-group">
                  <label htmlFor="hop-formula-name">ชื่อสูตร</label>
                  <Input
                    id="hop-formula-name" value={hopDraft.formulaName} disabled={saving}
                    placeholder="ชื่อจริงที่ RD ตั้ง"
                    onChange={(e) => setHopDraft({ ...hopDraft, formulaName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="hop-formula-code">รหัสสูตร</label>
                  <Input
                    id="hop-formula-code" mono value={hopDraft.formulaCode} disabled={saving}
                    placeholder="เช่น PF638010202-P1"
                    onChange={(e) => setHopDraft({ ...hopDraft, formulaCode: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="hop-formula-date">
                    วันที่ของสูตร <span className={styles.fieldHint}>(ไม่บังคับ)</span>
                  </label>
                  <DateInput
                    id="hop-formula-date" value={hopDraft.formulaDate} disabled={saving}
                    onChange={(v) => setHopDraft({ ...hopDraft, formulaDate: v })}
                  />
                </div>
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

            {hopDraft.hop === "ack" && (
              <div className="form-group">
                <label htmlFor="hop-due">รับปากว่าจะส่งวันไหน (ไม่ใส่ก็ได้)</label>
                <DateInput
                  id="hop-due" value={hopDraft.dueAt} disabled={saving}
                  onChange={(v) => setHopDraft({ ...hopDraft, dueAt: v })}
                />
                <p className={styles.fieldHint}>
                  ผู้ขอเห็นวันนี้ทันที และคิวใช้วันนี้เป็นตัวชี้ว่าเลยกำหนดหรือยัง
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
                <Textarea variant="data"
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

      {/* ส่งกลิ่น — สร้างแถวคำร้อง + เข้าทะเบียนกลิ่นในจังหวะเดียว */}
      <Modal
        open={!!delivery} onClose={() => setDelivery(null)} size="lg" dismissible={!saving}
        title="ส่งกลิ่นให้ฝ่ายขาย"
      >
        {delivery && (
          <>
            <p className={styles.fieldHint}>
              แต่ละรายการคือ <strong>1 direction</strong> — บันทึกแล้วกลิ่นเข้าทะเบียนทันที
              พร้อมรหัสและวันที่ส่ง ไม่ต้องไปกรอกซ้ำที่หน้าทะเบียน
              {delivery.some((r) => r.targetItemId)
                && " · รอบแก้ที่ลูกค้าสั่งไว้ขึ้นให้แล้ว — เติมชื่อกับรหัสของตัวใหม่ได้เลย"}
            </p>
            <ScentDeliveryFields
              rows={delivery} onChange={setDelivery} scents={allScents}
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
          <Textarea variant="data"
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
          <Textarea variant="data"
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
