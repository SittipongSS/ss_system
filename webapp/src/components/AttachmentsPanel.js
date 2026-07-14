"use client";
import Select from "@/components/ui/Select";
// เอกสารแนบหลายไฟล์แบบมีประเภท (migration 0028) — ใช้ซ้ำได้ทุก entity.
// props:
//   entityType  'customer' | 'product' | 'order'
//   entityId    id ของ entity
//   canEdit     แสดงปุ่มอัปโหลด/ลบ (false = อ่านอย่างเดียว)
//   title       หัวข้อ panel (ค่าเริ่มต้น "เอกสารแนบ")
//   note        คำอธิบายเล็กใต้หัวข้อ (optional)
//
// 2 โหมดการแสดงผล:
//  • การ์ด (customer/product) — 1 การ์ด/ประเภทเอกสาร, ติ๊กถูกเมื่ออัปแล้ว,
//    อัป/ลบในการ์ดได้เลย. เห็นชัดว่าเอกสารจำเป็นไหนยังขาด.
//  • ฟอร์มรายละเอียด (order — entity ที่มี ATTACHMENT_META_FIELDS) — เก็บ
//    เลขใบเสร็จ/วันที่/ยอด/อ้างอิงออเดอร์ ฯลฯ ลง metadata.
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/format";
import {
  FileText, Plus, Trash2, Download, Paperclip, X, CheckCircle2, Circle,
} from "lucide-react";
import {
  ATTACHMENT_TYPES,
  ATTACHMENT_META_FIELDS,
  attachmentTypeLabel,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  UPLOAD_ACCEPT_ATTR,
} from "@/lib/master/attachmentTypes";

