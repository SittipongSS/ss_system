"use client";
// ── ทะเบียนสูตร (mig 0171) ─────────────────────────────────────────────
//
// เดิมสูตรเป็น 3 ช่องข้อความบนสินค้า (mig 0112) — ไม่มีตาราง ไม่มีความสัมพันธ์
// กับกลิ่น · คำร้อง "ขอราคา FB อ้างชื่อสูตร" จึงอ้างได้แค่ข้อความ
//
// ⭐ การ์ด "รอจัดระเบียบ": บน prod มีสินค้าที่กรอกชื่อสูตรไว้แต่ไม่มีรหัส และชื่อ
// พวกนั้นส่วนใหญ่คือ *ชื่อกลิ่น* (Walk on beach 01 · Forest night · …) เพราะเมื่อก่อน
// ไม่มีที่เก็บกลิ่น — migration ตั้งใจไม่เดาแทน RD จึงยกมาให้ตัดสินทีละแถวที่นี่
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, ArchiveRestore, Beaker, Check, FlaskConical, Pencil, Plus, RefreshCw, Trash2, Wand2,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import Pager from "@/components/ui/Pager";
import FormulaForm, { emptyFormulaForm, formulaToForm } from "@/components/database/FormulaForm";
import { usePagination } from "@/lib/usePagination";
import { cachedFetchJson } from "@/lib/apiCache";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import {
  FORMULA_STATUS_LABELS, FORMULA_STATUS_TONES, canProposeFormula, isFormulaRegistrar,
} from "@/lib/master/formulas";

