"use client";
// หน้าตั้งค่า "แม่แบบต้นทุนต่อประเภทสินค้า" (mig 0140) — ผู้ดูแลระบบเท่านั้น
//
// แม่แบบ = โครงบรรทัดต้นทุนที่ใบขอราคา (PR3) จะกางออกมาเป็นบรรทัดจริงตอนเลือก
// ประเภทสินค้า. ที่นี่จึงกำหนดแค่ "ต้องมีบรรทัดอะไรบ้าง" ไม่ได้ใส่ราคา —
// ราคามาจาก RD/PC ตอนขอราคาจริงในแต่ละใบ
//
// ลบไม่ได้ ทำได้แค่ซ่อน (มติ 2026-07-22 + guard ที่ฐานข้อมูล) เพื่อให้ตามรอยได้ว่า
// ใบขอราคาเก่ากางมาจากแม่แบบใบไหน
import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Plus, Pencil, EyeOff, Trash2, GripVertical } from "lucide-react";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import { useCan } from "@/lib/roleContext";
import { fmtDateTime } from "@/lib/format";
import {
  COST_LINE_KINDS,
  COST_LINE_KIND_LABELS,
  UNIT_BASIS_LABELS,
  normalizeCostTemplateLines,
  sourceDeptForKind,
  summarizeCostTemplate,
  unitBasisForKind,
} from "@/lib/master/costTemplate";

const DEPT_TONE = { RD: "var(--violet)", PC: "var(--blue)", internal: "var(--text-3)" };

function emptyLine(kind = "PM") {
  return { kind, label: "", defaultGramsPerUnit: "", required: true };
}

