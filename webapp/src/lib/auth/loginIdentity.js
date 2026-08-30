// ── เข้าระบบด้วยเบอร์โทร (มติผู้ใช้ 2026-08-30) — ตรรกะล้วน ไม่แตะ DB/HTTP ──
//
// ⭐ **ที่มา**: เจ้าหน้าที่บริการหน้างานไม่มีอีเมลบริษัท แต่ระบบนี้ล็อกอินด้วย
//    "อีเมล + รหัสผ่าน" ทางเดียว (บัญชีคือผู้ใช้ของ Supabase Auth ล้วน ไม่มีตาราง users)
//    ⇒ ไม่มีอีเมล = ไม่มีบัญชี = ถูกมอบหมายงานไม่ได้
//
// 🔴 **ทำไมไม่ใช้ phone auth ของ Supabase ตรง ๆ** — โปรเจกต์นี้ปิดไว้ (`/auth/v1/settings`
//    ตอบ `phone: false`) และการเปิดต้องผูก SMS provider (Twilio ฯลฯ) ซึ่งมีค่าใช้จ่าย
//    รายเดือนทั้งที่ระบบ **ไม่เคยต้องส่ง SMS เลย** (ล็อกอินด้วยรหัสผ่าน ไม่ใช่ OTP)
//    ⇒ มติผู้ใช้: **มัดเบอร์เป็นที่อยู่ล็อกอินภายใน** — คนกรอกเบอร์ ระบบแปลงให้เอง
//
// ⚠️ **ที่อยู่นี้ไม่ใช่อีเมลจริง** — โดเมน `phone.scentandsense.co.th` ไม่มีกล่องจดหมาย
//    และไม่ควรโผล่บนจอที่ไหนเลย (จอต้องโชว์ "เบอร์ 081-234-5678") · ที่สำคัญกว่านั้น
//    **ห้ามเอาไปแชร์ Google Doc** — สาย Drive ให้สิทธิ์ตามที่อยู่จริง ⇒ แชร์ไปที่อยู่นี้
//    คือแชร์ทิ้ง (ดู `workspaceEmail` ที่กันไว้แล้ว)

export const LOGIN_PHONE_DOMAIN = 'phone.scentandsense.co.th';

/* เบอร์ไทยรูปมาตรฐานของระบบนี้ = **66XXXXXXXXX** (E.164 ไม่มีเครื่องหมายบวก)
   ⭐ เก็บรูปเดียวเพื่อให้ `081-234-5678` · `0812345678` · `+66812345678` · `66812345678`
      ทั้งสี่แบบชี้บัญชีเดียวกัน — ไม่งั้นคนกรอกคนละแบบแล้วเจอ "รหัสผ่านไม่ถูกต้อง"
      ทั้งที่พิมพ์ถูกทุกตัว
   ⚠️ ไม่ใช้ `formatPhoneInput`/`formatProfilePhone` ที่มีอยู่ — สองตัวนั้นทำ *รูปแสดงผล*
      (มีขีด สูงสุด 10 หลัก) ซึ่งตรงข้ามกับที่ต้องใช้ตรงนี้ */
export function normalizeLoginPhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.includes('@')) return null;
  const digits = raw.replace(/\D/g, '');
  if (/^0\d{8,9}$/.test(digits)) return `66${digits.slice(1)}`;   // 0812345678 · 021234567
  if (/^66\d{8,9}$/.test(digits)) return digits;                   // 66812345678
  return null;
}

/** เบอร์ที่ normalize แล้ว → ที่อยู่ล็อกอินภายใน */
export function phoneLoginEmail(phone) {
  const normalized = normalizeLoginPhone(phone);
  return normalized ? `${normalized}@${LOGIN_PHONE_DOMAIN}` : null;
}

/** ที่อยู่นี้เป็นที่อยู่ล็อกอินภายในไหม (ไม่ใช่อีเมลของคนจริง) */
export function isPhoneLogin(email) {
  return String(email ?? '').toLowerCase().endsWith(`@${LOGIN_PHONE_DOMAIN}`);
}

/** ที่อยู่ล็อกอินภายใน → เบอร์รูปที่คนอ่านออก (`081-234-5678`) หรือ null */
export function loginPhoneOf(email) {
  if (!isPhoneLogin(email)) return null;
  const digits = String(email).split('@')[0].replace(/\D/g, '');
  if (!/^66\d{8,9}$/.test(digits)) return null;
  const local = `0${digits.slice(2)}`;
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
}

/**
 * สิ่งที่คนกรอกในช่องเดียว → ที่อยู่ที่ส่งให้ Supabase
 *
 * ⚠️ **ตัดสินด้วย `@` ไม่ใช่ด้วยการเดา** — ไม่มีเบอร์ไทยไหนมี `@` และไม่มีอีเมลไหน
 *    เป็นตัวเลขล้วน ⇒ กฎนี้ตรงไปตรงมาและอธิบายให้ผู้ใช้ฟังได้
 * คืน `null` เมื่อกรอกเป็นตัวเลขที่ไม่ใช่เบอร์ไทย (ผู้เรียกขึ้นข้อความเอง)
 */
export function resolveLoginEmail(identifier) {
  const raw = String(identifier ?? '').trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw;
  return phoneLoginEmail(raw);
}

/* ป้ายที่ใช้เรียก "ช่องทางเข้าระบบ" ของคนคนนี้บนจอ
   🐞 ถ้าไม่มีตัวนี้ ทะเบียนผู้ใช้จะโชว์ `66812345678@phone.scentandsense.co.th` ดิบ ๆ
      ซึ่งอ่านแล้วเข้าใจผิดว่าเป็นอีเมลจริง แล้วจะมีคนพยายามส่งเมลไปที่นั่น */
export function loginLabel(user) {
  const email = user?.email || '';
  const phone = loginPhoneOf(email);
  return phone ? `เบอร์ ${phone}` : email;
}
