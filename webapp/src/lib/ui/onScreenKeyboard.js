// ── แป้นพิมพ์บนจอขึ้นอยู่ไหม — ตัวตัดสินล้วน (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.5) ─────
//
// ⭐ **ทำไมต้องรู้** — จอหน้างานมีแถบติดขอบล่างสองชั้น (ท้ายหน้าพื้นที่ + แถบงานของช่าง) บวกเมนูมือถือ
//   ตอนแป้นตัวเลขขึ้น (~260px บนจอ 640) สามแถบนั้นกินที่จนช่องที่กำลังพิมพ์จมอยู่ใต้แป้น
//   ⇒ มติเจ้าของ: แป้นบนจอขึ้น = แถบหลบ · **ต่อแป้นพิมพ์จริง (iPad) แถบอยู่** — แป้นจริงไม่บังจอ
//   🐞 แบบที่ถูกตีกลับ 16/09 คือแถบ 140px ที่บีบช่องกรอกตอนแป้นขึ้น — ข้อนี้คือตัวกันไม่ให้ซ้ำ
//
// 🔑 **เบราว์เซอร์ไม่มีเหตุการณ์ "แป้นขึ้น"** — เดาจากสองอย่างพร้อมกัน:
//   ① โฟกัสอยู่ในช่องที่พิมพ์ได้ (ไม่ใช่ช่องติ๊ก/ปุ่ม/ช่องไฟล์ — พวกนั้นไม่เรียกแป้น)
//   ② ส่วนที่มองเห็นจริง (`visualViewport`) เตี้ยกว่าหน้าเกิน 120px
//   ⚠️ ข้อ ② ต้องเทียบกับ **ความสูงก่อนแป้นขึ้น** (`baselineHeight`) ด้วย — Android บางรุ่นหด
//      ทั้งหน้าไปพร้อมแป้น (resizes-content) ⇒ ความสูงหน้ากับส่วนที่เห็นเท่ากันพอดีทั้งที่แป้นบังอยู่
//   ⚠️ **ซูมด้วยสองนิ้ว** ทำให้ส่วนที่เห็นเตี้ยลงได้เหมือนกัน ⇒ คูณสเกลกลับก่อนเทียบ ไม่งั้นซูมแล้วแถบหาย
//   ⚠️ เบราว์เซอร์ที่ไม่มี `visualViewport` = **ไม่รู้ ⇒ แถบอยู่** (แถบที่หายโดยไม่มีเหตุคือปุ่มที่หา
//      ไม่เจอ แย่กว่าแถบที่บังนิดหน่อย)
// ⚠️ ไฟล์นี้ไม่แตะ DOM เอง — ตัวต่อสาย (`useOnScreenKeyboard`) ส่งค่ามาให้ ⇒ เทสต์ได้ด้วยตัวเลขล้วน

/** ส่วนที่มองเห็นเตี้ยกว่านี้ถึงจะนับว่าแป้นขึ้น — แถบเครื่องมือของ Safari ยุบ/กาง (~60–90px)
 *  ต้องไม่ถูกนับเป็นแป้น · แป้นตัวเลขที่เตี้ยที่สุด (~216px) ยังเกินเส้นนี้สบาย ๆ */
export const OSK_MIN_PX = 120;

/* ชนิดช่อง input ที่ **ไม่** เรียกแป้นพิมพ์ — กดแล้วเป็นติ๊ก/ปุ่ม/ตัวเลือกไฟล์/แถบเลื่อน */
const NON_TEXT_INPUTS = new Set([
  'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color', 'hidden',
]);

/**
 * ช่องนี้เรียกแป้นพิมพ์บนจอไหม — `input` ที่พิมพ์ได้ · `textarea` · `[contenteditable]`
 * ⚠️ ช่องที่อ่านอย่างเดียว/ปิดอยู่ไม่เรียกแป้น (iOS ไม่เปิดแป้นให้ช่อง readonly) ⇒ ไม่นับ
 * ⚠️ `select` ไม่นับ — มือถือเปิดตัวเลือกของมันเอง ไม่ใช่แป้นพิมพ์ และปิดเองเมื่อเลือกเสร็จ
 * @param el element ที่โฟกัสอยู่ (`document.activeElement`) หรืออะไรก็ได้ — ไม่ใช่ element = `false`
 */
export function isTextEntry(el) {
  if (!el || typeof el !== 'object') return false;
  if (el.disabled === true || el.readOnly === true) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = String(el.type || el.getAttribute?.('type') || 'text').toLowerCase();
    return !NON_TEXT_INPUTS.has(type);
  }
  if (el.isContentEditable === true) return true;
  const editable = el.getAttribute?.('contenteditable');
  return editable === '' || editable === 'true' || editable === 'plaintext-only';
}

