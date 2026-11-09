// ── ฉลากที่ทะเบียนสรรพสามิตยื่น = Artwork ของสินค้า (ศูนย์กลางเอกสารของสินค้า งวด P1 · มติเจ้าของ 09/11/2026) ──────
//
// ⭐ มติ: "ฐานข้อมูลคือศูนย์กลาง" ⇒ **ไฟล์ที่เป็นของตัวสินค้าเก็บที่สินค้า** ระบบอื่นชี้มา ไม่เก็บสำเนาของตัวเอง
//    (แผน ~/ss-team/mockups/product-doc-hub/PLAN.md · mig 0426 + 0427)
// 🐞 ที่มา: ฉลากที่ฝ่ายขายอัปจากแท็บสรรพสามิตเก็บที่ทะเบียน (`entityType = 'registration'`) ⇒ ไม่ขึ้นที่แท็บเอกสารของสินค้า
//    และ FG 46 ตัวขึ้น "ยังขาด Artwork" ทั้งที่ไฟล์มีอยู่แล้ว · ปุ่ม "ใช้ไฟล์นี้ยื่น" (04/11) แก้ได้ทางเดียว (สินค้า → ทะเบียน · คัดลอก)
//
// 🔑 กติกาของไฟล์ชุดเดียว:
//   · อัปฉลากที่ไหนก็ตาม (แผงทะเบียน · แท็บเอกสาร) = แถว `entityType 'product'` · `docType 'artwork'` ตัวเดียวกัน
//   · ทะเบียนร่าง/ตีกลับ (`REGISTRATION_LINK_EDITABLE_STATUSES`) ใช้ Artwork **ปัจจุบัน** ของสินค้าสด ๆ
//   · ทะเบียนที่ยื่นแล้ว/อนุมัติแล้ว ใช้ชุดที่ **ตรึงตอนยื่น** (`excise_registrations."labelArtworkIds"`) — RA ตรวจไฟล์ชุดไหน
//     ก็เห็นชุดนั้นตลอด แม้สินค้าเปลี่ยน Artwork ทีหลัง
//   · ไฟล์ที่ทะเบียนใบไหนชี้อยู่ ลบไม่ได้ ได้แค่ปลดระวาง (`metadata.retiredAt`) — ด่านอยู่ที่ DELETE /api/attachments/[id]
//   · Artwork ที่ปลดระวางแล้ว **ไม่ใช่ Artwork ปัจจุบัน** — ไม่นับด่าน ไม่ถูกตรึงตอนยื่นใหม่ ไม่ขึ้นแผงของสินค้า
//   · ฉลากเก่าที่ยังค้างที่ทะเบียน (`label_artwork` ก่อนรัน 0427) ยังนับเป็นของทะเบียนใบนั้น — ทางผ่านระหว่าง deploy กับการย้ายข้อมูล
// ⚠️ ไม่มี I/O ยกเว้นสองตัวท้าย (รับ supabase เป็นพารามิเตอร์) — ตัวตัดสินล้วนเทสต์ได้โดยไม่ต้องมีฐาน
import { isRetiredAttachment } from '@/lib/master/attachmentTypes';
import { REGISTRATION_LINK_EDITABLE_STATUSES } from '@/lib/excise/workflow';

/** ชนิดเอกสารฝั่งสินค้า — ที่เดียวที่ฉลากของทะเบียนอยู่ */
export const PRODUCT_ARTWORK_DOC_TYPE = 'artwork';
/** ชนิดเอกสารฉลากที่ทะเบียนแบบเดิม (ก่อน 0427) — อ่านอย่างเดียว ไม่มีจอไหนแนบชนิดนี้อีก */
export const LEGACY_LABEL_DOC_TYPE = 'label_artwork';
/** ข้อความของด่านยื่น/คิว เมื่อยังไม่มี Artwork — บอกว่าไฟล์อยู่ที่สินค้า */
export const ARTWORK_MISSING_LABEL = 'Artwork สินค้า (ฉลากที่ใช้ยื่น)';
export const ARTWORK_RETIRED_MESSAGE = 'ไฟล์นี้อยู่ในทะเบียนสรรพสามิตที่ยื่นแล้ว จึงเก็บไว้ให้ทะเบียนเปิดได้ และเอาออกจาก Artwork ปัจจุบันของสินค้า';

