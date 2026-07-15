"use client";
// เธรดสอบถาม–ตอบกลับรายเรื่อง: ฝ่ายขายถาม ↔ ฝ่ายผู้ตอบ (RD) ตอบไป-มา
// ปิดเรื่องโดยฝั่งผู้ถามเสมอ (คนถามคือคนตัดสินว่าคำตอบใช้ได้จริง)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, ClipboardList, Hand, MessageCircleQuestion,
  CalendarDays, Edit2, Paperclip, Plus, RotateCcw, Save, Send, Trash2, X,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { InquiryStatusBadge, inquiryDueTone } from "@/components/salesPlanning/inquiryUi";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DEPARTMENT_NAMES_TH } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

const TASK_STATUS_META = {
  Pending: { label: "รอ", color: "var(--text-3)" },
  "In Progress": { label: "กำลังทำ", color: "var(--accent)" },
  Completed: { label: "เสร็จแล้ว", color: "var(--green)" },
};

export default function InquiryThreadPage() {
  const params = useParams();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState([]);
  const [requestEdit, setRequestEdit] = useState(null);
  const [responderDetail, setResponderDetail] = useState("");
  const [committedDueDate, setCommittedDueDate] = useState("");
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
      setResponderDetail(payload.responderDetail || "");
      setCommittedDueDate(payload.committedDueDate || "");
    } catch (e) {
      setError(e.message || "โหลดเรื่องสอบถามไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const due = useMemo(() => inquiryDueTone(data, todayISO), [data, todayISO]);
  const closed = data?.status === "closed";
  const canCompose = data?.isAdmin || data?.side === "requester"
    || (data?.side === "responder" && data?.assigneeId === data?.meId);

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
    } catch (e) {
      setError(e.message || "ทำรายการไม่สำเร็จ");
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
  const createTask = async (message = null) => {
    if (!window.confirm(`สร้างงานจาก${message ? "ข้อความนี้" : "คำถามนี้"} (มอบหมายให้ตัวเอง)?`)) return;
    setBusy(`task:${message?.id || "inquiry"}`);
    setError("");
    try {
      const res = await fetch("/api/pm/personal-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[${data.code || "IQ"}] ${message?.body?.slice(0, 120) || data.title}`,
          note: `งานจาก${message ? "ข้อความใน" : ""}เรื่องสอบถาม ${data.code || data.id}`,
          dueDate: data.committedDueDate || data.requestedDueDate || data.dueDate || null,
          dealId: data.dealId || null,
          inquiryId: data.id,
          inquiryMessageId: message?.id || null,
          urgent: !!data.urgent,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "สร้างงานไม่สำเร็จ");
      await load();
    } catch (e) {
      setError(e.message || "สร้างงานไม่สำเร็จ");
    } finally {
      setBusy("");
    }
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

  const deleteInquiry = async () => {
    if (!window.confirm("ลบเรื่องสอบถามนี้? รายการนี้ย้อนกลับไม่ได้")) return;
    setBusy("delete-inquiry");
    const res = await fetch(`/api/sales-planning/inquiries/${id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { setError(payload.error || "ลบเรื่องไม่สำเร็จ"); setBusy(""); return; }
    window.location.href = "/sa/inquiries";
  };

  if (loading) return <Workspace icon={<MessageCircleQuestion size={22} />} title="สอบถาม RD"><div style={{ padding: 24, color: "var(--text-3)" }}>กำลังโหลด...</div></Workspace>;
  if (!data) return (
    <Workspace icon={<MessageCircleQuestion size={22} />} title="สอบถาม RD">
      <div className="glass-panel" role="alert" style={{ padding: 16, color: "var(--red)" }}>{error || "ไม่พบเรื่องสอบถาม"}</div>
    </Workspace>
  );

  return (
    <Workspace
      icon={<MessageCircleQuestion size={22} />}
      title={`${data.code || "สอบถาม RD"} — ${data.title}`}
      subtitle={`ถามโดย ${data.requesterName || "-"} · ${fmtDateTime(data.createdAt)}`}
      headerRight={
        <Link href="/sa/inquiries" className="btn ghost sm"><ArrowLeft size={14} aria-hidden="true" /> รายการทั้งหมด</Link>
      }
    >
      <div className="flex flex-col gap-4" style={{ maxWidth: 860 }}>
        {error && (
          <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>
        )}

        {/* สถานะ + บริบท + ปุ่มตามบทบาท */}
        <section className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <InquiryStatusBadge status={data.status} />
            {data.urgent && <span className="ui-badge" style={{ color: "var(--red)" }}>ด่วน</span>}
            {data.dueDate && (
              <span style={{ fontSize: 13 }}>
                กำหนดตอบ <strong className="mono">{fmtDate(data.dueDate)}</strong>
                {due && <span className="ui-badge" style={{ color: due.color, marginLeft: 6 }}>{due.label}</span>}
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-3)" }}>
              ผู้รับเรื่อง: {data.assigneeName || "ยังไม่มีผู้รับ"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            <span>SA คาดหวัง: <strong className="mono">{data.requestedDueDate ? fmtDate(data.requestedDueDate) : "-"}</strong></span>
            <span>SLA ระบบ: <strong className="mono">{data.dueDate ? fmtDate(data.dueDate) : "-"}</strong></span>
            <span>RD จะตอบ: <strong className="mono">{data.committedDueDate ? fmtDate(data.committedDueDate) : "ยังไม่ระบุ"}</strong>
              {data.committedDueAcknowledgedAt && <span className="ui-badge" style={{ color: "var(--green)", marginLeft: 6 }}>SA รับทราบแล้ว</span>}
            </span>
          </div>
          {(data.deal || data.project) && (
            <div style={{ fontSize: 13, display: "flex", gap: 14, flexWrap: "wrap" }}>
              {data.deal && (
                <span>ดีล: <Link href={`/sales-planning/deals/${data.deal.id}`} className="linklike">{data.deal.code ? `${data.deal.code} · ` : ""}{data.deal.title}</Link>{data.deal.customerName ? ` — ${data.deal.customerName}` : ""}</span>
              )}
              {data.project && (
                <span>โครงการ: <Link href={`/sa/projects/${data.project.id}`} className="linklike">{data.project.code ? `${data.project.code} · ` : ""}{data.project.name}</Link></span>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.canTake && !closed && (
              <button type="button" className="btn sm" onClick={() => runAction("take", { action: "take" })} disabled={!!busy}>
                <Hand size={13} aria-hidden="true" /> รับเรื่องนี้
              </button>
            )}
            {data.canRespond && data.assigneeId === data.meId && (
              <button type="button" className="btn sm" onClick={() => createTask()} disabled={!!busy}>
                <Plus size={13} aria-hidden="true" /> สร้างงานจากคำถาม
              </button>
            )}
            {data.canEditRequest && (
              <button type="button" className="btn sm" onClick={() => setRequestEdit({ title: data.title, urgent: !!data.urgent, requestedDueDate: data.requestedDueDate || "" })} disabled={!!busy}>
                <Edit2 size={13} aria-hidden="true" /> แก้ไขคำถาม
              </button>
            )}
            {data.canDelete && (
              <button type="button" className="btn danger sm" onClick={deleteInquiry} disabled={!!busy}>
                <Trash2 size={13} aria-hidden="true" /> ลบเรื่อง
              </button>
            )}
            {data.side && !closed && (
              <button type="button" className="btn btn-primary sm" onClick={() => runAction("confirm-close", { action: "confirm-close" }, "ยืนยันปิดในส่วนของคุณ?")} disabled={!!busy || (data.side === "requester" ? !!data.requesterCloseConfirmedAt : !!data.responderCloseConfirmedAt)}>
                <CheckCircle2 size={13} aria-hidden="true" /> {data.side === "requester" ? (data.requesterCloseConfirmedAt ? "SA ยืนยันแล้ว" : "SA ยืนยันปิด") : (data.responderCloseConfirmedAt ? "RD ยืนยันแล้ว" : "RD ยืนยันปิด")}
              </button>
            )}
            {(data.side || data.isAdmin) && closed && (
              <button type="button" className="btn sm" onClick={() => runAction("reopen", { action: "reopen" })} disabled={!!busy}>
                <RotateCcw size={13} aria-hidden="true" /> เปิดเรื่องอีกครั้ง
              </button>
            )}
          </div>
          {!closed && (data.requesterCloseConfirmedAt || data.responderCloseConfirmedAt) && (
            <div style={{ fontSize: 12.5, color: "var(--amber)" }}>
              รอยืนยันอีกฝ่าย · SA {data.requesterCloseConfirmedAt ? "✓" : "–"} · RD {data.responderCloseConfirmedAt ? "✓" : "–"}
            </div>
          )}
        </section>

        {requestEdit && (
          <section className="glass-panel" style={{ padding: 14, display: "grid", gap: 10 }}>
            <strong style={{ fontSize: 14 }}>แก้ไขคำถามก่อน RD รับเรื่อง</strong>
            <input className="premium-input" value={requestEdit.title} onChange={(e) => setRequestEdit((v) => ({ ...v, title: e.target.value }))} />
            <label style={{ fontSize: 13 }}>วันที่ SA คาดหวัง <input className="premium-input" type="date" value={requestEdit.requestedDueDate} onChange={(e) => setRequestEdit((v) => ({ ...v, requestedDueDate: e.target.value }))} /></label>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={requestEdit.urgent} onChange={(e) => setRequestEdit((v) => ({ ...v, urgent: e.target.checked }))} /> เร่งด่วน</label>
            <div className="form-action-inline"><button className="btn ghost sm" onClick={() => setRequestEdit(null)}>ยกเลิก</button><button className="btn btn-primary sm" onClick={async () => { await runAction("edit-request", { action: "edit-request", ...requestEdit }); setRequestEdit(null); }}><Save size={13} /> บันทึก</button></div>
          </section>
        )}

        {(data.acceptedAt || data.isAdmin) && (
          <section className="glass-panel" style={{ padding: 14, display: "grid", gap: 10 }}>
            <strong style={{ fontSize: 14 }}>รายละเอียดและกำหนดตอบจาก RD</strong>
            <textarea className="premium-input" rows={3} value={responderDetail} onChange={(e) => setResponderDetail(e.target.value)} disabled={!data.canEditResponse} placeholder="รายละเอียดทางเทคนิค / ข้อมูลที่ RD ต้องการเพิ่มเติม" />
            {data.canEditResponse && <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => runAction("edit-response", { action: "edit-response", responderDetail })}><Save size={13} /> บันทึกรายละเอียด RD</button>}
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <label style={{ fontSize: 13 }}>วันที่ RD จะตอบ<input className="premium-input" type="date" value={committedDueDate} onChange={(e) => setCommittedDueDate(e.target.value)} disabled={!data.canEditCommitment} /></label>
              {data.canEditCommitment && <button className="btn sm" onClick={() => runAction("set-commitment", { action: "set-commitment", committedDueDate })} disabled={!committedDueDate}><CalendarDays size={13} /> แจ้งวันที่ตอบ</button>}
              {data.canAcknowledgeCommitment && <button className="btn btn-primary sm" onClick={() => runAction("ack-date", { action: "ack-commitment" })}><CheckCircle2 size={13} /> SA รับทราบวันที่</button>}
            </div>
          </section>
        )}

        {/* งานที่แตกจากคำถามนี้ (ฝั่ง RD) */}
        {!!(data.tasks || []).length && (
          <section className="glass-panel" style={{ padding: 14 }}>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList size={15} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>งานที่แตกจากคำถามนี้</h2>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {data.tasks.map((t) => {
                const meta = TASK_STATUS_META[t.status] || { label: t.status, color: "var(--text-3)" };
                return (
                  <li key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span className="ui-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <Link href={`/sa/tasks?task=${t.id}`} className="linklike">{t.title}</Link>
                    {t.dueDate && <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>กำหนด {fmtDate(t.dueDate)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* เธรดข้อความ */}
        <section className="glass-panel" style={{ padding: 16 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
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
                <li key={m.id} style={{
                  borderLeft: `3px solid ${isTarget ? "var(--green)" : "var(--blue)"}`,
                  paddingLeft: 10,
                }}>
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
                      {(data.tasks || []).filter((t) => t.inquiryMessageId === m.id).map((t) => <Link key={t.id} href={`/sa/tasks/${t.id}`} className="ui-badge">งาน: {t.title}</Link>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* composer — ปิดเรื่องแล้วต้องเปิดใหม่ก่อนจึงคุยต่อได้ */}
          {!closed && canCompose ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <textarea
                className="premium-input"
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={data.canRespond ? "พิมพ์คำตอบ..." : "พิมพ์คำถามเพิ่มเติม..."}
                style={{ resize: "vertical" }}
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
            <div style={{ marginTop: 14, color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>
              {closed ? `เรื่องนี้ปิดแล้ว ${data.closedAt ? `· ${fmtDateTime(data.closedAt)}` : ""} — เปิดเรื่องอีกครั้งเพื่อคุยต่อ` : "เฉพาะผู้รับเรื่องหรือฝ่ายขายที่เกี่ยวข้องเท่านั้นที่ส่งข้อความได้"}
            </div>
          )}
        </section>
      </div>
    </Workspace>
  );
}
