"use client";
// รายละเอียดเคสขอราคาวัสดุ (mig 0158)
//
// ผู้ขอ: ส่งเคส / ยกเลิก / ลบร่าง · เห็นสถานะทุกขั้นว่าใครรับเรื่องแล้ว
// RD/PC: รับเรื่อง → ตอบราคาราย "ชั้นจำนวน" ที่ผู้ขอระบุ หรือกด "ตอบไม่ได้" พร้อมเหตุผล
// ราคาที่ตอบ = rev ใหม่ของวัสดุตัวเดิมในทะเบียน และเติมกลับบรรทัดในใบขอราคาผลิตให้เอง
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ClipboardList, Send, Ban, Check, CheckCheck, MessageSquare, Trash2 } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
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
import { canQuoteMaterial } from "@/lib/materialPrices";
import {
  REQUEST_ITEM_STATUS_LABELS, REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS,
  answerRequestError, closeOutcomeError, closeRequestError, requestNeedsOutcome, requestProgress,
} from "@/lib/deptRequests";
import { requestHasItems, requestKindLabel } from "@/lib/master/requestTypes";
import { SCENT_STATUS_LABELS, isScentRegistrar } from "@/lib/master/scents";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import styles from "./page.module.css";
import { workflowStepsFromIndex } from "@/lib/documentControlModel";

const STATUS_TONE = {
  draft: "var(--text-3)",
  pending: "var(--amber)",
  acknowledged: "var(--blue)",
  answered: "var(--green)",
  closed: "var(--text-3)",
  cancelled: "var(--text-3)",
};
const ITEM_TONE = { pending: "var(--text-3)", quoted: "var(--green)", no_quote: "var(--red)" };
const unitOf = (kind) => (kind === "PM" ? "฿/ชิ้น" : "฿/กก.");
const qtyText = (v) => `${Number(v).toLocaleString("th-TH")} ขึ้นไป`;

