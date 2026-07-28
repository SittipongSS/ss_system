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
  REQUEST_ITEM_STATUS_LABELS, REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS, askProgress,
} from "@/lib/deptRequests";
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

  // รายการเคสเป็นแท็บของหน้าวัสดุแล้ว — กลับไปแท็บที่คนคนนี้ใช้งานจริง
  // (ผู้ตอบกลับเข้าคิวของฝ่ายที่เคสนี้ถามไป, ผู้ขอกลับไปดูเคสของตัวเอง)
  const backTab = req?._mine === false ? `queue-${req.dept}` : "mine";
  const back = { href: `/sa/materials?tab=${backTab}`, label: "กลับรายการเคส" };
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
  const canClose = progress.complete && !["closed", "cancelled"].includes(req.status) && (req._mine || owner);

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
    if (confirm.kind === "close") {
      return {
        title: "ปิดเคส",
        description: req.docNo || "",
        detail: "ราคาที่ตอบแล้วยังอยู่ในทะเบียนวัสดุตามเดิม — ปิดเคสแค่บอกว่างานนี้จบ",
        confirmLabel: "ปิดเคส",
      };
    }
    return {
      title: "ลบเคสร่าง",
      description: "เคสนี้ยังไม่ถูกส่ง จึงลบทิ้งได้",
      confirmLabel: "ลบเคส",
    };
  };

  const runConfirm = async () => {
    if (confirm.kind === "delete") {
      const ok = await call("", { method: "DELETE" }, "ลบเคสร่างแล้ว");
      if (ok) window.location.href = "/sa/materials?tab=mine";
      return;
    }
    const labels = { submit: "ส่งเคสแล้ว", close: "ปิดเคสแล้ว" };
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
  const workflowSteps = workflowStepsFromIndex([
    { id: "draft", label: "จัดทำเคส", hint: "ระบุวัสดุและชั้นจำนวน" },
    { id: "pending", label: "รอรับเรื่อง", hint: `ส่งถึงฝ่าย ${req.dept}` },
    { id: "acknowledged", label: "กำลังหาราคา", hint: "ฝ่ายเจ้าของรับเรื่องแล้ว" },
    { id: "answered", label: "ตอบครบ", hint: "บันทึกราคาเข้าทะเบียนวัสดุ" },
    { id: "closed", label: "ปิดเคส", hint: "งานขอราคาสิ้นสุด" },
  ], workflowIndex, req.status === "cancelled");
  const primaryAction = req._mine && req.status === "draft"
    ? {
      id: "submit",
      label: "ส่งเคส",
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
      : canClose
        ? {
          id: "close",
          label: "ปิดเคส",
          kind: "approve",
          icon: CheckCheck,
          onClick: () => setConfirm({ kind: "close" }),
        }
        : null;

  return (
    <Workspace hideHeader back={back}>
      <SalesDetailOverview
        eyebrow="MATERIAL PRICE REQUEST"
        title={req.docNo || "เคสขอราคา (ร่าง)"}
        description={`${req.customerName || "ราคากลาง"} · ถึงฝ่าย ${req.dept} · ผู้ขอ ${req.requestedByName || "—"}`}
        badges={<SalesStateBadge label={REQUEST_STATUS_LABELS[req.status] || req.status} color={STATUS_TONE[req.status]} />}
        facts={[
          { key: "created", icon: ClipboardList, label: "วันที่สร้าง", value: fmtDate(req.createdAt) },
          { key: "department", label: "ฝ่ายผู้ตอบ", value: req.dept },
          { key: "items", label: "รายการ", value: `${progress.total} รายการ` },
          { key: "progress", label: "ตอบแล้ว", value: `${progress.done}/${progress.total}` },
        ]}
      />

      <DetailPageLayout
        asideLabel="สรุปและจัดการเคสขอราคาวัสดุ"
        aside={(
          <>
            <DocumentSummaryCard
              title="สรุปเคสขอราคา"
              rows={[
                { id: "department", label: "ฝ่ายผู้ตอบ", value: req.dept },
                { id: "items", label: "รายการทั้งหมด", value: `${progress.total} รายการ` },
                { id: "answered", label: "ตอบแล้ว", value: `${progress.done}/${progress.total}` },
                { id: "pending", label: "รอคำตอบ", value: `${Math.max(progress.total - progress.done, 0)} รายการ` },
              ]}
              status={REQUEST_STATUS_LABELS[req.status] || req.status}
              statusColor={STATUS_TONE[req.status]}
            />
            <DocumentControlCard
              status={REQUEST_STATUS_LABELS[req.status] || req.status}
              statusColor={STATUS_TONE[req.status]}
              statusDescription="การดำเนินการระดับเคส"
              workflowSteps={workflowSteps}
              primaryAction={primaryAction}
              dangerActions={[
                {
                  id: "delete",
                  label: "ลบเคสร่าง",
                  kind: "delete",
                  icon: Trash2,
                  onClick: () => setConfirm({ kind: "delete" }),
                  visible: req._mine && req.status === "draft",
                },
                {
                  id: "cancel",
                  label: "ยกเลิกเคส",
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
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>
            ตอบแล้ว {progress.done}/{progress.total} รายการ
          </span>
          {req.acknowledgedByName && (
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              รับเรื่องโดย {req.acknowledgedByName} · {fmtDate(req.acknowledgedAt)}
            </span>
          )}
          {req.formulaCode && (
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>สูตร {req.formulaCode}</span>
          )}
        </div>
        {req.note && <ReadableText text={req.note} lines={4} style={{ marginTop: 12, fontSize: 13, color: "var(--text-2)" }} />}
        {req.status === "cancelled" && req.cancelReason && (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>
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
                <ReadableText text={item.spec} lines={3} style={{ marginTop: 4, fontSize: 13, color: "var(--text-2)" }} />
              )}
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
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
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  {item.answeredByName} · {fmtDate(item.answeredAt)}
                </div>
              )}
            </div>
          </div>

          {item.priceStatus === "no_quote" && item.noQuoteReason && (
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>
              <strong>ตอบไม่ได้: </strong><ReadableText text={item.noQuoteReason} lines={3} />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div className="toolbar-label">รูป / สเปกแนบ</div>
            <AttachmentsPanel
              entityType="material_ask_item"
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
      <DetailCard icon={MessageSquare} eyebrow="Discussion" title="พูดคุยในเคสนี้">
        <UpdateThread
          entityType="material_ask"
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
            <div className="glass-panel" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
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
