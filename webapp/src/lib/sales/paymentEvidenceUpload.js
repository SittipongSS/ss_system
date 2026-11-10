// ── อัปสลิปของงวด "ครั้งเดียวต่อไฟล์" (รื้อ SO + บัญชี PR-5 · กติกา "กดส่งซ้ำต้องไม่อัปไฟล์ซ้ำ") ─────────────────────────────
//
// 🐞 โมดัลแจ้งชำระ/แนบเพิ่มเก็บไฟล์ที่เลือกไว้เมื่อส่งไม่สำเร็จ (409 แถวถูกแก้จากอีกหน้าต่าง · เน็ตสะดุดตอน PATCH) เพื่อให้กดใหม่ได้ —
//   แต่ขาอัปไฟล์เดิมอัปไบต์ขึ้น bucket ใหม่ทุกครั้งที่กด ⇒ ไฟล์รอบแรกกลายเป็นไฟล์กำพร้า (ไม่มีแถวไหนชี้ · ไม่มีถังขยะ) + egress ซ้ำ
// ⭐ จำ ref ของไฟล์ที่อัปสำเร็จแล้ว (WeakMap ด้วยตัว `File` เดิมที่ PendingFiles ถือไว้ · แยกตามใบ) — กดใหม่ = ข้ามใบที่อัปแล้ว
//   ใช้ทั้งแผงงวดบนหน้าใบและลิ้นชักรายงวดของหน้ารายการ (ทางอัปเดียวกัน: ไบต์ขึ้น bucket ส่วนตัวผ่าน signed URL)
// ⚠️ ล้มกลางทาง = ใบที่ผ่านไปแล้วยังจำไว้ (คืน ref ทีละใบทันทีที่อัปเสร็จ ไม่ใช่ตอนจบก้อน)
const uploaded = new WeakMap();

/** ref ที่เก็บลงแถวงวด (รูปเดียวกับที่ PATCH `report` / `evidence-add` รับใน `evidence`) */
export function paymentEvidenceRef(ref, file) {
  return {
    fileUrl: ref?.url || null,
    storageBucket: ref?.storageBucket || null,
    storagePath: ref?.storagePath || null,
    fileName: file?.name,
    mimeType: file?.type,
    sizeBytes: file?.size,
  };
}

/**
 * อัปไฟล์หนึ่งใบของใบสั่งขายหนึ่งใบ — เคยอัปสำเร็จแล้ว (ไฟล์เดิม · ใบเดิม) = คืน ref เดิมโดยไม่ยิงซ้ำ
 * @param {File} file
 * @param {{ orderId: string, upload: (args: { file: File, entityType: string, entityId: string }) => Promise<object> }} options
 */
export async function uploadPaymentEvidenceOnce(file, { orderId, upload }) {
  const byOrder = (file && typeof file === 'object' && uploaded.get(file)) || null;
  const known = byOrder?.get(orderId);
  if (known) return known;
  let ref;
  try {
    ref = await upload({ file, entityType: 'sales_order_payment_evidence', entityId: orderId });
  } catch (err) {
    throw new Error(err?.message || `อัปโหลด ${file?.name || 'ไฟล์'} ไม่สำเร็จ`);
  }
  const shaped = paymentEvidenceRef(ref, file);
  if (file && typeof file === 'object') {
    const map = byOrder || new Map();
    map.set(orderId, shaped);
    if (!byOrder) uploaded.set(file, map);
  }
  return shaped;
}

/** อัปทุกใบตามลำดับ (ใบที่อัปแล้วข้ามไป) — คืน ref ตามลำดับเดิม */
export async function uploadPaymentEvidenceList(files, options) {
  const out = [];
  for (const file of Array.isArray(files) ? files : []) out.push(await uploadPaymentEvidenceOnce(file, options));
  return out;
}
