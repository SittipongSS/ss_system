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
import {
  requestUsesItems, requestVariantError, requestVariantFieldLabel, requestVariantKey,
  requestVariantLockAfterSubmit, requestVariantLockText, requestVariantRequired, requestVariants,
} from '@/lib/master/requestTypes';

// ขั้นที่ยังสลับรูปแบบได้ — ก่อนฝ่ายรับเรื่องเท่านั้น (เหตุผลอยู่หัวไฟล์)
export const VARIANT_SWITCHABLE_STATUSES = Object.freeze(['draft', 'pending']);

/**
 * **คนนี้**สลับรูปแบบได้ไหม — คืนเหตุผลไทย หรือ null
 *
 * ⭐ **เฉพาะฝั่งผู้ขอ** (ผลรีวิวรอบสอง 2026-09-11) — สลับได้ก่อนรับเรื่องเท่านั้น ซึ่งเป็นช่วงที่
 * แบบฟอร์ม PDR เป็นของผู้ขอ (`pdrEdit.js`) · 🐞 ปล่อยฝ่ายปลายทาง (ที่แก้หัวใบได้ตอนรอรับเรื่อง)
 * สลับเข้า NPD ได้ ⇒ บันทึกหัวใบผ่าน (รายการถูกลบ) แล้วก้าว PDR โดน 403 = ใบ NPD เปล่าที่เขา
 * กรอกต่อเองก็ไม่ได้
 * @param isRequesterSide `canManageRequest(user, request)` (จอใช้ `_mine` ที่ server คำนวณมาให้)
 */
/* ⚠️ ส่ง `kind` มาด้วยเพื่อให้ประโยคใช้ป้ายของหัวข้อ ("สลับวิธีประเมิน…") · ไม่ส่ง = ประโยคเดิมเป๊ะ (พัฒนาสูตร) */
export function requestVariantSideLock(isRequesterSide, kind = null) {
  return isRequesterSide ? null : `สลับ${requestVariantFieldLabel(kind)}ได้เฉพาะผู้เปิดคำร้องหรือคนในทีมเดียวกัน`;
}

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
  /* ⭐ **หัวข้อที่ล็อกวิธีทันทีหลังส่ง** (ประเมินพื้นที่ · S4 §2.4) — หลังส่ง `variant` คือ "สิ่งที่ผู้ขอขอ"
     และการเปลี่ยนวิธีเป็นงานของหัวหน้า TS รายพื้นที่ (S2a) · ใบที่ถูกตีกลับเป็น `draft` อีกครั้ง ⇒ ผ่าน
     ⚠️ `VARIANT_SWITCHABLE_STATUSES` ไม่เปลี่ยน — พัฒนาสูตรยังสลับได้ตอนรอรับเรื่อง */
  if (requestVariantLockAfterSubmit(request.kind) && request.status !== 'draft') {
    return requestVariantLockText(request.kind);
  }
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

/**
 * ค่า `variant` ที่ทางแก้ใบ (PATCH `update`) จะเขียน — คืน `{ variant, error }`
 * · `variant: undefined` = ไม่แตะคอลัมน์ · มีค่า = รูปแบบที่ขอ (ผ่านทะเบียนแล้ว)
 *
 * 🔴 **ห้ามคืน null** (ผลรีวิวก่อน merge 2026-09-11) — คอลัมน์เป็น NOT NULL (mig 0351) และฟอร์ม
 *    แก้ส่ง `variant` มาทุกครั้ง · เดิมแปลงด้วย `requestVariantKey` ซึ่งคืน null ให้หัวข้อที่ไม่มี
 *    รูปแบบ ⇒ **แก้ใบหัวข้ออื่นทุกใบได้ 500** · หัวข้อที่ไม่มีรูปแบบจึงไม่แตะคอลัมน์เลย
 * ⚠️ ค่าที่ไม่รู้จักตีกลับ ไม่ใช่แปลงเป็นรูปแบบตั้งต้นเงียบ ๆ (ใบ NPD จะถูกสลับเป็น Standard
 *    โดยไม่มีใครสั่ง) · ค่าว่าง = ไม่แตะของเดิม
 */
export function requestEditVariant(request, asked) {
  const value = String(asked ?? '').trim();
  if (!value || !request || !requestVariants(request.kind)) return { variant: undefined, error: null };
  const error = requestVariantError(request.kind, value);
  return error ? { variant: undefined, error } : { variant: value, error: null };
}

/* ── ตัวเลือกบนฟอร์ม (ประเมินจากแบบ งวด 4 · S4 §2.4) ─────────────────────────────────────── */

/**
 * รูปแบบที่ฟอร์มวาดเป็นปุ่ม — ทุกตัวที่ประกาศ ยกเว้นที่อยู่ใน `off` (สวิตช์ปิด) ตามลำดับทะเบียน
 * ⚠️ **ค่าที่ใบถืออยู่ (`current`) ยังวาดแม้อยู่ใน `off`** — ใบที่ยื่นไปแล้วต้องอ่านได้ในวันที่สวิตช์ถูกปิดทีหลัง
 */
export function requestVariantChoices(kind, { off = [], current = null } = {}) {
  const variants = requestVariants(kind);
  if (!variants) return [];
  return Object.keys(variants).filter((key) => !off.includes(key) || key === current);
}

// เหลือทางเดียวของหัวข้อที่บังคับเลือก ⇒ คีย์นั้น (สวิตช์ปิด = "ลงหน้างาน" ตัวเดียว) · อื่น ๆ = null
export function requestImpliedVariant(kind, { off = [] } = {}) {
  if (!requestVariantRequired(kind)) return null;
  const choices = requestVariantChoices(kind, { off });
  return choices.length === 1 ? choices[0] : null;
}

/**
 * หลังส่งแล้ว ฟอร์มต้อง **ไม่** วาดรูปแบบเป็นตัวเลือกหรือเป็น "วิธีปัจจุบัน" — วาดบรรทัดอ่านอย่างเดียว
 * "วิธีที่ฝ่ายขายขอ" แทน (หัวหน้า TS อาจสลับวิธีรายพื้นที่ไปแล้ว) · ด่านสถานะอยู่ที่นี่ ไม่ใช่ที่จอ
 */
export function requestVariantAskedOnly(request) {
  return !!request && requestVariantLockAfterSubmit(request.kind) && request.status !== 'draft';
}