/** ทะเบียนสถานะนี้ใช้ Artwork ปัจจุบันของสินค้าสด ๆ (ยังไม่ได้ยื่น หรือถูกตีกลับมาแก้) */
export const usesLiveArtwork = (status) => REGISTRATION_LINK_EDITABLE_STATUSES.includes(status);

const byCreated = (a, b) => String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''))
  || String(a?.id || '').localeCompare(String(b?.id || ''));

/** Artwork ปัจจุบันของสินค้า — ชนิด artwork ที่ยังไม่ปลดระวาง เรียงตามเวลาที่แนบ */
export function currentProductArtwork(productRows) {
  return (productRows || [])
    .filter((row) => row?.docType === PRODUCT_ARTWORK_DOC_TYPE && !isRetiredAttachment(row))
    .sort(byCreated);
}

/** id ที่ทะเบียนจะตรึงไว้ตอนยื่น — Artwork ปัจจุบันทั้งชุด */
export function artworkSnapshotIds(productRows) {
  return currentProductArtwork(productRows).map((row) => String(row.id));
}

/**
 * ฉลากที่ทะเบียนใบนี้ใช้ — ตัวเดียวที่ด่านยื่น · คิว RA · แผงทะเบียน · ZIP เอกสารถาม
 * @param registration  แถวทะเบียน (`status` · `labelArtworkIds`)
 * @param productRows   ไฟล์แนบทุกใบของสินค้าของทะเบียน (รวมที่ปลดระวางแล้ว — ชุดที่ตรึงอาจชี้ใบนั้น)
 * @param legacyRows    ไฟล์แนบของทะเบียนเอง (ฉลากแบบเดิมที่ยังไม่ย้าย)
 * @returns แถวไฟล์ เรียงตามเวลาที่แนบ · ฉลากแบบเดิมต่อท้าย
 */
export function registrationArtworkFiles({ registration, productRows, legacyRows } = {}) {
  const legacy = (legacyRows || []).filter((row) => row?.docType === LEGACY_LABEL_DOC_TYPE).sort(byCreated);
  if (usesLiveArtwork(registration?.status)) return [...currentProductArtwork(productRows), ...legacy];
  const pinned = new Set((registration?.labelArtworkIds || []).map(String));
  const snapshot = (productRows || [])
    .filter((row) => row?.docType === PRODUCT_ARTWORK_DOC_TYPE && pinned.has(String(row.id)))
    .sort(byCreated);
  return [...snapshot, ...legacy];
}

/** ทะเบียนใบนี้มีฉลากให้ยื่นไหม — ด่านยื่น (ร่าง/ตีกลับ) และป้ายบนคิว (ใบที่ยื่นแล้ว) */
export const registrationHasArtwork = (args) => registrationArtworkFiles(args).length > 0;

/**
 * มีทะเบียนใบไหนตรึงไฟล์นี้ไว้ไหม — ด่านของ DELETE ไฟล์แนบ (ลบไม่ได้ ได้แค่ปลดระวาง)
 * ⚠️ อ่านไม่ได้ = คืน `{ error }` ไม่ใช่ `referenced: false` — ผู้เรียกต้องหยุด ไม่ใช่ลบต่อ (supabase ไม่ throw)
 * @returns {{ referenced: boolean } | { error: string }}
 */
export async function isArtworkReferenced(supabase, attachmentId) {
  const { data, error } = await supabase.from('excise_registrations')
    .select('id')
    .contains('labelArtworkIds', [String(attachmentId)])
    .limit(1);
  if (error) return { error: error.message || String(error) };
  return { referenced: (data || []).length > 0 };
}

/**
 * ไฟล์แนบที่ต้องใช้ตัดสินฉลากของทะเบียนหนึ่งใบ — Artwork ทุกใบของสินค้า + ฉลากแบบเดิมของทะเบียน
 * ⚠️ query พังต้องดัง (throw) — เงียบแล้วด่านยื่นบอกว่า "ขาด Artwork" ทั้งที่แนบครบ
 * @param listAttachments ตัวอ่านไฟล์แนบของ entity (`lib/master/attachments`) — ส่งเข้ามาให้เทสต์ใส่ตัวจำลองได้
 */
export async function loadRegistrationArtwork(registration, listAttachments) {
  const [productRows, legacyRows] = await Promise.all([
    registration?.productId ? listAttachments('product', registration.productId) : [],
    registration?.id ? listAttachments('registration', registration.id) : [],
  ]);
  return {
    files: registrationArtworkFiles({ registration, productRows, legacyRows }),
    productRows,
    legacyRows,
  };
}
