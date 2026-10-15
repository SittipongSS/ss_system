// ── แถวไฟล์ที่ "แผงไฟล์แนบ" โชว์และนับ — ตัวคัดล้วน (ไม่แตะ DOM · มีเทสต์) ──────────────
//
// 🐞 08/10/2569: แผงดึงไฟล์ **ทุกใบ** ของ entity มา แล้วโยน docType ที่ไม่มีการ์ดลงกอง "เอกสารอื่นๆ"
//    ⇒ ชนิดที่จอเฉพาะทางเป็นเจ้าของ (รูปของแถว checklist ใบสเปค) ไปโผล่บนหน้าสินค้า ถูกนับในหัวแผง
//    และมีปุ่มลบให้กด ทั้งที่ตัวชี้ของแถว checklist ยังชี้อยู่
//    · ภาพประกอบใบสเปคก็เป็นแบบเดียวกันมาตั้งแต่ต้น (การ์ดถูกตัด แต่ไฟล์ยังตกกอง "อื่นๆ") — เข้าชุดเดียวกันแล้ว 08/10/2569
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

/**
 * ด่านไฟล์ของผู้เรียก (prop `fileGate` ของแผง · ประเมินจากแบบ งวด S2b) — คัดไฟล์ที่ผู้เรียกไม่รับออก **ก่อน** กติการาย docType
 *   `fileGate`: `{ accept, test: (file) => boolean, rejectText, pickLabel?, hideDropHint? }` — แผงไม่รู้ว่าทำไมไม่รับ ผู้เรียกบอกเอง
 *   (ช่องภาพแบบของพื้นที่จากแบบ = JPG/PNG เท่านั้น เพราะเอกสารประเมินวาดได้สองชนิดนี้)
 * ⭐ ทางเข้าไฟล์ทุกทางของแผง (ปุ่ม · ลากมาวาง · Ctrl+V) เรียกตัวนี้ตัวเดียว ⇒ ไม่มีทางไหนหลุดด่าน
 * ⚠️ ไฟล์ที่ผ่านยังอัปต่อ (ไม่ทิ้งทั้งชุด) · ข้อความ **หนึ่งครั้งต่อชุด** ไม่ว่าทิ้งกี่ไฟล์
 * ⚠️ ไม่มีด่าน / ไม่มีตัวตัดสิน = คืนชุดเดิมทั้งชุด (แผงของผู้เรียกอื่นทุกตัวเดินเหมือนเดิม) · ตัวตัดสินที่โยน = ไฟล์นั้นไม่ผ่าน
 * @returns `{ accepted: File[], rejectText: string|null }`
 */
export function panelFileGate(fileGate, files) {
  const list = (Array.isArray(files) ? files : []).filter(Boolean);
  if (!fileGate || typeof fileGate.test !== "function") return { accepted: list, rejectText: null };
  const accepted = list.filter((file) => {
    try {
      return fileGate.test(file) === true;
    } catch {
      return false;
    }
  });
  return {
    accepted,
    rejectText: accepted.length < list.length ? (String(fileGate.rejectText ?? "").trim() || "ไฟล์นี้แนบที่ช่องนี้ไม่ได้") : null,
  };
}