// ── ฟอร์มแม่แบบ — ใช้ตัวเดียวกันทั้งตอนสร้างและตอนแก้ (กฎ AGENTS.md) ──
// ต่างกันแค่โหมดผ่าน props: mode="create" เลือกหมวดได้, mode="edit" ล็อกหมวดไว้
// เพราะ 0140 guard ห้ามเปลี่ยน categoryCode ของแม่แบบที่สร้างแล้ว
function CostTemplateForm({ mode, form, setForm, productTypes, takenCategories }) {
  const isCreate = mode === "create";

  const categoryOptions = useMemo(() => {
    const rows = productTypes
      .filter((t) => t.isActive !== false)
      .map((t) => ({
        value: `${t.mainCategoryCode}-${t.typeCode}`,
        label: `${t.mainCategoryCode}-${t.typeCode} · ${t.nameTh || t.nameEn || "(ไม่มีชื่อ)"}`,
      }));
    // ประเภทที่มีแม่แบบใช้งานอยู่แล้วเลือกซ้ำไม่ได้ (unique index ฝั่ง DB)
    return rows.filter((r) => r.value === form.categoryCode || !takenCategories.has(r.value));
  }, [productTypes, takenCategories, form.categoryCode]);

  const patchLine = (idx, patch) => setForm((f) => ({
    ...f,
    lines: f.lines.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // เปลี่ยนชนิดแล้วหน่วยเปลี่ยนตาม — บรรทัดต่อชิ้นไม่มีกรัม/ชิ้น
      if (patch.kind && unitBasisForKind(patch.kind) === "per_piece") next.defaultGramsPerUnit = "";
      return next;
    }),
  }));

  const moveLine = (idx, dir) => setForm((f) => {
    const next = [...f.lines];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return f;
    [next[idx], next[to]] = [next[to], next[idx]];
    return { ...f, lines: next };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="ct-category">ประเภทสินค้า</label>
          {isCreate ? (
            <Select
              id="ct-category"
              value={form.categoryCode}
              onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
              options={[{ value: "", label: "— เลือกประเภทสินค้า —" }, ...categoryOptions]}
            />
          ) : (
            <input className="premium-input" value={form.categoryLabel} readOnly disabled />
          )}
          {isCreate && (
            <small style={{ color: "var(--text-3)" }}>
              ประเภทที่มีแม่แบบใช้งานอยู่แล้วจะไม่แสดงในรายการ
            </small>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="ct-note">หมายเหตุ</label>
          <input
            id="ct-note"
            className="premium-input"
            value={form.note}
            maxLength={500}
            placeholder="เช่น อ้างอิงสูตรขวด 100 ml"
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <span className="toolbar-label">บรรทัดต้นทุน ({form.lines.length})</span>
          <span className="spacer" />
          <button
            type="button"
            className="btn sm"
            onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}
          >
            <Plus size={14} /> เพิ่มบรรทัด
          </button>
        </div>

        {form.lines.length === 0 ? (
          <EmptyState plain>
            ยังไม่มีบรรทัดต้นทุน — เพิ่มอย่างน้อย 1 บรรทัด เช่น หัวน้ำหอม ขวด ฝา หรือค่าบรรจุ
          </EmptyState>
        ) : (
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }} aria-label="ลำดับ" />
                  <th style={{ width: 170 }}>ชนิด</th>
                  <th>ชื่อรายการ</th>
                  <th style={{ width: 110 }}>หน่วยราคา</th>
                  <th style={{ width: 120 }}>กรัม/ชิ้น</th>
                  <th style={{ width: 90 }}>บังคับ</th>
                  <th style={{ width: 88 }} aria-label="จัดการ" />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, idx) => {
                  const basis = unitBasisForKind(line.kind);
                  const dept = sourceDeptForKind(line.kind);
                  return (
                    <tr key={idx}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 2, color: "var(--text-3)" }}>
                          <GripVertical size={14} aria-hidden="true" />
                          <span style={{ display: "flex", flexDirection: "column" }}>
                            <button
                              type="button" className="btn-icon" aria-label="เลื่อนขึ้น"
                              disabled={idx === 0} onClick={() => moveLine(idx, -1)}
                              style={{ height: 18, width: 18 }}
                            >▲</button>
                            <button
                              type="button" className="btn-icon" aria-label="เลื่อนลง"
                              disabled={idx === form.lines.length - 1} onClick={() => moveLine(idx, 1)}
                              style={{ height: 18, width: 18 }}
                            >▼</button>
                          </span>
                        </div>
                      </td>
                      <td>
                        <Select
                          value={line.kind}
                          onChange={(e) => patchLine(idx, { kind: e.target.value })}
                          options={COST_LINE_KINDS.map((k) => ({ value: k, label: COST_LINE_KIND_LABELS[k] }))}
                          aria-label={`ชนิดบรรทัดที่ ${idx + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          className="premium-input"
                          value={line.label}
                          maxLength={200}
                          placeholder="เช่น ขวดแก้ว 50 ml"
                          aria-label={`ชื่อรายการบรรทัดที่ ${idx + 1}`}
                          onChange={(e) => patchLine(idx, { label: e.target.value })}
                        />
                      </td>
                      <td>
                        <span className="ui-badge" style={{ background: "var(--panel-2)", color: "var(--text-2)" }}>
                          {UNIT_BASIS_LABELS[basis]}
                        </span>
                        <div style={{ marginTop: 4, fontSize: 11, color: DEPT_TONE[dept || "internal"] }}>
                          {dept ? `ขอราคาจาก ${dept}` : "คิดภายใน"}
                        </div>
                      </td>
                      <td>
                        {basis === "per_kg" ? (
                          <input
                            className="premium-input"
                            type="number" min="0" step="0.01"
                            value={line.defaultGramsPerUnit}
                            placeholder="เช่น 80"
                            aria-label={`กรัมต่อชิ้นบรรทัดที่ ${idx + 1}`}
                            onChange={(e) => patchLine(idx, { defaultGramsPerUnit: e.target.value })}
                          />
                        ) : (
                          <span style={{ color: "var(--text-3)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={line.required !== false}
                            onChange={(e) => patchLine(idx, { required: e.target.checked })}
                          />
                          <span style={{ fontSize: 12, color: "var(--text-2)" }}>บังคับ</span>
                        </label>
                      </td>
                      <td>
                        <button
                          type="button" className="btn-icon danger" aria-label={`ลบบรรทัดที่ ${idx + 1}`}
                          onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <small style={{ color: "var(--text-3)", display: "block", marginTop: 8 }}>
          หน่วยราคาผูกกับชนิดเสมอ — วัตถุดิบ (RM) คิดเป็นบาท/กก. จึงต้องระบุกรัมต่อชิ้น
          เพื่อแปลงเป็นบาท/ชิ้น ส่วนบรรจุภัณฑ์และค่าดำเนินการคิดเป็นบาท/ชิ้นอยู่แล้ว
        </small>
      </div>
    </div>
  );
}

export default function CostTemplatesPage() {
  const canManage = useCan("master:manage");
  const [templates, setTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState(null); // { mode, id }
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [pendingHide, setPendingHide] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [tplRes, typeRes] = await Promise.all([
        fetch("/api/cost-templates?includeHidden=1", { cache: "no-store" }),
        fetch("/api/product-types", { cache: "no-store" }),
      ]);
      const tpl = await tplRes.json().catch(() => null);
      if (!tplRes.ok) throw new Error(tpl?.error || "โหลดแม่แบบไม่สำเร็จ");
      const types = await typeRes.json().catch(() => []);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      setProductTypes(Array.isArray(types) ? types : []);
    } catch (e) {
      setLoadError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (canManage) load(); else setLoading(false); }, [canManage, load]);

  const typeLabel = useCallback((categoryCode) => {
    const [main, type] = String(categoryCode || "").split("-");
    const row = productTypes.find((t) => t.mainCategoryCode === main && t.typeCode === type);
    return row ? (row.nameTh || row.nameEn || categoryCode) : categoryCode;
  }, [productTypes]);

  const takenCategories = useMemo(
    () => new Set(templates.filter((t) => !t.isHidden).map((t) => t.categoryCode)),
    [templates],
  );
  const visible = useMemo(
    () => templates.filter((t) => (showHidden ? true : !t.isHidden)),
    [templates, showHidden],
  );

  const openCreate = () => {
    setForm({ categoryCode: "", categoryLabel: "", note: "", lines: [emptyLine("RM_F"), emptyLine("PM")] });
    setEditing({ mode: "create", id: null });
  };

  const openEdit = (template) => {
    setForm({
      categoryCode: template.categoryCode,
      categoryLabel: `${template.categoryCode} · ${typeLabel(template.categoryCode)}`,
      note: template.note || "",
      lines: (template.lines || []).map((l) => ({
        kind: l.kind,
        label: l.label,
        defaultGramsPerUnit: l.defaultGramsPerUnit ?? "",
        required: l.required !== false,
      })),
    });
    setEditing({ mode: "edit", id: template.id });
  };

  const closeForm = () => { setEditing(null); setForm(null); setPendingSave(false); };

  // ตรวจด้วยกฎชุดเดียวกับฝั่ง API ก่อนเปิดกล่องยืนยัน — ผู้ใช้เห็นปัญหาทันที
  const requestSave = () => {
    if (editing.mode === "create" && !form.categoryCode) {
      setToast({ kind: "error", msg: "กรุณาเลือกประเภทสินค้า" });
      return;
    }
    const { error } = normalizeCostTemplateLines(form.lines);
    if (error) { setToast({ kind: "error", msg: error }); return; }
    setPendingSave(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const isCreate = editing.mode === "create";
      const res = await fetch(isCreate ? "/api/cost-templates" : `/api/cost-templates/${editing.id}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryCode: form.categoryCode,
          note: form.note,
          lines: form.lines,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setToast({ kind: "success", msg: isCreate ? "สร้างแม่แบบแล้ว" : "บันทึกแม่แบบแล้ว" });
      closeForm();
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      setPendingSave(false);
    }
    setSaving(false);
  };

  const hide = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cost-templates/${pendingHide.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hide" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ซ่อนไม่สำเร็จ");
      setToast({ kind: "success", msg: "ซ่อนแม่แบบแล้ว" });
      setPendingHide(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    }
    setSaving(false);
  };

  if (!canManage) {
    return (
      <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
      </div>
    );
  }

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Layers size={22} /></span>{" "}
            แม่แบบต้นทุนตามประเภทสินค้า
          </h1>
          <p>
            โครงบรรทัดต้นทุนที่ใบขอราคาจะกางออกมาให้อัตโนมัติเมื่อเลือกประเภทสินค้า —
            กำหนดว่าต้องมีรายการอะไรและขอราคาจากฝ่ายไหน (ยังไม่ใส่ราคาที่นี่)
          </p>
        </div>
      </div>

      <div className="toolbar">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--text-2)" }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          แสดงแม่แบบที่ซ่อนแล้ว
        </label>
        <span className="spacer" />
        <button type="button" className="btn btn-accent" onClick={openCreate}>
          <Plus size={16} /> สร้างแม่แบบ
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Layers} action={{ label: "สร้างแม่แบบแรก", onClick: openCreate }}>
          ยังไม่มีแม่แบบต้นทุน — สร้างแม่แบบให้ประเภทสินค้าที่ใช้บ่อยก่อน
          แล้วใบขอราคาจะกางบรรทัดให้เองทันทีที่เลือกประเภทนั้น
        </EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((t) => {
            const summary = summarizeCostTemplate(t.lines || []);
            return (
              <div key={t.id} className="glass-panel" style={{ padding: 16, opacity: t.isHidden ? 0.6 : 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 15 }}>{typeLabel(t.categoryCode)}</strong>
                      <span className="ui-badge" style={{ background: "var(--panel-2)", color: "var(--text-2)" }}>
                        {t.categoryCode}
                      </span>
                      {t.isHidden && (
                        <span className="ui-badge" style={{ background: "var(--red-soft)", color: "var(--red)" }}>
                          ซ่อนแล้ว
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <span className="chip">{summary.total} บรรทัด</span>
                      {summary.rd > 0 && <span className="chip" style={{ color: DEPT_TONE.RD }}>ขอ RD {summary.rd}</span>}
                      {summary.pc > 0 && <span className="chip" style={{ color: DEPT_TONE.PC }}>ขอ PC {summary.pc}</span>}
                      {summary.internal > 0 && <span className="chip">ภายใน {summary.internal}</span>}
                    </div>
                    {t.note && (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-3)" }}>{t.note}</p>
                    )}
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-3)" }}>
                      แก้ไขล่าสุด {fmtDateTime(t.updatedAt)}
                      {t.updatedByName ? ` โดย ${t.updatedByName}` : ""}
                    </p>
                  </div>
                  {!t.isHidden && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn sm" onClick={() => openEdit(t)}>
                        <Pencil size={14} /> แก้ไข
                      </button>
                      <button type="button" className="btn sm" onClick={() => setPendingHide(t)}>
                        <EyeOff size={14} /> ซ่อน
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={closeForm}
        title={editing?.mode === "create" ? "สร้างแม่แบบต้นทุน" : "แก้ไขแม่แบบต้นทุน"}
        size="lg"
        dismissible={!saving}
      >
        {form && (
          <>
            <CostTemplateForm
              mode={editing.mode}
              form={form}
              setForm={setForm}
              productTypes={productTypes}
              takenCategories={takenCategories}
            />
            <div className="action-bar" style={{ marginTop: 20 }}>
              <button type="button" className="btn ghost" onClick={closeForm} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={requestSave} disabled={saving}>บันทึก</button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingSave}
        title="ยืนยันบันทึกแม่แบบ"
        description="ใบขอราคาที่สร้างหลังจากนี้จะกางบรรทัดตามแม่แบบชุดใหม่"
        detail="ใบที่กางไปแล้วไม่เปลี่ยนตาม เพราะเก็บบรรทัดเป็นสำเนาของตัวเองไว้"
        confirmLabel="บันทึก"
        busy={saving}
        onConfirm={save}
        onClose={() => setPendingSave(false)}
      />

      <ConfirmDialog
        open={!!pendingHide}
        title="ซ่อนแม่แบบนี้?"
        description={pendingHide ? `${typeLabel(pendingHide.categoryCode)} (${pendingHide.categoryCode})` : ""}
        detail="ซ่อนแล้วจะแก้ไขหรือเปิดกลับไม่ได้ และใบขอราคาใหม่ของประเภทนี้จะไม่มีแม่แบบให้กางจนกว่าจะสร้างใบใหม่ — ข้อมูลไม่ถูกลบ ยังตามรอยใบเก่าได้"
        confirmLabel="ซ่อนแม่แบบ"
        tone="danger"
        busy={saving}
        onConfirm={hide}
        onClose={() => setPendingHide(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
