// ── ผลของ write ต้องถูกอ่าน ไม่ว่าจะเขียนทีละคำสั่งหรือเป็นชุด ────────────────
//
// 🐞 supabase **ไม่ throw** — `await supabase.from(X).delete()…` ที่ไม่รับ `error`
// คือคำสั่งที่ "สั่งแล้วไม่ดูผล" · ในเส้นลบแบบ cascade อาการคือ **แม่หายไปแต่ลูก
// ยังอยู่** ชี้ไปยังแถวที่ไม่มีแล้ว โดยไม่มีอะไรฟ้อง (ระบบไม่มีถังขยะ กู้ไม่ได้)
//
// 🐞 แบบเป็นชุด: `await Promise.all(rows.map((r) => supabase…update(…)))` คืน
// อาร์เรย์ของ `{ data, error }` — ทิ้งทั้งก้อนแปลว่า "อัปเดตพลาดไปกี่แถวก็ไม่รู้"
// ผลที่เห็นคือลำดับ/สถานะเพี้ยนเป็นบางแถว ซึ่งอ่านเหมือนข้อมูลจริง

/** โยน error ตัวแรกที่เจอในชุดผลลัพธ์ของ Promise.all */
export function throwFirstError(results, context = '') {
  for (const res of results || []) {
    if (res?.error) {
      const err = res.error;
      if (context) err.message = `${context}: ${err.message}`;
      throw err;
    }
  }
  return results;
}

/** รันคำสั่งเขียนเรียงกันทีละขั้น หยุดทันทีที่ขั้นไหนพัง
 *  ใช้กับเส้น cascade ที่ลำดับสำคัญ — ขั้นหลังพึ่งว่าขั้นก่อนสำเร็จจริง */
export async function runSteps(steps) {
  for (const [label, run] of steps) {
    const { error } = (await run()) || {};
    if (error) {
      error.message = `${label}: ${error.message}`;
      throw error;
    }
  }
}
