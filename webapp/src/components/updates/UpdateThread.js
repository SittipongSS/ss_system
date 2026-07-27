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
import { Send, Paperclip, X, Pencil, Trash2, FileText, Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import DateInput from "@/components/ui/DateInput";
import ReadableText from "@/components/ui/ReadableText";
import Select from "@/components/ui/Select";
import { fmtDateTime } from "@/lib/format";
import {
  authorableKinds, DELETED_UPDATE_TEXT, defaultAuthorableKind, isSystemUpdateItem,
  kindAcceptsDueDate, MAX_UPDATE_ATTACHMENTS, updateKindMeta,
} from "@/lib/master/updateTypes";
import {
  isPreviewableImage, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR,
} from "@/lib/master/attachmentTypes";
import styles from "./UpdateThread.module.css";

const fileHref = (row, i) => `/api/updates/${row.id}/file?i=${i}`;

// สวิตช์ซ่อนเหตุการณ์ระบบจำรายชนิดเอกสาร ไม่ใช่รายใบ — คนที่ไม่อยากเห็นเหตุการณ์
// ระบบบนใบ QT ก็ไม่อยากเห็นบนทุกใบ QT ไม่ใช่แค่ใบที่เพิ่งกด
const hideSystemKey = (entityType) => `updateThread.hideSystem.${entityType}`;

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
  const [hideSystem, setHideSystem] = useState(false); // ตั้งต้น = เห็นครบ ไม่ซ่อนอะไรเงียบ
  const [kind, setKind] = useState(() => defaultAuthorableKind(entityType));
  const [dueDate, setDueDate] = useState("");
  const fileRef = useRef(null);

  // ชนิดที่คนเลือกเองได้ของ entity นี้ — มีตัวเดียว (ส่วนใหญ่) = ไม่ต้องโชว์ dropdown
  const kinds = useMemo(() => authorableKinds(entityType), [entityType]);
  const showKindPicker = kinds.length > 1;
  const showDueDate = kindAcceptsDueDate(entityType, kind);

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

  // อ่านค่าที่จำไว้ใน effect (ไม่ใช่ตอน initial state) — ไม่งั้น server กับ client
  // render ไม่ตรงกัน
  useEffect(() => {
    if (!entityType) return;
    try { setHideSystem(localStorage.getItem(hideSystemKey(entityType)) === "1"); } catch { /* โหมดส่วนตัว */ }
  }, [entityType]);

  const toggleHideSystem = () => {
    setHideSystem((prev) => {
      const next = !prev;
      try { localStorage.setItem(hideSystemKey(entityType), next ? "1" : "0"); } catch { /* โหมดส่วนตัว */ }
      return next;
    });
  };

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

  const systemCount = useMemo(
    () => timeline.filter((item) => isSystemUpdateItem(entityType, item)).length,
    [timeline, entityType],
  );
  // โชว์สวิตช์เฉพาะตอนที่มีทั้งสองอย่างจริง: ไม่มีเหตุการณ์ระบบ = ไม่มีอะไรให้ซ่อน ·
  // มีแต่เหตุการณ์ระบบ (เธรดลีดที่อ่านอย่างเดียว) = กดแล้วเธรดว่างเปล่า
  const canFilterSystem = systemCount > 0 && systemCount < timeline.length;
  const visible = hideSystem && canFilterSystem
    ? timeline.filter((item) => !isSystemUpdateItem(entityType, item))
    : timeline;

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
        body: JSON.stringify({
          entityType, entityId, body: text.trim(), attachments, kind,
          dueDate: showDueDate ? dueDate : "",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "ส่งอัปเดตไม่สำเร็จ");
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      setText(""); setPending([]); setDueDate("");
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
      {canFilterSystem && (
        <div className={styles.toolbar}>
          <Button
            variant="quiet" size="sm" onClick={toggleHideSystem} aria-pressed={hideSystem}
            icon={hideSystem ? <Eye size={13} /> : <EyeOff size={13} />}
          >
            {hideSystem ? `แสดงเหตุการณ์ระบบ (${systemCount})` : `ซ่อนเหตุการณ์ระบบ (${systemCount})`}
          </Button>
        </div>
      )}

      {visible.length ? (
        <div className={styles.timeline}>
          {visible.map((item) => (
            <div className={styles.event} key={`${item.kind}-${item.id}`}>
              <div className={styles.rail}>
                <span className={styles.dot} style={item.color ? { background: item.color, boxShadow: `0 0 0 1px ${item.color}` } : undefined} />
              </div>
              <div className={styles.eventBody}>
                <div className={styles.head}>
                  <span className="ui-badge" style={{ color: item.color }}>{item.label}</span>
                  {/* รายการอ่านอย่างเดียวจากแหล่งอื่นที่มีหน้าของตัวเอง (เรื่องสอบถาม)
                      ต้องกดเข้าไปได้ ไม่งั้นไทม์ไลน์บอกว่าเกิดอะไรแต่ไปต่อไม่ได้ */}
                  {item.kind === "extra" && item.href && (
                    <Link href={item.href} className="linklike">{item.linkLabel || "เปิดดู"}</Link>
                  )}
                  {item.kind === "extra" && item.by && <strong>{item.by}</strong>}
                  {item.kind === "own" && <strong>{item.row.authorName || "ระบบ"}</strong>}
                  {item.kind === "own" && item.row.meta?.dueDate && (
                    <span className={styles.due}>กำหนด {item.row.meta.dueDate}</span>
                  )}
                  {/* ฝ่ายของคนพูด — เธรดสองฝ่าย (เซลถาม ↔ RD/PC/ผู้บริหารตอบ) อ่านไม่รู้เรื่อง
                      ถ้าไม่รู้ว่าใครพูดในฐานะอะไร · `authorDept` ถูกเขียนอยู่แล้วทุกแถว
                      ตั้งแต่ mig 0163 แค่ไม่เคยถูกแสดง */}
                  {item.kind === "own" && item.row.authorDept && (
                    <span className={styles.dept}>{item.row.authorDept}</span>
                  )}
                  <span>{item.at ? fmtDateTime(item.at) : ""}</span>
                  {item.kind === "own" && item.row.editedAt && <span>· แก้ไขแล้ว</span>}
                  {item.kind === "own" && item.row.acknowledgedAt && (
                    <span style={{ color: "var(--green)" }}><Check size={11} /> รับทราบแล้ว</span>
                  )}
                  {item.kind === "own" && canPost && !item.row.deletedAt && kinds.includes(item.row.kind) && (
                    <span className={styles.rowActions}>
                      <Button
                        iconOnly icon={<Pencil size={13} />} aria-label="แก้ข้อความ" disabled={busy}
                        onClick={() => setEditing({
                          id: item.row.id,
                          body: item.row.body || "",
                          kind: item.row.kind,
                          dueDate: item.row.meta?.dueDate || "",
                        })}
                      />
                      <Button
                        iconOnly icon={<Trash2 size={13} />} style={{ color: "var(--red)" }}
                        aria-label="ลบข้อความ" disabled={busy}
                        onClick={() => mutate(item.row.id, { method: "DELETE" })}
                      />
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
                            {(showKindPicker || kindAcceptsDueDate(entityType, editing.kind)) && (
                              <div className={styles.kindRow}>
                                {showKindPicker && (
                                  <Select
                                    className={`premium-select ${styles.kindSelect}`} disabled={busy}
                                    value={editing.kind} aria-label="ชนิดอัปเดต"
                                    onChange={(e) => setEditing((s) => ({ ...s, kind: e.target.value }))}
                                  >
                                    {kinds.map((k) => (
                                      <option key={k} value={k}>{updateKindMeta(entityType, k).label}</option>
                                    ))}
                                  </Select>
                                )}
                                {kindAcceptsDueDate(entityType, editing.kind) && (
                                  <DateInput
                                    value={editing.dueDate} disabled={busy} ariaLabel="กำหนดวัน"
                                    className={styles.dueInput}
                                    onChange={(v) => setEditing((s) => ({ ...s, dueDate: v }))}
                                  />
                                )}
                              </div>
                            )}
                            <textarea
                              className="premium-input" rows={2} value={editing.body} disabled={busy}
                              aria-label="แก้ข้อความ"
                              onChange={(e) => setEditing((s) => ({ ...s, body: e.target.value }))}
                            />
                            <div className={styles.composerBar}>
                              <Button
                                variant="quiet" size="sm" disabled={busy} icon={<X size={13} />}
                                onClick={() => setEditing(null)}
                              >
                                ยกเลิก
                              </Button>
                              <Button
                                tone="primary" size="sm" disabled={busy || !editing.body.trim()}
                                onClick={() => mutate(item.row.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    action: "edit", body: editing.body.trim(),
                                    kind: editing.kind, dueDate: editing.dueDate || "",
                                  }),
                                }, () => setEditing(null))}
                              >
                                บันทึก
                              </Button>
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
          {/* ชนิดของอัปเดต — โผล่เฉพาะ entity ที่มีให้เลือกจริง (ฟีดดีล) เธรดที่มี
              ชนิดเดียวไม่ต้องมี dropdown ที่เลือกอะไรไม่ได้ */}
          {(showKindPicker || showDueDate) && (
            <div className={styles.kindRow}>
              {showKindPicker && (
                <Select
                  className={`premium-select ${styles.kindSelect}`} value={kind} disabled={busy}
                  aria-label="ชนิดอัปเดต" onChange={(e) => setKind(e.target.value)}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>{updateKindMeta(entityType, k).label}</option>
                  ))}
                </Select>
              )}
              {showDueDate && (
                <DateInput
                  value={dueDate} onChange={setDueDate} disabled={busy}
                  ariaLabel="กำหนดวัน" className={styles.dueInput}
                />
              )}
            </div>
          )}
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
                <Button
                  variant="quiet" size="sm" disabled={busy} icon={<Paperclip size={13} />}
                  onClick={() => fileRef.current?.click()} title="แนบไฟล์"
                >
                  แนบไฟล์
                </Button>
                <input
                  ref={fileRef} type="file" accept={UPLOAD_ACCEPT_ATTR} multiple hidden
                  onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
                />
              </>
            )}
            <Button
              tone="primary" size="sm" icon={<Send size={13} />}
              disabled={busy || (!text.trim() && !pending.length)} onClick={post}
            >
              {busy ? "กำลังส่ง..." : "ส่งอัปเดต"}
            </Button>
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
