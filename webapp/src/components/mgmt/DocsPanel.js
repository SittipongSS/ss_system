"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { FileText, FileSpreadsheet, File as FileIcon, Plus, Trash2, ExternalLink, Paperclip, Link2 } from "lucide-react";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

// ไฟล์ & เอกสารของโมดูล "งานบริหาร" — 2 ประเภทในที่เดียว:
//   • ไฟล์ static (PDF) → อัปขึ้น Drive, ดาวน์โหลดผ่าน proxy
//   • Google Doc/Sheet (มีชีวิต) → ผูก/สร้าง, เปิดผ่าน webViewLink ตรง
// props: entityType ('mgmt_task'|'mgmt_meeting'), entityId, canEdit
const isGoogle = (it) => it?.metadata?.kind === "gdoc" || it?.metadata?.kind === "gsheet";

export default function DocsPanel({ entityType, entityId, canEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await fetch(`/api/master/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
      if (res.ok) setItems(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  const files = items.filter((it) => !isGoogle(it));
  const docs = items.filter(isGoogle);

  const uploadFile = async (f) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) { alert(`ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_UPLOAD_MB} MB)`); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("customerName", `${entityType}-${entityId}`);
      fd.append("entityType", entityType);
      fd.append("entityId", entityId);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) { alert("อัปโหลดไม่สำเร็จ"); return; }
      const { url, driveFileId } = await up.json();
      const res = await fetch("/api/master/attachments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType, entityId, docType: "other", fileUrl: url, driveFileId,
          fileName: f.name, mimeType: f.type || null, sizeBytes: f.size, metadata: { kind: "file" },
        }),
      });
      if (res.ok) load(); else alert((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const addGoogle = async (payload) => {
    setBusy(true);
    try {
      const res = await fetch("/api/mgmt/docs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, ...payload }),
      });
      if (res.ok) load(); else alert((await res.json().catch(() => ({}))).error || "ดำเนินการไม่สำเร็จ");
    } finally { setBusy(false); }
  };
  const linkDoc = () => {
    const url = prompt("วางลิงก์ Google Doc/Sheet:");
    if (url) addGoogle({ mode: "link", url });
  };
  const createDoc = (type) => {
    const name = prompt(type === "gsheet" ? "ชื่อ Google Sheet ใหม่:" : "ชื่อ Google Doc ใหม่:");
    if (name !== null) addGoogle({ mode: "create", type, name });
  };

  const remove = async (id) => {
    if (!confirm("ลบ/เลิกผูกเอกสารนี้?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/master/attachments/${id}`, { method: "DELETE" });
      if (res.ok) setItems((p) => p.filter((x) => x.id !== id));
      else alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const fileHref = (it) => (it.driveFileId ? `/api/master/attachments/${it.id}/file` : it.fileUrl);
  const docIcon = (it) => (it.metadata?.kind === "gsheet" ? FileSpreadsheet : FileText);

  const Row = ({ it, href, Icon, external }) => (
    <div className="flex items-center justify-between gap-2 py-1.5" style={{ fontSize: 13 }}>
      <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0" style={{ color: "var(--text-2)" }}>
        <Icon size={15} className="shrink-0" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.fileName || "เอกสาร"}</span>
        {external && <ExternalLink size={12} className="shrink-0" style={{ color: "var(--text-3)" }} />}
      </a>
      {canEdit && (
        <button onClick={() => remove(it.id)} disabled={busy} className="btn-icon" style={{ color: "var(--red)" }} title="ลบ" aria-label="ลบ">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="glass-panel" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>
        <Paperclip size={16} style={{ color: "var(--accent)" }} /> ไฟล์ & เอกสาร
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>กำลังโหลด...</div>
      ) : (
        <>
          {/* Google Doc/Sheet (เอกสารมีชีวิต) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>Google Doc / Sheet (แก้ในที่)</span>
              {canEdit && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={linkDoc} disabled={busy}><Link2 size={13} /> ผูกลิงก์</button>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => createDoc("gdoc")} disabled={busy}><FileText size={13} /> Doc</button>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => createDoc("gsheet")} disabled={busy}><FileSpreadsheet size={13} /> Sheet</button>
                </div>
              )}
            </div>
            {docs.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>ยังไม่มีเอกสาร</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {docs.map((it) => <Row key={it.id} it={it} href={it.fileUrl} Icon={docIcon(it)} external />)}
              </div>
            )}
          </div>

          {/* ไฟล์แนบ static (PDF) */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>ไฟล์แนบ (PDF)</span>
              {canEdit && (
                <>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => fileRef.current?.click()} disabled={busy}><Plus size={13} /> อัปไฟล์</button>
                  <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT_ATTR} className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
                </>
              )}
            </div>
            {files.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>ยังไม่มีไฟล์</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {files.map((it) => <Row key={it.id} it={it} href={fileHref(it)} Icon={FileIcon} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
