"use client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
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
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { describeResponseError } from "@/lib/fetchError";
import {
  Plus, Trash2, Download, Paperclip, X, CheckCircle2, Circle,
} from "lucide-react";
import Modal from "@/components/Modal";
import {
  ATTACHMENT_TYPES,
  ATTACHMENT_META_FIELDS,
  attachmentTypeLabel,
  documentValidity,
  isPreviewableImage,
  ISSUED_DATE_FIELD,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  UPLOAD_ACCEPT_ATTR,
} from "@/lib/master/attachmentTypes";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { businessDate } from "@/lib/businessDate";

// เช็คขนาดก่อนอัป (กันเสียแบนด์วิดท์อัปแล้วโดน server ปฏิเสธ). server บังคับซ้ำเสมอ.
function tooLarge(file) {
  if (file && file.size > MAX_UPLOAD_BYTES) {
    notifyToast.error(`ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_UPLOAD_MB} MB)`);
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

  // รูปที่กำลังเปิดดูขยาย (lightbox) — null = ปิดอยู่
  const [preview, setPreview] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      // no-store: กันเบราว์เซอร์ cache รายการไฟล์แนบ — ไม่งั้นคำตอบ [] ตอนเปิดหน้าครั้งแรก
      // ถูก cache ไว้ แล้วหลังแนบไฟล์+refresh เบราว์เซอร์หยิบ [] เก่ามาแสดง = ไฟล์ "หาย"
      const res = await fetch(
        `/api/master/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store" },
      );
      // 🐞 เดิมเป็น `if (res.ok) setItems(...)` เฉย ๆ ⇒ 403/500 กลายเป็นการ์ดเปล่า
      // ทุกใบ แยกไม่ออกจาก "ระเบียนนี้ยังไม่ได้แนบอะไร" · คนใช้เข้าใจว่าไฟล์หาย
      // ทั้งที่จริงคือรายการโหลดไม่ได้
      if (res.ok) setItems(await res.json());
      else notifyToast.error(await describeResponseError(res, "โหลดรายการเอกสารแนบไม่สำเร็จ"));
    } catch (err) {
      console.error(err);
      notifyToast.error("โหลดรายการเอกสารแนบไม่สำเร็จ — เครือข่ายขัดข้อง");
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
  // ⚠️ ตัวอัปจริงอยู่ที่ lib/master/attachmentUpload.js — โมดัลเปิดคำร้องใช้ตัวเดียวกัน
  // (มันอัปหลังคำร้องถูกสร้าง จึง render พาเนลนี้ไม่ได้) · ที่นี่เหลือหน้าที่ toast
  const upload = async (theFile, theDocType, theMeta) => {
    const { ok, error } = await uploadAttachment({
      entityType, entityId, file: theFile, docType: theDocType, metadata: theMeta,
    });
    if (!ok) notifyToast.error(error);
    return ok;
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
      notifyToast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploadingType(null);
      pendingTypeRef.current = null;
      if (cardFileRef.current) cardFileRef.current.value = "";
    }
  };

  // ── ลากมาวาง / วางจากคลิปบอร์ด ──
  // เข้าประเภทเอกสารตัวแรกของ entity เสมอ (โหมดที่มีการ์ดแยกประเภทไม่เปิดใช้ทางนี้
  // เพราะเดาไม่ได้ว่าผู้ใช้ตั้งใจวางลงการ์ดไหน)
  const acceptFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || !canEdit) return;
    const typeKey = types[0]?.key || "other";
    setUploadingType(typeKey);
    try {
      for (const f of files) {
        if (tooLarge(f)) continue;
        await upload(f, typeKey, {});
      }
      await fetchItems();
    } catch (err) {
      console.error(err);
      notifyToast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploadingType(null);
    }
    // upload ใช้ค่าจาก props/closure ที่คงที่ตลอดอายุ panel — ไม่ใส่ใน deps
    // เพื่อไม่ให้ handler ถูกสร้างใหม่ทุก render จนตัว listener หลุด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, types, fetchItems]);

  /* 🐞 เดิมเขียน onDrop/onPaste เองไว้ที่ `<div>` ของโหมด inline **โหมดเดียว** และ
     handler paste ที่ผูกกับ div เฉย ๆ ไม่ได้รับ event ถ้าไม่มีอะไรข้างในโฟกัสอยู่
     ⇒ ผู้ใช้จับภาพหน้าจอแล้วกด Ctrl+V ทันที (ลำดับที่คนทำจริง) ไม่เกิดอะไรขึ้นเลย
     · แผงเต็ม (ที่อยู่บนหน้ารายละเอียดทุกหน้า) ไม่มีทั้งลากและวาง
     ⇒ 2026-08-12 ย้ายมาใช้ทางเข้าไฟล์กลาง แล้วผูก **ทั้งสองโหมด** (IS-26080013) */
  const intake = useFileIntake({
    disabled: !canEdit,
    onFiles: acceptFiles,
    onOversize: (message) => notifyToast.error(message),
  });

  // ── detailed mode: บันทึกพร้อมรายละเอียด ──
  const handleDetailedSave = async () => {
    if (!file) {
      notifyToast.error("กรุณาเลือกไฟล์");
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
      notifyToast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction("ยืนยันการลบเอกสารนี้?"))) return;
    try {
      const res = await fetch(`/api/master/attachments/${id}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev.filter((it) => it.id !== id));
      // `(await res.json()).error` เดิมโยน exception เองถ้า body ไม่ใช่ JSON —
      // สาเหตุจริงเลยหายไปกลายเป็น "เกิดข้อผิดพลาดในการลบ" ของ catch ข้างล่าง
      else notifyToast.error(await describeResponseError(res, "ลบไม่สำเร็จ"));
    } catch {
      notifyToast.error("เกิดข้อผิดพลาดในการลบ");
    }
  };

  // บันทึกวันที่ออกเอกสารทันทีที่เลือก (ไม่มีปุ่มบันทึกแยก — ช่องเดียวช่องเดิม)
  // อัปเดต state ในมือก่อนเพื่อให้ป้าย "หมดอายุแล้ว/ใช้ได้ถึง" ขยับทันที แล้วถอย
  // กลับถ้า server ปฏิเสธ — ไม่งั้นจอโชว์ค่าที่ไม่ได้ถูกบันทึกจริง
  const saveIssuedDate = async (it, value) => {
    const before = it.metadata || {};
    const next = { ...before, [ISSUED_DATE_FIELD]: value };
    setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, metadata: next } : row)));
    try {
      const res = await fetch(`/api/master/attachments/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { [ISSUED_DATE_FIELD]: value } }),
      });
      if (!res.ok) {
        setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, metadata: before } : row)));
        notifyToast.error(await describeResponseError(res, "บันทึกวันที่ออกเอกสารไม่สำเร็จ"));
      }
    } catch {
      setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, metadata: before } : row)));
      notifyToast.error("บันทึกวันที่ออกเอกสารไม่สำเร็จ — เครือข่ายขัดข้อง");
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

  // วันนี้ (ISO ตามเวลาเครื่องผู้ใช้) — ใช้ตัดสินว่าเอกสารพ้นอายุหรือยัง · คำนวณ
  // ครั้งเดียวต่อ render เพื่อให้ทุกการ์ด/ทุกแถวตัดสินด้วยวันเดียวกัน
  const today = businessDate();

  // ไฟล์ Drive (private) เปิดผ่าน proxy ที่เช็กสิทธิ์ + stream; ไฟล์เก่าบน Supabase
  // (driveFileId ว่าง) ใช้ public URL ตรงเหมือนเดิม.
  const fileHref = (it) => (it.driveFileId ? `/api/master/attachments/${it.id}/file` : it.fileUrl);

  const FileRow = ({ it, compact }) => (
    <div className="flex items-center justify-between gap-2 text-xs py-1">
      {/* รูปแสดงเป็นภาพย่อ คลิกแล้วขยายในหน้า — ไม่ต้องเปิดแท็บใหม่เพื่อดูว่าคือรูปอะไร */}
      {isPreviewableImage(it) ? (
        <button
          type="button"
          onClick={() => setPreview(it)}
          className="flex items-center gap-1.5 min-w-0 text-[var(--text-2)] hover:text-[var(--accent)] bg-transparent border-0 p-0 text-left cursor-pointer"
          title="คลิกเพื่อดูรูปขนาดเต็ม"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileHref(it)}
            alt={it.fileName || "รูปแนบ"}
            loading="lazy"
            style={{
              width: 44, height: 44, objectFit: "cover", borderRadius: 6,
              border: "1px solid var(--border)", flexShrink: 0,
            }}
          />
          <span className="truncate">{it.fileName || "ไฟล์แนบ"}</span>
          {!compact && it.sizeBytes != null && (
            <span className="text-[10px] text-[var(--text-3)] shrink-0">({formatSize(it.sizeBytes)})</span>
          )}
        </button>
      ) : (
        <a
          href={fileHref(it)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 min-w-0 text-[var(--text-2)] hover:text-[var(--accent)] hover:underline"
        >
          <Paperclip size={14} className="shrink-0" />
          <span className="truncate">{it.fileName || "ไฟล์แนบ"}</span>
          {!compact && it.sizeBytes != null && (
            <span className="text-[10px] text-[var(--text-3)] shrink-0">({formatSize(it.sizeBytes)})</span>
          )}
        </a>
      )}
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

  // ── วันที่ออกเอกสาร (เฉพาะชนิดที่มีอายุ เช่น หนังสือรับรอง 6 เดือน) ──────
  // ⚠️ ต้องเป็นช่องแก้ได้ ไม่ใช่ถามแค่ตอนอัป: ไฟล์ที่แนบไว้ก่อนมีฟีเจอร์นี้ต้องเติม
  // วันที่ย้อนหลังได้ ไม่งั้นต้องลบทิ้งแล้วอัปใหม่เพียงเพื่อกรอกวันที่หนึ่งช่อง
  const IssuedDateRow = ({ it }) => {
    const validity = documentValidity(entityType, it, today);
    if (!validity) return null;
    return (
      <div className="flex items-center gap-2 flex-wrap pb-1 pl-[2px]">
        <span className="text-[10px] text-[var(--text-3)] shrink-0">ออกเมื่อ</span>
        {canEdit ? (
          <DateInput
            compact
            className="w-[150px]"
            value={validity.issuedDate}
            onChange={(iso) => saveIssuedDate(it, iso)}
            ariaLabel="วันที่ออกเอกสาร"
          />
        ) : (
          <span className="text-[10px] text-[var(--text-2)]">{validity.issuedDate || "—"}</span>
        )}
        {validity.unknown ? (
          <span className="status-pill warning text-[10px]" title={`เอกสารนี้ต้องออกไม่เกิน ${validity.months} เดือน — ยังไม่รู้ว่าหมดอายุหรือยัง`}>
            ยังไม่ระบุวันที่
          </span>
        ) : validity.expired ? (
          <span className="status-pill danger text-[10px]" title={`ใช้ได้ถึง ${validity.expiresAt}`}>หมดอายุแล้ว</span>
        ) : (
          <span className="text-[10px] text-[var(--text-3)]">ใช้ได้ถึง {validity.expiresAt}</span>
        )}
      </div>
    );
  };

  // ── ตารางภาพย่อ (โหมด inline) ────────────────────────────────────────
  // รูปแนบของ "รายการในเคส/สินค้าในใบ" คือของที่ RD/PC เปิดดูเพื่อตอบราคา — ภาพย่อ
  // ขนาดแถวข้อความเล็กเกินกว่าจะดูออกว่าเป็นขวดทรงไหน จึงแยกรูปออกมาเป็นตารางภาพ
  // ขนาดใช้งานได้จริง (แนวเดียวกับฟีดความเคลื่อนไหวของดีล) ส่วนไฟล์ที่ไม่ใช่รูป
  // (PDF/สเปก) ยังเป็นแถวรายชื่อเหมือนเดิม เพราะภาพย่อของมันไม่ได้บอกอะไร
  const PhotoGrid = ({ photos }) => (
    <div
      className="mt-2"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
        gap: 8,
      }}
    >
      {photos.map((it) => (
        <div key={it.id} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setPreview(it)}
            title={it.fileName || "ดูรูปขนาดเต็ม"}
            style={{
              display: "block", width: "100%", aspectRatio: "1 / 1", padding: 0,
              border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
              background: "var(--panel-2)", cursor: "pointer",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileHref(it)}
              alt={it.fileName || "รูปแนบ"}
              loading="lazy"
              /* IS-26080016: contain ไม่ใช่ cover — cover ครอปสกรีนช็อต/รูปสินค้าทิ้ง
                 จนดูไม่ออกว่าเป็นอะไร (เหตุผลเต็มใน UpdateThread.module.css) */
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => handleDelete(it.id)}
              aria-label={`ลบ ${it.fileName || "รูปแนบ"}`}
              title="ลบ"
              style={{
                position: "absolute", top: 4, right: 4, width: 22, height: 22,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                border: "none", borderRadius: "50%", cursor: "pointer", lineHeight: "var(--lh-none)",
                background: "color-mix(in srgb, var(--navy) 72%, transparent)",
                color: "var(--navy-fg)",
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  // กล่องดูรูปขนาดเต็ม — ใช้ Modal ของระบบ (จัดการ Escape/โฟกัสให้แล้ว)
  const lightbox = (
    <Modal
      open={!!preview}
      onClose={() => setPreview(null)}
      title={preview?.fileName || "รูปแนบ"}
      size="lg"
      closeOnOverlay
    >
      {preview && (
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileHref(preview)}
            alt={preview.fileName || "รูปแนบ"}
            style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)" }}
          />
          <div style={{ marginTop: 12 }}>
            <a
              href={fileHref(preview)} target="_blank" rel="noreferrer"
              className="btn sm"
            >
              <Download size={13} /> เปิดไฟล์ต้นฉบับ
            </a>
          </div>
        </div>
      )}
    </Modal>
  );

  if (inlineUpload) {
    const inlineType = types[0]?.key || "other";
    const busy = uploadingType === inlineType;

    return (
      <div className="mt-1" {...intake.zoneProps}>
        {/* ⭐ **คำใบ้อยู่แถวเดียวกับปุ่ม** (มติผู้ใช้ 2026-08-13 · IS-26080021)
            🐞 เดิมคำใบ้เป็น <p> ใต้แถวปุ่ม ⇒ กล่องไฟล์กินสองบรรทัดโดยที่บรรทัดบนมีแต่
            ปุ่มลอยชิดขวา และที่ว่างกลางแถวไม่มีอะไรเลย · ผู้ใช้ส่งภาพมาว่าโล่งทั้งสองจุด
            ⇒ คำใบ้ชิดซ้าย ปุ่มชิดขวา บรรทัดเดียว — ที่ว่างกลางแถวมีของอยู่แล้ว
            ⚠️ `flex-wrap` กันจอแคบ: คำใบ้ยาว 40 ตัวอักษร บีบกับปุ่มแล้วตัดคำมั่ว */}
        <div className="flex min-h-8 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {/* ⚠️ คำสั้น "ลากมาวาง · Ctrl+V" ไม่ใช่ประโยคเต็ม — กล่องนี้ไปโผล่ในรางขวา
              ที่กว้างแค่ 292px ด้วย · ประโยคเต็ม 40 ตัวอักษรบวกปุ่มแล้วตกบรรทัด
              ⇒ กล่องเดียวกันสูงไม่เท่ากันสองที่ในหน้าเดียว (ผู้ใช้ทักเอง) */}
          {canEdit && (
            <p className="mr-auto text-[10px] text-[var(--text-3)]">
              ลากมาวาง · Ctrl+V
            </p>
          )}
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

        {!loading && items.length > 0 && (() => {
          const photos = items.filter(isPreviewableImage);
          const files = items.filter((it) => !isPreviewableImage(it));
          return (
            <>
              {photos.length > 0 && <PhotoGrid photos={photos} />}
              {files.length > 0 && (
                <div className="mt-1 divide-y divide-[var(--border)]">
                  {files.map((it) => (<FileRow key={it.id} it={it} compact />))}
                </div>
              )}
            </>
          );
        })()}

        {canEdit && (
          <input
            ref={cardFileRef}
            type="file"
            accept={UPLOAD_ACCEPT_ATTR}
            onChange={handleCardFile}
            className="hidden"
          />
        )}
        {lightbox}
      </div>
    );
  }

  return (
    <div className="glass-panel p-[20px]" {...intake.zoneProps}>
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
                      <Paperclip size={18} className="text-[var(--text-3)] shrink-0 mt-0.5" />
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
              // แนบแล้วแต่ทุกใบพ้นอายุ = ยังใช้ยื่นไม่ได้ ⇒ ต้องไม่โชว์ติ๊กเขียว "มีแล้ว"
              // (ด่านอนุมัติฝั่ง server คิดแบบเดียวกัน — ดู missingRequiredDocs)
              const expired = has && files.every((f) => documentValidity(entityType, f, today)?.expired);
              const busy = uploadingType === t.key;
              return (
                <div
                  key={t.key}
                  className="border rounded-lg p-3 flex flex-col"
                  style={{ borderColor: expired ? "var(--red)" : has ? "var(--green)" : "var(--border)" }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {has && !expired ? (
                        <CheckCircle2 size={16} className="text-[var(--green)] shrink-0" />
                      ) : (
                        <Circle size={16} className={`shrink-0 ${expired ? "text-[var(--red)]" : "text-[var(--text-3)]"}`} />
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
                      ) : expired ? (
                        <span className="status-pill danger text-[10px]">หมดอายุ</span>
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
                      {files.map((it) => (
                        <div key={it.id}>
                          <FileRow it={it} compact />
                          <IssuedDateRow it={it} />
                        </div>
                      ))}
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
      {/* คำเดียวกับโหมด inline — ผู้ใช้ต้องรู้ว่าทำได้ ไม่งั้นความสามารถนี้ก็เท่ากับไม่มี
          (คนที่แจ้ง IS-26080013 คือคนที่ไม่รู้ว่ามีอยู่ในบางจอมาตลอด) */}
      {canEdit && !loading && (
        <p className="mt-3 text-[10px] text-[var(--text-3)]">
          ลากไฟล์มาวาง หรือวางรูปจากคลิปบอร์ด (Ctrl+V) ได้
        </p>
      )}
      {lightbox}
    </div>
  );
}
