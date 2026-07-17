"use client";
// โมดัลงาน — ใช้ร่วม 2 จุด: หน้ารายการงาน (/pm/tasks) กับหน้ารายละเอียดงาน
// (/pm/tasks/[id]) ทั้งตอนสร้างและตอนแก้ (มติผู้ใช้ 2026-07-17: กดแก้ไขต้องได้
// ฟอร์มเดียวกับตอนสร้าง). แพตเทิร์นเดียวกับ DealFormFields/PoForm.
//
// ต่างกันแค่โหมด: สร้าง = ไม่มีช่องสถานะ (งานใหม่เริ่มที่ "รอดำเนินการ" เสมอ) และ
// แนบไฟล์ค้างไว้อัปหลังบันทึก; แก้ = มีสถานะ + ช่องสาเหตุตอนปิดงานเลยกำหนด และ
// แนบไฟล์เข้างานได้ทันที. สิทธิ์ 2 ระดับตาม API: canManage = แก้ได้ทุกช่อง,
// canChangeStatus อย่างเดียว = ส่งแค่ status (API บังคับ statusOnly ซ้ำอยู่ดี).
// ไม่มี auto-save — กดบันทึกครั้งเดียว ([[no-autosave-explicit-save]])
import { useEffect, useRef, useState } from "react";
import { FileText, Flame, Paperclip, Star, Tag, UserPlus, X } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, TASK_CATEGORIES } from "@/lib/pm/tasks";
import { resolvePersonalTaskLink, taskLinkType } from "@/lib/pm/taskLink";
import PersonSelect from "@/components/ui/PersonSelect";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

// ค่าโครงการใน dropdown ที่แปลว่า "ดีลที่ยังไม่ผูกโครงการ" (ดีลกลุ่มนี้มีจริงและ
// ผูกงานได้ — ถ้าไม่มีถังนี้ การกรองตามโครงการจะทำให้มันหายไปเฉย ๆ)
const NO_PROJECT = "__no_project__";

export const TASK_BLANK = {
  title: "", note: "", startDate: "", dueDate: "",
  linkType: "none", projectId: "", dealId: "", assigneeId: "",
  linkProjectId: "",   // ตัวกรองใน dropdown เท่านั้น — ไม่ได้ส่งขึ้น API
  category: "", important: false, urgent: false, difficulty: 2,
  status: "Pending",
};

export const STATUS_OPTIONS = [
  ["Pending", "รอดำเนินการ"],
  ["In Progress", "กำลังทำ"],
  ["Completed", "เสร็จแล้ว"],
];

// วันที่วันนี้ตามเครื่องผู้ใช้ (ไทย = ICT) — ใช้เทียบ "เลยกำหนด" ฝั่ง client
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const taskToForm = (t, deals = []) => {
  // เปิดฟอร์มแก้แล้วช่องโครงการต้องตั้งไว้ให้ตรงกับดีลเดิม ไม่งั้นช่องดีลจะว่าง
  // ทั้งที่งานผูกดีลอยู่ (dealId ที่ไม่อยู่ใน dealChoices)
  const deal = t.dealId ? deals.find((d) => d.id === t.dealId) : null;
  const projectId = t.projectId || deal?.projectId || "";
  return {
    title: t.title || "", note: t.note || "",
    startDate: t.startDate || "", dueDate: t.dueDate || "",
    linkType: taskLinkType(t),
    projectId: t.projectId || "", dealId: t.dealId || "", assigneeId: t.assigneeId || "",
    linkProjectId: t.dealId ? (projectId || NO_PROJECT) : "",
    category: t.category || "", important: !!t.important, urgent: !!t.urgent,
    difficulty: t.difficulty ?? 2, status: t.status || "Pending",
  };
};

async function uploadTaskAttachment(taskId, file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("customerName", `personal_task-${taskId}`);
  fd.append("entityType", "personal_task");
  fd.append("entityId", taskId);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `อัปโหลด ${file.name} ไม่สำเร็จ`);
  return data;
}

