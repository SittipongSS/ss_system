import { SYSTEM_ORDER } from './systems.js';

export { SYSTEM_ORDER };

export const SETTINGS_PATHS = ['/settings', '/users', '/audit'];

export function isSettingsPathname(pathname) {
  return SETTINGS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/* ⭐ หน้าที่ "ไม่ได้เป็นของระบบไหน" — ตั้งค่า/ผู้ใช้/บันทึกการใช้งาน และบัญชีของฉัน
   เปลือกของมันไม่มีแถบเมนูของระบบ (AppLayout ไม่วาดทั้งแถบข้างและแถบล่างมือถือ)
   เพราะเมนูที่ค้างอยู่เป็นของระบบที่เพิ่งเดินออกมา ไม่ใช่ของหน้านี้
   ⚠️ คนละเรื่องกับ `isSettingsPathname` — `/account` **ไม่ใช่** หน้าตั้งค่า
   (`viewer` เข้าเปลือกตั้งค่าไม่ได้ แต่ต้องเปิดหน้าบัญชีตัวเองได้) */
export function isBareShellPathname(pathname) {
  return isSettingsPathname(pathname) || pathname === '/account';
}

export function sortSystems(groups) {
  return [...groups].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system));
}

export function systemForPathname(pathname) {
  if (isSettingsPathname(pathname)) return 'settings';
  // ⭐ กล่องแจ้งเตือนไม่ใช่ของระบบไหน — มันรวมของทุกระบบไว้ในกองเดียว
  // คืน `null` = **คงเปลือกเมนูของระบบที่คนกำลังอยู่ไว้** (AppLayout ข้าม setActiveSystem
  // เมื่อค่าเป็น falsy) กดกระดิ่งจากงานขายแล้วกลับออกมา เมนูยังเป็นของงานขายเหมือนเดิม
  // ⚠️ ถ้าไม่ดักตรงนี้ จะตกไป `return 'tax'` ท้ายฟังก์ชัน = หน้าแจ้งเตือนสวมเมนูภาษี
  // สรรพสามิต ซึ่งเป็นบั๊กตัวเดียวกับที่ `/requests` เคยเจอ (ดูหมายเหตุด้านล่าง)
  // ⭐ หน้าบัญชีของฉันก็ไม่ใช่ของระบบไหนด้วยเหตุผลเดียวกัน — เข้าถึงจากเมนูอวตาร
  // ที่มีอยู่ทุกหน้า จึงต้องคงเปลือกของระบบที่คนกำลังยืนอยู่ไว้
  // 🐞 ก่อนแก้: `/account` ตกไป `return 'tax'` ⇒ กด "บัญชีของฉัน" จากระบบไหนก็ตาม
  // เมนูสลับเป็นภาษีสรรพสามิตทันที · ซ้ำร้าย AppLayout เขียน `ss:last-system=tax`
  // ทับค่าที่จำไว้ ⇒ กดกระดิ่งต่อ หน้าแจ้งเตือนก็ถอยมาสวมเมนูภาษีตามไปอีก
  // ⚠️ ไม่ใส่ใน `SETTINGS_PATHS` — เปลือกตั้งค่า `viewer` เข้าไม่ได้ แต่ทุกคนต้อง
  // เปิดหน้าบัญชีตัวเองได้ (เหตุผลเดียวกับ `/support` ด้านล่าง)
  // ⭐ `/go/<รหัสเอกสาร>` ก็ไม่ใช่ของระบบไหน — มันเป็นเส้นทางกลางที่แปลงรหัสเป็น id
  // แล้ว redirect ออกไปหน้าจริง (ปลายทางเป็นได้ทั้ง QT/SO/ดีล ซึ่งคนละระบบกัน)
  // 🐞 ตอน redirect สำเร็จแทบไม่เห็นอาการ **แต่หน้า "ไม่พบเอกสาร" ของมันเป็นหน้าจริง**
  // (รหัสผิดรูป · ไม่มีเลขนี้ · อ่านทะเบียนไม่สำเร็จ) ⇒ เดิมสวมเมนูภาษีสรรพสามิตเต็ม ๆ
  if (pathname === '/notifications' || pathname === '/account'
    || pathname === '/go' || pathname.startsWith('/go/')) return null;
  // ⚠️ ต้องอยู่เหนือ `return 'tax'` ท้ายฟังก์ชัน — บทเรียนจาก `/requests` ที่หลุด
  // กฎนี้ไปแล้วทั้งโมดูลไปโผล่ใต้เปลือกเมนูระบบภาษี โดยที่ build/เทสต์จับไม่ได้เลย
  // เพราะหน้าเรนเดอร์ปกติทุกอย่าง ผิดแค่เปลือกที่ครอบมัน
  //
  // ⭐ แจ้งปัญหาระบบ **ไม่อยู่ใน `SETTINGS_PATHS`** โดยเจตนา — เปลือกตั้งค่า
  // `viewer` เข้าไม่ได้ แต่ viewer คือคนที่ต้องแจ้งได้ (มติ Q2/Q14)
  if (pathname === '/support' || pathname.startsWith('/support/')) return 'support';
  if (pathname.startsWith('/database')) return 'master';
  // ⚠️ ต้องอยู่ก่อนกฎ salesplan: โมดูลผลิตเป็นระบบของตัวเอง ไม่ใช่ของฝ่ายขาย
  // (เส้นทางจึงไม่ได้อยู่ใต้ /pm ซึ่งเป็นของ project management ฝั่งขาย)
  if (pathname.startsWith('/production')) return 'production';
  if (pathname.startsWith('/service')) return 'service';
  // ⚠️ ต้องอยู่ก่อนกฎ salesplan ด้วยเหตุผลเดียวกับ /production — RD เป็นระบบของตัวเอง
  // (มติ ม-29) · เส้น `/rd` ไม่ทับ `/requests` แต่วางเรียงกันไว้ให้อ่านออกว่าทั้งสอง
  // เส้นเป็นคนละระบบทั้งที่อ่านตารางเดียวกัน
  if (pathname === '/rd' || pathname.startsWith('/rd/')) return 'rd';
  // ⚠️ ต้องอยู่ก่อนกฎ salesplan เหมือน /rd — โมดูลบัญชี (มติผู้ใช้ 2026-08-13) อ่าน
  // ตารางของฝ่ายขาย (งวดชำระของ SO) แต่เป็นคนละระบบ · ตกกฎนี้เมื่อไรทั้งโมดูลจะไป
  // โผล่ใต้เปลือกเมนูภาษีสรรพสามิตจาก `return 'tax'` ท้ายฟังก์ชัน ซึ่งเป็นบั๊กที่
  // build และเทสต์จับไม่ได้เลย (หน้าเรนเดอร์ปกติ ผิดแค่เปลือก) — เจอกับหน้านี้จริง
  // ตอนกดดูรอบแรก เหมือนที่ `/requests` เคยเป็น
  if (pathname === '/finance' || pathname.startsWith('/finance/')) return 'finance';
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
