// ── ตัวกรองตารางคิวลีด + ตัวเลขท้ายตัวเลือก (ตรวจ 2026-10-08 "การกรอง การนับ ตาราง ไม่สอดคล้องกัน") ──
//
// 🐞 สามอาการที่ผู้ใช้เห็นบนหน้าเดียวกัน ก่อนแยกไฟล์นี้:
//   1. กดชื่อคนบนการ์ดค้างคิว ("รอติดต่อกลับ · Threerapong 1") แล้วตารางขึ้น **72 ใบ** — ปุ่มตั้งแค่
//      ตัวกรองผู้รับผิดชอบ ไม่ตั้งสถานะ ⇒ ได้ทุกใบของคนนั้นรวมใบที่ปิดไปแล้ว
//   2. กดขั้นบนการ์ด ("ติดตามต่อ 29") แล้วตารางขึ้น 3 ใบ — ตัวกรองที่กดค้างไว้ก่อนหน้า (คน/ทีม/คำค้น)
//      ไม่ถูกล้าง ⇒ เลขที่กดกับเลขที่ได้ไม่ตรงกันโดยไม่มีอะไรบอก
//   3. ตัวเลขท้ายตัวเลือกในแผงกรองนับจาก **ลีดทั้งบริษัท** ไม่สน "ของฉัน/ทีม" และไม่สนตัวกรองมิติอื่น
//      ⇒ ป้าย "ติดต่อแล้ว (32)" แต่ติ๊กแล้วตารางเหลือ 5
// ⇒ ไฟล์นี้เป็นที่เดียวที่ตอบว่า "ใบนี้ผ่านตัวกรองไหม" ให้ทั้งตารางและตัวเลขท้ายตัวเลือก
//    และการ์ดค้างคิวสั่งตัวกรองผ่าน `leadQueuePick` ตัวเดียว (แทนที่ทั้งชุด ไม่ใช่เติมทีละช่อง)

import { leadFollowUpState } from '@/lib/sales/leads';

/* ค่าแทน "ไม่มี" ในตัวกรอง — ลีดที่ยังไม่คัดกรองไม่มีทีม · ยังไม่มอบหมายไม่มีผู้รับผิดชอบ
   ⚠️ ต้องมีตัวเลือกของตัวเอง ไม่งั้นพอกรองทีม คิวกลางหายทั้งก้อนโดยไม่มีอะไรบอก */
export const NO_TEAM = '__no_team__';
export const NO_ASSIGNEE = '__no_assignee__';

/* ⭐ มิติ "วันติดตาม" — ตัวกรองที่การ์ดค้างคิวต้องใช้แต่ตารางไม่เคยมี
   ("เลยวันติดตาม 4" / "ถึงกำหนดวันนี้ 3" / "ยังไม่มีวันติดตาม 1" กดแล้วไม่มีที่ให้ไป)
   ⚠️ นิยามเดียวกับ `summarizeLeadQueue` เป๊ะ: **เฉพาะสถานะ `contacted`** — ใบนัดแล้ว/ปิดแล้วที่ยังค้าง
   `followUpAt` เก่าไม่นับ ไม่งั้นเลขในแผงกรองจะเกินเลขบนการ์ดค้างคิว
   สี่ค่าแบ่งใบ `contacted` ครบไม่ซ้อนกัน ⇒ รวมกันเท่าจำนวน "ติดต่อแล้ว" พอดี */
export const LEAD_FOLLOW_FILTERS = ['late', 'today', 'ahead', 'none'];
export const LEAD_FOLLOW_FILTER_LABELS = {
  late: 'เลยวันติดตาม',
  today: 'ถึงกำหนดวันนี้',
  ahead: 'ยังไม่ถึงกำหนด',
  none: 'ยังไม่มีวันติดตาม',
};

/** ใบนี้อยู่ช่องไหนของมิติวันติดตาม — `null` = ไม่ใช่ใบในขั้นติดตาม (ไม่อยู่ในมิตินี้) */
export function leadFollowKey(lead, todayKey) {
  if (lead?.status !== 'contacted') return null;
  return lead.followUpAt ? leadFollowUpState(lead.followUpAt, todayKey) : 'none';
}

export const EMPTY_LEAD_FILTERS = Object.freeze({
  status: [], team: [], assignee: [], channel: [], follow: [],
});

