// ── กติกา "หุบชั้นเมนูตอนเลื่อนลง" ของแถบบน (แบบ D · มติผู้ใช้ 2026-08-02) ──
//
// แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะ **ทดสอบในเบราว์เซอร์ไม่ได้จริง**:
// requestAnimationFrame ไม่ยิงใน Browser pane ที่ไม่ได้แสดงผล และ `scrollTo` ก็เป็น
// no-op ที่นั่น → ตัวจัดการ scroll จะไม่ทำงานเลยตอนตรวจ · ยกกติกาออกมาแล้ว
// ทดสอบด้วย node ได้ครบทุกเงื่อนไข ส่วนฝั่ง CSS วัดแยกด้วยการสลับคลาสเอง
//
// ทำไมต้องมี deadzone: trackpad และมือถือส่งเหตุการณ์เลื่อนถี่มากและแกว่งทั้งสองทาง
// ถ้าตอบทุก 1px แถบจะสั่นหุบ-คลี่รัว ๆ · ระหว่างที่ยังไม่ถึง deadzone ต้อง **ไม่อัปเดต
// lastY** เพื่อให้ระยะสะสมต่อได้ ไม่งั้นการเลื่อนช้า ๆ ทีละ 1–3px จะไม่มีผลตลอดกาล

export const NAV_REVEAL_AT = 8;   // ใกล้บนสุด = เห็นเมนูเสมอ
export const NAV_TUCK_AFTER = 72; // ต้องเลื่อนพ้นความสูง header ก่อนจึงจะหุบได้
export const NAV_DEADZONE = 4;

/**
 * ตัดสินสถานะถัดไปของชั้นเมนู
 * @param {{y:number, lastY:number, tucked:boolean, settling?:boolean}} state
 *   ตำแหน่งเลื่อนปัจจุบัน · ค่าที่จำไว้รอบก่อน · สถานะปัจจุบัน · กำลังรอการชดเชยของเบราว์เซอร์
 * @returns {{tucked:boolean, lastY:number, settling:boolean}} สถานะใหม่ + ค่าที่ต้องจำไว้รอบถัดไป
 */
export function nextNavTuck({ y, lastY, tucked, settling = false }) {
  // 🔴 กันวงจรป้อนกลับ — อาการ "scroll น้อยแล้วกระพริบ" ที่ผู้ใช้เจอหลัง #922/#923:
  //
  // พอหุบ → header เตี้ยลง 44px → เอกสารเตี้ยลง → **เบราว์เซอร์ขยับ scrollTop ชดเชยเอง**
  // (scroll anchoring หรือการ clamp ท้ายเอกสาร) → เกิด scroll event ที่ dy ประมาณ −44
  // → ถ้าอ่านว่า "ผู้ใช้เลื่อนขึ้น" ก็จะคลี่ → เอกสารสูงขึ้น → ขยับกลับ → หุบ → วนไม่จบ
  //
  // settling = "เพิ่งสลับสถานะ กำลังรอดูการขยับที่ตัวเองทำให้เกิด" — เห็นการขยับครั้งแรก
  // แล้ว **ตั้งฐานใหม่โดยไม่ตัดสิน** จากนั้นกลับมาทำงานปกติ
  //
  // ⚠️ ต้องรอจนเห็นการขยับจริง (ถึง deadzone) ไม่ใช่ข้ามไปหนึ่งเฟรมเฉย ๆ — จังหวะที่
  // React commit เสร็จแล้วเบราว์เซอร์ชดเชย ไม่รับประกันว่าจะจบในเฟรมถัดไปเสมอ
  //
  // ต้นทุน: การเลื่อนของผู้ใช้ครั้งแรกหลังสลับสถานะจะถูกใช้เป็น "ตั้งฐานใหม่" แทนการ
  // ตัดสิน — มองไม่เห็นความต่าง เพราะตอนนั้นสถานะตรงกับทิศที่กำลังเลื่อนอยู่แล้ว
  if (settling) {
    if (Math.abs(y - lastY) < NAV_DEADZONE) return { tucked, lastY, settling: true };
    return { tucked, lastY: y, settling: false };
  }

  const decide = () => {
    // ใกล้บนสุดต้องคลี่เสมอ — สำคัญกว่าทิศทางการเลื่อน
    if (y <= NAV_REVEAL_AT) return { tucked: false, lastY: y };

    const dy = y - lastY;
    // ยังขยับไม่ถึง deadzone: คงสถานะ **และคง lastY** ไว้ให้สะสมต่อ
    if (Math.abs(dy) < NAV_DEADZONE) return { tucked, lastY };

    if (dy > 0) return { tucked: y > NAV_TUCK_AFTER ? true : tucked, lastY: y };
    return { tucked: false, lastY: y }; // เลื่อนขึ้น = คลี่คืนทันที
  };

  const next = decide();
  // สลับสถานะเมื่อไหร่ = เริ่มรอการชดเชยของเบราว์เซอร์
  return { ...next, settling: next.tucked !== tucked };
}
