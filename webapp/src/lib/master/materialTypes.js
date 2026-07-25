// ประเภทบรรจุภัณฑ์ (PM) — แหล่งเดียวที่ทุกหน้าอ้าง
//
// มติ 2026-07-26: เป็นค่าคงที่ในโค้ด ไม่ทำเป็นเมนูในการตั้งค่า
//   · ลิสต์เปลี่ยนแทบไม่มี และประวัติการเปลี่ยนลิสต์ไม่มีค่า — สิ่งที่มีค่าคือ "วัสดุตัวนี้
//     เป็นประเภทอะไร" ซึ่งตรึงอยู่ที่ material_prices."pmType" ของแถวเองแล้ว
//   · ทำไมต้องมี: ตัวเลือกวัสดุบนใบขอราคาผลิตกรองด้วย kind='PM' ก้อนเดียวไม่พอ —
//     พอทะเบียนโตถึงร้อยตัว บรรทัด "ขวดแก้ว" จะเห็นฝา/กล่อง/ก้านไม้ปนกันหมด
//   เพิ่มประเภทใหม่ = แก้บรรทัดในไฟล์นี้ (ไม่ต้อง migration — DB ไม่มี CHECK ผูกไว้)
//   ถ้าต้องแก้เกิน 3 ครั้ง หรือมีคนขอประเภทเฉพาะลูกค้า ค่อยยกเป็นตารางในการตั้งค่า
//   ตอนนั้น (เงื่อนไขเดียวกับหน่วยสินค้า lib/master/units.js)

export const PM_TYPES = Object.freeze([
  { value: 'bottle', label: 'ขวด' },
  { value: 'cap', label: 'ฝา/จุก' },
  { value: 'pump', label: 'ปั๊ม/หัวสเปรย์' },
  { value: 'stick', label: 'ก้านไม้หอม' },
  { value: 'jar', label: 'กระปุก/ตลับ' },
  { value: 'tube', label: 'หลอด' },
  { value: 'pouch', label: 'ถุง/ซอง' },
  { value: 'box', label: 'กล่อง' },
  { value: 'label', label: 'ฉลาก/สติกเกอร์' },
  { value: 'decor', label: 'อุปกรณ์ตกแต่ง (ริบบิ้น/การ์ด)' },
]);

export const PM_TYPE_VALUES = Object.freeze(PM_TYPES.map((t) => t.value));

// ป้ายชื่อไทยของประเภทหนึ่ง ๆ — ค่าที่ไม่รู้จัก (ลิสต์เคยมีแล้วถูกตัด) ไม่หายไปเงียบ ๆ
export function pmTypeLabel(value, fallback = 'อื่น ๆ') {
  if (!value) return fallback;
  return PM_TYPES.find((t) => t.value === value)?.label || `${value} (ประเภทเดิม)`;
}

// ตัวเลือก dropdown = ลิสต์มาตรฐาน + "ค่าปัจจุบัน" ถ้ามันไม่อยู่ในลิสต์แล้ว
// (แพตเทิร์นเดียวกับ unitOptions — ถ้าไม่พ่วงไว้ ช่องจะเด้งกลับเป็นค่าแรกของลิสต์
//  แล้วประเภทเปลี่ยนเงียบ ๆ ตอนผู้ใช้กดบันทึกเรื่องอื่น)
export function pmTypeOptions(current, { allowEmpty = true, emptyLabel = 'ไม่ระบุ' } = {}) {
  const value = String(current ?? '').trim();
  const base = allowEmpty ? [{ value: '', label: emptyLabel }] : [];
  const list = [...base, ...PM_TYPES.map((t) => ({ value: t.value, label: t.label }))];
  if (!value || PM_TYPE_VALUES.includes(value)) return list;
  return [...list, { value, label: `${value} (ประเภทเดิม)` }];
}

// ค่าที่จะเก็บลง DB — วัสดุที่ไม่ใช่ PM ไม่มีประเภทบรรจุภัณฑ์
export function normalizePmType(kind, value) {
  if (kind !== 'PM') return null;
  const text = String(value ?? '').trim();
  return text || null;
}
