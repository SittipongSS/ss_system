"use client";
// รายละเอียดใบขอราคาวัสดุ — เซลส่ง/ยกเลิก · RD/PC กรอกราคาบรรทัดของฝ่ายตน
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Send, Ban } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import Toast from "@/components/ui/Toast";
import { useDepartment, useRole, useTeam } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import { inSalesEditScope } from "@/lib/salesPlanning";
import { isSuperuser } from "@/lib/permissions";
import { MATERIAL_KIND_LABELS, canQuoteMaterial } from "@/lib/materialPrices";

const STATUS_LABELS = { draft: "ร่าง", pending: "รอ RD/PC ตอบ", answered: "ตอบครบแล้ว", cancelled: "ยกเลิก" };
const STATUS_TONES = { draft: "var(--text-3)", pending: "var(--amber)", answered: "var(--green)", cancelled: "var(--text-3)" };
const money = (v) => (v == null ? "—" : Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function MaterialRequestDetailPage() {
  const { id } = useParams();
  const role = useRole();
  const team = useTeam();
  const department = useDepartment();
  const me = useMemo(() => ({ role, team, department }), [role, team, department]);

  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [priceDraft, setPriceDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch(`/api/sa/materials/requests/${id}`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดใบไม่สำเร็จ");
      setReq(d);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const runAction = useCallback(async (path, init, okMsg) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/materials/requests/${id}${path}`, {
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

  if (loading) return <Workspace hideHeader back={{ href: "/sa/materials/requests", label: "กลับรายการ" }}><SkeletonRows rows={5} /></Workspace>;
  if (loadError || !req) {
    return (
      <Workspace hideHeader back={{ href: "/sa/materials/requests", label: "กลับรายการ" }}>
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError || "ไม่พบใบ"}</div>
      </Workspace>
    );
  }

  const canManage = isSuperuser(role) || inSalesEditScope(me, { team: req.team, ownerId: req.requestedById });
  const canEditReq = canManage && !["answered", "cancelled"].includes(req.status);

  // บรรทัดที่ผู้ใช้นี้กรอกราคาได้ (ฝ่ายตน + ใบเปิดรับราคา)
  const quotableIds = new Set(
    ["pending", "answered"].includes(req.status)
      ? (req.items || []).filter((i) => canQuoteMaterial(me, i.kind)).map((i) => i.id)
      : [],
  );
  const draftEntries = Object.entries(priceDraft).filter(
    ([itemId, v]) => quotableIds.has(itemId) && v !== "" && v != null,
  );

  const saveAnswers = () => runAction("/answer", {
    method: "PATCH",
    body: JSON.stringify({ prices: draftEntries.map(([itemId, price]) => ({ itemId, price })) }),
  }, "บันทึกราคาแล้ว").then((ok) => { if (ok) setPriceDraft({}); });

  return (
    <Workspace hideHeader back={{ href: "/sa/materials/requests", label: "กลับรายการ" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><FileText size={22} /></span>{" "}
            {req.docNo || "ใบขอราคาวัสดุ (ร่าง)"}
          </h1>
          <p>{req.customerName || "ราคากลาง"} · สร้าง {fmtDate(req.createdAt)} · ผู้ขอ {req.requestedByName || "—"}</p>
        </div>
        {canEditReq && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => setPendingCancel(true)} disabled={saving}>
              <Ban size={14} /> ยกเลิก
            </button>
            {req.status === "draft" && (
              <button type="button" className="btn btn-accent" onClick={() => runAction("", { method: "PATCH", body: JSON.stringify({ action: "submit" }) }, "ส่งขอราคาแล้ว")} disabled={saving}>
                <Send size={14} /> ส่งขอราคา
              </button>
            )}
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <span className="status-pill" style={{ color: STATUS_TONES[req.status], borderColor: "currentColor" }}>
          {STATUS_LABELS[req.status] || req.status}
        </span>
        {req.note && <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-2)" }}>{req.note}</p>}
        {req.status === "cancelled" && req.cancelReason && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--red)" }}>เหตุผลที่ยกเลิก: {req.cancelReason}</p>
        )}
      </div>

      <div className="premium-table-wrapper">
        <table className="premium-table">
          <thead>
            <tr>
              <th>วัสดุ</th>
              <th style={{ width: 140 }}>ชนิด</th>
              <th style={{ width: 90 }}>ขอจาก</th>
              <th style={{ width: 180 }}>ราคา</th>
            </tr>
          </thead>
          <tbody>
            {(req.items || []).map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 500 }}>{item.label}</td>
                <td style={{ fontSize: 12, color: "var(--text-2)" }}>{MATERIAL_KIND_LABELS[item.kind]}</td>
                <td style={{ fontSize: 12 }}>{item.sourceDept}</td>
                <td>
                  {quotableIds.has(item.id) && item.priceStatus !== "quoted" ? (
                    <input
                      className="premium-input" type="number" min="0" step="0.01"
                      placeholder={item.kind === "PM" ? "บาท/ชิ้น" : "บาท/กก."}
                      aria-label={`ราคาของ ${item.label}`}
                      value={priceDraft[item.id] ?? ""}
                      onChange={(e) => setPriceDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                    />
                  ) : item.priceStatus === "quoted"
                    ? <span style={{ color: "var(--green)" }}>ตอบแล้ว</span>
                    : <span style={{ color: "var(--text-3)" }}>รอราคา</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draftEntries.length > 0 && (
        <div className="glass-panel" style={{ padding: 16, marginTop: 16, position: "sticky", bottom: 12 }}>
          <div className="action-bar">
            <span style={{ marginRight: "auto", color: "var(--text-2)" }}>
              กรอกราคาไว้ {draftEntries.length} รายการ — ยังไม่บันทึก
            </span>
            <button type="button" className="btn ghost" onClick={() => setPriceDraft({})} disabled={saving}>ล้าง</button>
            <button type="button" className="btn btn-accent" onClick={saveAnswers} disabled={saving}>บันทึกราคา (เข้าคลัง)</button>
          </div>
        </div>
      )}

      <Modal open={pendingCancel} onClose={() => setPendingCancel(false)} title="ยกเลิกใบขอราคาวัสดุ" size="sm" dismissible={!saving}>
        <div className="form-group">
          <label htmlFor="mr-cancel">เหตุผลที่ยกเลิก</label>
          <textarea id="mr-cancel" className="textarea-premium" rows={3} maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
        <div className="action-bar" style={{ marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={() => setPendingCancel(false)} disabled={saving}>ปิด</button>
          <button
            type="button" className="btn btn-danger" disabled={saving || !cancelReason.trim()}
            onClick={() => runAction("", { method: "PATCH", body: JSON.stringify({ action: "cancel", cancelReason }) }, "ยกเลิกใบแล้ว").then((ok) => { if (ok) setPendingCancel(false); })}
          >
            ยกเลิกใบนี้
          </button>
        </div>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
