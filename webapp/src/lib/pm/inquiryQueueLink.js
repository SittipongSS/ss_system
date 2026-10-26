// ── บล็อก "คำร้องจากฝ่ายขาย" บน /sa/tasks: ลิงก์ "ดูทั้งหมด" + ป้าย "n รอตอบ" (ตรวจตัวเลข M8d · 20/10/2026) ─────────
//
// 🐞 เดิมป้ายนับใบเปิด (pending/acknowledged) ของฝ่าย แล้วลิงก์ไป `/requests` เสมอ — แต่ RD (และทุกฝ่ายใน
//    `DEPT_MODULE_QUEUE`) **ไม่มีคิวที่ /requests** (`deptsInSharedQueue` ตัดออก · ม-29) ⇒ กดแล้วไม่เจอใบไหนจาก n ใบ
//    และนิยามก็ต่างกัน: คิวของฝ่ายนับเฉพาะ "ตาฝ่าย" (`requestNextStep(...).owner === 'dept'` · #1918)
// ⭐ ปลายทางคือแท็บ "รอตอบ" ของคิวที่ฝ่ายนั้นทำงานจริง แล้วนับด้วย **ตัวตัดสินของแท็บนั้น**
//    · ฝ่ายที่มีบ้านของตัวเอง → `/rd/requests?tab=todo` (หรือ /finance · /service) · `deptQueueRows(tab: 'todo')`
//      = ตัวเดียวกับป้ายเมนู "คิวคำร้อง" (`deptRequestsTodoCount`)
//    · ฝ่ายที่ยังอยู่คิวรวม (PC) → `/requests?tab=todo` (เปิดที่ขอบเขต "ของฉัน" · แท็บ "รอฉันตอบ") · `queueTabRows(tab: 'todo')`
// ⚠️ ผู้เรียก (`/api/pm/my-work`) ต้องส่งแถวชุดเดียวกับที่หน้าปลายทางโหลด — คิวฝ่ายโหลดทั้งฝ่าย (`loadRequests({ dept })`
//    ตัวเดียวกับ nav/counts) · คิวรวมโหลดขอบเขต "ของฉัน" (`loadVisibleRequests({ scopeParam: 'mine' })`)
import { deptQueueHref } from '@/lib/requests/modules';
import { deptQueueRows, queueTabRows } from '@/lib/requests/queueBoard';

export function inquiryQueueHref(dept) {
  const own = deptQueueHref(dept);
  return own ? `${own}?tab=todo` : '/requests?tab=todo';
}

/** จำนวนแถวของแท็บ "รอตอบ" ที่ลิงก์พาไป (ตอนเปิดใหม่ — ยังไม่มีคำค้น/ตัวกรองค้าง) */
export function inquiryQueueCount(rows = [], { dept, myDepts = [] } = {}) {
  if (deptQueueHref(dept)) return deptQueueRows(rows, { dept, tab: 'todo' }).length;
  return queueTabRows(rows, { tab: 'todo', myDepts }).length;
}
