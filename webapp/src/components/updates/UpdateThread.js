"use client";
// ── เธรดอัปเดตของกลาง (mig 0163) ─────────────────────────────────────────
// component เดียวสำหรับทุก entity — ก่อนหน้านี้ระบบมีเธรดแบบนี้ 4 ชุด (+ลีดอ่าน
// อย่างเดียว) ต่างคนต่างวาด ฟีเจอร์เลยไม่เท่ากันโดยไม่ได้ตั้งใจ
//
// props:
//   entityType/entityId  ตัวที่เธรดผูกอยู่ (ต้องลงทะเบียนใน lib/master/updateAccess)
//   extraItems           รายการ "อ่านอย่างเดียว" จากแหล่งอื่นที่อยากให้เรียงรวมใน
//                        ไทม์ไลน์เดียวกัน (ประวัติสถานะ/เหตุการณ์ลีด) —
//                        [{ id, at, label, color, body }]
//   order                'asc' (เก่าก่อน — งาน/สอบถาม) | 'desc' (ใหม่ก่อน — ดีล)
//   onPosted             เรียกหลังโพสต์/แก้/ลบสำเร็จ (ให้หน้าแม่ refresh ตัวนับ)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Paperclip, X, Pencil, Trash2, FileText, Check } from "lucide-react";
import Modal from "@/components/Modal";
import ReadableText from "@/components/ui/ReadableText";
import { fmtDateTime } from "@/lib/format";
import {
  DELETED_UPDATE_TEXT, MAX_UPDATE_ATTACHMENTS, updateKindMeta,
} from "@/lib/master/updateTypes";
import {
  isPreviewableImage, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR,
} from "@/lib/master/attachmentTypes";
import styles from "./UpdateThread.module.css";

const fileHref = (row, i) => `/api/updates/${row.id}/file?i=${i}`;

