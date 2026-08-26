// ── ภาระงานของ AE ณ ตอนนี้ — ตัวเลขที่ต้องอ่านก่อน "มอบหมาย" ──────────────
//
// ⭐ **ทำไมต้องมี**: กล่องมอบหมายเดิมเป็นดรอปดาวน์รายชื่อล้วน คนกระจายลีดจึงเลือก
// จากความจำว่าใครน่าจะว่าง ผลคือใบไปกองกับคนที่ชื่อขึ้นก่อนหรือคนที่นึกออก ส่วนคนที่
// ถือค้าง 11 ใบและเลยวันติดตามอยู่ 2 ใบก็ยังได้ใบใหม่เพิ่ม — ข้อมูลมีอยู่ในตารางลีด
// ครบตลอด แต่ไม่เคยถูกเอามาวางตรงจังหวะที่ต้องตัดสินใจ
//
// ⚠️ **ตัวเลขนี้คือของค้าง ณ ตอนนี้ ไม่ใช่ผลงานรายเดือน** — ห้ามเอาไปคิดเป็น KPI
// (KPI ของลีดอยู่ที่ /api/sales-planning/leads/kpi ซึ่งผูกกับช่วงเวลาที่เลือก)
// ที่นี่ตอบคำถามเดียว: "ตอนนี้ใครยังตามงานไหว"

import { leadFollowUpState } from './leads';

/** สถานะที่ถือว่า "ใบยังอยู่ในมือ AE"
 *  ⚠️ ไม่รวม `qualified` — เปิดลูกค้าแล้วงานย้ายไปเป็นดีล ไม่ใช่ภาระของคิวลีดอีก
 *  ⚠️ ไม่รวม `disqualified` — ปิดแล้ว · ไม่รวม `new`/`screened` — ยังไม่มีเจ้าของ */
export const LEAD_WORKLOAD_STATUSES = ['assigned', 'contacted', 'meeting'];

/** ช่องตัวเลขที่แสดงต่อคน — ลำดับนี้คือลำดับบนหน้าจอ
 *  `alert` = ช่องที่ "มากกว่าศูนย์แล้วแปลว่าแย่" (ทาสีแดง) ต่างจากช่องนับเฉย ๆ */
export const WORKLOAD_FIELDS = [
  { key: 'holding', label: 'ถืออยู่' },
  { key: 'waitingContact', label: 'รอติดต่อ' },
  { key: 'lateFollowUp', label: 'เลยติดตาม', alert: true },
];

export const EMPTY_WORKLOAD = { holding: 0, waitingContact: 0, lateFollowUp: 0 };

/**
 * รวมแถวลีดเป็นภาระงานรายคน
 *
 * @param rows      [{ assigneeId, status, followUpAt }] — ควรกรองสถานะมาแล้ว
 * @param todayKey  วันไทยของวันนี้ (`businessDayKey`) — รับเข้ามาไม่อ่านนาฬิกาเอง
 *                  เพื่อให้เทสต์กำหนดวันได้ และเพื่อไม่ให้ผลเปลี่ยนกลางการเรนเดอร์
 * @returns { [assigneeId]: { holding, waitingContact, lateFollowUp } }
 */
export function leadWorkloadFrom(rows = [], todayKey) {
  const by = {};
  for (const row of rows || []) {
    const id = row?.assigneeId;
    if (!id) continue;
    // สถานะนอกลิสต์หลุดมาได้ถ้าผู้เรียกไม่ได้กรอง — ตัดที่นี่อีกชั้น ไม่ใช่เชื่อ query
    if (row.status && !LEAD_WORKLOAD_STATUSES.includes(row.status)) continue;
    const slot = by[id] || (by[id] = { ...EMPTY_WORKLOAD });
    slot.holding += 1;
    if (row.status === 'assigned') slot.waitingContact += 1;
    if (leadFollowUpState(row.followUpAt, todayKey) === 'late') slot.lateFollowUp += 1;
  }
  return by;
}

/** ภาระของคนคนเดียว — คนที่ไม่มีใบค้างเลยต้องได้ศูนย์ ไม่ใช่ `undefined`
 *  (ไม่งั้นหน้าจอต้องเช็ค null ทุกจุด แล้วคนที่ว่างที่สุดจะกลายเป็นช่องว่าง) */
export function workloadOf(workload, userId) {
  return { ...EMPTY_WORKLOAD, ...(workload?.[userId] || null) };
}

/** ติดภาระงานเข้าไปกับรายชื่อ เพื่อให้ช่องเลือกคนอ่านได้จาก user ตรง ๆ */
export function withWorkload(users = [], workload = null) {
  if (!workload) return users;
  return users.map((user) => ({ ...user, load: workloadOf(workload, user?.id) }));
}
