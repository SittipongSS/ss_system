// ── บรรทัดขอเอกสารที่ไฟล์อยู่ที่ FG (ศูนย์กลางเอกสารของสินค้า P2b · มติเจ้าของ 09/11/2026 · mig 0428) ──────────────────
//
// ⭐ MSDS กับ Specification Sheet = ระดับ FG · RD ออก · **เก็บที่สินค้า** ⇒ บรรทัดคำร้อง DC ชนิดนี้ที่ผูก FG แล้ว:
//    · หน้าต่าง "ส่งงาน" ของ RD แนบไฟล์ลงที่สินค้า (docType คีย์เดียวกับคำร้อง) — ไม่ใช่ที่บรรทัด
//    · ด่านส่งงานนับไฟล์ปัจจุบันของสินค้าชนิดนั้น (สินค้ามีอยู่แล้ว = ส่งได้โดยไม่ต้องแนบซ้ำ)
//    · การ์ดบรรทัด + แท็บเอกสารของดีลโชว์ไฟล์ของสินค้า (ชุดปัจจุบัน — ออกฉบับใหม่ที่สินค้าแล้วทุกที่เห็นฉบับใหม่)
// ⚠️ ตัดสินที่นี่ที่เดียว — จอ (โมดัลส่งงาน · การ์ดบรรทัด) กับ server (ด่านส่งงาน · แท็บเอกสารของดีล) ถามตัวเดียวกัน
// ⚠️ บรรทัดเดิมที่ไม่มี FG (ก่อนมติ) เดินแบบเดิมทุกอย่าง — ไฟล์อยู่ที่บรรทัด
import { REQUEST_DOC_VOCABULARY } from '@/lib/requests/docTypes';

/**
 * บรรทัดนี้เก็บไฟล์ที่สินค้าไหม — คืน `{ productId, docType, label }` หรือ `null` (= ไฟล์อยู่ที่บรรทัดตามเดิม)
 * @param row แถวของ `dept_request_items` (`lineKind` · `docType` · `productId`)
 */
export function productDocLineTarget(row) {
  if (!row || row.lineKind !== REQUEST_DOC_VOCABULARY.lineKind) return null;
  const docType = String(row.docType || '');
  const productId = String(row.productId || '').trim();
  if (!productId || !REQUEST_DOC_VOCABULARY.productTarget(docType)) return null;
  return { productId, docType, label: REQUEST_DOC_VOCABULARY.label(docType) };
}
