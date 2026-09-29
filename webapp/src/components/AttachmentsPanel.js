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
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { fmtDate, naText } from "@/lib/format";
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { describeResponseError } from "@/lib/fetchError";
import {
  Plus, Trash2, Download, Paperclip, X, CheckCircle2, Circle,
  Eye, FileType, FileSpreadsheet, Link2, Lock, Camera, Check,
} from "lucide-react";
import {
  PHOTO_DELETE_LABEL,
  photoDeleteConfirm,
  photoTilesView,
  runAttachmentUploads,
} from "@/lib/master/attachmentPhotoTiles";
import Button from "@/components/ui/Button";
import GoogleDocViewer from "@/components/GoogleDocViewer";
import ReasonDialog from "@/components/ui/ReasonDialog";
import { googleDocKindLabel, googleDocPreviewUrl, isGoogleDoc } from "@/lib/master/googleDocView";
import { attachmentHref } from "@/lib/master/attachmentStorage";
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
  ACCEPTED_IMAGE_MIME,
  attachmentFileRuleError,
  docTypeFileRule,
} from "@/lib/master/attachmentTypes";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { useFileIntake } from "@/lib/ui/useFileIntake";
import { businessDate } from "@/lib/businessDate";
import PhotoThumb from "@/components/ui/PhotoThumb";
import { apiFetch } from "@/lib/apiFetch";
import styles from "./AttachmentsPanel.module.css";

// เช็คขนาดก่อนอัป (กันเสียแบนด์วิดท์อัปแล้วโดน server ปฏิเสธ). server บังคับซ้ำเสมอ.
/* โหมด `photoCapture` รับเฉพาะรูปในทะเบียนชนิดที่ระบบเปิดดูได้ — iOS แปลง HEIC ให้เองตามลิสต์นี้
   ⚠️ ห้ามเขียนเป็นสตริง "image" + "/*" ติดกันในไฟล์ .js — ด่านอ่านซอร์สของ UI ล้างคอมเมนต์
      แบบไม่รู้จักสตริง ⇒ "/*" ในสตริงกลืนโค้ดหลังจากนั้นทั้งก้อน (keyboardClickable.test.mjs
      มีรายการของที่เคยโดนแล้ว: CloseVisitSheet) */
const PHOTO_ACCEPT_ATTR = ACCEPTED_IMAGE_MIME.join(",");

function tooLarge(file) {
  if (file && file.size > MAX_UPLOAD_BYTES) {
    notifyToast.error(`ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_UPLOAD_MB} MB)`);
    return true;
  }
  return false;
}

/* ไฟล์ที่ docType นี้ไม่รับ (กติกาอยู่ที่ `DOC_TYPE_FILE_RULES`) — แยกออกก่อนอัป ไม่ทิ้งทั้งชุด
   ⭐ ภาพประกอบใบสเปครับเฉพาะรูป (มติผู้ใช้ 2026-09-22) · ⚠️ POST ของเส้นไฟล์แนบตรวจซ้ำเสมอ
   — ที่นี่แค่กันไม่ให้อัปไบต์ขึ้น Drive ฟรี ๆ แล้วค่อยโดนตีกลับ */