/* มิติละหนึ่งตัวตัดสิน — ค่าว่าง = ไม่กรองมิตินั้น */
const DIMENSIONS = {
  status: (lead) => lead?.status,
  team: (lead) => lead?.team || NO_TEAM,
  assignee: (lead) => lead?.assigneeId || NO_ASSIGNEE,
  channel: (lead) => lead?.channel,
  follow: (lead, todayKey) => leadFollowKey(lead, todayKey),
};
export const LEAD_FILTER_DIMENSIONS = Object.keys(DIMENSIONS);

function passes(lead, filters, todayKey, except = null) {
  for (const key of LEAD_FILTER_DIMENSIONS) {
    if (key === except) continue;
    const picked = filters?.[key] || [];
    if (picked.length && !picked.includes(DIMENSIONS[key](lead, todayKey))) return false;
  }
  return true;
}

/** ใบที่ผ่านทุกมิติ — `leads` คือชุดที่ผ่านขอบเขต (ของฉัน/ทีม/ทั้งหมด) และคำค้นมาแล้ว */
export function filterLeadRows(leads = [], filters = EMPTY_LEAD_FILTERS, todayKey) {
  return (leads || []).filter((lead) => passes(lead, filters, todayKey));
}

/**
 * ตัวเลขท้ายตัวเลือกแต่ละตัว = **ติ๊กตัวนั้นแล้วตารางจะเหลือกี่ใบ**
 *
 * ⭐ นับแบบแยกมิติ (faceted): ตัวเลขของมิติหนึ่งคิดจากใบที่ผ่าน *มิติอื่นทั้งหมด* (ไม่รวมตัวเอง)
 *    ⇒ ติ๊กสถานะ "ติดต่อแล้ว" อยู่ ตัวเลือกสถานะอื่นยังโชว์จำนวนของตัวเอง (ติ๊กเพิ่มได้)
 *    แต่ตัวเลือกผู้รับผิดชอบนับเฉพาะใบ "ติดต่อแล้ว" — ตรงกับที่ตารางจะโชว์จริงเมื่อติ๊ก
 * 🐞 ของเดิมนับจากลีดทุกใบที่โหลดมา ⇒ ใต้ "ของฉัน" ป้ายโชว์ยอดทั้งบริษัท
 *
 * @param leads ชุดหลังขอบเขต + คำค้น (ชุดเดียวกับที่ส่งให้ `filterLeadRows`)
 * @returns { status: {value: n}, team, assignee, channel, follow }
 */
export function leadFacetCounts(leads = [], filters = EMPTY_LEAD_FILTERS, todayKey) {
  const counts = Object.fromEntries(LEAD_FILTER_DIMENSIONS.map((key) => [key, {}]));
  for (const lead of leads || []) {
    for (const key of LEAD_FILTER_DIMENSIONS) {
      if (!passes(lead, filters, todayKey, key)) continue;
      const value = DIMENSIONS[key](lead, todayKey);
      if (value == null) continue;
      counts[key][value] = (counts[key][value] || 0) + 1;
    }
  }
  return counts;
}

/**
 * การ์ดค้างคิว → ตัวกรองชุดใหม่ **ทั้งชุด** (มิติที่ไม่ได้ระบุ = ว่าง)
 *
 * 🔴 แทนที่ ไม่ใช่เติม — ตัวกรองที่ค้างจากการกดครั้งก่อนคือเหตุที่เลขบนการ์ดกับเลขในตารางไม่ตรงกัน
 * ⚠️ คนต้องมาพร้อมขั้นเสมอ: "Threerapong 1" ในแถวรอติดต่อกลับ = ใบ *รอติดต่อกลับ* ของเขา
 *    ไม่ใช่ทุกใบที่เขาเคยถือ
 * @param pick { status, assigneeId?, follow? }
 */
export function leadQueuePick({ status, assigneeId, follow } = {}) {
  /* การ์ดจัดกลุ่มใบไร้ผู้รับผิดชอบด้วยคีย์ '__none__' (groupBy ของ leadDigest) — ตัวกรองใช้ NO_ASSIGNEE
     ส่งต่อตรง ๆ แล้วตารางจะว่างเปล่าทั้งที่การ์ดบอกว่ามีใบ */
  const assignee = assigneeId === '__none__' ? NO_ASSIGNEE : assigneeId;
  return {
    ...EMPTY_LEAD_FILTERS,
    status: status ? [status] : [],
    assignee: assignee ? [assignee] : [],
    follow: follow ? [follow] : [],
  };
}
