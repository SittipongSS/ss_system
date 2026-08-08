// ── เอกสารทั้งหมดของดีลหนึ่งใบ — รวม 6 แหล่งฝั่ง server ครั้งเดียว (P5b) ──
//
// ⭐ ทำไมต้องรวม: ไฟล์ของดีลวันนี้กระจายอยู่หลายที่โดยไม่มีหน้าไหนเห็นครบ — คนที่
// ถามว่า "เอกสารของดีลนี้มีอะไรบ้าง" ต้องเปิด 4–5 จอแล้วจำเอาเอง
//
// ⭐ **แหล่งที่ 6 คือของที่ *ยังไม่มา*** (บรรทัดขอเอกสารที่ยังไม่มีไฟล์) — นี่คือ
// สิ่งที่ทำให้แถบ "มาแล้ว 6 · รอ 3" เป็นไปได้ · ไม่รู้จักของที่ยังไม่มาเมื่อไร
// ตัวเลขจะเป็น 100% เสมอ ซึ่งอ่านแล้วเหมือนครบทั้งที่ไม่ครบ
//
// ⚠️ **"รอเอกสาร" ขึ้นบนสุดเสมอ** — เป็นของที่ต้องทำอะไรต่อ · เรียงกลับกันเมื่อไร
// คนต้องเลื่อนผ่านของที่เสร็จแล้วเพื่อไปหาของที่ค้าง
import { docTypeLabel } from '@/lib/requests/docTypes';

export const DOCUMENT_SOURCES = {
  awaiting: { label: 'รอเอกสาร', order: 0 },
  // ⭐ แหล่งที่ 7 (ม-88): ไฟล์ที่ฝ่ายปลายทางแนบบนแถวคำร้องแล้วส่งมา — เดิมพอแถว
  // เดินพ้น "รอ" ไฟล์กลับ **หายจากแท็บนี้ทั้งใบ** (ไปกองอยู่ในใบคำร้องที่เดียว)
  // ⇒ "RD แนบเอกสาร → เอกสารไปสู่แท็บเอกสารในโครงการ/ดีลนั้นด้วย" ตามมติผู้ใช้
  requestFile: { label: 'เอกสารจากคำร้อง', order: 1 },
  attachment: { label: 'ไฟล์แนบของดีล', order: 2 },
  thread: { label: 'แนบในความเคลื่อนไหว', order: 3 },
  issued: { label: 'ฉบับที่ออกจริง', order: 4 },
  won: { label: 'หลักฐานปิดการขาย', order: 5 },
  checklist: { label: 'รายการเอกสารของดีล', order: 6 },
};

const SOURCE_ORDER = Object.fromEntries(
  Object.entries(DOCUMENT_SOURCES).map(([k, v]) => [k, v.order]),
);

