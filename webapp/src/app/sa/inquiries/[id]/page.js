"use client";
// เธรดสอบถาม–ตอบกลับรายเรื่อง: ฝ่ายขายถาม ↔ ฝ่ายผู้ตอบ (RD) ตอบไป-มา
// ปิดเรื่องโดยฝั่งผู้ถามเสมอ (คนถามคือคนตัดสินว่าคำตอบใช้ได้จริง)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, ClipboardList, Hand, MessageCircleQuestion,
  BriefcaseBusiness, CalendarDays, CalendarClock, Edit2, FolderKanban, Paperclip,
  Plus, RotateCcw, Save, Send, Trash2, UserRound, X,
} from "lucide-react";
import SaWorkspace, { SaPageShell } from "@/components/salesPlanning/SaWorkspace";
import Modal from "@/components/Modal";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import InquiryRequestFields, { inquiryToRequestForm, isInquiryRequestComplete } from "@/components/salesPlanning/InquiryRequestFields";
import { inquiryDueTone } from "@/components/salesPlanning/inquiryUi";
import { cachedFetchJson } from "@/lib/apiCache";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DEPARTMENT_NAMES_TH } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";
import styles from "./page.module.css";

const TASK_STATUS_META = {
  Pending: { label: "รอ", color: "var(--text-3)" },
  "In Progress": { label: "กำลังทำ", color: "var(--accent)" },
  Completed: { label: "เสร็จแล้ว", color: "var(--green)" },
};

const INQUIRY_STATUS_META = {
  open: { label: "รอคำตอบ", color: "var(--amber)" },
  answered: { label: "ตอบแล้ว", color: "var(--blue)" },
  closed: { label: "ปิดเรื่อง", color: "var(--green)" },
};

