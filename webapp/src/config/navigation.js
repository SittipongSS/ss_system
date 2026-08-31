import { SYSTEM_ORDER } from './systems.js';
import { homeSystemForUser } from '@/lib/permissions';

export { SYSTEM_ORDER };

export const SETTINGS_PATHS = ['/settings', '/users', '/audit'];

export function isSettingsPathname(pathname) {
  return SETTINGS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/* ⭐ หน้าที่ "ไม่ได้เป็นของระบบไหน" — เหลือ **บัญชีของฉัน** หน้าเดียว
   เปลือกของมันไม่มีแถบเมนูของระบบ (AppLayout ไม่วาดทั้งแถบข้างและแถบล่างมือถือ)
   เพราะเมนูที่ค้างอยู่เป็นของระบบที่เพิ่งเดินออกมา ไม่ใช่ของหน้านี้

   📌 ล้มมติเดิม 2026-08-14 ที่นับ `/settings` `/users` `/audit` เป็นเปลือกไร้เมนูด้วย —
   มติผู้ใช้ 2026-08-22: ตั้งค่าใช้แถบข้าง/แถบล่างชุดเดียวกับทุกระบบ รายการมาจาก
   `config/settingsNav` (ดู `settingsMenuItems`) ⇒ สามรากนั้น **ไม่ใช่เปลือกไร้เมนู
   อีกต่อไป** แต่ยังเป็น "บริบทตั้งค่า" เดียวกัน (`isSettingsPathname`) เหมือนเดิม */
export function isBareShellPathname(pathname) {
  return pathname === '/account';
}

/* ── เอกสารร่วมที่ฝ่ายอื่น "รับไปทำงานในบ้านตัวเอง" ────────────────────────
   (มติผู้ใช้ 2026-08-22 — ดู `homeSystemForUser` ใน lib/permissions.js)

   ⭐ **ไม่ใช่การย้ายที่เก็บ** — เอกสารยังอยู่ `/sa` ตามกฎสามชั้นชั้น 2 · route เดิม
   API เดิม ด่านสิทธิ์เดิม โมดัลเดิม · ที่เปลี่ยนคือ **เปลือกเมนูที่ครอบมัน**
   เดินตามคนดู ไม่ใช่ตามเจ้าของที่เก็บ

   ⚠️ **ลิสต์นี้ต้องตรงกับเมนูที่ฝ่ายนั้นมีจริงใน `AppLayout.allGroups`** — เส้นทางที่
   ถูกรับมาแต่ไม่มีเมนูคู่กัน = ยืนอยู่บนหน้าที่แถบเมนูไม่ไฮไลต์อะไรเลย (กฎข้อ 8 ของ
   `docs/module-ownership-rule.md`) · `navigation.test.mjs` ล็อกคู่นี้ไว้แล้ว

   ⚠️ **ดีล/โครงการไม่อยู่ในลิสต์โดยตั้งใจ** — กฎข้อ 7 ตัดสินแล้วว่าไม่ใช่เมนูของ FN
   ส่วน RD เปิดดูเพื่อ *บริบทตอนตอบคำร้อง* ไม่ใช่งานประจำของฝ่าย ⇒ สองอย่างนั้นยัง
   เป็นของเปลือก "บริหารงานขาย" ตามเดิม กดจากลิงก์บนใบได้เหมือนเดิมทุกอย่าง */
export const ADOPTED_SHARED_PATHS = {
  /* RD รับ "ใบคำร้อง" + "ใบสั่งขาย" (มติผู้ใช้ 2026-08-29 — เพิ่มใบสั่งขายรอบนี้)
     ⚠️ **ต้องรับพร้อมกับที่ปิดเมนูงานขายของฝ่าย** — ไม่งั้นกดใบสั่งขายจากคิวของตัวเอง
     แล้วเปลือกสลับไป "บริหารงานขาย" ซึ่งเป็นระบบที่เขาไม่มีกลุ่มเมนูอีกแล้ว = แถบว่าง
     (อาการเดียวกับที่คอมเมนต์ของ `homeSystemForUser` เตือนไว้ · เจอจริงตอน UAT) */
  rd: ['/requests', '/sa/sales-orders', '/sales-planning/sales-orders'],
  // FN รับเอกสารสี่ชนิดที่มติ 2026-08-13 (กฎข้อ 7) ตัดสินไว้แล้วว่าเป็นเมนูของเขา
  // (เส้นทางเก่า `/sales-planning/*` ยังมีลิงก์ค้างอยู่ในระบบ จึงต้องรับคู่กันเสมอ)
  finance: [
    '/sa/quotations', '/sales-planning/quotations',
    '/sa/sales-orders', '/sales-planning/sales-orders',
    '/sa/contracts', '/sales-planning/contracts',
    '/requests',
  ],
  /* ⭐ ฝ่ายบริการ TS (มติผู้ใช้ 2026-08-31) — รับ **ใบสั่งขาย · สัญญา · คำร้อง**
     เข้าเปลือกของตัวเอง
     ⚠️ **ต้องรับพร้อมกับที่ TS ได้บ้านของตัวเอง** (`homeSystemForUser`) — ไม่งั้นกด
        ใบสั่งขายจากคิว "งานเข้าใหม่" แล้วเปลือกสลับไป "บริหารงานขาย" ซึ่งเป็นระบบที่
        เขาไม่มีกลุ่มเมนูอีกแล้ว = แถบว่าง (อาการเดียวกับที่ RD เจอตอน UAT)
     ⚠️ **ไม่รับใบเสนอราคา** ต่างจาก FN — งานบริการอ้างใบสั่งขายกับสัญญา ไม่ได้อ้าง
        ใบเสนอราคา · เมนูที่กดเข้าไปแล้วไม่ได้ใช้คือเมนูที่ทำให้แถบยาวขึ้นเปล่า ๆ
     ⚠️ `/requests` รับไว้เพราะหน้ารายละเอียดคำร้องอยู่ที่นั่น (เมนูของ TS ชื่อ
        "คิวคำร้อง" ชี้ `/service/requests` แต่กดเข้าใบแล้วเด้งไป `/requests/<id>`) */
  service: [
    '/sa/sales-orders', '/sales-planning/sales-orders',
    '/sa/contracts', '/sales-planning/contracts',
    '/requests',
  ],

};

export function adoptsPathname(system, pathname) {
  const prefixes = ADOPTED_SHARED_PATHS[system];
  if (!prefixes || !pathname) return false;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/* เมนูเอกสารร่วมหนึ่งรายการ ควรขึ้นในกลุ่มไหนของ "คนคนนี้" — ตอบได้กลุ่มเดียวเสมอ
   · บ้านของเขารับเส้นทางนั้นไปแล้ว ⇒ ขึ้นที่บ้านเขา ตัดออกจากกลุ่ม "บริหารงานขาย"
   · ไม่ได้รับ (ฝ่ายขาย · admin) ⇒ ขึ้นที่กลุ่ม "บริหารงานขาย" ตามเดิม

   ⚠️ **ต้องตัดสองทาง** — ตัดแค่ฝั่งกลุ่มขายไม่พอ: `admin` เห็นทุกกลุ่ม ⇒ เมนู
   ใบสั่งขายจะโผล่ทั้งใต้ "บริหารงานขาย" และใต้ "บัญชีและการเงิน" พร้อมกัน
   แล้วกดคนละตัวได้เปลือกคนละอัน ซึ่งอ่านแล้วขัดกันเอง */
export function sharedItemBelongsInGroup(href, groupSystem, user) {
  const home = homeSystemForUser(user);
  const adopted = !!home && adoptsPathname(home, href);
  return groupSystem === 'salesplan' ? !adopted : (adopted && home === groupSystem);
}

export function sortSystems(groups) {
  return [...groups].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system));
}

export function systemForPathname(pathname, user) {
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
  /* ⭐ ต้องอยู่ **เหนือกฎ salesplan** — เอกสารร่วมที่บ้านของคนดูรับไปแล้ว ให้คืนบ้าน
     ของเขา ไม่ใช่บ้านของเจ้าของที่เก็บ · ไม่ส่ง `user` มา = พฤติกรรมเดิมทุกประการ
     (เรียกใช้จริงมีที่เดียวคือ `AppLayout` — เทสต์เดิมทั้งชุดจึงยังถูกต้องอยู่) */
  const home = homeSystemForUser(user);
  if (home && adoptsPathname(home, pathname)) return home;
  if (pathname === '/sa' || pathname.startsWith('/sa/') || pathname.startsWith('/sales-planning')
    || pathname.startsWith('/pm') || pathname.startsWith('/requests')) return 'salesplan';
  if (pathname.startsWith('/sahamit')) return 'sahamit';
  if (pathname.startsWith('/mgmt')) return 'mgmt';
  return 'tax';
}
