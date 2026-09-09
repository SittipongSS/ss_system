// ── สลับรูปแบบงานของใบ (พัฒนาสูตร: standard ↔ NPD · มติผู้ใช้ 2026-09-09) ──
//
// ⭐ **ด่านเดียว จอกับ API เรียกตัวเดียวกัน** — หน้าจอใช้ข้อความที่คืนมาเทาปุ่มพร้อม
// บอกเหตุ ส่วน PATCH ใช้ตัวเดียวกันตีกลับ ⇒ ปุ่มกับเซิร์ฟเวอร์ขัดกันเองไม่ได้
// (กฎเดียวกับ `stages.js` ทั้งไฟล์)
//
// ⭐ **ทำไมหยุดที่ "รับเรื่อง"** (มติผู้ใช้ 2026-09-09) — เท่าหน้าต่างเดียวกับที่แก้
// บรรทัดได้ (`REQUEST_LINE_EDITABLE_STATUSES`) เพราะสวิตช์นี้คุมว่าใบมีบรรทัดไหม ·
// และจังหวะรับเรื่องคือจังหวะที่ **เลขที่แบบฟอร์ม PDR ถูกออก** (`pdrRefNo` · mig 0271)
// ซึ่ง DB ห้ามแก้ตลอดกาล ⇒ สลับหลังจากนั้นคือทิ้งเลขที่ที่ออกไปแล้วโดยเอาคืนไม่ได้
//
// ⚠️ **ไม่ลบของให้เอง** — รูปแบบที่ไม่มีตารางบรรทัดจะไม่ยอมรับใบที่ยังมีแถวค้าง
// แต่ด่านนี้ **บอกให้ไปลบเอง** ไม่ใช่ลบให้: PostgREST ไม่มีทรานแซกชัน ⇒ ลบแถวแล้ว
// เขียนรูปแบบไม่สำเร็จ = ใบเสียของโดยที่ไม่มีถังขยะให้กู้ (ดู [[deleted-data-recovery]])
// ส่วนของ PDR ที่กรอกไว้ **ไม่ถูกลบเลยแม้แต่ตอนสลับกลับ** — มันอยู่คนละคอลัมน์
// และกลับมาโหมดเดิมแล้วได้คืนครบ
import { requestUsesItems, requestVariantError, requestVariantKey } from '@/lib/master/requestTypes';

// ขั้นที่ยังสลับรูปแบบได้ — ก่อนฝ่ายรับเรื่องเท่านั้น (เหตุผลอยู่หัวไฟล์)
export const VARIANT_SWITCHABLE_STATUSES = Object.freeze(['draft', 'pending']);

/**
 * **จังหวะ**นี้สลับรูปแบบได้ไหม — คืนเหตุผลไทย หรือ null ถ้าสลับได้
 *
 * ⭐ ต่างจาก `requestVariantSwitchError` ตรงที่ **ไม่ผูกกับรูปแบบปลายทาง** — ฟอร์ม
 * ใช้ตัวนี้เทาปุ่มทั้งชุดพร้อมบอกเหตุ ส่วนกฎที่ขึ้นกับปลายทาง (แถวที่ค้างอยู่)
 * ฟอร์มจัดการเองด้วยโมดัลยืนยันตอนกด แล้ว API ตรวจซ้ำด้วยตัวเต็ม
 */
export function requestVariantLock(request) {
  if (!request) return 'ไม่พบคำร้อง';
  if (request.status === 'cancelled') return 'คำร้องถูกยกเลิกแล้ว — สลับรูปแบบไม่ได้';
  if (!VARIANT_SWITCHABLE_STATUSES.includes(request.status)) {
    return 'รับเรื่องไปแล้ว — สลับรูปแบบไม่ได้ (งานเดินไปแล้ว)';
  }
  if (String(request.pdrRefNo ?? '').trim()) {
    return `ใบนี้ออกเลขที่แบบฟอร์ม ${request.pdrRefNo} ไปแล้ว — สลับรูปแบบไม่ได้`;
  }
  return null;
}

/**
 * สลับใบนี้เป็นรูปแบบ `variant` ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * @param request ใบเดิม (ต้องมี `kind` · `status` · `pdrRefNo`)
 * @param variant รูปแบบที่ขอเปลี่ยนไป
 * @param items   บรรทัด **ชุดที่จะเหลือหลังบันทึก** ไม่ใช่ชุดเดิม — การลบแถวกับการ
 *                สลับรูปแบบเกิดในการกดบันทึกครั้งเดียวกันได้ (ผู้เรียกส่ง `nextItems`)
 */
export function requestVariantSwitchError(request, variant, items = []) {
  if (!request) return 'ไม่พบคำร้อง';
  const asked = String(variant ?? '').trim();
  if (!asked) return null;

  const invalid = requestVariantError(request.kind, asked);
  if (invalid) return invalid;

  // ค่าเดิม = ไม่ได้สลับอะไร ⇒ ผ่านทุกด่าน (ผู้เรียกส่งค่าปัจจุบันมาด้วยเป็นเรื่องปกติ)
  if (asked === requestVariantKey(request)) return null;

  /* ⚠️ ด่านจังหวะ (สถานะ + เลขที่แบบฟอร์ม) อยู่ที่ `requestVariantLock` ตัวเดียว —
     เขียนซ้ำที่นี่คือกฎชุดที่สองที่ต้องคอยให้ตรงกับปุ่มบนจอตลอดไป
     ⚠️ เลขที่แบบฟอร์มออกได้ทั้งอัตโนมัติตอนรับเรื่องและ **ด้วยมือ** ก่อนหน้านั้น
     (`action: 'pdr-ref'`) ⇒ ตัวล็อกเช็คที่ตัวเลขจริง ไม่ใช่เดาจากสถานะ */
  const locked = requestVariantLock(request);
  if (locked) return locked;

  const rows = (items || []).length;
  if (rows && !requestUsesItems({ kind: request.kind, variant: asked })) {
    return `รูปแบบที่เลือกไม่มีตารางรายการ — ลบรายการ ${rows} แถวออกก่อนแล้วค่อยสลับ`;
  }
  return null;
}
