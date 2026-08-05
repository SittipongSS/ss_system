// ── ทะเบียนรูปร่างบรรทัด — ประกอบจากบ้านของแต่ละฝ่าย (P7b) ──────────────
//
// ⭐ แกนที่สองของโมดูลแยกฝ่าย · `registry.js` ตอบว่า **"ใบนี้ขออะไร"**
// ไฟล์นี้ตอบว่า **"แถวข้างในหน้าตาแบบไหน และตรวจยังไง"**
//
// ก่อนหน้านี้สองอย่างนี้กระจายอยู่คนละที่และไม่รู้จักกัน:
//   · ป้ายสถานะรายรูปร่าง อยู่ในตารางตายตัวที่ `statuses.js`
//   · ตัวตรวจบรรทัด อยู่ที่ `POST /api/sa/requests` เป็น if/else 3 ชั้น
// ⇒ ฝ่ายที่เพิ่มรูปร่างบรรทัดใหม่ต้องไปแก้ **สองไฟล์ที่ไม่ใช่ของตัวเอง** และลืมได้
// ทีละอัน (ลืมป้าย = แถวขึ้นว่า "ตอบราคาแล้ว" ทั้งที่เป็นบรรทัดขอเอกสาร)
//
// ⚠️ ไฟล์นี้ **ไม่ import `requestTypes.js`** โดยตั้งใจ — ผู้เรียกส่ง `lineShape` ที่
// คำนวณแล้วเข้ามา · import กลับไปจะได้วง `requestTypes → registry → …` ที่แก้ยาก
import RD_LINE_SHAPES from './rd/lineShapes';
import SHARED_LINE_SHAPES from './shared/lineShapes';
import FN_LINE_SHAPES from './fn/lineShapes';

const byKey = {};
for (const shape of [...SHARED_LINE_SHAPES, ...RD_LINE_SHAPES, ...FN_LINE_SHAPES]) {
  if (!shape?.key) throw new Error('รูปร่างบรรทัด: ต้องมี key');
  if (byKey[shape.key]) throw new Error(`รูปร่างบรรทัด "${shape.key}": key ซ้ำ`);
  // ป้ายต้องครบทั้งสามสถานะ — ขาดตัวไหนแถวจะขึ้นเป็นค่าดิบ ('pending') บนหน้าจอ
  for (const status of ['pending', 'done', 'declined']) {
    if (!shape.labels?.[status]) {
      throw new Error(`รูปร่างบรรทัด "${shape.key}": ขาดป้ายของสถานะ ${status}`);
    }
  }
  byKey[shape.key] = shape;
}

export const LINE_SHAPES = Object.freeze(byKey);

// รูปร่างตั้งต้นเมื่อไม่รู้ว่าแถวเป็นชนิดไหน — บรรทัดวัสดุคือของเดิมที่มีมาก่อน
// รูปร่างอื่นทั้งหมด (แถวเก่าบน prod ไม่มี `lineKind`)
export const DEFAULT_LINE_SHAPE = 'material';

export function lineShapeLabels(lineKind) {
  return (LINE_SHAPES[lineKind] || LINE_SHAPES[DEFAULT_LINE_SHAPE]).labels;
}

/**
 * ตรวจและแปลงบรรทัดที่ client ส่งมา ตามรูปร่างของหัวข้อนั้น — คืน { items, error }
 *
 * ⭐ **ที่เดียวที่ route เรียก** แทน if/else 3 ชั้นที่เคยอยู่ใน POST /api/sa/requests
 * ⇒ เพิ่มรูปร่างบรรทัดใหม่ = เพิ่มไฟล์ในโฟลเดอร์ของฝ่ายตัวเอง route ไม่ต้องแก้
 *
 * ⚠️ `lineShape` ที่ไม่รู้จัก **ตีกลับ ไม่ใช่ถอยไปใช้บรรทัดวัสดุ** — ถอยเมื่อไรจะได้
 * แถวที่ผ่านด่านของวัสดุแต่ไปตาย CHECK `dept_request_items_shape` ที่ DB แทน
 * (ป้ายบนจอถอยได้เพราะแค่แสดงผล · ตัวตรวจถอยไม่ได้เพราะมันเขียนลง DB)
 */
export function normalizeLinesFor(lineShape, input, ctx = {}) {
  if (!lineShape) return { items: [], error: null };
  const shape = LINE_SHAPES[lineShape];
  if (!shape?.normalize) {
    return { items: [], error: `หัวข้อนี้รับรายการรูปแบบ "${lineShape}" ไม่ได้` };
  }
  return shape.normalize(input, ctx);
}