export default function TaskFormModal({
  open,
  onClose,
  task = null,               // null = สร้างใหม่
  initialForm = null,        // ค่าตั้งต้นตอนสร้าง (เช่น preset ดีล / มาจากเรื่องสอบถาม)
  inquirySource = null,      // { inquiryId, code, messageId?, returnTo? }
  deals = [],
  projects = [],
  assignableUsers = [],
  me = null,
  canManage = true,
  canChangeStatus = true,
  onSaved,                   // (savedTask, { warning }) => void
  onError,                   // (message) => void — caller โชว์ toast เอง
}) {
  const editing = !!task;
  const [form, setForm] = useState(TASK_BLANK);
  const [lateReason, setLateReason] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // เติมฟอร์มตอนเปิด. ผูกกับ task.id (ไม่ใช่ object) — caller หลายที่สร้าง object
  // ใหม่ทุก render จะทำให้ทับสิ่งที่พิมพ์ค้างไว้
  useEffect(() => {
    if (!open) return;
    const seed = task ? taskToForm(task, deals) : { ...TASK_BLANK, ...(initialForm || {}) };
    // caller อาจ preset dealId มา (สร้างงานจากหน้าดีล / จากเรื่องสอบถาม) โดยไม่รู้จัก
    // linkProjectId — เติมให้จากดีลจริง ไม่งั้นดีลที่ preset จะหายจาก dropdown ที่กรอง
    if (seed.dealId && !seed.linkProjectId) {
      const d = deals.find((row) => row.id === seed.dealId);
      seed.linkProjectId = d?.projectId || NO_PROJECT;
    }
    setForm(seed);
    setLateReason("");
    setPendingFiles([]);
    setError("");
    // deals อยู่ใน dep ด้วยเพราะ taskToForm ใช้หา projectId ของดีลเดิม — หน้า detail
    // โหลดดีลทีหลัง (ตอนกดแก้ไข) ถ้าไม่ re-seed ช่องโครงการจะค้างว่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, deals.length]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ดีลแยกตามโครงการ — ถังพิเศษสำหรับดีลที่ยังไม่ผูกโครงการ
  const unlinkedDeals = deals.filter((d) => !d.projectId);
  const linkProjects = projects.filter((p) => deals.some((d) => d.projectId === p.id));
  const dealChoices = form.linkProjectId === NO_PROJECT
    ? unlinkedDeals
    : form.linkProjectId
      ? deals.filter((d) => d.projectId === form.linkProjectId)
      : [];

  // ปิดงานที่ "เลยกำหนด" → ต้องระบุสาเหตุ (กรอกในฟอร์ม ไม่ใช่ป๊อปอัปซ้อน)
  const willComplete = editing && form.status === "Completed" && task.status !== "Completed";
  const needLateReason = willComplete && !!form.dueDate && form.dueDate < todayLocal();

  const selectFiles = (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    const oversized = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized.length) setError(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB: ${oversized.map((f) => f.name).join(", ")}`);
    setPendingFiles((cur) => [...cur, ...picked.filter((f) => f.size <= MAX_UPLOAD_BYTES)]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (canManage && !form.title.trim()) { setError("ต้องระบุชื่องาน"); return; }
    if (canManage && form.linkType === "deal" && !form.dealId) { setError("กรุณาเลือกดีล"); return; }
    if (needLateReason && !lateReason.trim()) { setError("ต้องระบุสาเหตุที่ทำเสร็จช้าก่อนปิดงาน"); return; }

    setSaving(true);
    try {
      // ไม่มีสิทธิ์เต็ม = ส่งแค่ status (API บังคับ statusOnly — ส่งฟิลด์อื่นปนไปจะโดน 403)
      let payload;
      if (!canManage) {
        payload = { status: form.status };
      } else {
        const { projectId, dealId } = resolvePersonalTaskLink(form, deals);
        payload = {
          title: form.title, note: form.note,
          startDate: form.startDate || null, dueDate: form.dueDate || null,
          projectId, dealId,
          assigneeId: form.assigneeId || null,
          category: form.category || null,
          important: !!form.important, urgent: !!form.urgent,
          difficulty: form.difficulty,
          ...(editing ? { status: form.status } : {}),
          ...(editing ? {} : {
            inquiryId: inquirySource?.inquiryId || null,
            inquiryMessageId: inquirySource?.messageId || null,
          }),
        };
      }
      if (needLateReason) payload.lateReason = lateReason.trim();

      const res = await fetch(editing ? `/api/pm/personal-tasks/${task.id}` : "/api/pm/personal-tasks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(saved.error || "บันทึกไม่สำเร็จ");

      // ไฟล์ที่เลือกไว้ตอนสร้าง — อัปหลังได้ id งานแล้ว
      const failed = [];
      if (!editing && pendingFiles.length) {
        for (const file of pendingFiles) {
          try { await uploadTaskAttachment(saved.id, file); }
          catch (err) { console.error(err); failed.push(file.name); }
        }
      }
      onSaved?.(saved, {
        warning: failed.length
          ? `สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${failed.join(", ")} — เปิดแก้ไขงานเพื่อแนบอีกครั้ง`
          : null,
      });
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาด");
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ไม่มีใครให้มอบ = มอบให้คนอื่นไม่ได้ — อ่านจากรายชื่อจริงที่กรองด้วย canAssignTask มาแล้ว
  // (เดิมเดารายชื่อจาก role เอง แล้วผิดกับ rd ซึ่งมอบกันเองในฝ่ายได้)
  const cannotAssign = !!me && !assignableUsers.some((u) => u.id !== me.id);

  return (
    <Modal open={open} onClose={() => !saving && onClose?.()} title={editing ? "แก้ไขงาน" : "เพิ่มงาน"} size="md">
      <form onSubmit={submit}>
        <div className="grid gap-[14px]">
          {inquirySource && (
            <div className="glass-panel" style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--text-2)" }}>
              สร้างจากเรื่องสอบถาม <strong>{inquirySource.code}</strong>{inquirySource.messageId ? " · ผูกกับข้อความต้นทาง" : ""}
              <div style={{ marginTop: 3, color: "var(--text-3)" }}>ระบบจะล็อกข้อความฝั่งตรงข้ามเมื่อบันทึกงานสำเร็จ</div>
            </div>
          )}
          {editing && !canManage && (
            <div className="ui-badge" style={{ color: "var(--text-3)" }}>แก้ได้เฉพาะสถานะ — ช่องอื่นเป็นของผู้ดูแลงาน</div>
          )}

          <div className="form-group">
            <label>ชื่องาน <span className="text-[var(--red)]">*</span></label>
            <input value={form.title} onChange={(e) => set({ title: e.target.value })} required={canManage} disabled={!canManage} className="premium-input w-full" placeholder="เช่น โทรตามลูกค้า, เตรียมเอกสาร" />
          </div>

          {editing && (
            <div className="form-group">
              <label>สถานะ</label>
              <Select fullWidth value={form.status} disabled={!canChangeStatus} onChange={(e) => set({ status: e.target.value })}>
                {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
          )}

          {needLateReason && (
            <div className="form-group">
              <label style={{ color: "var(--amber)" }}>สาเหตุที่ทำเสร็จช้า (งานเลยกำหนด — จำเป็น)</label>
              <textarea className="premium-input w-full" rows={2} value={lateReason} autoFocus
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="เช่น รออนุมัติจากลูกค้า / รอวัตถุดิบ / ปรับแก้ตามฟีดแบ็ก..." />
            </div>
          )}

          <div className="form-group">
            <label>รายละเอียด</label>
            <textarea value={form.note} onChange={(e) => set({ note: e.target.value })} disabled={!canManage} className="premium-input w-full" rows={2} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
            {editing ? (
              <AttachmentsPanel entityType="personal_task" entityId={task.id} canEdit={canManage} inlineUpload />
            ) : (
              <div className="mt-1 flex flex-col items-end">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50">
                  <Paperclip size={13} /><span>แนบไฟล์</span>
                </button>
                <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT_ATTR} multiple onChange={selectFiles} className="hidden" />
                {pendingFiles.length > 0 && (
                  <div className="mt-1 w-full divide-y divide-[var(--border)]">
                    {pendingFiles.map((file) => {
                      const key = `${file.name}:${file.size}:${file.lastModified}`;
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 py-1 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-2)]">
                            <FileText size={14} className="shrink-0" />
                            <span className="truncate">{file.name}</span>
                            <span className="shrink-0 text-[10px] text-[var(--text-3)]">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                          </span>
                          <button type="button" className="btn-icon danger shrink-0" title="นำออก"
                            aria-label={`นำ ${file.name} ออกจากรายการแนบ`}
                            onClick={() => setPendingFiles((cur) => cur.filter((i) => `${i.name}:${i.size}:${i.lastModified}` !== key))}>
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pm-form-grid gap-3">
            <div className="form-group">
              <label>วันเริ่ม</label>
              <DateInput value={form.startDate} onChange={(v) => set({ startDate: v })} disabled={!canManage} className="w-full" />
            </div>
            <div className="form-group">
              <label>กำหนดเสร็จ</label>
              <DateInput value={form.dueDate} onChange={(v) => set({ dueDate: v })} disabled={!canManage} className="w-full" />
            </div>
          </div>

          <div className="pm-form-grid gap-3">
            <div className="form-group">
              <label><Tag size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> หมวดหมู่</label>
              <Select fullWidth value={form.category} disabled={!canManage} onChange={(e) => set({ category: e.target.value })}>
                <option value="">— ไม่ระบุ —</option>
                {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="form-group">
              <label>ระดับความยาก</label>
              <Select fullWidth value={String(form.difficulty)} disabled={!canManage} onChange={(e) => set({ difficulty: Number(e.target.value) })}>
                {DIFFICULTY_OPTIONS.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
              </Select>
            </div>
          </div>

          <div className="form-group">
            <label>ความสำคัญ</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" disabled={!canManage} onClick={() => set({ important: !form.important })} className={`btn sm${form.important ? " btn-primary" : ""}`}><Star size={14} /> สำคัญ</button>
              <button type="button" disabled={!canManage} onClick={() => set({ urgent: !form.urgent })} className={`btn sm${form.urgent ? " btn-primary" : ""}`}><Flame size={14} /> ด่วน</button>
            </div>
          </div>

          <div className="form-group">
            <label>เชื่อมกับ</label>
            <div className="segmented" style={{ marginBottom: "8px" }}>
              {[["none", "ไม่ผูก"], ["deal", "ดีล"]].map(([k, lbl]) => (
                <button type="button" key={k} disabled={!!inquirySource || !canManage} className={form.linkType === k ? "active" : ""} onClick={() => set({ linkType: k })}>{lbl}</button>
              ))}
            </div>
            {form.linkType === "deal" && (
              <>
                {/* เลือกโครงการก่อน แล้วดีลกรองตามโครงการ (มติผู้ใช้ 2026-07-17) —
                    ดีลที่ยังไม่ผูกโครงการมีจริงและผูกงานได้ จึงมีถังแยกไว้ให้ ไม่งั้น
                    มันจะหายไปจาก dropdown ทั้งที่เดิมเลือกได้ */}
                <div className="pm-form-grid gap-3" style={{ marginBottom: 8 }}>
                  <Select fullWidth disabled={!!inquirySource || !canManage} value={form.linkProjectId}
                    onChange={(e) => set({ linkProjectId: e.target.value, dealId: "" })}>
                    <option value="">— เลือกโครงการก่อน —</option>
                    {linkProjects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ""}{p.name}</option>)}
                    {unlinkedDeals.length > 0 && <option value={NO_PROJECT}>— ดีลที่ยังไม่ผูกโครงการ ({unlinkedDeals.length}) —</option>}
                  </Select>
                  <Select fullWidth disabled={!!inquirySource || !canManage || !form.linkProjectId} value={form.dealId}
                    onChange={(e) => set({ dealId: e.target.value })}>
                    <option value="">{form.linkProjectId ? "— เลือกดีล —" : "เลือกโครงการก่อน"}</option>
                    {dealChoices.map((deal) => (
                      <option key={deal.id} value={deal.id}>{deal.title}{deal.customerName ? ` — ${deal.customerName}` : ""}</option>
                    ))}
                  </Select>
                </div>
                {!deals.length && !inquirySource && <div className="text-[11px] text-[var(--text-3)] mt-1">ไม่พบดีลในทีมของคุณที่สามารถผูกกับงานได้</div>}
                {form.linkProjectId && !dealChoices.length && <div className="text-[11px] text-[var(--text-3)] mt-1">โครงการนี้ยังไม่มีดีลที่ผูกงานได้</div>}
              </>
            )}
          </div>

          <div className="form-group">
            <label><UserPlus size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> มอบหมายให้ <span className="text-[11px] text-[var(--text-3)] font-normal">(งานจะไปอยู่ในรายการงานของคนนั้น)</span></label>
            <PersonSelect
              users={assignableUsers.filter((u) => u.id !== me?.id)}
              value={form.assigneeId}
              disabled={!canManage}
              emptyLabel="— ตัวฉันเอง —"
              ariaLabel="มอบหมายให้"
              onChange={(assigneeId) => set({ assigneeId })}
            />
            {cannotAssign && (
              <div className="text-[11px] text-[var(--text-3)] mt-1">ตำแหน่งของคุณมอบหมายงานให้คนอื่นไม่ได้ — สร้างเป็นงานของตัวเองเท่านั้น</div>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-[var(--red)] bg-[var(--red-soft)] rounded p-2 mt-3" role="alert">{error}</div>}

        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={saving}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? "กำลังบันทึก..." : editing ? "บันทึก" : "เพิ่ม"}</button>
        </div>
      </form>
    </Modal>
  );
}
