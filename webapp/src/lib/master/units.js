// หน่วยกลางของระบบ — แหล่งเดียวที่ทุกหน้าอ้าง
//
// มติ 2026-07-26: ไม่ทำเป็นเมนูในการตั้งค่า และไม่ผูกกับหมวดสินค้า
//   · ลิสต์เปลี่ยนแทบไม่มี และประวัติการเปลี่ยนลิสต์ไม่มีค่า — สิ่งที่มีค่าคือ "ใบนี้ใช้หน่วย
//     อะไร" ซึ่งตรึงอยู่ที่ quotation_lines.unit + ฉบับ snapshot อยู่แล้ว
//   · หมวดเดียวกันขายเป็นขวด/ชุด/กล่องก็ได้แล้วแต่ SKU — ผูกกับหมวดจะผิดจนต้องมี override
//   เพิ่มหน่วยใหม่ = แก้บรรทัดในไฟล์นี้ · ถ้าต้องเพิ่มเกิน 3 ครั้ง หรือมีคนขอหน่วยเฉพาะ
//   ลูกค้า ค่อยยกเป็นตารางในการตั้งค่าตอนนั้น (ตอนที่มีหลักฐานว่าคุ้ม)

// หน่วยขาย = หน่วยที่พิมพ์บนใบเสนอราคา/ใบสั่งขาย (คนละอย่างกับปริมาตรบรรจุ)
export const SALE_UNITS = Object.freeze(['ชิ้น', 'ขวด', 'หลอด', 'ชุด', 'กล่อง', 'แพ็คเกจ', 'งาน']);

// หน่วยปริมาตร/น้ำหนักบรรจุของตัวสินค้า
export const VOLUME_UNITS = Object.freeze(['ml', 'g', 'kg', 'L', 'pcs', 'package']);

export const DEFAULT_SALE_UNIT = 'ชิ้น';
export const DEFAULT_VOLUME_UNIT = 'ml';

// เพดานความยาว — หน่วยไปโผล่ในคอลัมน์แคบบนเอกสาร A4 ค่ายาวผิดปกติจาก client
// จะดันตารางเสียรูป (คอลัมน์ใน DB เป็น text ไม่มีเพดานของตัวเอง)
export const SALE_UNIT_MAX = 20;

export function saleUnitOf(value, fallback = DEFAULT_SALE_UNIT) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text.length > SALE_UNIT_MAX ? text.slice(0, SALE_UNIT_MAX) : text;
}

// ตัวเลือกสำหรับ dropdown = ลิสต์มาตรฐาน + "ค่าปัจจุบัน" ถ้ามันไม่อยู่ในลิสต์แล้ว
// (เช่นสินค้าที่เคยตั้ง 'แพ็ค'/'โหล'/'oz' ไว้ก่อนลิสต์ถูกตัด) — ถ้าไม่พ่วงไว้ ช่องจะเด้ง
// กลับเป็นค่าแรกของลิสต์ แล้วหน่วยเปลี่ยนเงียบ ๆ ตอนผู้ใช้กดบันทึกเรื่องอื่น
export function unitOptions(list, current) {
  const value = String(current ?? '').trim();
  if (!value || list.includes(value)) return list.map((unit) => ({ value: unit, label: unit }));
  return [
    ...list.map((unit) => ({ value: unit, label: unit })),
    { value, label: `${value} (ค่าเดิม)` },
  ];
}

// '30 ml' — รวมการเติมหน่วยตั้งต้นที่เดิมเขียน `|| 'ml'` ซ้ำอยู่หลายหน้า
export function formatVolume(product) {
  const volume = product?.volume;
  if (volume === null || volume === undefined || volume === '') return '-';
  return `${volume} ${String(product?.volumeUnit || '').trim() || DEFAULT_VOLUME_UNIT}`;
}
