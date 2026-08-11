// ── ช่องข้อเท็จจริงบนหัวใบคำร้อง — ประกอบที่นี่ ไม่ใช่ใน JSX ────────────────
//
// ⭐ **แยกออกมาเพราะเดิมมันเทสต์ไม่ได้** — ของเดิมเป็นอาเรย์ที่ประกอบกลาง JSX ของ
// หน้ารายละเอียด (1,600 บรรทัด) ⇒ กติกา "ช่องไหนขึ้นเมื่อไร" ไม่มีอะไรตรึงไว้เลย
// และเป็นที่มาของบั๊กที่ผู้ใช้เจอเอง (ดูย่อหน้าถัดไป) · แพตเทิร์นเดียวกับ `requestRail.js`
//
// 🐞 **บั๊กที่ผู้ใช้แจ้ง (IS-26080003 · 2026-08-11)**: ของเดิมมีสี่ช่องตายตัว แล้วให้
// "ตอบแล้ว X/Y" กับ "ลูกค้า" **สลับกันใช้ช่องเดียวกัน** ⇒ ใบที่มีแถว (ขอราคา ·
// พัฒนากลิ่น · พัฒนาสูตร) ไม่เห็นชื่อลูกค้าบนหัวใบเลย · ที่เหลือให้ไปอ่านจาก
// `description` ซึ่งถูก `title` ของใบบังอีกชั้นถ้าใบนั้นมีหัวข้อ
//
// ⚠️ **ลูกค้าต้องมีทุกใบ** — คำร้องทุกใบเดินด้วยคำถามเดียวกันคือ "ของใคร" ·
// ช่องที่ขึ้น ๆ หาย ๆ ตามชนิดใบทำให้คนอ่านไม่รู้ว่าข้อมูลหายหรือใบนี้ไม่มี
import { fmtDate } from '@/lib/format';

/**
 * ช่องบนหัวใบ — คืนอาเรย์ `{ key, label, value, sub }` เรียงตามลำดับที่คนอ่านจริง
 *
 * `sub` = บรรทัดรองใต้ค่า (มติผู้ใช้ 2026-08-11: ชื่อเป็นตัวหลัก รหัสเป็นบรรทัดรอง)
 * ใช้กับของที่ "อ่านคู่กันเสมอ" เท่านั้น — ชื่อลูกค้า/รหัส AR · ผู้ขอ/ทีม ·
 * ผู้ติดต่อ/เบอร์ · วันที่รับปาก/วันที่ผู้ขอขอ · ด่วน/เหตุผล
 *
 * ⚠️ **ห้ามยัดของที่ไม่เกี่ยวกันลง `sub`** เพื่อประหยัดช่อง — กริดขึ้นแถวสองได้แล้ว
 * (`DetailOverview` ใช้ auto-fit) ช่องใหม่จึงไม่ต้องแย่งที่กับใคร
 *
 * @param request แถวคำร้องที่ผ่าน `findRequest` มาแล้ว (ต้องมี `refCustomer`)
 * @param hasItems ใบนี้มีบรรทัดข้างในไหม — ตัดสินว่าจะมีช่อง "ตอบแล้ว" หรือไม่
 * @param progress `{ done, total }` ของบรรทัด
 */
export function requestHeaderFacts(request, { hasItems = false, progress = null } = {}) {
  if (!request) return [];
  const customer = request.refCustomer || null;
  const contactName = customer?.contactPerson || null;
  const contactPhone = customer?.contactPhone || null;

  const facts = [
    { key: 'created', label: 'วันที่สร้าง', value: fmtDate(request.createdAt) },
    {
      key: 'requester',
      label: 'ผู้ขอ',
      value: request.requestedByName || '—',
      // ทีมเป็นของผู้ขอ ไม่ใช่ของใบ — อ่านติดกันจึงเป็นบรรทัดรอง ไม่ใช่ช่องแยก
      sub: request.team ? `ทีม ${request.team}` : null,
    },
    {
      key: 'customer',
      label: 'ลูกค้า',
      value: request.customerName || '—',
      // ⚠️ รหัส AR มาจาก **ทะเบียนลูกค้า** ไม่ใช่จากใบ — ใบเก็บแค่ชื่อ ณ ตอนเปิด
      // (`customerName`) ⇒ ใบที่ลูกค้าเปลี่ยนชื่อทีหลังจะโชว์ชื่อเก่าคู่รหัสที่ถูก
      // ซึ่งถูกต้องแล้ว: ชื่อคือหลักฐานตอนเปิดใบ รหัสคือตัวตามกลับไปทะเบียน
      sub: customer?.arCode || null,
    },
  ];

  // ผู้ติดต่อขึ้นเฉพาะใบที่ทะเบียนมีข้อมูล — ช่องว่างเปล่าบนหัวใบอ่านเหมือนข้อมูลหาย
  if (contactName || contactPhone) {
    facts.push({
      key: 'contact',
      label: 'ผู้ติดต่อลูกค้า',
      value: contactName || contactPhone,
      sub: contactName && contactPhone ? contactPhone : null,
    });
  }

  if (hasItems && progress) {
    facts.push({
      key: 'progress',
      label: 'ตอบแล้ว',
      value: `${progress.done}/${progress.total} รายการ`,
    });
  }

  // ⭐ **สองวันอยู่ช่องเดียวกัน** (มติผู้ใช้ 2026-08-11) — ของเดิมโชว์ทีละอัน พอฝ่าย
  // ปลายทางรับปากวันแล้ว "วันที่ผู้ขอต้องการ" หายไปทันที ⇒ เทียบไม่ได้ว่าวันที่รับปาก
  // ตรงกับที่ขอไหม ทั้งที่นั่นคือสิ่งเดียวที่ผู้ขอต้องดู
  // ⚠️ วันที่รับปากเป็น **ตัวหลัก** เพราะเป็นตัวที่คิวใช้นับว่าเลยกำหนดหรือยัง
  const committed = String(request.committedDueDate || '').trim();
  const wanted = String(request.requestedDueDate || '').trim();
  facts.push({
    key: 'due',
    label: committed ? 'รับปากส่ง' : 'ต้องการคำตอบ',
    value: committed ? fmtDate(committed) : (wanted ? fmtDate(wanted) : '—'),
    sub: committed
      ? (wanted ? `ผู้ขอขอ ${fmtDate(wanted)}` : 'ผู้ขอไม่ได้ระบุวัน')
      : (wanted ? 'ยังไม่มีใครรับปากวัน' : null),
  });

  // ⭐ ด่วนขึ้นเฉพาะใบที่ติ๊กด่วนจริง — เดิมป้ายนี้มีแต่ในคิว คนที่เปิดใบเข้าไป
  // ไม่มีทางรู้ว่าใบนี้ด่วน และ `urgentReason` ที่บังคับกรอกไม่เคยถูกอ่านที่ไหนเลย
  if (request.urgent) {
    facts.push({
      key: 'urgent',
      label: 'ความเร่งด่วน',
      value: 'งานด่วน',
      sub: request.urgentReason || null,
    });
  }

  return facts;
}
