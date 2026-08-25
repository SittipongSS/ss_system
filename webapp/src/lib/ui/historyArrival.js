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

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { popPending = true; });
}

/** true = มาถึง `pathname` นี้ด้วยการกดย้อน/เดินหน้า */
export default function arrivedByHistory(pathname) {
  /* หน้าแรกหลังโหลดทั้งหน้า — ตัดสินครั้งเดียวแล้วปล่อยให้กลไก popstate ทำงานต่อ */
  if (!initialHandled) {
    initialHandled = true;
    if (initialCountsAsHistory) armedPath = pathname;
  }
  if (popPending) {
    popPending = false;
    armedPath = pathname;
  } else if (armedPath !== null && armedPath !== pathname) {
    armedPath = null;
  }
  return armedPath === pathname;
}
