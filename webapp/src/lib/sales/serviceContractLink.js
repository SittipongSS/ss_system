// ── ผูกสัญญาบริการเข้ากับใบสั่งขาย (mig 0324 · มติผู้ใช้ 2026-08-31) ─────────
//
// ⭐ **แหล่งความจริงอยู่ที่ใบ ไม่ใช่ที่รอบขายของโซน** — แผนเดิมให้เขียนลง
//   `service_zone_terms.serviceContractId` แต่ term เกิดตอน TS จัดสรรลงโซนเท่านั้น
//   ⇒ SA ผูกสัญญาก่อน TS จัดสรรไม่ได้เลย ซึ่งเป็นลำดับที่ของจริงเดินกัน
//   ⇒ เก็บที่ `sales_orders.serviceContractId` · term อ่านผ่านใบแม่สด ๆ ไม่ก๊อป
//
// ⚠️ ไฟล์นี้ถูก import ทั้งฝั่งจอและฝั่ง API — ห้าม import อะไรที่เป็น server-only
//   **ด่านต้องเป็นตัวเดียวกันสองที่** (กติกาเดียวกับ `contracts.js`)
import { contractInForce, contractKindLabel, contractStatusLabel } from '@/lib/sales/contracts';
import { businessDate } from '@/lib/businessDate';
import { fmtDate } from '@/lib/format';

/* สัญญาที่เอามาผูกกับใบนี้ได้ — เงื่อนไขสองข้อเท่านั้น
   ⭐ **ต้องเป็นสัญญาของดีลเดียวกัน** — สัญญาผูกกับดีล (mig 0278 `dealId` NOT NULL)
     และใบสั่งขายก็ออกจากดีล ⇒ ข้ามดีลเมื่อไรคือการอ้างสัญญาของงานอื่น
   ⭐ **ต้องมีผลแล้ว** (`signed`) — ใบร่าง/รอลงนาม/รอหัวหน้ารับรอง ยังไม่ผูกพัน
     ⇒ ผูกไปก็ปลดล็อกงานไม่ได้จริง แต่จะทำให้คนเข้าใจผิดว่ามีสัญญาแล้ว
   ⚠️ **ไม่กรองด้วยชนิดสัญญา** โดยตั้งใจ — ใบบริการที่ลูกค้าส่ง PO มาแล้วออกเป็น
     "สัญญาจ้างผลิต" ก็มีจริง · ชนิดโชว์บนตัวเลือกให้คนตัดสินเอง */
export const contractLinkable = (contract) => contractInForce(contract);

/** ช่วงมีผลของสัญญาเทียบกับวันหนึ่ง — `'before' | 'in' | 'after' | null`
 *
 * ⭐ **"ผูกได้" กับ "ใช้เดินงานได้วันนี้" เป็นคนละคำถาม และต้องไม่ยุบเป็นตัวเดียว**
 *   `contractLinkable` ถามว่าเอกสารผูกพันแล้วหรือยัง (`signed`) — สัญญาที่เซ็นวันนี้
 *   แต่เริ่มมีผลเดือนหน้า **ต้องผูกกับใบล่วงหน้าได้** ไม่งั้น SA ต้องรอถึงวันเริ่ม
 *   ⇒ ฟังก์ชันนี้ตอบอีกคำถามหนึ่ง: ณ วันนี้ เอกสารนั้นครอบงานอยู่ไหม
 * ⚠️ เทียบสตริง `YYYY-MM-DD` ตรง ๆ ได้เพราะทั้งคู่รูปเดียวกัน · วันหมดอายุนับรวมทั้งวัน
 * ⚠️ ไม่ระบุวันเลย = `null` ("ไม่รู้") ไม่ใช่ `'in'` — สัญญาที่ไม่มีช่วงมีผลตอบไม่ได้ว่า
 *   ครอบวันไหน ผู้เรียกเป็นคนเลือกว่าจะถือว่าอย่างไร
 */
export function contractSpanAt(contract, today = businessDate()) {
  if (!contract) return null;
  const from = String(contract.effectiveDate || '');
  const to = String(contract.expiryDate || '');
  if (!from && !to) return null;
  if (from && String(today) < from) return 'before';
  if (to && String(today) > to) return 'after';
  return 'in';
}

