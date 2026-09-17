// ── Checklist ของใบสเปคสินค้า FM-SA-04 — ทะเบียนฝั่งโค้ด (mig 0364) ──────────
//
// ⭐ 17 แถวตามแบบฟอร์มกระดาษ Rev.00 (08/05/2568) · งอกเป็นแถวจริงตอนสร้าง "ฉบับ"
// แล้วเก็บ `itemLabel` ลงแถวด้วย ⇒ ฉบับที่ออกไปแล้วไม่เปลี่ยนคำตามทะเบียนที่แก้ทีหลัง
//
// ⚠️ **ทะเบียนอยู่ในโค้ด ไม่ใช่ CHECK ในฐาน** (แพตเทิร์นเดียวกับ PDR mig 0214) —
// แบบฟอร์มกระดาษเพิ่งขึ้น Rev.00 ยังเปลี่ยนได้อีก · ผูก CHECK เมื่อไร การเพิ่ม/ลด
// แถวกลายเป็น migration ทุกครั้ง
//
// ⚠️ **ห้ามเปลี่ยน `key` ของแถวที่ปล่อยไปแล้ว** — คีย์คือสิ่งที่ผูกแถวในฉบับเก่ากับ
// ทะเบียนวันนี้ · เปลี่ยนคำได้ (แถวเก่าถือคำเดิมของตัวเองอยู่) แต่เปลี่ยนคีย์แปลว่า
// แถวเก่ากลายเป็นแถวที่ไม่มีต้นทางเงียบ ๆ
//
// ⚠️ ลำดับในลิสต์ = `sortOrder` บนกระดาษ · แถวที่ผู้ใช้เพิ่มเองต่อท้าย (`itemKey` = null)

export const PRODUCT_SPEC_CHECKLIST = Object.freeze([
  { key: 'raw_material',     label: 'วัตถุดิบ/สารประกอบ' },
  { key: 'inner_packaging',  label: 'บรรจุภัณฑ์ภายใน' },
  { key: 'spray_head',       label: 'หัวสเปรย์' },
  { key: 'cap',              label: 'ฝา' },
  { key: 'ring',             label: 'แหวน' },
  { key: 'reed_stick',       label: 'ก้านไม้ (สี/ขนาด)' },
  { key: 'packaging_print',  label: 'สกรีนบรรจุภัณฑ์' },
  { key: 'bottle_sticker',   label: 'สติกเกอร์ติดขวด' },
  { key: 'box_sticker',      label: 'สติกเกอร์ติดกล่อง' },
  { key: 'clear_box_stk',    label: 'สติกเกอร์ใสติดกล่อง' },
  { key: 'box',              label: 'กล่องบรรจุภัณฑ์' },
  { key: 'shrink_film',      label: 'ซีลฟิล์ม' },
  { key: 'carton',           label: 'ลังบรรจุ' },
  { key: 'box_insert',       label: 'ไส้ในกล่อง' },
  { key: 'card',             label: 'การ์ด' },
  { key: 'box_band',         label: 'สายคาดกล่อง' },
  { key: 'other',            label: 'อื่นๆ' },
]);

export const PRODUCT_SPEC_CHECKLIST_KEYS = Object.freeze(
  PRODUCT_SPEC_CHECKLIST.map((row) => row.key),
);

const LABEL_BY_KEY = new Map(PRODUCT_SPEC_CHECKLIST.map((row) => [row.key, row.label]));

export const productSpecChecklistLabel = (key) => LABEL_BY_KEY.get(key) || '';

/**
 * แถวตั้งต้นของฉบับใหม่ — ก๊อปคำจากทะเบียนลงแถว (ไม่ผูกสด)
 *
 * `previousItems` = แถวของฉบับก่อน · ส่งมาเมื่อไร ค่าที่กรอกไว้จะถูกยกมาให้ทั้งหมด
 * รวมแถวที่ผู้ใช้เพิ่มเอง เพราะ "ออก Rev. ใหม่" คือแก้ต่อจากของเดิม ไม่ใช่เริ่มจากศูนย์
 */
export function productSpecChecklistSeed(previousItems = []) {
  const prevByKey = new Map(
    previousItems.filter((row) => row?.itemKey).map((row) => [row.itemKey, row]),
  );
  const base = PRODUCT_SPEC_CHECKLIST.map((row, index) => {
    const prev = prevByKey.get(row.key);
    return {
      sortOrder: index,
      itemKey: row.key,
      itemLabel: row.label,
      detail: prev?.detail ?? null,
      preparedByS: prev?.preparedByS ?? false,
      preparedByCustomer: prev?.preparedByCustomer ?? false,
      note: prev?.note ?? null,
    };
  });
  // แถวที่ผู้ใช้เพิ่มเองไม่มีคีย์ในทะเบียน — ต่อท้ายตามลำดับเดิมของมัน
  const extras = previousItems
    .filter((row) => row && !row.itemKey)
    .map((row, index) => ({
      sortOrder: base.length + index,
      itemKey: null,
      itemLabel: row.itemLabel,
      detail: row.detail ?? null,
      preparedByS: row.preparedByS ?? false,
      preparedByCustomer: row.preparedByCustomer ?? false,
      note: row.note ?? null,
    }));
  return [...base, ...extras];
}
