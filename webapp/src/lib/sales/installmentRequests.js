// ── คำร้องขอเอกสารการเงินของงวด — หลายคำร้องต่องวด (mig 0413 · มติเจ้าของ 28/10/2026) ──────────────────────────
//
// ⭐ ความจริงอยู่ฝั่งคำร้อง: `dept_requests."installmentId"` (id ของแถวงวด — รอดการย้ายข้ามใบตอนออก Rev./ยกเงิน และการเลื่อนเลข
//   ตอนปรับแผน) · `installmentSeq` = งวดที่เลือกจากแผน QT ตอนยังไม่มีแถวงวด (ผูกให้ตอนสร้างแถว — installmentRequestsStore.js)
// ⭐ `sales_order_installments."billingRequestId"` (0260) เหลือเป็น **ตัวชี้** = คำร้องแรกที่ผูกงวด (ทุกสถานะ) — SQL ของ 0376/0377/0378
//   ใช้ตัดสิน "งวดล็อกจากปรับแผน" · webapp เขียนตัวชี้ที่ `syncBillingPointers` ที่เดียว
// ⭐ **คำร้องของงวด = คำร้องที่ `installmentId` ชี้งวดนี้ ∪ คำร้องที่ตัวชี้ชี้อยู่แต่ยังไม่มี `installmentId`**
//   ส่วนหลังคือลิงก์ของโค้ดรุ่นก่อน 0413 (เขียนตัวชี้อย่างเดียว) — ช่วงรัน mig ก่อน deploy และตอนฐานยังไม่รัน 0413
//   (แถวคำร้องไม่มีคีย์ `installmentId` เลย) ⇒ ทุกจออ่านกติกานี้ตัวเดียว ไม่มีใครเห็นลิงก์หาย
// ⚠️ ฟังก์ชันล้วน — ไม่มี import ของฐาน · "ขอแล้ว" ตัดสินที่ `billingRequestLive` (billingRule.js) ตัวเดียวเหมือนเดิม
import { billingRequestLive } from '@/lib/sales/billingRule';

export const BILLING_INSTALLMENT_MIGRATION = '0413';
export const BILLING_INSTALLMENT_SCHEMA_MISSING =
  'ฐานข้อมูลยังไม่รองรับการผูกคำร้องกับงวดแบบใหม่ (รอรัน migration 0413) — แจ้งผู้ดูแลระบบ';

const text = (value) => String(value ?? '').trim();
const isColumnMissing = (error) => error?.code === '42703' || error?.code === 'PGRST204';

/**
 * แปล error ของฐานเป็น "รอรัน migration 0413" — หรือ null (ไม่ใช่เรื่องของ 0413 · ผู้เรียกตอบตามเดิม)
 * ⚠️ จับเฉพาะข้อความที่พูดถึงสองคอลัมน์ของไฟล์นี้ — error คอลัมน์อื่นห้ามโทษ 0413 (คนจะไปรันผิดตัว)
 */
export function billingInstallmentSchemaError(error) {
  if (!error) return null;
  return isColumnMissing(error) && /installment(Id|Seq)/.test(String(error.message || ''))
    ? BILLING_INSTALLMENT_SCHEMA_MISSING : null;
}

const requestList = (requests) => {
  if (!requests) return [];
  if (requests instanceof Map) return [...requests.values()];
  return Array.isArray(requests) ? requests : [];
};

/* ลำดับคงที่ของคำร้องในงวด — เก่าก่อน (เวลาสร้าง แล้ว id) · ตัวชี้ = ตัวแรกของลำดับนี้ (`billingPointerFor`) */
const byCreated = (a, b) => text(a.createdAt).localeCompare(text(b.createdAt)) || text(a.id).localeCompare(text(b.id));

/**
 * คำร้องทั้งหมดของงวด (เก่าก่อน) — กติกาเดียวของทุกจอ (หัวไฟล์)
 * @param row      แถวงวด (`id` · `billingRequestId` ตัวชี้)
 * @param requests คำร้องที่ผู้เรียกโหลดมา (Map id → แถว หรืออาเรย์) — ต้องมี `id` `status` และ `installmentId` (ถ้าฐานมี)
 */
export function installmentRequests(row, requests) {
  const id = text(row?.id);
  const pointer = text(row?.billingRequestId);
  if (!id && !pointer) return [];
  return requestList(requests)
    .filter((request) => request?.id && (
      (id && text(request.installmentId) === id)
      // ลิงก์รุ่นเก่า: ตัวชี้ชี้คำร้องที่ยังไม่รู้งวดของตัวเอง — คำร้องที่ชี้งวดอื่นอยู่แล้วไม่นับ (ตัวชี้ค้างจากก่อนย้าย)
      || (pointer && request.id === pointer && !text(request.installmentId))
    ))
    .sort(byCreated);
}

/** งวดนี้ "ขอเอกสารแล้ว" ไหม = มีคำร้องที่ส่งถึงบัญชีแล้วและยังไม่ถูกยกเลิกอย่างน้อยหนึ่งใบ (`billingRequestLive`) */
export function installmentRequestLive(row, requests) {
  return installmentRequests(row, requests).some(billingRequestLive);
}

/**
 * คำร้องตัวแทนของงวด สำหรับจอที่โชว์ได้ใบเดียว (ป้าย/คอลัมน์ทะเบียน/กระดิ่ง) — ส่งแล้วก่อน · แล้วร่าง · แล้วใบที่ตาย · ไม่มี = null
 * ⚠️ ตัวตัดสิน "ขอแล้ว" ห้ามอ่านจากตัวแทน — ถาม `installmentRequestLive` (ตัวแทนที่ตายแปลว่าไม่มีใบไหนยังมีชีวิต อยู่แล้ว)
 */
export function primaryInstallmentRequest(row, requests) {
  const list = installmentRequests(row, requests);
  return list.find(billingRequestLive)
    || list.find((request) => text(request.status) === 'draft')
    || list[0]
    || null;
}

/** ตัวชี้ที่ควรอยู่บนแถวงวด = คำร้องแรก (เก่าสุด · ทุกสถานะ) ที่ `installmentId` ชี้งวดนี้ · ไม่มี = null */
export function billingPointerFor(installmentId, requests) {
  const id = text(installmentId);
  if (!id) return null;
  const linked = requestList(requests).filter((request) => request?.id && text(request.installmentId) === id).sort(byCreated);
  return linked[0]?.id || null;
}

/** id ของงวดที่ "ขอเอกสารแล้ว" — ป้อน `requestedIds` ของตัวคิด/ด่านวันงวด (ชุดเดียวกับ `installmentRequestLive`) */
export function installmentRequestedIds(rows = [], requests = []) {
  return new Set((Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && installmentRequestLive(row, requests))
    .map((row) => row.id));
}