// เช็คขนาดก่อนอัป (กันเสียแบนด์วิดท์อัปแล้วโดน server ปฏิเสธ). server บังคับซ้ำเสมอ.
function tooLarge(file) {
  if (file && file.size > MAX_UPLOAD_BYTES) {
    alert(`ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_UPLOAD_MB} MB)`);
    return true;
  }
  return false;
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyMeta(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

export default function AttachmentsPanel({
  entityType,
  entityId,
  canEdit = false,
  title = "เอกสารแนบ",
  note,
  docTypes, // override การ์ดที่แสดง (เช่น เอกสารลูกค้าตามประเภท) — default = ตาม entityType
  onItemsChange, // (items) => void — แจ้งรายการเอกสารปัจจุบัน (ใช้บังคับแนบก่อนยื่น)
  cardColumns = 2, // การ์ดเอกสารจำเป็น: จำนวนคอลัมน์สูงสุด (1 = แถวละใบ เห็นชื่อเต็ม)
  inlineUpload = false, // แสดง action แนบไฟล์และรายการไฟล์แบบไม่มีการ์ด
}) {
  const types = (docTypes && docTypes.length ? docTypes : ATTACHMENT_TYPES[entityType]) || [];
  const metaFields = ATTACHMENT_META_FIELDS[entityType] || [];
  const detailed = metaFields.length > 0; // order = ฟอร์มรายละเอียด; อื่นๆ = การ์ด

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState(null); // docType ที่กำลังอัป (card mode)

  // ── detailed (order) form state ──
  const [docType, setDocType] = useState(types[0]?.key || "other");
  const [showAdd, setShowAdd] = useState(false);
  const [meta, setMeta] = useState(() => emptyMeta(metaFields));
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  // ไฟล์อินพุตร่วม (card mode) — จำว่ากำลังอัปประเภทไหน
  const cardFileRef = useRef(null);
  const pendingTypeRef = useRef(null);

  const fetchItems = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await fetch(
        `/api/master/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      if (res.ok) setItems(await res.json());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // แจ้งรายการเอกสารปัจจุบันกลับไปให้ parent (เช่น เพื่อบังคับแนบก่อนยื่น).
  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  // อัปไฟล์ขึ้น storage แล้วบันทึก metadata row. คืน true ถ้าสำเร็จ.
  const upload = async (theFile, theDocType, theMeta) => {
    const fd = new FormData();
    fd.append("file", theFile);
    fd.append("customerName", `${entityType}-${entityId}`); // ใช้เป็นชื่อโฟลเดอร์ (Supabase)
    fd.append("entityType", entityType); // Drive: resolve โฟลเดอร์ลูกค้า/สินค้า
    fd.append("entityId", entityId);
    const up = await fetch("/api/upload", { method: "POST", body: fd });
    if (!up.ok) {
      alert("อัปโหลดไฟล์ไม่สำเร็จ");
      return false;
    }
    const { url, driveFileId } = await up.json();
    const res = await fetch("/api/master/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
        docType: theDocType,
        fileUrl: url,
        driveFileId,
        fileName: theFile.name,
        mimeType: theFile.type || null,
        sizeBytes: theFile.size,
        metadata: theMeta,
      }),
    });
    if (!res.ok) {
      // rollback: บันทึก metadata ล้ม → ลบไฟล์ Drive ที่เพิ่งอัป กัน orphan.
      if (driveFileId) {
        fetch("/api/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveFileId }),
        }).catch(() => {});
      }
      alert((await res.json()).error || "บันทึกเอกสารไม่สำเร็จ");
      return false;
    }
    return true;
  };

  // ── card mode: อัปไฟล์เข้าประเภทที่กดในการ์ด ──
  const pickForType = (typeKey) => {
    pendingTypeRef.current = typeKey;
    cardFileRef.current?.click();
  };
  const handleCardFile = async (e) => {
    const f = e.target.files?.[0];
    const typeKey = pendingTypeRef.current;
    if (!f || !typeKey) return;
    if (tooLarge(f)) {
      pendingTypeRef.current = null;
      if (cardFileRef.current) cardFileRef.current.value = "";
      return;
    }
    setUploadingType(typeKey);
    try {
      if (await upload(f, typeKey, {})) await fetchItems();
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploadingType(null);
      pendingTypeRef.current = null;
      if (cardFileRef.current) cardFileRef.current.value = "";
    }
  };

  // ── detailed mode: บันทึกพร้อมรายละเอียด ──
  const handleDetailedSave = async () => {
    if (!file) {
      alert("กรุณาเลือกไฟล์");
      return;
    }
    setSaving(true);
    try {
      const cleanMeta = Object.fromEntries(
        Object.entries(meta).filter(([, v]) => v !== "" && v != null),
      );
      if (await upload(file, docType, cleanMeta)) {
        setShowAdd(false);
        setFile(null);
        setMeta(emptyMeta(metaFields));
        setDocType(types[0]?.key || "other");
        await fetchItems();
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("ยืนยันการลบเอกสารนี้?")) return;
    try {
      const res = await fetch(`/api/master/attachments/${id}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev.filter((it) => it.id !== id));
      else alert((await res.json()).error || "ลบไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาดในการลบ");
    }
  };

  // จัดกลุ่มไฟล์ตามประเภท (docType ที่ไม่รู้จัก → 'other')
  const knownKeys = new Set(types.map((t) => t.key));
  const byType = {};
  for (const it of items) {
    const k = knownKeys.has(it.docType) ? it.docType : "other";
    (byType[k] ||= []).push(it);
  }

  // เรียงการ์ดตามความสำคัญ: จำเป็น+ยังขาด → จำเป็น+มีแล้ว → ไม่บังคับ+ยังขาด → ไม่บังคับ+มีแล้ว
  // (เห็น "เอกสารจำเป็นที่ยังไม่ได้แนบ" บนสุดทันที). sort เสถียร → คงลำดับเดิมในกลุ่มเดียวกัน
  const typeRank = (t) => {
    const has = (byType[t.key]?.length || 0) > 0;
    if (t.required && !has) return 0;
    if (t.required) return 1;
    if (!has) return 2;
    return 3;
  };
  const sortedTypes = [...types].sort((a, b) => typeRank(a) - typeRank(b));

  // ไฟล์ Drive (private) เปิดผ่าน proxy ที่เช็กสิทธิ์ + stream; ไฟล์เก่าบน Supabase
  // (driveFileId ว่าง) ใช้ public URL ตรงเหมือนเดิม.
  const fileHref = (it) => (it.driveFileId ? `/api/master/attachments/${it.id}/file` : it.fileUrl);

  const FileRow = ({ it, compact }) => (
    <div className="flex items-center justify-between gap-2 text-xs py-1">
      <a
        href={fileHref(it)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 min-w-0 text-[var(--text-2)] hover:text-[var(--accent)] hover:underline"
      >
        <FileText size={14} className="shrink-0" />
        <span className="truncate">{it.fileName || "ไฟล์แนบ"}</span>
        {!compact && it.sizeBytes != null && (
          <span className="text-[10px] text-[var(--text-3)] shrink-0">({formatSize(it.sizeBytes)})</span>
        )}
      </a>
      {canEdit && (
        <button
          type="button"
          onClick={() => handleDelete(it.id)}
          className="text-[var(--red)] shrink-0 p-0.5 hover:opacity-70"
          title="ลบ"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  if (inlineUpload) {
    const inlineType = types[0]?.key || "other";
    const busy = uploadingType === inlineType;

    return (
      <div className="mt-1">
        <div className="flex min-h-8 items-center justify-end gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => pickForType(inlineType)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="แนบไฟล์"
              title={busy ? "กำลังอัปโหลด..." : "แนบไฟล์"}
            >
              {busy ? (
                <span
                  aria-hidden
                  style={{ width: 13, height: 13, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }}
                />
              ) : (
                <Paperclip size={13} />
              )}
              <span>{busy ? "กำลังแนบ..." : "แนบไฟล์"}</span>
            </button>
          )}
          {!loading && items.length > 0 && (
            <span className="text-[11px] text-[var(--text-3)]">{items.length} ไฟล์</span>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="mt-1 divide-y divide-[var(--border)]">
            {items.map((it) => (<FileRow key={it.id} it={it} compact />))}
          </div>
        )}

        {canEdit && (
          <input
            ref={cardFileRef}
            type="file"
            accept={UPLOAD_ACCEPT_ATTR}
            onChange={handleCardFile}
            className="hidden"
          />
        )}
      </div>
    );
  }

  return (
    <div className="glass-panel p-[20px]">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4 gap-3 flex-wrap">
        <h3 className="font-semibold text-sm text-[var(--text)] flex items-center gap-2">
          <Paperclip size={16} className="text-[var(--accent)]" />
          {title}
          <span className="text-[var(--text-3)] font-normal">({items.length})</span>
        </h3>
        {canEdit && detailed && !showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="btn btn-primary px-3 text-xs flex items-center gap-1.5"
          >
            <Plus size={14} /> เพิ่มเอกสาร
          </button>
        )}
      </div>

      {note && <p className="text-[11px] text-[var(--text-3)] mb-3 -mt-1">{note}</p>}

      {loading ? (
        <p className="text-xs text-[var(--text-3)] py-4 text-center">กำลังโหลด...</p>
      ) : detailed ? (
        /* ───────── โหมดฟอร์มรายละเอียด (order) ───────── */
        <>
          {canEdit && showAdd && (
            <div className="border border-[var(--border)] rounded-lg p-3 mb-4 bg-[var(--panel-2)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[var(--text)]">เพิ่มเอกสารใหม่</span>
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setFile(null); setMeta(emptyMeta(metaFields)); }}
                  className="btn px-1.5 py-1 text-[var(--text-3)]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="text-[11px]">ประเภทเอกสาร</label>
                  <Select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="premium-input w-full text-xs"
                    disabled={saving}
                  >
                    {types.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </Select>
                </div>
                {metaFields.map((f) => (
                  <div key={f.key} className="form-group">
                    <label className="text-[11px]">{f.label}</label>
                    <input
                      type={f.type || "text"}
                      value={meta[f.key] ?? ""}
                      onChange={(e) => setMeta((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="premium-input w-full text-xs"
                      disabled={saving}
                    />
                  </div>
                ))}
                <div className="form-group sm:col-span-2">
                  <label className="text-[11px]">ไฟล์เอกสาร</label>
                  <input
                    type="file"
                    accept={UPLOAD_ACCEPT_ATTR}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f && tooLarge(f)) { e.target.value = ""; setFile(null); return; }
                      setFile(f);
                    }}
                    className="premium-input w-full text-xs"
                    style={{ padding: "5px" }}
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setFile(null); setMeta(emptyMeta(metaFields)); }}
                  className="btn text-xs px-4"
                  disabled={saving}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleDetailedSave}
                  disabled={saving || !file}
                  className="btn btn-primary text-xs px-5"
                >
                  {saving ? "กำลังบันทึก..." : "บันทึกเอกสาร"}
                </button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-xs text-[var(--text-3)] italic py-4 text-center">ยังไม่มีเอกสารแนบ</p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const md = it.metadata || {};
                const mdLines = metaFields
                  .filter((f) => md[f.key] !== undefined && md[f.key] !== "" && md[f.key] != null)
                  .map((f) => `${f.label}: ${md[f.key]}`);
                return (
                  <div key={it.id} className="flex items-start justify-between gap-3 border border-[var(--border)] rounded-lg px-3 py-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <FileText size={18} className="text-[var(--text-3)] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="status-pill text-[10px]">{attachmentTypeLabel(it.entityType, it.docType)}</span>
                          <span className="text-xs font-medium text-[var(--text)] truncate">{it.fileName || "ไฟล์แนบ"}</span>
                        </div>
                        {mdLines.length > 0 && (
                          <div className="text-[11px] text-[var(--text-2)] mt-1 space-y-0.5">
                            {mdLines.map((l, i) => (<div key={i}>{l}</div>))}
                          </div>
                        )}
                        <div className="text-[10px] text-[var(--text-3)] mt-0.5">
                          {formatSize(it.sizeBytes)}
                          {it.uploadedByName ? ` · โดย ${it.uploadedByName}` : ""}
                          {it.createdAt ? ` · ${fmtDate(it.createdAt)}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a href={fileHref(it)} target="_blank" rel="noreferrer" className="btn px-2.5 py-1 text-[11px] flex items-center gap-1 border border-[var(--border)]">
                        <Download size={13} /> เปิด
                      </a>
                      {canEdit && (
                        <button type="button" onClick={() => handleDelete(it.id)} className="btn px-2.5 py-1 text-[11px] text-[var(--red)] flex items-center gap-1 border border-[var(--border)]">
                          <Trash2 size={13} /> ลบ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ───────── โหมดการ์ดเอกสารจำเป็น (customer/product) ───────── */
        <>
          <div className={`grid grid-cols-1 gap-3 ${cardColumns > 1 ? "sm:grid-cols-2" : ""}`}>
            {sortedTypes.map((t) => {
              const files = byType[t.key] || [];
              const has = files.length > 0;
              const busy = uploadingType === t.key;
              return (
                <div
                  key={t.key}
                  className="border rounded-lg p-3 flex flex-col"
                  style={{ borderColor: has ? "var(--green)" : "var(--border)" }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {has ? (
                        <CheckCircle2 size={16} className="text-[var(--green)] shrink-0" />
                      ) : (
                        <Circle size={16} className="text-[var(--text-3)] shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-[var(--text)] break-words leading-snug">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {busy ? (
                        <span
                          aria-hidden
                          title="กำลังอัปโหลด…"
                          style={{ width: 11, height: 11, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }}
                        />
                      ) : has ? (
                        <span className="status-pill success text-[10px]">มีแล้ว</span>
                      ) : t.required ? (
                        <span className="status-pill warning text-[10px]">ยังขาด</span>
                      ) : (
                        <span className="status-pill text-[10px]">ไม่บังคับ</span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => pickForType(t.key)}
                          disabled={busy}
                          className="btn-icon"
                          aria-label={has ? `เพิ่มไฟล์ ${t.label}` : `แนบไฟล์ ${t.label}`}
                          title={busy ? "กำลังอัปโหลด..." : has ? "เพิ่มไฟล์" : "แนบไฟล์"}
                          style={busy ? { opacity: 0.5 } : undefined}
                        >
                          {busy ? (
                            <span
                              aria-hidden
                              style={{ width: 13, height: 13, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }}
                            />
                          ) : (
                            <Plus size={15} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {has && (
                    <div className="divide-y divide-[var(--border)]">
                      {files.map((it) => (<FileRow key={it.id} it={it} compact />))}
                    </div>
                  )}

                  {!canEdit && !has && (
                    <span className="text-[11px] text-[var(--text-3)] italic">ยังไม่มีเอกสาร</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* ไฟล์อินพุตร่วมสำหรับทุกการ์ด */}
          {canEdit && (
            <input
              ref={cardFileRef}
              type="file"
              accept={UPLOAD_ACCEPT_ATTR}
              onChange={handleCardFile}
              className="hidden"
            />
          )}
        </>
      )}
    </div>
  );
}