// ── รวมและเรียง ──────────────────────────────────────────────────────────
//
// ⚠️ รับ **ข้อมูลดิบที่ผู้เรียกอ่านมาแล้ว** ไม่แตะ DB เอง — ทดสอบได้จริงและ route
// เป็นคนตัดสินว่าจะอ่านอะไรบ้างตามสิทธิ์ของคนดู
export function buildEntityDocuments({
  attachments = [],
  threadAttachments = [],
  issued = [],
  wonAttachments = [],
  checklist = [],
  awaitingRequestItems = [],
  requestItemFiles = [],
} = {}) {
  const rows = [];

  // ไฟล์จริงที่ฝ่ายแนบบนแถวคำร้อง (ม-88) — title คือชื่อชนิดเอกสารของแถว ไม่ใช่
  // ชื่อไฟล์ (คนหาด้วยคำว่า "COA" ไม่ใช่ชื่อไฟล์ที่ RD ตั้ง) · ชื่อไฟล์อยู่บรรทัดรอง
  for (const f of requestItemFiles) {
    rows.push({
      id: `reqfile:${f.id}`,
      source: 'requestFile',
      title: f.docType ? docTypeLabel(f.docType) : (f.fileName || 'เอกสารจากคำร้อง'),
      note: [f.fileName, f.requestDocNo].filter(Boolean).join(' · ') || null,
      href: `/api/attachments/${f.id}/file`,
      at: f.createdAt || null,
    });
  }

  for (const item of awaitingRequestItems) {
    rows.push({
      id: `req:${item.id}`,
      source: 'awaiting',
      title: docTypeLabel(item.docType),
      note: item.spec || null,
      // ⚠️ ลิงก์ไปที่ **คำร้อง** ไม่ใช่ไฟล์ — ของยังไม่มา สิ่งที่กดได้คือไปดูว่า
      // ค้างอยู่ขั้นไหน · ปุ่ม "เปิดคำร้อง" จะได้ใบซ้ำ เพราะเปิดไปแล้ว
      href: item.requestId ? `/requests/${item.requestId}` : null,
      at: item.createdAt || null,
    });
  }

  for (const a of attachments) {
    rows.push({
      id: `att:${a.id}`,
      source: 'attachment',
      title: a.fileName || a.docType || 'ไฟล์แนบ',
      note: a.docType || null,
      href: `/api/attachments/${a.id}/file`,
      at: a.createdAt || null,
    });
  }

  for (const a of threadAttachments) {
    rows.push({
      id: `thr:${a.id}`,
      source: 'thread',
      title: a.fileName || 'ไฟล์แนบในข้อความ',
      note: a.byName || null,
      href: a.fileUrl || null,
      at: a.createdAt || null,
    });
  }

  for (const doc of issued) {
    rows.push({
      id: `iss:${doc.id}`,
      source: 'issued',
      title: doc.title || doc.docNo || 'ฉบับที่ออกจริง',
      // ⚠️ ฉบับที่ออกจริงของ QT/SO เป็น **HTML ไม่ใช่ PDF** — ป้ายปุ่มห้ามเขียนว่า
      // "ดาวน์โหลด" (ผู้ใช้จะรอไฟล์ที่ไม่มีวันมา) · ผู้เรียกเป็นคนวางป้าย
      note: doc.staleAfterApproval ? 'เนื้อหาเปลี่ยนหลังอนุมัติ' : null,
      href: doc.href || null,
      at: doc.issuedAt || doc.createdAt || null,
    });
  }

  for (const a of wonAttachments) {
    rows.push({
      id: `won:${a.id}`,
      source: 'won',
      title: a.fileName || 'หลักฐานปิดการขาย',
      note: a.docNo || null,
      href: a.fileUrl || null,
      at: a.createdAt || null,
    });
  }

  for (const doc of checklist) {
    rows.push({
      id: `chk:${doc.id}`,
      source: 'checklist',
      title: doc.title,
      note: doc.status === 'waived' ? 'ยกเว้นแล้ว' : null,
      href: doc.attachmentId ? `/api/attachments/${doc.attachmentId}/file` : null,
      at: doc.createdAt || null,
      // รายการ checklist ที่ยังไม่มีไฟล์ก็คือ "รอ" เหมือนกัน — แต่คนละแหล่งกับ
      // บรรทัดคำร้อง จึงนับรวมในตัวเลขแต่ไม่ย้ายกลุ่ม
      pending: doc.status === 'pending',
    });
  }

  rows.sort((a, b) => {
    const bySource = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (bySource) return bySource;
    // ใหม่ก่อนเก่าในกลุ่มเดียวกัน — ของที่เพิ่งเกิดคือของที่คนกำลังตามหา
    return String(b.at ?? '').localeCompare(String(a.at ?? ''));
  });
  return rows;
}

// ── ตัวเลขบนแถบความคืบหน้า ───────────────────────────────────────────────
//
// ⚠️ "รอ" = ของที่รู้ว่าต้องมีแต่ยังไม่มา (บรรทัดคำร้อง + checklist ที่ยังไม่แนบ)
// **ไม่ใช่** แค่นับไฟล์ที่มี — ตัวเลขที่นับแต่ของที่มาแล้วจะเป็น 100% เสมอ
export function entityDocumentProgress(rows = []) {
  const waiting = rows.filter((r) => r.source === 'awaiting' || r.pending).length;
  return { arrived: rows.length - waiting, waiting, total: rows.length };
}
