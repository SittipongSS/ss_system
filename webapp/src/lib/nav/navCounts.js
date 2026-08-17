// ── ตัวเลขบนเมนูหลัก — "จำนวนที่รอคุณทำ" ไม่ใช่ "จำนวนทั้งหมด" ───────────
//
// กติกาข้อเดียวที่ห้ามพลาด: **กดเข้าไปแล้วต้องเจอของเท่าที่เมนูบอก** เลขที่กด
// แล้วไม่มีอะไรให้ทำ คนจะเลิกเชื่อมันภายในสัปดาห์เดียว แล้วเมนูก็เหลือแค่ของประดับ
// ⇒ ตัวนับทุกตัวในไฟล์นี้ใช้ helper **ตัวเดียวกับที่หน้าปลายทางใช้กรองแถว**
// (waitingOnMeRows · deptQueueRows · matchesMineTaskView) ห้ามเขียนเงื่อนไขใหม่ที่นี่
//
// ฟังก์ชันในไฟล์นี้เป็น logic ล้วน — รับแถวที่โหลดมาแล้ว ไม่แตะ DB
// (ตัว query อยู่ที่ app/api/nav/counts/route.js · แยกเพื่อให้เทสต์เข้าถึงได้)
import { waitingOnMeRows, deptQueueRows } from '@/lib/requests/queueBoard';
import { MINE_TASK_VIEWS, matchesMineTaskView } from '@/lib/pm/taskViews';
import { isWaitingStatus } from '@/lib/pm/tasks';

/** เมนู "คำร้อง" — ใบที่รอฝ่ายฉันตอบ · รอฉันในฐานะผู้ขอลงมือต่อ · และใบของฉันที่ถูกตีกลับ
 *
 *  ชุดเดียวกับที่การ์ด "เริ่มที่นี่" ที่ /requests ชี้ — **ไม่ใช่แค่แท็บ "รอฉันตอบ"**
 *  เพราะใบตีกลับเป็น `draft` ซึ่งแท็บนั้นตัดทิ้ง (ม-102 ข้อ 4) แต่มันคืองานของเราแท้ ๆ */
export function requestsTodoCount(rows = [], myDepts = []) {
  return waitingOnMeRows(rows, { myDepts }).length;
}

/** เมนู "คิวคำร้อง" ของฝ่าย (RD) — ชุดเดียวกับแท็บ "รอฝ่ายตอบ" ที่ /rd/requests */
export function deptRequestsTodoCount(rows = [], dept) {
  if (!dept) return 0;
  return deptQueueRows(rows, { dept, tab: 'todo' }).length;
}

/** เมนู "งานของฉัน" — งานที่ยังไม่เสร็จและฉันเป็นผู้รับผิดชอบ
 *  ชุดเดียวกับตัวเลขบนแท็บ "ต้องทำ" ที่ /sa/tasks */
export function myTasksTodoCount(tasks = [], userId) {
  // ⚠️ ไม่นับงานที่ "รอคนอื่น" (mig 0266) — ป้ายบนเมนูคือ **งานที่รอฉันทำ** ส่วนงานที่
  // ติดอยู่ที่ฝ่ายอื่น/ลูกค้า กดเข้าไปก็ทำอะไรไม่ได้ (เหตุผลเดียวกับที่ป้ายลีดไม่นับ
  // 'new'/'screened' ด้านล่าง) · ยอดของมันดูได้ที่การ์ด "รอคนอื่น" ในหน้างาน
  return tasks.filter((task) => task.status !== 'Completed' && !isWaitingStatus(task.status)
    && matchesMineTaskView(task, userId, MINE_TASK_VIEWS.RESPONSIBLE)).length;
}

/* เมนู "ลีด" — ลีดที่มอบหมายแล้วแต่ยังไม่มีใครติดต่อกลับ (SLA 1 วันทำการ)
   ⚠️ ไม่รวม 'new'/'screened' โดยเจตนา — สองสถานะนั้นรอ **คนคัดกรอง/คนกระจาย**
   ไม่ใช่คนที่เปิดเมนูอยู่ · ขอบเขตว่าใครเห็นลีดใบไหนคุมด้วย applyLeadScope ที่ route */
export const LEAD_TODO_STATUS = 'assigned';

/** ตัดค่าที่ไม่มีอะไรให้ทำทิ้ง — เมนูที่ขึ้น 0 ทุกตัวคือแถวศูนย์ที่ไม่มีใครอ่าน
 *  (ต่างจากแท็บในหน้า ที่ต้องคง 0 ไว้กันแถวขยับ — เมนูไม่มีแถวให้ขยับ) */
export function pruneZeroCounts(counts = {}) {
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => Number(n) > 0));
}