/**
 * 🔑 แป้นพิมพ์บนจอน่าจะขึ้นอยู่ไหม
 *
 * `max(layoutHeight, baselineHeight) − visualHeight × visualScale > OSK_MIN_PX` ขณะโฟกัสอยู่ในช่องพิมพ์
 *
 * @param editableFocused โฟกัสอยู่ในช่องที่พิมพ์ได้ไหม (`isTextEntry(document.activeElement)`)
 * @param layoutHeight    ความสูงของหน้า (`window.innerHeight`)
 * @param visualHeight    ความสูงส่วนที่เห็น (`visualViewport.height`) — `null` = เบราว์เซอร์ไม่มี = ไม่รู้
 * @param visualScale     สเกลซูม (`visualViewport.scale`) — ซูมสองเท่าแล้วส่วนที่เห็นเตี้ยลงครึ่งหนึ่งโดยไม่มีแป้น
 * @param baselineHeight  ความสูงที่จำไว้ตอนไม่มีอะไรโฟกัส (ต่อแนวจอ) — จับเคส Android ที่หดทั้งหน้า
 */
export function keyboardLikelyUp({
  editableFocused = false, layoutHeight = 0, visualHeight = null, visualScale = 1, baselineHeight = 0,
} = {}) {
  if (!editableFocused) return false;
  if (visualHeight === null || visualHeight === undefined) return false;
  const visual = Number(visualHeight);
  if (!Number.isFinite(visual)) return false;
  const scale = Number(visualScale) > 0 ? Number(visualScale) : 1;
  const tallest = Math.max(Number(layoutHeight) || 0, Number(baselineHeight) || 0);
  return tallest - visual * scale > OSK_MIN_PX;
}

/* ── ตัวต่อสาย `useOnScreenKeyboard` เรียกสองตัวนี้ทุกครั้งที่วัด (ชุด S6) ─────────────────────── */

/**
 * แนวจอสำหรับแยก "ความสูงก่อนแป้นขึ้น" — ความสูงแนวตั้งเอาไปเทียบแนวนอนไม่ได้
 * ⚠️ **เชื่อเครื่องก่อน** (`screen.orientation.type`) — แนวที่เดาจากกว้าง/สูงของหน้าเปลี่ยนตามแป้นได้:
 *    แท็บเล็ต Android แนวตั้ง 768×1024 ที่หดทั้งหน้าไปพร้อมแป้น เหลือ 768×624 = ดูเหมือนแนวนอน
 *    ⇒ ไปหยิบฐานของแนวนอนมาเทียบ แล้วเดาผิด · ไม่มีค่าจากเครื่อง (Safari ก่อน 16.4) ค่อยเทียบกว้าง/สูง
 */
export function oskOrientationKey({ orientationType = null, width = 0, height = 0 } = {}) {
  const type = String(orientationType || '');
  if (type.startsWith('portrait')) return 'portrait';
  if (type.startsWith('landscape')) return 'landscape';
  return Number(width) > Number(height) ? 'landscape' : 'portrait';
}

/** สถานะตั้งต้นของตัวต่อสาย — ยังไม่มีฐานของแนวไหน · แป้นไม่ขึ้น */
export const OSK_START = Object.freeze({ baselines: Object.freeze({}), up: false });

/**
 * หนึ่งจังหวะของการวัด → สถานะใหม่ + "แป้นเพิ่งขึ้นหรือเปล่า"
 * - ไม่ได้โฟกัสช่องพิมพ์ = **จำความสูงหน้าไว้เป็นฐานของแนวนี้** (ค่าล่าสุด ไม่ใช่ค่าสูงสุด — แถบเครื่องมือ
 *   Safari ยุบ/กางเปลี่ยนความสูงจริง ฐานที่ค้างจากตอนยุบจะสูงเกินจริงไปตลอด)
 * - ระหว่างพิมพ์ **ห้ามจำ** — หน้าที่หดไปพร้อมแป้นแล้ว (Android) จะกลายเป็นฐาน แล้วแป้นหายจากสายตาตัวตัดสิน
 * - `rose` = จังหวะที่เปลี่ยนจากไม่ขึ้นเป็นขึ้น ⇒ ตัวต่อสายเลื่อนช่องที่พิมพ์ให้พ้นขอบ **ครั้งเดียว**
 *   (วัดซ้ำทุก scroll ของ visualViewport — เลื่อนทุกครั้งคือหน้ากระตุกใต้นิ้ว)
 * @param state   สถานะเดิม (`OSK_START` ตอนเริ่ม)
 * @param reading `{ editableFocused, orientation, layoutHeight, visualHeight, visualScale }`
 */
export function oskStep(state = OSK_START, reading = {}) {
  const {
    editableFocused = false, orientation = 'portrait', layoutHeight = 0, visualHeight = null, visualScale = 1,
  } = reading;
  const before = state?.baselines || {};
  const baselines = editableFocused ? before : { ...before, [orientation]: Number(layoutHeight) || 0 };
  const up = keyboardLikelyUp({
    editableFocused, layoutHeight, visualHeight, visualScale, baselineHeight: baselines[orientation] || 0,
  });
  return { state: { baselines, up }, rose: up && !state?.up };
}