export default function FormulasPage() {
  const role = useRole();
  const me = useMemo(() => ({ role }), [role]);
  const registrar = isFormulaRegistrar(me);
  const canPropose = canProposeFormula(me);
  // break-glass ของผู้ดูแลระบบ = role admin เท่านั้น (ดู lib/forceDelete.js)
  const isAdmin = role === "admin";

  const [formulas, setFormulas] = useState([]);
  const [scents, setScents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [unsorted, setUnsorted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

  const [form, setForm] = useState(null);      // { mode, formula?, value }
  const [accept, setAccept] = useState(null);  // { formula, code }
  const [sorting, setSorting] = useState(null); // { row, as, code }
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // ⚠️ โหลดกลิ่นมาพร้อมกันใน reload เดียวกัน ไม่ใช่ useEffect แยกตอน mount —
  // ตารางแปลง scentId เป็นชื่อกลิ่นจากชุดนี้ ถ้าโหลดพลาดครั้งเดียวแล้วปุ่มรีเฟรช
  // ไม่ดึงซ้ำ คอลัมน์ "กลิ่นที่ใช้" จะค้างเป็นรหัสดิบตลอดจนกว่าจะรีโหลดทั้งหน้า
  // (เจอตอนตรวจหน้าจริง — ขึ้น "SCT-1" แทน "Forest night")
  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const [fRes, uRes, sRes] = await Promise.all([
        fetch("/api/master/formulas", { cache: "no-store" }),
        fetch("/api/master/formulas/unsorted", { cache: "no-store" }),
        fetch("/api/master/scents", { cache: "no-store" }),
      ]);
      const fData = await fRes.json().catch(() => null);
      if (!fRes.ok) throw new Error(fData?.error || "โหลดทะเบียนสูตรไม่สำเร็จ");
      setFormulas(Array.isArray(fData) ? fData : []);
      const uData = await uRes.json().catch(() => null);
      setUnsorted(uRes.ok && Array.isArray(uData) ? uData : []);
      const sData = await sRes.json().catch(() => null);
      setScents(sRes.ok && Array.isArray(sData) ? sData : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
  }, []);

  // ไม่เจอกลิ่น = คืน null ให้คนเรียกแสดง "—" · **ห้ามถอยไปโชว์ id ดิบ**
  // รหัสภายในบนหน้าจอผู้ใช้อ่านไม่รู้เรื่องและดูเหมือนข้อมูลเสีย
  const scentName = useCallback(
    (id) => scents.find((s) => s.id === id)?.name || null, [scents],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return formulas.filter((f) => {
      if (statusFilter === "open" && f.status === "archived") return false;
      if (statusFilter && statusFilter !== "open" && f.status !== statusFilter) return false;
      if (!q) return true;
      return [f.name, f.code, f.customerName, scentName(f.scentId)]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [formulas, statusFilter, search, scentName]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(visible, { resetKey: `${search}|${statusFilter}` });

  // ── actions ──────────────────────────────────────────────────────────
  const call = async (url, options, okMsg) => {
    setSaving(true);
    try {
      const res = await fetch(url, options);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      setToast({ kind: "success", msg: okMsg });
      await reload();
      return true;
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
      return false;
    } finally { setSaving(false); }
  };

  const submitForm = async () => {
    const v = form.value;
    const payload = {
      name: v.name,
      formulaDate: v.formulaDate || null,
      scentId: v.scentId || null,
      customerId: v.customerId || null,
      customerName: customers.find((c) => c.id === v.customerId)?.name || null,
      note: v.note,
    };
    if (form.mode === "create") {
      if (registrar && v.code.trim()) payload.code = v.code.trim();
      const done = await call("/api/master/formulas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, payload.code ? "เพิ่มสูตรเข้าทะเบียนแล้ว" : "เสนอสูตรแล้ว รอ RD รับเข้าทะเบียน");
      if (done) setForm(null);
      return;
    }
    const done = await call(`/api/master/formulas/${form.formula.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", ...payload }),
    }, "บันทึกข้อมูลสูตรแล้ว");
    if (done) setForm(null);
  };

  const submitAccept = async () => {
    const done = await call(`/api/master/formulas/${accept.formula.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", code: accept.code }),
    }, "รับสูตรเข้าทะเบียนแล้ว");
    if (done) setAccept(null);
  };

  const submitSorting = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/master/formulas/unsorted", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: sorting.row.productId,
          as: sorting.as,
          code: sorting.code || null,
          formulaDate: sorting.as === "formula" ? (sorting.formulaDate || null) : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "จัดระเบียบไม่สำเร็จ");
      const where = sorting.as === "scent" ? "กลิ่น" : "สูตร";
      // แยกข้อความ "ผูกกับของเดิม" ออกจาก "สร้างใหม่" — ของจริงมีชื่อซ้ำข้ามสินค้า
      // ถ้าบอกว่า "ย้ายแล้ว" เหมือนกันหมด คนจะนึกว่าเกิดของซ้ำในทะเบียน
      setToast({
        kind: "success",
        msg: d.reused
          ? `ผูกเข้าทะเบียน${where} "${d.row?.name}" ที่มีอยู่แล้ว`
          : `ย้ายเข้าทะเบียน${where}แล้ว`,
      });
      await reload();
      setSorting(null);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally { setSaving(false); }
  };

  // ลบ: admin ที่โดนกฎธุรกิจบล็อกจะได้พรีวิวว่ากระทบอะไรบ้าง แล้วถามยืนยันบังคับลบต่อ
  const runDelete = async (formula) => {
    setSaving(true);
    try {
      const result = await deleteWithForce(`/api/master/formulas/${formula.id}`, { isAdmin });
      if (result.ok) {
        setToast({ kind: "success", msg: result.forced ? "บังคับลบสูตรแล้ว" : "ลบร่างแล้ว" });
        await reload();
        setConfirm(null);
      } else if (result.cancelled) setConfirm(null);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally { setSaving(false); }
  };

  const runConfirm = async () => {
    const { kind, formula } = confirm;
    if (kind === "delete") return runDelete(formula);
    const done = await call(`/api/master/formulas/${formula.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: kind === "archive" ? "archived" : "active" }),
    }, kind === "archive" ? "เก็บสูตรเข้ากรุแล้ว" : "เปิดใช้สูตรอีกครั้งแล้ว");
    if (done) setConfirm(null);
  };

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "delete") {
      const draft = confirm.formula.status === "draft";
      return {
        title: draft ? "ลบร่างสูตร" : "ลบสูตรออกจากทะเบียน",
        message: draft
          ? `ลบร่าง "${confirm.formula.name}" ทิ้ง? ทำแล้วย้อนไม่ได้`
          : `ลบ "${confirm.formula.name}" ออกจากทะเบียน? ถ้ามีสินค้าอ้างอยู่ ระบบจะแสดงรายการให้ยืนยันอีกครั้ง`,
        confirmLabel: draft ? "ลบร่าง" : "ลบสูตร",
      };
    }
    if (confirm.kind === "archive") {
      return {
        title: "เก็บสูตรเข้ากรุ",
        message: `"${confirm.formula.name}" จะไม่ถูกเลือกในคำร้องขอราคาอีก แต่ประวัติยังอยู่ครบ`,
        confirmLabel: "เก็บเข้ากรุ",
      };
    }
    return {
      title: "เปิดใช้สูตรอีกครั้ง",
      message: `นำ "${confirm.formula.name}" กลับมาใช้งาน`,
      confirmLabel: "เปิดใช้",
    };
  };

  return (
    <Workspace
      icon={<Beaker size={22} />}
      title="ทะเบียนสูตร"
      subtitle="สูตรของ RD พร้อมกลิ่นที่ใช้ — ใบขอราคาผลิตและคำร้องขอราคา FB อ้างจากที่นี่"
      headerRight={canPropose ? (
        <button
          type="button" className="btn btn-accent"
          onClick={() => setForm({ mode: "create", value: emptyFormulaForm() })}
        >
          <Plus size={15} aria-hidden="true" /> เพิ่มสูตร
        </button>
      ) : null}
    >
      {/* รอจัดระเบียบ — ของเก่าที่กรอกชื่อไว้ในช่องสูตรของสินค้า */}
      {unsorted.length > 0 && (
        <div className="glass-panel" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Wand2 size={16} aria-hidden="true" />
            <strong style={{ fontSize: 14 }}>รอจัดระเบียบ ({unsorted.length})</strong>
            <span className="spacer" />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: "0 0 10px" }}>
            สินค้าที่กรอก &quot;ชื่อสูตร&quot; ไว้ตั้งแต่ก่อนมีทะเบียน — หลายรายการเป็น
            <strong> ชื่อกลิ่น</strong> ไม่ใช่ชื่อสูตร ระบบจึงไม่เดาให้
            {registrar ? " เลือกให้ทีละรายการว่าจะเข้าทะเบียนไหน" : " รอ RD จัดระเบียบ"}
          </p>
          <TableScroll surface="embedded">
            <table className="premium-table">
              <thead>
                <tr><th>ชื่อที่กรอกไว้</th><th>วันที่</th><th>สินค้า</th><th>ลูกค้า</th><th style={{ width: 150 }}></th></tr>
              </thead>
              <tbody>
                {unsorted.map((r) => (
                  <tr key={r.productId}>
                    <td style={{ fontWeight: 600 }}>{r.formulaName}</td>
                    <td className="mono">{r.formulaDate ? fmtDate(r.formulaDate) : "—"}</td>
                    <td style={{ fontSize: 12.5 }}>{r.productName}</td>
                    <td style={{ fontSize: 12.5 }}>{r.customerName || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {registrar && (
                        <button
                          type="button" className="btn sm"
                          onClick={() => setSorting({
                            row: r, as: "scent", code: "", formulaDate: r.formulaDate || "",
                          })}
                        >
                          จัดระเบียบ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      <div className="toolbar">
        <input
          className="search-glass" placeholder="ค้นชื่อสูตร · รหัส · กลิ่น · ลูกค้า"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหาสูตร"
        />
        <Select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "open", label: "ที่ใช้งานอยู่" },
            { value: "draft", label: "ร่าง — รอ RD รับ" },
            { value: "active", label: "ใช้งานได้" },
            { value: "archived", label: "เลิกใช้" },
            { value: "", label: "ทุกสถานะ" },
          ]}
          aria-label="กรองสถานะสูตร"
        />
        <span className="spacer" />
        <button type="button" className="btn" onClick={reload} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" /> รีเฟรช
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : loadError ? (
        <div className="glass-panel" style={{ padding: 24, color: "var(--red)" }}>{loadError}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Beaker}>
          {formulas.length === 0
            ? "ทะเบียนยังว่าง — กด \"เพิ่มสูตร\" เพื่อเริ่ม"
            : "ไม่มีสูตรที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <>
          <TableScroll>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อสูตร</th><th>กลิ่นที่ใช้</th>
                  <th>วันที่</th><th>ลูกค้า</th><th>สถานะ</th><th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.code || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                    <td style={{ fontWeight: 600 }}>{f.name}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {f.scentId && scentName(f.scentId)
                        ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <FlaskConical size={13} aria-hidden="true" />
                            {scentName(f.scentId)}
                          </span>
                        )
                        : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                    <td className="mono">{f.formulaDate ? fmtDate(f.formulaDate) : "—"}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {f.customerName || <span style={{ color: "var(--text-3)" }}>สูตรกลาง</span>}
                    </td>
                    <td>
                      <span className="ui-badge" style={{ color: FORMULA_STATUS_TONES[f.status] }}>
                        {FORMULA_STATUS_LABELS[f.status]}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {registrar && f.status === "draft" && (
                          <button type="button" className="btn sm" title="รับเข้าทะเบียน"
                            onClick={() => setAccept({ formula: f, code: "" })}>
                            <Check size={14} aria-hidden="true" /> รับเข้าทะเบียน
                          </button>
                        )}
                        {f._canEdit && (
                          <button type="button" className="btn sm ghost" title="แก้ไข"
                            onClick={() => setForm({ mode: "edit", formula: f, value: formulaToForm(f) })}>
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                        )}
                        {registrar && f.status === "active" && (
                          <button type="button" className="btn sm ghost" title="เก็บเข้ากรุ"
                            onClick={() => setConfirm({ kind: "archive", formula: f })}>
                            <Archive size={14} aria-hidden="true" />
                          </button>
                        )}
                        {registrar && f.status === "archived" && (
                          <button type="button" className="btn sm ghost" title="เปิดใช้อีกครั้ง"
                            onClick={() => setConfirm({ kind: "restore", formula: f })}>
                            <ArchiveRestore size={14} aria-hidden="true" />
                          </button>
                        )}
                        {/* ผู้ดูแลระบบลบได้ทุกแถวทุกสถานะ (break-glass) */}
                        {(isAdmin || (f._canEdit && f.status === "draft")) && (
                          <button
                            type="button" className="btn sm ghost danger"
                            title={f.status === "draft" ? "ลบร่าง" : "ลบสูตร (ผู้ดูแลระบบ)"}
                            onClick={() => setConfirm({ kind: "delete", formula: f })}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <Pager
            page={page} pageCount={pageCount} total={total} onPage={setPage}
            pageSize={pageSize} onPageSize={setPageSize}
          />
        </>
      )}

      {/* เพิ่ม / แก้ไข — ฟอร์มเดียวสองโหมด (กฎ AGENTS.md) */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="md" dismissible={!saving}
        title={form?.mode === "edit" ? `แก้ข้อมูลสูตร — ${form.formula.name}` : "เพิ่มสูตรเข้าทะเบียน"}
      >
        {form && (
          <>
            <FormulaForm
              mode={form.mode} value={form.value} customers={customers} scents={scents}
              canSetCode={registrar} disabled={saving}
              onChange={(value) => setForm({ ...form, value })}
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setForm(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={submitForm} disabled={saving}>บันทึก</button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!accept} onClose={() => setAccept(null)} size="sm" dismissible={!saving}
        title={accept ? `รับเข้าทะเบียน — ${accept.formula.name}` : ""}
      >
        {accept && (
          <>
            <div className="form-group">
              <label htmlFor="accept-formula-code">รหัสสูตร</label>
              <input
                id="accept-formula-code" className="premium-input" value={accept.code} disabled={saving}
                placeholder="เช่น PF638010202-P1" autoFocus
                onChange={(e) => setAccept({ ...accept, code: e.target.value })}
              />
              <small style={{ color: "var(--text-3)" }}>รหัสของฝ่าย RD — ห้ามซ้ำกับสูตรอื่น</small>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setAccept(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={submitAccept} disabled={saving || !accept.code.trim()}>
                รับเข้าทะเบียน
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* จัดระเบียบของเก่า: กลิ่น หรือ สูตร */}
      <Modal
        open={!!sorting} onClose={() => setSorting(null)} size="sm" dismissible={!saving}
        title={sorting ? `จัดระเบียบ — ${sorting.row.formulaName}` : ""}
      >
        {sorting && (
          <>
            <p style={{ fontSize: 13, margin: "0 0 12px", color: "var(--text-2)" }}>
              ชื่อนี้ถูกกรอกไว้ในช่อง &quot;ชื่อสูตร&quot; ของสินค้า <strong>{sorting.row.productName}</strong> —
              จริง ๆ แล้วเป็นอะไร?
            </p>
            <div className="form-grid">
              <div className="form-group col-span-2">
                <label htmlFor="sort-as">เข้าทะเบียน</label>
                <Select
                  id="sort-as" value={sorting.as} disabled={saving}
                  onChange={(e) => setSorting({ ...sorting, as: e.target.value })}
                  options={[
                    { value: "scent", label: "ทะเบียนกลิ่น" },
                    { value: "formula", label: "ทะเบียนสูตร" },
                  ]}
                />
              </div>
              <div className="form-group col-span-2">
                <label htmlFor="sort-code">
                  รหัส{sorting.as === "scent" ? "กลิ่น" : "สูตร"} <span style={{ color: "var(--text-3)" }}>(ไม่บังคับ)</span>
                </label>
                <input
                  id="sort-code" className="premium-input" value={sorting.code} disabled={saving}
                  onChange={(e) => setSorting({ ...sorting, code: e.target.value })}
                />
                <small style={{ color: "var(--text-3)" }}>เว้นว่าง = เก็บเป็นร่างไว้ใส่รหัสทีหลัง</small>
              </div>
              {sorting.as === "formula" && (
                <div className="form-group col-span-2">
                  <label htmlFor="sort-date">วันที่ของสูตร</label>
                  <DateInput
                    id="sort-date" value={sorting.formulaDate} disabled={saving}
                    onChange={(v) => setSorting({ ...sorting, formulaDate: v })}
                  />
                  {/* prod มีปีพิมพ์ผิดจริง (2202) — ให้แก้ตรงนี้ได้เลย ไม่ใช่บล็อกทิ้งไว้ */}
                  {!!sorting.row.formulaDate && !/^(19|20)\d{2}-/.test(String(sorting.row.formulaDate)) && (
                    <small style={{ color: "var(--amber)" }}>
                      วันที่เดิมของสินค้า ({sorting.row.formulaDate}) ดูเหมือนพิมพ์ปีผิด — แก้ตรงนี้หรือเว้นว่างไว้ก่อนได้
                    </small>
                  )}
                </div>
              )}
            </div>
            {sorting.as === "scent" && !sorting.row.customerId && (
              <p style={{ fontSize: 12, color: "var(--red)", margin: "8px 0 0" }}>
                สินค้านี้ยังไม่มีลูกค้า — กลิ่นต้องมีลูกค้าเจ้าของเสมอ ต้องผูกลูกค้าที่หน้าสินค้าก่อน
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setSorting(null)} disabled={saving}>ยกเลิก</button>
              <button
                type="button" className="btn btn-accent" onClick={submitSorting}
                disabled={saving || (sorting.as === "scent" && !sorting.row.customerId)}
              >
                ย้ายเข้าทะเบียน
              </button>
            </div>
          </>
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
    </Workspace>
  );
}
