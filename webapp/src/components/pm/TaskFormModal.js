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
import { Flame, Star, Tag, UserPlus, X } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import StageSteps from "@/components/ui/StageSteps";
import Select from "@/components/ui/Select";
import DealPicker from "@/components/pm/DealPicker";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import PendingFiles from "@/components/ui/PendingFiles";
import { DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, PERSONAL_TASK_STATUSES, TASK_CATEGORIES, TASK_STATUS_BLOCKED, TASK_STATUS_TH, taskProgressPct } from "@/lib/pm/tasks";
import { resolvePersonalTaskLink } from "@/lib/pm/taskLink";
import { requiresDealLink } from "@/lib/pm/taskDealScope";
import PersonSelect from "@/components/ui/PersonSelect";
import { uploadFileForEntity } from "@/lib/master/uploadFile";
import Textarea from "@/components/ui/Textarea";

export const TASK_BLANK = {
  title: "", note: "", startDate: "", dueDate: "",
  projectId: "", dealId: "", assigneeId: "",
  category: "", important: false, urgent: false, difficulty: 2,
  status: "Pending", blockedReason: "", predecessorId: "",
};

// แถบขั้นของสถานะ — เรียงตามลำดับที่งานเดินจริง (ดู PERSONAL_TASK_STATUSES)
export const STATUS_OPTIONS = PERSONAL_TASK_STATUSES.map((value) => [value, TASK_STATUS_TH[value]]);

// สีป้าย "ต่อจากงาน" — ค่าคงที่ระดับโมดูล (ไม่ใช่ inline object ใหม่ทุก render)
const CHAIN_BADGE = { color: "var(--purple)" };

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
  blockedReason: t.blockedReason || "", predecessorId: t.predecessorId || "",
});

async function uploadTaskAttachment(taskId, file) {
  // ไบต์ขึ้น Drive ตรงจากเบราว์เซอร์ — ไม่ผ่าน function จึงไม่ติดเพดาน 4.5 MB
  try {
    return await uploadFileForEntity({ file, entityType: "personal_task", entityId: taskId });
  } catch (err) {
    throw new Error(err?.message || `อัปโหลด ${file.name} ไม่สำเร็จ`);
  }
}