export function serviceContractOptions(contracts = []) {
  return (contracts || [])
    .filter(contractLinkable)
    .map((c) => ({
      value: c.id,
      label: `${c.contractNo} · ${contractKindLabel(c.kind)}`,
      // ช่วงมีผลคือสิ่งที่คนต้องเห็นก่อนเลือก — สัญญาที่หมดอายุแล้วยังเป็น signed อยู่
      hint: [c.effectiveDate, c.expiryDate].filter(Boolean).join(' — ') || null,
    }));
}

/**
 * ด่านเดียวที่ทั้งปุ่มบนจอและ API ใช้ร่วมกัน — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 *
 * @param order      ใบสั่งขาย (ต้องมี `status`, `dealId`)
 * @param contract   สัญญาที่จะผูก — ส่ง `null` = ถอดสัญญาออกจากใบ
 * @param options.canEdit  ผู้ใช้มีสิทธิ์แก้ใบนี้ไหม (ผู้เรียกคำนวณมาให้)
 */
export function serviceContractLinkError(order, contract, { canEdit = false } = {}) {
  /* 🪤 **ด่านนี้คุมทั้ง "ผูก" และ "ถอด"** — ข้อความจึงต้องพูดถึงสิ่งที่คนกำลังกดจริง
     ของเดิมตอบ "ผูกสัญญาไม่ได้" ให้คนที่กดปุ่ม *ถอด* ซึ่งอ่านแล้วไม่รู้ว่าเกิดอะไรขึ้น */
  const unlinking = contract === null || contract === undefined;
  const verb = unlinking ? 'ถอดสัญญา' : 'ผูกสัญญา';
  if (!order) return 'ไม่พบใบสั่งขาย';
  if (!canEdit) return `${verb}ได้เฉพาะฝ่ายขายที่ดูแลใบนี้`;
  /* ⚠️ ใบที่ยกเลิก/ถูกแทนด้วย Rev. แล้วห้ามแก้ — ไม่งั้นเราจะแก้เอกสารที่ตายแล้ว
     (ใบที่อนุมัติแล้วยัง **แก้ได้** โดยตั้งใจ: สัญญามักมาทีหลังใบ) */
  if (['cancelled', 'revised'].includes(order.status)) {
    return `ใบนี้ปิดไปแล้ว — ${verb}ไม่ได้`;
  }
  if (unlinking) return null; // ถอดออกจากใบที่ยังเปิดอยู่ = ผ่านเสมอ
  if (contract.dealId !== order.dealId) {
    return 'สัญญาฉบับนี้เป็นของดีลอื่น — เลือกได้เฉพาะสัญญาของดีลเดียวกับใบนี้';
  }
  if (!contractLinkable(contract)) {
    return 'สัญญาฉบับนี้ยังไม่มีผล — ต้องลงนามและผ่านการรับรองก่อนจึงผูกกับใบได้';
  }
  return null;
}

