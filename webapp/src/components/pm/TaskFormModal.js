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
import SearchableSelect from "@/components/ui/SearchableSelect";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, TASK_CATEGORIES } from "@/lib/pm/tasks";
import { resolvePersonalTaskLink } from "@/lib/pm/taskLink";
import { requiresDealLink } from "@/lib/pm/taskDealScope";
import PersonSelect from "@/components/ui/PersonSelect";
import { describeResponseError } from "@/lib/fetchError";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";
import Textarea from "@/components/ui/Textarea";

export const TASK_BLANK = {
  title: "", note: "", startDate: "", dueDate: "",
  projectId: "", dealId: "", assigneeId: "",
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

// ช่องเลือกดีลเป็นเมนูเดียว (มติผู้ใช้ 2026-08-06) — ไม่มีช่อง "โครงการ" ให้กรองก่อน
// อีกแล้ว จึงไม่ต้องเดาว่าดีลเดิมของงานอยู่โครงการไหนเพื่อให้มันโผล่ใน dropdown
export const taskToForm = (t) => ({
  title: t.title || "", note: t.note || "",
  startDate: t.startDate || "", dueDate: t.dueDate || "",
  projectId: t.projectId || "", dealId: t.dealId || "", assigneeId: t.assigneeId || "",
  category: t.category || "", important: !!t.important, urgent: !!t.urgent,
  difficulty: t.difficulty ?? 2, status: t.status || "Pending",
});

async function uploadTaskAttachment(taskId, file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("customerName", `personal_task-${taskId}`);
  fd.append("entityType", "personal_task");
  fd.append("entityId", taskId);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  // ต้องเช็ก ok ก่อนอ่าน body: คำขอที่ตายก่อนถึง handler ตอบเป็น HTML ไม่ใช่ JSON
  if (!res.ok) throw new Error(await describeResponseError(res, `อัปโหลด ${file.name} ไม่สำเร็จ`));
  return res.json();
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
    setForm(task ? taskToForm(task) : { ...TASK_BLANK, ...(initialForm || {}) });
    setLateReason("");
    setPendingFiles([]);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // ทุกงานต้องผูกดีล ทุก role ไม่มีข้อยกเว้น (มติผู้ใช้ 2026-08-06) — กติกาเดียวกับ
  // API (requiresDealLink). ยกเว้นทางเดียวคืองานที่สร้างจากคำร้อง: ดีลมาจากคำร้อง
  // ต้นทาง (บางหัวข้อไม่ผูกดีลโดยเจตนา เช่น ขอราคา F/FB) ผู้ใช้เลือกเองไม่ได้อยู่แล้ว
  // ⚠️ `me` ต้องมาจริงเสมอ — `requiresDealLink(null)` = false แปลว่าหน้าไหนลืมส่ง me
  //    ช่องดีลจะไม่ถูกบังคับเงียบ ๆ (API ยังกันให้อยู่ แต่ผู้ใช้จะเจอ error ตอนกดบันทึก)
  const dealRequired = canManage && !inquirySource && requiresDealLink(me);
  // ช่องดีลซ่อนได้เมื่อไม่บังคับ ไม่มีดีลให้เลือก และงานนี้ยังไม่ได้ผูกอะไรไว้
  const showDealLink = dealRequired || deals.length > 0 || !!form.dealId;

  // ── เมนูเดียว: เลือก "ดีล" ตรง ๆ โดยมีโครงการเป็นหัวกลุ่ม (มติผู้ใช้ 2026-08-06) ──
  // เดิมเป็นสองช่อง (เลือกโครงการก่อน → ค่อยเลือกดีล) ซึ่งบังคับให้ต้องรู้ก่อนว่าดีล
  // อยู่โครงการไหน ทั้งที่โครงการของงาน mirror มาจากดีลอยู่แล้ว ช่องโครงการจึงเป็นแค่
  // ตัวกรอง ไม่ใช่ข้อมูลที่ผู้ใช้ต้องกรอก — ยุบเหลือช่องเดียวแล้วค้นทีเดียวจบ
  // (หัวกลุ่มยังบอกได้ว่าดีลใบนั้นอยู่โครงการไหน และ SearchableSelect ตัดหัวกลุ่มที่
  //  ไม่เหลือลูกให้เองตอนพิมพ์ค้น)
  const dealsByProject = new Map();
  for (const deal of deals) {
    const key = deal.projectId || "";
    if (!dealsByProject.has(key)) dealsByProject.set(key, []);
    dealsByProject.get(key).push(deal);
  }
  const projectLabel = (id) => {
    const p = projects.find((row) => row.id === id);
    if (!p) return "โครงการอื่น";
    return `${p.code ? `${p.code} · ` : ""}${p.name}`;
  };
  // โครงการเรียงตามป้ายที่คนเห็นจริง (รหัส PJ- นำหน้า) · ถังดีลที่ยังไม่ผูกโครงการไว้ท้ายสุด
  const groupKeys = [...dealsByProject.keys()]
    .filter(Boolean)
    .sort((a, b) => projectLabel(a).localeCompare(projectLabel(b), "th"));
  if (dealsByProject.has("")) groupKeys.push("");

  const dealRow = (deal) => ({
    value: deal.id,
    // เดือนคาดการณ์ต่อท้ายเสมอ (มติผู้ใช้ 2026-08-06) — ชื่อดีลซ้ำกันได้จริง
    // (ลูกค้าเดิมสั่งซ้ำทุกไตรมาส) เดือน FC คือสิ่งเดียวที่แยกออกจากกันได้ในบรรทัดเดียว
    label: `${deal.title}${deal.customerName ? ` — ${deal.customerName}` : ""} · FC ${deal.forecastMonth || "ไม่ระบุ"}`,
    // ค้นด้วยรหัส/ชื่อโครงการได้ด้วย — หัวกลุ่มไม่ถูกกรองตามคำค้น ถ้าไม่ใส่ไว้ในลูก
    // การพิมพ์รหัสโครงการจะไม่เจออะไรเลย ทั้งที่ตาเห็นกลุ่มนั้นอยู่ตรงหน้า
    search: `${deal.code || ""} ${deal.title || ""} ${deal.customerName || ""} ${deal.forecastMonth || ""} ${deal.projectId ? projectLabel(deal.projectId) : "ยังไม่ผูกโครงการ"}`,
  });

  const dealOptions = [
    // ปล่อยว่าง = ไม่ผูกดีล — เหลือไว้เฉพาะคนที่ไม่ถูกบังคับ (งานจากคำร้อง) ให้ถอนดีล
    // ออกได้ · คนที่ถูกบังคับต้องไม่เห็นตัวเลือกที่เลือกแล้วโดน API ตีกลับ
    ...(dealRequired ? [] : [{ value: "", label: "— ไม่ผูกดีล —", search: "" }]),
    // งานที่ผูกดีลนอกขอบเขตของคนที่เปิดฟอร์ม (ทีมอื่น) — ต้องมีแถวให้ค่าที่เลือกอยู่
    // เกาะ ไม่งั้นช่องจะโชว์ "— เลือกดีล —" ทั้งที่งานผูกดีลอยู่ = อ่านว่ายังไม่ได้ผูก
    ...(form.dealId && !deals.some((d) => d.id === form.dealId)
      ? [{ value: form.dealId, label: `${task?.deal?.title || "ดีลที่ผูกไว้"} (อยู่นอกรายการที่คุณเลือกได้)`, search: "" }]
      : []),
    ...groupKeys.flatMap((key) => [
      { group: true, value: `__group_${key || "none"}`, label: key ? projectLabel(key) : "ยังไม่ผูกโครงการ" },
      ...dealsByProject.get(key).map(dealRow),
    ]),
  ];

  // ดีลที่เลือกอยู่ — ใช้บอกว่างานนี้จะไปโผล่ในโครงการไหน (หรือไม่โผล่เลย)
  const pickedDeal = form.dealId ? deals.find((d) => d.id === form.dealId) : null;
  const pickedProject = pickedDeal?.projectId ? projects.find((p) => p.id === pickedDeal.projectId) : null;

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
    if (dealRequired && !form.dealId) { setError("ต้องผูกดีล — เลือกโครงการแล้วเลือกดีลก่อนบันทึก"); return; }
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
            <div className="glass-panel" style={{ padding: "10px 12px", fontSize: "var(--fs-6)", color: "var(--text-2)" }}>
              สร้างจากคำร้อง <strong>{inquirySource.code}</strong>{inquirySource.messageId ? " · ผูกกับข้อความต้นทาง" : ""}
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
              <Textarea className="w-full" rows={2} value={lateReason} autoFocus
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="เช่น รออนุมัติจากลูกค้า / รอวัตถุดิบ / ปรับแก้ตามฟีดแบ็ก..." />
            </div>
          )}

          <div className="form-group">
            <label>รายละเอียด</label>
            <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} disabled={!canManage} className="w-full" rows={2} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
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

          {/* ผูกดีล — ไม่มีตัวสลับ "ไม่ผูก/ดีล" อีกแล้ว (มติผู้ใช้ 2026-08-05) และ
              ตั้งแต่ 2026-08-06 บังคับผูกดีล**ทุกฝ่าย** ไม่ใช่เฉพาะฝ่ายขาย —
              ช่อง "ไม่ผูกดีล" จึงเหลือไว้ให้เฉพาะกรณีที่ไม่ถูกบังคับ (superuser/จากคำร้อง) */}
          {showDealLink && (
            <div className="form-group">
              <label>ผูกกับดีล {dealRequired && <span className="text-[var(--red)]">*</span>}</label>
              {/* ช่องเดียวจบ — โครงการเป็นหัวกลุ่มในเมนู ไม่ใช่ช่องที่ต้องเลือกก่อน
                  (โครงการของงาน mirror จากดีลเสมอ จึงไม่เคยเป็นข้อมูลที่ต้องกรอก) */}
              <SearchableSelect className="w-full" entity="deal" ariaLabel="ดีลที่ผูกกับงาน"
                disabled={!!inquirySource || !canManage} value={form.dealId}
                onChange={(v) => set({ dealId: v })}
                options={dealOptions}
                placeholder="— เลือกดีล —"
                searchPlaceholder="ค้นหาชื่อดีล / ลูกค้า / รหัสโครงการ…"
                emptyText="ไม่พบดีลที่ตรงกับคำค้น" />
              {/* บอกปลายทางของงานหลังเลือกดีล — โครงการ mirror จากดีลเสมอ ผู้ใช้จึงควรเห็น
                  ตั้งแต่ตอนกรอกว่างานจะไปโผล่ที่ไหน (หรือไม่โผล่ในโครงการไหนเลย) */}
              {pickedDeal && (
                <div className="text-[11px] text-[var(--text-3)] mt-1">
                  {!pickedDeal.projectId
                    ? "ดีลนี้ยังไม่ผูกโครงการ — งานจะอยู่กับดีลอย่างเดียว ยังไม่ขึ้นในหน้าโครงการ"
                    : `งานนี้จะอยู่ในโครงการ ${pickedProject ? `${pickedProject.code ? `${pickedProject.code} · ` : ""}${pickedProject.name}` : "ที่ผูกกับดีลนี้"}`}
                </div>
              )}
              {inquirySource && <div className="text-[11px] text-[var(--text-3)] mt-1">ดีลมาจากคำร้องต้นทาง — แก้ที่นี่ไม่ได้</div>}
              {!deals.length && !inquirySource && <div className="text-[11px] text-[var(--text-3)] mt-1">ไม่พบดีลในทีมของคุณที่สามารถผูกกับงานได้</div>}
              {dealRequired && !form.dealId && !!deals.length && <div className="text-[11px] text-[var(--text-3)] mt-1">ทุกงานต้องผูกดีล — งานที่ไม่ผูก ดีลกับโครงการจะมองไม่เห็นว่ามีงานนี้ค้างอยู่</div>}
            </div>
          )}

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
