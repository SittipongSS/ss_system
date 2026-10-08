// ── แถวไฟล์ที่ "แผงไฟล์แนบ" โชว์และนับ — ตัวคัดล้วน (ไม่แตะ DOM · มีเทสต์) ──────────────
//
// 🐞 08/10/2569: แผงดึงไฟล์ **ทุกใบ** ของ entity มา แล้วโยน docType ที่ไม่มีการ์ดลงกอง "เอกสารอื่นๆ"
//    ⇒ ชนิดที่จอเฉพาะทางเป็นเจ้าของ (รูปของแถว checklist ใบสเปค) ไปโผล่บนหน้าสินค้า ถูกนับในหัวแผง
//    และมีปุ่มลบให้กด ทั้งที่ตัวชี้ของแถว checklist ยังชี้อยู่
// ⭐ ชนิดที่ทะเบียนกลางประกาศว่า "ไม่ขึ้นแผง" (`PANEL_HIDDEN_DOC_TYPES`) ถูกตัดออกก่อนจัดกอง/นับ/วาด
//    **ยกเว้นแผงที่ผู้เรียกขอชนิดนั้นมาเอง** ผ่าน `docTypes` (จอเจ้าของเรื่อง)
// ⚠️ `onItemsChange` ของแผงยังได้รายการดิบครบทุกใบ — ผู้เรียกบางตัวคัดตาม docType เอง
import { isPanelHiddenDocType } from "@/lib/master/attachmentTypes";

/**
 * @param items     แถว attachments ทั้งหมดของ entity
 * @param docTypes  การ์ดที่ผู้เรียกประกาศเอง (prop `docTypes` ของแผง) — ไม่ส่ง = ใช้ทะเบียนของ entity
 */
export function panelVisibleItems(items, entityType, docTypes) {
  const asked = new Set((Array.isArray(docTypes) ? docTypes : []).map((t) => t?.key).filter(Boolean));
  return (items || []).filter((it) => asked.has(it?.docType) || !isPanelHiddenDocType(entityType, it?.docType));
}

/** จัดกองตามการ์ด — docType ที่ไม่มีการ์ด → 'other' (ของเดิม) */
export function panelItemsByType(visibleItems, types) {
  const knownKeys = new Set((types || []).map((t) => t.key));
  const byType = {};
  for (const it of visibleItems || []) {
    const k = knownKeys.has(it.docType) ? it.docType : "other";
    (byType[k] ||= []).push(it);
  }
  return byType;
}