/* ── สรุปสัญญาบริการของใบ สำหรับหัวใบสั่งขาย ─────────────────────────────────
   ⭐ **คำถามแรกของคนเปิดใบบริการคือ "ใบนี้มีสัญญาแล้วหรือยัง"** — ของเดิมตอบได้แค่
     บนหัวแท็บ (`สัญญา · ยังไม่ผูก`) ซึ่งต้องเลื่อนไปอ่าน · ข้อมูลมากับ GET ของใบ
     อยู่แล้ว ไม่ต้องยิงเพิ่ม
   🔴 **สี่สภาพที่หน้าตาคล้ายกันแต่ต้องบอกคนละเรื่อง**
     1. ยังไม่เคยผูก           → งานบริการยังเริ่มไม่ได้
     2. ผูกไว้แล้วแต่โหลดไม่ขึ้น → GET กลืน error ของคิวรีสัญญาแล้วคืน `null` ซึ่งหน้าตา
        เหมือนข้อ 1 เป๊ะ ⇒ ต้องดู `serviceContractId` ของใบประกอบ ไม่ใช่ดูสัญญาอย่างเดียว
     3. ผูกแล้วแต่หมดอายุ      → `contractInForce` ดูแค่ `status === 'signed'` ไม่ดูวันที่
        ⇒ สัญญาที่หมดอายุไปแล้วยังเขียวอยู่ ทั้งที่งานหน้างานเดินต่อไม่ได้จริง
     4. ผูกแล้วแต่ยังไม่เริ่ม   → เหตุเดียวกับข้อ 3 แต่เป็นขอบ *หน้า* ของช่วงมีผล
        ⇒ สัญญาที่เซ็นล่วงหน้าขึ้นเขียวตั้งแต่วันเซ็น ทั้งที่ยังสั่งงานไม่ได้
        ⚠️ ข้อนี้ **ห้ามแก้ด้วยการปิดไม่ให้ผูก** — ผูกล่วงหน้าเป็นลำดับที่ถูกต้อง
          ที่ผิดคือหัวใบที่บอกสีเขียวเฉย ๆ โดยไม่บอกว่ายังไม่ถึงเวลา
   ⚠️ **วันที่ต้องผ่าน `fmtDate`** — ทั้งใบใช้ DD/MM/YYYY · ปล่อย ISO ดิบจะได้ค่าเดียวกัน
      อ่านสองรูปบนใบเดียวกัน (การ์ดสัญญาที่อยู่ห่างกันคลิกเดียวใช้ fmtDate อยู่แล้ว)
   คืน `{ value, sub, tone }` — ไม่มีไอคอน/JSX เพราะเป็นตรรกะล้วน จอเป็นคนใส่ไอคอน */
export function serviceContractHeadline(contract, { linkedId = null, today = businessDate() } = {}) {
  if (!contract) {
    if (linkedId) {
      return {
        value: 'โหลดสัญญาไม่ขึ้น',
        sub: 'ใบนี้ผูกสัญญาไว้แล้ว แต่ดึงรายละเอียดไม่สำเร็จ — เปิดแท็บสัญญาอีกครั้ง',
        tone: 'late',
      };
    }
    return { value: 'ยังไม่ผูกสัญญา', sub: 'งานบริการเริ่มไม่ได้จนกว่าจะมีสัญญาที่มีผล', tone: 'wait' };
  }
  const number = contract.contractNo || 'ฉบับร่าง';
  if (!contractInForce(contract)) {
    return { value: number, sub: `${contractStatusLabel(contract.status)} — ยังใช้เดินงานไม่ได้`, tone: 'late' };
  }
  const span = [contract.effectiveDate, contract.expiryDate].filter(Boolean).map(fmtDate).join(' — ');
  /* เทียบวันด้วยนาฬิกาไทย (`businessDate`) ผ่านตัวตัดสินเดียว `contractSpanAt`
     ⚠️ **สภาพที่สี่ที่คอมเมนต์ข้างบนลืมไป: "ยังไม่ถึงวันเริ่มมีผล"** — ของเดิมตรวจแต่
       ขอบท้าย (หมดอายุ) ⇒ สัญญาที่เซ็นแล้วแต่เริ่มเดือนหน้าขึ้น **เขียว** พร้อมช่วงวันที่
       ที่ยังมาไม่ถึง · คนอ่านหัวใบเห็นเขียวแล้วเข้าใจว่าสั่งงานได้เลย
     ⚠️ โทนของสภาพนี้คือ `wait` ไม่ใช่ `late` — ไม่มีอะไรผิดพลาด แค่ยังไม่ถึงเวลา
       (`late` สงวนไว้ให้สภาพที่ต้องมีคนไปทำอะไรสักอย่าง) */
  const span_ = contractSpanAt(contract, today);
  if (span_ === 'after') return { value: number, sub: `${span} — หมดอายุแล้ว`, tone: 'late' };
  if (span_ === 'before') {
    return { value: number, sub: `${span} — ยังไม่ถึงวันเริ่มมีผล`, tone: 'wait' };
  }
  return { value: number, sub: span || 'ไม่ระบุช่วงมีผล', tone: 'ok' };
}