export default function MaterialAskDetailPage() {
  const { id } = useParams();
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);

  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [answering, setAnswering] = useState(null); // { item, tiers }
  const [noQuote, setNoQuote] = useState(null);     // { item, reason }
  const [confirm, setConfirm] = useState(null);     // { kind }
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  // ผลลัพธ์ตอนปิดบรีฟกลิ่น — { mode: 'link'|'create'|'none', scentId, scentName, code }
  const [outcome, setOutcome] = useState(null);
  const [scentOptions, setScentOptions] = useState([]);

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
  const back = { href: `/sa/requests?tab=${backTab}`, label: "กลับรายการคำร้อง" };
  if (loading) return <Workspace hideHeader back={back}><SkeletonRows rows={5} /></Workspace>;
  if (loadError || !req) {
    return (
      <Workspace hideHeader back={back}>
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError || "ไม่พบเคส"}</div>
      </Workspace>
    );
  }

  const owner = canQuoteMaterial(me, req.dept);
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
    return {
      title: "ลบคำร้องร่าง",
      description: "คำร้องนี้ยังไม่ถูกส่ง จึงลบทิ้งได้",
      confirmLabel: "ลบคำร้อง",
    };
  };

  const runConfirm = async () => {
    if (confirm.kind === "delete") {
      const ok = await call("", { method: "DELETE" }, "ลบเคสร่างแล้ว");
      if (ok) window.location.href = "/sa/requests?tab=mine";
      return;
    }
    const labels = { submit: "ส่งคำร้องแล้ว", answer: "บันทึกว่าตอบแล้ว", close: "ปิดเรื่องแล้ว" };
    const ok = await call("", {
      method: "PATCH", body: JSON.stringify({ action: confirm.kind }),
    }, labels[confirm.kind]);
    if (ok) setConfirm(null);
  };

  const workflowIndex = req.status === "draft"
    ? 0
    : req.status === "pending"
      ? 1
      : req.status === "acknowledged"
        ? 2
        : req.status === "answered"
          ? 3
          : 4;
  // ขั้นตอนบนการ์ดควบคุมพูดภาษาของชนิดนั้น — ชนิดที่ไม่มีบรรทัดไม่ได้ "หาราคา"
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "จัดทำคำร้อง", hint: hasItems ? "ระบุวัสดุและชั้นจำนวน" : "ระบุเรื่องที่ต้องการ" },
    { id: "pending", label: "รอรับเรื่อง", hint: `ส่งถึงฝ่าย ${req.dept}` },
    { id: "acknowledged", label: hasItems ? "กำลังหาราคา" : "กำลังดำเนินการ", hint: "ฝ่ายเจ้าของรับเรื่องแล้ว" },
    { id: "answered", label: "ตอบแล้ว", hint: hasItems ? "บันทึกราคาเข้าทะเบียนวัสดุ" : "ผู้ตอบยืนยันว่าตอบครบ" },
    { id: "closed", label: "ปิดเรื่อง", hint: "งานนี้สิ้นสุด" },
  ], workflowIndex, req.status === "cancelled");
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
                  label: "ลบคำร้องร่าง",
                  kind: "delete",
                  icon: Trash2,
                  onClick: () => setConfirm({ kind: "delete" }),
                  visible: req._mine && req.status === "draft",
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
        {/* เนื้อคำร้องของชนิดที่ไม่มีบรรทัด — บรีฟกลิ่น/สอบถาม/ขอเอกสาร เก็บเรื่องจริง
            ไว้ใน title+body ซึ่งหน้านี้ไม่เคยแสดงเลย (แสดงแต่ note) ผู้ตอบจึงเห็น
            แต่หัวเรื่องบนแถบบน แล้วต้องเดาเอาว่าเขาขออะไร */}
        {!hasItems && req.body && (
          <ReadableText text={req.body} lines={12} className={styles.requestBody} />
        )}
        {req.note && <ReadableText text={req.note} lines={4} style={{ marginTop: 12, fontSize: "var(--fs-7)", color: "var(--text-2)" }} />}
        {req.status === "cancelled" && req.cancelReason && (
          <div style={{ marginTop: 8, fontSize: "var(--fs-7)", color: "var(--red)" }}>
            <strong>เหตุผลที่ยกเลิก: </strong><ReadableText text={req.cancelReason} lines={4} />
          </div>
        )}
      </div>

      {(req.items || []).map((item) => (
        <div key={item.id} className="glass-panel" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              {item.spec && (
                <ReadableText text={item.spec} lines={3} style={{ marginTop: 4, fontSize: "var(--fs-7)", color: "var(--text-2)" }} />
              )}
              <div style={{ marginTop: 6, fontSize: "var(--fs-5)", color: "var(--text-3)" }}>
                ขอราคาที่: {(item.tiers || []).length
                  ? (item.tiers || []).map((t) => qtyText(t.qty)).join(" · ")
                  : "ราคาเดียว (ไม่แบ่งชั้นจำนวน)"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="ui-badge" style={{ background: "var(--panel-3)", color: ITEM_TONE[item.priceStatus] }}>
                {REQUEST_ITEM_STATUS_LABELS[item.priceStatus]}
              </span>
              {item.answeredByName && (
                <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginTop: 4 }}>
                  {item.answeredByName} · {fmtDate(item.answeredAt)}
                </div>
              )}
            </div>
          </div>

          {item.priceStatus === "no_quote" && item.noQuoteReason && (
            <div style={{ marginTop: 8, fontSize: "var(--fs-7)", color: "var(--red)" }}>
              <strong>ตอบไม่ได้: </strong><ReadableText text={item.noQuoteReason} lines={3} />
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

          {canAnswer && item.priceStatus === "pending" && (
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
      ))}

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
          onPosted={load}
        />
      </DetailCard>
        </div>
      </DetailPageLayout>

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
              <textarea
                id="ask-no-quote" className="textarea-premium" rows={3} maxLength={500}
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

      {/* ยกเลิกเคส */}
      <Modal open={!!cancelReason} onClose={() => setCancelReason("")} title="ยกเลิกเคสขอราคา" size="sm" dismissible={!saving}>
        <div className="form-group">
          <label htmlFor="ask-cancel">เหตุผลที่ยกเลิก</label>
          <textarea
            id="ask-cancel" className="textarea-premium" rows={3} maxLength={500}
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
