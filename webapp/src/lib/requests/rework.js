// ── รอบแก้ของสายพัฒนากลิ่น: แถวที่ลูกค้าขอให้แก้ ต้องมีคนมาเติมของลงไป ────
//
// ⭐ **บริบท** — สายพัฒนากลิ่นสร้างแถวตอน *ส่งของ* ไม่ใช่ตอนเปิดใบ (ดู delivery.js)
// แต่พอลูกค้ากด "ขอให้แก้" `followUpRowFrom` จะสร้างแถวเปล่ารออยู่ที่ขั้น
// `awaiting_ack` ⇒ มีแถวที่ **ไม่ได้เกิดจากการส่งของ** อยู่ในใบเป็นครั้งแรก
//
// 🐞 ของจริงที่เดินวงแล้วเจอ (#1049 บันทึกไว้ว่ายังเป็นทางตัน):
//   · RD กด "ส่งของ" บนรางของแถวนั้นได้ → ประทับแค่วัน **ไม่สร้างกลิ่นเข้าทะเบียน**
//     ⇒ `producedScentId` ว่าง ⇒ ถึงขั้นใส่ราคา API ตีกลับ 400 ⇒ แถวค้างตลอดกาล
//   · ปุ่ม "ส่งกลิ่น" ของ RD สร้างแถว **ใหม่** เสมอ ไม่เคยไปแตะแถวที่ค้าง
//     ⇒ ได้สองแถวต่อหนึ่งรอบแก้ แถวหนึ่งใช้งานได้ อีกแถวค้างถาวร
//
// ⇒ ทางแก้: การส่งของ **เติมลงแถวที่รออยู่** แทนการสร้างใหม่ · ไฟล์นี้เป็นที่เดียว
// ที่ตอบว่า "แถวไหนรอเติมอยู่" และ "เติมแล้วต้องได้ค่าอะไรติดมาบ้าง"
import { rowStage } from '@/lib/requests/rowStage';

// ขั้นที่ยังเติมของลงไปได้ — ยังไม่มีใครส่งอะไรลงแถวนี้
// ⚠️ ไม่รวม `ready` ขึ้นไป: ส่งไปแล้วคือส่งไปแล้ว เติมทับ = ลบของที่ SA เห็นไปแล้ว
const FILLABLE = new Set(['awaiting_ack', 'developing']);

// แถวรอบแก้ที่ยังรอ RD ส่งของ — เรียงตาม sortOrder เหมือนที่แสดงบนจอ
export function pendingReworkRows(items = []) {
  return (items || [])
    .filter((row) => row?.lineKind === 'scent_dev'
      && row.derivedFromItemId
      && FILLABLE.has(rowStage(row)))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * ช่องเติมของแถวรอบแก้หนึ่งแถว — ค่าที่ **ระบบรู้อยู่แล้ว ไม่ต้องให้ RD กรอกซ้ำ**
 *
 * ⚠️ `briefId` กับ `derivedFromScentId` มาจากแถวต้นทาง **ไม่ใช่จากสิ่งที่ client ส่ง**
 * — สองค่านี้คือสายพันธุ์ของงาน ให้กรอกเองเมื่อไรก็ผูกข้ามบรีฟ/ข้ามลูกค้าได้
 * (บรีฟถูกยกตามมาให้แล้วตั้งแต่ #1049 · ตรงนี้ถอยไปหาแถวต้นทางเป็นตาข่ายชั้นสอง
 *  สำหรับแถวรอบแก้ที่เกิดก่อนใบนั้น ซึ่งยังมี briefId ว่างอยู่บน prod)
 */
export function reworkSlotFrom(row, items = []) {
  if (!row) return null;
  const source = (items || []).find((i) => i.id === row.derivedFromItemId) || null;
  return {
    targetItemId: row.id,
    briefId: row.briefId || source?.briefId || null,
    // กลิ่นตัวใหม่ต้องชี้กลับว่าแก้มาจากตัวไหน — เป็นค่าที่ระบบรู้ ไม่ใช่คำถาม
    derivedFromScentId: source?.producedScentId || null,
    // ป้ายบนจอ: แก้มาจากตัวไหน และลูกค้าว่าอย่างไร
    sourceLabel: source?.label || row.label || null,
    customerNote: source?.outcomeNote || null,
  };
}

// ทั้งชุด — หน้าจอใช้ตั้งค่าเริ่มต้นของฟอร์มส่งกลิ่น
export function reworkSlots(items = []) {
  return pendingReworkRows(items).map((row) => reworkSlotFrom(row, items));
}

/**
 * ด่านฝั่ง server: `targetItemId` ที่ client ส่งมาเติมได้จริงไหม
 *
 * ⚠️ **ห้ามเชื่อ client** — ยิงตรงด้วย id ของแถวที่ส่งไปแล้วคือการเขียนทับของที่
 * SA เห็นไปแล้ว และยิงด้วย id ข้ามใบคือการเขียนแถวของคำร้องคนอื่น
 * คืนข้อความไทย หรือ null ถ้าผ่าน
 */
/**
 * ก้าวที่สายพัฒนากลิ่น **ห้ามเดินบนราง** — คืนข้อความไทย หรือ null ถ้าเดินได้
 *
 * ⚠️ ปุ่ม "ส่งของ" บนรางประทับแค่ `readyAt` — **ไม่สร้างกลิ่นเข้าทะเบียน** ⇒ แถวจะ
 * ออกจากคิวรอเติมทั้งที่ `producedScentId` ยังว่าง ⇒ ถึงขั้นใส่ราคาโดนตีกลับ 400
 * ⇒ แถวค้างถาวรและไม่มีทางกลับมาเติมได้อีก · ทางเดียวของสายนี้คือโมดัล "ส่งกลิ่น"
 * ซึ่งสร้างกลิ่น + แถว ในจังหวะเดียว (ดู delivery.js)
 *
 * ⭐ แถวพัฒนากลิ่นรอบแรกเกิดที่ขั้น `ready` อยู่แล้ว ⇒ ก้าวนี้ไม่เคยถูกใช้โดยชอบเลย
 * สำหรับสายนี้ · กันทั้งสายจึงง่ายและปลอดภัยกว่ากันเฉพาะแถวรอบแก้
 */
export function reworkHopError(row, hop) {
  if (hop !== 'ready') return null;
  if (row?.lineKind !== 'scent_dev') return null;
  return 'รายการนี้ต้องส่งผ่านปุ่ม "ส่งกลิ่น" — กลิ่นต้องเข้าทะเบียนพร้อมกับการส่ง';
}

export function reworkTargetError(targetItemId, items = []) {
  const id = String(targetItemId ?? '').trim();
  if (!id) return null; // ไม่ระบุ = สร้างแถวใหม่ตามปกติ ไม่ใช่ข้อผิดพลาด
  const row = (items || []).find((i) => i.id === id);
  if (!row) return 'ไม่พบรายการรอบแก้ที่จะเติมของลงไป';
  if (!row.derivedFromItemId) return 'รายการนี้ไม่ใช่รอบแก้ — เติมของลงไปไม่ได้';
  if (!FILLABLE.has(rowStage(row))) return 'รายการรอบแก้นี้ส่งของไปแล้ว';
  return null;
}
