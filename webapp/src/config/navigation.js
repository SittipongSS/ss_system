import { SYSTEM_ORDER } from './systems.js';

export { SYSTEM_ORDER };

export const SETTINGS_PATHS = ['/settings', '/users', '/audit'];

export function isSettingsPathname(pathname) {
  return SETTINGS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function sortSystems(groups) {
  return [...groups].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system));
}

export function systemForPathname(pathname) {
  if (isSettingsPathname(pathname)) return 'settings';
  if (pathname.startsWith('/database')) return 'master';
  // ⚠️ ต้องอยู่ก่อนกฎ salesplan: โมดูลผลิตเป็นระบบของตัวเอง ไม่ใช่ของฝ่ายขาย
  // (เส้นทางจึงไม่ได้อยู่ใต้ /pm ซึ่งเป็นของ project management ฝั่งขาย)
  if (pathname.startsWith('/production')) return 'production';
  if (pathname.startsWith('/service')) return 'service';
  // 🐞 `/requests` หลุดจากกฎนี้ตั้งแต่ P0b (ย้ายคำร้องออกจาก `/sa`) ⇒ ตกไปที่
  // `return 'tax'` ท้ายฟังก์ชัน ⇒ **ทั้งโมดูลคำร้องขึ้นเมนูของระบบภาษีสรรพสามิต**
  // และเมนู "คำร้อง" (ซึ่งอยู่ในกลุ่ม salesplan) กดเข้าไม่ได้จากเปลือกนั้นเลย
  // ⚠️ build/เทสต์จับไม่ได้เพราะหน้าเรนเดอร์ปกติทุกอย่าง — ผิดแค่เปลือกที่ครอบมัน
  // (บทเรียนเดียวกับที่แผน P0 เตือนเรื่องลิงก์ค้าง: href ตายไม่มีอะไรจับ)
  if (pathname === '/sa' || pathname.startsWith('/sa/') || pathname.startsWith('/sales-planning')
    || pathname.startsWith('/pm') || pathname.startsWith('/requests')) return 'salesplan';
  if (pathname.startsWith('/sahamit')) return 'sahamit';
  if (pathname.startsWith('/mgmt')) return 'mgmt';
  return 'tax';
}
