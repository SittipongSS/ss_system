"use client";
// หน้ารายละเอียดใบขอราคาต้นทุน — อ่านได้ทุกฝ่ายที่เกี่ยวข้อง, แก้ได้เฉพาะฝ่ายขาย
// เจ้าของใบ (ตาม canEditCostingRequest). การตอบราคา RD/PC และการอนุมัติของ
// ผู้บริหารมาใน PR4 — หน้านี้แสดงบรรทัดต้นทุนแบบอ่านอย่างเดียวไปก่อน
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Calculator, Pencil, Ban, Send, Check, Undo2 } from "lucide-react";
import Modal from "@/components/Modal";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import CostingRequestForm, {
  costingFormFromRequest, costingPayloadFrom,
} from "@/components/costing/CostingRequestForm";
import { useDepartment, useRole, useTeam } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import {
  COSTING_STATUS_LABELS, COSTING_STATUS_TONES, ITEM_APPROVAL_LABELS,
  approvalProgress, canDecideItem, canEditCostingRequest, canQuoteComponent, canQuoteOnRequest,
  componentUnitCost, isMoqTier, itemUnitCost, pricingProgress,
  submitForPricingError, submitToExecError,
} from "@/lib/costing";
import { COST_LINE_KIND_LABELS } from "@/lib/master/costTemplate";

