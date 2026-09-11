/* ── คำเตือนที่มากับคำตอบ "สำเร็จ" (2026-09-11) ─────────────────────────────
   แถวหลักบันทึกไปแล้ว แต่ของประกอบเขียนไม่ลง (ประวัติสถานะดีล · ไทม์ไลน์ · ย้ายของที่ผูก
   ดีล · สถานะลีดต้นทาง …) — API ตอบ 500 ไม่ได้ เพราะคนจะกดซ้ำแล้วได้ของซ้ำ จึงส่งข้อความ
   กลับมาในคีย์ข้างล่างพร้อม 2xx

   🐞 ไล่ทั้งระบบแล้วพบว่าคีย์พวกนี้ส่วนใหญ่ **ไม่มีจอไหนอ่าน** (จออ่าน body แค่ตอน !res.ok)
      ⇒ เตือนเท่ากับไม่เตือน · ร่องรอยเดียวคือ console.error ฝั่ง server ที่ไม่มีใครเปิดดู
   ⇒ จอที่เรียก API พวกนี้ส่ง body เข้า `responseWarningText` แล้วทักโทนเตือนทุกครั้ง
   ⚠️ API ใหม่ที่ต้องเตือนแบบนี้ ใช้คีย์ในลิสต์นี้ (หรือเพิ่มลงลิสต์) — ตั้งชื่อเองใหม่ = จอไม่เห็น */
export const RESPONSE_WARNING_KEYS = Object.freeze([
  'warning',
  'productWarning',
  'timelineWarning',
  'valueItemsWarning',
  'stageHistoryWarning',
  'historyWarning',
  'leadWarning',
  '_warning',
]);

/** รวมคำเตือนทุกคีย์ใน body เป็นข้อความเดียว ('' = ไม่มีอะไรต้องเตือน) */
export function responseWarningText(body) {
  if (!body || typeof body !== 'object') return '';
  const messages = [];
  for (const key of RESPONSE_WARNING_KEYS) {
    const value = body[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text && !messages.includes(text)) messages.push(text);
  }
  return messages.join(' · ');
}

// ค้างนานกว่าทักทั่วไป — ข้อความพวกนี้บอกทางแก้ที่คนต้องอ่านให้จบ
export const RESPONSE_WARNING_TOAST = Object.freeze({ duration: 12000 });
