"use client";
// คลังราคาวัสดุ (mig 0143) — ค้นหาวัสดุ ดูราคาปัจจุบัน + ประวัติรุ่น + อายุ
// เซลดูราคาอ้างอิง · RD/PC แก้ราคา (= ออกรุ่นใหม่) เฉพาะวัสดุของฝ่ายตน
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, RefreshCw, History, Pencil, FileText } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Workspace from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import { useDepartment, useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import {
  MATERIAL_KINDS, MATERIAL_KIND_LABELS,
  canQuoteMaterial, isRevisionExpired, latestRevision, revisionUnitPrice, revisionValidUntil,
} from "@/lib/materialPrices";

const money = (v) => (v == null ? "—" : Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function MaterialLibraryPage() {
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(null); // material ที่กำลังดูประวัติ
  const [editing, setEditing] = useState(null);  // material ที่กำลังแก้ราคา
  const [price, setPrice] = useState("");
  const [pendingSave, setPendingSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/sa/materials", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคลังไม่สำเร็จ");
      setMaterials(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (kindFilter && m.kind !== kindFilter) return false;
      if (q && !m.label.toLowerCase().includes(q) && !(m.customerName || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [materials, kindFilter, search]);

  const openEdit = (m) => {
    const rev = latestRevision(m.revisions || []);
    setEditing(m);
    setPrice(rev ? String(revisionUnitPrice(rev) ?? "") : "");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sa/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId: editing.id, price }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setToast({ kind: "success", msg: "ออกราคารุ่นใหม่แล้ว" });
      setEditing(null); setPendingSave(false);
      await load();
    } catch (e) { setToast({ kind: "error", msg: e.message }); setPendingSave(false); }
    setSaving(false);
  };

  return (
    <Workspace hideHeader>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Boxes size={22} /></span>{" "}
            คลังราคาวัสดุ
          </h1>
          <p>
            ราคาวัตถุดิบและบรรจุภัณฑ์ที่ RD/PC เคยตอบไว้ — ใช้อ้างอิงในใบขอราคาผลิต
            ได้ทุกงาน แต่ละราคาเป็นรุ่น (rev) เก็บประวัติครบ
          </p>
        </div>
        <Link href="/sa/materials/requests" className="btn">
          <FileText size={14} /> ใบขอราคาวัสดุ
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="search-glass" placeholder="ค้นชื่อวัสดุ หรือลูกค้า"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหาวัสดุ"
        />
        <Select
          value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
          options={[{ value: "", label: "ทุกชนิด" }, ...MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))]}
          aria-label="กรองชนิดวัสดุ"
        />
        <span className="spacer" />
        <button type="button" className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Boxes}>
          {materials.length === 0
            ? "คลังยังว่าง — เปิดใบขอราคาวัสดุให้ RD/PC ตอบ แล้วราคาจะเข้าคลังเอง"
            : "ไม่มีวัสดุที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th>วัสดุ</th>
                <th style={{ width: 130 }}>ชนิด</th>
                <th style={{ width: 150 }}>ลูกค้า</th>
                <th style={{ width: 140 }}>ราคาล่าสุด</th>
                <th style={{ width: 150 }}>อายุราคา</th>
                <th style={{ width: 120 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const rev = latestRevision(m.revisions || []);
                const expired = rev && isRevisionExpired(rev, todayIso());
                const unit = m.kind === "PM" ? "฿/ชิ้น" : "฿/กก.";
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.label}</td>
                    <td style={{ fontSize: 12, color: "var(--text-2)" }}>{MATERIAL_KIND_LABELS[m.kind]}</td>
                    <td style={{ fontSize: 12 }}>
                      {m.customerName || <span style={{ color: "var(--text-3)" }}>ราคากลาง</span>}
                    </td>
                    <td>{rev ? `${money(revisionUnitPrice(rev))} ${unit} (rev.${rev.revisionNo})` : "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {rev ? (
                        <span style={{ color: expired ? "var(--red)" : "var(--text-2)" }}>
                          {expired ? "⚠️ เกินอายุ " : "ถึง "}{revisionValidUntil(rev)}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn-icon" aria-label="ประวัติราคา" onClick={() => setHistory(m)}>
                          <History size={14} />
                        </button>
                        {canQuoteMaterial(me, m.kind) && (
                          <button type="button" className="btn sm" onClick={() => openEdit(m)}>
                            <Pencil size={13} /> แก้ราคา
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ประวัติรุ่นราคา */}
      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `ประวัติราคา — ${history.label}` : ""} size="md">
        {history && (
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr><th style={{ width: 60 }}>รุ่น</th><th>ราคา</th><th>โดย</th><th style={{ width: 110 }}>เมื่อ</th></tr>
              </thead>
              <tbody>
                {[...(history.revisions || [])].sort((a, b) => b.revisionNo - a.revisionNo).map((r) => (
                  <tr key={r.id}>
                    <td>rev.{r.revisionNo}</td>
                    <td>{money(revisionUnitPrice(r))} {history.kind === "PM" ? "฿/ชิ้น" : "฿/กก."}</td>
                    <td style={{ fontSize: 12 }}>{r.quotedByName || "—"}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(r.quotedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* แก้ราคา = ออกรุ่นใหม่ */}
      <Modal open={!!editing} onClose={() => { setEditing(null); setPendingSave(false); }} title={editing ? `แก้ราคา — ${editing.label}` : ""} size="sm" dismissible={!saving}>
        {editing && (
          <>
            <div className="form-group">
              <label htmlFor="mat-price">ราคาใหม่ ({editing.kind === "PM" ? "บาท/ชิ้น" : "บาท/กก."})</label>
              <input
                id="mat-price" className="premium-input" type="number" min="0" step="0.01"
                value={price} onChange={(e) => setPrice(e.target.value)}
              />
              <small style={{ color: "var(--text-3)" }}>
                จะออกเป็นรุ่นใหม่ (rev.{(latestRevision(editing.revisions || [])?.revisionNo || 0) + 1}) — ราคาเดิมเก็บเป็นประวัติ
              </small>
            </div>
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setEditing(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent" disabled={saving || price === ""}
                onClick={() => setPendingSave(true)}
              >
                ออกราคารุ่นใหม่
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingSave}
        title="ยืนยันออกราคารุ่นใหม่"
        description={editing ? `${editing.label} → ${money(price)} ${editing.kind === "PM" ? "฿/ชิ้น" : "฿/กก."}` : ""}
        detail="ใบขอราคาผลิตที่เคยอ้างรุ่นเก่ายังใช้ราคาเดิม — รุ่นใหม่มีผลกับงานที่ดึงราคาหลังจากนี้"
        confirmLabel="ออกราคารุ่นใหม่"
        busy={saving}
        onConfirm={save}
        onClose={() => setPendingSave(false)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
