// ── อ่านผลของ getUser() แล้วตัดสินว่าจะพาไปไหน ────────────────────────────
//
// 🐞 ที่มา (ADR 0016 · PR3): เปลือกเคยเขียน `.then(({ data: { user } }) => { if (!user) … })`
//    เฉย ๆ — ไม่ดู `error` ไม่มี `.catch` ⇒ **เน็ตสะดุดหนึ่งครั้งระหว่างใช้งาน = เด้งออก
//    หน้าล็อกอิน** ทั้งที่ session ยังดีอยู่ (auth-js คืน `{ data: { user: null }, error }`
//    สำหรับ AuthError ทุกชนิด รวมคำขอที่ยิงไม่ถึง server)
//
// ⚠️ ฟังก์ชันล้วน — รับผลที่อ่านมาแล้ว ไม่เรียก network เอง จึงเทสต์ครบทุกสาขาได้
import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError } from '@supabase/supabase-js';

/**
 * @param {{ user?: unknown, error?: unknown, thrown?: unknown }} result
 * @returns {'ok' | 'login' | 'retry'}
 *  - `login` = ตัวตนหมดอายุ/ถูกเพิกถอนจริง ⇒ ไปหน้าเข้าสู่ระบบ
 *  - `retry` = อ่านไม่สำเร็จชั่วคราว ⇒ ให้กล่องลองใหม่ **ห้ามเด้งออก**
 */
export function authOutcome({ user = null, error = null, thrown = null } = {}) {
  // อะไรที่ถูกโยน (ไม่ใช่ AuthError) = ตัวอ่านพังก่อนได้คำตอบ — ไม่ใช่หลักฐานว่าใครหมดสิทธิ์
  if (thrown) return 'retry';
  if (error) {
    if (isAuthSessionMissingError(error)) return 'login';
    // ถูกเพิกถอน / เปลี่ยนรหัสจากที่อื่น / แอดมินรีเซ็ต / บัญชีถูกลบ → 4xx
    if (isAuthApiError(error)) return Number(error.status) >= 500 ? 'retry' : 'login';
    if (isAuthRetryableFetchError(error)) return 'retry';
    return 'retry';
  }
  return user ? 'ok' : 'login';
}
