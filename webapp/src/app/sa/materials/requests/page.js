"use client";
// รายการใบขอราคาวัสดุ (mig 0143) — เซลเปิดใบถามราคา, RD/PC เห็นคิวไปตอบ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, RefreshCw, Trash2, Boxes } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import { useCan } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS } from "@/lib/materialPrices";

const STATUS_LABELS = { draft: "ร่าง", pending: "รอ RD/PC ตอบ", answered: "ตอบครบแล้ว", cancelled: "ยกเลิก" };
const STATUS_TONES = { draft: "var(--text-3)", pending: "var(--amber)", answered: "var(--green)", cancelled: "var(--text-3)" };

function emptyRow() { return { kind: "PM", label: "" }; }

export default function MaterialRequestsPage() {
  const router = useRouter();
  const canCreate = useCan("costing:edit");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(null); // { customerName, note, items }
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // ใบร่างที่รอยืนยันลบ
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/sa/materials/requests", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดรายการไม่สำเร็จ");
      setRows(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => setForm({ customerName: "", note: "", items: [emptyRow()] });

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sa/materials/requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName || null,
          note: form.note,
          items: form.items,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "เปิดใบไม่สำเร็จ");
      router.push(`/sa/materials/requests/${d.id}`);
    } catch (e) { setToast({ kind: "error", msg: e.message }); setSaving(false); }
  };

  const patchRow = (idx, patch) => setForm((f) => ({
    ...f, items: f.items.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
  }));

  // ลบใบร่างที่ยังไม่ส่ง — ยืนยันก่อน (ConfirmDialog)
  const removeDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sa/materials/requests/${pendingDelete.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ลบไม่สำเร็จ");
      setToast({ kind: "success", msg: "ลบใบร่างแล้ว" });
      setPendingDelete(null);
      await load();
    } catch (e) { setToast({ kind: "error", msg: e.message }); }
    setSaving(false);
  };

  const progress = (r) => {
    const items = r.items || [];
    const quoted = items.filter((i) => i.priceStatus === "quoted").length;
    return `${quoted}/${items.length}`;
  };

  return (
    <Workspace hideHeader back={{ href: "/sa/materials", label: "กลับคลังราคาวัสดุ" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><FileText size={22} /></span>{" "}
            ใบขอราคาวัสดุ
          </h1>
          <p>ถามราคาวัตถุดิบ/บรรจุภัณฑ์จาก RD/PC — คำตอบเข้าคลังราคาวัสดุให้ใช้อ้างอิงได้ทุกงาน</p>
        </div>
      </div>

      <div className="toolbar">
        <Link href="/sa/materials" className="btn"><Boxes size={14} /> คลังราคาวัสดุ</Link>
        <span className="spacer" />
        <button type="button" className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
        {canCreate && (
          <button type="button" className="btn btn-accent" onClick={openCreate}>
            <Plus size={16} /> เปิดใบขอราคาวัสดุ
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText}>ยังไม่มีใบขอราคาวัสดุ — เปิดใบแรกจากปุ่มด้านบน</EmptyState>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>เลขที่</th>
                <th>ลูกค้า / วัสดุ</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 100 }}>ตอบแล้ว</th>
                <th style={{ width: 110 }}>สร้างเมื่อ</th>
                <th style={{ width: 50 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable-row">
                  <td><Link href={`/sa/materials/requests/${r.id}`} style={{ fontWeight: 600 }}>{r.docNo || "ร่าง"}</Link></td>
                  <td>
                    <div>{r.customerName || <span style={{ color: "var(--text-3)" }}>ราคากลาง</span>}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                      {(r.items || []).slice(0, 2).map((i) => i.label).join(" · ")}
                      {(r.items || []).length > 2 ? ` +${r.items.length - 2}` : ""}
                    </div>
                  </td>
                  <td>
                    <span className="status-pill" style={{ color: STATUS_TONES[r.status], borderColor: "currentColor" }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td>{progress(r)}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>
                    {/* ลบได้เฉพาะร่างที่ยังไม่ส่ง (ส่งแล้วเป็นหลักฐาน) */}
                    {canCreate && r.status === "draft" && !r.submittedAt && (
                      <button
                        type="button" className="btn-icon danger" aria-label="ลบใบร่าง"
                        onClick={() => setPendingDelete(r)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="เปิดใบขอราคาวัสดุ" size="lg" dismissible={!saving}>
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="mr-customer">ลูกค้า (ถ้าถามราคาเฉพาะลูกค้า)</label>
                <input
                  id="mr-customer" className="premium-input" placeholder="เว้นว่าง = ราคากลาง"
                  value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="mr-note">หมายเหตุ</label>
                <input id="mr-note" className="premium-input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="toolbar" style={{ marginBottom: 8 }}>
                <span className="toolbar-label">วัสดุที่ขอราคา ({form.items.length})</span>
                <span className="spacer" />
                <button type="button" className="btn sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyRow()] }))}>
                  <Plus size={14} /> เพิ่มวัสดุ
                </button>
              </div>
              <div className="premium-table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr><th style={{ width: 170 }}>ชนิด</th><th>ชื่อวัสดุ</th><th style={{ width: 110 }}>ขอจาก</th><th style={{ width: 50 }} aria-label="ลบ" /></tr>
                  </thead>
                  <tbody>
                    {form.items.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <Select
                            value={row.kind} onChange={(e) => patchRow(idx, { kind: e.target.value })}
                            options={MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))}
                            aria-label={`ชนิดวัสดุรายการที่ ${idx + 1}`}
                          />
                        </td>
                        <td>
                          <input
                            className="premium-input" value={row.label} maxLength={200}
                            placeholder="เช่น ขวดแก้ว 50ml ทรงเหลี่ยม"
                            aria-label={`ชื่อวัสดุรายการที่ ${idx + 1}`}
                            onChange={(e) => patchRow(idx, { label: e.target.value })}
                          />
                        </td>
                        <td style={{ fontSize: 12, color: row.kind === "PM" ? "var(--blue)" : "var(--violet)" }}>
                          {row.kind === "PM" ? "PC" : "RD"}
                        </td>
                        <td>
                          <button
                            type="button" className="btn-icon danger" aria-label={`ลบรายการที่ ${idx + 1}`}
                            disabled={form.items.length === 1}
                            onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="action-bar">
              <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent" disabled={saving || form.items.some((r) => !r.label.trim())}
                onClick={create}
              >
                เปิดใบ (ร่าง)
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="ลบใบขอราคาวัสดุร่างนี้?"
        description={pendingDelete
          ? `${(pendingDelete.items || []).length} รายการ${pendingDelete.customerName ? ` · ${pendingDelete.customerName}` : ""}`
          : ""}
        detail="ใบร่างที่ยังไม่ส่งขอราคาไม่ใช่หลักฐาน ลบได้จริง — ถ้าส่งขอราคาไปแล้วให้ใช้ยกเลิกแทน"
        confirmLabel="ลบใบร่าง"
        tone="danger"
        busy={saving}
        onConfirm={removeDraft}
        onClose={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