export default function TaskFormModal({
  open,
  onClose,
  task = null,               // null = สร้างใหม่
  initialForm = null,        // ค่าตั้งต้นตอนสร้าง (เช่น preset ดีล / มาจากเรื่องสอบถาม)
  inquirySource = null,      // { inquiryId, code, messageId?, returnTo? }
  chainSource = null,        // { id, title } — งานก่อนหน้าตอนกด "สร้างงานต่อเนื่อง"
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
  /* ⭐ "ไม่ผูกดีล" — ทางออกที่ **ต้องกดเอง** (มติผู้ใช้ 2026-08-08 ผ่อนมติ 2026-08-06)
     ค่าตั้งต้นคือ *ผูกดีล* เสมอ (false) เพราะเหตุผลเดิมยังจริง: งานที่ไม่ผูกดีล
     หน้าดีล/หน้าโครงการมองไม่เห็น และ KPI รายดีลนับไม่ครบ — แต่เดิมบังคับ 100%
     ทำให้งานที่ไม่ได้เกิดจากดีลจริง ๆ (งานดูแลระบบ/งานภายใน) ต้องยัดดีลมั่ว ๆ
     ⇒ เปิดทางออกไว้แต่ให้เห็นชัดว่าเลือกเอง ไม่ใช่ลืมเลือก
     งานเก่าที่ไม่มีดีล (ก่อนกติกา 2026-08-06) เปิดมาแล้วสวิตช์ติดเอง — ไม่งั้น
     แค่แก้ชื่องานก็โดนด่านตีกลับ */
  const [noDealLink, setNoDealLink] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // เติมฟอร์มตอนเปิด. ผูกกับ task.id (ไม่ใช่ object) — caller หลายที่สร้าง object
  // ใหม่ทุก render จะทำให้ทับสิ่งที่พิมพ์ค้างไว้
  useEffect(() => {
    if (!open) return;
    setForm(task ? taskToForm(task) : { ...TASK_BLANK, ...(initialForm || {}) });
    setNoDealLink(!!task && !task.dealId && !task.inquiryId);
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
  const dealRequired = canManage && !inquirySource && !noDealLink && requiresDealLink(me);
  // ช่องดีลซ่อนได้เมื่อไม่บังคับ ไม่มีดีลให้เลือก และงานนี้ยังไม่ได้ผูกอะไรไว้
  const showDealLink = dealRequired || deals.length > 0 || !!form.dealId;

  // งานที่ผูกดีลนอกขอบเขตของคนที่เปิดฟอร์ม (ทีมอื่น) — ยัดดีลใบนั้นเข้าไปในลิสต์เอง
  // ไม่งั้นช่องจะโชว์ "— เลือกดีล —" ทั้งที่งานผูกดีลอยู่ = อ่านว่ายังไม่ได้ผูก
  const pickerDeals = form.dealId && !deals.some((d) => d.id === form.dealId)
    ? [{ id: form.dealId, title: task?.deal?.title || "ดีลที่ผูกไว้", customerName: task?.deal?.customerName || "", projectId: task?.projectId || null }, ...deals]
    : deals;

  // ดีลที่เลือกอยู่ — ใช้บอกว่างานนี้จะไปโผล่ในโครงการไหน (หรือไม่โผล่เลย)
  const pickedDeal = form.dealId ? pickerDeals.find((d) => d.id === form.dealId) : null;
  const pickedProject = pickedDeal?.projectId ? projects.find((p) => p.id === pickedDeal.projectId) : null;

  // ปิดงานที่ "เลยกำหนด" → ต้องระบุสาเหตุ (กรอกในฟอร์ม ไม่ใช่ป๊อปอัปซ้อน)
  const willComplete = editing && form.status === "Completed" && task.status !== "Completed";
  const needLateReason = willComplete && !!form.dueDate && form.dueDate < todayLocal();
  /* เลือก "รอคนอื่น" → ต้องบอกว่ารออะไร (ด่านเดียวกับฝั่ง API)
     ยกเว้นงานที่ต่อจากงานอื่นซึ่งยังไม่เสร็จ — เหตุผลของมันคือ "รองาน X ให้เสร็จก่อน"
     ที่ระบบเขียนให้เอง คนกรอกไม่ต้องพิมพ์ซ้ำ */
  const isBlocked = form.status === TASK_STATUS_BLOCKED;
  const needBlockedReason = isBlocked && !chainSource;

  // เรียกได้ทั้งจาก onSubmit ของฟอร์ม (กด Enter) และจากปุ่มในแถบท้ายโมดัล
  // ซึ่งอยู่นอก <form> — ปุ่มนั้นส่ง event ที่ไม่มี preventDefault ก็ยังทำงานได้
  const submit = async (e) => {
    e?.preventDefault?.();
    setError("");
    if (canManage && !form.title.trim()) { setError("ต้องระบุชื่องาน"); return; }
    if (dealRequired && !form.dealId) { setError("ต้องผูกดีล — เลือกโครงการแล้วเลือกดีลก่อนบันทึก"); return; }
    if (needLateReason && !lateReason.trim()) { setError("ต้องระบุสาเหตุที่ทำเสร็จช้าก่อนปิดงาน"); return; }
    if (needBlockedReason && !(form.blockedReason || "").trim()) { setError("งานที่รอคนอื่น ต้องระบุว่ารออะไร/รอใคร"); return; }

    setSaving(true);
    try {
      // ไม่มีสิทธิ์เต็ม = ส่งแค่ status (API บังคับ statusOnly — ส่งฟิลด์อื่นปนไปจะโดน 403)
      let payload;
      if (!canManage) {
        // แก้ได้แค่สถานะ = ส่ง blockedReason ไปด้วยได้ (API นับเป็นชุดเดียวกับ status)
        payload = { status: form.status, ...(isBlocked ? { blockedReason: (form.blockedReason || "").trim() } : {}) };
      } else {
        const { projectId, dealId } = resolvePersonalTaskLink(form, deals);
        payload = {
          title: form.title, note: form.note,
          startDate: form.startDate || null, dueDate: form.dueDate || null,
          projectId: noDealLink ? null : projectId,
          dealId: noDealLink ? null : dealId,
          // ธง "ตั้งใจไม่ผูกดีล" — ด่านฝั่ง server ปล่อยผ่านเฉพาะเมื่อมีธงนี้
          // (ค่าตั้งต้นยังเป็น "ผูก" เสมอ — ดูคอมเมนต์ที่ state)
          ...(noDealLink ? { noDealLink: true } : {}),
          assigneeId: form.assigneeId || null,
          category: form.category || null,
          important: !!form.important, urgent: !!form.urgent,
          difficulty: form.difficulty,
          ...(editing ? { status: form.status } : {}),
          ...(isBlocked ? { blockedReason: (form.blockedReason || "").trim() } : {}),
          // งานต่อเนื่อง: ผูกได้ตอนสร้างเท่านั้น (mig 0266) — ปลด/ย้ายสายทำที่หน้ารายละเอียด
          ...(editing || !form.predecessorId ? {} : { predecessorId: form.predecessorId }),
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
    <Modal
      open={open}
      onClose={() => !saving && onClose?.()}
      title={editing ? "แก้ไขงาน" : "เพิ่มงาน"}
      /* บริบทต้นทางอยู่ในหัวที่นิ่ง ไม่จมไปกับฟอร์มตอนเลื่อน (โครงสามชั้น)
         เดิมเป็นการ์ด glass-panel ในเนื้อหา — ภาษากระจกถูกตัดไปแล้วใน v2 */
      subtitle={inquirySource ? (
        <>
          สร้างจากคำร้อง <strong>{inquirySource.code}</strong>{inquirySource.messageId ? " · ผูกกับข้อความต้นทาง" : ""}
          {" — ระบบจะล็อกข้อความฝั่งตรงข้ามเมื่อบันทึกงานสำเร็จ"}
        </>
      ) : null}
      size="md"
      footer={(
        <>
          <Button variant="quiet" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button tone="primary" onClick={submit} disabled={saving}>
            {saving ? "กำลังบันทึก..." : editing ? "บันทึก" : "เพิ่ม"}
          </Button>
        </>
      )}
    >
      <form onSubmit={submit}>
        <div className="grid gap-[14px]">
          {editing && !canManage && (
            <div className="ui-badge text-[var(--text-3)]">แก้ได้เฉพาะสถานะ — ช่องอื่นเป็นของผู้ดูแลงาน</div>
          )}

          <div className="form-group">
            <label>ชื่องาน <span className="text-[var(--red)]">*</span></label>
            <input value={form.title} onChange={(e) => set({ title: e.target.value })} required={canManage} disabled={!canManage} className="premium-input w-full" placeholder="เช่น โทรตามลูกค้า, เตรียมเอกสาร" />
          </div>

          {/* สถานะ = 3 ขั้นมีลำดับ ⇒ แถบขั้น ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล
              docs/form-design-rules.md §3) · ตัวเลขใต้ขั้นคือ % ที่ระบบคิดให้จาก
              สถานะ (`taskProgressPct` — ตัวเดียวกับที่ไปโผล่บนความคืบหน้าโครงการ)
              ⇒ เห็นผลของการเลือกก่อนกด แบบเดียวกับ FC% ใต้ขั้นของดีล */}
          {editing && (
            <div className="form-group">
              <label>สถานะ</label>
              <StageSteps
                value={form.status}
                onChange={(status) => set({ status })}
                disabled={!canChangeStatus}
                ariaLabel="สถานะงาน"
                steps={STATUS_OPTIONS.map(([value, label]) => ({
                  value,
                  label,
                  sub: `${taskProgressPct(value)}%`,
                  tone: value === "Completed" ? "win" : undefined,
                }))}
              />
            </div>
          )}

          {/* งานต่อเนื่อง (mig 0266) — บอกให้ชัดว่าใบนี้ต่อจากใบไหน และจะถูกล็อกไว้ก่อน
              ถ้าใบก่อนหน้ายังไม่ปิด (ระบบปลดให้เองตอนใบนั้นเสร็จ) */}
          {!editing && chainSource && (
            <div className="form-group">
              <label>งานก่อนหน้า</label>
              <div className="ui-badge" style={CHAIN_BADGE}>ต่อจาก “{chainSource.title}”</div>
              <div className="text-[11px] text-[var(--text-3)] mt-1">
                ถ้างานก่อนหน้ายังไม่เสร็จ งานนี้จะเริ่มที่สถานะ “รอคนอื่น” และปลดล็อกอัตโนมัติเมื่อใบนั้นถูกปิด
              </div>
            </div>
          )}

          {isBlocked && (
            <div className="form-group">
              <label className={needBlockedReason ? "text-[var(--purple)]" : undefined}>
                รออะไร/รอใครอยู่ {needBlockedReason && <span className="text-[var(--red)]">*</span>}
              </label>
              <Textarea className="w-full" rows={2} value={form.blockedReason || ""}
                onChange={(e) => set({ blockedReason: e.target.value })}
                placeholder="เช่น รอลูกค้ายืนยันกลิ่น / รอฝ่ายผลิตตอบราคา / รอเอกสารจากบัญชี..." />
              <div className="text-[11px] text-[var(--text-3)] mt-1">
                กำหนดเสร็จยังเดินต่อตามเดิม — งานจะถูกแยกออกจากยอด “ต้องรีบ” และขึ้นสีม่วงแทน
              </div>
            </div>
          )}

          {needLateReason && (
            <div className="form-group">
              <label className="text-[var(--amber)]">สาเหตุที่ทำเสร็จช้า (งานเลยกำหนด — จำเป็น)</label>
              <Textarea className="w-full" rows={2} value={lateReason} autoFocus
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="เช่น รออนุมัติจากลูกค้า / รอวัตถุดิบ / ปรับแก้ตามฟีดแบ็ก..." />
            </div>
          )}

          {/* ── ลำดับของฟอร์ม (docs/form-design-rules.md §1) ──────────────────
              ชื่องาน (อะไร) → สถานะ (ตอนนี้ถึงไหน) → ผูกดีล (งานนี้ของใคร/ไปโผล่ที่ไหน
              — ช่องบังคับ จึงห้ามซ่อนท้ายฟอร์มให้คนกรอกจนจบแล้วค่อยเจอด่าน) →
              วันที่ → ลักษณะงาน (หมวด/ธง/ความยาก) → รายละเอียด → มอบหมายให้ (ท้ายสุด
              ตามกติกา "ความรับผิดชอบอยู่ท้าย" เหมือนช่อง AE ของฟอร์มดีล) */}
          {/* ผูกดีล — ไม่มีตัวสลับ "ไม่ผูก/ดีล" อีกแล้ว (มติผู้ใช้ 2026-08-05) และ
              ตั้งแต่ 2026-08-06 บังคับผูกดีล**ทุกฝ่าย** ไม่ใช่เฉพาะฝ่ายขาย —
              ช่อง "ไม่ผูกดีล" จึงเหลือไว้ให้เฉพาะกรณีที่ไม่ถูกบังคับ (superuser/จากคำร้อง) */}
          {showDealLink && (
            <div className="form-group">
              <label className="flex items-center justify-between gap-2">
                <span>ผูกกับดีล {dealRequired && <span className="text-[var(--red)]">*</span>}</span>
                {/* ทางออกที่ต้องกดเอง — ค่าตั้งต้นคือผูกดีล (สวิตช์ปิด) */}
                {canManage && !inquirySource && (
                  <button type="button" className="ui-switch" data-on={noDealLink ? "1" : undefined}
                    aria-pressed={noDealLink}
                    onClick={() => { setNoDealLink((on) => !on); if (!noDealLink) set({ dealId: "" }); }}>
                    <i aria-hidden="true" />ไม่ผูกดีล
                  </button>
                )}
              </label>
              {/* ช่องเดียวจบ — แผงสองชั้นข้างใน (โครงการ | ดีล) ค้นได้ทั้งสองฝั่ง
                  โครงการไม่ใช่ช่องที่ต้องกรอก เพราะโครงการของงาน mirror จากดีลเสมอ */}
              <DealPicker
                deals={pickerDeals}
                projects={projects}
                value={form.dealId}
                onChange={(v) => set({ dealId: v })}
                disabled={!!inquirySource || !canManage || noDealLink}
                clearable={!dealRequired}
                ariaLabel="ดีลที่ผูกกับงาน" />
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
              {dealRequired && !form.dealId && !!deals.length && <div className="text-[11px] text-[var(--text-3)] mt-1">ค่าตั้งต้นคือผูกดีล — งานที่ไม่ผูก ดีลกับโครงการจะมองไม่เห็นว่ามีงานนี้ค้างอยู่ และ KPI รายดีลนับไม่ครบ</div>}
              {/* เลือก "ไม่ผูกดีล" เอง = ต้องรู้ว่าแลกอะไรไป — เตือนตรงจุดที่เพิ่งกด */}
              {noDealLink && <div className="text-[11px] text-[var(--amber)] mt-1">งานนี้จะไม่โผล่ในหน้าดีลและหน้าโครงการ และไม่ถูกนับใน KPI รายดีล</div>}
            </div>
          )}

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
              <label><Tag size={12} className="inline align-[-1px]" /> หมวดหมู่</label>
              <Select fullWidth value={form.category} disabled={!canManage} onChange={(e) => set({ category: e.target.value })}>
                <option value="">— ไม่ระบุ —</option>
                {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="form-group">
              <label>ธงของงาน</label>
              <div className="flex flex-wrap gap-[14px] min-h-[var(--ctl-h)] items-center">
                <button type="button" className="ui-switch" disabled={!canManage}
                  data-on={form.important ? "1" : undefined} aria-pressed={form.important}
                  onClick={() => set({ important: !form.important })}>
                  <i aria-hidden="true" /><Star size={13} /> สำคัญ
                </button>
                <button type="button" className="ui-switch" disabled={!canManage}
                  data-on={form.urgent ? "1" : undefined} aria-pressed={form.urgent}
                  onClick={() => set({ urgent: !form.urgent })}>
                  <i aria-hidden="true" /><Flame size={13} /> ด่วน
                </button>
              </div>
            </div>
          </div>

            <div className="form-group">
              <label>ระดับความยาก</label>
              <StageSteps
                value={String(form.difficulty)}
                onChange={(v) => set({ difficulty: Number(v) })}
                disabled={!canManage}
                ariaLabel="ระดับความยาก"
                steps={DIFFICULTY_OPTIONS.map((d) => ({
                  value: String(d),
                  label: DIFFICULTY_LABELS[d],
                  sub: `ระดับ ${d}`,
                }))}
              />
            </div>

          <div className="form-group">
            <label>รายละเอียด</label>
            <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} disabled={!canManage} className="w-full" rows={2} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
            {editing ? (
              <AttachmentsPanel entityType="personal_task" entityId={task.id} canEdit={canManage} inlineUpload />
            ) : (
              // ⭐ ตะกร้าไฟล์รอใช้ `ui/PendingFiles` ของกลาง (2026-08-09) — ฟอร์มสร้าง
              // ทุกที่ในระบบต้องหน้าตาเดียวกันตอนถือไฟล์ที่ยังอัปไม่ได้ · เดิมที่นี่กับ
              // ฟอร์มคำร้องเขียนคนละชุด ⇒ สองทรงของเรื่องเดียวกัน
              <PendingFiles
                files={pendingFiles}
                onChange={setPendingFiles}
                disabled={saving}
                onOversize={setError}
              />
            )}
          </div>
          <div className="form-group">
            <label><UserPlus size={12} className="inline align-[-1px]" /> มอบหมายให้ <span className="text-[11px] text-[var(--text-3)] font-normal">(งานจะไปอยู่ในรายการงานของคนนั้น)</span></label>
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

      </form>
    </Modal>
  );
}
