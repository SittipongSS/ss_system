// ── ข้อความ "โซนนี้อยู่ในใบที่ยังไม่เปิดงานบริการ" (PR-C · C-D17/C-D18/C-D19) ─────────────────────────
//
// 🔴 **ไฟล์นี้ห้าม import อะไรเลย** (critique L9) — มันถูกมัดรวมเข้าหน้าจัดคิว (ชิปใบสั่งขายบนด่านนัด) และโมดัลโซน
//   (คำเตือนตอนปิดใช้งาน) · ตัวติดป้ายที่ต้องรู้สถานะของใบ (`zoneSetupOrders.js`) ดึง `serviceSetup.js` ทั้งกราฟ
//   (บิล/งวด/สิทธิ์) ⇒ server ติดป้ายให้เสร็จ (`stateLabel`) แล้วจอใช้แค่ตัวสร้างข้อความที่นี่
//   (ยาม: zoneSetupOrderText.test.mjs "ไฟล์ข้อความไม่มี import เลย")
//
// รูปของชิปหนึ่งใบ (มาจาก `pendingSetupOrdersByZone` ฝั่ง server):
//   `{ orderId, orderNumber, status, group: 'unapproved' | 'backfill' | 'reopened', stateLabel, ownerName | null }`
//
// ⭐ สามกลุ่ม สามคำนำ (C-D17 · critique M4) — ใบที่อนุมัติแล้วแต่ฝ่ายขายกำลังตั้งงานบริการย้อนหลัง
//   **ไม่ใช่ "ใบที่ยังไม่อนุมัติ"** · เรียกผิดกลุ่มเมื่อไร TS จะไปตามให้ผู้จัดการอนุมัติใบที่อนุมัติไปแล้ว
// ⭐ กลุ่มที่สาม (mig 0396): ใบที่ **เปิดแก้งานบริการหลังอนุมัติ** — รอบขายถูกถอนจาก TS แล้วกลับเข้าเส้นตั้งย้อนหลัง
//   ไม่ใช่ "ใบเดิมที่ยังไม่เคยตั้ง" · เรียกว่าตั้งย้อนหลังเมื่อไร TS เห็นสองเรื่องของใบเดียวกัน (แท็บงานเข้าใหม่พูด "กำลังแก้ (หลังอนุมัติ)")
//   (ตรวจทาน ui-zone-chip-reopened-label)

export const SETUP_ORDER_GROUP = Object.freeze({ unapproved: 'unapproved', backfill: 'backfill', reopened: 'reopened' });

/* คำนำของแต่ละกลุ่มบนป้ายแถวโซน — ลำดับในอาร์เรย์ = ลำดับที่กลุ่มขึ้นบนป้าย */
const TAG_LEAD = [
  [SETUP_ORDER_GROUP.unapproved, 'อยู่ในใบที่ยังไม่อนุมัติ'],
  [SETUP_ORDER_GROUP.backfill, 'อยู่ในใบที่กำลังตั้งงานบริการย้อนหลัง'],
  [SETUP_ORDER_GROUP.reopened, 'อยู่ในใบที่กำลังแก้งานบริการหลังอนุมัติ'],
];

/* ใบตั้งย้อนหลัง/เปิดแก้ต้องบอกว่าเป็นเส้นไหน เมื่ออยู่ในข้อความที่ไม่มีคำนำของกลุ่มกำกับ (คำเตือน · ชิป) */
const GROUP_PREFIX = {
  [SETUP_ORDER_GROUP.backfill]: 'ตั้งย้อนหลัง',
  [SETUP_ORDER_GROUP.reopened]: 'แก้หลังอนุมัติ',
};
const stateText = (o) => (GROUP_PREFIX[o?.group] ? `${GROUP_PREFIX[o.group]} · ${o.stateLabel}` : o?.stateLabel);

const listOf = (list) => (Array.isArray(list) ? list.filter(Boolean) : []);
const item = (o, state) => `${o.orderNumber} (${state})`;

/** ป้ายบนแถวโซน (หน้าไซต์ · แท็บพื้นที่บริการของลูกค้า) — ไม่มีใบ = null */
export function pendingOrderTagText(list) {
  const orders = listOf(list);
  const parts = TAG_LEAD
    .map(([group, lead]) => {
      const items = orders.filter((o) => o.group === group).map((o) => item(o, o.stateLabel));
      return items.length ? `${lead}: ${items.join(' · ')}` : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** คำเตือนตอนติ๊ก "ใช้งานอยู่" ออก (C-D18 · ไม่ขวาง ทะเบียนเป็นของ TS) — ไม่มีใบ = null
 *  ⚠️ ด่านจริงอยู่ที่ฐาน: 0392 ปฏิเสธโซนที่ปิดใช้งานทุกทาง (ยื่น/อนุมัติ/ตรวจ) ⇒ ข้อความบอกผลนั้นล่วงหน้า */
export function zoneDeactivateWarning(list) {
  const orders = listOf(list);
  if (!orders.length) return null;
  const items = orders.map((o) => item(o, stateText(o))).join(' · ');
  return `โซนนี้อยู่ในใบที่ยังไม่เปิดงานบริการ: ${items} — ปิดแล้วใบนั้นจะยื่น/อนุมัติ/ตรวจผ่านไม่ได้จนกว่าฝ่ายขายเปลี่ยนโซน`;
}

/** ชิปใบสั่งขายบนด่านนัดที่ติด (D15 · C9) — และเป็นข้อความที่ต้องค้นเจอ (haystack) */
export function setupOrderChipText(o) {
  return `ใบสั่งขาย ${o.orderNumber} · ${stateText(o)}${o.ownerName ? ` · ${o.ownerName}` : ''}`;
}
