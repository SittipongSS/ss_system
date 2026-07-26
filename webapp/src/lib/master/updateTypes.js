// ── ชนิดรายการในเธรดอัปเดต (mig 0163) — โค้ดล้วน ไม่ต้อง migration ────────
// ตาราง entity_updates ไม่มี CHECK บน kind โดยเจตนา: ชุด kind เป็นของแต่ละ entity
// (งานมี due/late, ดีลมี call/meeting) การล็อกลง DB จะทำให้เพิ่ม entity ใหม่ต้อง
// ออก migration ทุกครั้ง — แพตเทิร์นเดียวกับ attachmentTypes / materialTypes
//
// ⚠️ ป้าย/สีของงานยกมาจาก UPDATE_META เดิมในหน้า pm/tasks แบบตรง ๆ — ผู้ใช้ต้อง
// ไม่รู้สึกว่าอะไรเปลี่ยนหลังย้ายมาใช้ของกลาง

export const UPDATE_KINDS = {
  personal_task: {
    comment: { label: 'อัปเดต', color: 'var(--accent)' },
    status: { label: 'เปลี่ยนสถานะ', color: 'var(--blue)' },
    due: { label: 'เลื่อนกำหนด', color: 'var(--amber)' },
    late: { label: 'สาเหตุที่เสร็จช้า', color: 'var(--red)' },
  },
};

// kind ที่ "คนพิมพ์เอง" ได้ — ที่เหลือระบบเขียนให้ตอนเกิดเหตุการณ์เท่านั้น
// (ปล่อยให้ client ส่ง kind='status' มาเอง = ปลอมไทม์ไลน์ได้)
export const AUTHORABLE_KIND = 'comment';

export function updateKindMeta(entityType, kind) {
  const set = UPDATE_KINDS[entityType] || {};
  return set[kind] || set[AUTHORABLE_KIND] || { label: 'อัปเดต', color: 'var(--accent)' };
}

export function isKnownUpdateKind(entityType, kind) {
  return !!(UPDATE_KINDS[entityType] || {})[kind];
}

// ── ไฟล์แนบในข้อความ ────────────────────────────────────────────────────
// รับเฉพาะ ref ของไฟล์ที่อัปผ่าน /api/upload แล้ว (กัน payload แปลกปลอม) —
// แพตเทิร์นเดียวกับ sanitizeInquiryAttachments / sanitizeWonAttachments
export const MAX_UPDATE_ATTACHMENTS = 8;

export function sanitizeUpdateAttachments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => a && typeof a === 'object' && typeof a.fileUrl === 'string' && a.fileUrl)
    .slice(0, MAX_UPDATE_ATTACHMENTS)
    .map((a) => ({
      fileUrl: String(a.fileUrl),
      driveFileId: a.driveFileId ? String(a.driveFileId) : null,
      fileName: a.fileName ? String(a.fileName).slice(0, 200) : null,
      mimeType: a.mimeType ? String(a.mimeType).slice(0, 100) : null,
      sizeBytes: Number.isFinite(a.sizeBytes) ? Number(a.sizeBytes) : null,
    }));
}

// ข้อความที่ลบแล้วยังอยู่ในเธรด (soft delete) — แสดงเป็นรอยว่าเคยมี ไม่ใช่หายเงียบ
export const DELETED_UPDATE_TEXT = 'ข้อความนี้ถูกลบแล้ว';

// ตัดของที่ผู้อ่านไม่ควรเห็นออกจากแถวที่ลบแล้ว (เนื้อความ/ไฟล์แนบหายไป เหลือแต่รอย)
export function redactDeleted(row) {
  if (!row?.deletedAt) return row;
  return { ...row, body: null, attachments: [], meta: {} };
}
