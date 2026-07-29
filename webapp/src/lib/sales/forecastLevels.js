// ระดับ FC (โอกาสปิดการขาย) — **แหล่งเดียวของทั้งระบบ**
//
// เดิมลิสต์นี้ถูกก๊อปไว้ 3 ที่: FORECAST_LEVELS ใน components/salesPlanning/ui.js,
// FC_LEVELS ใน api/sales-planning/dashboard, fcLevels ใน api/sales-planning/my-dashboard
// — ตัดระดับออกหนึ่งระดับต้องไล่แก้ครบสามที่ ลืมที่ไหนแดชบอร์ดที่นั่นจะยังโชว์ถังเปล่า
// ของระดับที่ไม่มีอยู่จริงแล้ว. ไฟล์นี้ไม่มี JSX จึงให้ทั้ง route ฝั่ง server, component
// ฝั่ง client และเทสต์ import ตัวเดียวกันได้
//
// เกณฑ์วัดจาก **หลักฐานที่ได้จากลูกค้า** (มติผู้ใช้ 2026-07-29) ไม่ใช่ระยะทางบน pipeline
// — ดีลอยู่ขั้น "ผ่านคัดกรอง" แต่ FC 80% ได้ตามปกติ (จ่ายค่า Scent Design แล้วแต่ยัง
// ไม่ออกใบเสนอราคา) ห้ามเอา stage มาบังคับเพดาน FC
export const FORECAST_LEVELS = [
  { value: 20, label: '20% · นัด Meeting แล้ว' },
  { value: 50, label: '50% · ออกใบเสนอราคาแล้ว' },
  { value: 80, label: '80% · มี FC / ชำระค่า Scent Design' },
];

export const FORECAST_VALUES = FORECAST_LEVELS.map((level) => level.value);

// ค่าที่ **ระบบตั้งเอง** ไม่มีในดรอปดาวน์ (มติผู้ใช้ 2026-07-29):
//   100 = ปิดได้แล้ว — มาจากการกด Won บนใบเสนอราคาเท่านั้น ไม่ใช่สิ่งที่คนเลือกเอง
//     (เดิมเลือกได้ ทำให้มีดีลตั้ง 100% ทั้งที่ยังไม่มีใบเสนอราคาสักใบ อ่านแดชบอร์ดแล้ว
//      เหมือนเงินก้อนนั้นปิดแน่แล้ว)
//   0   = Lost
// หน้าที่แสดง FC ซ่อนป้ายเมื่อดีล won/lost อยู่แล้ว ค่าพวกนี้จึงไม่ถูกเอาไป snap
export const SYSTEM_FORECAST_VALUES = [0, 100];

// ปัดค่าที่เก็บไว้ให้เข้าระดับที่ใกล้ที่สุด — รองรับดีลเก่าที่เคยเก็บ 10/30/55/65/75/90/100
// ค่าที่อ่านไม่ออก → 50 (ระดับกลาง) เหมือนค่าตั้งต้นของฟอร์ม
export function snapForecastLevel(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 50;
  return FORECAST_VALUES.reduce(
    (best, value) => (Math.abs(value - n) < Math.abs(best - n) ? value : best),
    FORECAST_VALUES[0],
  );
}
