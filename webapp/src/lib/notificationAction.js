// ── ปุ่มลงมือในแถวแจ้งเตือน — ฝังลิงก์ของปุ่มไว้ใน `href` ของแถว (กำหนดวางบิล รอบสอง · 26/09) ─────────
//
// ⭐ ทำไมต้องฝัง: ตาราง `notifications` (mig 0185) มีลิงก์ช่องเดียวคือ `href` = ที่ที่แถวพาไป ไม่มีช่อง metadata
//   และงานนี้ห้ามออก migration ⇒ ลิงก์ของปุ่ม (เช่น "ขอใบวางบิลงวดนี้") ต่อท้าย `href` เป็นพารามิเตอร์ชื่อ
//   `NOTIFICATION_ACTION_PARAM` แล้ว **แกะออกฝั่ง server ก่อนถึงจอ** (`attachNotificationActions` ใน lib/notifications.js)
//   ⇒ จอได้ `href` สะอาด (แถวพาไปที่เดิม) + `action: { href, label }` แยกช่อง
// ⭐ ทำไมเป็นพารามิเตอร์ ไม่ใช่ตัวคั่นแปลก ๆ: ถ้าวันหนึ่งมีตัวอ่านที่ไม่ผ่านตัวแกะ (อ่านตารางตรง) ลิงก์แถวยังพาไปถูกหน้า
//   — หน้าปลายทางเมินพารามิเตอร์ที่ไม่รู้จัก · ตัวคั่นอื่น (ช่องว่าง/ขึ้นบรรทัด) = ลิงก์พังทั้งแถว
// ⚠️ ลิงก์ของปุ่มต้องเป็นเส้นทางภายในแอปเท่านั้น (`/…` ไม่ใช่ `//…` หรือ `/\…`) — ไม่งั้นทิ้ง
//    (รูปเดียวกับ `returnTo` ของ /requests/new + เข้มกว่าหนึ่งข้อ: `/\…`)
// ⚠️ ไฟล์บริสุทธิ์ ไม่ import ของฝั่ง server — ตัวสร้าง (cron) กับตัวแกะ (API) ใช้คู่เดียวกัน

export const NOTIFICATION_ACTION_PARAM = 'notifyAction';

/* ⚠️ ตัวที่สองห้ามเป็น `/` **หรือ `\`** — เบราว์เซอร์อ่าน `/\evil.com` เป็น `//evil.com` (protocol-relative)
   = ลิงก์ออกนอกแอป · วันนี้มีแต่โค้ดฝั่ง server ที่เขียนค่านี้ ⇒ เป็นเข็มขัดกันไว้ ไม่ใช่รูที่เปิดอยู่ */
const internalPath = (value) => {
  const text = String(value ?? '').trim();
  return text.startsWith('/') && text[1] !== '/' && text[1] !== '\\' ? text : '';
};

/**
 * ต่อลิงก์ของปุ่มท้าย `href` ของแถว — ลิงก์ปุ่มไม่ใช่เส้นทางภายใน = คืน `href` เดิม (ไม่มีปุ่ม)
 * ⚠️ `#hash` ของแถวคงไว้ท้ายสุด (พารามิเตอร์ต้องอยู่ก่อน `#` ไม่งั้นกลายเป็นส่วนหนึ่งของ hash)
 */
export function hrefWithAction(href, actionHref) {
  const base = String(href ?? '');
  const action = internalPath(actionHref);
  if (!base || !action) return base;
  const hashAt = base.indexOf('#');
  const path = hashAt >= 0 ? base.slice(0, hashAt) : base;
  const hash = hashAt >= 0 ? base.slice(hashAt) : '';
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${NOTIFICATION_ACTION_PARAM}=${encodeURIComponent(action)}${hash}`;
}

/**
 * แยกลิงก์ของปุ่มออกจาก `href` ของแถว
 * @returns `{ href, actionHref }` — ไม่มีพารามิเตอร์ = `href` เดิมทุกตัวอักษร + `actionHref: null`
 *   ⚠️ มีพารามิเตอร์แต่ค่าไม่ใช่เส้นทางภายใน = ถอดออกจากแถวเหมือนกัน แต่ไม่มีปุ่ม
 */
export function splitNotificationAction(href) {
  const text = typeof href === 'string' ? href : '';
  if (!text.includes(`${NOTIFICATION_ACTION_PARAM}=`)) return { href: href ?? null, actionHref: null };
  const hashAt = text.indexOf('#');
  const path = hashAt >= 0 ? text.slice(0, hashAt) : text;
  const hash = hashAt >= 0 ? text.slice(hashAt) : '';
  const queryAt = path.indexOf('?');
  if (queryAt < 0) return { href: text, actionHref: null };
  const params = new URLSearchParams(path.slice(queryAt + 1));
  const actionHref = internalPath(params.get(NOTIFICATION_ACTION_PARAM)) || null;
  params.delete(NOTIFICATION_ACTION_PARAM);
  const rest = params.toString();
  return { href: `${path.slice(0, queryAt)}${rest ? `?${rest}` : ''}${hash}`, actionHref };
}
