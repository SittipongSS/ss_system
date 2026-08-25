// ── โหลดแถวที่ "วันส่งเป็นของรอบไหน" ต้องใช้ (ตรวจย้อนหลัง 2026-08-26) ────
//
// 🐞 **สองจอของฝ่ายขายยังโชว์วันของรอบก่อนเป็นเดดไลน์** — `liveDueDate` ตอบถูกได้
// ก็ต่อเมื่อมีแถวอยู่ในมือ · คิวคำร้องกับหน้ารายละเอียดโหลดแถวมาด้วยอยู่แล้ว แต่
// `/api/sales-planning/my-schedule` และ `/api/pm/my-work` ดึงแต่หัวใบ ⇒ ทั้งสองจอ
// ตกกลับไปพฤติกรรมเดิมเงียบ ๆ (ไม่มี items = ไม่รู้ว่ามีรอบแก้ = ถือว่าวันยังใช้ได้)
//
// ⚠️ **ดึงเฉพาะคอลัมน์ที่ `rowStage` + `dueIsStale` ใช้** ไม่ใช่ `select('*')` — สองจอนี้
// ไม่มีใครอ่านเนื้อของแถวเลย · ลากทั้งแถวมาแปลว่าขน spec/label/ราคาข้ามเน็ตทุกครั้ง
// ที่ใครเปิดหน้าแรก
//
// ⚠️ **หนึ่งคำสั่งรวม ไม่ใช่รายใบ** — หน้าเหล่านี้มีได้หลายสิบใบต่อคน · ดึงรายใบคือ
// N+1 (โรคที่หน้าคำร้องเพิ่งถอด 8 endpoint ทิ้งไป)
const NEEDED = 'id,requestId,derivedFromItemId,createdAt,ackAt,readyAt,pickedUpAt,sentAt,outcome,answerStatus';

/**
 * เติม `items` ให้ใบที่โหลดมาแบบหัวใบล้วน — คืน array ชุดใหม่ ไม่แก้ของเดิม
 *
 * ⚠️ ล้มแล้ว **ไม่ throw** — สองจอนี้ยังใช้งานได้โดยไม่มีข้อมูลรอบแก้ (ถอยไป
 * พฤติกรรมเดิม) · ทำให้ทั้งหน้าพังเพราะป้ายวันหนึ่งป้ายคือการแลกที่ผิด
 */
export async function attachReworkRows(supabase, requests = []) {
  const list = requests || [];
  if (!list.length) return list;
  const { data, error } = await supabase
    .from('dept_request_items').select(NEEDED)
    .in('requestId', list.map((r) => r.id));
  if (error) {
    console.error('[requests] โหลดแถวสำหรับตรวจรอบแก้ไม่สำเร็จ:', error.message);
    return list;
  }
  const byRequest = new Map();
  for (const row of data || []) {
    if (!byRequest.has(row.requestId)) byRequest.set(row.requestId, []);
    byRequest.get(row.requestId).push(row);
  }
  return list.map((r) => ({ ...r, items: byRequest.get(r.id) || [] }));
}
