"use client";
// ── "มาถึงหน้านี้ด้วยการกดย้อน/เดินหน้า หรือเปล่า" — คำตอบเดียวที่ทั้งระบบใช้ ──
//
// ⭐ มติผู้ใช้ 2026-08-25: **ค่าที่จำไว้ในหน้ารายการคืนเฉพาะตอนกดย้อน** — เข้าจาก
// เมนู (หรือลิงก์อื่นใด) ต้องได้หน้าเปล่าเหมือนเปิดใหม่ · ของเดิมจำยาวจนปิดแท็บ
// ⇒ คนที่กรองไว้เมื่อเช้าแล้วกดเมนูเข้ามาใหม่ตอนบ่าย เจอตารางที่ยัง "หายไปครึ่ง"
// โดยไม่รู้ว่าตัวกรองยังติดอยู่
//
// ⚠️ **เดาจาก popstate เท่านั้น ไม่มี API ที่บอกตรง ๆ** — Next App Router ไม่ได้
// ประกาศชนิดการนำทางออกมา · `performance.navigation` เป็นของการโหลดทั้งหน้า
// ไม่ใช่การเปลี่ยนหน้าฝั่ง client
//
// ⚠️ ธงถูก "กิน" ทีละ pathname ไม่ใช่ทีละคนเรียก — หน้าหนึ่งมี useStickyState
// หลายตัว (หน้าดีลมี 11) ทุกตัวต้องได้คำตอบเดียวกันในรอบเดียวกัน

let popPending = false;
/* ⚠️ **โหลดทั้งหน้าไม่ยิง popstate** — สองกรณีนี้จึงต้องอ่านจาก Navigation Timing
   แทน ไม่งั้นค่าที่จำไว้หายทั้งที่ผู้ใช้ไม่ได้สั่ง:
     back_forward = กดย้อนข้ามรอยต่อที่แอปถูกโหลดใหม่ (เช่นย้อนจากเว็บอื่นกลับมา)
     reload       = กด F5 / ปุ่มรีเฟรช — คนกดรีเฟรชคาดว่าจะได้ "หน้าเดิม" ไม่ใช่
                    หน้าที่ตัวกรองถูกล้าง (พฤติกรรมนี้เหมือนก่อนมติ 2026-08-25) */
let initialHandled = false;
const initialType = typeof performance !== "undefined"
  ? performance.getEntriesByType?.("navigation")?.[0]?.type
  : undefined;
const initialCountsAsHistory = initialType === "back_forward" || initialType === "reload";
/* pathname ที่ธง "มาจากการย้อน" ยังมีผลอยู่ — เคลียร์เองเมื่อเปลี่ยนไปหน้าอื่น
   โดยไม่ได้ย้อน ⚠️ ไม่มีบรรทัดนี้แล้วเจอของจริง: ย้อนมา /sa/deals (ธงติด) แล้ว
   กดเมนูไป /sa/leads ต่อ แล้วกดเมนูกลับมา /sa/deals — ธงยังค้างจากรอบก่อน
   ค่าที่กรองไว้จึงกลับมาทั้งที่คราวนี้เข้าจากเมนู */
let armedPath = null;
/* pathname ที่แอปอยู่ล่าสุด — popstate ที่ **ไม่เปลี่ยน pathname** ไม่ใช่ "การย้อนมาหน้านี้"
   🐞 UAT 25/09 จอหน้างานใช้ประวัติในหน้าเดียวกันตลอด ("‹ พื้นที่ทั้งหมด" · ปุ่มย้อนจากหน้าพื้นที่ · สองบานย้อนออก)
   ⇒ ธงติดทุกครั้งแต่ไม่มีใครกิน (ผู้อ่านทำงานเมื่อ pathname เปลี่ยนเท่านั้น) ⇒ ลิงก์ธรรมดาครั้งถัดไป (เมนูล่าง ·
   แถวย้อน) ถูกนับเป็นการกดย้อน: คืนตำแหน่งเลื่อนเก่า + ตัวกรองเก่ากลับมา (ขัดมติ 2026-08-25) */
let lastPath = typeof window !== "undefined" ? window.location?.pathname ?? null : null;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const path = window.location?.pathname ?? null;
    if (path !== lastPath) popPending = true;
    lastPath = path;
  });
}

