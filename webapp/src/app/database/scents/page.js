"use client";
// ── ทะเบียนกลิ่น (mig 0171) ────────────────────────────────────────────
//
// กลิ่นเป็น "ข้อมูลหลัก" เหมือนลูกค้า/สินค้า — มีตัวตนถาวร ไม่มีเลขที่เอกสาร
// ฝ่ายขายเสนอเข้ามาเป็นร่าง → RD ใส่รหัสแล้วรับเข้าทะเบียน → ส่งตัวอย่างให้ลูกค้า
// เป็น Rev แต่ละครั้ง แล้วบันทึกผลตอบรับกลับมา
//
// ⚠️ ก่อนมีหน้านี้ คนกรอกชื่อกลิ่นลงช่อง "ชื่อสูตร" ของสินค้าเพราะไม่มีที่เก็บ
// (เจอจริงบน prod 10 แถว) — ดูการ์ด "รอจัดระเบียบ" ที่หน้าทะเบียนสูตร
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, FlaskConical, Pencil, Plus, RefreshCw, Search, Send, Trash2, Archive, ArchiveRestore, History,
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
import ScentForm, { emptyScentForm, scentToForm } from "@/components/database/ScentForm";
import { usePagination } from "@/lib/usePagination";
import { cachedFetchJson } from "@/lib/apiCache";
import { deleteWithForce } from "@/lib/forceDeleteClient";
import { useRole } from "@/lib/roleContext";
import { fmtDate } from "@/lib/format";
import {
  SCENT_STATUS_LABELS, SCENT_STATUS_TONES, canProposeScent, isScentRegistrar,
} from "@/lib/master/scents";
import {
  SCENT_FEEDBACK_LABELS, SCENT_FEEDBACK_TONES, revisionSummary,
} from "@/lib/master/scentRevisions";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ScentsPage() {
  const role = useRole();
  const me = useMemo(() => ({ role }), [role]);
  const registrar = isScentRegistrar(me);
  const canPropose = canProposeScent(me);
  // break-glass ของผู้ดูแลระบบ = role admin เท่านั้น (เข้มกว่า isSuperuser —
  // ae_supervisor เป็น superuser แต่บังคับลบไม่ได้ ดู lib/forceDelete.js)
  const isAdmin = role === "admin";

  const [scents, setScents] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

  const [form, setForm] = useState(null);       // { mode, scent?, value }
  const [accept, setAccept] = useState(null);   // { scent, code }
  const [sending, setSending] = useState(null); // { scent, sentAt, sampleCode, note }
  const [feedback, setFeedback] = useState(null); // { scent, revision, status, feedbackAt, text }
  const [history, setHistory] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, scent }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/master/scents", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดทะเบียนกลิ่นไม่สำเร็จ");
      setScents(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scents.filter((s) => {
      if (statusFilter === "open" && s.status === "archived") return false;
      if (statusFilter && statusFilter !== "open" && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.name, s.code, s.customerName, s.note]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [scents, statusFilter, search]);

  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(visible, { resetKey: `${search}|${statusFilter}` });

  const draftCount = useMemo(() => scents.filter((s) => s.status === "draft").length, [scents]);

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
      customerId: v.customerId,
      customerName: customers.find((c) => c.id === v.customerId)?.name || null,
      note: v.note,
    };
    if (form.mode === "create") {
      if (registrar && v.code.trim()) payload.code = v.code.trim();
      const done = await call("/api/master/scents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, payload.code ? "เพิ่มกลิ่นเข้าทะเบียนแล้ว" : "เสนอกลิ่นแล้ว รอ RD รับเข้าทะเบียน");
      if (done) setForm(null);
      return;
    }
    const done = await call(`/api/master/scents/${form.scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", ...payload }),
    }, "บันทึกข้อมูลกลิ่นแล้ว");
    if (done) setForm(null);
  };

  const submitAccept = async () => {
    const done = await call(`/api/master/scents/${accept.scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept", code: accept.code }),
    }, "รับกลิ่นเข้าทะเบียนแล้ว");
    if (done) setAccept(null);
  };

  const submitSend = async () => {
    const done = await call(`/api/master/scents/${sending.scent.id}/revisions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sentAt: sending.sentAt, sampleCode: sending.sampleCode, note: sending.note,
      }),
    }, "บันทึกการส่งกลิ่นแล้ว");
    if (done) setSending(null);
  };

  const submitFeedback = async () => {
    const done = await call(
      `/api/master/scents/${feedback.scent.id}/revisions/${feedback.revision.id}`,
      {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: feedback.status, feedbackAt: feedback.feedbackAt, feedback: feedback.text,
        }),
      }, "บันทึกผลตอบรับแล้ว",
    );
    if (done) setFeedback(null);
  };

  // ลบ: admin ที่โดนกฎธุรกิจบล็อกจะได้พรีวิวว่ากระทบอะไรบ้าง แล้วถามยืนยันบังคับลบต่อ
  // (แพตเทิร์นเดียวกับดีล/ใบเสนอราคา — ดู lib/forceDeleteClient.js)
  const runDelete = async (scent) => {
    setSaving(true);
    try {
      const result = await deleteWithForce(`/api/master/scents/${scent.id}`, { isAdmin });
      if (result.ok) {
        setToast({ kind: "success", msg: result.forced ? "บังคับลบกลิ่นแล้ว" : "ลบร่างแล้ว" });
        await reload();
        setConfirm(null);
      } else if (result.cancelled) setConfirm(null);
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally { setSaving(false); }
  };

  const runConfirm = async () => {
    const { kind, scent } = confirm;
    if (kind === "delete") return runDelete(scent);
    const done = await call(`/api/master/scents/${scent.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: kind === "archive" ? "archived" : "active" }),
    }, kind === "archive" ? "เก็บกลิ่นเข้ากรุแล้ว" : "เปิดใช้กลิ่นอีกครั้งแล้ว");
    if (done) setConfirm(null);
  };

  const confirmCopy = () => {
    if (!confirm) return {};
    if (confirm.kind === "delete") {
      const draft = confirm.scent.status === "draft";
      return {
        title: draft ? "ลบร่างกลิ่น" : "ลบกลิ่นออกจากทะเบียน",
        message: draft
          ? `ลบร่าง "${confirm.scent.name}" ทิ้ง? ทำแล้วย้อนไม่ได้`
          : `ลบ "${confirm.scent.name}" ออกจากทะเบียน? ถ้ามีของอ้างอยู่ ระบบจะแสดงรายการให้ยืนยันอีกครั้ง`,
        confirmLabel: draft ? "ลบร่าง" : "ลบกลิ่น",
      };
    }
    if (confirm.kind === "archive") {
      return {
        title: "เก็บกลิ่นเข้ากรุ",
        message: `"${confirm.scent.name}" จะไม่ถูกเลือกในคำร้องขอราคาอีก แต่ประวัติยังอยู่ครบ`,
        confirmLabel: "เก็บเข้ากรุ",
      };
    }
    return {
      title: "เปิดใช้กลิ่นอีกครั้ง",
      message: `นำ "${confirm.scent.name}" กลับมาใช้งาน`,
      confirmLabel: "เปิดใช้",
    };
  };

  return (
    <Workspace
      icon={<FlaskConical size={22} />}
      title="ทะเบียนกลิ่น"
      subtitle="กลิ่นที่ออกแบบให้ลูกค้าแต่ละราย — เก็บรหัส วันที่ส่งแต่ละ Rev และผลตอบรับของลูกค้า"
      headerRight={canPropose ? (
        <button
          type="button" className="btn btn-accent"
          onClick={() => setForm({ mode: "create", value: emptyScentForm() })}
        >
          <Plus size={15} aria-hidden="true" /> เพิ่มกลิ่น
        </button>
      ) : null}
    >
      {registrar && draftCount > 0 && (
        <div className="glass-panel" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ui-badge" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{draftCount}</span>
          <span style={{ fontSize: 13 }}>มีกลิ่นที่ฝ่ายขายเสนอเข้ามารอคุณรับเข้าทะเบียน</span>
          <span className="spacer" />
          <button type="button" className="btn sm" onClick={() => setStatusFilter("draft")}>ดูเฉพาะร่าง</button>
        </div>
      )}

      <div className="toolbar">
        {/* .search-glass เป็น "กล่องครอบ" (flex + gap ไว้วางไอคอน) ไม่ใช่คลาสของ input —
            ใส่ที่ input ตรง ๆ จะได้ช่องที่ไม่มีแว่นขยาย เหมือนหน้าลูกค้า/สินค้าที่ทำถูก */}
        <div className="search-glass">
          <Search size={18} color="var(--text-3)" aria-hidden="true" />
          <input
            type="text" placeholder="ค้นชื่อกลิ่น · รหัส · ลูกค้า"
            value={search} onChange={(e) => setSearch(e.target.value)} aria-label="ค้นหากลิ่น"
          />
        </div>
        <Select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "open", label: "ที่ใช้งานอยู่" },
            { value: "draft", label: "ร่าง — รอ RD รับ" },
            { value: "developing", label: "กำลังพัฒนา" },
            { value: "active", label: "ใช้งานได้" },
            { value: "archived", label: "เลิกใช้" },
            { value: "", label: "ทุกสถานะ" },
          ]}
          aria-label="กรองสถานะกลิ่น"
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
        <EmptyState icon={FlaskConical}>
          {scents.length === 0
            ? "ทะเบียนยังว่าง — กด \"เพิ่มกลิ่น\" เพื่อเริ่ม"
            : "ไม่มีกลิ่นที่ตรงกับตัวกรอง"}
        </EmptyState>
      ) : (
        <>
          <TableScroll>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัส</th><th>ชื่อกลิ่น</th><th>ลูกค้า</th>
                  <th>Rev ล่าสุด</th><th>ผลตอบรับ</th><th>สถานะ</th><th style={{ width: 180 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => {
                  const sum = revisionSummary(s.revisions || []);
                  const latest = (s.revisions || [])[0];
                  return (
                    <tr key={s.id}>
                      <td className="mono">{s.code || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ fontSize: 12.5 }}>{s.customerName || s.customerId}</td>
                      <td className="mono">
                        {sum.latestNo
                          ? <>Rev. {sum.latestNo} · {fmtDate(latest?.sentAt)}</>
                          : <span style={{ color: "var(--text-3)" }}>ยังไม่ส่ง</span>}
                      </td>
                      <td>
                        {sum.latestStatus ? (
                          <span className="ui-badge" style={{ color: SCENT_FEEDBACK_TONES[sum.latestStatus] }}>
                            {SCENT_FEEDBACK_LABELS[sum.latestStatus]}
                          </span>
                        ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                      </td>
                      <td>
                        <span className="ui-badge" style={{ color: SCENT_STATUS_TONES[s.status] }}>
                          {SCENT_STATUS_LABELS[s.status]}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {(s.revisions || []).length > 0 && (
                            <button type="button" className="btn sm ghost" title="ประวัติการส่ง"
                              onClick={() => setHistory(s)}>
                              <History size={14} aria-hidden="true" />
                            </button>
                          )}
                          {registrar && s.status === "draft" && (
                            <button type="button" className="btn sm" title="รับเข้าทะเบียน"
                              onClick={() => setAccept({ scent: s, code: "" })}>
                              <Check size={14} aria-hidden="true" /> รับเข้าทะเบียน
                            </button>
                          )}
                          {registrar && (s.status === "developing" || s.status === "active") && (
                            <button type="button" className="btn sm" title="บันทึกการส่งกลิ่น"
                              onClick={() => setSending({ scent: s, sentAt: todayIso(), sampleCode: "", note: "" })}>
                              <Send size={14} aria-hidden="true" /> ส่งกลิ่น
                            </button>
                          )}
                          {s._canEdit && (
                            <button type="button" className="btn sm ghost" title="แก้ไข"
                              onClick={() => setForm({ mode: "edit", scent: s, value: scentToForm(s) })}>
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          )}
                          {registrar && s.status !== "draft" && s.status !== "archived" && (
                            <button type="button" className="btn sm ghost" title="เก็บเข้ากรุ"
                              onClick={() => setConfirm({ kind: "archive", scent: s })}>
                              <Archive size={14} aria-hidden="true" />
                            </button>
                          )}
                          {registrar && s.status === "archived" && (
                            <button type="button" className="btn sm ghost" title="เปิดใช้อีกครั้ง"
                              onClick={() => setConfirm({ kind: "restore", scent: s })}>
                              <ArchiveRestore size={14} aria-hidden="true" />
                            </button>
                          )}
                          {/* ผู้ดูแลระบบลบได้ทุกแถวทุกสถานะ (break-glass) — คนอื่นได้เฉพาะ
                              ร่างของตัวเองที่ยังไม่มีประวัติการส่ง */}
                          {(isAdmin || (s._canEdit && s.status === "draft" && (s.revisions || []).length === 0)) && (
                            <button
                              type="button" className="btn sm ghost danger"
                              title={s.status === "draft" ? "ลบร่าง" : "ลบกลิ่น (ผู้ดูแลระบบ)"}
                              onClick={() => setConfirm({ kind: "delete", scent: s })}
                            >
                              <Trash2 size={14} aria-hidden="true" />
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
          <Pager
            page={page} pageCount={pageCount} total={total} onPage={setPage}
            pageSize={pageSize} onPageSize={setPageSize}
          />
        </>
      )}

      {/* เพิ่ม / แก้ไข — ฟอร์มเดียวสองโหมด (กฎ AGENTS.md) */}
      <Modal
        open={!!form} onClose={() => setForm(null)} size="md" dismissible={!saving}
        title={form?.mode === "edit" ? `แก้ข้อมูลกลิ่น — ${form.scent.name}` : "เพิ่มกลิ่นเข้าทะเบียน"}
      >
        {form && (
          <>
            <ScentForm
              mode={form.mode} value={form.value} customers={customers}
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

      {/* รับเข้าทะเบียน — RD ใส่รหัสจริงของฝ่าย */}
      <Modal
        open={!!accept} onClose={() => setAccept(null)} size="sm" dismissible={!saving}
        title={accept ? `รับเข้าทะเบียน — ${accept.scent.name}` : ""}
      >
        {accept && (
          <>
            <div className="form-group">
              <label htmlFor="accept-code">รหัสกลิ่น</label>
              <input
                id="accept-code" className="premium-input" value={accept.code} disabled={saving}
                placeholder="เช่น SC-2026-001" autoFocus
                onChange={(e) => setAccept({ ...accept, code: e.target.value })}
              />
              <small style={{ color: "var(--text-3)" }}>รหัสของฝ่าย RD — ห้ามซ้ำกับกลิ่นอื่น</small>
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

      {/* บันทึกการส่งกลิ่น = Rev ใหม่ */}
      <Modal
        open={!!sending} onClose={() => setSending(null)} size="sm" dismissible={!saving}
        title={sending ? `บันทึกการส่งกลิ่น — ${sending.scent.name}` : ""}
      >
        {sending && (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="send-date">วันที่ส่ง</label>
                <DateInput
                  id="send-date" value={sending.sentAt} disabled={saving}
                  onChange={(v) => setSending({ ...sending, sentAt: v })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="send-sample">รหัสตัวอย่าง</label>
                <input
                  id="send-sample" className="premium-input" value={sending.sampleCode} disabled={saving}
                  onChange={(e) => setSending({ ...sending, sampleCode: e.target.value })}
                />
              </div>
              <div className="form-group col-span-2">
                <label htmlFor="send-note">หมายเหตุ</label>
                <textarea
                  id="send-note" className="premium-input" rows={2} value={sending.note} disabled={saving}
                  onChange={(e) => setSending({ ...sending, note: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setSending(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={submitSend} disabled={saving}>
                บันทึกเป็น Rev. {(sending.scent.currentRevisionNo || 0) + 1}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ประวัติการส่ง + บันทึกผลตอบรับ */}
      <Modal
        open={!!history} onClose={() => setHistory(null)} size="lg"
        title={history ? `ประวัติการส่งกลิ่น — ${history.name}` : ""}
      >
        {history && (
          <TableScroll>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Rev</th><th>วันที่ส่ง</th><th>ตัวอย่าง</th>
                  <th>ผลตอบรับ</th><th>วันที่ตอบ</th><th>ความเห็นลูกค้า</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(history.revisions || []).map((r) => (
                  <tr key={r.id}>
                    <td className="mono">Rev. {r.revisionNo}</td>
                    <td className="mono">{fmtDate(r.sentAt)}</td>
                    <td className="mono">{r.sampleCode || "—"}</td>
                    <td>
                      <span className="ui-badge" style={{ color: SCENT_FEEDBACK_TONES[r.feedbackStatus] }}>
                        {SCENT_FEEDBACK_LABELS[r.feedbackStatus]}
                      </span>
                    </td>
                    <td className="mono">{r.feedbackAt ? fmtDate(r.feedbackAt) : "—"}</td>
                    <td style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{r.feedback || "—"}</td>
                    <td>
                      {r.feedbackStatus === "pending" && canPropose && (
                        <button
                          type="button" className="btn sm"
                          onClick={() => {
                            setHistory(null);
                            setFeedback({
                              scent: history, revision: r,
                              status: "approved", feedbackAt: todayIso(), text: "",
                            });
                          }}
                        >
                          บันทึกผล
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Modal>

      {/* ผลตอบรับ — ฝ่ายขายกรอกได้ด้วย เพราะเป็นคนคุยกับลูกค้า */}
      <Modal
        open={!!feedback} onClose={() => setFeedback(null)} size="sm" dismissible={!saving}
        title={feedback ? `ผลตอบรับ Rev. ${feedback.revision.revisionNo} — ${feedback.scent.name}` : ""}
      >
        {feedback && (
          <>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fb-status">ผลตอบรับ</label>
                <Select
                  id="fb-status" value={feedback.status} disabled={saving}
                  onChange={(e) => setFeedback({ ...feedback, status: e.target.value })}
                  options={[
                    { value: "approved", label: SCENT_FEEDBACK_LABELS.approved },
                    { value: "revise", label: SCENT_FEEDBACK_LABELS.revise },
                    { value: "rejected", label: SCENT_FEEDBACK_LABELS.rejected },
                  ]}
                />
              </div>
              <div className="form-group">
                <label htmlFor="fb-date">วันที่ได้รับผล</label>
                <DateInput
                  id="fb-date" value={feedback.feedbackAt} disabled={saving}
                  onChange={(v) => setFeedback({ ...feedback, feedbackAt: v })}
                />
              </div>
              <div className="form-group col-span-2">
                <label htmlFor="fb-text">ความเห็นของลูกค้า</label>
                <textarea
                  id="fb-text" className="premium-input" rows={4} value={feedback.text} disabled={saving}
                  placeholder="เช่น ขอให้ลดโทนไม้ลง เพิ่มความสดช่วงต้น"
                  onChange={(e) => setFeedback({ ...feedback, text: e.target.value })}
                />
              </div>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "4px 0 0" }}>
              {feedback.status === "approved" && "บันทึกแล้วกลิ่นนี้จะเปลี่ยนเป็น \"ใช้งานได้\" อัตโนมัติ"}
              {feedback.status === "revise" && "บันทึกแล้วกลิ่นนี้จะกลับไปสถานะ \"กำลังพัฒนา\" เพื่อส่ง Rev ถัดไป"}
              {feedback.status === "rejected" && "สถานะกลิ่นไม่เปลี่ยนเอง — เลือกเองว่าจะลองใหม่หรือเก็บเข้ากรุ"}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setFeedback(null)} disabled={saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={submitFeedback} disabled={saving}>บันทึกผล</button>
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