export default function UpdateThread({
  entityType,
  entityId,
  extraItems = [],
  order = "asc",
  allowAttachments = true,
  placeholder = "พิมพ์อัปเดต...",
  emptyText = "ยังไม่มีอัปเดต",
  onPosted,
}) {
  const [items, setItems] = useState([]);
  const [canPost, setCanPost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);   // ไฟล์ที่เลือกไว้ ยังไม่อัป
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // { id, body }
  const [preview, setPreview] = useState(null); // { src, name }
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await fetch(
        `/api/updates?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store" },
      );
      const d = await res.json().catch(() => null);
      if (res.ok) { setItems(d?.items || []); setCanPost(!!d?.canPost); }
    } catch { /* เธรดพังต้องไม่ทำหน้าพัง — แสดงเป็นว่าง */ }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  // รวมของในเธรดกับรายการอ่านอย่างเดียวจากแหล่งอื่น แล้วเรียงตามเวลาชุดเดียว
  const timeline = useMemo(() => {
    const own = items.map((row) => ({
      id: row.id, at: row.createdAt, row, kind: "own",
      ...updateKindMeta(entityType, row.kind),
    }));
    const extra = (extraItems || []).map((e) => ({ ...e, kind: "extra" }));
    const all = [...own, ...extra];
    all.sort((a, b) => (order === "desc"
      ? String(b.at || "").localeCompare(String(a.at || ""))
      : String(a.at || "").localeCompare(String(b.at || ""))));
    return all;
  }, [items, extraItems, entityType, order]);

  const pickFiles = (list) => {
    const files = Array.from(list || []).filter(Boolean);
    if (!files.length) return;
    const room = MAX_UPDATE_ATTACHMENTS - pending.length;
    const next = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      if (f.size > MAX_UPLOAD_BYTES) { setErr(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_MB} MB`); continue; }
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    if (next.length) setPending((p) => [...p, ...next]);
  };

  const post = async () => {
    if (!text.trim() && !pending.length) return;
    setBusy(true); setErr("");
    try {
      // อัปไฟล์ก่อน แล้วค่อยส่ง ref ไปกับข้อความ (แพตเทิร์นเดียวกับเธรดสอบถาม)
      const attachments = [];
      for (const p of pending) {
        const fd = new FormData();
        fd.append("file", p.file);
        fd.append("entityType", entityType);
        fd.append("entityId", entityId);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ");
        const payload = await up.json();
        attachments.push({
          fileUrl: payload.url, driveFileId: payload.driveFileId || null,
          fileName: p.file.name, mimeType: p.file.type, sizeBytes: p.file.size,
        });
      }
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, body: text.trim(), attachments }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ส่งอัปเดตไม่สำเร็จ");
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setText(""); setPending([]);
      await load();
      onPosted?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const mutate = async (id, init, okThen) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/updates/${id}`, {
        headers: { "Content-Type": "application/json" }, ...init,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ทำรายการไม่สำเร็จ");
      okThen?.();
      await load();
      onPosted?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (loading) return <div className={styles.empty}>กำลังโหลด...</div>;

  return (
    <>
      {timeline.length ? (
        <div className={styles.timeline}>
          {timeline.map((item) => (
            <div className={styles.event} key={`${item.kind}-${item.id}`}>
              <div className={styles.rail}>
                <span className={styles.dot} style={item.color ? { background: item.color, boxShadow: `0 0 0 1px ${item.color}` } : undefined} />
              </div>
              <div className={styles.eventBody}>
                <div className={styles.head}>
                  <span className="ui-badge" style={{ color: item.color }}>{item.label}</span>
                  {item.kind === "own" && <strong>{item.row.authorName || "ระบบ"}</strong>}
                  <span>{item.at ? fmtDateTime(item.at) : ""}</span>
                  {item.kind === "own" && item.row.editedAt && <span>· แก้ไขแล้ว</span>}
                  {item.kind === "own" && item.row.acknowledgedAt && (
                    <span style={{ color: "var(--green)" }}><Check size={11} /> รับทราบแล้ว</span>
                  )}
                  {item.kind === "own" && canPost && !item.row.deletedAt && item.row.kind === "comment" && (
                    <span className={styles.rowActions}>
                      <button
                        type="button" className="btn-icon" aria-label="แก้ข้อความ" disabled={busy}
                        onClick={() => setEditing({ id: item.row.id, body: item.row.body || "" })}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button" className="btn-icon" style={{ color: "var(--red)" }}
                        aria-label="ลบข้อความ" disabled={busy}
                        onClick={() => mutate(item.row.id, { method: "DELETE" })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </div>

                {item.kind === "extra"
                  ? item.body && <ReadableText className={styles.body} text={item.body} lines={4} />
                  : item.row.deletedAt
                    ? <p className={styles.deleted}>{DELETED_UPDATE_TEXT}</p>
                    : (
                      <>
                        {editing?.id === item.row.id ? (
                          <>
                            <textarea
                              className="premium-input" rows={2} value={editing.body} disabled={busy}
                              aria-label="แก้ข้อความ"
                              onChange={(e) => setEditing((s) => ({ ...s, body: e.target.value }))}
                            />
                            <div className={styles.composerBar}>
                              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditing(null)}>
                                <X size={13} /> ยกเลิก
                              </button>
                              <button
                                type="button" className="btn btn-primary sm" disabled={busy || !editing.body.trim()}
                                onClick={() => mutate(item.row.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({ action: "edit", body: editing.body.trim() }),
                                }, () => setEditing(null))}
                              >
                                บันทึก
                              </button>
                            </div>
                          </>
                        ) : (
                          item.row.body && <ReadableText className={styles.body} text={item.row.body} lines={6} />
                        )}
                        <ThreadAttachments row={item.row} onOpen={setPreview} />
                      </>
                    )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>{emptyText}</div>
      )}

      {canPost && (
        <div className={styles.composer}>
          <textarea
            className="premium-input" rows={2} value={text} disabled={busy}
            placeholder={placeholder} aria-label="ข้อความอัปเดต"
            onChange={(e) => setText(e.target.value)}
            onPaste={allowAttachments ? (e) => pickFiles(e.clipboardData?.files) : undefined}
          />
          {!!pending.length && (
            <div className={styles.pending}>
              {pending.map((p, i) => (
                <div className={styles.pendingItem} key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.file.name} />
                  <button
                    type="button" className={styles.pendingRemove} aria-label="เอาไฟล์ออก"
                    onClick={() => setPending((list) => list.filter((_, n) => n !== i))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <div className={styles.error} role="alert">{err}</div>}
          <div className={styles.composerBar}>
            {allowAttachments && (
              <>
                <button
                  type="button" className="btn ghost sm" disabled={busy}
                  onClick={() => fileRef.current?.click()} title="แนบไฟล์"
                >
                  <Paperclip size={13} /> แนบไฟล์
                </button>
                <input
                  ref={fileRef} type="file" accept={UPLOAD_ACCEPT_ATTR} multiple hidden
                  onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
                />
              </>
            )}
            <button
              type="button" className="btn btn-primary sm"
              disabled={busy || (!text.trim() && !pending.length)} onClick={post}
            >
              <Send size={13} /> {busy ? "กำลังส่ง..." : "ส่งอัปเดต"}
            </button>
          </div>
        </div>
      )}

      <Modal
        open={!!preview} onClose={() => setPreview(null)}
        title={preview?.name || "รูปแนบ"} size="lg" closeOnOverlay
      >
        {preview && (
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.src} alt={preview.name || "รูปแนบ"}
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)" }}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

// รูป = ตารางภาพย่อ · ไฟล์อื่น = ลิงก์ (ภาพย่อของ PDF ไม่บอกอะไร) — กติกาเดียวกับ
// AttachmentsPanel เพื่อให้ไฟล์แนบทั้งระบบหน้าตาเหมือนกัน
function ThreadAttachments({ row, onOpen }) {
  const list = Array.isArray(row.attachments) ? row.attachments : [];
  if (!list.length) return null;
  const photos = list.map((a, i) => ({ a, i })).filter(({ a }) => isPreviewableImage(a));
  const files = list.map((a, i) => ({ a, i })).filter(({ a }) => !isPreviewableImage(a));
  return (
    <>
      {photos.length > 0 && (
        <div className={styles.photos}>
          {photos.map(({ a, i }) => (
            <button
              key={i} type="button" className={styles.photoBtn} title={a.fileName || "ดูรูป"}
              onClick={() => onOpen({ src: fileHref(row, i), name: a.fileName })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileHref(row, i)} alt={a.fileName || "รูปแนบ"} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={styles.files}>
          {files.map(({ a, i }) => (
            <a key={i} className={styles.fileLink} href={fileHref(row, i)} target="_blank" rel="noreferrer">
              <FileText size={13} /> <span className="truncate">{a.fileName || "ไฟล์แนบ"}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
