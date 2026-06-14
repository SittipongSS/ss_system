"use client";
// เอกสารแนบหลายไฟล์แบบมีประเภท (migration 0028) — ใช้ซ้ำได้ทุก entity.
// props:
//   entityType  'customer' | 'product' | 'order'
//   entityId    id ของ entity
//   canEdit     แสดงปุ่มอัปโหลด/ลบ (false = อ่านอย่างเดียว)
//   title       หัวข้อ panel (ค่าเริ่มต้น "เอกสารแนบ")
//   note        คำอธิบายเล็กใต้หัวข้อ (optional)
//
// entity ที่มี ATTACHMENT_META_FIELDS (เช่น order) จะแสดงฟอร์มรายละเอียด
// (เลขใบเสร็จ/วันที่ชำระ/ยอด/อ้างอิงออเดอร์ ฯลฯ) ตอนแนบ และโชว์ค่าในลิสต์.
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus, Trash2, Download, Paperclip, X } from "lucide-react";
import {
  ATTACHMENT_TYPES,
  ATTACHMENT_META_FIELDS,
  attachmentTypeLabel,
} from "@/lib/master/attachmentTypes";

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
}) {
  const types = ATTACHMENT_TYPES[entityType] || [];
  const metaFields = ATTACHMENT_META_FIELDS[entityType] || [];
  const detailed = metaFields.length > 0; // entity ที่ต้องเก็บรายละเอียด (order)

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState(types[0]?.key || "other");
  const [showAdd, setShowAdd] = useState(false);
  const [meta, setMeta] = useState(() => emptyMeta(metaFields));
  const [file, setFile] = useState(null);
  const quickInputRef = useRef(null);

  const fetchItems = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await fetch(
        `/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
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

  // อัปไฟล์ขึ้น storage แล้วบันทึก metadata row. คืน true ถ้าสำเร็จ.
  const upload = async (theFile, theDocType, theMeta) => {
    const fd = new FormData();
    fd.append("file", theFile);
    fd.append("customerName", `${entityType}-${entityId}`); // ใช้เป็นชื่อโฟลเดอร์
    const up = await fetch("/api/upload", { method: "POST", body: fd });
    if (!up.ok) {
      alert("อัปโหลดไฟล์ไม่สำเร็จ");
      return false;
    }
    const { url } = await up.json();
    const res = await fetch("/api/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
        docType: theDocType,
        fileUrl: url,
        fileName: theFile.name,
        mimeType: theFile.type || null,
        sizeBytes: theFile.size,
        metadata: theMeta,
      }),
    });
    if (!res.ok) {
      alert((await res.json()).error || "บันทึกเอกสารไม่สำเร็จ");
      return false;
    }
    return true;
  };

  // โหมดเร็ว (customer/product) — เลือกไฟล์แล้วอัปทันที
  const handleQuickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      if (await upload(f, docType, {})) await fetchItems();
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploading(false);
      if (quickInputRef.current) quickInputRef.current.value = "";
    }
  };

  // โหมดรายละเอียด (order) — กรอกฟอร์ม + เลือกไฟล์ แล้วกดบันทึก
  const handleDetailedSave = async () => {
    if (!file) {
      alert("กรุณาเลือกไฟล์");
      return;
    }
    setUploading(true);
    try {
      // เก็บเฉพาะฟิลด์ที่กรอก (ตัดค่าว่างออก)
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
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("ยืนยันการลบเอกสารนี้?")) return;
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev.filter((it) => it.id !== id));
      else alert((await res.json()).error || "ลบไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาดในการลบ");
    }
  };

  return (
    <div className="glass-panel p-[20px]">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4 gap-3 flex-wrap">
        <h3 className="font-semibold text-sm text-[var(--text)] flex items-center gap-2">
          <Paperclip size={16} className="text-[var(--accent)]" />
          {title}
          <span className="text-[var(--text-3)] font-normal">({items.length})</span>
        </h3>
        {canEdit && !detailed && (
          <div className="flex items-center gap-2">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="premium-input text-xs"
              style={{ width: "auto", minWidth: "160px" }}
              disabled={uploading}
            >
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => quickInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary px-3 text-xs flex items-center gap-1.5"
            >
              <Plus size={14} /> {uploading ? "กำลังอัปโหลด..." : "แนบไฟล์"}
            </button>
            <input
              ref={quickInputRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={handleQuickFile}
              className="hidden"
            />
          </div>
        )}
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

      {/* ฟอร์มเพิ่มเอกสารแบบรายละเอียด (order) */}
      {canEdit && detailed && showAdd && (
        <div className="border border-[var(--border)] rounded-lg p-3 mb-4 bg-[var(--panel-2)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--text)]">เพิ่มเอกสารใหม่</span>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setFile(null);
                setMeta(emptyMeta(metaFields));
              }}
              className="btn px-1.5 py-1 text-[var(--text-3)]"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label className="text-[11px]">ประเภทเอกสาร</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="premium-input w-full text-xs"
                disabled={uploading}
              >
                {types.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {metaFields.map((f) => (
              <div key={f.key} className="form-group">
                <label className="text-[11px]">{f.label}</label>
                <input
                  type={f.type || "text"}
                  value={meta[f.key] ?? ""}
                  onChange={(e) => setMeta((m) => ({ ...m, [f.key]: e.target.value }))}
                  className="premium-input w-full text-xs"
                  disabled={uploading}
                />
              </div>
            ))}
            <div className="form-group sm:col-span-2">
              <label className="text-[11px]">ไฟล์เอกสาร</label>
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="premium-input w-full text-xs"
                style={{ padding: "5px" }}
                disabled={uploading}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setFile(null);
                setMeta(emptyMeta(metaFields));
              }}
              className="btn text-xs px-4"
              disabled={uploading}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleDetailedSave}
              disabled={uploading || !file}
              className="btn btn-primary text-xs px-5"
            >
              {uploading ? "กำลังบันทึก..." : "บันทึกเอกสาร"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[var(--text-3)] py-4 text-center">กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--text-3)] italic py-4 text-center">
          ยังไม่มีเอกสารแนบ
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const md = it.metadata || {};
            const mdLines = metaFields
              .filter((f) => md[f.key] !== undefined && md[f.key] !== "" && md[f.key] != null)
              .map((f) => `${f.label}: ${md[f.key]}`);
            return (
              <div
                key={it.id}
                className="flex items-start justify-between gap-3 border border-[var(--border)] rounded-lg px-3 py-2"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <FileText size={18} className="text-[var(--text-3)] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="status-pill text-[10px]">
                        {attachmentTypeLabel(it.entityType, it.docType)}
                      </span>
                      <span className="text-xs font-medium text-[var(--text)] truncate">
                        {it.fileName || "ไฟล์แนบ"}
                      </span>
                    </div>
                    {mdLines.length > 0 && (
                      <div className="text-[11px] text-[var(--text-2)] mt-1 space-y-0.5">
                        {mdLines.map((l, i) => (
                          <div key={i}>{l}</div>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-[var(--text-3)] mt-0.5">
                      {formatSize(it.sizeBytes)}
                      {it.uploadedByName ? ` · โดย ${it.uploadedByName}` : ""}
                      {it.createdAt
                        ? ` · ${new Date(it.createdAt).toLocaleDateString("th-TH")}`
                        : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={it.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn px-2.5 py-1 text-[11px] flex items-center gap-1 border border-[var(--border)]"
                  >
                    <Download size={13} /> เปิด
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(it.id)}
                      className="btn px-2.5 py-1 text-[11px] text-[var(--red)] flex items-center gap-1 border border-[var(--border)]"
                    >
                      <Trash2 size={13} /> ลบ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
