// โทนความหมาย (tone) → สี CSS. ที่เดียวของทั้งระบบ
//
// ทำไมต้องมี: ชั้น UI สองแบบรับสีคนละท่า
//   StatusBadge / Tag / StatusNotice  รับ tone (data-tone → ตัวแปรใน Badge.module.css)
//   DocumentControlCard / จุดสถานะ     รับ statusColor เป็น "สตริงสี" ตรง ๆ
// ไม่มีตัวกลางแปลงให้ แต่ละหน้าจึงถือ map ของตัวเอง แล้วสีเพี้ยนกันเงียบ ๆ
// ของจริงที่เคยเกิด: หน้าใบยื่นภาษีกับทะเบียนภาษีเขียน TONE_COLOR ของตัวเองไฟล์ละชุด
// และให้ neutral = --text-3 ขณะที่ StatusBadge ให้ --text-2 → ป้าย "ร่าง" กับจุดสถานะ
// "ร่าง" บนหน้าเดียวกันคนละความสว่าง
//
// ⚠️ เพิ่ม/แก้ tone ใน Badge.module.css ต้องมาแก้ที่นี่ด้วย — เทสต์เทียบสองฝั่งไว้
//
// ⚠️ นี่คือ tone ของ "สถานะ" (StatusBadge / Tag / StatusNotice / จุดสถานะ) — **คนละชุด
// กับ tone ของ Button** ซึ่งเป็น neutral|primary|accent|danger|warning (ดู TONES ใน
// components/ui/Button.js) ทับกันแค่ 4 ตัว: ฝั่งปุ่มมี primary ที่ฝั่งสถานะไม่มี และฝั่ง
// สถานะมี info/success ที่ฝั่งปุ่มไม่มี จึงตั้งชื่อ STATUS_TONES ให้ยาวหน่อยแต่ไม่หยิบผิด

/* tone สถานะที่เลือกใช้ได้ — ตรงกับ selector [data-tone="..."] ใน Badge.module.css */
export const STATUS_TONES = ["neutral", "accent", "info", "success", "warning", "danger"];

/* ชื่อพ้อง: Badge.module.css จับ error ไว้กับ danger ใน selector เดียวกัน
   คงรับไว้เพราะโค้ดเดิมบางที่ส่ง tone="error" มา (StatusNotice ใช้คำนี้) */
export const TONE_ALIASES = { error: "danger" };

const TONE_COLORS = {
  neutral: "var(--text-2)",
  accent: "var(--accent)",
  info: "var(--blue)",
  success: "var(--green)",
  warning: "var(--amber)",
  danger: "var(--red)",
};

/** tone → สตริงสี CSS. tone ที่ไม่รู้จักตกกลับเป็นสีกลาง (ไม่พังหน้า) */
export function toneColor(tone) {
  const key = TONE_ALIASES[tone] || tone;
  return TONE_COLORS[key] || TONE_COLORS.neutral;
}