function splitByFileRule(docType, files) {
  const accepted = [];
  const rejected = [];
  for (const file of files) {
    const error = attachmentFileRuleError(docType, file);
    if (error) rejected.push(error);
    else accepted.push(file);
  }
  if (rejected.length) notifyToast.error(rejected.join(" · "));
  return accepted;
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
  /* (items, { loaded }) => void — แจ้งรายการเอกสารปัจจุบัน (ใช้บังคับแนบก่อนยื่น)
     ⚠️ **`loaded` ไม่ใช่ของฟุ่มเฟือย** — ก้อนแรกที่ยิงออกไปคือ `[]` ตั้งแต่ก่อนโหลดเสร็จ
     และเวลาโหลดไม่สำเร็จก็ได้ `[]` เหมือนกัน · ผู้เรียกที่เอาจำนวนไปแสดงบนจอต้องแยก
     "ยังไม่รู้" ออกจาก "ไม่มีไฟล์" ให้ได้ ไม่งั้นจะเดาเองแล้วเดาผิดคนละแบบ
     (ของจริง: การ์ดพื้นที่เคยใช้กติกา "ก้อนว่างก้อนแรกไม่นับ" แล้วพื้นที่ที่ไฟล์ถูกลบ
      หมดจากที่อื่นค้างเลขรูปเก่าไว้ตลอด) */
  onItemsChange,
  cardColumns = 2, // การ์ดเอกสารจำเป็น: จำนวนคอลัมน์สูงสุด (1 = แถวละใบ เห็นชื่อเต็ม)
  inlineUpload = false, // แสดง action แนบไฟล์และรายการไฟล์แบบไม่มีการ์ด
  // เปิดปุ่มสร้าง/ผูก Google Doc·Sheet (เอกสารมีชีวิต) — เฉพาะ entity ที่มีโฟลเดอร์
  // ของตัวเองบน Drive · ปุ่ม "ดู" ของแถวเอกสาร Google **ขึ้นเสมอ** ไม่ต้องรอ flag นี้
  // เพราะการอ่านไม่ใช่การเพิ่มของ (จอที่แค่แสดงผลก็ควรเปิดดูได้)
  googleDocs = false,
  // ปิดทางอัปไฟล์นิ่ง (ปุ่ม · ลากมาวาง · Ctrl+V) เหลือแต่เอกสารร่วม — ใช้กับโครงการ
  // ซึ่งเป็นที่รวมของหลายดีล: ไฟล์หลักฐานต้องผูกดีลรายใบ ไม่งั้นไม่รู้ว่าของดีลไหน
  // ⚠️ ไม่ใช่แค่ซ่อนปุ่ม — ถอด zoneProps ด้วย ไม่งั้นลากไฟล์มาวางแล้วอัปขึ้นจริง
  // ทั้งที่ไม่มีปุ่มให้กด (ทางลับที่ไม่มีใครตั้งใจเปิด)
  fileUploads = true,
  // โหมด inline: ตัวนับ "N ไฟล์" บนแถวหัว — ปิดได้เมื่อหัวข้อของผู้เรียกบอกจำนวนอยู่แล้ว
  // 🐞 จอผลวัดพื้นที่: หัวข้อ "1 รูป" แล้วมีแถวที่มีแค่ "1 ไฟล์" ซ้ำอยู่ข้างล่างทุกบล็อก
  showCount = true,
  // ใครได้ Ctrl+V ตอน **ไม่มีอะไรโฟกัสอยู่** — 0 = ได้ก่อน · 1 = ถอยให้กล่องอื่น
  // 🔑 หน้าที่มีกล่องรับไฟล์หลายกล่องพร้อมกัน (จอประเมิน: หนึ่งกล่องต่อหัวข้อรูป
  //    คูณจำนวนพื้นที่ที่กางอยู่) ต้องบอกได้ว่ากล่องไหนคือ "ที่ผู้ใช้กำลังทำอยู่"
  //    ไม่งั้นตัวเลือกปริยายคือ **กล่องแรกใน DOM** = รูปไปโผล่ผิดพื้นที่จริง ๆ
  //    (แผงนี้อัปขึ้น server ทันที ของที่ไปผิดที่คือของที่ต้องตามลบ)
  intakeWeight = 0,
  /* โหมด inline: `(photos) => [{ id, content }]` — เปลี่ยนตะแกรงรูปเป็น **รายการรายแถว**
     รูปอยู่ซ้าย ของที่ผู้เรียกเขียนกำกับรูปนั้นอยู่ขวาในบรรทัดเดียวกัน
     (มติผู้ใช้ 2026-09-21 · เหตุผลและกับดักอยู่ที่ `renderPhotoRows`)
     ⚠️ ลำดับแถวเป็นของผู้เรียก · id ที่ไม่มีรูปคู่กันถูกข้าม (ไฟล์เพิ่งถูกลบ) */
  photoRows,
  /* โหมด inline: **ปุ่ม "ถ่ายรูป" ขนาดนิ้ว** แทนลิงก์ "แนบไฟล์" ตัวจิ๋ว (มติผู้ใช้ 2026-09-21)
     — จอหน้างานของช่าง (มือถือ) · รับเฉพาะรูป เลือกได้หลายรูปต่อครั้ง
     ⚠️ **ไม่ใส่ `capture`** — `capture` บังคับเปิดกล้องอย่างเดียว ช่างที่ถ่ายไว้ก่อนแล้วเลือก
       จากคลังไม่ได้ · ไม่ใส่ = มือถือถามให้เลือกระหว่างกล้องกับคลังรูปเอง
     ⚠️ คำใบ้ "ลากมาวาง · Ctrl+V" ซ่อนบนจอสัมผัส (ไม่มีทั้งเมาส์และคีย์บอร์ดให้ทำตาม) */
  photoCapture = false,
  /* โหมด inline + `photoCapture`: **แผ่นรูป** แทนตะแกรง (แผน §10.5 จอหน้างานแบบ A · ม็อก A-3/AT-2/AW-1)
     — รูปที่ขึ้นแล้ว → รูปที่กำลังส่ง ("กำลังส่ง 64%" รายรูป) → แผ่นสุดท้าย "ถ่าย / เลือกรูป"
     ⚠️ ไม่มีแถวหัว (คำใบ้ · ปุ่มถ่ายรูป · ตัวนับ) — แผ่นสุดท้ายคือปุ่ม และจำนวนรูปเป็นของหัวข้อผู้เรียก
     ⚠️ แผ่นรูปแตะแล้ว **เปิดดูอย่างเดียว** · ลบอยู่ในกล่องดูรูปเต็ม ปุ่ม 44px (× 22px มุมรูปต่ำกว่าเป้านิ้ว)
     ⚠️ ขนาดแผ่นปรับผ่านตัวแปร CSS ของผู้เรียก `--attach-tile-cols` / `--attach-tile-h` (ไม่ใช่ prop — ขนาดที่ต้องการ
        ต่างตามจอ ตอบได้ใน media query เท่านั้น) · ใช้ `photoRows` ไม่ได้
     ตรรกะอยู่ที่ `lib/master/attachmentPhotoTiles.js` — ที่นี่วาดอย่างเดียว */
  photoTiles = false,
  /* `(busy: boolean) => void` — มีรูป/ไฟล์กำลังอัปอยู่ไหม (แผนลงมือ §3.7: หน้านับเองแล้วโหลดตัวนับใหม่เมื่อจบ ·
     ถามก่อนออกจากหน้าระหว่างรูปยังขึ้นไม่เสร็จ)
     ⚠️ **ยิงจากลูปอัปเอง ไม่ใช่จาก effect** — ช่างปิดหน้าพื้นที่ระหว่างอัป (กด "ถัดไป") ลูปยังวิ่งต่อจนจบ
        และต้องบอก `false` ให้ได้ · effect ของแผงที่ถูกถอดแล้วไม่มีวันรัน = หน้าค้าง "กำลังอัป" ตลอดไป
     ⚠️ ยิงคู่ `true`/`false` ต่อหนึ่งชุด — สองชุดวิ่งซ้อนกันได้ (แตะแผ่นถ่ายรูปซ้ำระหว่างรูปแรกยังส่ง)
        ⇒ ผู้เรียกต้อง **นับ** ไม่ใช่เก็บเป็นธงเดียว */
  onBusyChange,
  /* `(item) => boolean` — ลบ **ไฟล์ใบนี้** ได้ไหม (ด่านรายไฟล์ ต่อจาก `canEdit`) · ไม่ส่ง = ตาม `canEdit`
     ⭐ ใบสั่งขาย (มติ 25/09): แนบได้ทั้งทีม แต่ลบได้เฉพาะคนแนบเอง+แอดมิน — API ปฏิเสธอยู่แล้ว
       ที่นี่คือไม่ยื่นปุ่มที่กดแล้วจะเจอ 403 */
  canDeleteItem,
}) {
  const types = (docTypes && docTypes.length ? docTypes : ATTACHMENT_TYPES[entityType]) || [];
  // แถวที่ปิดเนื้อหาไว้ลบไม่ได้ด้วย — คนที่เปิดดูไม่ได้ ไม่ควรทำลายหลักฐานได้
  const mayDelete = (it) => canEdit && !it.restricted
    && (typeof canDeleteItem === "function" ? canDeleteItem(it) : true);
  const metaFields = ATTACHMENT_META_FIELDS[entityType] || [];
  const detailed = metaFields.length > 0; // order = ฟอร์มรายละเอียด; อื่นๆ = การ์ด
  // แผ่นรูปมีความหมายเฉพาะกล่องรูปของโหมด inline — ส่งมากับโหมดอื่น = ไม่มีผล (หน้าตาเดิม)
  const tilesMode = photoTiles && inlineUpload && photoCapture;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  /* รายการนี้ "อ่านมาได้จริงแล้ว" หรือยัง — ต่างจาก `loading` ตรงที่โหลดไม่สำเร็จก็จบ
     การโหลดเหมือนกัน แต่ยังไม่รู้ว่ามีไฟล์กี่ใบ (ดูหัวข้อ `onItemsChange`) */
  const [loaded, setLoaded] = useState(false);
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

  // ── โหมดแผ่นรูป: กองรูปที่กำลังส่ง (ชื่อ + %) · คีย์นับเองไม่ซ้ำตลอดอายุแผง ──
  const [uploads, setUploads] = useState([]);
  const uploadSeqRef = useRef(0);
  /* ตัวเรียกกลับตัวล่าสุด — ลูปอัปอ่านผ่าน ref เพราะมันวิ่งข้ามหลายรอบวาด (และข้ามการถอดแผง)
     ค่าที่ปิดไว้ในลูปตั้งแต่ตอนเริ่มอาจเป็นฟังก์ชันของรอบวาดเก่า */
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  // รูปที่กำลังเปิดดูขยาย (lightbox) — null = ปิดอยู่
  const [preview, setPreview] = useState(null);
  // เอกสาร Google ที่กำลังเปิดดูในหน้า — null = ปิดอยู่ (คนละกล่องกับ lightbox
  // เพราะเนื้อในเป็น iframe ข้ามโดเมน ไม่ใช่ <img> ของเราเอง)
  const [docPreview, setDocPreview] = useState(null);
  const [addingDoc, setAddingDoc] = useState(false);
  // กล่องกรอกชื่อ/ลิงก์เอกสารร่วม — { mode: 'create'|'link', type?, value }
  const [docForm, setDocForm] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      // no-store: กันเบราว์เซอร์ cache รายการไฟล์แนบ — ไม่งั้นคำตอบ [] ตอนเปิดหน้าครั้งแรก
      // ถูก cache ไว้ แล้วหลังแนบไฟล์+refresh เบราว์เซอร์หยิบ [] เก่ามาแสดง = ไฟล์ "หาย"
      const res = await apiFetch(
        `/api/master/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        { cache: "no-store" },
      );
      // 🐞 เดิมเป็น `if (res.ok) setItems(...)` เฉย ๆ ⇒ 403/500 กลายเป็นการ์ดเปล่า
      // ทุกใบ แยกไม่ออกจาก "ระเบียนนี้ยังไม่ได้แนบอะไร" · คนใช้เข้าใจว่าไฟล์หาย
      // ทั้งที่จริงคือรายการโหลดไม่ได้
      if (res.ok) { setItems(await res.json()); setLoaded(true); }
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
    onItemsChange?.(items, { loaded });
  }, [items, loaded, onItemsChange]);

  // ── เอกสารมีชีวิต (Google Doc/Sheet) ────────────────────────────────────
  // ⚠️ ไม่มีขั้นอัปไฟล์ — server เป็นคนคุยกับ Drive แล้วบันทึกแถวให้ในคำขอเดียว
  // client ส่งได้แค่ "จะสร้างชนิดไหน" หรือ "จะผูกลิงก์ไหน" (ดู api/attachments)
  const addGoogleDoc = async (google) => {
    setAddingDoc(true);
    try {
      const res = await apiFetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, docType: "other", google }),
      });
      if (!res.ok) {
        notifyToast.error(await describeResponseError(res, "สร้างเอกสารไม่สำเร็จ"));
        return;
      }
      await fetchItems();
    } catch {
      notifyToast.error("สร้างเอกสารไม่สำเร็จ — เครือข่ายขัดข้อง");
    } finally {
      setAddingDoc(false);
    }
  };
  // ⚠️ ห้ามใช้ prompt() — scripts/audit-ui.mjs ตีกลับ (กล่องของเบราว์เซอร์อยู่นอก
  // ระบบ feedback ของแอป: ไม่มีธีม ไม่มีโฟกัสแทร็ป และบนมือถือบางตัวถูกบล็อกเงียบ)
  const submitDocForm = () => {
    if (!docForm) return;
    const value = String(docForm.value || "").trim();
    if (docForm.mode === "link") addGoogleDoc({ mode: "link", url: value });
    else addGoogleDoc({ mode: "create", type: docForm.type, name: value });
    setDocForm(null);
  };

  // อัปไฟล์ขึ้น storage แล้วบันทึก metadata row. คืน true ถ้าสำเร็จ.
  // ⚠️ ตัวอัปจริงอยู่ที่ lib/master/attachmentUpload.js — โมดัลเปิดคำร้องใช้ตัวเดียวกัน
  // (มันอัปหลังคำร้องถูกสร้าง จึง render พาเนลนี้ไม่ได้) · ที่นี่เหลือหน้าที่ toast
  const upload = async (theFile, theDocType, theMeta, onProgress = null) => {
    const { ok, error } = await uploadAttachment({
      entityType, entityId, file: theFile, docType: theDocType, metadata: theMeta, onProgress,
    });
    if (!ok) notifyToast.error(error);
    return ok;
  };

  /* ── ลูปอัปตัวเดียวของทุกทางเข้าไฟล์ (ปุ่ม · แผ่นถ่ายรูป · ลากวาง · Ctrl+V) ──
     ลำดับ busy → ทีละไฟล์ → โหลดรายการใหม่ → ปิด busy อยู่ที่ `runAttachmentUploads` (เทสต์ได้)
     ⚠️ นับ % เฉพาะโหมดแผ่นรูป — โหมดเดิมไม่มีที่วาด % ⇒ ไม่ต้องวาดแผงใหม่ทุกจังหวะของ xhr
     ⚠️ อ่านแค่ ref/ค่าที่คงที่ตลอดอายุแผง — `acceptFiles` ข้างล่างเก็บฟังก์ชันนี้ไว้ข้ามรอบวาด */
  const uploadBatch = (typeKey, files) => runAttachmentUploads({
    batch: files.map((file) => {
      uploadSeqRef.current += 1;
      return { key: `up-${uploadSeqRef.current}`, name: file.name, file };
    }),
    upload: (file, onProgress) => upload(file, typeKey, {}, onProgress),
    setUploads: tilesMode ? setUploads : null,
    setBusy: (busy) => {
      setUploadingType(busy ? typeKey : null);
      onBusyChangeRef.current?.(busy);
    },
    reload: fetchItems,
    onError: (err) => {
      console.error(err);
      notifyToast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    },
  });

  // ── card mode: อัปไฟล์เข้าประเภทที่กดในการ์ด ──
  /* ชนิดไฟล์ที่ปุ่มเลือกไฟล์ยอม — docType ที่มีกติกาแคบกว่า (ภาพประกอบใบสเปค = รูปเท่านั้น)
     ใช้กติกาของมัน · ⚠️ ช่องเลือกไฟล์ใช้ร่วมทุกการ์ด ⇒ ตั้ง `accept` ก่อนเปิดทุกครั้ง
     ไม่งั้นการ์ดที่รับทุกชนิดเปิดตัวเลือกที่ถูกบีบเหลือแค่รูปตามการ์ดก่อนหน้า */
  const defaultAccept = photoCapture ? PHOTO_ACCEPT_ATTR : UPLOAD_ACCEPT_ATTR;
  const acceptFor = (typeKey) => docTypeFileRule(typeKey)?.accept || defaultAccept;
  const cardAccept = acceptFor(types.length === 1 ? types[0]?.key : null);
  const pickForType = (typeKey) => {
    pendingTypeRef.current = typeKey;
    if (cardFileRef.current) cardFileRef.current.accept = acceptFor(typeKey);
    cardFileRef.current?.click();
  };
  const handleCardFile = async (e) => {
    /* หลายไฟล์ต่อครั้งมาได้เฉพาะโหมด `photoCapture` (input มี `multiple`) — ไฟล์ที่ใหญ่เกิน
       ข้ามทีละไฟล์ ไม่ทิ้งทั้งชุด (ช่างเลือกมาห้ารูป ใหญ่รูปเดียว ต้องได้อีกสี่) */
    const typeKey = pendingTypeRef.current;
    const picked = Array.from(e.target.files || []);
    /* ⚠️ ปล่อยช่องเลือกไฟล์ **ทันทีที่อ่านแล้ว** ไม่ใช่ตอนอัปจบ — โหมดแผ่นรูปแตะ "ถ่าย / เลือกรูป"
       ซ้ำได้ระหว่างชุดแรกยังส่ง · 🐞 ถ้าล้างตอนจบ ชุดแรกที่จบระหว่างตัวเลือกไฟล์ของชุดสองเปิดอยู่จะลบ
       ประเภทที่ชุดสองจองไว้ ⇒ รูปที่เลือกมาหายเงียบ (ไฟล์ที่ copy ออกมาแล้วยังใช้ได้หลังล้างช่อง) */
    pendingTypeRef.current = null;
    if (cardFileRef.current) cardFileRef.current.value = "";
    const files = splitByFileRule(typeKey, picked);
    if (!files.length || !typeKey) return;
    const ok = files.filter((f) => !tooLarge(f));
    if (!ok.length) return;
    await uploadBatch(typeKey, ok);
  };

  // ── ลากมาวาง / วางจากคลิปบอร์ด ──
  // เข้าประเภทเอกสารตัวแรกของ entity เสมอ (โหมดที่มีการ์ดแยกประเภทไม่เปิดใช้ทางนี้
  // เพราะเดาไม่ได้ว่าผู้ใช้ตั้งใจวางลงการ์ดไหน)
  const acceptFiles = useCallback(async (fileList) => {
    const typeKey = types[0]?.key || "other";
    const files = splitByFileRule(typeKey, Array.from(fileList || []).filter(Boolean));
    if (!files.length || !canEdit) return;
    const ok = files.filter((f) => !tooLarge(f));
    if (!ok.length) return;
    await uploadBatch(typeKey, ok);
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
    weight: intakeWeight,
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

  /* คืน `true` เมื่อลบสำเร็จ — กล่องดูรูปเต็มของโหมดแผ่นรูปปิดตัวเองเฉพาะตอนลบได้จริง
     (ลบไม่สำเร็จ = รูปยังอยู่ ⇒ กล่องต้องค้างให้เห็นว่ารูปยังอยู่ ไม่ใช่ปิดแล้วเหมือนลบไปแล้ว)
     `ask` = คำถามของผู้เรียก (รูปพูดว่า "ลบรูปนี้?" · เอกสารพูดแบบเดิม) */
  const handleDelete = async (id, ask = "ยืนยันการลบเอกสารนี้?") => {
    if (!(await confirmAction(ask))) return false;
    try {
      const res = await apiFetch(`/api/master/attachments/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== id));
        /* ⭐ รูปประกอบสเปคที่เอกสาร FM-SA-04 ซึ่งยื่น/อนุมัติแล้วอ้างอยู่ = **ปลดระวาง** แทนการลบ
           (mig 0370 · ไฟล์ต้องอยู่ให้กระดาษเก่าเปิดได้) ⇒ เส้นลบตอบ `{ retired, message }`
           ต้องบอกผู้ใช้ ไม่งั้นเข้าใจว่าไฟล์ถูกลบไปแล้วจริง */
        const body = await res.json().catch(() => null);
        if (body?.retired && body.message) notifyToast.info(body.message);
        return true;
      }
      // `(await res.json()).error` เดิมโยน exception เองถ้า body ไม่ใช่ JSON —
      // สาเหตุจริงเลยหายไปกลายเป็น "เกิดข้อผิดพลาดในการลบ" ของ catch ข้างล่าง
      notifyToast.error(await describeResponseError(res, "ลบไม่สำเร็จ"));
    } catch {
      notifyToast.error("เกิดข้อผิดพลาดในการลบ");
    }
    return false;
  };

  // ลบจากกล่องดูรูปเต็ม (โหมดแผ่นรูป) — ถามด้วยชื่อรูป · ปิดกล่องเมื่อลบได้จริงเท่านั้น
  const deletePreview = async () => {
    const it = preview;
    if (!it) return;
    if (await handleDelete(it.id, photoDeleteConfirm(it))) setPreview(null);
  };

  // บันทึกวันที่ออกเอกสารทันทีที่เลือก (ไม่มีปุ่มบันทึกแยก — ช่องเดียวช่องเดิม)
  // อัปเดต state ในมือก่อนเพื่อให้ป้าย "หมดอายุแล้ว/ใช้ได้ถึง" ขยับทันที แล้วถอย
  // กลับถ้า server ปฏิเสธ — ไม่งั้นจอโชว์ค่าที่ไม่ได้ถูกบันทึกจริง
  const saveIssuedDate = async (it, value) => {
    const before = it.metadata || {};
    const next = { ...before, [ISSUED_DATE_FIELD]: value };
    setItems((prev) => prev.map((row) => (row.id === it.id ? { ...row, metadata: next } : row)));
    try {
      const res = await apiFetch(`/api/master/attachments/${it.id}`, {
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
  // กติกาอยู่ที่ `attachmentStorage` ที่เดียว — หน้าสัญญาเปิดไฟล์เองด้วยตัวเดียวกันนี้
  const fileHref = (it) => attachmentHref(it);

  /* ⚠️ **แถว/ช่องย่อยของแผงนี้เป็นฟังก์ชันวาด (`renderX(...)`) ไม่ใช่ component (`<X />`)**
     🐞 2026-09-22 ช่องคำบรรยายภาพของใบสเปคสินค้า พิมพ์ได้ทีละตัวแล้วเคอร์เซอร์หลุด —
       `PhotoRows` เคยประกาศเป็น component ข้างในฟังก์ชันนี้ ⇒ ทุกครั้งที่แผงวาดใหม่ (ผู้เรียก
       พิมพ์หนึ่งตัว = `photoRows` ตัวใหม่) React เห็นเป็น "ชนิดใหม่" แล้วทิ้งทั้งกิ่งสร้างใหม่
       ช่องที่ผู้เรียกฝากมาใน `row.content` จึงหลุดโฟกัสทุกตัวอักษร (รูปย่อก็ถูกสร้างใหม่ทุกครั้งด้วย)
     ⇒ เรียกเป็นฟังก์ชันให้มันเป็นส่วนหนึ่งของต้นไม้ของแผงเอง · ห้ามเปลี่ยนกลับเป็น `<X />`
       (เทสต์ `attachmentsPanelRender.test.mjs` กันไว้) · ห้ามใช้ hook ข้างในฟังก์ชันพวกนี้ */
  const renderFileRow = ({ it, compact }) => (
    <div className="flex items-center justify-between gap-2 text-xs py-1">
      {/* ⭐ เอกสารส่วนบุคคลของลูกค้าที่คนนอกทีมผู้ดูแลไม่มีสิทธิ์เปิด (มติผู้ใช้ 2026-08-16)
          — API ส่งแถวมาแบบปิดเนื้อหาไว้ (`restricted`) เพื่อให้การ์ด "เอกสารบังคับ" ยัง
          นับได้ถูกว่ามีแล้ว · ที่นี่จึงต้องเป็น **ข้อความ ไม่ใช่ลิงก์** ไม่งั้นคนกดแล้วเจอ
          403 เปล่า ๆ โดยไม่รู้ว่าเพราะอะไร */}
      {it.restricted ? (
        <span className="flex items-center gap-1.5 min-w-0 text-[var(--text-3)]" title="เปิดได้เฉพาะทีมผู้ดูแลลูกค้ารายนี้">
          <Lock size={14} className="shrink-0" />
          <span className="truncate">{it.fileName || "เอกสารส่วนบุคคล"}</span>
        </span>
      ) : isPreviewableImage(it) ? (
        <button
          type="button"
          onClick={() => setPreview(it)}
          className="flex items-center gap-1.5 min-w-0 text-[var(--text-2)] hover:text-[var(--accent)] bg-transparent border-0 p-0 text-left cursor-pointer"
          title="คลิกเพื่อดูรูปขนาดเต็ม"
        >
          <PhotoThumb
            src={fileHref(it)}
            alt={it.fileName || "รูปแนบ"}
            label="เปิดไม่ได้"
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
          {/* เอกสารมีชีวิตได้ไอคอนของตัวเอง — แยกจากไฟล์นิ่งด้วยสายตา ไม่ต้องอ่านชื่อ
              ⚠️ FileType/FileSpreadsheet ตามที่ DocsPanel ใช้ · **ห้าม FileText**
              ซึ่งสงวนไว้ให้ใบเสนอราคาตัวเดียวทั้งระบบ (lib/entityIcon.test.mjs) */}
          {isGoogleDoc(it)
            ? (it.metadata?.kind === "gsheet"
              ? <FileSpreadsheet size={14} className="shrink-0 text-[var(--accent)]" />
              : <FileType size={14} className="shrink-0 text-[var(--accent)]" />)
            : <Paperclip size={14} className="shrink-0" />}
          <span className="truncate">{it.fileName || "ไฟล์แนบ"}</span>
          {!compact && it.sizeBytes != null && (
            <span className="text-[10px] text-[var(--text-3)] shrink-0">({formatSize(it.sizeBytes)})</span>
          )}
        </a>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {/* ⭐ "ดู" = เปิดในหน้า (อ่านอย่างเดียว) · ชื่อไฟล์ด้านซ้ายยังพาไปแก้ที่ Google
            เหมือนเดิม — สองอย่างนี้ทำคนละเรื่อง ยุบเหลือปุ่มเดียวไม่ได้
            ⚠️ ไม่โชว์ถ้าประกอบลิงก์ /preview ไม่ได้ (แถวเก่าที่ไม่มี googleFileId) */}
        {googleDocPreviewUrl(it) && (
          <button
            type="button"
            onClick={() => setDocPreview(it)}
            className="flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[11px] text-[var(--text-2)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            title={`ดู${googleDocKindLabel(it)}ในหน้านี้`}
          >
            <Eye size={13} /> ดู
          </button>
        )}
        {/* แถวที่ปิดเนื้อหาไว้ลบไม่ได้ด้วย (ดู `mayDelete`) — API ก็ปฏิเสธอยู่แล้วผ่าน
            canEditAttachmentParent · ที่นี่คือไม่ยื่นปุ่มให้กด */}
        {mayDelete(it) && (
          <button
            type="button"
            onClick={() => handleDelete(it.id)}
            className="text-[var(--red)] p-0.5 hover:opacity-70"
            title="ลบ"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );

  // ── วันที่ออกเอกสาร (เฉพาะชนิดที่มีอายุ เช่น หนังสือรับรอง 6 เดือน) ──────
  // ⚠️ ต้องเป็นช่องแก้ได้ ไม่ใช่ถามแค่ตอนอัป: ไฟล์ที่แนบไว้ก่อนมีฟีเจอร์นี้ต้องเติม
  // วันที่ย้อนหลังได้ ไม่งั้นต้องลบทิ้งแล้วอัปใหม่เพียงเพื่อกรอกวันที่หนึ่งช่อง
  const renderIssuedDateRow = ({ it }) => {
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
          <span className="text-[10px] text-[var(--text-2)]">{naText(validity.issuedDate)}</span>
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
  /* หนึ่งช่องรูป — ตัวเดียวที่ทั้งตะแกรง (`renderPhotoGrid`) และรายการรายแถว (`renderPhotoRows`)
     ใช้ร่วมกัน ⇒ ปุ่มลบกับกล่องดูรูปเต็มมีทางเดียว ไม่ใช่สองชุดที่เพี้ยนหากันวันหนึ่ง */
  const renderPhotoTile = ({ it }) => (
    <div style={{ position: "relative" }}>
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
        {/* ⚠️ ช่องที่เปิดรูปไม่ได้ต้องพูด — ตรรกะอยู่ใน `PhotoThumb` ตัวเดียวของระบบ
            (เธรดอัปเดตใช้ตัวเดียวกัน · เหตุผลและกับดัก SSR อยู่ในไฟล์นั้น)
            IS-26080016: contain ไม่ใช่ cover — cover ครอปสกรีนช็อต/รูปสินค้าทิ้ง
            จนดูไม่ออกว่าเป็นอะไร (เหตุผลเต็มใน UpdateThread.module.css) */}
        <PhotoThumb
          src={fileHref(it)}
          alt={it.fileName || "รูปแนบ"}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </button>
      {mayDelete(it) && (
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
  );

  /* ⭐ **รูปกับของที่ผู้เรียกเขียนกำกับรูป อยู่บรรทัดเดียวกัน** (มติผู้ใช้ 2026-09-21)
     🐞 ใบสเปคสินค้า: คำบรรยายที่จะพิมพ์ใต้ภาพเคยเป็นตารางแยกใต้ตะแกรงรูป ⇒ คนกรอก
       ต้องเทียบชื่อไฟล์เองว่าแถวไหนของรูปไหน · รูปเดียวยังพอเดา สิบรูปคือเดาผิด
     ผู้เรียกส่ง **ลำดับแถวมาเอง** เพราะลำดับที่จะพิมพ์เป็นเรื่องของผู้เรียก ไม่ใช่
     ลำดับที่ API คืนมา — และรูปที่ผู้เรียกไม่ได้สั่งให้ขึ้น ก็ไม่ขึ้น */
  const renderPhotoRows = ({ photos, rows }) => {
    const byId = new Map(photos.map((it) => [it.id, it]));
    return (
      <div className={styles.photoRows}>
        {rows.map((row) => {
          const it = byId.get(row.id);
          if (!it) return null;
          return (
            <div key={row.id} className={styles.photoRow}>
              <div className={styles.photoRowThumb}>{renderPhotoTile({ it })}</div>
              <div className={styles.photoRowBody}>{row.content}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPhotoGrid = ({ photos }) => (
    <div
      className="mt-2"
      /* 🐞 **เดิม `minmax(148px, 1fr)`** — พอกล่องแม่กว้างพอดีหนึ่งช่อง (การ์ดขวา
         กว้าง 292px) ช่องเดียวนั้นยืดเป็น 1fr ⇒ **รูปแนบใบเดียวได้สี่เหลี่ยม
         292×292** กินความสูงการ์ดทั้งใบ (ผู้ใช้ส่งภาพมา 2026-08-15) · ยิ่งจอกว้าง
         ยิ่งบานเพราะ aspect-ratio 1/1 ผูกความสูงกับความกว้าง
         ⇒ `minmax(0, 148px)` = ช่องโตได้ไม่เกิน 148px แต่ยังหดลงได้บนจอแคบมาก
         🪦 เคยมีตัวแปร CSS `--attach-thumb-w` / `--attach-thumb-ratio` ให้ผู้เรียกปรับขนาด — ผู้เรียกสองรายสุดท้าย
            (การ์ดพื้นที่ · ช่องผังของตารางสรุป) ย้ายไปใช้แผ่นรูป `photoTiles` แล้ว (UAT 25/09) ⇒ ถอดทิ้ง ไม่ปล่อยเป็นปุ่มลอย
            ที่ไม่มีใครตั้ง (ด่าน tokenRefsDeclared) · ต้องการขนาดอื่น = ใช้ `photoTiles` + `--attach-tile-*` */
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(0, 148px))",
        gap: 8,
      }}
    >
      {photos.map((it) => (<Fragment key={it.id}>{renderPhotoTile({ it })}</Fragment>))}
    </div>
  );

  /* ── แผ่นรูป (โหมด `photoTiles`) — ม็อก A-3 · AT-2 · AW-1 ─────────────────────────────
     ลำดับและคำมาจาก `photoTilesView` · ที่นี่วาดอย่างเดียว
     ⚠️ **ไม่มีปุ่มลบบนแผ่น** — ลบอยู่ในกล่องดูรูปเต็ม (ปุ่ม 44px) · แผ่นรูปแตะแล้วเปิดดู
     ⚠️ % มาทาง attribute ของ `<progress>` ไม่ใช่ `style={{ width }}` — ชั้น inline style ของ audit:ui
        เป็นเพดานที่ขึ้นไม่ได้ (ท่าเดียวกับแถบเก็บเงินของ /finance/payments)
     ⚠️ แผ่นกำลังส่งไม่ใช่ live region — % ขยับทุกจังหวะของ xhr ถ้าประกาศทุกครั้งโปรแกรมอ่านจอพูดไม่หยุด
        (ค่าอยู่ที่ `<progress>` ให้ถามเองได้) */
  const renderPhotoTiles = ({ photos, canAdd, addType }) => {
    const { tiles } = photoTilesView({ photos, uploads, canAdd, canDelete: mayDelete });
    if (!tiles.length) return null;
    return (
      <div className={styles.tiles}>
        {tiles.map((tile) => {
          if (tile.kind === "photo") {
            return (
              <button
                key={tile.key}
                type="button"
                className={styles.tile}
                onClick={() => setPreview(tile.item)}
                aria-label={tile.ariaLabel}
                title={tile.name}
              >
                {/* ภาพย่อที่เปิดไม่ได้ต้องพูด — `PhotoThumb` ตัวเดียวของระบบ · contain ไม่ใช่ cover (IS-26080016) */}
                <PhotoThumb src={fileHref(tile.item)} alt="" className={styles.tileImg} />
                <span className={styles.tileChip}><Check size={11} aria-hidden="true" />{tile.chip}</span>
                <span className={styles.tileName}>{tile.name}</span>
              </button>
            );
          }
          if (tile.kind === "upload") {
            return (
              <div key={tile.key} className={styles.tile} data-kind="upload">
                <span className={styles.tilePct}>{tile.text}</span>
                <progress className={styles.tileBar} value={tile.value} max={1} aria-label={tile.ariaLabel} />
                <span className={styles.tileName}>{tile.name}</span>
              </div>
            );
          }
          return (
            <button
              key={tile.key}
              type="button"
              className={styles.tile}
              data-kind="add"
              onClick={() => pickForType(addType)}
            >
              <Camera size={22} aria-hidden="true" />
              {tile.label}
              <small className={`${styles.tileHint} ${styles.pointerOnly}`}>{tile.hint}</small>
            </button>
          );
        })}
      </div>
    );
  };

  /* กล่องดูรูปขนาดเต็ม — ใช้ Modal ของระบบ (จัดการ Escape/โฟกัสให้แล้ว)
     ⭐ โหมดแผ่นรูป: **ที่เดียวที่ลบรูปได้** — ปุ่มแถบท้ายสูง 44px (แผ่นรูปไม่มี × 22px) · ด่านรายไฟล์
        `mayDelete` ตัวเดียวกับโหมดอื่น · ปุ่มเปิดไฟล์ต้นฉบับย้ายลงแถบท้ายคู่กัน (นิ้วเดียวกันกดได้ทั้งคู่)
     โหมดอื่นหน้าตาเดิมเป๊ะ (ลิงก์เล็กใต้รูป ไม่มีแถบท้าย) */
  const lightbox = (
    <Modal
      open={!!preview}
      onClose={() => setPreview(null)}
      title={preview?.fileName || "รูปแนบ"}
      size="lg"
      closeOnOverlay
      footer={tilesMode && preview ? (
        <div className={styles.lightboxActions}>
          <Button
            as="a" href={fileHref(preview)} target="_blank" rel="noreferrer"
            className={styles.lightboxBtn} icon={<Download size={16} aria-hidden="true" />}
          >
            เปิดไฟล์ต้นฉบับ
          </Button>
          {tilesMode && preview && mayDelete(preview) && (
            <Button
              tone="danger" variant="outline" className={styles.lightboxBtn}
              icon={<Trash2 size={16} aria-hidden="true" />} onClick={deletePreview}
            >
              {PHOTO_DELETE_LABEL}
            </Button>
          )}
        </div>
      ) : undefined}
    >
      {preview && (
        <div style={{ textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileHref(preview)}
            alt={preview.fileName || "รูปแนบ"}
            style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)" }}
          />
          {!tilesMode && (
            <div style={{ marginTop: 12 }}>
              <a
                href={fileHref(preview)} target="_blank" rel="noreferrer"
                className="btn sm"
              >
                <Download size={13} /> เปิดไฟล์ต้นฉบับ
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );

  const docViewer = (
    <>
      <GoogleDocViewer
        open={!!docPreview}
        title={docPreview?.fileName}
        previewUrl={googleDocPreviewUrl(docPreview)}
        editUrl={docPreview?.fileUrl}
        onClose={() => setDocPreview(null)}
      />
      {/* กล่องกรอกของระบบแทน prompt() — ReasonDialog คือช่องกรอกข้อความช่องเดียว
          ที่ audit ยอมรับ (ดูหัวข้อ nativeFeedbackDebt ใน scripts/audit-ui.mjs) */}
      <ReasonDialog
        open={!!docForm}
        title={docForm?.mode === "link" ? "ผูกเอกสาร Google ที่มีอยู่" : `สร้าง ${docForm?.type === "gsheet" ? "Sheet" : "Doc"} ใหม่`}
        description={docForm?.mode === "link"
          ? "เอกสารยังอยู่ที่เดิมบน Drive — ระบบเก็บแค่ลิงก์กับชื่อไว้แสดงในหน้านี้"
          : "ไฟล์เปล่าจะถูกสร้างในโฟลเดอร์ของระเบียนนี้บน Shared Drive ของบริษัท"}
        label={docForm?.mode === "link" ? "ลิงก์เอกสาร" : "ชื่อเอกสาร"}
        value={docForm?.value || ""}
        onChange={(value) => setDocForm((f) => (f ? { ...f, value } : f))}
        onClose={() => setDocForm(null)}
        onConfirm={submitDocForm}
        confirmLabel={docForm?.mode === "link" ? "ผูกเอกสาร" : "สร้าง"}
        placeholder={docForm?.mode === "link"
          ? "https://docs.google.com/document/d/..."
          : "เช่น ร่างสเปกกลิ่น รอบ 2"}
        rows={1}
        tone="info"
        busy={addingDoc}
      />
    </>
  );

  // แถวปุ่มสร้าง/ผูกเอกสารมีชีวิต — คู่กับปุ่มแนบไฟล์ พร้อมคำต่อท้ายที่สอนความต่าง
  // ⭐ ต้องบอกตรงจุดที่คนกำลังเลือก ไม่ใช่ในเอกสารที่ไม่มีใครอ่าน — ไม่งั้นคนอัป PDF
  // ที่ตั้งใจจะแก้ต่อ แล้วมาถามทีหลังว่าทำไมแก้ไม่ได้
  const googleDocActions = googleDocs && canEdit && (
    <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-[var(--border)] pt-1.5">
      <p className="mr-auto text-[10px] text-[var(--text-3)]">เอกสารร่วม — แก้ได้หลายคน</p>
      {[
        { key: "link", label: "ผูกลิงก์", Icon: Link2, onClick: () => setDocForm({ mode: "link", value: "" }) },
        { key: "gdoc", label: "Doc", Icon: FileType, onClick: () => setDocForm({ mode: "create", type: "gdoc", value: "" }) },
        { key: "gsheet", label: "Sheet", Icon: FileSpreadsheet, onClick: () => setDocForm({ mode: "create", type: "gsheet", value: "" }) },
      ].map(({ key, label, Icon, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          disabled={addingDoc}
          className="inline-flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );

  if (inlineUpload) {
    const inlineType = types[0]?.key || "other";
    const busy = uploadingType === inlineType;
    /* 🐞 **พาเนลที่ประกาศหัวข้อของตัวเองแล้ว ยังโชว์ไฟล์ของหัวข้ออื่นด้วย** — จอบันทึก
       หน้างานมีพาเนลสามอัน (ภาพกว้าง · ภาพผัง · ภาพจุดติดตั้ง) ที่ชี้ entity เดียวกัน
       ⇒ อัปภาพกว้างหนึ่งรูป แล้วมันไปโผล่ครบทั้งสามหัวข้อ และเลข "N ไฟล์" ของทุกอัน
         เท่ากันหมด ทั้งที่ตัวนับบนหัวข้อ (`surveyDocCounts`) นับแยกถูกต้อง
       ⇒ ช่างอ่านว่า "ภาพผังมีแล้ว" ทั้งที่ยังไม่มี
       ⚠️ กรองเฉพาะเมื่อผู้เรียก **ประกาศ `docTypes` มาเอง** — ผู้เรียกอีก 11 จุดที่ส่งแค่
         `inlineUpload` ใช้ทะเบียนของ entity ทั้งชุด กรองแล้วไฟล์ของเขาจะหาย */
    const scoped = Array.isArray(docTypes) && docTypes.length === 1;
    const shown = scoped ? items.filter((it) => it.docType === inlineType) : items;
    const tilePhotos = loading ? [] : shown.filter(isPreviewableImage);

    return (
      <div className="mt-1" {...(fileUploads ? intake.zoneProps : {})}>
        {/* ⭐ **คำใบ้อยู่แถวเดียวกับปุ่ม** (มติผู้ใช้ 2026-08-13 · IS-26080021)
            🐞 เดิมคำใบ้เป็น <p> ใต้แถวปุ่ม ⇒ กล่องไฟล์กินสองบรรทัดโดยที่บรรทัดบนมีแต่
            ปุ่มลอยชิดขวา และที่ว่างกลางแถวไม่มีอะไรเลย · ผู้ใช้ส่งภาพมาว่าโล่งทั้งสองจุด
            ⇒ คำใบ้ชิดซ้าย ปุ่มชิดขวา บรรทัดเดียว — ที่ว่างกลางแถวมีของอยู่แล้ว
            ⚠️ `flex-wrap` กันจอแคบ: คำใบ้ยาว 40 ตัวอักษร บีบกับปุ่มแล้วตัดคำมั่ว */}
        {/* แถวหัวมีของให้โชว์เฉพาะเมื่อแนบได้ หรือผู้เรียกยังให้นับไฟล์ — ไม่งั้นเป็นแถวเปล่า 32px */}
        {/* โหมดแผ่นรูปไม่มีแถวนี้ — แผ่นสุดท้ายคือปุ่ม · คำใบ้ลากวางอยู่บนแผ่นนั้น · จำนวนรูปเป็นของหัวข้อผู้เรียก */}
        {((canEdit && fileUploads) || showCount) && !tilesMode && (
        <div className="flex min-h-8 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {/* ⚠️ คำสั้น "ลากมาวาง · Ctrl+V" ไม่ใช่ประโยคเต็ม — กล่องนี้ไปโผล่ในรางขวา
              ที่กว้างแค่ 292px ด้วย · ประโยคเต็ม 40 ตัวอักษรบวกปุ่มแล้วตกบรรทัด
              ⇒ กล่องเดียวกันสูงไม่เท่ากันสองที่ในหน้าเดียว (ผู้ใช้ทักเอง) */}
          {canEdit && fileUploads && (
            <p className={`mr-auto text-[10px] text-[var(--text-3)] ${photoCapture ? styles.pointerOnly : ""}`}>
              ลากมาวาง · Ctrl+V
            </p>
          )}
          {canEdit && fileUploads && photoCapture && (
            /* ⚠️ **ป้ายสองชุดซ้อนในช่องเดียวกัน** (ปกติ · กำลังอัป) แล้วซ่อนตัวที่ไม่ใช้ด้วย
               `visibility` ⇒ ปุ่มกว้างเท่าป้ายที่ยาวกว่าเสมอ ไม่ขยับตอนเริ่ม/จบการอัป
               🐞 ป้ายสลับตรง ๆ = ปุ่มกว้างขึ้นตอนอัป ⇒ ช่องแคบ (1196–1249px · 1280) แถวหัวข้อตกบรรทัด
                  แล้วรูปย่อกระโดด · และห้ามเหลือแค่วงหมุน: ปุ่มจาง+วงที่หยุด (reduced motion) อ่าน
                  เหมือนปุ่มกดไม่ได้เฉย ๆ ⇒ ต้องมีคำ "กำลังอัป…" (ตัวที่มองไม่เห็นหลุดจากชื่อที่อ่านออกเสียงเอง) */
            <Button
              variant="outline"
              className={styles.captureBtn}
              onClick={() => pickForType(inlineType)}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {/* ⚠️ ซ้อน **ทั้งชั้น** (ไอคอน+คำ) ไม่ใช่ซ้อนแค่คำ — ซ้อนแค่คำแล้วช่องกว้างเท่า "กำลังอัป…"
                  ป้ายปกติที่สั้นกว่าลอยกลางช่อง ไอคอนกล้องห่างคำเป็นสองเท่าของปุ่มอื่นทั้งระบบ */}
              <span className={styles.captureLabel}>
                <span className={styles.captureLayer} data-off={busy ? "1" : undefined}>
                  <Camera size={16} aria-hidden="true" />
                  <span className={styles.touchOnly}>ถ่ายรูป</span>
                  <span className={styles.pointerOnly}>แนบรูป</span>
                </span>
                <span className={styles.captureLayer} data-off={busy ? undefined : "1"}>
                  <span className={styles.captureSpin} aria-hidden="true" />
                  กำลังอัป…
                </span>
              </span>
            </Button>
          )}
          {canEdit && fileUploads && !photoCapture && (
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
          {showCount && !loading && shown.length > 0 && (
            <span className="text-[11px] text-[var(--text-3)]">{shown.length} ไฟล์</span>
          )}
        </div>
        )}

        {googleDocActions}

        {/* โหมดแผ่นรูป: แผ่นถ่ายรูปขึ้นตั้งแต่ก่อนรายการโหลดจบ — ถ่ายได้โดยไม่ต้องรอรายการ
            (ไฟล์ที่ไม่ใช่รูป ซึ่งมาทางลากวาง/Ctrl+V ได้ ยังเป็นแถวรายชื่อข้างล่างเหมือนเดิม) */}
        {tilesMode && renderPhotoTiles({ photos: tilePhotos, canAdd: canEdit && fileUploads, addType: inlineType })}

        {!loading && shown.length > 0 && (() => {
          const photos = shown.filter(isPreviewableImage);
          const files = shown.filter((it) => !isPreviewableImage(it));
          const rowsOf = !tilesMode && typeof photoRows === "function" ? photoRows(photos) : null;
          return (
            <>
              {!tilesMode && photos.length > 0 && (rowsOf ? renderPhotoRows({ photos, rows: rowsOf }) : renderPhotoGrid({ photos }))}
              {files.length > 0 && (
                <div className="mt-1 divide-y divide-[var(--border)]">
                  {files.map((it) => (<Fragment key={it.id}>{renderFileRow({ it, compact: true })}</Fragment>))}
                </div>
              )}
            </>
          );
        })()}

        {canEdit && (
          <input
            ref={cardFileRef}
            type="file"
            accept={cardAccept}
            multiple={photoCapture || undefined}
            onChange={handleCardFile}
            className="hidden"
          />
        )}
        {lightbox}
        {docViewer}
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
                    {/* ช่องวันที่ใช้ตัวเลือกวันของระบบ (อา.–ส. · มติเจ้าของ 26/09 สัปดาห์เริ่มวันอาทิตย์) — `<input type="date">` ดิบ
                        วาดปฏิทินตาม locale ของเครื่อง (en-GB เริ่มวันจันทร์) · ค่ายังเป็น ISO เหมือนเดิม */}
                    {f.type === "date" ? (
                      <DateInput
                        className="w-full"
                        value={meta[f.key] ?? ""}
                        onChange={(iso) => setMeta((m) => ({ ...m, [f.key]: iso }))}
                        disabled={saving}
                        ariaLabel={f.label}
                      />
                    ) : (
                      <input
                        type={f.type || "text"}
                        value={meta[f.key] ?? ""}
                        onChange={(e) => setMeta((m) => ({ ...m, [f.key]: e.target.value }))}
                        className="premium-input w-full text-xs"
                        disabled={saving}
                      />
                    )}
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
                      {mayDelete(it) && (
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
                          {renderFileRow({ it, compact: true })}
                          {renderIssuedDateRow({ it })}
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
      {googleDocActions}
      {lightbox}
      {docViewer}
    </div>
  );
}
