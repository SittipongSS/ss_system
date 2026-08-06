"use client";
// รายละเอียดเคสขอราคาวัสดุ (mig 0158)
//
// ผู้ขอ: ส่งเคส / ยกเลิก / ลบร่าง · เห็นสถานะทุกขั้นว่าใครรับเรื่องแล้ว
// RD/PC: รับเรื่อง → ตอบราคาราย "ชั้นจำนวน" ที่ผู้ขอระบุ หรือกด "ตอบไม่ได้" พร้อมเหตุผล
// ราคาที่ตอบ = rev ใหม่ของวัสดุตัวเดิมในทะเบียน และเติมกลับบรรทัดในใบขอราคาผลิตให้เอง
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ClipboardList, Send, Ban, Check, CheckCheck, MessageSquare, Trash2, Undo2,
} from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
import RichText from "@/components/ui/RichText";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import UpdateThread from "@/components/updates/UpdateThread";
import {
  DocumentControlCard, DocumentSummaryCard,
} from "@/components/ui/DocumentControlPanel";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import PriceTierFields, { emptyTierRow } from "@/components/materials/PriceTierFields";
import { useDepartment, useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import { canAnswerRequestsFor } from "@/lib/permissions";
import { isAwaitingApproval, requestNeedsApproval } from "@/lib/requests/approval";
import { requestRailSteps } from "@/lib/requests/requestRail";
import { requestHasPdr } from "@/lib/master/requestTypes";
import PdrSummary from "@/components/requests/PdrSummary";
import PdrForm, { pdrValuesFrom } from "@/components/requests/PdrForm";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import {
  REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS,
  answerRequestError, closeOutcomeError, closeRequestError, requestNeedsOutcome, requestProgress,
} from "@/lib/deptRequests";
import { requestItemStatusLabel } from "@/lib/requests/statuses";
import { SO_RECONCILE_TONE, soReconcile, soReconcileText } from "@/lib/requests/soReconcile";
import StatusNotice from "@/components/ui/StatusNotice";
import { hopLabel, hopValuesError } from "@/lib/requests/hops";
import { normalizeFormulaDelivery } from "@/lib/requests/delivery";
import RowStageRail from "@/components/requests/RowStageRail";
import Input from "@/components/ui/Input";
import ScentDeliveryFields, {
  codeConflict, emptyDeliveryRow,
} from "@/components/requests/ScentDeliveryFields";
import { businessDate } from "@/lib/businessDate";
import { requestHasItems, requestKindLabel } from "@/lib/master/requestTypes";
import { SCENT_STATUS_LABELS, isScentRegistrar } from "@/lib/master/scents";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import styles from "./page.module.css";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";
import Textarea from "@/components/ui/Textarea";

const STATUS_TONE = {
  draft: "var(--text-3)",
  pending: "var(--amber)",
  acknowledged: "var(--blue)",
  answered: "var(--green)",
  closed: "var(--text-3)",
  cancelled: "var(--text-3)",
};
// mig 0204: สถานะบรรทัดเป็นกลางแล้ว (pending/done/declined) ไม่ผูกกับคำว่า "ราคา"
const ITEM_TONE = { pending: "var(--text-3)", done: "var(--green)", declined: "var(--red)" };
const unitOf = (kind) => (kind === "PM" ? "฿/ชิ้น" : "฿/กก.");
const qtyText = (v) => `${Number(v).toLocaleString("th-TH")} ขึ้นไป`;

// ⭐ **แถววัสดุตอบในที่ · แถวสายพัฒนา/เอกสารเดินทาง** — วัสดุคือถามราคาแล้วตอบกลับ
// จบในที่เดียว ไม่มีของให้ไปรับและไม่มีลูกค้าให้ส่งต่อ ⇒ รางห้าก้าวไม่มีความหมาย
// และปุ่ม "รับเรื่อง" บนแถวราคาจะพาคนกดผิดขั้น (ของจริงคือ "ตอบราคา")
const isFlowRow = (item) => !!item?.lineKind && item.lineKind !== "material";

// ป้ายช่องวันที่ต้องพูดถึงก้าวนั้นตรง ๆ — "วันที่" เฉย ๆ ทำให้คนกรอกวันนี้ทุกครั้ง
// ทั้งที่หลายก้าวถูกกดย้อนหลังเป็นปกติ (ของส่งไปเมื่อวาน เพิ่งมาบันทึกเช้านี้)
const HOP_DATE_LABEL = {
  ack: "วันที่รับเรื่อง",
  ready: "วันที่ส่งของ",
  pickup: "วันที่รับของ",
  send: "วันที่ส่งให้ลูกค้า",
  outcome: "วันที่ลูกค้าตอบ",
};

export default function MaterialAskDetailPage() {
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
  const [answering, setAnswering] = useState(null); // { item, tiers }
  const [noQuote, setNoQuote] = useState(null);     // { item, reason }
  // ก้าวของแถว — { item, hop, outcome, at, dueAt, confirmedQty, note }
  const [hopDraft, setHopDraft] = useState(null);
  // ⭐ โหมดแก้ PDR — null = อ่านอย่างเดียว · object = กำลังแก้ (มติผู้ใช้ 2026-08-06)
  // สิทธิ์สลับมือที่จังหวะ "รับเรื่อง" — server เป็นคนตัดสิน (`_canEditPdr`)
  const [pdrDraft, setPdrDraft] = useState(null);
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
      if (!res.ok) throw new Error(d?.error || "โหลดเคสไม่สำเร็จ");
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
      setToast({ kind: "success", msg: okMsg });
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
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError || "ไม่พบเคส"}</div>
      </Workspace>
    );
  }

  // ตัวนี้คุม `canDept` ของรางห้าก้าว ⇒ ถามผิดคำถามแปลว่าฝ่ายเจ้าของเรื่อง
  // เห็นแต่ป้าย "รอฝ่ายปลายทางรับเรื่อง" และกดอะไรไม่ได้เลยทั้งใบ
  const owner = canAnswerRequestsFor(me, req.dept);
  // รอหัวหน้ายืนยันอยู่ไหม — ขั้นนี้ derive ไม่ได้เก็บ (ดู lib/requests/approval.js)
  const awaitingApproval = isAwaitingApproval(req);
  const showPdr = requestHasPdr(req.kind);
  const needsApproval = requestNeedsApproval(req);
  const canAnswer = owner && REQUEST_OPEN_STATUSES.includes(req.status);
  const progress = requestProgress(req.items || []);
  // ⚠️ ชนิดที่ไม่มีบรรทัด (สอบถาม/บรีฟกลิ่น/ขอ mockup/ขอเอกสาร/ติดตามของเข้า = 5 ใน 8
  // ชนิด) มี progress.complete = false เสมอเพราะ total = 0 · เดิมเงื่อนไขปิดเคสอ่านจาก
  // ตัวนี้ตรง ๆ ทำให้ **ปุ่มปิดไม่เคยโผล่เลย** คำร้องพวกนั้นค้างถาวร
  // → ใช้ด่านของ lib เป็นตัวตัดสินที่เดียว (ตัวเดียวกับที่ server ใช้) ไม่คิดเอง
  const hasItems = requestHasItems(req.kind);
  const canClose = !closeRequestError(req, req.items || []) && (req._mine || owner);
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
        at: hopDraft.at,
        ...(hop === "ack" ? { dueAt: hopDraft.dueAt || null } : {}),
        ...(hop === "ready" && item.lineKind === "product_dev" ? {
          formulaName: hopDraft.formulaName,
          formulaCode: hopDraft.formulaCode,
          formulaDate: hopDraft.formulaDate || null,
        } : {}),
        ...(hop === "outcome" ? { outcome, note: hopDraft.note } : {}),
        ...(outcome === "confirmed" ? { confirmedQty: hopDraft.confirmedQty } : {}),
      }),
    }, outcome === "revise"
      // บอกผลข้างเคียงที่มองไม่เห็นตอนกด — แถวใหม่ถูกสร้างให้เอง
      ? "บันทึกแล้ว · เปิดรายการใหม่สำหรับรอบแก้ให้แล้ว"
      : `บันทึก "${hopLabel(hop, outcome)}" แล้ว`);
    if (ok) setHopDraft(null);
  };

  // ปุ่มส่งปิดด้วยกติกาเดียวกับที่ช่องเตือน — ฟอร์มไม่คิดกฎเอง (บทเรียนเดิม:
  // หน้าจอคำนวณเงื่อนไขเองแล้วเพี้ยนจาก server จนปุ่มกดได้แต่ได้ 400 กลับมา)
  const deliveryBlocker = (() => {
    if (!delivery) return null;
    const codes = new Set(allScents.map((s) => String(s.code ?? "").trim().toLowerCase()).filter(Boolean));
    for (let i = 0; i < delivery.length; i += 1) {
      const row = delivery[i];
      if (!String(row.name ?? "").trim()) return `รายการที่ ${i + 1}: ต้องระบุชื่อกลิ่น`;
      if (!String(row.code ?? "").trim()) return `รายการที่ ${i + 1}: ต้องระบุรหัสกลิ่น`;
      const clash = codeConflict(row.code, i, delivery, codes);
      if (clash) return `รายการที่ ${i + 1}: ${clash}`;
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

  const submitAnswer = async (payload, okMsg) => {
    const ok = await call("/answer", { method: "PATCH", body: JSON.stringify({ answers: [payload] }) }, okMsg);
    if (ok) { setAnswering(null); setNoQuote(null); }
  };

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "submit") {
      return {
        title: "ส่งเคสขอราคา",
        description: `${(req.items || []).length} รายการ → ฝ่าย ${req.dept}`,
        detail: "ระบบจะออกเลขที่เคสและแจ้งฝ่ายเจ้าของทันที — หลังส่งแล้วลบเคสไม่ได้",
        confirmLabel: "ส่งเคส",
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

  const primaryAction = req._mine && req.status === "draft"
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
        onClick: () => call("", { method: "PATCH", body: JSON.stringify({ action: "acknowledge" }) }, "รับเรื่องแล้ว"),
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
      : canAnswer && req.kind === "scent_dev" && !awaitingApproval
        ? {
          id: "deliver",
          label: "ส่งกลิ่น",
          kind: "submit",
          icon: Send,
          onClick: () => setDelivery([emptyDeliveryRow()]),
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

  return (
    <Workspace hideHeader back={back}>
      {/* หัวเรื่องพูดภาษาของชนิดคำร้อง — หน้านี้เคยเขียนว่า "เคสขอราคาวัสดุ" ทุกจุด
          ทั้งที่รับคำร้อง 8 ชนิด · บรีฟกลิ่นที่ขึ้นว่า "รายการ 0 · ตอบแล้ว 0/0"
          อ่านแล้วเหมือนข้อมูลหาย ไม่ใช่ชนิดที่ไม่มีบรรทัดตั้งแต่แรก */}
      <SalesDetailOverview
        eyebrow={requestKindLabel(req.kind)}
        title={req.docNo || `${requestKindLabel(req.kind)} (ร่าง)`}
        description={`${req.title || req.customerName || "ราคากลาง"} · ถึงฝ่าย ${req.dept} · ผู้ขอ ${req.requestedByName || "—"}`}
        badges={<SalesStateBadge label={REQUEST_STATUS_LABELS[req.status] || req.status} color={STATUS_TONE[req.status]} />}
        facts={[
          { key: "created", icon: ClipboardList, label: "วันที่สร้าง", value: fmtDate(req.createdAt) },
          { key: "department", label: "ฝ่ายผู้ตอบ", value: req.dept },
          ...(hasItems ? [
            { key: "items", label: "รายการ", value: `${progress.total} รายการ` },
            { key: "progress", label: "ตอบแล้ว", value: `${progress.done}/${progress.total}` },
          ] : [
            { key: "customer", label: "ลูกค้า", value: req.customerName || "—" },
            { key: "due", label: "ต้องการคำตอบ", value: req.requestedDueDate ? fmtDate(req.requestedDueDate) : "—" },
          ]),
        ]}
      />

      <DetailPageLayout
        asideLabel="สรุปและจัดการคำร้อง"
        aside={(
          <>
            <DocumentSummaryCard
              title="สรุปคำร้อง"
              rows={hasItems ? [
                { id: "department", label: "ฝ่ายผู้ตอบ", value: req.dept },
                { id: "items", label: "รายการทั้งหมด", value: `${progress.total} รายการ` },
                { id: "answered", label: "ตอบแล้ว", value: `${progress.done}/${progress.total}` },
                { id: "pending", label: "รอคำตอบ", value: `${Math.max(progress.total - progress.done, 0)} รายการ` },
              ] : [
                { id: "kind", label: "ชนิดคำร้อง", value: requestKindLabel(req.kind) },
                { id: "department", label: "ฝ่ายผู้ตอบ", value: req.dept },
                { id: "acknowledged", label: "ผู้รับเรื่อง", value: req.acknowledgedByName || "ยังไม่มีผู้รับ" },
                { id: "committed", label: "รับปากว่าจะตอบ", value: req.committedDueDate ? fmtDate(req.committedDueDate) : "—" },
              ]}
              status={REQUEST_STATUS_LABELS[req.status] || req.status}
              statusColor={STATUS_TONE[req.status]}
            />
            <DocumentControlCard
              status={REQUEST_STATUS_LABELS[req.status] || req.status}
              statusColor={STATUS_TONE[req.status]}
              statusDescription="การดำเนินการระดับคำร้อง"
              workflowSteps={workflowSteps}
              primaryAction={primaryAction}
              dangerActions={[
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
              ]}
              busy={saving}
            />
          </>
        )}
      >
        <div>
          <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="status-pill" style={{ color: STATUS_TONE[req.status], borderColor: "currentColor" }}>
            {REQUEST_STATUS_LABELS[req.status] || req.status}
          </span>
          {hasItems && (
            <span style={{ fontSize: "var(--fs-7)", color: "var(--text-2)" }}>
              ตอบแล้ว {progress.done}/{progress.total} รายการ
            </span>
          )}
          {req.acknowledgedByName && (
            <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
              รับเรื่องโดย {req.acknowledgedByName} · {fmtDate(req.acknowledgedAt)}
            </span>
          )}
          {req.formulaCode && (
            <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>สูตร {req.formulaCode}</span>
          )}
        </div>
        {/* รายละเอียดคำร้อง — เดิมแสดงเฉพาะชนิดที่ไม่มีบรรทัด แต่ตอนนี้ทุกหัวข้อมี
            ชื่อเรื่อง+รายละเอียดบังคับ (มติ 2026-08-03) จึงต้องแสดงทุกใบ
            ⭐ RichText ไม่ใช่ ReadableText: ผู้ใช้วาง URL หรือรหัสเอกสารในรายละเอียด
            ได้ (ฟอร์มบอกไว้ว่าได้) ถ้าเรนเดอร์เป็นข้อความเปล่าก็กดไม่ได้ = สัญญาที่
            ฟอร์มให้ไว้ไม่เป็นจริง */}
        {req.body && (
          <RichText text={req.body} lines={12} className={styles.requestBody} />
        )}
        {/* `note` เลิกเขียนใหม่แล้ว — ยังแสดงของเก่าที่มีค่าอยู่ ไม่ซ่อนข้อมูลที่คน
            เคยพิมพ์ไว้ (คอลัมน์ยังไม่ถูก DROP) */}
        {req.note && <ReadableText text={req.note} lines={4} style={{ marginTop: 12, fontSize: "var(--fs-7)", color: "var(--text-2)" }} />}
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
          <div style={{ marginTop: 8, fontSize: "var(--fs-7)", color: "var(--red)" }}>
            <strong>เหตุผลที่ยกเลิก: </strong><ReadableText text={req.cancelReason} lines={4} />
          </div>
        )}

        {/* ไฟล์แนบระดับหัวคำร้อง — เพิ่งมีที่แนบตั้งแต่ 2026-08-03 (เดิมแนบได้เฉพาะ
            รายวัสดุ ซึ่งมีแต่ 3 ชนิดขอราคา → บรีฟกลิ่น/Mock-up ที่ต้องมีรูปอ้างอิง
            มากที่สุดแนบไม่ได้เลย ต้องไปส่งกันทาง LINE) */}
        <div className={styles.attachBlock}>
          <div className="toolbar-label">ไฟล์แนบของคำร้อง</div>
          <AttachmentsPanel
            entityType="dept_request"
            entityId={req.id}
            canEdit={(req._mine || owner) && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
            inlineUpload
          />
        </div>
      </div>

      {/* ⭐ กระทบยอดกับใบสั่งขาย — **เตือน ไม่บล็อก** (มติผู้ใช้)
          ส่งเกิน SO เกิดได้จริง (แถมให้ลูกค้าเลือก) และส่งขาดก็เกิดได้ · บล็อกเมื่อไร
          คนจะเลี่ยงด้วยการ *ไม่บันทึกจำนวน* ซึ่งแย่กว่าตัวเลขที่ไม่ตรงมาก เพราะตอนนั้น
          ระบบจะไม่รู้อะไรเลยแทนที่จะรู้ว่าไม่ตรง */}
      {reconcile && (
        <StatusNotice
          tone={SO_RECONCILE_TONE[reconcile.state]}
          className={styles.reconcile}
        >
          {soReconcileText(reconcile)}
        </StatusNotice>
      )}

      {(req.items || []).map((item) => {
        const flow = isFlowRow(item);
        return (
        <div key={item.id} className="glass-panel" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: "var(--fw-semibold)" }}>{item.label}</div>
              {item.spec && (
                <ReadableText text={item.spec} lines={3} style={{ marginTop: 4, fontSize: "var(--fs-7)", color: "var(--text-2)" }} />
              )}
              {!flow && (
                <div style={{ marginTop: 6, fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                  ขอราคาที่: {(item.tiers || []).length
                    ? (item.tiers || []).map((t) => qtyText(t.qty)).join(" · ")
                    : "ราคาเดียว (ไม่แบ่งชั้นจำนวน)"}
                </div>
              )}
            </div>
            {/* แถวสายเดินทางมีสถานะละเอียดกว่าป้ายเดียวอยู่แล้ว (อยู่บนหัวราง) —
                โชว์ป้ายซ้ำจะได้สองแหล่งความจริงที่ขัดกันได้ */}
            {!flow && (
              <div style={{ textAlign: "right" }}>
                <span className="ui-badge" style={{ background: "var(--panel-3)", color: ITEM_TONE[item.answerStatus] }}>
                  {requestItemStatusLabel(item.answerStatus, item.lineKind)}
                </span>
                {item.answeredByName && (
                  <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginTop: 4 }}>
                    {item.answeredByName} · {fmtDate(item.answeredAt)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* รางห้าก้าวของแถวนี้ — ปุ่มของแต่ละก้าวอยู่ในช่องของก้าวนั้น ไม่ใช่แถบ
              ปุ่มท้ายการ์ด ⇒ สายตาไปหยุดตรงที่ต้องกดพอดี */}
          {flow && (
            <div className={styles.rowRail}>
              <RowStageRail
                row={item}
                request={req}
                canDept={canAnswer}
                canRequester={!!req._mine && REQUEST_OPEN_STATUSES.includes(req.status)}
                busy={saving}
                onHop={(hop, outcome) => (hop === "price"
                  ? setPricing({ item, price: "", validUntil: "", note: "" })
                  : openHop(item, hop, outcome))}
              />
            </div>
          )}

          {/* แถวสายเดินทางที่ถูกปฏิเสธเก็บคำพูดลูกค้าไว้ที่ outcomeNote ซึ่งรางแสดง
              ให้แล้ว — ตรงนี้จึงเหลือไว้สำหรับแถววัสดุที่ฝ่ายตอบว่าให้ราคาไม่ได้ */}
          {!flow && item.answerStatus === "declined" && item.declineReason && (
            <div style={{ marginTop: 8, fontSize: "var(--fs-7)", color: "var(--red)" }}>
              <strong>ตอบไม่ได้: </strong><ReadableText text={item.declineReason} lines={3} />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div className="toolbar-label">รูป / สเปกแนบ</div>
            <AttachmentsPanel
              entityType="dept_request_item"
              entityId={item.id}
              canEdit={(req._mine || owner) && REQUEST_OPEN_STATUSES.concat("draft").includes(req.status)}
              inlineUpload
            />
          </div>

          {!flow && canAnswer && item.answerStatus === "pending" && (
            <div className="action-bar" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setNoQuote({ item, reason: "" })} disabled={saving}>
                ตอบไม่ได้
              </button>
              <button
                type="button" className="btn btn-accent" disabled={saving}
                onClick={() => setAnswering({
                  item,
                  tiers: (item.tiers || []).length
                    ? item.tiers.map((t) => ({ qty: String(t.qty), price: "" }))
                    : [emptyTierRow()],
                })}
              >
                ตอบราคา
              </button>
            </div>
          )}
        </div>
        );
      })}

      {/* ⭐ PDR แบบอ่าน — วางเหนือเธรด เพราะ RD หยิบงานแล้วต้องอ่านบรีฟก่อนคุย
          🔴 ก่อนหน้านี้ไม่มีบล็อกนี้เลย ⇒ เปิดคำร้องขึ้นมาเห็นแค่ชื่อเรื่อง */}
      {showPdr && (
        <div className={styles.pdrBlock}>
          {pdrDraft ? (
            <>
              <PdrForm
                value={pdrDraft.pdr} onChange={(pdr) => setPdrDraft({ ...pdrDraft, pdr })}
                briefs={pdrDraft.briefs}
                onBriefsChange={(briefs) => setPdrDraft({ ...pdrDraft, briefs })}
                disabled={saving}
              />
              <div className={`action-bar ${styles.modalActions}`}>
                <Button variant="quiet" disabled={saving} onClick={() => setPdrDraft(null)}>
                  ยกเลิก
                </Button>
                <Button
                  tone="primary" disabled={saving}
                  onClick={() => call("", {
                    method: "PATCH",
                    body: JSON.stringify({ action: "pdr", pdr: pdrDraft.pdr, briefs: pdrDraft.briefs }),
                  }, "บันทึกแบบฟอร์มแล้ว").then((ok) => { if (ok) setPdrDraft(null); })}
                >
                  บันทึกแบบฟอร์ม
                </Button>
              </div>
            </>
          ) : (
            <>
              <PdrSummary request={req} briefs={req.briefs || []} />
              {/* ⚠️ ปุ่มโผล่ตาม `_canEditPdr` ที่ **server คำนวณ** — หน้าจอไม่มี user.id
                  จึงตัดสินเองไม่ได้ (บทเรียนเดียวกับ `_canApprove`) */}
              {req._canEditPdr && (
                <div className={`action-bar ${styles.modalActions}`}>
                  <Button
                    variant="quiet" disabled={saving}
                    onClick={() => setPdrDraft({
                      pdr: pdrValuesFrom(req),
                      briefs: (req.briefs || []).map((b) => ({ ...b })),
                    })}
                  >
                    แก้แบบฟอร์ม PDR
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* เธรดคุยกันในเคส (mig 0163) — เดิมคำถามอย่าง "ขวดสีชามีไหม / MOQ 500 ได้ไหม"
          ต้องโทรออกนอกระบบ เหตุผลของราคาเลยหายไปกับสาย · เหตุการณ์ของเคส
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
        </div>
      </DetailPageLayout>

      {/* บันทึกก้าวของแถว — กล่องเดียวรับทั้งห้าก้าว ช่องสลับตามก้าวที่กด
          ⭐ ห้ากล่องแยกจะได้ปุ่มยกเลิก/บันทึกและกติกาวันที่ห้าชุดที่ต้องคอยดูแลให้ตรงกัน
          ซึ่งเป็นโรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้ */}
      <Modal
        open={!!hopDraft} onClose={() => setHopDraft(null)} size="sm" dismissible={!saving}
        title={hopDraft ? `${hopLabel(hopDraft.hop, hopDraft.outcome)} — ${hopDraft.item.label}` : ""}
      >
        {hopDraft && (
          <>
            <div className="form-group">
              <label htmlFor="hop-at">{HOP_DATE_LABEL[hopDraft.hop]}</label>
              {/* แก้ย้อนหลังได้ตั้งใจ — ของถูกส่งไปก่อนแล้วค่อยมาบันทึกเป็นเรื่องปกติ
                  (migration จึงไม่มี CHECK บังคับให้วันเรียงกัน) */}
              <input
                id="hop-at" type="date" className="input-premium"
                value={hopDraft.at} disabled={saving}
                onChange={(e) => setHopDraft({ ...hopDraft, at: e.target.value })}
              />
            </div>

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
                  <input
                    id="hop-formula-date" type="date" className="input-premium"
                    value={hopDraft.formulaDate} disabled={saving}
                    onChange={(e) => setHopDraft({ ...hopDraft, formulaDate: e.target.value })}
                  />
                </div>
              </>
            )}

            {hopDraft.hop === "ack" && (
              <div className="form-group">
                <label htmlFor="hop-due">รับปากว่าจะส่งวันไหน (ไม่ใส่ก็ได้)</label>
                <input
                  id="hop-due" type="date" className="input-premium"
                  value={hopDraft.dueAt} disabled={saving}
                  onChange={(e) => setHopDraft({ ...hopDraft, dueAt: e.target.value })}
                />
                <p className={styles.fieldHint}>
                  ผู้ขอเห็นวันนี้ทันที และคิวใช้วันนี้เป็นตัวชี้ว่าเลยกำหนดหรือยัง
                </p>
              </div>
            )}

            {hopDraft.outcome === "confirmed" && (
              <div className="form-group">
                <label htmlFor="hop-qty">จำนวนที่ลูกค้าคอนเฟิร์ม</label>
                <input
                  id="hop-qty" type="number" min="0" step="any" className="input-premium"
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
      <Modal
        open={!!answering} onClose={() => setAnswering(null)} size="md" dismissible={!saving}
        title={answering ? `ตอบราคา — ${answering.item.label}` : ""}
      >
        {answering && (
          <>
            <PriceTierFields
              value={answering.tiers} disabled={saving}
              unitLabel={unitOf(answering.item.kind)}
              onChange={(tiers) => setAnswering({ ...answering, tiers })}
            />
            <div className="glass-panel" style={{ padding: "10px 12px", fontSize: "var(--fs-5)", color: "var(--text-2)" }}>
              ราคานี้จะเข้าทะเบียนวัสดุเป็นรุ่นใหม่ของ <b>{answering.item.label}</b>
              {req.customerName ? ` (ราคาเฉพาะ ${req.customerName})` : " (ราคากลาง)"}
            </div>
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setAnswering(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent"
                disabled={saving || !answering.tiers.some((t) => String(t.price ?? "") !== "")}
                onClick={() => submitAnswer(
                  { itemId: answering.item.id, tiers: answering.tiers },
                  "บันทึกราคาเข้าทะเบียนแล้ว",
                )}
              >
                บันทึกราคา
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ตอบไม่ได้ — ต้องมีเหตุผล ไม่งั้นเคสค้าง open ตลอดไป */}
      <Modal
        open={!!noQuote} onClose={() => setNoQuote(null)} size="sm" dismissible={!saving}
        title={noQuote ? `ตอบไม่ได้ — ${noQuote.item.label}` : ""}
      >
        {noQuote && (
          <>
            <div className="form-group">
              <label htmlFor="ask-no-quote">เหตุผล</label>
              <Textarea variant="data"
                id="ask-no-quote" rows={3} maxLength={500}
                value={noQuote.reason} disabled={saving}
                placeholder="เช่น โรงงานไม่รับผลิตขนาดนี้ / เลิกผลิตแล้ว / ต้องขอสเปกเพิ่ม"
                onChange={(e) => setNoQuote({ ...noQuote, reason: e.target.value })}
              />
            </div>
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setNoQuote(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent" disabled={saving || !noQuote.reason.trim()}
                onClick={() => submitAnswer(
                  { itemId: noQuote.item.id, noQuote: true, reason: noQuote.reason },
                  "บันทึกว่าตอบไม่ได้แล้ว",
                )}
              >
                บันทึก
              </button>
            </div>
          </>
        )}
      </Modal>

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
                  <input
                    id="close-outcome-name" className="input-premium" maxLength={200}
                    value={outcome.scentName} disabled={saving}
                    placeholder="ชื่อกลิ่นจริงที่ RD ตั้ง ไม่ใช่หัวเรื่องบรีฟ"
                    onChange={(e) => setOutcome({ ...outcome, scentName: e.target.value })}
                  />
                </div>
                {/* รหัสกลิ่นเป็นของ RD (มติ 8) — คนอื่นเปิดได้แค่ร่างรอ RD รับเข้าทะเบียน */}
                {isScentRegistrar(me) ? (
                  <div className="form-group">
                    <label htmlFor="close-outcome-code">รหัสกลิ่น (ใส่แล้วเข้าทะเบียนเลย)</label>
                    <input
                      id="close-outcome-code" className="input-premium mono" maxLength={100}
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
                  const done = await call("/items", {
                    method: "POST", body: JSON.stringify({ rows: delivery }),
                  }, `ส่งกลิ่น ${delivery.length} รายการ · เข้าทะเบียนแล้ว`);
                  if (done) setDelivery(null);
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

      {/* ยกเลิกเคส */}
      <Modal open={!!cancelReason} onClose={() => setCancelReason("")} title="ยกเลิกเคสขอราคา" size="sm" dismissible={!saving}>
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
            }, "ยกเลิกเคสแล้ว").then((ok) => { if (ok) setCancelReason(""); })}
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
