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

/* สัญญาที่เอามาผูกกับใบนี้ได้ — เงื่อนไขสองข้อเท่านั้น
   ⭐ **ต้องเป็นสัญญาของดีลเดียวกัน** — สัญญาผูกกับดีล (mig 0278 `dealId` NOT NULL)
     และใบสั่งขายก็ออกจากดีล ⇒ ข้ามดีลเมื่อไรคือการอ้างสัญญาของงานอื่น
   ⭐ **ต้องมีผลแล้ว** (`signed`) — ใบร่าง/รอลงนาม/รอหัวหน้ารับรอง ยังไม่ผูกพัน
     ⇒ ผูกไปก็ปลดล็อกงานไม่ได้จริง แต่จะทำให้คนเข้าใจผิดว่ามีสัญญาแล้ว
   ⚠️ **ไม่กรองด้วยชนิดสัญญา** โดยตั้งใจ — ใบบริการที่ลูกค้าส่ง PO มาแล้วออกเป็น
     "สัญญาจ้างผลิต" ก็มีจริง · ชนิดโชว์บนตัวเลือกให้คนตัดสินเอง */
export const contractLinkable = (contract) => contractInForce(contract);

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
   ⚠️ **สัญญาที่หมดอายุแล้วยังเป็น `signed`** — สถานะไม่ได้ตอบเรื่องเวลา ⇒ ต้องโชว์
     ช่วงมีผลคู่กันเสมอ ไม่งั้นคนอ่าน "มีผล" แล้วเข้าใจว่าใช้ได้อยู่วันนี้
   คืน `{ value, sub, tone }` — ไม่มีไอคอน/JSX เพราะเป็นตรรกะล้วน จอเป็นคนใส่ไอคอน */
export function serviceContractHeadline(contract) {
  if (!contract) {
    return { value: 'ยังไม่ผูกสัญญา', sub: 'งานบริการเริ่มไม่ได้จนกว่าจะมีสัญญาที่มีผล', tone: 'wait' };
  }
  const span = [contract.effectiveDate, contract.expiryDate].filter(Boolean).join(' — ');
  if (!contractInForce(contract)) {
    return {
      value: contract.contractNo || 'ฉบับร่าง',
      sub: `${contractStatusLabel(contract.status)} — ยังใช้เดินงานไม่ได้`,
      tone: 'late',
    };
  }
  return {
    value: contract.contractNo || 'ฉบับร่าง',
    sub: span || 'ไม่ระบุช่วงมีผล',
    tone: 'ok',
  };
}
