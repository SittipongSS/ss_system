// ── รางของใบ — ประกอบขั้นตอนที่คนดูเห็นบนหน้ารายละเอียด ─────────────────
//
// ⭐ **แยกออกมาจากหน้าเพราะมันเทสต์ไม่ได้ตอนอยู่ในนั้น** — บั๊กสองตัวที่ผู้ใช้เจอเอง
// (ป้ายซ้ำสองบรรทัด · จุดไฮไลต์ชี้ผิดขั้น) เป็นตรรกะการประกอบรางล้วน ๆ ที่ CI มองไม่เห็น
// เพราะมันฝังอยู่ใน JSX · ย้ายมาเป็นฟังก์ชันบริสุทธิ์แล้วเทสต์ครอบได้ทั้งตระกูล
//
// ⚠️ **ใบบอกว่า "รอใคร" · แถวบอกว่า "แต่ละ direction ไปถึงไหน"** — ขั้น แก้ไข/คอนเฟิร์ม/
// ราคา อยู่ที่ก้าวถัดไปท้ายเธรด (NextStepBar) เพราะ direction A คอนเฟิร์ม B ขอแก้ C ไม่เอา
// ได้พร้อมกัน ⇒ ใบทั้งใบบอกไม่ได้ (กติกา "สถานะอยู่ที่แถว ไม่ใช่ที่ใบ")
import { requestNeedsApproval } from '@/lib/requests/approval';
import { requestRowSummary, rowStage } from '@/lib/requests/rowStage';

// ขั้นกลาง — สรุปจากแถวข้างใน ไม่ใช่คำตายตัว
//
// ⚠️ **ไม่พูดเรื่องยืนยันที่นี่** — ขั้น "รอหัวหน้ายืนยัน" เป็นขั้นแยกของตัวเอง ·
// พูดทั้งสองที่ = ข้อความเดียวกันขึ้นสองบรรทัดติดกัน (บั๊กที่ผู้ใช้เห็นจริง)
function middleStep(request, hasItems) {
  const items = request.items || [];
  const summary = requestRowSummary(items);
  const awaitingPrice = items.filter((i) => rowStage(i) === 'awaiting_price').length;

  if (!summary.total) {
    return { label: `รอฝ่าย ${request.dept} ส่งของ`, hint: 'รับเรื่องแล้ว ยังไม่มีของส่งมา' };
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
 * ⚠️ `index` นับตาม **รางที่เรนเดอร์จริง** ไม่ใช่ตามสถานะดิบ — ขั้นที่แทรก
 * (ประตูหัวหน้า) ดันทุกอย่างหลังจากนั้นเลื่อนไปหนึ่งช่อง
 */
export function requestRailSteps(request, { hasItems = false } = {}) {
  const needsApproval = requestNeedsApproval(request);
  const steps = [
    { id: 'draft', label: 'จัดทำคำร้อง', hint: hasItems ? 'ระบุวัสดุและชั้นจำนวน' : 'ระบุเรื่องที่ต้องการ' },
    { id: 'pending', label: 'รอรับเรื่อง', hint: `ส่งถึงฝ่าย ${request.dept}` },
    // ⚠️ แทรก **เฉพาะหัวข้อที่ประกาศธง** — ใส่ให้ทุกหัวข้อไม่ได้ คนที่เปิด
    // "สอบถามข้อมูล" จะเห็นขั้นที่ไม่มีวันเกิดขึ้น
    ...(needsApproval ? [{
      id: 'approval',
      label: request.approvedAt ? 'หัวหน้ายืนยันแล้ว' : 'รอหัวหน้ายืนยัน',
      hint: request.approvedByName || 'ก่อนฝ่ายปลายทางลงมือ',
    }] : []),
    { id: 'acknowledged', ...middleStep(request, hasItems) },
    { id: 'answered', label: 'ตอบแล้ว', hint: 'ผู้ตอบยืนยันว่าตอบครบ' },
    { id: 'closed', label: 'ปิดเรื่อง', hint: 'งานนี้สิ้นสุด' },
  ];

  const offset = needsApproval ? 1 : 0;
  const index = request.status === 'draft'
    ? 0
    : request.status === 'pending'
      ? 1
      // รับเรื่องแล้วแต่ยังไม่ยืนยัน = ยังอยู่ที่ขั้นประตู
      : request.status === 'acknowledged'
        ? (needsApproval && !request.approvedAt ? 2 : 2 + offset)
        : request.status === 'answered'
          ? 3 + offset
          : 4 + offset;

  return { steps, index };
}
