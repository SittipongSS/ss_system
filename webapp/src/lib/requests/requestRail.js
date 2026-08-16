// ── รางของใบ — ประกอบขั้นตอนที่คนดูเห็นบนหน้ารายละเอียด ─────────────────
//
// ⭐ **แยกออกมาจากหน้าเพราะมันเทสต์ไม่ได้ตอนอยู่ในนั้น** — บั๊กสองตัวที่ผู้ใช้เจอเอง
// (ป้ายซ้ำสองบรรทัด · จุดไฮไลต์ชี้ผิดขั้น) เป็นตรรกะการประกอบรางล้วน ๆ ที่ CI มองไม่เห็น
// เพราะมันฝังอยู่ใน JSX · ย้ายมาเป็นฟังก์ชันบริสุทธิ์แล้วเทสต์ครอบได้ทั้งตระกูล
//
// ⚠️ **ใบบอกว่า "รอใคร" · แถวบอกว่า "แต่ละ direction ไปถึงไหน"** — ขั้น แก้ไข/คอนเฟิร์ม/
// ราคา อยู่ที่ก้าวถัดไปท้ายเธรด (NextStepBar) เพราะ direction A คอนเฟิร์ม B ขอแก้ C ไม่เอา
// ได้พร้อมกัน ⇒ ใบทั้งใบบอกไม่ได้ (กติกา "สถานะอยู่ที่แถว ไม่ใช่ที่ใบ")
import { requestDeliversRows } from '@/lib/master/requestTypes';
import { requestRowSummary, rowStage } from '@/lib/requests/rowStage';

// ขั้นกลาง — สรุปจากแถวข้างใน ไม่ใช่คำตายตัว
function middleStep(request, hasItems) {
  const items = request.items || [];
  const summary = requestRowSummary(items);
  const awaitingPrice = items.filter((i) => rowStage(i) === 'awaiting_price').length;

  if (!summary.total) {
    // ⭐ ไม่มีแถวแปลว่าอะไร ขึ้นกับหัวข้อ (มติผู้ใช้ 2026-08-09): หัวข้อที่ฝ่ายสร้าง
    // แถวเองตอนส่ง (พัฒนากลิ่น) คือรอ **ของ** จริง ๆ · หัวข้อไม่มีแถวเลย
    // (สอบถามข้อมูล) ของไม่มีอยู่ในสาย — คำที่ถูกคือรอ **คำตอบ**
    return requestDeliversRows(request.kind)
      // "ส่งงาน" คำเดียวกับปุ่ม (ม-120) — รางเล่าก้าวเดียวกับที่ปุ่มกด
      ? { label: `รอฝ่าย ${request.dept} ส่งงาน`, hint: 'รับเรื่องแล้ว ยังไม่มีของส่งมา' }
      : { label: `รอฝ่าย ${request.dept} ตอบ`, hint: 'รับเรื่องแล้ว — ตอบกันในเธรด' };
  }
  // ⭐ **"รอใส่ราคา" ต้องเห็นเป็นพิเศษ** — แถวที่คอนเฟิร์มแล้วแต่ยังไม่มีราคาคือใบค้าง
  // ถาวรถ้าไม่มีใครเห็น (กับดักข้อ 11 ของแผน)
  if (awaitingPrice) {
    return { label: 'รอใส่ราคา', hint: `${awaitingPrice} รายการที่คอนเฟิร์มแล้ว` };
  }
  if (summary.waitingDept) {
    return {
      label: `ฝ่าย ${request.dept} กำลังทำ`,
      hint: `เสร็จแล้ว ${summary.settled}/${summary.total}`,
    };
  }
  if (summary.waitingRequester) {
    return { label: 'รอฝ่ายขายทำต่อ', hint: `${summary.waitingRequester} รายการ` };
  }
  return { label: hasItems ? 'กำลังหาราคา' : 'กำลังดำเนินการ', hint: 'ฝ่ายเจ้าของรับเรื่องแล้ว' };
}

/**
 * ขั้นตอนบนรางของใบ + ขั้นที่กำลังอยู่ — คืน { steps, index }
 *
 * ⚠️ **รางเป็นชุดเดียวทุกหัวข้อแล้ว** — ขั้น "รอหัวหน้ายืนยัน" ที่เคยแทรกเฉพาะ
 * พัฒนากลิ่นถูกถอดออกทั้งขั้น (มติผู้ใช้ 2026-08-16) ⇒ `index` เท่ากับลำดับของ
 * สถานะตรง ๆ ไม่มี offset ให้พลาดอีก (บั๊ก "จุดไฮไลต์ชี้ผิดขั้น" เกิดจากตรงนั้น)
 */
export function requestRailSteps(request, { hasItems = false } = {}) {
  const steps = [
    { id: 'draft', label: 'จัดทำคำร้อง', hint: hasItems ? 'ระบุวัสดุและชั้นจำนวน' : 'ระบุเรื่องที่ต้องการ' },
    { id: 'pending', label: 'รอรับเรื่อง', hint: `ส่งถึงฝ่าย ${request.dept}` },
    { id: 'acknowledged', ...middleStep(request, hasItems) },
    { id: 'answered', label: 'ตอบแล้ว', hint: 'ผู้ตอบยืนยันว่าตอบครบ' },
    { id: 'closed', label: 'ปิดเรื่อง', hint: 'งานนี้สิ้นสุด' },
  ];

  const index = request.status === 'draft'
    ? 0
    : request.status === 'pending'
      ? 1
      : request.status === 'acknowledged'
        ? 2
        : request.status === 'answered'
          ? 3
          : 4;

  return { steps, index };
}