const money = (value) => (value == null
  ? "—"
  : Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function CostingDetailPage() {
  const { id } = useParams();
  const role = useRole();
  const team = useTeam();
  const department = useDepartment();

  const [request, setRequest] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [templateCategories, setTemplateCategories] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [toast, setToast] = useState(null);
  // ราคาที่ RD/PC กำลังกรอก (ยังไม่บันทึก) — key = componentId
  const [quoteDraft, setQuoteDraft] = useState({});
  // การตัดสินของผู้บริหารต่อรายการ — { itemId, mode: 'approve'|'return' }
  const [decision, setDecision] = useState(null);
  const [tierDraft, setTierDraft] = useState({});
  const [returnReason, setReturnReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [reqRes, typeRes, tplRes] = await Promise.all([
        fetch(`/api/sa/costing/${id}`, { cache: "no-store" }),
        fetch("/api/product-types", { cache: "no-store" }),
        fetch("/api/cost-templates", { cache: "no-store" }),
      ]);
      const d = await reqRes.json().catch(() => null);
      if (!reqRes.ok) throw new Error(d?.error || "โหลดใบขอราคาไม่สำเร็จ");
      setRequest(d);
      setProductTypes(await typeRes.json().catch(() => []));
      const templates = await tplRes.json().catch(() => []);
      setTemplateCategories(new Set((Array.isArray(templates) ? templates : []).map((t) => t.categoryCode)));
    } catch (e) {
      setLoadError(e.message);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ผู้ใช้ปัจจุบันในรูปที่ predicate ฝั่ง lib ต้องการ (id มาจาก requestedById ไม่ได้ —
  // ใช้ role/team/department ที่ context ให้มา; server กันซ้ำอยู่แล้ว)
  const canEdit = useMemo(
    () => !!request && canEditCostingRequest({ role, team, department, id: request.requestedById }, request),
    [request, role, team, department],
  );

  // รายการที่มีราคาที่ฝ่ายอื่นตอบแล้ว หรือมีราคาอนุมัติแล้ว = ลบ/เปลี่ยนประเภทไม่ได้
  const lockedItemIds = useMemo(() => new Set(
    (request?.items || [])
      .filter((item) => (item.components || []).some((c) => c.priceStatus === "quoted")
        || (item.tiers || []).some((t) => t.approvedUnitPrice != null))
      .map((item) => item.id),
  ), [request]);

  const me = useMemo(() => ({ role, team, department }), [role, team, department]);

  // เรียก endpoint แล้วโหลดใบใหม่ — ใช้ร่วมทุก action (ส่ง/ตอบราคา/อนุมัติ)
  const runAction = useCallback(async (path, init, successMsg) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/costing/${id}${path}`, {
        headers: { "Content-Type": "application/json" }, ...init,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      setToast({ kind: "success", msg: successMsg });
      await load();
      return true;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, load]);

  const openEdit = () => setForm(costingFormFromRequest(request));
  const closeEdit = () => { setForm(null); setPendingSave(false); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/costing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costingPayloadFrom(form)),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setToast({ kind: "success", msg: "บันทึกใบขอราคาแล้ว" });
      closeEdit();
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setPendingSave(false);
    }
    setSaving(false);
  };

  const cancelRequest = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/costing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", cancelReason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ยกเลิกไม่สำเร็จ");
      setToast({ kind: "success", msg: "ยกเลิกใบแล้ว" });
      setPendingCancel(false);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setSaving(false);
  };

  if (loading) return <Workspace hideHeader back={{ href: "/sa/costing", label: "กลับรายการ" }}><SkeletonRows rows={6} /></Workspace>;
  if (loadError || !request) {
    return (
      <Workspace hideHeader back={{ href: "/sa/costing", label: "กลับรายการ" }}>
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>
          {loadError || "ไม่พบใบขอราคา"}
        </div>
      </Workspace>
    );
  }

  const approval = approvalProgress(request.items || []);
  const pricing = pricingProgress((request.items || []).flatMap((i) => i.components || []));

  // บรรทัดที่ผู้ใช้คนนี้ตอบราคาได้จริง (ฝ่ายตน + ใบอยู่ในจังหวะที่ตอบได้)
  const quotableIds = new Set(
    canQuoteOnRequest(request)
      ? (request.items || []).flatMap((item) => (item.components || [])
        .filter((c) => canQuoteComponent(me, c))
        .map((c) => c.id))
      : [],
  );
  const draftEntries = Object.entries(quoteDraft)
    .filter(([componentId, value]) => quotableIds.has(componentId) && value !== "" && value != null);

  const saveQuotes = () => runAction("/quote", {
    method: "PATCH",
    body: JSON.stringify({
      prices: draftEntries.map(([componentId, price]) => ({ componentId, price })),
    }),
  }, "บันทึกราคาแล้ว").then((ok) => { if (ok) setQuoteDraft({}); });

  const submit = (stage) => {
    const blocked = stage === "pricing" ? submitForPricingError(request) : submitToExecError(request);
    if (blocked) { setToast({ kind: "error", msg: blocked }); return; }
    runAction("/submit", { method: "POST", body: JSON.stringify({ stage }) },
      stage === "pricing" ? "ส่งขอราคาให้ RD/PC แล้ว" : "ส่งให้ผู้บริหารแล้ว");
  };

  const sendDecision = () => {
    const item = (request.items || []).find((i) => i.id === decision.itemId);
    const payload = decision.mode === "return"
      ? { itemId: decision.itemId, decision: "return", returnReason }
      : {
        itemId: decision.itemId,
        decision: "approve",
        tierPrices: (item?.tiers || []).map((t) => ({
          tierId: t.id,
          price: tierDraft[t.id] ?? t.approvedUnitPrice,
        })),
      };
    runAction("/approve", { method: "POST", body: JSON.stringify(payload) },
      decision.mode === "return" ? "ตีกลับรายการแล้ว" : "อนุมัติราคาผลิตแล้ว")
      .then((ok) => {
        if (ok) { setDecision(null); setTierDraft({}); setReturnReason(""); }
      });
  };

  return (
    <Workspace hideHeader back={{ href: "/sa/costing", label: "กลับรายการ" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Calculator size={22} /></span>{" "}
            {request.docNo || "ใบขอราคา (ร่าง)"}
          </h1>
          <p>{request.customerName || "ไม่ระบุลูกค้า"} · สร้างเมื่อ {fmtDate(request.createdAt)}</p>
        </div>
        {/* action ของ entity อยู่ขวาบนนอกการ์ด ตาม page-header standard */}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={openEdit} disabled={saving}>
              <Pencil size={14} /> แก้ไข
            </button>
            <button type="button" className="btn" onClick={() => setPendingCancel(true)} disabled={saving}>
              <Ban size={14} /> ยกเลิกใบ
            </button>
            {/* ปุ่มเดินใบมีได้ทีละอันตามสถานะ — action หลักเดียวต่อหน้า */}
            {request.status === "draft" && (
              <button type="button" className="btn btn-accent" onClick={() => submit("pricing")} disabled={saving}>
                <Send size={14} /> ส่งขอราคา RD/PC
              </button>
            )}
            {["assembling", "returned"].includes(request.status) && (
              <button type="button" className="btn btn-accent" onClick={() => submit("exec")} disabled={saving}>
                <Send size={14} /> ส่งผู้บริหารอนุมัติ
              </button>
            )}
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <span
            className="status-pill"
            style={{ color: COSTING_STATUS_TONES[request.status], borderColor: "currentColor" }}
          >
            {COSTING_STATUS_LABELS[request.status] || request.status}
          </span>
          <span className="chip">MOQ {Number(request.moq).toLocaleString("th-TH")} ชิ้น</span>
          <span className="chip">
            ราคา {pricing.total === 0 ? "—" : `${pricing.quoted}/${pricing.total}`}
          </span>
          <span className="chip" style={{ color: approval.returned > 0 ? "var(--red)" : undefined }}>
            อนุมัติ {approval.approved}/{approval.total}
            {approval.returned > 0 ? ` · ตีกลับ ${approval.returned}` : ""}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            ผู้ขอ {request.requestedByName || "—"}
          </span>
        </div>
        {request.note && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-2)" }}>{request.note}</p>
        )}
        {request.status === "cancelled" && request.cancelReason && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--red)" }}>
            เหตุผลที่ยกเลิก: {request.cancelReason}
          </p>
        )}
      </div>

      {(request.items || []).map((item) => {
        const cost = itemUnitCost(item.components || []);
        return (
          <div key={item.id} className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>{item.productLabel}</strong>
              <span className="ui-badge" style={{ background: "var(--panel-2)", color: "var(--text-2)" }}>
                {item.categoryCode}
              </span>
              {item.fragranceName && <span className="chip">{item.fragranceName}</span>}
              <span className="spacer" style={{ flex: 1 }} />
              <span
                className="status-pill"
                style={{
                  color: item.approvalStatus === "approved" ? "var(--green)"
                    : item.approvalStatus === "returned" ? "var(--red)" : "var(--amber)",
                  borderColor: "currentColor",
                }}
              >
                {ITEM_APPROVAL_LABELS[item.approvalStatus] || item.approvalStatus}
              </span>
            </div>

            {item.approvalStatus === "returned" && item.returnReason && (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--red)" }}>
                ผู้บริหารตีกลับ: {item.returnReason}
              </p>
            )}

            <div className="premium-table-wrapper">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รายการต้นทุน</th>
                    <th style={{ width: 130 }}>ชนิด</th>
                    <th style={{ width: 110 }}>ขอจาก</th>
                    <th style={{ width: 110 }}>กรัม/ชิ้น</th>
                    <th style={{ width: 130 }}>ราคาที่ตอบ</th>
                    <th style={{ width: 120 }}>ต้นทุน/ชิ้น</th>
                  </tr>
                </thead>
                <tbody>
                  {(item.components || []).map((component) => {
                    const unit = componentUnitCost(component);
                    return (
                      <tr key={component.id}>
                        <td>
                          {component.label}
                          {component.required === false && (
                            <span style={{ fontSize: 11, color: "var(--text-3)" }}> (ไม่บังคับ)</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-2)" }}>
                          {COST_LINE_KIND_LABELS[component.kind] || component.kind}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {component.sourceDept || <span style={{ color: "var(--text-3)" }}>ภายใน</span>}
                        </td>
                        <td>{component.gramsPerUnit ?? <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td>
                          {quotableIds.has(component.id) ? (
                            <input
                              className="premium-input"
                              type="number" min="0" step="0.01"
                              placeholder={component.unitBasis === "per_kg" ? "บาท/กก." : "บาท/ชิ้น"}
                              aria-label={`ราคาของ ${component.label}`}
                              value={quoteDraft[component.id]
                                ?? (component.pricePerKg ?? component.pricePerUnit ?? "")}
                              onChange={(e) => setQuoteDraft((d) => ({ ...d, [component.id]: e.target.value }))}
                            />
                          ) : component.priceStatus === "quoted"
                            ? `${money(component.pricePerKg ?? component.pricePerUnit)} ${component.unitBasis === "per_kg" ? "฿/กก." : "฿/ชิ้น"}`
                            : <span style={{ color: "var(--text-3)" }}>ยังไม่ตอบ</span>}
                        </td>
                        <td>{unit == null ? <span style={{ color: "var(--text-3)" }}>—</span> : money(unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ textAlign: "right", fontWeight: 600 }}>
                      ต้นทุนรวมต่อชิ้น
                      {!cost.complete && (
                        <span style={{ color: "var(--amber)", fontWeight: 400, fontSize: 12 }}>
                          {" "}(ยังไม่ครบ — รอราคาบางรายการ)
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{money(cost.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="toolbar-label" style={{ marginBottom: 6 }}>ราคาผลิตที่อนุมัติ (ต่อชั้นจำนวน)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(item.tiers || []).map((tier) => (
                  <span
                    key={tier.id}
                    className="chip"
                    style={isMoqTier(tier, request.moq) ? { color: "var(--accent)" } : undefined}
                  >
                    {Number(tier.qty).toLocaleString("th-TH")} ชิ้น:{" "}
                    {tier.approvedUnitPrice == null ? "รออนุมัติ" : `${money(tier.approvedUnitPrice)} ฿`}
                    {isMoqTier(tier, request.moq) ? " · MOQ" : ""}
                  </span>
                ))}
              </div>
            </div>

            {/* รูปตัวอย่าง/สเปกของสินค้าตัวนี้ — RD/PC ดูประกอบตอนตอบราคา
                แนบได้เฉพาะฝ่ายขายเจ้าของใบ (ฝ่ายอื่นเห็นอย่างเดียว) */}
            <div style={{ marginTop: 12 }}>
              <div className="toolbar-label">ไฟล์แนบของสินค้านี้</div>
              <AttachmentsPanel
                entityType="costing_item"
                entityId={item.id}
                canEdit={canEdit}
                inlineUpload
              />
            </div>

            {canDecideItem(me, request, item) && (
              <div className="action-bar" style={{ marginTop: 12 }}>
                <button
                  type="button" className="btn" disabled={saving}
                  onClick={() => { setDecision({ itemId: item.id, mode: "return" }); setReturnReason(""); }}
                >
                  <Undo2 size={14} /> ตีกลับให้แก้
                </button>
                <button
                  type="button" className="btn btn-success" disabled={saving}
                  onClick={() => {
                    setDecision({ itemId: item.id, mode: "approve" });
                    setTierDraft(Object.fromEntries((item.tiers || [])
                      .map((t) => [t.id, t.approvedUnitPrice ?? ""])));
                  }}
                >
                  <Check size={14} /> อนุมัติราคาผลิต
                </button>
              </div>
            )}
          </div>
        );
      })}

      {draftEntries.length > 0 && (
        <div className="glass-panel" style={{ padding: 16, position: "sticky", bottom: 12 }}>
          <div className="action-bar">
            <span style={{ marginRight: "auto", color: "var(--text-2)" }}>
              กรอกราคาไว้ {draftEntries.length} บรรทัด — ยังไม่บันทึก
            </span>
            <button type="button" className="btn ghost" onClick={() => setQuoteDraft({})} disabled={saving}>
              ล้าง
            </button>
            <button type="button" className="btn btn-accent" onClick={saveQuotes} disabled={saving}>
              บันทึกราคา
            </button>
          </div>
        </div>
      )}

      <Modal open={!!form} onClose={closeEdit} title="แก้ไขใบขอราคา" size="lg" dismissible={!saving}>
        {form && (
          <>
            <CostingRequestForm
              mode="edit"
              form={form}
              setForm={setForm}
              productTypes={productTypes}
              templateCategories={templateCategories}
              dealLabel={request.customerName ? `${request.customerName} (ดีล ${request.dealId})` : request.dealId}
              lockedItemIds={lockedItemIds}
            />
            <div className="action-bar" style={{ marginTop: 20 }}>
              <button type="button" className="btn ghost" onClick={closeEdit} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={() => setPendingSave(true)} disabled={saving}>
                บันทึก
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingSave}
        title="ยืนยันบันทึกใบขอราคา"
        description="สินค้าที่เพิ่มใหม่จะกางบรรทัดต้นทุนจากแม่แบบของประเภทนั้นให้อัตโนมัติ"
        detail="รายการที่ฝ่ายอื่นตอบราคาแล้วจะไม่ถูกแตะ — ถ้ามีอะไรที่ลบไม่ได้ ระบบจะแจ้งกลับก่อนบันทึก"
        confirmLabel="บันทึก"
        busy={saving}
        onConfirm={save}
        onClose={() => setPendingSave(false)}
      />

      <Modal open={pendingCancel} onClose={() => setPendingCancel(false)} title="ยกเลิกใบขอราคา" size="sm" dismissible={!saving}>
        <div className="form-group">
          <label htmlFor="cr-cancel-reason">เหตุผลที่ยกเลิก</label>
          <textarea
            id="cr-cancel-reason" className="textarea-premium" rows={3} maxLength={500}
            placeholder="เช่น ดีลไม่ไปต่อ / ลูกค้าเปลี่ยนสเปก"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <small style={{ color: "var(--text-3)" }}>
            ใบที่ยกเลิกแล้วเปิดกลับไม่ได้ และยังเก็บไว้เป็นร่องรอย ไม่ได้ถูกลบ
          </small>
        </div>
        <div className="action-bar" style={{ marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={() => setPendingCancel(false)} disabled={saving}>
            ปิด
          </button>
          <button
            type="button" className="btn btn-danger" disabled={saving || !cancelReason.trim()}
            onClick={cancelRequest}
          >
            ยกเลิกใบนี้
          </button>
        </div>
      </Modal>

      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision?.mode === "return" ? "ตีกลับรายการนี้" : "อนุมัติราคาผลิต"}
        size="sm"
        dismissible={!saving}
      >
        {decision && (() => {
          const item = (request.items || []).find((i) => i.id === decision.itemId);
          if (!item) return null;
          const cost = itemUnitCost(item.components || []);
          return (
            <>
              <p style={{ marginTop: 0, color: "var(--text-2)" }}>{item.productLabel}</p>
              {decision.mode === "return" ? (
                <div className="form-group">
                  <label htmlFor="cr-return-reason">เหตุผลที่ตีกลับ</label>
                  <textarea
                    id="cr-return-reason" className="textarea-premium" rows={3} maxLength={500}
                    placeholder="เช่น ต้นทุนบรรจุภัณฑ์สูงผิดปกติ ให้ตรวจสอบราคาใหม่"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                  />
                  <small style={{ color: "var(--text-3)" }}>
                    ฝ่ายขายจะเห็นเหตุผลนี้ และรายการอื่นที่อนุมัติแล้วจะไม่ถูกกระทบ
                  </small>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                    ต้นทุนรวมต่อชิ้น <strong>{money(cost.total)} ฿</strong>
                    {!cost.complete && (
                      <span style={{ color: "var(--amber)" }}> (ยังไม่ครบ)</span>
                    )}
                  </p>
                  {(item.tiers || []).map((tier) => (
                    <div className="form-group" key={tier.id}>
                      <label htmlFor={`tier-${tier.id}`}>
                        ราคาผลิตที่ {Number(tier.qty).toLocaleString("th-TH")} ชิ้น
                        {isMoqTier(tier, request.moq) ? " (MOQ)" : ""}
                      </label>
                      <input
                        id={`tier-${tier.id}`} className="premium-input"
                        type="number" min="0" step="0.01" placeholder="บาท/ชิ้น"
                        value={tierDraft[tier.id] ?? ""}
                        onChange={(e) => setTierDraft((d) => ({ ...d, [tier.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <small style={{ color: "var(--text-3)" }}>
                    ต้องกรอกครบทุกชั้น — การอนุมัติจะถูกบันทึกพร้อมลายเซ็นอิเล็กทรอนิกส์ของคุณ
                  </small>
                </>
              )}
              <div className="action-bar" style={{ marginTop: 16 }}>
                <button type="button" className="btn ghost" onClick={() => setDecision(null)} disabled={saving}>
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={decision.mode === "return" ? "btn btn-danger" : "btn btn-success"}
                  disabled={saving || (decision.mode === "return" && !returnReason.trim())}
                  onClick={sendDecision}
                >
                  {decision.mode === "return" ? "ตีกลับ" : "อนุมัติ"}
                </button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
