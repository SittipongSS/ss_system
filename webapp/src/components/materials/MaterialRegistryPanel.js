"use client";
import { TableScroll } from "@/components/ui/Table";
// ทะเบียนวัสดุ (mig 0143 + 0157) — ข้อมูลหลักของราคาวัสดุทั้งระบบ
//
// วัสดุมีตัวตนถาวร (ไม่ใช่เอกสาร ไม่มีเลขที่) · ราคาเป็นรุ่น (rev) เก็บประวัติครบ
// และ 1 รุ่นมีได้หลายชั้นจำนวน · เซลเสนอวัสดุใหม่ได้เป็น "ร่าง" รอ RD/PC รับ
// คนใส่ราคายังเป็น RD/PC เท่านั้นเสมอ
//
// เป็น "แท็บหนึ่ง" ของหน้า /sa/materials (คู่กับ MaterialAsksPanel) — ข้อมูลและ
// การโหลดเป็นของหน้าแม่ เพราะทั้งสองแท็บใช้ทะเบียนชุดเดียวกัน (AskForm ก็ต้องใช้)
import { useMemo, useState } from "react";
import {
  Boxes, RefreshCw, History, Pencil, Plus, Check, Archive,
  ArchiveRestore, Search, Trash2, Coins,
} from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import MaterialForm, { emptyMaterialForm, materialToForm } from "@/components/materials/MaterialForm";
import PriceTierFields, { emptyTierRow } from "@/components/materials/PriceTierFields";
import { useDepartment, useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import {
  MATERIAL_KINDS, MATERIAL_KIND_LABELS, MATERIAL_STATE_LABELS,
  canQuoteMaterial, latestRevision, materialPriceState, revisionPriceRange,
  revisionTiers, revisionValidUntil, tierUnitPrice,
} from "@/lib/materialPrices";
import { pmTypeLabel } from "@/lib/master/materialTypes";

const money = (v) => (v == null ? "—" : Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const qtyText = (v) => (v == null ? "ทุกจำนวน" : `≥ ${Number(v).toLocaleString("th-TH")}`);
const todayIso = () => new Date().toISOString().slice(0, 10);
const unitOf = (kind) => (kind === "PM" ? "฿/ชิ้น" : "฿/กก.");

const STATE_TONE = {
  ready: { bg: "var(--green-soft)", fg: "var(--green)" },
  expired: { bg: "var(--red-soft)", fg: "var(--red)" },
  no_price: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  draft: { bg: "var(--blue-soft)", fg: "var(--blue)" },
  archived: { bg: "var(--panel-3)", fg: "var(--text-3)" },
};

export default function MaterialRegistryPanel({
  materials = [], customers = [], loading = false, loadError = "", reload,
}) {
  const role = useRole();
  const department = useDepartment();
  const me = useMemo(() => ({ role, department }), [role, department]);

  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("open"); // open = ไม่รวมที่เก็บเข้ากรุ
  const [search, setSearch] = useState("");

  const [history, setHistory] = useState(null);
  const [form, setForm] = useState(null);          // { mode, material?, value }
  const [pricing, setPricing] = useState(null);    // material ที่กำลังออกราคา
  const [tiers, setTiers] = useState([emptyTierRow()]);
  const [validUntil, setValidUntil] = useState("");
  const [confirm, setConfirm] = useState(null);    // { kind, material }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (kindFilter && m.kind !== kindFilter) return false;
      if (statusFilter === "open" && m.status === "archived") return false;
      if (statusFilter && statusFilter !== "open" && m.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [m.label, m.customerName, m.formulaCode, m.formulaName, m.supplierNote]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [materials, kindFilter, statusFilter, search]);

  const draftCount = useMemo(
    () => materials.filter((m) => m.status === "draft" && canQuoteMaterial(me, m.kind)).length,
    [materials, me],
  );

  // ── actions ──────────────────────────────────────────────────────────
  const call = async (url, options, okMsg) => {
    setSaving(true);
    try {
      const res = await fetch(url, options);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      setToast({ kind: "success", msg: okMsg });
      await reload?.();
      return true;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return false;
    } finally { setSaving(false); }
  };

  const submitForm = async () => {
    const v = form.value;
    const payload = {
      kind: v.kind,
      label: v.label,
      pmType: v.kind === "PM" ? v.pmType : null,
      formulaCode: v.kind === "PM" ? null : v.formulaCode,
      formulaName: v.kind === "PM" ? null : v.formulaName,
      customerId: v.scope === "customer" ? v.customerId : null,
      customerName: v.scope === "customer"
        ? (customers.find((c) => c.id === v.customerId)?.name || null) : null,
      supplierNote: v.supplierNote,
    };
    if (form.mode === "create") {
      const withPrice = (v.tiers || []).some((t) => String(t.price ?? "") !== "");
      if (withPrice) payload.tiers = v.tiers;
      const ok = await call("/api/sa/materials", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, canQuoteMaterial(me, v.kind) ? "เพิ่มวัสดุเข้าทะเบียนแล้ว" : "เสนอวัสดุแล้ว รอฝ่ายเจ้าของรับ");
      if (ok) setForm(null);
      return;
    }
    const ok = await call(`/api/sa/materials/${form.material.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", ...payload }),
    }, "บันทึกข้อมูลวัสดุแล้ว");
    if (ok) setForm(null);
  };

  const submitPrice = async () => {
    const ok = await call(`/api/sa/materials/${pricing.id}/revisions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tiers, validUntil: validUntil || null }),
    }, "ออกราคารุ่นใหม่แล้ว");
    if (ok) { setPricing(null); setConfirm(null); }
  };

  const runConfirm = async () => {
    const { kind, material } = confirm;
    if (kind === "price") return submitPrice();
    if (kind === "delete") {
      const ok = await call(`/api/sa/materials/${material.id}`, { method: "DELETE" }, "ลบวัสดุร่างแล้ว");
      if (ok) setConfirm(null);
      return;
    }
    const labels = { accept: "รับวัสดุเข้าทะเบียนแล้ว", archive: "เก็บเข้ากรุแล้ว", restore: "นำกลับมาใช้งานแล้ว" };
    const ok = await call(`/api/sa/materials/${material.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: kind }),
    }, labels[kind]);
    if (ok) setConfirm(null);
  };

  const openPricing = (m) => {
    const rev = latestRevision(m.revisions || []);
    const current = revisionTiers(rev).map((t) => ({
      qty: t.qty == null ? "" : String(t.qty),
      price: String(tierUnitPrice(rev, t) ?? ""),
    }));
    setPricing(m);
    setTiers(current.length ? current : [emptyTierRow()]);
    setValidUntil("");
  };

  const confirmCopy = () => {
    if (!confirm) return {};
    const { kind, material } = confirm;
    if (kind === "price") {
      const next = (latestRevision(pricing?.revisions || [])?.revisionNo || 0) + 1;
      return {
        title: "ยืนยันออกราคารุ่นใหม่",
        description: `${pricing?.label} → rev.${next} (${tiers.length} ชั้น)`,
        detail: "ใบขอราคาผลิตที่ดึงรุ่นเก่าไปแล้วยังใช้ราคาเดิม — รุ่นใหม่มีผลกับงานที่ดึงราคาหลังจากนี้",
        confirmLabel: "ออกราคารุ่นใหม่",
      };
    }
    if (kind === "accept") {
      return {
        title: "รับวัสดุเข้าทะเบียน",
        description: material.label,
        detail: "วัสดุจะใช้งานได้ทันที แต่ยังไม่มีราคาจนกว่าจะออกราคารุ่นแรก",
        confirmLabel: "รับเข้าทะเบียน",
      };
    }
    if (kind === "archive") {
      return {
        title: "เก็บวัสดุเข้ากรุ",
        description: material.label,
        detail: "จะไม่ถูกเลือกในใบขอราคาผลิตอีก แต่ประวัติราคาและใบเก่ายังอยู่ครบ",
        confirmLabel: "เก็บเข้ากรุ",
      };
    }
    if (kind === "restore") {
      return { title: "นำวัสดุกลับมาใช้งาน", description: material.label, confirmLabel: "นำกลับมาใช้" };
    }
    return {
      title: "ลบวัสดุร่าง",
      description: material.label,
      detail: "ลบได้เพราะยังไม่มีประวัติราคาและยังไม่มีใบไหนอ้างถึง",
      confirmLabel: "ลบวัสดุ",
    };
  };

  return (
    <>
      {draftCount > 0 && (
        <div className="glass-panel" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ui-badge" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{draftCount}</span>
          <span style={{ fontSize: 13 }}>
            มีวัสดุที่ฝ่ายขายเสนอเข้ามารอฝ่ายคุณรับเข้าทะเบียน
          </span>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={() => setStatusFilter("draft")}>ดูเฉพาะร่าง</button>
        </div>
      )}

      <div className="toolbar">
        {/* .search-glass เป็นกล่องครอบ ไม่ใช่คลาสของ input (audit ดักไว้แล้ว) */}
        <div className="search-glass">
          <Search size={18} color="var(--text-3)" aria-hidden="true" />
          <input
            type="text" placeholder="ค้นชื่อวัสดุ · สูตร · ลูกค้า · ผู้ขาย"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหาวัสดุ"
          />
        </div>
        <Select
          value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}
          options={[{ value: "", label: "ทุกชนิด" }, ...MATERIAL_KINDS.map((k) => ({ value: k, label: MATERIAL_KIND_LABELS[k] }))]}
          aria-label="กรองชนิดวัสดุ"
        />
        <Select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "open", label: "ที่ใช้งานอยู่" },
            { value: "draft", label: "ร่าง — รอรับ" },
            { value: "active", label: "ใช้งาน" },
            { value: "archived", label: "เก็บเข้ากรุ" },
            { value: "", label: "ทุกสถานะ" },
          ]}
          aria-label="กรองสถานะวัสดุ"
        />
        <span className="spacer" />
        <button type="button" className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={14} /> รีเฟรช
        </button>
        {/* ปุ่มเพิ่มขวาสุดของแถวหัวการ์ด ตาม page-header standard */}
        <button
          type="button" className="btn btn-accent"
          onClick={() => setForm({ mode: "create", value: emptyMaterialForm() })}
        >
          <Plus size={14} /> เพิ่มวัสดุ
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Boxes}>
          {materials.length === 0
            ? "ทะเบียนยังว่าง — กด \"เพิ่มวัสดุ\" เพื่อเริ่ม หรือรอราคาจากคำขอที่ RD/PC ตอบ"
            : "ไม่มีวัสดุที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <TableScroll>
          <table className="premium-table">
            <thead>
              <tr>
                <th>วัสดุ</th>
                <th style={{ width: 120 }}>ชนิด</th>
                <th style={{ width: 140 }}>ลูกค้า</th>
                <th style={{ width: 190 }}>ราคาล่าสุด</th>
                <th style={{ width: 150 }}>สถานะ</th>
                <th style={{ width: 170 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => {
                const rev = latestRevision(m.revisions || []);
                const range = revisionPriceRange(rev);
                const state = materialPriceState(m, todayIso());
                const tone = STATE_TONE[state] || STATE_TONE.no_price;
                const owner = canQuoteMaterial(me, m.kind);
                const canDelete = (m.revisions || []).length === 0 && m.status === "draft";
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {m.kind === "PM" && m.pmType && <span>{pmTypeLabel(m.pmType)}</span>}
                        {m.formulaCode && <span>สูตร {m.formulaCode}</span>}
                        {m.supplierNote && <span>{m.supplierNote}</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-2)" }}>{MATERIAL_KIND_LABELS[m.kind]}</td>
                    <td style={{ fontSize: 12 }}>
                      {m.customerName || <span style={{ color: "var(--text-3)" }}>ราคากลาง</span>}
                    </td>
                    <td>
                      {range ? (
                        <>
                          <div>
                            {range.count > 1 && range.min !== range.max
                              ? `${money(range.min)}–${money(range.max)}`
                              : money(range.min)} {unitOf(m.kind)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                            rev.{rev.revisionNo}
                            {range.count > 1 ? ` · ${range.count} ชั้น` : ""}
                            {rev ? ` · ถึง ${revisionValidUntil(rev)}` : ""}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td>
                      <span className="ui-badge" style={{ background: tone.bg, color: tone.fg }}>
                        {MATERIAL_STATE_LABELS[state]}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button type="button" className="btn-icon" aria-label="ประวัติราคา" onClick={() => setHistory(m)}>
                          <History size={14} />
                        </button>
                        {owner && m.status === "draft" && (
                          <button type="button" className="btn sm" onClick={() => setConfirm({ kind: "accept", material: m })}>
                            <Check size={13} /> รับเข้าทะเบียน
                          </button>
                        )}
                        {owner && m.status !== "archived" && (
                          <button type="button" className="btn sm" onClick={() => openPricing(m)}>
                            <Coins size={13} /> ออกราคา
                          </button>
                        )}
                        {owner && (
                          <button
                            type="button" className="btn-icon" aria-label="แก้ข้อมูลวัสดุ"
                            onClick={() => setForm({ mode: "edit", material: m, value: materialToForm(m) })}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {owner && m.status === "active" && (
                          <button type="button" className="btn-icon" aria-label="เก็บเข้ากรุ" onClick={() => setConfirm({ kind: "archive", material: m })}>
                            <Archive size={14} />
                          </button>
                        )}
                        {owner && m.status === "archived" && (
                          <button type="button" className="btn-icon" aria-label="นำกลับมาใช้" onClick={() => setConfirm({ kind: "restore", material: m })}>
                            <ArchiveRestore size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="btn-icon action-outline btn-danger" aria-label="ลบวัสดุร่าง" onClick={() => setConfirm({ kind: "delete", material: m })}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      {/* เพิ่ม/แก้วัสดุ — ฟอร์มเดียวกัน (กฎ AGENTS.md) */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="lg" dismissible={!saving}
        title={form?.mode === "edit" ? `แก้ข้อมูลวัสดุ — ${form.material.label}` : "เพิ่มวัสดุเข้าทะเบียน"}
      >
        {form && (
          <>
            <MaterialForm
              mode={form.mode} value={form.value} customers={customers} disabled={saving}
              canPrice={canQuoteMaterial(me, form.value.kind)}
              onChange={(value) => setForm({ ...form, value })}
            />
            {form.mode === "create" && !canQuoteMaterial(me, form.value.kind) && (
              <div className="glass-panel" style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
                วัสดุจะเข้าเป็น <b>ร่าง</b> รอฝ่ายเจ้าของรับและใส่ราคา — คนใส่ราคาคือ RD/PC เท่านั้น
              </div>
            )}
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent" disabled={saving || !form.value.label.trim()}
                onClick={submitForm}
              >
                {form.mode === "edit" ? "บันทึก" : "เพิ่มวัสดุ"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ออกราคารุ่นใหม่ */}
      <Modal
        open={!!pricing} onClose={() => setPricing(null)} size="md" dismissible={!saving}
        title={pricing ? `ออกราคา — ${pricing.label}` : ""}
      >
        {pricing && (
          <>
            <PriceTierFields
              value={tiers} onChange={setTiers} disabled={saving}
              unitLabel={unitOf(pricing.kind)}
            />
            <div className="form-group">
              <label htmlFor="mat-valid-until">ราคาใช้ได้ถึง</label>
              <input
                id="mat-valid-until" className="premium-input" type="date"
                value={validUntil} disabled={saving}
                onChange={(e) => setValidUntil(e.target.value)}
              />
              <small style={{ color: "var(--text-3)" }}>เว้นว่าง = ใช้ค่าตั้งต้น 90 วันนับจากวันนี้</small>
            </div>
            <div className="action-bar" style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setPricing(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent" disabled={saving || !tiers.some((t) => String(t.price ?? "") !== "")}
                onClick={() => setConfirm({ kind: "price", material: pricing })}
              >
                ออกราคารุ่นใหม่
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ประวัติรุ่นราคา */}
      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `ประวัติราคา — ${history.label}` : ""} size="md">
        {history && (
          (history.revisions || []).length === 0 ? (
            <EmptyState icon={Coins}>ยังไม่มีใครออกราคาให้วัสดุนี้</EmptyState>
          ) : (
            <TableScroll>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>รุ่น</th>
                    <th>ชั้นจำนวน / ราคา</th>
                    <th style={{ width: 110 }}>โดย</th>
                    <th style={{ width: 100 }}>เมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(history.revisions || [])].sort((a, b) => b.revisionNo - a.revisionNo).map((r) => (
                    <tr key={r.id}>
                      <td>rev.{r.revisionNo}</td>
                      <td>
                        {revisionTiers(r).map((t) => (
                          <div key={t.id} style={{ fontSize: 12 }}>
                            <span style={{ color: "var(--text-3)" }}>{qtyText(t.qty)}</span>{" "}
                            {money(tierUnitPrice(r, t))} {unitOf(history.kind)}
                          </div>
                        ))}
                      </td>
                      <td style={{ fontSize: 12 }}>{r.quotedByName || "—"}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(r.quotedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )
        )}
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
    </>
  );
}
