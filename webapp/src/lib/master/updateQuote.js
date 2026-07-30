// ── ตอบแบบยกคำพูดในเธรดอัปเดต (entity_updates, mig 0163) ─────────────────
//
// ของที่ค้างมาตั้งแต่มติดีไซน์ 2026-07-27 (ข้อ ① ของ 3 อย่างที่หยิบมาแทนโครง Reddit)
//
// ⭐ **ทำไมเป็น `meta.quotedId` ไม่ใช่คอลัมน์ `parentId`** — ตารางไม่มี parentId
// โดยเจตนา: เธรดนี้มีเหตุการณ์ระบบปนอยู่ซึ่ง**ไม่มีพ่อ** ซ้อนชั้นไม่ได้ · การยกคำพูด
// เป็นแค่ "ข้อความนี้พูดถึงข้อความนั้น" = ป้ายกำกับ ไม่ใช่โครงสร้างต้นไม้
// ⇒ **แบนเสมอ ไม่มี nested reply** ลำดับเวลายังเป็นตัวหลักฐานเหมือนเดิม
//
// ⚠️ `redactDeleted` ล้าง `meta` ทั้งก้อนตอนข้อความถูกลบ → ข้อความที่ถูกลบจะไม่
// เหลือ quote ค้างอยู่ ซึ่งถูกแล้ว (รอยการลบไม่ควรพก "เคยตอบใครไว้")

export const QUOTE_SNIPPET_MAX = 140;

// เธรดยกคำพูดได้เฉพาะรายการที่อยู่ใน `entity_updates` จริง —
// `extraItems` (ประวัติสถานะ/เหตุการณ์ลีด) อยู่คนละตาราง id คนละชุด ยกไม่ได้
export function canQuoteItem(item) {
  if (!item || item.kind !== 'own') return false;
  return !item.row?.deletedAt;
}

export function quotedIdOf(row) {
  const id = row?.meta?.quotedId;
  return id ? String(id) : null;
}

// ตัวอย่างข้อความที่ยกมา — ตัดให้สั้น เพราะ quote ยาวกว่าคำตอบคือเสียงรบกวน
// คืน null เมื่อไม่มีอะไรให้ยก (แถวที่แนบไฟล์ล้วน) ให้ผู้เรียกโชว์ป้ายแทน
export function quoteSnippet(row) {
  const text = String(row?.body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > QUOTE_SNIPPET_MAX ? `${text.slice(0, QUOTE_SNIPPET_MAX)}…` : text;
}

// สิ่งที่กล่อง quote ต้องแสดง — คิดที่เดียวให้ทั้งกล่องบนข้อความและกล่องในช่องพิมพ์
//
// สามสถานะที่ต้องแยกให้ชัด (เขียนรวมเป็น "—" ผู้อ่านจะไม่รู้ว่าเกิดอะไรขึ้น):
//   missing — ต้นทางไม่อยู่ในชุดที่โหลดมา (ถูกลบทั้งแถว/อยู่นอกหน้า)
//   deleted — ต้นทางยังอยู่แต่ถูกลบข้อความ
//   ok      — ยกได้ปกติ
export function quoteView(quotedRow, { deletedText = 'ข้อความนี้ถูกลบแล้ว' } = {}) {
  if (!quotedRow) return { state: 'missing', author: null, text: 'ข้อความต้นทางไม่อยู่ในเธรดนี้แล้ว' };
  if (quotedRow.deletedAt) {
    return { state: 'deleted', author: quotedRow.authorName || null, text: deletedText };
  }
  const snippet = quoteSnippet(quotedRow);
  return {
    state: 'ok',
    author: quotedRow.authorName || 'ระบบ',
    text: snippet || 'ไฟล์แนบ',
  };
}

// ── ด่านฝั่ง server ──────────────────────────────────────────────────────
// ⚠️ **ต้องเทียบทั้ง entityType และ entityId** — ปล่อยให้ยก id ข้ามเธรดได้เท่ากับ
// เปิดช่องอ่านข้อความของเอกสารที่ตัวเองไม่มีสิทธิ์ (กล่อง quote แสดงเนื้อความ
// ต้นทางให้เห็น) · เธรดนี้เป็น polymorphic ไม่มี FK จึงไม่มีอะไรกันให้อัตโนมัติ
export function quoteTargetError(quotedRow, { entityType, entityId } = {}) {
  if (!quotedRow) return 'ไม่พบข้อความที่ยกมา';
  if (quotedRow.entityType !== entityType || String(quotedRow.entityId) !== String(entityId)) {
    return 'ยกคำพูดข้ามเธรดไม่ได้';
  }
  if (quotedRow.deletedAt) return 'ข้อความที่ยกมาถูกลบแล้ว';
  return null;
}