/* ── ปุ่ม "← กลับ" บนหน้ารายละเอียด นับเป็นการกดย้อน (คำขอเจ้าของ 27/11/2026) ─────────
   🐞 ปุ่มกลับของ `Workspace` เป็น `<Link href>` ธรรมดา = pushState ไม่ใช่ popstate ⇒ ระบบนับเป็น
   "เข้าใหม่" แล้วล้างตัวกรอง/การเรียง/การค้นหาที่ผู้ใช้ตั้งไว้ทิ้ง · คนส่วนใหญ่กดปุ่มนี้ ไม่ได้กดย้อนของเบราว์เซอร์
   ⭐ คืนค่าเฉพาะเมื่อ **หน้ารายละเอียดนี้ถูกเปิดมาจากหน้ารายการนั้นจริง** ("ผู้เปิด" ของหน้า) — เข้าใบจากกระดิ่ง
   หรือจากลิงก์ในใบอื่นแล้วกดกลับ = เข้าหน้ารายการใหม่ ตามมติ 2026-08-25 (ไม่งั้นตัวกรองเมื่อเช้าโผล่กลับมา)
   ⚠️ ผู้เปิดเก็บใน sessionStorage ไม่ใช่ตัวแปร — กด F5 บนหน้ารายละเอียดแล้วกดกลับ ยังต้องได้ที่เดิม
   ⚠️ จดเฉพาะการเปลี่ยนหน้าด้วยลิงก์ — กดย้อนมาไม่เขียนทับ ⇒ รายการ → ใบ A → ใบ B → (ย้อน) ใบ A → กลับ ยังคืนค่า */
const OPENER_KEY = "listOpener:";
/* ปุ่มกลับถูกกดแล้วแต่ยังไม่ถึงหน้าปลายทาง — มีอายุ เผื่อการเปลี่ยนหน้าถูกยามฟอร์มค้างกันไว้
   (กดกลับ → ยกเลิก → ทีหลังกดเมนูเข้าหน้านั้น ต้องได้หน้าใหม่ ไม่ใช่ค่าที่จำไว้) */
const RETURN_TTL_MS = 15000;
let returnPending = null;

function rememberOpener(path, from) {
  try { window.sessionStorage.setItem(`${OPENER_KEY}${path}`, from); } catch {}
}

function openerOf(path) {
  try { return window.sessionStorage.getItem(`${OPENER_KEY}${path}`); } catch { return null; }
}

function pathOfHref(href) {
  try { return new URL(href, window.location.origin).pathname; } catch { return null; }
}

/** เรียกตอนกดปุ่ม "กลับ" ที่เป็นลิงก์ — ถ้าหน้านี้ถูกเปิดมาจาก `href` จะนับการไปถึง `href` เป็นการกดย้อน */
export function noteReturnTrip(href) {
  if (typeof window === "undefined" || !href) return false;
  const target = pathOfHref(href);
  const here = lastPath ?? window.location?.pathname ?? null;
  if (!target || !here || target === here) return false;
  if (openerOf(here) !== target) return false;
  returnPending = { path: target, at: Date.now() };
  return true;
}

/** true = มาถึง `pathname` นี้ด้วยการกดย้อน/เดินหน้า (หรือปุ่ม "กลับ" ที่พากลับไปหน้าที่เปิดมา) */
export default function arrivedByHistory(pathname) {
  const previous = lastPath;
  lastPath = pathname;
  const changed = previous !== null && previous !== pathname;
  /* หน้าแรกหลังโหลดทั้งหน้า — ตัดสินครั้งเดียวแล้วปล่อยให้กลไก popstate ทำงานต่อ */
  if (!initialHandled) {
    initialHandled = true;
    if (initialCountsAsHistory) armedPath = pathname;
  }
  const returning = returnPending !== null
    && returnPending.path === pathname
    && Date.now() - returnPending.at <= RETURN_TTL_MS;
  if (changed || returning) returnPending = null;
  if (popPending) {
    popPending = false;
    armedPath = pathname;
  } else if (returning) {
    armedPath = pathname;
    /* ลิงก์กลับไม่ใช่การเปิดหน้าใหม่ — ห้ามจด "ผู้เปิด" ของหน้ารายการเป็นหน้ารายละเอียด */
    return true;
  } else {
    if (armedPath !== null && armedPath !== pathname) armedPath = null;
    if (changed) rememberOpener(pathname, previous);
  }
  return armedPath === pathname;
}