const money = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export default function InquiryThreadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState([]);
  const [requestEdit, setRequestEdit] = useState(null);
  // รายการให้เลือกบริบท (ลูกค้า/โครงการ/ดีล) — โหลดตอนกดแก้ไขเท่านั้น
  const [lists, setLists] = useState({ customers: [], projects: [], deals: [] });
  // ฟอร์มวันที่จะตอบ: "take" = รับเรื่อง (บังคับระบุ), "move" = เลื่อนวันที่รับปากไว้
  const [dueForm, setDueForm] = useState(null);
  const [todayISO, setTodayISO] = useState(null);
  useEffect(() => {
    const d = new Date();
    setTodayISO(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/inquiries/${id}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "โหลดเรื่องสอบถามไม่สำเร็จ");
      setData(payload);
    } catch (e) {
      setError(e.message || "โหลดเรื่องสอบถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const due = useMemo(() => inquiryDueTone(data, todayISO), [data, todayISO]);
  const closed = data?.status === "closed";
  // ทุกคนในเธรด (ฝั่งถาม + ทุกคนในฝ่ายผู้ตอบ) พิมพ์ได้ตลอด ไม่ต้องรอรับเรื่อง/รอสลับตา
  // (มติผู้ใช้ 2026-07-16) — RD ที่ยังไม่รับเรื่อง ตอบแล้ว server รับเรื่องให้อัตโนมัติ
  const canCompose = data?.isAdmin || !!data?.side;

  const runAction = async (key, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "ทำรายการไม่สำเร็จ");
      await load();
      return true;
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
      return false; // caller เก็บฟอร์มไว้ให้ผู้ใช้แก้ต่อ ไม่ปิดทิ้งพร้อมข้อมูลที่พิมพ์
    } finally {
      setBusy("");
    }
  };

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    const valid = [];
    for (const file of picked) {
      if (file.size > MAX_UPLOAD_BYTES) { setError(`ไฟล์ ${file.name} ใหญ่เกิน ${MAX_UPLOAD_MB} MB`); continue; }
      valid.push(file);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 8));
  };

  const sendReply = async () => {
    if (!reply.trim() && !files.length) return;
    setBusy("reply");
    setError("");
    try {
      const attachments = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || `อัปโหลด ${f.name} ไม่สำเร็จ`);
        attachments.push({ fileUrl: payload.url, driveFileId: payload.driveFileId || null, fileName: f.name, mimeType: f.type, sizeBytes: f.size });
      }
      const res = await fetch(`/api/sales-planning/inquiries/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim(), attachments }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "ส่งข้อความไม่สำเร็จ");
      setReply("");
      setFiles([]);
      await load();
    } catch (e) {
      setError(e.message || "ส่งข้อความไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  // ฝ่ายผู้ตอบ: แตกคำถามเป็นงานของตัวเอง (personal_tasks + inquiryId ย้อนกลับ)
  const createTask = (message = null) => {
    const query = new URLSearchParams({ inquiryId: data.id, returnTo: `/sa/inquiries/${data.id}` });
    if (message?.id) query.set("messageId", message.id);
    router.push(`/sa/tasks?${query.toString()}`);
  };

  const messageAction = async (message, action, body = {}) => {
    setBusy(`${action}:${message.id}`);
    setError("");
    try {
      const res = await fetch(`/api/sales-planning/inquiries/${id}/messages/${message.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action, ...body }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "ทำรายการข้อความไม่สำเร็จ");
      await load();
    } catch (e) { setError(e.message || "ทำรายการข้อความไม่สำเร็จ"); }
    finally { setBusy(""); }
  };

  const editMessage = (message) => {
    const next = window.prompt("แก้ไขข้อความ", message.body || "");
    if (next == null || next.trim() === (message.body || "").trim()) return;
    messageAction(message, "edit", { body: next.trim() });
  };

  const openRequestEdit = () => {
    setRequestEdit(inquiryToRequestForm(data));
    const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    Promise.all([
      cachedFetchJson("/api/master/customers").catch(() => []),
      json("/api/pm/projects"),
      json("/api/sales-planning/deals"),
    ]).then(([customers, projects, deals]) => setLists({
      customers: Array.isArray(customers) ? customers : [],
      projects: Array.isArray(projects) ? projects : [],
      deals: Array.isArray(deals) ? deals : [],
    }));
  };

  const deleteInquiry = async () => {
    if (!window.confirm("ลบเรื่องสอบถามนี้? รายการนี้ย้อนกลับไม่ได้")) return;
    setBusy("delete-inquiry");
    const res = await fetch(`/api/sales-planning/inquiries/${id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setError(payload.error || "ลบเรื่องไม่สำเร็จ"); setBusy(""); return; }
    window.location.href = "/sa/inquiries";
  };

  if (loading) return <SaWorkspace icon={<MessageCircleQuestion size={22} />} title="สอบถาม RD"><div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด...</div></SaWorkspace>;
  if (!data) return (
    <SaWorkspace icon={<MessageCircleQuestion size={22} />} title="สอบถาม RD">
      <div className="glass-panel" role="alert" style={{ padding: 16, color: "var(--red)" }}>{error || "ไม่พบเรื่องสอบถาม"}</div>
    </SaWorkspace>
  );

  return (
    <SaPageShell>
      <div className={`flex flex-col gap-4 ${styles.page}`}>
        {/* แถบบนบาง ๆ แทนการ์ดหัวเดิม (ชื่อเรื่องซ้ำกับการ์ดภาพรวมด้านล่างอยู่แล้ว):
            ย้อนกลับซ้าย · แก้ไข/ลบ ขวา — btn-icon แพตเทิร์นเดียวกับหน้าดีล */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Link href="/sa/inquiries" className="btn ghost sm"><ArrowLeft size={14} aria-hidden="true" /> ย้อนกลับ</Link>
          <div style={{ display: "flex", gap: 6 }}>
            {data.canEditRequest && (
              <button type="button" className="btn-icon" onClick={openRequestEdit} disabled={!!busy} aria-label="แก้ไขคำถาม" title="แก้ไข">
                <Edit2 size={16} aria-hidden="true" />
              </button>
            )}
            {data.canDelete && (
              <button type="button" className="btn-icon danger" onClick={deleteInquiry} disabled={!!busy} aria-label="ลบเรื่องสอบถาม" title="ลบ">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        <SalesDetailOverview
          eyebrow={`RD INQUIRY · ${data.code || "ไม่ระบุเลขที่"}`}
          title={data.title}
          description={<><span>ถามโดย {data.requesterName || "-"}</span><span>สร้างเมื่อ {fmtDateTime(data.createdAt)}</span>{data.targetDept && <span>ส่งถึง {DEPARTMENT_NAMES_TH[data.targetDept] || data.targetDept}</span>}</>}
          badges={<><SalesStateBadge {...(INQUIRY_STATUS_META[data.status] || { label: data.status, color: "var(--text-3)" })} />{data.urgent && <SalesStateBadge label="ด่วน" color="var(--red)" />}</>}
          actions={<>
            {data.canTake && !closed && <button type="button" className="btn sm" onClick={() => setDueForm({ mode: "take", date: "" })} disabled={!!busy}><Hand size={13} /> รับเรื่องนี้</button>}
            {data.canEditCommitment && !closed && <button type="button" className="btn sm" onClick={() => setDueForm({ mode: "move", date: data.committedDueDate || "" })} disabled={!!busy}><CalendarDays size={13} /> เลื่อนวันที่ตอบ</button>}
            {data.canRespond && data.assigneeId === data.meId && <button type="button" className="btn sm" onClick={() => createTask()} disabled={!!busy}><Plus size={13} /> สร้างงาน</button>}
            {data.side && !closed && <button type="button" className="btn btn-primary sm" onClick={() => runAction("confirm-close", { action: "confirm-close" }, "ยืนยันปิดในส่วนของคุณ?")} disabled={!!busy || (data.side === "requester" ? !!data.requesterCloseConfirmedAt : !!data.responderCloseConfirmedAt)}><CheckCircle2 size={13} /> {data.side === "requester" ? (data.requesterCloseConfirmedAt ? "SA ยืนยันแล้ว" : "SA ยืนยันปิด") : (data.responderCloseConfirmedAt ? "RD ยืนยันแล้ว" : "RD ยืนยันปิด")}</button>}
            {(data.side || data.isAdmin) && closed && <button type="button" className="btn sm" onClick={() => runAction("reopen", { action: "reopen" })} disabled={!!busy}><RotateCcw size={13} /> เปิดเรื่องอีกครั้ง</button>}
          </>}
          facts={[
            { key: "owner", icon: UserRound, label: "ผู้รับเรื่อง", value: data.assigneeName || "ยังไม่มีผู้รับ" },
            { key: "requested", icon: CalendarDays, label: "SA คาดหวัง", value: data.requestedDueDate ? fmtDate(data.requestedDueDate) : "-" },
            { key: "commit", icon: CalendarClock, label: "RD จะตอบ", value: data.committedDueDate ? `${fmtDate(data.committedDueDate)}${due ? ` · ${due.label}` : ""}` : "ยังไม่รับเรื่อง" },
          ]}
        />

        <DetailPageLayout aside={<InquiryContext data={data} closed={closed} />}>

        {dueForm && (
          <DetailCard
            icon={CalendarClock}
            eyebrow="Response date"
            title={dueForm.mode === "take" ? "รับเรื่อง — ระบุวันที่จะตอบกลับ" : "เลื่อนวันที่จะตอบกลับ"}
          >
            <div className={styles.formStack}>
              <label style={{ fontSize: 13 }}>
                วันที่ RD จะตอบ <span style={{ color: "var(--red)" }}>*</span>
                <input className="premium-input" type="date" value={dueForm.date} min={todayISO || undefined}
                  onChange={(e) => setDueForm((v) => ({ ...v, date: e.target.value }))} />
              </label>
              <small style={{ color: "var(--text-3)" }}>
                {dueForm.mode === "take"
                  ? `วันที่นี้คือกำหนดตอบของเรื่องนี้ และเป็นเส้นวัด KPI${data.requestedDueDate ? ` — SA คาดหวัง ${fmtDate(data.requestedDueDate)}` : ""}`
                  : "การเลื่อนจะถูกบันทึกเป็นเหตุการณ์ในเธรดพร้อมวันเดิม"}
              </small>
              <div className="form-action-inline">
                <button className="btn ghost sm" onClick={() => setDueForm(null)} disabled={!!busy}>ยกเลิก</button>
                <button
                  className="btn btn-primary sm"
                  disabled={!!busy || !dueForm.date}
                  onClick={async () => {
                    const done = await runAction(dueForm.mode, dueForm.mode === "take"
                      ? { action: "take", committedDueDate: dueForm.date }
                      : { action: "set-commitment", committedDueDate: dueForm.date });
                    if (done) setDueForm(null);
                  }}
                >
                  <Save size={13} /> {dueForm.mode === "take" ? "รับเรื่องและยืนยันวันที่" : "บันทึกวันที่ใหม่"}
                </button>
              </div>
            </div>
          </DetailCard>
        )}

        {/* งานที่แตกจากคำถามนี้ (ฝั่ง RD) */}
        {!!(data.tasks || []).length && (
          <DetailCard icon={ClipboardList} eyebrow="Linked tasks" title="งานที่แตกจากคำถามนี้" meta={`${data.tasks.length} งาน`}>
            <ul className={styles.taskList}>
              {data.tasks.map((t) => {
                const meta = TASK_STATUS_META[t.status] || { label: t.status, color: "var(--text-3)" };
                return (
                  <li key={t.id}>
                    <span className="ui-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <Link href={`/pm/tasks/${t.id}`} className="linklike">{t.title}</Link>
                    {t.dueDate && <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>กำหนด {fmtDate(t.dueDate)}</span>}
                  </li>
                );
              })}
            </ul>
          </DetailCard>
        )}

        {/* เธรดข้อความ */}
        <section className={`glass-panel ${styles.thread}`} style={{ padding: 16 }}>
          <div className={styles.threadHead}><div><small>CONVERSATION</small><h2>การสนทนาและอัปเดต</h2></div><span>{(data.messages || []).filter((m) => m.kind !== "status").length} ข้อความ</span></div>
          <ul className={styles.messageList}>
            {(data.messages || []).map((m) => {
              if (m.kind === "status") {
                return (
                  <li key={m.id} style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
                    — {m.body} · {fmtDateTime(m.createdAt)} —
                  </li>
                );
              }
              const isTarget = m.authorDept === data.targetDept;
              const deptLabel = m.authorDept ? (DEPARTMENT_NAMES_TH[m.authorDept] || m.authorDept) : "";
              return (
                <li key={m.id} className={`${styles.message} ${isTarget ? styles.targetMessage : styles.requesterMessage}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{m.authorName || "-"}</strong>
                    {deptLabel && <span className="ui-badge" style={{ color: isTarget ? "var(--green)" : "var(--blue)" }}>{deptLabel}</span>}
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>{fmtDateTime(m.createdAt)}</span>
                    {m.editedAt && <span style={{ color: "var(--text-3)", fontSize: 11 }}>แก้ไขแล้ว</span>}
                    {m.acknowledgedAt && <span className="ui-badge" style={{ color: "var(--green)" }}>รับทราบแล้ว</span>}
                  </div>
                  {m.deletedAt ? <div style={{ margin: "4px 0", color: "var(--text-3)", fontStyle: "italic", fontSize: 13 }}>ข้อความถูกลบ</div>
                    : m.body && <div style={{ margin: "4px 0 2px", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{m.body}</div>}
                  {!!(m.attachments || []).length && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      {m.attachments.map((att, i) => (
                        <a key={i} className="btn ghost sm" href={`/api/sales-planning/inquiries/${id}/file?m=${m.id}&i=${i}`} target="_blank" rel="noreferrer" title={att.fileName || "ไฟล์แนบ"}>
                          <Paperclip size={12} aria-hidden="true" /> {att.fileName || `ไฟล์ ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                  {!m.deletedAt && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {m.canAcknowledge && <button className="btn ghost sm" onClick={() => messageAction(m, "acknowledge")} disabled={!!busy}><CheckCircle2 size={12} /> รับทราบ</button>}
                      {m.canEdit && <button className="btn ghost sm" onClick={() => editMessage(m)} disabled={!!busy}><Edit2 size={12} /> แก้ไข</button>}
                      {m.canDelete && <button className="btn ghost sm danger" onClick={() => window.confirm("ลบข้อความนี้?") && messageAction(m, "delete")} disabled={!!busy}><Trash2 size={12} /> ลบ</button>}
                      {canCompose && !closed && <button className="btn ghost sm" onClick={() => createTask(m)} disabled={!!busy}><Plus size={12} /> สร้างงาน</button>}
                      {(data.tasks || []).filter((t) => t.inquiryMessageId === m.id).map((t) => <Link key={t.id} href={`/pm/tasks/${t.id}`} className="ui-badge">งาน: {t.title}</Link>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* composer — ปิดเรื่องแล้วต้องเปิดใหม่ก่อนจึงคุยต่อได้ */}
          {!closed && canCompose ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", padding: "12px 18px 18px" }}>
              <textarea
                className="premium-input"
                rows={4}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="พิมพ์ข้อความ..."
                style={{ resize: "vertical", minHeight: 96 }}
              />
              {!!files.length && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                      <Paperclip size={13} aria-hidden="true" style={{ color: "var(--text-3)" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <button type="button" className="btn-icon danger" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="เอาไฟล์ออก">
                        <X size={13} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <label className="btn ghost sm" style={{ cursor: "pointer" }} title="แนบไฟล์">
                  <Paperclip size={13} aria-hidden="true" /> แนบไฟล์
                  <input type="file" accept={UPLOAD_ACCEPT_ATTR} multiple onChange={onPickFiles} style={{ display: "none" }} />
                </label>
                <button type="button" className="btn btn-primary sm" onClick={sendReply} disabled={busy === "reply" || (!reply.trim() && !files.length)}>
                  <Send size={13} aria-hidden="true" /> {busy === "reply" ? "กำลังส่ง..." : "ส่งข้อความ"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ borderTop: "1px solid var(--border)", padding: "14px 18px 18px", color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>
              {closed ? `เรื่องนี้ปิดแล้ว ${data.closedAt ? `· ${fmtDateTime(data.closedAt)}` : ""} — เปิดเรื่องอีกครั้งเพื่อคุยต่อ` : "เฉพาะผู้รับเรื่องหรือฝ่ายขายที่เกี่ยวข้องเท่านั้นที่ส่งข้อความได้"}
            </div>
          )}
        </section>
        </DetailPageLayout>
      </div>

      {/* โมดัลแก้ไขคำถาม — หน้าตา/ขนาดเดียวกับโมดัลสร้าง "สอบถาม RD" (มติผู้ใช้) */}
      <Modal open={!!requestEdit} onClose={() => !busy && setRequestEdit(null)} title="แก้ไขคำถาม" size="sm">
        {requestEdit && (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* ช่องกรอกชุดเดียวกับโมดัลสร้าง — ไม่มี "รายละเอียดคำถาม" เพราะตัวคำถามถูกเก็บ
                เป็นข้อความแรกของเธรด ไม่ใช่คอลัมน์ของเรื่อง (API edit-request ก็ไม่รับ)
                — แก้ตรงนี้เท่ากับแก้ประวัติการสนทนา ถ้าอยากเสริมให้ตอบกลับในเธรดแทน */}
            <InquiryRequestFields
              form={requestEdit}
              setForm={setRequestEdit}
              customers={lists.customers}
              projects={lists.projects}
              deals={lists.deals}
              disabled={!!busy}
            />
            <small style={{ color: "var(--text-3)" }}>แก้ไขบริบทได้ก่อน RD รับเรื่องเท่านั้น</small>
            <div className="form-action-inline">
              <button type="button" className="btn ghost sm" onClick={() => setRequestEdit(null)} disabled={!!busy}>ยกเลิก</button>
              <button type="button" className="btn btn-primary sm" disabled={!!busy || !isInquiryRequestComplete(requestEdit)}
                onClick={async () => { if (await runAction("edit-request", { action: "edit-request", ...requestEdit })) setRequestEdit(null); }}>
                <Save size={13} aria-hidden="true" /> บันทึก
              </button>
            </div>
          </div>
        )}
      </Modal>
    </SaPageShell>
  );
}

function InquiryContext({ data, closed }) {
  return <>
    {data.deal && <ContextCard
      icon={BriefcaseBusiness}
      href={`/sales-planning/deals/${data.deal.id}`}
      eyebrow="ดีลที่เกี่ยวข้อง"
      title={`${data.deal.code ? `${data.deal.code} · ` : ""}${data.deal.title}`}
      subtitle={data.deal.customerName || "ไม่ระบุลูกค้า"}
      badges={<>{data.deal.dealType && <span className="ui-badge">{data.deal.dealType}</span>}{data.deal.stage && <span className="ui-badge" style={{ color: "var(--accent)" }}>{data.deal.stage}</span>}</>}
      facts={[
        { label: "มูลค่าดีล", value: `${money(data.deal.stage === "won" ? (data.deal.wonValue ?? data.deal.projectValue) : data.deal.projectValue)} บาท` },
        { label: "โอกาส", value: data.deal.probability == null ? "-" : `${data.deal.probability}%` },
        { label: "คาดปิด", value: data.deal.expectedCloseDate ? fmtDate(data.deal.expectedCloseDate) : "-" },
        { label: "เจ้าของดีล", value: data.deal.ownerName || data.deal.team || "-" },
        { label: "สูตร/ผลิตภัณฑ์", value: data.deal.formulaName || "-" },
        { label: "Forecast", value: data.deal.forecastMonth || "-" },
      ]}
    />}
    {data.project && <ContextCard
      icon={FolderKanban}
      href={`/sa/projects/${data.project.id}`}
      eyebrow="โครงการที่เกี่ยวข้อง"
      title={`${data.project.code ? `${data.project.code} · ` : ""}${data.project.name}`}
      subtitle={data.project.customerName || data.project.productName || "ไม่ระบุลูกค้า"}
      badges={<>{data.project.type && <span className="ui-badge">{data.project.type}</span>}{data.project.status && <span className="ui-badge" style={{ color: "var(--green)" }}>{data.project.status}</span>}{data.project.urgency && <span className="ui-badge" style={{ color: data.project.urgency === "Do Now" ? "var(--red)" : "var(--text-3)" }}>{data.project.urgency}</span>}</>}
      facts={[
        { label: "เริ่มโครงการ", value: data.project.startDate ? fmtDate(data.project.startDate) : "-" },
        { label: "กำหนดเสร็จ", value: data.project.dueDate ? fmtDate(data.project.dueDate) : "-" },
        { label: "ผู้ดูแล AE", value: data.project.aeOwner || "-" },
        { label: "ทีม", value: data.project.team || "-" },
        { label: "สินค้า", value: data.project.productName || "-" },
        { label: "หมวด", value: [data.project.productMainCategory, data.project.productSubCategory].filter(Boolean).join(" · ") || "-" },
      ]}
    />}
    {!data.deal && !data.project && <ContextCard icon={FolderKanban} eyebrow="บริบทงาน" title="ยังไม่ได้ผูกดีลหรือโครงการ" subtitle="ผูกจากหน้าดีลหรือโครงการเพื่อให้ RD เห็นข้อมูลประกอบคำถาม" />}
    <DetailCard icon={CheckCircle2} eyebrow="Bilateral close" title="การยืนยันปิดเรื่อง">
      <div className={styles.closeState}><p><span>SA</span><strong>{data.requesterCloseConfirmedAt ? "ยืนยันแล้ว" : "รอยืนยัน"}</strong></p><p><span>RD</span><strong>{data.responderCloseConfirmedAt ? "ยืนยันแล้ว" : "รอยืนยัน"}</strong></p></div>
      <div className={styles.closeHint}>{closed ? `ปิดเรื่องแล้ว${data.closedAt ? ` · ${fmtDateTime(data.closedAt)}` : ""}` : "เรื่องจะปิดจริงเมื่อทั้ง SA และ RD ยืนยันครบ"}</div>
    </DetailCard>
  </>;
}
